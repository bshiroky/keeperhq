// Contract year set directly on a pool row — `npm run test:contracts` (plain
// node). The claim: recording where a player is in his deal is a FACT from
// last season, separate from this season's keep decision, so it lands on the
// prior-keeper record (where the pool reads it) and never declares a keeper.
import assert from 'node:assert/strict';
import { setContractYear, contractYearOptions, CONTRACT_LENGTH_OPTIONS } from '../src/lib/contractYear.js';

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

test('options: Y1..Ylen, lengths 1..5', () => {
  assert.deepEqual(contractYearOptions(3), [1, 2, 3]);
  assert.deepEqual(contractYearOptions(0), [1]);
  assert.deepEqual(CONTRACT_LENGTH_OPTIONS, [1, 2, 3, 4, 5]);
});

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
