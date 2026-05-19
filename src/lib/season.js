// Season rollover helpers — pure functions, no React.
// Used by:
//   - SettingsTab "Start New Season" button
//   - SetupTab keeper review step (advancing prior-season keepers)

// Bumps the season label by one year.
//   "2026-27" -> "2027-28"
//   "2026"    -> "2027"
export function advanceSeasonLabel(label) {
  if (!label) return label;
  const range = label.match(/^(\d{4})-(\d{2,4})$/);
  if (range) {
    const start = parseInt(range[1], 10) + 1;
    const endRaw = range[2];
    const endLen = endRaw.length;
    const endFull = endLen === 2 ? parseInt(range[1].slice(0, 2) + endRaw, 10) : parseInt(endRaw, 10);
    const newEnd = endFull + 1;
    return endLen === 2 ? `${start}-${String(newEnd).slice(-2)}` : `${start}-${newEnd}`;
  }
  const single = label.match(/^(\d{4})$/);
  if (single) return String(parseInt(single[1], 10) + 1);
  return label;
}

// Given a keeper from last season, returns what their contract looks like
// in the NEW season — or null if the contract has now expired.
// Snake leagues: bumps contractYear by 1; drops it if it exceeds contractLength.
// Auction leagues: bumps yearsKept and keptFor by the league's per-year increase.
export function advanceKeeper(keeper, league) {
  if (league.draftType === 'snake') {
    const length = keeper.contractLength || league.contractYears || 3;
    const newYear = (keeper.contractYear || 0) + 1;
    if (newYear > length) return null; // expired
    return {
      ...keeper,
      contractYear: newYear,
      contractLength: length,
    };
  }
  if (league.draftType === 'auction') {
    const bump = league.auctionRules?.costIncreasePerYear ?? 0;
    return {
      ...keeper,
      keptFor: (keeper.keptFor || 0) + bump,
      yearsKept: (keeper.yearsKept || 0) + 1,
    };
  }
  return keeper;
}

// Rolls a league from its current season to the next:
//   - bumps the season label
//   - for each team: current keepers become priorKeepers (with contract year advanced),
//     keepers array is cleared, keepersSubmitted reset to false
//   - status reset to 'pre-draft'
//   - draftDate cleared (user re-sets it)
// Returns a new league object; does not mutate the input.
export function startNewSeason(league) {
  const nextTeams = (league.teams || []).map(team => {
    const carriedForward = (team.keepers || [])
      .map(k => advanceKeeper(k, league))
      .filter(Boolean);
    return {
      ...team,
      priorKeepers: carriedForward,
      keepers: [],
      keepersSubmitted: false,
      paid: false,
      paidDate: undefined,
      paidNote: undefined,
    };
  });

  return {
    ...league,
    season: advanceSeasonLabel(league.season),
    status: 'pre-draft',
    draftDate: null,
    teams: nextTeams,
  };
}
