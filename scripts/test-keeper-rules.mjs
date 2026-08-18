// Keeper-rules unit tests — the cost/term model, the read-side shim for
// legacy leagues, and the season rollover. Plain node, no framework.
//   node scripts/test-keeper-rules.mjs
//
// buildLeague lives in a .jsx file, so this harness bundles the wizard with
// esbuild first (see the npm script) and imports the bundle if present;
// otherwise the buildLeague suite is skipped rather than failing the run.

import {
  keeperCostModelOf, termOf, hasTerm, isFinalYear, keeperValueText,
  keeperArchetypeOf, draftFormatOf, isAuctionCost, hasKeeperData,
  COST_SLOT, COST_PICKS, COST_AUCTION, TERM_NONE, TERM_FIXED,
} from '../src/lib/keeperRules.js';
import { advanceKeeper, startNewSeason } from '../src/lib/season.js';

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
eq(advAuctionTermed.contractYear, 2, 'auction + term: TERM YEAR ADVANCES (the defect)');

const advAuctionNoTerm = advanceKeeper(k, { keeperCostModel: COST_AUCTION, termModel: TERM_NONE, auctionRules: { costIncreasePerYear: 5 } });
eq(advAuctionNoTerm.keptFor, 63, 'auction, no term: price climbs');
eq(advAuctionNoTerm.contractYear, 1, 'auction, no term: term year untouched');

// Expiry on the auction+term path — previously unreachable.
eq(advanceKeeper({ ...k, contractYear: 3 }, { ...auctionTermed, auctionRules: { costIncreasePerYear: 5 } }), null,
  'auction + term: term runs out → back to the draft');

// Legacy snake behaviour must be unchanged.
eq(advanceKeeper(k, legacySnake).contractYear, 2, 'legacy snake: year advances');
eq(advanceKeeper({ ...k, contractYear: 3 }, legacySnake), null, 'legacy snake: expires at length');
eq(advanceKeeper(k, legacyAuction).keptFor, 63, 'legacy auction: price climbs');
eq(advanceKeeper(k, legacyAuction).contractYear, 1, 'legacy auction: no term, year untouched');

// Slot-only, no term: a keep simply persists.
const slotNone = { keeperCostModel: COST_SLOT, termModel: TERM_NONE };
eq(advanceKeeper(k, slotNone).contractYear, 1, 'slot/no-term: nothing advances');
eq(advanceKeeper(k, slotNone) !== null, true, 'slot/no-term: never expires');

// startNewSeason drops only what advanceKeeper drops.
const rolled = startNewSeason({
  season: '2026-27', teams: [{ id: 't1', keepers: [{ ...k, contractYear: 3 }, { ...k, contractYear: 1 }] }],
  ...auctionTermed, auctionRules: { costIncreasePerYear: 5 },
});
eq(rolled.teams[0].priorKeepers.length, 1, 'rollover drops the expired auction+term keep');
eq(rolled.season, '2027-28', 'season label advances');

// ── hasKeeperData — the Settings cost-model lock ──────────────────────────
section('cost-model lock gate');
eq(hasKeeperData({ teams: [{ keepers: [], priorKeepers: [] }] }), false, 'no keepers → unlocked');
eq(hasKeeperData({ teams: [{ keepers: [{ player: 'A' }] }] }), true, 'declared keepers → locked');
eq(hasKeeperData({ teams: [{ priorKeepers: [{ player: 'A' }] }] }), true, 'imported prior draft → locked');

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
