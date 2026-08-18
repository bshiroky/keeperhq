// NFL player directory — pure helpers (no network, no Supabase, no JSX) so
// they're unit-testable in plain node: scripts/test-nfl-directory.mjs.
// The I/O half (Sleeper fetch, Supabase read/refresh) lives in
// nflDirectoryStore.js.
//
// Identity model: an imported roster/draft row stores a RESOLVED Sleeper
// player_id plus the original pasted string, instead of a free-text name.
// That turns any later reconciliation against another platform (Yahoo) into a
// join rather than fuzzy name matching across hundreds of rows.
//
// NFL only, deliberately. The other sports keep their existing behavior — no
// directory, no resolution — and no generic multi-sport abstraction is
// attempted here, because their data sources differ enough that a shared
// shape now would be guesswork.

import { normalizeName } from './players.js';

// The match key. Sleeper publishes its own `search_full_name` ("tombrady"),
// but we key BOTH sides on normalizeName so the app's one normalization rule
// governs every comparison — the same reason the NHL matcher does. The two
// agree in practice ("A.J. Brown" and "AJ Brown" both land on "ajbrown");
// where they don't, ours is the one the pasted name went through too.
export const directoryKey = normalizeName;

// Sleeper uses standard NFL abbreviations; Yahoo pastes mostly agree once
// upper-cased. These are the ones that don't (including relocations that
// still show up in old exports).
const TEAM_ALIASES = {
  WSH: 'WAS', WFT: 'WAS',
  JAC: 'JAX',
  LA: 'LAR', STL: 'LAR',
  SD: 'LAC',
  OAK: 'LV', LVR: 'LV',
  ARZ: 'ARI',
  TAM: 'TB', KAN: 'KC', SFO: 'SF', NWE: 'NE', NOR: 'NO', GNB: 'GB',
  CLV: 'CLE', BLT: 'BAL', HST: 'HOU',
};

export function normalizeProTeam(abbr) {
  const up = (abbr || '').trim().toUpperCase();
  if (!up) return '';
  return TEAM_ALIASES[up] || up;
}

function splitPositions(raw) {
  if (Array.isArray(raw)) return raw.map(p => String(p).trim().toUpperCase()).filter(Boolean);
  return String(raw || '')
    .split(/[,/]/)
    .map(p => p.trim().toUpperCase())
    .filter(Boolean);
}

// One Sleeper player object → the row shape upsert_nfl_players() expects.
// Returns null for entries we can't key (no player_id, no usable name).
// The full unfiltered object rides along in `data` so a field we didn't
// promote to a column is never lost to a refresh.
export function sleeperToRow(playerId, p) {
  const id = String(playerId ?? p?.player_id ?? '').trim();
  if (!id || !p) return null;
  const fullName = (p.full_name
    || [p.first_name, p.last_name].filter(Boolean).join(' ')
    || '').trim();
  const key = directoryKey(fullName || p.search_full_name || '');
  if (!key) return null;
  const num = Number.isFinite(p.number) ? p.number : null;
  const exp = Number.isFinite(p.years_exp) ? p.years_exp : null;
  const str = v => (v == null || v === '' ? null : String(v));
  return {
    player_id: id,
    search_key: key,
    search_full_name: str(p.search_full_name),
    full_name: fullName || null,
    first_name: str(p.first_name),
    last_name: str(p.last_name),
    team: str(p.team),
    pos: str(p.position),
    fantasy_positions: Array.isArray(p.fantasy_positions) ? p.fantasy_positions : null,
    status: str(p.status),
    jersey_number: num,
    years_exp: exp,
    yahoo_id: str(p.yahoo_id),
    espn_id: str(p.espn_id),
    sportradar_id: str(p.sportradar_id),
    rotowire_id: str(p.rotowire_id),
    stats_id: str(p.stats_id),
    fantasy_data_id: str(p.fantasy_data_id),
    data: p,
  };
}

// Sleeper's whole payload (player_id → player) → rows, skipping unusable ones.
export function sleeperPayloadToRows(payload) {
  const rows = [];
  for (const [id, p] of Object.entries(payload || {})) {
    const row = sleeperToRow(id, p);
    if (row) rows.push(row);
  }
  return rows;
}

// Cross-platform id coverage. Reported on every refresh and shown in the UI:
// how many players carry a yahoo_id / espn_id decides how much of the later
// Yahoo integration is a straight join vs. more name matching. Measured
// against ACTIVE players, since those are the ones a live import touches
// (totals across the unfiltered payload are reported too, because the payload
// is mostly inactive history).
export function summarizeCrossIds(rows) {
  const list = rows || [];
  const active = list.filter(r => (r.status || '').toLowerCase() === 'active');
  const withYahoo = r => !!r.yahoo_id;
  const withEspn = r => !!r.espn_id;
  return {
    total: list.length,
    active: active.length,
    yahooTotal: list.filter(withYahoo).length,
    espnTotal: list.filter(withEspn).length,
    yahooActive: active.filter(withYahoo).length,
    espnActive: active.filter(withEspn).length,
  };
}

export function pct(n, of) {
  if (!of) return 0;
  return Math.round((n / of) * 1000) / 10;
}

// ── Match selection ─────────────────────────────────────────────────────────
// The normalized-name lookup can return more than one player (common last
// names, juniors, a defense sharing a city name). Narrow with whatever else
// the pasted line carried — Yahoo exports put the pro team and position right
// next to the name — and only give up when the hints genuinely can't separate
// the candidates. Never guesses: an unnarrowed tie comes back 'ambiguous' so
// the import surfaces it for a human pick rather than storing a coin flip.
//
// hint: { proTeam?: string, positions?: string | string[] }
export function pickDirectoryMatch(candidates, hint = {}) {
  const list = (candidates || []).filter(Boolean);
  if (list.length === 0) return { status: 'unmatched', row: null, candidates: [] };
  if (list.length === 1) return { status: 'matched', row: list[0], candidates: list };

  let pool = list;

  const team = normalizeProTeam(hint.proTeam);
  if (team) {
    const byTeam = pool.filter(r => normalizeProTeam(r.team) === team);
    if (byTeam.length > 0) pool = byTeam;
  }

  const wanted = splitPositions(hint.positions);
  if (wanted.length > 0 && pool.length > 1) {
    const byPos = pool.filter(r => {
      const has = [r.pos, ...(r.fantasy_positions || [])]
        .filter(Boolean).map(x => String(x).toUpperCase());
      return has.some(p => wanted.includes(p));
    });
    if (byPos.length > 0) pool = byPos;
  }

  if (pool.length > 1) {
    const activeOnly = pool.filter(r => (r.status || '').toLowerCase() === 'active');
    if (activeOnly.length > 0) pool = activeOnly;
  }

  if (pool.length === 1) return { status: 'matched', row: pool[0], candidates: list };
  return { status: 'ambiguous', row: null, candidates: pool };
}

// Directory row → the fields an import writes onto a roster / keeper entry.
// `sourceName` (what was actually pasted) is stored alongside the id on every
// row, matched or not: if a match is ever wrong, the original string is the
// only way to see what it was resolved FROM.
export function importFieldsFor(row, sourceName) {
  const out = { sourceName: (sourceName || '').trim() };
  if (row) {
    out.playerId = row.player_id;
    if (row.pos) out.pos = row.pos;
  }
  return out;
}

// ── Chunked, self-healing writes ────────────────────────────────────────────
// The first real refresh died at row 750 of 12,221 with "TypeError: Failed to
// fetch". That signature is specific: supabase-js RETURNS {data, error} for
// any HTTP response (including 4xx/5xx), so a THROWN TypeError means no
// response arrived at all — the request never completed. It wasn't Postgres,
// wasn't auth, and wasn't parallelism (the writes were already sequential).
// Chunks 1-3 of the same shape succeeded, so the only thing that varied was
// the payload: Sleeper player objects differ wildly in size, so a fixed
// 250-ROW chunk is a wildly varying BYTE size.
//
// Two causes fit — a request body rejected at the edge, or a transient drop —
// and they call for different fixes, so this writer does the discriminating
// experiment instead of guessing:
//   * chunks are budgeted by BYTES, not row count, so request size is bounded
//     and predictable regardless of who's in the chunk;
//   * a failed chunk is retried with exponential backoff (transient drops
//     recover here);
//   * a chunk that still fails is SPLIT IN HALF and retried, down to a single
//     row (a size limit recovers here, and only here).
// What recovered it is counted and reported, so the run itself says which
// cause it was rather than leaving it a guess.
const DEFAULT_BUDGET_BYTES = 192 * 1024;

export function chunkRowsByBytes(rows, budgetBytes = DEFAULT_BUDGET_BYTES) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const row of rows || []) {
    const bytes = JSON.stringify(row).length;
    // An oversized single row still gets its own chunk — never dropped, and
    // never silently merged into something bigger.
    if (current.length > 0 && size + bytes > budgetBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const defaultSleep = ms => new Promise(r => setTimeout(r, ms));

// Writes every row through `call(chunk)` — injected, so this stays pure and
// testable and the browser and the scheduled job share one implementation.
// `call` resolves with the number of rows written (or anything falsy, in
// which case the chunk length is assumed) and REJECTS to signal failure.
export async function writeDirectoryRows({
  rows,
  call,
  onProgress = () => {},
  budgetBytes = DEFAULT_BUDGET_BYTES,
  maxAttempts = 4,
  baseDelayMs = 500,
  sleep = defaultSleep,
}) {
  const total = (rows || []).length;
  const queue = chunkRowsByBytes(rows, budgetBytes);
  const plannedChunks = queue.length;
  const stats = {
    total, written: 0, plannedChunks, sentChunks: 0,
    retries: 0, splits: 0, recoveredByRetry: 0,
    lastError: null,
  };

  onProgress({ phase: 'writing', done: 0, total, chunks: plannedChunks, ...stats });

  while (queue.length > 0) {
    const chunk = queue.shift();
    let attempt = 0;
    let done = false;

    while (!done) {
      try {
        const written = await call(chunk);
        stats.written += Number(written) || chunk.length;
        stats.sentChunks++;
        if (attempt > 0) stats.recoveredByRetry++;
        done = true;
      } catch (e) {
        stats.lastError = e;
        // Some failures can't be fixed by waiting or by sending less (an
        // expired token, a denied permission). Retrying those 4× per chunk
        // across a 12k-row run would be thousands of pointless requests, so
        // the caller can mark them fatal and we stop immediately.
        if (e?.fatal) {
          const fatal = new Error(e.message || String(e));
          fatal.stats = { ...stats };
          fatal.cause = e;
          throw fatal;
        }
        attempt++;
        if (attempt < maxAttempts) {
          stats.retries++;
          // Exponential backoff with jitter, so a rate-shaped failure isn't
          // retried in lockstep.
          await sleep(baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
          continue;
        }
        if (chunk.length > 1) {
          // Retrying the same bytes has failed maxAttempts times — try
          // smaller bytes. If THIS is what fixes it, the cause was size.
          const mid = Math.ceil(chunk.length / 2);
          queue.unshift(chunk.slice(0, mid), chunk.slice(mid));
          stats.splits++;
          done = true;
          break;
        }
        // One row, maxAttempts times, still failing: genuinely unwritable.
        const bytes = JSON.stringify(chunk).length;
        const err = new Error(
          `chunk of ${chunk.length} row(s) / ${Math.round(bytes / 1024)}KB failed ${maxAttempts} times: ${e?.message || e}`
        );
        err.stats = { ...stats };
        err.cause = e;
        throw err;
      }
    }

    onProgress({ phase: 'writing', done: stats.written, total, chunks: plannedChunks + stats.splits, ...stats });
  }

  return stats;
}

// What the run learned about WHY a chunk failed, in one line. Splits mean the
// requests were too big; retries alone mean the network dropped them.
export function diagnoseWrite(stats) {
  if (!stats) return null;
  if (stats.splits > 0) {
    return `${stats.splits} chunk(s) only succeeded after being split — the requests were too large, not rate-limited.`;
  }
  if (stats.recoveredByRetry > 0) {
    return `${stats.recoveredByRetry} chunk(s) succeeded on retry — transient network failures, not a size limit.`;
  }
  return null;
}

// Which sports have a stored directory. NFL is the only one on this path;
// hockey keeps its build-time JSON directory (loadPlayers), and the rest have
// none. Kept as one function so callers don't re-roll the sport test.
export function isNflSport(sport) {
  return sport === 'football' || sport === 'nfl';
}
