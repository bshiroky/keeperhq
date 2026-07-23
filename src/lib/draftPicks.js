// Draft-pick ownership — pure helpers, no React.
//
// Model (in the league blob):
//   league.draftPicks = {
//     rounds?: number,                 // explicit round count; absent = derived
//     ownership: { "<round>:<originalTeamId>": ownerTeamId },
//   }
// The ownership map is SPARSE: a missing entry means the original team still
// owns its own pick, so the default state (everyone owns everything) costs
// zero storage and needs no migration. Reassigning back to the original team
// deletes the entry.
//
// Round 1 overlaps with the Lottery page, which stores draft ORDER (slot →
// owner, keyed by team NAME) in league.lotteryResults. draftPicks is the
// source of truth for pick OWNERSHIP; the two are kept consistent by
// write-through in both directions (recordLotteryPickTrade / reassignPick).

// Derived round count: the deepest roster or prior-keeper list on file — a
// draft has (roughly) one round per roster spot. Falls back to 15 when the
// league has no roster/draft data imported yet. An explicit
// league.draftPicks.rounds (set from the Picks sheet) always wins.
export function defaultDraftRounds(league) {
  const teams = league.teams || [];
  const most = teams.reduce((max, tm) => Math.max(
    max, (tm.roster || []).length, (tm.priorKeepers || []).length,
  ), 0);
  return most > 0 ? most : 15;
}

export function getDraftRounds(league) {
  const explicit = league.draftPicks?.rounds;
  return Number.isFinite(explicit) && explicit > 0 ? explicit : defaultDraftRounds(league);
}

export function pickKey(round, originalTeamId) {
  return `${round}:${originalTeamId}`;
}

// Who currently owns {originalTeam}'s pick in {round}.
export function pickOwnerId(league, round, originalTeamId) {
  return league.draftPicks?.ownership?.[pickKey(round, originalTeamId)] || originalTeamId;
}

// Pure ownership write — no lottery sync. Reassigning to the original owner
// clears the entry (back to the sparse default).
function withPickOwnership(league, round, originalTeamId, ownerTeamId) {
  const ownership = { ...(league.draftPicks?.ownership || {}) };
  const key = pickKey(round, originalTeamId);
  if (!ownerTeamId || ownerTeamId === originalTeamId) delete ownership[key];
  else ownership[key] = ownerTeamId;
  return { ...league, draftPicks: { ...(league.draftPicks || {}), ownership } };
}

// Entry point for the Picks grid. Round-1 changes also patch any saved
// lottery results (keyed by team name) so the two surfaces never disagree.
export function reassignPick(league, round, originalTeamId, ownerTeamId) {
  let next = withPickOwnership(league, round, originalTeamId, ownerTeamId);
  if (round === 1 && Array.isArray(league.lotteryResults)) {
    const teams = league.teams || [];
    const nameOf = (id) => teams.find(tm => tm.id === id)?.name;
    const originalName = nameOf(originalTeamId);
    const ownerName = nameOf(ownerTeamId || originalTeamId);
    if (originalName && ownerName) {
      next = {
        ...next,
        lotteryResults: league.lotteryResults.map(row =>
          row.original === originalName ? { ...row, owner: ownerName } : row
        ),
      };
    }
  }
  return next;
}

// Entry point for the Lottery page, which works in team NAMES. Records the
// reassignment as round-1 ownership; returns the league unchanged if either
// name doesn't resolve to a current team. (The lottery keeps writing its own
// lotteryResults slate separately — this only maintains draftPicks.)
export function recordLotteryPickTrade(league, originalTeamName, newOwnerName) {
  const teams = league.teams || [];
  const original = teams.find(tm => tm.name === originalTeamName);
  const owner = teams.find(tm => tm.name === newOwnerName);
  if (!original || !owner) return league;
  return withPickOwnership(league, 1, original.id, owner.id === original.id ? null : owner.id);
}

// All reassigned picks, sorted by round then original-team order — feeds the
// "Traded picks" list under the grid.
export function tradedPicks(league) {
  const teams = league.teams || [];
  const teamIdx = new Map(teams.map((tm, i) => [tm.id, i]));
  const out = [];
  for (const [key, ownerTeamId] of Object.entries(league.draftPicks?.ownership || {})) {
    const sep = key.indexOf(':');
    const round = parseInt(key.slice(0, sep), 10);
    const originalTeamId = key.slice(sep + 1);
    if (!teamIdx.has(originalTeamId) || !teamIdx.has(ownerTeamId)) continue;
    out.push({ round, originalTeamId, ownerTeamId });
  }
  out.sort((a, b) => a.round - b.round || teamIdx.get(a.originalTeamId) - teamIdx.get(b.originalTeamId));
  return out;
}
