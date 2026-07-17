import { supabase } from './supabase.js';

// Maps between the app's league object (src/data.js shape) and a row in
// public.leagues (owner_id, id, sport, data jsonb, created_at, updated_at).
// Single-commissioner persistence: one owner_id per row, RLS-enforced.

// Rows include soft-deleted leagues; deleted_at is a real column (never part
// of the data blob) surfaced on the league object as `deletedAt` so the app
// can split active vs recently-deleted with one fetch. saveLeague strips it
// back off before writing the blob.
export async function fetchLeagues(userId) {
  const { data, error } = await supabase
    .from('leagues')
    .select('id, data, deleted_at')
    .eq('owner_id', userId);
  if (error) throw error;
  return data.map(row => ({
    ...row.data,
    id: row.id,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  }));
}

export async function saveLeague(userId, league) {
  const { deletedAt, ...data } = league;
  const { error } = await supabase
    .from('leagues')
    .upsert({
      owner_id: userId,
      id: league.id,
      sport: league.sport,
      data,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

// ── Soft delete / restore ───────────────────────────────────────────────────
// deleted_at set = hidden from My Leagues and the shared page RPC returns
// nothing for its token; cleared = fully restored. RLS scopes both to the
// signed-in owner's rows. Hard delete is intentionally not exposed in the UI.

export async function softDeleteLeague(leagueId, when) {
  const { error } = await supabase
    .from('leagues')
    .update({ deleted_at: when, updated_at: new Date().toISOString() })
    .eq('id', leagueId);
  if (error) throw error;
}

export async function restoreLeague(leagueId) {
  const { error } = await supabase
    .from('leagues')
    .update({ deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', leagueId);
  if (error) throw error;
}

export async function deleteLeague(userId, leagueId) {
  const { error } = await supabase
    .from('leagues')
    .delete()
    .eq('owner_id', userId)
    .eq('id', leagueId);
  if (error) throw error;
}

// ── Share token (public shared league page) ────────────────────────────────
// share_token is a real column on public.leagues (NOT part of the data blob),
// so it never rides along in saveLeague upserts and is never exposed through
// the get_shared_league projection. RLS scopes both calls to the signed-in
// owner's rows — no explicit owner_id filter needed.

export async function fetchShareToken(leagueId) {
  const { data, error } = await supabase
    .from('leagues')
    .select('share_token')
    .eq('id', leagueId)
    .maybeSingle();
  if (error) throw error;
  return data?.share_token || null;
}

// Regenerating mints a new URL-safe token and invalidates the old link
// immediately (the RPC looks up by exact token match).
export async function regenerateShareToken(leagueId) {
  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await supabase
    .from('leagues')
    .update({ share_token: token, updated_at: new Date().toISOString() })
    .eq('id', leagueId);
  if (error) throw error;
  return token;
}
