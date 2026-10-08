// Roster decides membership, draft decides price — `npm run test:membership`
// (plain node). Reproduces the "The new new" report: players removed from a
// roster by hand kept appearing in the Eligible Pool, because a draft record
// with no roster record fell back to the drafting team.
import assert from 'node:assert/strict';
import {
  buildTeamPool, buildStatusIndex, buildSharedRows, rosterImportImpact, rosterGuardLines,
  hasRosterOnFile, withRosterEdit, withRosterImport, recordedRemovals, handRemovalsByTeam, describeChange, changeLogOf,
} from '../.tmp-membership-bundle.mjs';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// Auction, no term, +$5/yr, $5 floor — the shape of the real league.
const base = (teams) => ({
  sport: 'basketball', draftType: 'auction', keeperCostModel: 'auction', termModel: 'none',
  auctionRules: { costIncreasePerYear: 5, undraftedStartCost: 5 }, season: '2026-27', keeperSlots: 4, teams,
});
const draft = (player, keptFor) => ({ player, keptFor });
const names = (list) => list.map(e => e.player);
const poolNames = (league, id) => {
  const p = buildTeamPool(league, league.teams.find(t => t.id === id));
  return names([...p.onContract, ...p.rosteredNoContract, ...p.expired]);
};
const sharedTeam = (league, player) => buildSharedRows(league).find(r => r.player === player)?.teamName;

// Ben drafted Hartenstein, Amar drafted Brunson; Brunson was traded to Ben.
const league = () => base([
  { id: 'ben', name: 'Ben Sh.', roster: [{ player: 'Isaiah Hartenstein' }, { player: 'Jalen Brunson' }], keepers: [],
    priorKeepers: [draft('Isaiah Hartenstein', 20)] },
  { id: 'amar', name: 'Amar', roster: [{ player: 'Nikola Jokic' }], keepers: [],
    priorKeepers: [draft('Jalen Brunson', 30), draft('Nikola Jokic', 60)] },
  { id: 'cory', name: 'Corey', roster: [{ player: 'Tyrese Maxey' }], keepers: [], priorKeepers: [draft('Tyrese Maxey', 15)] },
]);
const removeByHand = (lg, teamId, player) => withRosterEdit(lg, teamId, (r) => r.filter(p => p.player !== player), { removed: player });

test('drafted by A, rostered by B → B pool, A drafted price as cost basis, nowhere else', () => {
  const lg = league();
  assert.ok(poolNames(lg, 'ben').includes('Jalen Brunson'));
  assert.ok(!poolNames(lg, 'amar').includes('Jalen Brunson'));
  const e = buildTeamPool(lg, lg.teams[0]).onContract.find(x => x.player === 'Jalen Brunson');
  assert.equal(e.wasCost, 30); assert.equal(e.nextCost, 35);
  assert.equal(sharedTeam(lg, 'Jalen Brunson'), 'Ben Sh.');
  assert.equal(buildStatusIndex(lg).get('jalenbrunson').teamId, 'ben');
});

test('drafted by A, on NO roster (all rosters imported) → in nobody\'s pool', () => {
  const lg = league();
  lg.teams[1].priorKeepers.push(draft('Mike Conley', 8)); // dropped in the playoffs; nobody's roster has him
  for (const id of ['ben', 'amar', 'cory']) assert.ok(!poolNames(lg, id).includes('Mike Conley'), `${id} pool`);
  assert.equal(sharedTeam(lg, 'Mike Conley'), undefined, 'shared page');
  assert.notEqual(buildStatusIndex(lg).get('mikeconley')?.status, 'keeper', 'status index');
});

test('removed by hand from the roster → leaves that team\'s pool immediately', () => {
  const lg = removeByHand(league(), 'ben', 'Isaiah Hartenstein');
  assert.ok(!lg.teams[0].roster.some(p => p.player === 'Isaiah Hartenstein'), 'edit persisted');
  assert.ok(!poolNames(lg, 'ben').includes('Isaiah Hartenstein'), 'Eligible Pool → My roster');
  assert.equal(sharedTeam(lg, 'Isaiah Hartenstein'), undefined, 'shared page');
  assert.notEqual(buildStatusIndex(lg).get('isaiahhartenstein')?.status, 'keeper', 'status index');
});

test('mid-import: a team whose roster is NOT imported yet keeps its drafted players', () => {
  const lg = league();
  delete lg.teams[2].roster; // Corey not imported yet
  assert.equal(hasRosterOnFile(lg.teams[2]), false);
  assert.ok(poolNames(lg, 'cory').includes('Tyrese Maxey'));
  // ...but an imported team does not get to keep a draft-only player.
  lg.teams[1].priorKeepers.push(draft('Mike Conley', 8));
  assert.ok(!poolNames(lg, 'amar').includes('Mike Conley'));
});

test('no rosters imported at all → draft-only league behaves as before', () => {
  const lg = league(); lg.teams.forEach(t => delete t.roster);
  assert.ok(poolNames(lg, 'ben').includes('Isaiah Hartenstein'));
  assert.ok(poolNames(lg, 'amar').includes('Nikola Jokic'));
});

test('a roster emptied by hand is still "on file" (not mid-import)', () => {
  let lg = league();
  lg = removeByHand(lg, 'cory', 'Tyrese Maxey');
  assert.deepEqual(lg.teams[2].roster, []);
  assert.equal(hasRosterOnFile(lg.teams[2]), true);
  assert.ok(!poolNames(lg, 'cory').includes('Tyrese Maxey'));
  // A bare `roster: []` that no import/edit ever stamped is not evidence of anything.
  assert.equal(hasRosterOnFile({ id: 'x', roster: [] }), false);
});

test('re-import: a hand-removed player in the paste is named in the warning', () => {
  const lg = removeByHand(league(), 'ben', 'Isaiah Hartenstein');
  assert.deepEqual(recordedRemovals(lg.teams[0]), ['Isaiah Hartenstein']);
  const impact = rosterImportImpact(lg, 'ben', ['Isaiah Hartenstein', 'Jalen Brunson']);
  assert.deepEqual(impact.removedReturning, ['Isaiah Hartenstein']);
  assert.equal(impact.hasImpact, true);
  const text = rosterGuardLines(impact).map(l => l.text).join(' | ');
  assert.match(text, /Isaiah Hartenstein/); assert.match(text, /removed/i);
  // not in the paste → no removal warning
  assert.deepEqual(rosterImportImpact(lg, 'ben', ['Jalen Brunson']).removedReturning, []);
});

test('re-import applied: roster replaced, removal record cleared; re-adding by hand clears it too', () => {
  const lg = removeByHand(league(), 'ben', 'Isaiah Hartenstein');
  const after = withRosterImport(lg, 'ben', [{ player: 'Isaiah Hartenstein' }]);
  assert.deepEqual(recordedRemovals(after.teams[0]), []);
  assert.ok(poolNames(after, 'ben').includes('Isaiah Hartenstein'));
  const readded = withRosterEdit(lg, 'ben', r => [...r, { player: 'Isaiah Hartenstein' }], { added: 'Isaiah Hartenstein' });
  assert.deepEqual(recordedRemovals(readded.teams[0]), []);
});

test('the draft record survives a removal: remove, re-add, price and keep price are intact', () => {
  const lg = league();
  const draftBefore = JSON.stringify(lg.teams[0].priorKeepers);
  const gone = removeByHand(lg, 'ben', 'Isaiah Hartenstein');
  assert.equal(JSON.stringify(gone.teams[0].priorKeepers), draftBefore, 'draft records untouched by the removal');
  assert.ok(!poolNames(gone, 'ben').includes('Isaiah Hartenstein'), 'not keepable while removed');
  const back = withRosterEdit(gone, 'ben', r => [...r, { player: 'Isaiah Hartenstein' }], { added: 'Isaiah Hartenstein' });
  assert.equal(JSON.stringify(back.teams[0].priorKeepers), draftBefore, 'still untouched after re-adding');
  const e = buildTeamPool(back, back.teams[0]).onContract.find(x => x.player === 'Isaiah Hartenstein');
  assert.equal(e.wasCost, 20, 'drafted price is back');
  assert.equal(e.nextCost, 25, 'and the keep price derived from it ($20 + $5)');
  // re-added on a DIFFERENT team (he was traded): the price follows him
  const moved = withRosterEdit(gone, 'cory', r => [...r, { player: 'Isaiah Hartenstein' }], { added: 'Isaiah Hartenstein' });
  const m = buildTeamPool(moved, moved.teams[2]).onContract.find(x => x.player === 'Isaiah Hartenstein');
  assert.equal(m.nextCost, 25);
});

test('a hand-set drafted price survives a removal too (priceOf reads the value in force)', () => {
  const lg = league();
  lg.teams[0].priorKeepers[0] = { player: 'Isaiah Hartenstein', keptFor: 22, keptForComputed: 20, keptForOverridden: true };
  const back = withRosterEdit(removeByHand(lg, 'ben', 'Isaiah Hartenstein'), 'ben', r => [...r, { player: 'Isaiah Hartenstein' }], { added: 'Isaiah Hartenstein' });
  const e = buildTeamPool(back, back.teams[0]).onContract.find(x => x.player === 'Isaiah Hartenstein');
  assert.equal(e.nextCost, 27); assert.equal(e.wasCostOverridden, true);
});

test('change log: hand removals and additions are recorded (what, team, player, when)', () => {
  let lg = removeByHand(league(), 'ben', 'Isaiah Hartenstein');
  lg = removeByHand(lg, 'amar', 'Nikola Jokic');
  lg = withRosterEdit(lg, 'ben', r => [...r, { player: 'Isaiah Hartenstein' }], { added: 'Isaiah Hartenstein' });
  const log = changeLogOf(lg);
  assert.deepEqual(log.map(e => [e.kind, e.teamName, e.player]), [
    ['rosterAdd', 'Ben Sh.', 'Isaiah Hartenstein'],
    ['rosterRemove', 'Amar', 'Nikola Jokic'],
    ['rosterRemove', 'Ben Sh.', 'Isaiah Hartenstein'],
  ], 'newest first');
  assert.ok(log.every(e => Date.parse(e.at) > 0), 'timestamped');
  assert.match(describeChange(log[1]).action, /removed from roster/);
  assert.equal(describeChange(log[1]).where, 'Amar');
  // no-ops leave no entry
  const noop = removeByHand(lg, 'ben', 'Someone Not There');
  assert.equal(changeLogOf(noop).length, 3);
});

test('standing roll-up: who is off a roster by hand right now, per team', () => {
  let lg = removeByHand(league(), 'ben', 'Isaiah Hartenstein');
  lg = removeByHand(lg, 'amar', 'Nikola Jokic');
  assert.deepEqual(handRemovalsByTeam(lg).map(t => [t.teamName, t.players]), [['Ben Sh.', ['Isaiah Hartenstein']], ['Amar', ['Nikola Jokic']]]);
  const re = withRosterImport(lg, 'ben', [{ player: 'Jalen Brunson' }]);
  assert.deepEqual(handRemovalsByTeam(re).map(t => t.teamName), ['Amar'], 'a re-import supersedes that team\'s removals');
});

console.log(`${passed} passed`);
