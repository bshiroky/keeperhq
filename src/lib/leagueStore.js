import { supabase } from './supabase.js';

// Maps between the app's league object (src/data.js shape) and a row in
// public.leagues (owner_id, id, sport, data jsonb, created_at, updated_at).
// Single-commissioner persistence: one owner_id per row, RLS-enforced.

export async function fetchLeagues(userId) {
  const { data, error } = await supabase
    .from('leagues')
    .select('id, data')
    .eq('owner_id', userId);
  if (error) throw error;
  return data.map(row => ({ ...row.data, id: row.id }));
}

export async function saveLeague(userId, league) {
  const { error } = await supabase
    .from('leagues')
    .upsert({
      owner_id: userId,
      id: league.id,
      sport: league.sport,
      data: league,
      updated_at: new Date().toISOString(),
    });
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
