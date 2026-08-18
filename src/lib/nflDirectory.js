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

// Which sports have a stored directory. NFL is the only one on this path;
// hockey keeps its build-time JSON directory (loadPlayers), and the rest have
// none. Kept as one function so callers don't re-roll the sport test.
export function isNflSport(sport) {
  return sport === 'football' || sport === 'nfl';
}
