// NFL player directory — I/O half: the Sleeper fetch, the refresh paths, and
// the read paths the import flow uses. Pure helpers live in nflDirectory.js
// (unit-tested there); everything here touches the network.
//
// Refresh runs two ways, both writing through the same idempotent upsert:
//   * SCHEDULED — a Vercel cron hits /api/refresh-nfl-directory once a day.
//     That's the normal path; nobody has to remember it.
//   * MANUAL — the Import page's directory card. It calls the SAME endpoint
//     (server-side execution is more reliable than the browser), and only
//     falls back to writing from the browser when the endpoint isn't
//     available — which is the case until SUPABASE_SERVICE_ROLE_KEY is set in
//     Vercel, and on any local build.
//
// Refresh is UPSERT-ONLY and never deletes: see the preserve-don't-delete
// notes in supabase/migrations/004_nfl_player_directory.sql (no delete policy
// on the table, every column COALESCEd), so a player_id stored on a keeper or
// roster row always resolves even after the player drops out of Sleeper's
// payload. That holds identically for the scheduled path — it writes through
// the same function.
//
// Every run is recorded in nfl_directory_refreshes: a row is inserted when it
// STARTS (status 'running') and patched when it finishes. A run that dies
// mid-flight therefore leaves evidence instead of silence — which is what
// makes a failing cron visible.

import { supabase } from './supabase.js';
import {
  directoryKey, sleeperPayloadToRows, summarizeCrossIds,
  writeDirectoryRows, diagnoseWrite, withoutUnknownColumn,
} from './nflDirectory.js';

export const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
export const REFRESH_ENDPOINT = '/api/refresh-nfl-directory';

// Byte budget per upsert request. Chunking by BYTES rather than row count is
// the actual fix for the failed run — see the notes on writeDirectoryRows.
const BROWSER_BUDGET_BYTES = 128 * 1024;
// PostgREST sends filters in the query string, so the `in` list has to stay
// well inside URL length limits.
const LOOKUP_CHUNK = 150;

export function directoryConfigured() {
  return !!supabase;
}

// ~5MB of JSON. Sleeper is public: no auth, no key, and one call per refresh
// is well inside their "fetch at most once a day" guidance.
export async function fetchSleeperPlayers() {
  const res = await fetch(SLEEPER_PLAYERS_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper returned ${res.status} ${res.statusText}`);
  const payload = await res.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Sleeper returned an unexpected shape (expected a player_id → player map).');
  }
  return payload;
}

// ── Run log ─────────────────────────────────────────────────────────────────

// Log writes retry without any column the schema doesn't have, rather than
// losing the record: a run that isn't recorded is a run the card has to guess
// about, which is what produced a "last refresh failed" banner sitting on top
// of 12,221 successfully written players.
async function insertRunRow(row, wantId) {
  let attempt = { ...row };
  for (let i = 0; i < 5; i++) {
    const query = supabase.from('nfl_directory_refreshes').insert(attempt);
    const { data, error } = wantId ? await query.select('id').maybeSingle() : await query;
    if (!error) return data?.id ?? null;
    const reduced = withoutUnknownColumn(attempt, error);
    if (!reduced) {
      console.warn('[KeeperHQ] Could not write a directory-refresh log row:', error);
      return null;
    }
    attempt = reduced;
  }
  return null;
}

async function startRun(trigger) {
  return insertRunRow({ source: 'sleeper', trigger, status: 'running' }, true);
}

// Closes the run. If the row was never opened (an older schema, a failed
// insert), this INSERTS the completed record instead of silently doing
// nothing — a finished run always leaves a row, which is the whole point of
// the log.
async function finishRun(id, patch) {
  const finished = { ...patch, finished_at: new Date().toISOString() };
  if (!id) return insertRunRow(finished, false);

  let attempt = finished;
  for (let i = 0; i < 5; i++) {
    const { error } = await supabase
      .from('nfl_directory_refreshes')
      .update(attempt)
      .eq('id', id);
    if (!error) return id;
    const reduced = withoutUnknownColumn(attempt, error);
    if (!reduced) {
      console.warn('[KeeperHQ] Could not close the directory-refresh log row:', error);
      return null;
    }
    attempt = reduced;
  }
  return null;
}

// Auth / permission failures: no amount of waiting or shrinking fixes them,
// so they abort the run instead of burning attempts on every chunk.
function isPermanent(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '42501' || code.startsWith('PGRST3')
    || msg.includes('jwt') || msg.includes('permission denied') || msg.includes('not authorized');
}

// ── Refresh (browser fallback path) ─────────────────────────────────────────

export async function refreshInBrowser({ onProgress } = {}) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const report = onProgress || (() => {});

  report({ phase: 'fetching', done: 0, total: 0 });
  let rows;
  try {
    rows = sleeperPayloadToRows(await fetchSleeperPlayers());
  } catch (e) {
    throw new Error(
      `Couldn't reach the Sleeper player API (${e?.message || e}). ` +
      'Nothing was written, so the stored directory is unchanged.'
    );
  }
  if (rows.length === 0) throw new Error('Sleeper returned zero usable players — nothing was written.');

  const ids = summarizeCrossIds(rows);
  const runId = await startRun('manual');

  try {
    const stats = await writeDirectoryRows({
      rows,
      budgetBytes: BROWSER_BUDGET_BYTES,
      onProgress: s => report({ ...s, phase: 'writing' }),
      call: async chunk => {
        const { data, error } = await supabase.rpc('upsert_nfl_players', { p_players: chunk });
        // A THROWN error means no response arrived — retry and splitting are
        // exactly for that. A RETURNED error is a real server answer: a
        // statement timeout is still worth splitting for, but an auth or
        // permission failure never is, so it aborts the run immediately.
        if (error) throw Object.assign(new Error(error.message || 'upsert failed'), { fatal: isPermanent(error) });
        return Number(data) || chunk.length;
      },
    });

    await finishRun(runId, {
      status: 'ok', payload_count: rows.length, upserted_count: stats.written,
      active_count: ids.active, yahoo_id_count: ids.yahooActive, espn_id_count: ids.espnActive,
      notes: diagnoseWrite(stats),
    });
    report({ phase: 'done', done: stats.written, total: rows.length });
    return { payloadCount: rows.length, upserted: stats.written, ids, stats, ranOn: 'browser' };
  } catch (e) {
    const written = e?.stats?.written ?? 0;
    await finishRun(runId, {
      status: 'error', payload_count: rows.length, upserted_count: written,
      active_count: ids.active, yahoo_id_count: ids.yahooActive, espn_id_count: ids.espnActive,
      error: String(e?.message || e).slice(0, 500),
    });
    throw new Error(
      `Directory write stopped after ${written.toLocaleString()} of ${rows.length.toLocaleString()} players (${e?.message || e}). ` +
      'The players already written are saved. Re-running is safe — the write is an upsert, so a re-run overwrites the same rows rather than duplicating them, and picks up where this left off.'
    );
  }
}

// ── Refresh (server path — the normal one) ──────────────────────────────────
// Same work, run by the Vercel function that the daily cron also calls. The
// browser only asks for it and waits, so a flaky client connection can no
// longer strand a half-written directory.

export async function refreshOnServer() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Sign in to refresh the directory.');

  const res = await fetch(REFRESH_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ trigger: 'manual' }),
  });

  // No function deployed (or the deploy predates it): the SPA rewrite serves
  // index.html for unknown paths, so a 404 or an HTML body both mean "this
  // build has no endpoint" rather than "the refresh failed".
  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 || !contentType.includes('application/json')) {
    const err = new Error('The scheduled-refresh endpoint is not available in this deployment.');
    err.endpointMissing = true;
    throw err;
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 501) {
    // Deployed but not configured — SUPABASE_SERVICE_ROLE_KEY isn't set.
    const err = new Error(body.error || 'The refresh endpoint is not configured.');
    err.endpointMissing = true;
    throw err;
  }
  if (!res.ok) throw new Error(body.error || `Refresh failed (${res.status}).`);
  return { ...body, ranOn: 'server' };
}

// What the card calls. Server first, browser as the fallback, and the caller
// is told which one ran so the UI can say so.
export async function refreshNflDirectory({ onProgress } = {}) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const report = onProgress || (() => {});
  try {
    report({ phase: 'server', done: 0, total: 0 });
    return await refreshOnServer();
  } catch (e) {
    if (!e?.endpointMissing) throw e;
    // Fall back to writing from the browser so the directory can always be
    // loaded — including before the Vercel env vars are set.
    return refreshInBrowser({ onProgress });
  }
}

// ── Status ──────────────────────────────────────────────────────────────────

// The card's data.
//
// The facts the card states — how many players are stored, when they were last
// written, and the cross-platform ID coverage — are read from nfl_players
// ITSELF, not from the run log. The log is provenance (scheduled vs manual,
// what failed) and nothing more. That's the lesson from the first real
// refresh: the players landed, the log row didn't, and a card that trusted the
// log reported "refresh time unknown" and an old failure while sitting on a
// complete directory. The data can answer these questions; it should.
export async function fetchDirectoryStatus() {
  if (!supabase) {
    return { configured: false, count: 0, lastWriteAt: null, fill: null, lastRun: null, lastOk: null };
  }

  const players = () => supabase.from('nfl_players').select('player_id', { count: 'exact', head: true });
  const [countRes, activeRes, yahooRes, espnRes, writtenRes, lastOkRes, lastAnyRes] = await Promise.all([
    players(),
    players().eq('status', 'Active'),
    players().eq('status', 'Active').not('yahoo_id', 'is', null),
    players().eq('status', 'Active').not('espn_id', 'is', null),
    // Ground truth for "when was the directory last written": every upsert
    // stamps last_seen_at, so this is true even for a run that never logged.
    supabase.from('nfl_players').select('last_seen_at')
      .order('last_seen_at', { ascending: false }).limit(1),
    supabase.from('nfl_directory_refreshes').select('*').eq('status', 'ok')
      .order('refreshed_at', { ascending: false }).limit(1),
    supabase.from('nfl_directory_refreshes').select('*')
      .order('refreshed_at', { ascending: false }).limit(1),
  ]);
  if (countRes.error) throw countRes.error;

  // The run log is optional context. If reading it fails (an older schema, a
  // policy gap), the card still reports everything the table knows rather
  // than erroring out.
  const logRow = res => (res.error ? null : (res.data || [])[0] || null);

  return {
    configured: true,
    count: countRes.count || 0,
    lastWriteAt: writtenRes.error ? null : (writtenRes.data || [])[0]?.last_seen_at || null,
    fill: {
      active: activeRes.error ? null : activeRes.count || 0,
      yahoo: yahooRes.error ? null : yahooRes.count || 0,
      espn: espnRes.error ? null : espnRes.count || 0,
    },
    lastOk: logRow(lastOkRes),
    lastRun: logRow(lastAnyRes),
  };
}

// ── Reads used by the import flow ───────────────────────────────────────────

const SELECT_COLS =
  'player_id, search_key, full_name, first_name, last_name, team, pos, fantasy_positions, status, yahoo_id, espn_id';

// Batch name lookup: normalized key → every directory row under that key
// (more than one means the caller has to disambiguate — see
// pickDirectoryMatch). Names that match nothing simply have no entry.
export async function lookupByNames(names) {
  const out = new Map();
  if (!supabase) return out;
  const keys = [...new Set((names || []).map(directoryKey).filter(Boolean))];
  if (keys.length === 0) return out;

  for (let i = 0; i < keys.length; i += LOOKUP_CHUNK) {
    const chunk = keys.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await supabase
      .from('nfl_players')
      .select(SELECT_COLS)
      .in('search_key', chunk);
    if (error) throw error;
    for (const row of data || []) {
      const list = out.get(row.search_key) || [];
      list.push(row);
      out.set(row.search_key, list);
    }
  }
  return out;
}

// Typeahead for fixing an unmatched row by hand: substring match on the same
// normalized key, with prefix matches and active players first (an exact
// prefix on an active player is nearly always the one being typed).
export async function searchDirectory(query, limit = 8) {
  if (!supabase) return [];
  const key = directoryKey(query);
  if (key.length < 2) return [];
  const { data, error } = await supabase
    .from('nfl_players')
    .select(SELECT_COLS)
    .like('search_key', `%${key}%`)
    .limit(40);
  if (error) throw error;
  const rank = r => {
    const isActive = (r.status || '').toLowerCase() === 'active' ? 0 : 1;
    const isPrefix = (r.search_key || '').startsWith(key) ? 0 : 1;
    return isPrefix * 2 + isActive;
  };
  return (data || [])
    .sort((a, b) => rank(a) - rank(b) || (a.full_name || '').localeCompare(b.full_name || ''))
    .slice(0, limit);
}
