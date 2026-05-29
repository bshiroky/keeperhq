// Owns the "all keepers declared" celebration gate.
// No backend: the suppression flag lives in localStorage, keyed per league,
// and stores the SEASON that earned the moment (not a boolean) so that
// startNewSeason() re-arms it for free and a mid-season correction can't re-fire.
const key = (leagueId) => `kh:keepersCelebrationSeen:${leagueId}`;

// True when the league has teams and every team has declared ≥1 keeper.
// Mirrors the teamsWithKeepers count nextAction() already derives — same shape.
export function allKeepersIn(league) {
  const teams = league?.teams ?? [];
  const n = league?.teamCount ?? teams.length;
  if (!n) return false;
  const declared = teams.filter(t => (t.keepers?.length ?? 0) > 0).length;
  return declared === n;
}

// Total declared keepers across all teams — for the readout pill.
export function totalKeepers(league) {
  return (league?.teams ?? []).reduce((s, t) => s + (t.keepers?.length ?? 0), 0);
}

// Should the moment fire right now? Complete AND not already seen this season.
export function shouldCelebrate(league) {
  if (!allKeepersIn(league)) return false;
  return readSeen(league.id) !== league.season;
}

// Read/write are defensive: private-mode throws → default to NOT firing.
// A missed celebration is harmless; one that fires every load is not.
export function readSeen(leagueId) {
  try { return localStorage.getItem(key(leagueId)); }
  catch (e) { return null; }
}

// Call on SHOW (not dismiss) so a refresh with the modal open can't double-fire.
export function markSeen(leagueId, season) {
  try { localStorage.setItem(key(leagueId), season); } catch (e) {}
}
