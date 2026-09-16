// Season rollover helpers — pure functions, no React.
// Used by:
//   - SettingsTab "Start New Season" button
//   - SetupTab keeper review step (advancing prior-season keepers)

import { termOf, isAuctionCost, TERM_FIXED } from './keeperRules.js';
import { enteringYearIn, archiveContract, isArchivedContract } from './contractSeason.js';
import { normalizeName } from './players.js';
import { priceOf } from './priceProvenance.js';
import { appendChanges, changeEntry } from './changeLog.js';

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
// season — or, when a fixed term has now run out, the same record marked
// expired (it is PRESERVED, never dropped — see below).
//
// Cost and term are independent dimensions, so both adjustments are applied
// in sequence rather than as an either/or. This used to branch on `draftType`,
// which conflated the draft FORMAT with the keeper cost model: an auction-cost
// league with a term never advanced its contract years, because the snake
// branch was the only one that touched them. `draftType` is draft format only
// now and takes no part in keeper math.
//
// TERM NO LONGER ADVANCES A COUNTER. A record carrying `startSeason` is
// anchored to the season its Y1 was, so bumping the league's season label IS
// the advance — there is nothing per-record to increment, and running this
// twice by accident cannot push a contract two years into the future. Records
// with no anchor still fall back to the counter so a league mid-backfill (or
// never backfilled) rolls over exactly as it always did.
export function advanceKeeper(keeper, league, nextSeason = advanceSeasonLabel(league?.season)) {
  const term = termOf(league);
  let next = { ...keeper, yearsKept: (keeper.yearsKept || 0) + 1 };

  // Cost escalation — auction prices climb per year kept.
  //
  // This is genuine per-season state: the price in force really does change
  // each season, and there is no anchor that could derive it, so it stays a
  // mutation. A price the commissioner set by hand is the price that escalates
  // (priceOf reads the value in force), and the result is a value the app
  // calculated, so the provenance clears: carrying "edited" into the new
  // season would mark the row forever and point its reset at a previous
  // season's arithmetic. The original edit stays in the change log.
  if (isAuctionCost(league)) {
    const bump = league.auctionRules?.costIncreasePerYear ?? 0;
    next.keptFor = (priceOf(next) || 0) + bump;
    next.keptForComputed = null;
    next.keptForOverridden = false;
  }

  // Term — runs for ANY cost model with a fixed term, auction included.
  if (term.model === TERM_FIXED) {
    const length = keeper.contractLength || term.years || 3;
    next.contractLength = length;

    // ANCHORED: the season label moved; the contract did not. The entering
    // year for the new season is arithmetic against the anchor.
    if (keeper.startSeason) {
      const entering = enteringYearIn(keeper.startSeason, nextSeason);
      if (entering != null) {
        if (entering > length) return archiveContract(next, league?.season);
        // The counter is written from the ANCHOR, not incremented. It is kept
        // in step for readers that cannot see the anchor — chiefly the shared
        // page before migration 010 projects `startSeason`, where a stale
        // counter would print the wrong year to the whole league. Deriving it
        // means it cannot drift from the anchor by construction, and the
        // anchor still wins on every read, so this is a mirror and not a
        // second source of truth. (Same reasoning as the price-field rule:
        // when a reader might miss the new field, make the old one hold the
        // right answer rather than a confidently wrong one.)
        // Stored in the priorKeepers convention: years SERVED entering the
        // new season, which is one less than the entering year.
        next.contractYear = entering - 1;
        return next;
      }
      // An anchor we cannot read falls through to the counter below rather
      // than stranding the contract. The backfill report flags such labels.
    }

    // UN-ANCHORED: the legacy counter path.
    //
    // `keepers[].contractYear` is the ENTERING year, and the record being
    // produced lands in `priorKeepers`, where the convention is years SERVED.
    // A keeper entering Y2 has served 2 once this season ends — so the value
    // carries across unchanged, and the old `+ 1` here was an off-by-one that
    // skipped a year on every rollover (a keeper entering Y1 of 3 came out the
    // other side reading as entering Y3, his final year). The EXPIRY condition
    // is unchanged: entering the final year means the deal ends after it.
    const entering = keeper.contractYear || 1;
    if (entering >= length) return archiveContract(next, league?.season);
    next.contractYear = entering;
  }

  return next;
}

// Whether a rollover can safely run. → { ok, reason }
//
// The rollover's whole job is turning THIS season's declarations into next
// season's contracts, so with nothing declared it has nothing to carry
// forward and can only destroy: it would bump the season label, end every
// live contract as unkept, and leave the league a year ahead with no keepers.
// That is exactly what an accidental second press does, and it is the one
// failure the season anchor cannot undo on its own — correcting the label
// restores every contract's YEAR, but not a contract the rollover ended.
//
// So the second press is refused rather than repaired. With the guard in
// place a repeat rollover is a true no-op, which is the property that makes
// the anchor's promise hold end to end.
export function canStartNewSeason(league) {
  const declared = (league?.teams || []).reduce((n, tm) => n + (tm.keepers || []).length, 0);
  if (declared === 0) {
    return { ok: false, reason: 'No keepers are declared, so there is nothing to carry forward. Rolling over now would end every contract and move the season on with an empty keeper list.' };
  }
  return { ok: true, reason: null };
}

// Rolls a league from its current season to the next:
//   - bumps the season label
//   - for each team: current keepers become priorKeepers (with contract year advanced),
//     keepers array is cleared, keepersSubmitted reset to false
//   - status reset to 'pre-draft'
//   - draftDate cleared (user re-sets it)
// Returns a new league object; does not mutate the input.
export function startNewSeason(league, { force = false } = {}) {
  // A blocked rollover returns the league UNCHANGED — identity, not a throw —
  // so a call site that forgets to check can do no damage. `force` exists for
  // the genuine (rare) case of a season in which nobody kept anyone; nothing
  // in the UI passes it.
  if (!force && !canStartNewSeason(league).ok) return league;
  const nextSeason = advanceSeasonLabel(league.season);
  const nextTeams = (league.teams || []).map(team => {
    // Expired contracts are PRESERVED, not deleted. This used to filter out
    // whatever advanceKeeper returned null for, which silently destroyed the
    // record of every contract that ran its course — the one place in the app
    // that broke the preserve-don't-delete rule, and unrecoverable because
    // there is no version history anywhere. They now carry a status instead.
    //
    // Keeping them is invisible: buildTeamPool skips archived records at the
    // single point every surface derives its pool from, so no live view gains
    // a row. What is gained is the data — a contracts-by-expiry-year view, or
    // simply answering "when did this deal end", stops being impossible.
    const carriedForward = (team.keepers || [])
      .map(k => advanceKeeper(k, league, nextSeason))
      .filter(Boolean);
    // A live contract nobody kept ends here. That is the same rule the keeper
    // deadline derives (unkept means the deal is over), made permanent now
    // that the season it belonged to has closed — but the RECORD is archived,
    // not dropped, so last season's drafted price and term survive it. This
    // list used to be simply overwritten by the carried-forward keepers, which
    // deleted every one of them.
    const keptNames = new Set((team.keepers || []).map(k => normalizeName(k.player)).filter(Boolean));
    const retired = (team.priorKeepers || []).map(p => (
      isArchivedContract(p) ? p
        : keptNames.has(normalizeName(p.player)) ? null
        : archiveContract(p, league.season)
    )).filter(Boolean);
    return {
      ...team,
      priorKeepers: [...retired, ...carriedForward],
      keepers: [],
      keepersSubmitted: false,
      paid: false,
      paidDate: undefined,
      paidNote: undefined,
    };
  });

  const carried = nextTeams.reduce((s, tm) => s + tm.priorKeepers.filter(p => !isArchivedContract(p)).length, 0);
  return appendChanges({
    ...league,
    season: nextSeason,
    status: 'pre-draft',
    draftDate: null,
    teams: nextTeams,
  }, changeEntry({
    kind: 'season',
    from: league.season || null,
    to: nextSeason || null,
    note: `${carried} keeper${carried === 1 ? '' : 's'} carried forward`,
  }));
}
