// Keeper-rules unit tests — the cost/term model, the read-side shim for
// legacy leagues, and the season rollover. Plain node, no framework.
//   node scripts/test-keeper-rules.mjs
//
// buildLeague lives in a .jsx file, so this harness bundles the wizard with
// esbuild first (see the npm script) and imports the bundle if present;
// otherwise the buildLeague suite is skipped rather than failing the run.

import {
  keeperCostModelOf, termOf, hasTerm, isFinalYear, keeperValueText,
  keeperArchetypeOf, draftFormatOf, isAuctionCost, hasKeeperData, hasAuctionRulesBlock, hasLastDraftPage,
  COST_SLOT, COST_PICKS, COST_AUCTION, TERM_NONE, TERM_FIXED,
} from '../src/lib/keeperRules.js';
import { advanceKeeper, startNewSeason, canStartNewSeason } from '../src/lib/season.js';
import { CONTRACT_EXPIRED, isArchivedContract, priorEnteringYear } from '../src/lib/contractSeason.js';

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.error(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
}
function section(name) { console.log(`\n${name}`); }

// ── Read-side shim: legacy leagues, no data migration ─────────────────────
section('Legacy shim');
const legacySnake = { draftType: 'snake', contractYears: 3 };
eq(keeperCostModelOf(legacySnake), COST_SLOT, 'legacy snake → slot cost');
eq(termOf(legacySnake), { model: TERM_FIXED, years: 3 }, 'legacy snake → fixed 3yr term');
eq(draftFormatOf(legacySnake), 'snake', 'legacy snake → snake format');

const legacyAuction = { draftType: 'auction', auctionRules: { costIncreasePerYear: 5 } };
eq(keeperCostModelOf(legacyAuction), COST_AUCTION, 'legacy auction → auction cost');
eq(termOf(legacyAuction), { model: TERM_NONE, years: null }, 'legacy auction → no term');

// An auction league that carries no auctionRules block still resolves.
eq(keeperCostModelOf({ draftType: 'auction' }), COST_AUCTION, 'legacy auction w/o rules block');

// Explicit keys always win over the legacy signals.
eq(keeperCostModelOf({ keeperCostModel: COST_PICKS, draftType: 'auction' }), COST_PICKS,
  'explicit cost model beats draftType');
eq(termOf({ termModel: TERM_NONE, contractYears: 3 }), { model: TERM_NONE, years: null },
  'explicit termModel none beats stale contractYears');

// This is what makes preserve-don't-delete safe: a league that switched away
// from auction keeps its auctionRules block, and the explicit cost model must
// still win so the preserved block is inert rather than re-reading as auction.
eq(keeperCostModelOf({ keeperCostModel: COST_PICKS, auctionRules: { costIncreasePerYear: 5 } }), COST_PICKS,
  'preserved auctionRules block does NOT resurrect the auction cost model');
eq(isAuctionCost({ keeperCostModel: COST_SLOT, auctionRules: { costIncreasePerYear: 5 } }), false,
  'preserved auctionRules block is inert for slot leagues');
eq(keeperValueText({ keeperCostModel: COST_SLOT, termModel: TERM_FIXED, termYears: 3, auctionRules: { costIncreasePerYear: 5 } },
  { keptFor: 63, contractYear: 2, contractLength: 3 }), 'Y2/3',
  'preserved dollar value stays stored but unread while in slot mode');

// The shared page reads a PROJECTION that (before migration 009) always
// emitted an auctionRules object with null keys, even for a league that has
// none. That is what made a pre-wizard slot league read as auction on the
// shared page while Settings said slot: same function, different input. An
// all-null block is not a signal.
section('Projection shape (shared page)');
const projectedSlot = {
  draftType: 'snake', contractYears: 3, keeperCostModel: null, termModel: null, termYears: null,
  auctionRules: { costIncreasePerYear: null, undraftedStartCost: null },
};
eq(hasAuctionRulesBlock(projectedSlot), false, 'an all-null auctionRules block is no block');
eq(keeperCostModelOf(projectedSlot), COST_SLOT, 'projected pre-wizard slot league → slot (not auction)');
eq(isAuctionCost(projectedSlot), false, '…so nothing prices it in dollars');
eq(termOf(projectedSlot), { model: TERM_FIXED, years: 3 }, '…and its term still comes from contractYears');
eq(keeperValueText(projectedSlot, { contractYear: 2, contractLength: 3 }), 'Y2/3', '…rendering the contract state');
const projectedAuction = { draftType: 'auction', keeperCostModel: null, auctionRules: { costIncreasePerYear: 5, undraftedStartCost: null } };
eq(hasAuctionRulesBlock(projectedAuction), true, 'a block with any value counts');
eq(keeperCostModelOf(projectedAuction), COST_AUCTION, 'projected legacy auction league still → auction');
eq(keeperCostModelOf({ draftType: 'snake', auctionRules: {} }), COST_SLOT, 'an empty block is no block either');
eq(keeperCostModelOf({ keeperCostModel: COST_SLOT, auctionRules: { costIncreasePerYear: null } }), COST_SLOT, 'explicit key still wins');

// ── Draft format is independent of the cost model ─────────────────────────
section('draftType is format only');
const contractsWithAuctionDraft = { draftType: 'auction', keeperCostModel: COST_SLOT, termModel: TERM_FIXED, termYears: 3 };
eq(draftFormatOf(contractsWithAuctionDraft), 'auction', 'contracts league can run an auction draft');
eq(keeperCostModelOf(contractsWithAuctionDraft), COST_SLOT, '…and still cost only a slot');
eq(hasTerm(contractsWithAuctionDraft), true, '…and still have a term');

// ── Defect 2: slot + no term has no legacy archetype ──────────────────────
section('keeperArchetype derivation');
eq(keeperArchetypeOf(COST_AUCTION, TERM_NONE), 'auctionPrices', 'auction → auctionPrices');
eq(keeperArchetypeOf(COST_PICKS, TERM_NONE), 'draftPicks', 'picks → draftPicks');
eq(keeperArchetypeOf(COST_SLOT, TERM_FIXED), 'contracts', 'slot + term → contracts');
eq(keeperArchetypeOf(COST_SLOT, TERM_NONE), null, 'slot + no term → null (no legacy equivalent)');

// ── Value composition: cost and term compose, never either/or ─────────────
section('keeperValueText / isFinalYear');
const auctionTermed = { keeperCostModel: COST_AUCTION, termModel: TERM_FIXED, termYears: 3 };
eq(keeperValueText(auctionTermed, { keptFor: 63, contractYear: 2, contractLength: 3 }), '$63 · Y2/3',
  'auction + term shows BOTH');
eq(keeperValueText({ keeperCostModel: COST_AUCTION, termModel: TERM_NONE }, { keptFor: 63 }), '$63',
  'auction, no term → dollars only');
eq(keeperValueText({ keeperCostModel: COST_SLOT, termModel: TERM_FIXED, termYears: 3 }, { contractYear: 1, contractLength: 3 }), 'Y1/3',
  'slot + term → term only');
eq(keeperValueText({ keeperCostModel: COST_SLOT, termModel: TERM_NONE }, { player: 'x' }), '1 slot',
  'slot, no term → the slot is the cost');
eq(keeperValueText(legacySnake, { contractYear: 2, contractLength: 3 }), 'Y2/3', 'legacy snake unchanged');

eq(isFinalYear(auctionTermed, { contractYear: 3, contractLength: 3 }), true, 'auction + term CAN be final year');
eq(isFinalYear({ keeperCostModel: COST_AUCTION, termModel: TERM_NONE }, { contractYear: 9, contractLength: 3 }), false,
  'no term → never final year, whatever the stale year says');

// ── Defect 1: the term advance must run for auction leagues ──────────────
section('season rollover');
const k = { player: 'A', keptFor: 58, yearsKept: 1, contractYear: 1, contractLength: 3 };

const advAuctionTermed = advanceKeeper(k, { ...auctionTermed, auctionRules: { costIncreasePerYear: 5 } });
eq(advAuctionTermed.keptFor, 63, 'auction + term: price climbs');
// The value CARRIES ACROSS rather than incrementing, and that is the fix, not
// a regression. `keepers[].contractYear` is the ENTERING year; the record this
// produces lands in `priorKeepers`, where the convention is years SERVED. A
// keeper entering Y1 has served 1 once the season ends. The old `+ 1` wrote 2
// into a field read as "2 served, entering Y3", so every rollover skipped a
// year — a keeper entering Y1 of 3 came out reading as his final year.
eq(advAuctionTermed.contractYear, 1, 'auction + term: entering Y1 → 1 year served (no skipped year)');

const advAuctionNoTerm = advanceKeeper(k, { keeperCostModel: COST_AUCTION, termModel: TERM_NONE, auctionRules: { costIncreasePerYear: 5 } });
eq(advAuctionNoTerm.keptFor, 63, 'auction, no term: price climbs');
eq(advAuctionNoTerm.contractYear, 1, 'auction, no term: term year untouched');

// Expiry on the auction+term path — previously unreachable. The CONDITION is
// unchanged (entering the final year means the deal ends after it); what
// changed is that the record is now PRESERVED with a status instead of being
// returned as null and dropped — there is no undo in this app, so a contract
// that ran its course must still be on file afterwards.
const expiredAuction = advanceKeeper({ ...k, contractYear: 3 }, { ...auctionTermed, auctionRules: { costIncreasePerYear: 5 } });
eq(expiredAuction === null, false, 'auction + term: an expired contract is kept, not dropped');
eq(expiredAuction.contractStatus, CONTRACT_EXPIRED, 'auction + term: term runs out → marked expired');
eq(isArchivedContract(expiredAuction), true, 'an expired contract reads as archived');

// Legacy snake behaviour — same two corrections.
eq(advanceKeeper(k, legacySnake).contractYear, 1, 'legacy snake: entering Y1 → 1 year served');
eq(advanceKeeper({ ...k, contractYear: 3 }, legacySnake).contractStatus, CONTRACT_EXPIRED, 'legacy snake: expires at length');
eq(advanceKeeper(k, legacyAuction).keptFor, 63, 'legacy auction: price climbs');
eq(advanceKeeper(k, legacyAuction).contractYear, 1, 'legacy auction: no term, year untouched');

// Slot-only, no term: a keep simply persists.
const slotNone = { keeperCostModel: COST_SLOT, termModel: TERM_NONE };
eq(advanceKeeper(k, slotNone).contractYear, 1, 'slot/no-term: nothing advances');
eq(advanceKeeper(k, slotNone) !== null, true, 'slot/no-term: never expires');

// startNewSeason preserves what advanceKeeper expires.
const rolled = startNewSeason({
  season: '2026-27', teams: [{ id: 't1', keepers: [{ ...k, player: 'Done', contractYear: 3 }, { ...k, player: 'Live', contractYear: 1 }] }],
  ...auctionTermed, auctionRules: { costIncreasePerYear: 5 },
});
const rolledPriors = rolled.teams[0].priorKeepers;
eq(rolledPriors.length, 2, 'rollover keeps BOTH records — the expired one is not deleted');
eq(rolledPriors.filter(p => !isArchivedContract(p)).length, 1, 'only the live contract carries forward as live');
eq(rolledPriors.find(p => p.player === 'Done').expiredAfterSeason, '2026-27', 'the expired record names the season it ended after');
eq(rolled.season, '2027-28', 'season label advances');

// ── Season anchoring: a rollover run twice must not cost a year ───────────
// This is the whole point of `startSeason`. The counter could not survive a
// double press; the anchor does, because the season LABEL is the only thing
// that moved and correcting it corrects every contract at once.
section('season anchoring');
const anchored = {
  season: '2026-27', ...auctionTermed, auctionRules: { costIncreasePerYear: 5 },
  teams: [{ id: 't1', priorKeepers: [], keepers: [
    { player: 'Anchored', startSeason: '2026-27', contractYear: 1, contractLength: 3, keptFor: 10 },
  ] }],
};
const once = startNewSeason(anchored);
eq(once.season, '2027-28', 'one rollover: label advances');
eq(priorEnteringYear(once, once.teams[0].priorKeepers[0]), 2, 'one rollover: the anchored contract enters Y2');

// The accidental second press. It is REFUSED — with nothing declared there is
// nothing to carry forward, so a rollover could only end every contract.
eq(canStartNewSeason(once).ok, false, 'a rollover with no declared keepers is refused');
const twice = startNewSeason(once);
eq(twice === once, true, 'the refused rollover returns the league untouched');
eq(twice.season, '2027-28', 'season label did not drift');
eq(priorEnteringYear(twice, twice.teams[0].priorKeepers[0]), 2, 'the contract is still entering Y2, not Y3');

// And if a label is wrong for any other reason, correcting it is the whole
// repair — no record has to be edited.
const mislabelled = { ...twice, season: '2029-30' };
eq(priorEnteringYear(mislabelled, mislabelled.teams[0].priorKeepers[0]), 4, 'a wrong label reads wrong…');
eq(priorEnteringYear({ ...mislabelled, season: '2027-28' }, mislabelled.teams[0].priorKeepers[0]), 2, '…and correcting the label alone fixes it');

// An un-anchored record still rolls over on the counter, unchanged.
const legacyRoll = startNewSeason({
  season: '2026-27', ...auctionTermed, auctionRules: { costIncreasePerYear: 5 },
  teams: [{ id: 't1', priorKeepers: [], keepers: [{ player: 'Legacy', contractYear: 1, contractLength: 3, keptFor: 10 }] }],
});
eq(legacyRoll.teams[0].priorKeepers[0].startSeason, undefined, 'the rollover does not invent an anchor');
eq(priorEnteringYear(legacyRoll, legacyRoll.teams[0].priorKeepers[0]), 2, 'un-anchored: counter fallback gives the same answer');

// ── hasKeeperData — the Settings cost-model lock ──────────────────────────
section('cost-model lock gate');
eq(hasKeeperData({ teams: [{ keepers: [], priorKeepers: [] }] }), false, 'no keepers → unlocked');
eq(hasKeeperData({ teams: [{ keepers: [{ player: 'A' }] }] }), true, 'declared keepers → locked');
eq(hasKeeperData({ teams: [{ priorKeepers: [{ player: 'A' }] }] }), true, 'imported prior draft → locked');

// ── hasLastDraftPage — the Last Draft page + Import pointer gate ──────────
// Gated on the keeper COST model: a draft value sets a keeper's cost on
// auction (price) and pick-cost (round) leagues, never on a slot league.
eq(hasLastDraftPage({ keeperCostModel: 'auction', draftType: 'auction' }), true, 'auction cost → page');
eq(hasLastDraftPage({ keeperCostModel: 'picks', draftType: 'snake' }), true, 'pick cost → page');
eq(hasLastDraftPage({ keeperCostModel: 'slot', draftType: 'snake', termModel: 'fixed', termYears: 3 }), false, 'slot cost with terms → no page');
eq(hasLastDraftPage({ keeperCostModel: 'slot', draftType: 'auction' }), false, 'slot cost on an auction-format draft → still no page (format is not cost)');
// Pre-wizard rows resolve through the shim first.
eq(hasLastDraftPage({ draftType: 'snake', contractYears: 3 }), false, 'legacy snake + contractYears reads as slot → no page');
eq(hasLastDraftPage({ draftType: 'auction', auctionRules: { costIncreasePerYear: 5 } }), true, 'legacy auction block → page');

// ── buildLeague (optional — needs the esbuild bundle) ─────────────────────
let buildLeague = null;
try {
  // components.jsx touches `window` at module scope (it publishes the shared
  // primitives there), so give the bundle just enough of a DOM to import.
  globalThis.window = globalThis.window || {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.document = globalThis.document || { addEventListener() {}, removeEventListener() {} };
  ({ buildLeague } = await import('../.tmp-wizard-bundle.mjs'));
} catch (e) {
  console.error(`  (buildLeague suite skipped: ${e.message})`);
}

if (buildLeague) {
  section('buildLeague');
  const baseState = {
    name: 'Test', sport: 'hockey', season: '2026-27', draftType: 'snake',
    keeperSlots: 4, minKeepers: 0, mustFillSlots: false,
    keeperCostModel: COST_SLOT, pickSubModel: 'draftedRound', pickEscalation: 1,
    pickCollision: 'earlier', auctionInflation: 5, undraftedStartCost: 5, budget: 200,
    termModel: TERM_NONE, termYears: 3, teamCount: 2, teamNames: ['A', 'B'],
  };

  const slotNoTerm = buildLeague({ ...baseState }, []);
  eq(slotNoTerm.keeperArchetype, null, 'slot + no term → archetype null');
  eq(slotNoTerm.contractYears, null, 'slot + no term → contractYears null');
  eq(slotNoTerm.auctionRules, undefined, 'slot league carries no auctionRules block');
  eq(slotNoTerm.pickRules, undefined, 'slot league carries no pickRules block');
  eq(keeperCostModelOf(slotNoTerm), COST_SLOT, 'slot league reads back as slot');

  const auctionTerm = buildLeague({ ...baseState, keeperCostModel: COST_AUCTION, termModel: TERM_FIXED, termYears: 3 }, []);
  eq(auctionTerm.contractYears, 3, 'auction + term writes contractYears (newly reachable)');
  eq(auctionTerm.keeperTimeCap, 3, 'keeperTimeCap mirrors the term');
  eq(auctionTerm.auctionRules.costIncreasePerYear, 5, 'auction rules written');
  eq(auctionTerm.keeperArchetype, 'auctionPrices', 'auction → auctionPrices');
  eq(hasTerm(auctionTerm), true, 'auction + term reads back as termed');
  eq(isAuctionCost(auctionTerm), true, '…and as auction cost');

  // Draft format is asked, not derived: a snake-format league can cost dollars.
  eq(auctionTerm.draftType, 'snake', 'draftType comes from the answer, NOT the cost model');

  const picks = buildLeague({ ...baseState, keeperCostModel: COST_PICKS, draftType: 'auction' }, []);
  eq(picks.pickRules.waiverRound, 'last', 'waiverRound written silently');
  eq(picks.pickRules.collision, 'earlier', 'collision written for draftedRound');
  eq(picks.draftType, 'auction', 'picks league can run an auction draft');
  eq(picks.rookieRules, { enabled: false, extraYears: 1, escalationPerYear: 0, freeFirstYear: false },
    'rookieRules written disabled');

  const topSlots = buildLeague({ ...baseState, keeperCostModel: COST_PICKS, pickSubModel: 'topSlots' }, []);
  eq(topSlots.pickRules.collision, undefined, 'collision omitted for topSlots (cannot collide)');

  const mustFill = buildLeague({ ...baseState, mustFillSlots: true }, []);
  eq(mustFill.minKeepers, 4, 'mustFillSlots sets minKeepers to the max');
  eq(mustFill.contractsRequired, true, 'legacy contractsRequired mirror written');

  eq(slotNoTerm.termMinYears, null, 'termMinYears reserved');
  eq(slotNoTerm.termMaxYears, null, 'termMaxYears reserved');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
