// NFL player directory — I/O half: the Sleeper fetch, the Supabase refresh,
// and the read paths the import flow uses. Pure helpers live in
// nflDirectory.js (unit-tested there); everything here touches the network.
//
// Refresh model: MANUAL, triggered by a button (the Import page's directory
// card). No cron — the commissioner knows when fresh data matters (before the
// draft, around week 14) better than a schedule does. Sleeper's own docs ask
// callers to store the payload themselves and fetch it at most once a day,
// which is exactly this shape.
//
// Refresh is UPSERT-ONLY and never deletes: see the preserve-don't-delete
// notes in supabase/migrations/004_nfl_player_directory.sql (there is no
// delete policy on the table, and the upsert COALESCEs every column), so a
// player_id stored on a keeper or roster row always resolves even after the
// player drops out of Sleeper's payload.

import { supabase } from './supabase.js';
import { directoryKey, sleeperPayloadToRows, summarizeCrossIds } from './nflDirectory.js';

export const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

// Written per RPC call. Small enough that a slow connection still shows
// progress moving; large enough that a full refresh is tens of calls, not
// thousands.
const UPSERT_CHUNK = 250;
// PostgREST sends filters in the query string, so the `in` list has to stay
// well inside URL length limits.
const LOOKUP_CHUNK = 150;

export function directoryConfigured() {
  return !!supabase;
}

// ~5MB of JSON. Sleeper is public: no auth, no key, no rate-limit concern at
// one call per manual refresh.
export async function fetchSleeperPlayers() {
  const res = await fetch(SLEEPER_PLAYERS_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper returned ${res.status} ${res.statusText}`);
  const payload = await res.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Sleeper returned an unexpected shape (expected a player_id → player map).');
  }
  return payload;
}

// Fetch → map → chunked upsert → log the run. Returns the stats the UI shows,
// including the cross-platform id fill rates.
export async function refreshNflDirectory({ onProgress } = {}) {
  if (!supabase) throw new Error('Supabase is not configured in this build.');
  const report = onProgress || (() => {});

  report({ phase: 'fetching', done: 0, total: 0 });
  let rows;
  try {
    const payload = await fetchSleeperPlayers();
    rows = sleeperPayloadToRows(payload);
  } catch (e) {
    // A browser-side CORS rejection surfaces as a bare TypeError with no
    // status, which reads as a mystery unless we say what it means.
    const detail = e?.message || String(e);
    throw new Error(
      `Couldn't reach the Sleeper player API (${detail}). ` +
      'Check the connection and try again — nothing was written, so the stored directory is unchanged.'
    );
  }
  if (rows.length === 0) throw new Error('Sleeper returned zero usable players — nothing was written.');

  const ids = summarizeCrossIds(rows);
  let upserted = 0;
  report({ phase: 'writing', done: 0, total: rows.length });

  try {
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const { data, error } = await supabase.rpc('upsert_nfl_players', { p_players: chunk });
      if (error) throw error;
      upserted += Number(data) || chunk.length;
      report({ phase: 'writing', done: Math.min(i + UPSERT_CHUNK, rows.length), total: rows.length });
    }
  } catch (e) {
    // Best-effort failure record: a partial write is still a real event, and
    // the status line should be able to say the last run didn't finish.
    await supabase.from('nfl_directory_refreshes').insert({
      source: 'sleeper', payload_count: rows.length, upserted_count: upserted,
      active_count: ids.active, yahoo_id_count: ids.yahooActive, espn_id_count: ids.espnActive,
      status: 'error', error: String(e?.message || e).slice(0, 500),
    }).then(() => {}, () => {});
    throw new Error(
      `Writing the directory failed after ${upserted} of ${rows.length} players (${e?.message || e}). ` +
      'Players already written are saved — re-running the refresh continues from a clean upsert.'
    );
  }

  const { error: logError } = await supabase.from('nfl_directory_refreshes').insert({
    source: 'sleeper',
    payload_count: rows.length,
    upserted_count: upserted,
    active_count: ids.active,
    yahoo_id_count: ids.yahooActive,
    espn_id_count: ids.espnActive,
    status: 'ok',
  });
  if (logError) console.warn('[KeeperHQ] Directory refreshed but the run log failed:', logError);

  report({ phase: 'done', done: rows.length, total: rows.length });
  return { payloadCount: rows.length, upserted, ids };
}

// Status line data: how many players are stored and when the directory was
// last refreshed, so staleness is visible at a glance.
export async function fetchDirectoryStatus() {
  if (!supabase) return { configured: false, count: 0, lastRefresh: null };
  const [countRes, logRes] = await Promise.all([
    supabase.from('nfl_players').select('player_id', { count: 'exact', head: true }),
    supabase.from('nfl_directory_refreshes').select('*').order('refreshed_at', { ascending: false }).limit(1),
  ]);
  if (countRes.error) throw countRes.error;
  if (logRes.error) throw logRes.error;
  return {
    configured: true,
    count: countRes.count || 0,
    lastRefresh: (logRes.data || [])[0] || null,
  };
}

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
