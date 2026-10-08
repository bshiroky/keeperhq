// Season-anchored contracts, the keeper deadline as an event, and the
// backfill planner — `npm run test:season` (plain node, no framework).
//
// The claim under test: a contract describes a FACT (the season it started),
// not a count of how many times a button was pressed, so a miscounted rollover
// is repaired by correcting the season label and nothing else.
import assert from 'node:assert/strict';
import {
  seasonStartYear, seasonsBetween, seasonLabelFrom, enteringYearIn,
  priorEnteringYear, keeperEnteringYear, anchorFor, isArchivedContract,
  archiveContract, BASIS_SERVED, BASIS_ENTERING, CONTRACT_EXPIRED,
} from '../src/lib/contractSeason.js';
import {
  deadlineMoment, isDeadlinePassed, declaredKeeperNames, voidingActive,
  isContractVoided,
} from '../src/lib/keeperDeadline.js';
import { planBackfill, planBackfillAll, applyBackfill, ACTION_SET } from '../src/lib/contractBackfill.js';
import { buildTeamPool } from '../src/lib/teamPool.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}
const section = (s) => console.log(`\n${s}`);

// ── Season labels ────────────────────────────────────────────────────────────
section('season labels');

test('every label shape in the wild reads to its start year', () => {
  assert.equal(seasonStartYear('2026-27'), 2026);
  assert.equal(seasonStartYear('2026-2027'), 2026);
  assert.equal(seasonStartYear('2026'), 2026);
  assert.equal(seasonStartYear(' 2026-27 '), 2026);
});

test('an unreadable label is null, never a silent zero', () => {
  // A zero would make every contract read as starting this season, which is
  // both wrong and invisible. Null forces the caller to fall back or flag.
  assert.equal(seasonStartYear('next year'), null);
  assert.equal(seasonStartYear(''), null);
  assert.equal(seasonStartYear(undefined), null);
  assert.equal(seasonsBetween('2026-27', 'oops'), null);
  assert.equal(seasonsBetween('oops', '2026-27'), null);
});

test('a generated label keeps the league\'s own format', () => {
  assert.equal(seasonLabelFrom('2026-27', 2024), '2024-25');
  assert.equal(seasonLabelFrom('2026-2027', 2024), '2024-2025');
  assert.equal(seasonLabelFrom('2026', 2024), '2024');
  assert.equal(seasonLabelFrom('2019-20', 1999), '1999-00', 'century rollover keeps two digits');
});

test('entering year is the seasons elapsed since the anchor, 1-based', () => {
  assert.equal(enteringYearIn('2026-27', '2026-27'), 1);
  assert.equal(enteringYearIn('2024-25', '2026-27'), 3);
  assert.equal(enteringYearIn('2026-27', '2025-26'), 1, 'a backwards label clamps to Y1, never negative');
});

// ── Anchor beats counter, counter is the fallback ───────────────────────────
section('anchored vs un-anchored reads');

const termed = { season: '2026-27', termModel: 'fixed', termYears: 3 };

test('an anchored record ignores its counter entirely', () => {
  // The counter says one thing and the anchor another. The anchor wins —
  // that is the whole point: a drifted counter stops being authoritative.
  const rec = { player: 'A', startSeason: '2025-26', contractYear: 7 };
  assert.equal(priorEnteringYear(termed, rec), 2);
  assert.equal(keeperEnteringYear(termed, rec), 2);
});

test('an un-anchored record reads exactly as it did before, per convention', () => {
  assert.equal(priorEnteringYear(termed, { contractYear: 1 }), 2, 'priorKeepers: years served + 1');
  assert.equal(keeperEnteringYear(termed, { contractYear: 1 }), 1, 'keepers: already the entering year');
  assert.equal(priorEnteringYear(termed, {}), 1, 'no counter reads as entering Y1');
  assert.equal(keeperEnteringYear(termed, {}), 1);
});

test('an unreadable anchor falls back rather than stranding the contract', () => {
  assert.equal(priorEnteringYear(termed, { startSeason: 'garbage', contractYear: 1 }), 2);
});

test('anchorFor proposes the season a contract started', () => {
  assert.equal(anchorFor(termed, { contractYear: 2 }, BASIS_SERVED), '2024-25', 'entering Y3 → started 2 seasons ago');
  assert.equal(anchorFor(termed, { contractYear: 1 }, BASIS_ENTERING), '2026-27', 'a keeper entering Y1 started this season');
});

// ── Archived contracts ──────────────────────────────────────────────────────
section('expired contracts are preserved');

test('archiving keeps every term number untouched', () => {
  const rec = archiveContract({ player: 'A', contractYear: 2, contractLength: 3, keptFor: 40 }, '2026-27');
  assert.equal(rec.contractStatus, CONTRACT_EXPIRED);
  assert.equal(rec.expiredAfterSeason, '2026-27');
  assert.equal(rec.contractYear, 2, 'the numbers stay as they were on the day it ended');
  assert.equal(rec.keptFor, 40, 'last season\'s price survives — it used to be deleted with the row');
  assert.equal(isArchivedContract(rec), true);
});

test('an archived record also carries the legacy expired flag', () => {
  // Deliberate redundancy: a reader that has never heard of contractStatus
  // must not print a dead contract as live. Degrade to "expired", not to "on
  // contract". Same failure-asymmetry rule as the price fields.
  assert.equal(archiveContract({ player: 'A' }, '2026-27').expired, true);
});

test('an ordinary record is not archived', () => {
  assert.equal(isArchivedContract({ player: 'A', contractYear: 1 }), false);
  assert.equal(isArchivedContract({ player: 'A', expired: true }), false, 'the legacy in-place expired flag is a different thing');
  assert.equal(isArchivedContract(null), false);
});

// ── The keeper deadline as an event ─────────────────────────────────────────
section('unkept at the deadline voids the contract');

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

test('the deadline moment matches the shared page countdown', () => {
  const l = { keeperDeadline: '2026-09-15', keeperDeadlineTime: '18:30' };
  assert.equal(deadlineMoment(l), new Date('2026-09-15T18:30:59').getTime());
  assert.equal(deadlineMoment({ keeperDeadline: '2026-09-15' }), new Date('2026-09-15T23:59:59').getTime(),
    'date-only data means 11:59 PM, as it always has');
  assert.equal(deadlineMoment({}), null, 'no deadline set is null, never "passed"');
});

test('a league with no deadline never locks and never voids', () => {
  assert.equal(isDeadlinePassed({}), false);
  assert.equal(voidingActive({ termModel: 'fixed', termYears: 3 }), false);
});

test('voiding needs a fixed term — dollars-only leagues have no contract to void', () => {
  const past = { keeperDeadline: iso(Date.now() - DAY) };
  assert.equal(voidingActive({ ...past, keeperCostModel: 'auction', termModel: 'none' }), false);
  assert.equal(voidingActive({ ...past, termModel: 'fixed', termYears: 3 }), true);
});

test('a player kept by ANY team keeps his contract', () => {
  const l = {
    termModel: 'fixed', termYears: 3, keeperDeadline: iso(Date.now() - DAY),
    teams: [
      { id: 'a', name: 'Alpha', keepers: [{ player: 'Jack Hughes' }] },
      { id: 'b', name: 'Beta', keepers: [] },
    ],
  };
  assert.deepEqual([...declaredKeeperNames(l)], ['jackhughes']);
  assert.equal(isContractVoided(l, 'Jack Hughes'), false, 'declared on Alpha — safe even when read from Beta');
  assert.equal(isContractVoided(l, 'Nico Hischier'), true, 'nobody kept him, deadline passed → void');
});

test('before the deadline nothing is void', () => {
  const l = {
    termModel: 'fixed', termYears: 3, keeperDeadline: iso(Date.now() + 5 * DAY),
    teams: [{ id: 'a', name: 'Alpha', keepers: [] }],
  };
  assert.equal(isContractVoided(l, 'Nico Hischier'), false);
});

// ── The pool, end to end ────────────────────────────────────────────────────
section('the pool reads both rules');

const poolLeague = (over) => ({
  season: '2026-27', termModel: 'fixed', termYears: 3, keeperCostModel: 'auction',
  auctionRules: { costIncreasePerYear: 5, undraftedStartCost: 5 },
  teams: [{
    id: 'a', name: 'Alpha',
    roster: [{ player: 'Jack Hughes', pos: 'C' }, { player: 'Nico Hischier', pos: 'C' }],
    priorKeepers: [
      { player: 'Jack Hughes', startSeason: '2025-26', contractYear: 99, contractLength: 3, keptFor: 40 },
      { player: 'Nico Hischier', contractYear: 0, contractLength: 3, keptFor: 30 },
    ],
    keepers: [],
  }],
  ...over,
});

test('the pool reads the anchor, not the drifted counter', () => {
  const pool = buildTeamPool(poolLeague(), poolLeague().teams[0]);
  const hughes = pool.onContract.find(e => e.player === 'Jack Hughes');
  assert.equal(hughes.nextYear, 2, 'anchored to 2025-26 in a 2026-27 season → entering Y2');
  assert.equal(hughes.final, false, 'a counter of 99 would have read as long expired');
  assert.equal(hughes.startSeason, '2025-26', 'the anchor rides into the pool entry for makeKeeper');
});

test('an un-anchored record still gets a proposed anchor in its pool entry', () => {
  const pool = buildTeamPool(poolLeague(), poolLeague().teams[0]);
  const nico = pool.onContract.find(e => e.player === 'Nico Hischier');
  assert.equal(nico.nextYear, 1);
  assert.equal(nico.startSeason, '2026-27', 'derived, so keeping him does not lose the year');
});

test('archived records are invisible to the pool — preserving them shows nobody a new row', () => {
  const l = poolLeague();
  l.teams[0].priorKeepers[0] = archiveContract(l.teams[0].priorKeepers[0], '2025-26');
  const pool = buildTeamPool(l, l.teams[0]);
  assert.equal(pool.onContract.find(e => e.player === 'Jack Hughes'), undefined, 'not on contract');
  assert.equal(pool.expired.find(e => e.player === 'Jack Hughes'), undefined, 'and not in the expired group either');
  assert.equal(pool.rosteredNoContract.some(e => e.player === 'Jack Hughes'), true,
    'he is simply a rostered player with no contract — exactly what deleting the record used to produce');
});

test('past the deadline an undeclared contract is void, and only the TERM is voided', () => {
  const l = poolLeague({ keeperDeadline: iso(Date.now() - DAY) });
  const pool = buildTeamPool(l, l.teams[0]);
  assert.equal(pool.onContract.length, 0, 'nobody was declared, so no contract survives the deadline');
  const hughes = pool.rosteredNoContract.find(e => e.player === 'Jack Hughes');
  assert.equal(hughes.contractVoided, true);
  assert.equal(hughes.nextYear, undefined, 'the term is gone');
  assert.equal(hughes.nextCost, 45, 'the dollars are NOT reset — a void contract is not a repricing');
});

test('a declared keeper is untouched by the deadline', () => {
  const l = poolLeague({ keeperDeadline: iso(Date.now() - DAY) });
  l.teams[0].keepers = [{ player: 'Jack Hughes', contractYear: 2, contractLength: 3, keptFor: 45 }];
  const pool = buildTeamPool(l, l.teams[0]);
  assert.equal(pool.onContract.find(e => e.player === 'Jack Hughes')?.nextYear, 2);
});

test('voiding is DERIVED — moving the deadline restores the prior state exactly', () => {
  const past = poolLeague({ keeperDeadline: iso(Date.now() - DAY) });
  const future = poolLeague({ keeperDeadline: iso(Date.now() + 30 * DAY) });
  assert.equal(buildTeamPool(past, past.teams[0]).onContract.length, 0);
  const restored = buildTeamPool(future, future.teams[0]);
  assert.equal(restored.onContract.length, 2, 'both contracts are back');
  assert.deepEqual(
    JSON.parse(JSON.stringify(past.teams[0].priorKeepers)),
    JSON.parse(JSON.stringify(future.teams[0].priorKeepers)),
    'and no record was mutated along the way',
  );
});

// ── The backfill ────────────────────────────────────────────────────────────
section('backfill: dry run');

const hockey = {
  id: 'hockey-1', name: 'The League', sport: 'hockey', season: '2026-27',
  keeperCostModel: 'slot', termModel: 'fixed', termYears: 3,
  teams: [{
    id: 'a', name: 'Alpha', roster: [], keepers: [{ player: 'Kept Guy', contractYear: 2, contractLength: 3 }],
    priorKeepers: [
      { player: 'Year One', contractYear: 0, contractLength: 3 },
      { player: 'Year Three', contractYear: 2, contractLength: 3 },
      { player: 'Already', contractYear: 1, contractLength: 3, startSeason: '2025-26' },
      { player: 'Impossible', contractYear: 9, contractLength: 3 },
      archiveContract({ player: 'Long Gone', contractYear: 2, contractLength: 3 }, '2024-25'),
    ],
  }],
};
const auctionNoTerm = {
  id: 'basketball-1', name: 'Hoops', sport: 'basketball', season: '2026-27',
  keeperCostModel: 'auction', termModel: 'none',
  teams: [{ id: 'x', name: 'X', keepers: [{ player: 'Someone', keptFor: 40 }], priorKeepers: [{ player: 'Other', keptFor: 12 }] }],
};

test('a term-less league is skipped with a reason, and contributes no records', () => {
  const plan = planBackfill(auctionNoTerm);
  assert.equal(plan.termed, false);
  assert.match(plan.skipped, /No fixed term/);
  assert.equal(plan.records.length, 0);
  assert.equal(plan.counts.toSet, 0);
});

test('the anchor proposed is current season minus years already served', () => {
  const plan = planBackfill(hockey);
  const by = (p) => plan.records.find(r => r.player === p);
  assert.equal(by('Year One').proposedStartSeason, '2026-27', 'entering Y1 → started this season');
  assert.equal(by('Year Three').proposedStartSeason, '2024-25', 'entering Y3 → started two seasons ago');
  assert.equal(by('Kept Guy').proposedStartSeason, '2025-26', 'a keeper\'s counter is the entering year, not years served');
  assert.equal(by('Kept Guy').array, 'keepers');
});

test('an already-anchored record is reported, not rewritten', () => {
  const plan = planBackfill(hockey);
  const rec = plan.records.find(r => r.player === 'Already');
  assert.equal(rec.action, 'anchored');
  assert.equal(rec.flag, null, 'its anchor agrees with its counter, so there is nothing to say');
});

test('an impossible contract year is FLAGGED, never guessed', () => {
  const plan = planBackfill(hockey);
  const rec = plan.records.find(r => r.player === 'Impossible');
  assert.equal(rec.action, 'flag');
  assert.equal(rec.proposedStartSeason, null, 'no value is proposed at all');
  assert.match(rec.flag, /already over, or the stored year is wrong/);
  assert.equal(rec.currentStartSeason, null);
});

test('an unreadable league season flags every record instead of anchoring them', () => {
  const plan = planBackfill({ ...hockey, season: 'next year' });
  assert.equal(plan.counts.toSet, 0);
  assert.equal(plan.counts.flagged, plan.counts.total);
  assert.match(plan.records[0].flag, /not a year I can read/);
});

test('a closed contract is skipped — it needs no clock', () => {
  const plan = planBackfill(hockey);
  assert.equal(plan.counts.archived, 1);
  assert.equal(plan.records.some(r => r.player === 'Long Gone'), false);
});

test('an anchor that contradicts its counter is left alone and flagged for a human', () => {
  const l = JSON.parse(JSON.stringify(hockey));
  l.teams[0].priorKeepers[2].startSeason = '2024-25'; // anchor says Y3, counter says Y2
  const rec = planBackfill(l).records.find(r => r.player === 'Already');
  assert.equal(rec.action, 'flag');
  assert.match(rec.flag, /only you know which is right/);
});

test('the all-leagues report counts the untouched leagues explicitly', () => {
  const { totals } = planBackfillAll([hockey, auctionNoTerm]);
  assert.equal(totals.leagues, 2);
  assert.equal(totals.termedLeagues, 1);
  assert.equal(totals.untouchedLeagues, 1, 'the dry run states that the term-less league is untouched');
  assert.equal(totals.toSet, 3);
  assert.equal(totals.flagged, 1);
});

section('backfill: apply');

test('apply writes ONLY the rows the plan marked set, and logs each one', () => {
  const plan = planBackfill(hockey);
  const { league: next, changes, written } = applyBackfill(hockey, plan);
  assert.equal(written, 3);
  assert.equal(changes.length, 3);
  assert.equal(changes.every(c => c.kind === 'term' && c.field === 'startSeason' && c.from === null), true);

  const priors = next.teams[0].priorKeepers;
  assert.equal(priors.find(p => p.player === 'Year Three').startSeason, '2024-25');
  assert.equal(priors.find(p => p.player === 'Impossible').startSeason, undefined, 'the flagged row is untouched');
  assert.equal(priors.find(p => p.player === 'Already').startSeason, '2025-26', 'unchanged');
  assert.equal(next.teams[0].keepers[0].startSeason, '2025-26');
});

test('apply changes nothing else on a record', () => {
  const { league: next } = applyBackfill(hockey, planBackfill(hockey));
  const before = hockey.teams[0].priorKeepers.find(p => p.player === 'Year Three');
  const after = next.teams[0].priorKeepers.find(p => p.player === 'Year Three');
  assert.deepEqual({ ...after, startSeason: undefined }, { ...before, startSeason: undefined });
  assert.equal(after.contractYear, 2, 'the counter stays, so an un-migrated reader is unaffected');
});

test('apply is a no-op on a term-less league', () => {
  const plan = planBackfill(auctionNoTerm);
  const { league: next, written } = applyBackfill(auctionNoTerm, plan);
  assert.equal(written, 0);
  assert.equal(next, auctionNoTerm, 'the same object back — nothing was rebuilt');
});

test('re-running the backfill after applying finds nothing left to do', () => {
  const { league: next } = applyBackfill(hockey, planBackfill(hockey));
  const again = planBackfill(next);
  assert.equal(again.counts.toSet, 0);
  assert.equal(again.counts.anchored, 4);
});

test('apply refuses a row whose player changed since the dry run', () => {
  // The plan addresses rows by index. If the league moved on between the
  // preview and the apply, anchoring the wrong player's contract would be
  // silent and wrong — so the name is checked.
  const plan = planBackfill(hockey);
  const moved = JSON.parse(JSON.stringify(hockey));
  moved.teams[0].priorKeepers[1] = { player: 'Someone Else', contractYear: 0, contractLength: 3 };
  const { written, league: next } = applyBackfill(moved, plan);
  assert.equal(next.teams[0].priorKeepers[1].startSeason, undefined, 'the replaced row is skipped');
  assert.equal(written, 2);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.log('SOME TESTS FAILED');
