// Contract year set directly on a pool row — `npm run test:contracts` (plain
// node). The claim: recording where a player is in his deal is a FACT from
// last season, separate from this season's keep decision, so it lands on the
// prior-keeper record (where the pool reads it) and never declares a keeper.
import assert from 'node:assert/strict';
import { setContractYear, clearContractOnUnkeep, contractYearOptions, CONTRACT_LENGTH_OPTIONS, EXPIRED } from '../src/lib/contractYear.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

const league = {
  termModel: 'fixed', termYears: 3,
  teams: [
    { id: 'a', name: 'Alpha', roster: [{ player: 'Jack Hughes', pos: 'C' }, { player: 'Nico Hischier', pos: 'C' }], priorKeepers: [], keepers: [] },
    // Beta drafted Hughes last year; Alpha rosters him now (traded).
    { id: 'b', name: 'Beta', roster: [{ player: 'Jesper Bratt' }], priorKeepers: [{ player: 'Jack Hughes', contractYear: 0, contractLength: 3, keptFor: 40 }], keepers: [] },
  ],
};

test('a rostered player with no record gets one on his team, stored as years served', () => {
  const { league: next, changes } = setContractYear(league, 'a', 'Nico Hischier', { year: 2, length: 3 });
  const rec = next.teams[0].priorKeepers.find(p => p.player === 'Nico Hischier');
  assert.deepEqual(rec, { player: 'Nico Hischier', contractYear: 1, contractLength: 3, pos: 'C' }, 'entering Y2 = 1 served; position from the roster');
  assert.equal(next.teams[0].keepers.length, 0, 'nothing declared');
  assert.deepEqual(changes.map(c => [c.kind, c.field, c.from, c.to]), [['term', 'contractYear', 1, 2], ['term', 'contractLength', null, 3]]);
  assert.equal(changes[0].teamName, 'Alpha');
});

test('an existing record is patched where it lives — the price stays with it', () => {
  const { league: next } = setContractYear(league, 'a', 'Jack Hughes', { year: 3, length: 3 });
  assert.equal(next.teams[0].priorKeepers.length, 0, 'no duplicate record on the roster team');
  const rec = next.teams[1].priorKeepers[0];
  assert.equal(rec.contractYear, 2);
  assert.equal(rec.contractLength, 3);
  assert.equal(rec.keptFor, 40, 'the drafted price is untouched');
});

test('a declared keeper on the team is patched too, so slot and row agree', () => {
  const declared = { ...league, teams: league.teams.map(tm => tm.id === 'a' ? { ...tm, keepers: [{ player: 'Jack Hughes', contractYear: 1, contractLength: 3 }] } : tm) };
  const { league: next } = setContractYear(declared, 'a', 'Jack Hughes', { year: 2, length: 4 });
  assert.deepEqual(next.teams[0].keepers[0], { player: 'Jack Hughes', contractYear: 2, contractLength: 4 });
  assert.equal(next.teams[1].priorKeepers[0].contractYear, 1);
  assert.equal(next.teams[1].priorKeepers[0].contractLength, 4);
});

test('year is clamped to the length, and an expired flag is cleared by a live year', () => {
  const expired = { ...league, teams: league.teams.map(tm => tm.id === 'b' ? { ...tm, priorKeepers: [{ ...tm.priorKeepers[0], expired: true }] } : tm) };
  const { league: next } = setContractYear(expired, 'a', 'Jack Hughes', { year: 9, length: 3 });
  const rec = next.teams[1].priorKeepers[0];
  assert.equal(rec.contractYear, 2, 'Y9/3 reads as the final year, Y3/3');
  assert.equal('expired' in rec, false);
});

test('nothing to do returns the league unchanged', () => {
  const same = setContractYear(league, 'zzz', 'Jack Hughes', { year: 2, length: 3 });
  assert.equal(same.league, league);
  assert.deepEqual(same.changes, []);
  const noop = setContractYear(league, 'a', 'Jack Hughes', { year: 1, length: 3 });
  assert.deepEqual(noop.changes, [], 'setting the value already on file logs nothing');
});

test('EXPIRED is settable directly: flagged, every year served, logged, and reversible', () => {
  const { league: next, changes } = setContractYear(league, 'a', 'Nico Hischier', { year: EXPIRED, length: 3 });
  const rec = next.teams[0].priorKeepers.find(p => p.player === 'Nico Hischier');
  assert.equal(rec.expired, true);
  assert.equal(rec.contractYear, 3, 'all three years served — reads expired under either check');
  assert.equal(rec.contractLength, 3);
  assert.equal(changes[0].to, 'expired');
  // …and back to a live year clears it.
  const { league: revived, changes: back } = setContractYear(next, 'a', 'Nico Hischier', { year: 2, length: 3 });
  const rec2 = revived.teams[0].priorKeepers.find(p => p.player === 'Nico Hischier');
  assert.equal('expired' in rec2, false);
  assert.equal(rec2.contractYear, 1);
  assert.deepEqual([back[0].from, back[0].to], ['expired', 2]);
});

test('expiring a player never touches a keeper declaration', () => {
  const declared = { ...league, teams: league.teams.map(tm => tm.id === 'a' ? { ...tm, keepers: [{ player: 'Jack Hughes', contractYear: 2, contractLength: 3 }] } : tm) };
  const { league: next } = setContractYear(declared, 'a', 'Jack Hughes', { year: EXPIRED, length: 3 });
  assert.deepEqual(next.teams[0].keepers[0], { player: 'Jack Hughes', contractYear: 2, contractLength: 3 });
  assert.equal(next.teams[1].priorKeepers[0].expired, true);
});

test('Y1 at the default length on a no-record player is the no-contract state — no record is written', () => {
  const same = setContractYear(league, 'a', 'Nico Hischier', { year: 1, length: 3 });
  assert.equal(same.league, league, 'unchanged');
  assert.deepEqual(same.changes, []);
  // A non-default length is a fact the record has to hold.
  const { league: next } = setContractYear(league, 'a', 'Nico Hischier', { year: 1, length: 4 });
  assert.deepEqual(next.teams[0].priorKeepers.find(p => p.player === 'Nico Hischier'), { player: 'Nico Hischier', contractYear: 0, contractLength: 4, pos: 'C' });
});

// ── Unkeep ──────────────────────────────────────────────────────────────────
// Keep a no-contract player → Y1/3. Unkeep him → he must go back to
// "Rostered · no contract", not linger as an on-contract Y1/3 row.
const Y1_RECORD = { player: 'Nico Hischier', contractYear: 0, contractLength: 3, pos: 'C' };
const withY1 = { ...league, teams: league.teams.map(tm => tm.id === 'a'
  ? { ...tm, priorKeepers: [Y1_RECORD], keepers: [{ player: 'Nico Hischier', contractYear: 1, contractLength: 3 }] }
  : tm) };

test('unkeep at Y1 clears the contract state — the Y1 record goes, and it is logged', () => {
  const keeper = withY1.teams[0].keepers[0];
  const { league: next, changes } = clearContractOnUnkeep(withY1, 'a', keeper);
  assert.deepEqual(next.teams[0].priorKeepers, [], 'the record that only existed because of the keep is gone');
  assert.equal(next.teams[0].keepers.length, 1, 'the caller removes the declaration itself');
  assert.deepEqual(changes.map(c => [c.kind, c.field, c.player, c.from, c.to]), [['term', 'contractYear', 'Nico Hischier', 1, null]]);
});

test('unkeep at Y2+ leaves the contract alone — it predates the decision', () => {
  const y2 = { ...withY1, teams: withY1.teams.map(tm => tm.id === 'a'
    ? { ...tm, priorKeepers: [{ ...Y1_RECORD, contractYear: 1 }], keepers: [{ player: 'Nico Hischier', contractYear: 2, contractLength: 3 }] }
    : tm) };
  const same = clearContractOnUnkeep(y2, 'a', y2.teams[0].keepers[0]);
  assert.equal(same.league, y2);
  assert.deepEqual(same.changes, []);
  assert.equal(same.league.teams[0].priorKeepers[0].contractYear, 1, 'still entering Y2');
});

test('unkeep at Y1 never touches an imported record (price or round on it), nor a term-less league', () => {
  // Hughes: drafted by Beta with a price, entering Y1 — last season's fact.
  const declared = { ...league, teams: league.teams.map(tm => tm.id === 'a' ? { ...tm, keepers: [{ player: 'Jack Hughes', contractYear: 1, contractLength: 3 }] } : tm) };
  const same = clearContractOnUnkeep(declared, 'a', declared.teams[0].keepers[0]);
  assert.equal(same.league, declared);
  assert.deepEqual(declared.teams[1].priorKeepers[0], { player: 'Jack Hughes', contractYear: 0, contractLength: 3, keptFor: 40 });
  const rounded = { ...withY1, teams: withY1.teams.map(tm => tm.id === 'a' ? { ...tm, priorKeepers: [{ ...Y1_RECORD, acquisitionRound: 3 }] } : tm) };
  assert.equal(clearContractOnUnkeep(rounded, 'a', rounded.teams[0].keepers[0]).league, rounded, 'a draft-round record stays');
  const noTerm = { ...withY1, termModel: 'none', termYears: null };
  assert.equal(clearContractOnUnkeep(noTerm, 'a', noTerm.teams[0].keepers[0]).league, noTerm);
  assert.equal(clearContractOnUnkeep(withY1, 'a', null).league, withY1, 'no keeper, nothing to do');
});

test('options: Y1..Ylen, lengths 1..5', () => {
  assert.deepEqual(contractYearOptions(3), [1, 2, 3]);
  assert.deepEqual(contractYearOptions(0), [1]);
  assert.deepEqual(CONTRACT_LENGTH_OPTIONS, [1, 2, 3, 4, 5]);
});

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
