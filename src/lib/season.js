// Season rollover helpers — pure functions, no React.
// Used by:
//   - SettingsTab "Start New Season" button
//   - SetupTab keeper review step (advancing prior-season keepers)

import { termOf, isAuctionCost, TERM_FIXED } from './keeperRules.js';

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

// Given a keeper from last season, returns what he looks like in the NEW
// season — or null if a fixed term has now run out (back to the draft).
//
// Cost and term are independent dimensions, so both adjustments are applied
// in sequence rather than as an either/or. This used to branch on `draftType`,
// which conflated the draft FORMAT with the keeper cost model: an auction-cost
// league with a term never advanced its contract years, because the snake
// branch was the only one that touched them. `draftType` is draft format only
// now and takes no part in keeper math.
export function advanceKeeper(keeper, league) {
  const term = termOf(league);
  let next = { ...keeper, yearsKept: (keeper.yearsKept || 0) + 1 };

  // Cost escalation — auction prices climb per year kept.
  if (isAuctionCost(league)) {
    const bump = league.auctionRules?.costIncreasePerYear ?? 0;
    next.keptFor = (next.keptFor || 0) + bump;
  }

  // Term advance — runs for ANY cost model with a fixed term, auction included.
  if (term.model === TERM_FIXED) {
    const length = keeper.contractLength || term.years || 3;
    const newYear = (keeper.contractYear || 0) + 1;
    if (newYear > length) return null; // term expired
    next.contractYear = newYear;
    next.contractLength = length;
  }

  return next;
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
