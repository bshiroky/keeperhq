// Draft-order engine tests — `npm run test:draft-order` (plain node).
//
// Standings in, draft board out. The claims under test: the base order sorts
// on the CONFIGURED basis (points by default — Yahoo's Rank reflects
// playoffs); ties are never sorted silently; the lottery reorders only the
// worst N; snake reverses even rounds; overall numbers and pick ownership
// line up with the Picks grid.
import assert from 'node:assert/strict';
import {
  draftOrderConfigOf, rankStandings, baseDraftOrder, lotteryEligible, lotteryDrawOf,
  round1Order, buildDraftBoard, resolveTie, tieKey,
  BASIS_POINTS, BASIS_RANK, TIEBREAK_MANUAL, TIEBREAK_RECORD, TIEBREAK_PCT,
} from '../src/lib/draftOrder.js';
import { reassignPick } from '../src/lib/draftPicks.js';
import { parseStandingsText } from '../src/lib/standingsParse.js';
import { REAL_PASTE } from './test-standings-parser.mjs';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// The real league: 12 teams, ids in a fixed order, standings from the real paste.
const NAMES = [
  'Da Real Dynasty', 'ХК опівнічник', 'the grit grinders', "Oscar Meier's Wiener", 'My Cozen Finnie',
  'Young Berube', 'The Zamboni Driver!', "Ain't No Hellebuyck Girl", 'Treliving it Up',
  '🚨 The Trade Show 🚨', 'HAULA IF YOU HEAR ME!', 'Stop F***ing Crying Bro',
];
const teams = NAMES.map((name, i) => ({ id: `t${i + 1}`, name, roster: [], priorKeepers: [], keepers: [] }));
const idOf = name => teams.find(t => t.name === name).id;
const nameOf = id => teams.find(t => t.id === id).name;
const parsed = parseStandingsText(REAL_PASTE);
const rows = parsed.rows.map(r => ({ ...r, teamId: idOf(r.team), team: undefined }));
const base = { id: 'hockey-1', draftType: 'snake', teams, standings: { rows } };
const DYNASTY = idOf('Da Real Dynasty'), FINNIE = idOf('My Cozen Finnie');

test('config: defaults are points / 4 / manual', () => {
  assert.deepEqual(draftOrderConfigOf({}), { basis: BASIS_POINTS, lotteryTeams: 4, tiebreak: TIEBREAK_MANUAL });
});
test('config: legacy bottomLotteryTeams is honoured, explicit config wins', () => {
  assert.equal(draftOrderConfigOf({ bottomLotteryTeams: 6 }).lotteryTeams, 6);
  assert.equal(draftOrderConfigOf({ bottomLotteryTeams: 6, draftOrderConfig: { lotteryTeams: 0 } }).lotteryTeams, 0);
  assert.equal(draftOrderConfigOf({ draftOrderConfig: { basis: 'rank', tiebreak: 'pct' } }).basis, BASIS_RANK);
  assert.equal(draftOrderConfigOf({ draftOrderConfig: { tiebreak: 'nonsense' } }).tiebreak, TIEBREAK_MANUAL);
});

test('no standings: not ok, reason named, nothing eligible', () => {
  const r = rankStandings({ teams });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-standings');
  assert.deepEqual(lotteryEligible({ teams }), []);
});

test('incomplete standings: a team with no row blocks the order and is named', () => {
  const r = rankStandings({ ...base, standings: { rows: rows.slice(1) } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'incomplete');
  assert.deepEqual(r.missing, [DYNASTY]);
});

test('points basis: worst first by Pts, and the order is NOT rank order', () => {
  const r = baseDraftOrder(base);
  const orderNames = r.order.map(e => nameOf(e.teamId));
  // Worst 7 and best 3 by points are unambiguous; the 315 tie sits at slots 8/9.
  assert.deepEqual(orderNames.slice(0, 7), [
    'Stop F***ing Crying Bro', 'HAULA IF YOU HEAR ME!', '🚨 The Trade Show 🚨', 'Treliving it Up',
    "Ain't No Hellebuyck Girl", 'Young Berube', 'The Zamboni Driver!',
  ]);
  assert.deepEqual(orderNames.slice(9), ["Oscar Meier's Wiener", 'ХК опівнічник', 'the grit grinders']);
  // Da Real Dynasty is *1 by rank but 4th/5th of 12 by points: slot 8 or 9,
  // never slot 12 (which is where rank order would put it).
  const dyn = r.order.find(e => e.teamId === DYNASTY);
  assert.ok(dyn.slot === 8 || dyn.slot === 9, `Dynasty slot ${dyn.slot}`);
  assert.equal(r.order[11].teamId, idOf('the grit grinders'), 'the points leader picks last');
});

test('the 315-point tie is reported, not sorted silently', () => {
  const r = rankStandings(base);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unresolved-ties');
  assert.equal(r.unresolvedTies.length, 1);
  assert.equal(r.unresolvedTies[0].key, tieKey([DYNASTY, FINNIE]));
  assert.deepEqual([...r.unresolvedTies[0].teams].sort(), [DYNASTY, FINNIE].sort());
});

test('W-L-T and Pct tiebreaks cannot break an identical-on-every-column tie', () => {
  for (const tiebreak of [TIEBREAK_RECORD, TIEBREAK_PCT]) {
    const r = rankStandings({ ...base, draftOrderConfig: { tiebreak } });
    assert.equal(r.ok, false, tiebreak);
    assert.equal(r.unresolvedTies.length, 1, tiebreak);
  }
});

test('a W-L-T tiebreak DOES break a points tie with different records', () => {
  const alt = rows.map(r => (r.teamId === DYNASTY ? { ...r, wins: 146, losses: 121 } : r));
  const r = rankStandings({ ...base, standings: { rows: alt }, draftOrderConfig: { tiebreak: TIEBREAK_RECORD } });
  assert.equal(r.ok, true);
  const fin = r.finish.map(x => x.teamId);
  assert.ok(fin.indexOf(DYNASTY) < fin.indexOf(FINNIE), 'more wins finishes higher');
  assert.equal(r.ties.length, 0, 'a broken tie is not reported as a tie');
});

test('rank basis: Yahoo order, no tie', () => {
  const r = baseDraftOrder({ ...base, draftOrderConfig: { basis: BASIS_RANK } });
  assert.equal(r.ok, true);
  assert.equal(r.order[0].teamId, idOf('Stop F***ing Crying Bro'));
  assert.equal(r.order[11].teamId, DYNASTY);
  assert.equal(r.order[11].finish, 1);
});

test('manual resolution: recorded best-first, applied, keyed by the set', () => {
  const league = resolveTie(base, [FINNIE, DYNASTY]);   // Finnie finishes higher
  const r = rankStandings(league);
  assert.equal(r.ok, true);
  const fin = r.finish.map(x => x.teamId);
  assert.ok(fin.indexOf(FINNIE) < fin.indexOf(DYNASTY));
  assert.equal(r.ties[0].resolved, true);
  // Worst-first: Dynasty (lower finish) picks BEFORE Finnie.
  const o = baseDraftOrder(league).order;
  assert.equal(o.find(e => e.teamId === DYNASTY).slot, 8);
  assert.equal(o.find(e => e.teamId === FINNIE).slot, 9);
  // The other orientation is the other order.
  const o2 = baseDraftOrder(resolveTie(base, [DYNASTY, FINNIE])).order;
  assert.equal(o2.find(e => e.teamId === FINNIE).slot, 8);
});

test('resolveTie ignores a malformed order', () => {
  assert.equal(resolveTie(base, [DYNASTY]), base);
  assert.equal(resolveTie(base, [DYNASTY, DYNASTY]), base);
  assert.equal(resolveTie({ teams }, [DYNASTY, FINNIE]).standings, undefined, 'nothing to resolve against');
});

test('a resolution that does not match the tied set is ignored (stale key)', () => {
  const league = { ...base, standings: { rows, tieResolutions: { [tieKey([DYNASTY, 't3'])]: [DYNASTY, 't3'] } } };
  assert.equal(rankStandings(league).ok, false);
});

const resolved = resolveTie(base, [FINNIE, DYNASTY]);

test('lottery: the worst 4 by points are eligible', () => {
  assert.deepEqual(lotteryEligible(resolved).map(nameOf), [
    'Stop F***ing Crying Bro', 'HAULA IF YOU HEAR ME!', '🚨 The Trade Show 🚨', 'Treliving it Up',
  ]);
  assert.deepEqual(lotteryEligible({ ...resolved, draftOrderConfig: { lotteryTeams: 0 } }), []);
});

test('round 1 before the draw: lottery slots pending, the rest fixed', () => {
  const r = round1Order(resolved);
  assert.equal(r.ok, true);
  assert.equal(r.complete, false);
  assert.equal(r.reason, 'lottery-pending');
  assert.deepEqual(r.slots.slice(0, 4).map(s => [s.slot, s.originalTeamId, s.pending, s.lottery]), [[1, null, true, true], [2, null, true, true], [3, null, true, true], [4, null, true, true]]);
  assert.equal(r.slots[4].originalTeamId, idOf("Ain't No Hellebuyck Girl"));
  assert.equal(r.slots[11].originalTeamId, idOf('the grit grinders'));
});

// A draw: Treliving wins, then Stop, HAULA, Trade Show.
const DRAW = ['Treliving it Up', 'Stop F***ing Crying Bro', 'HAULA IF YOU HEAR ME!', '🚨 The Trade Show 🚨'].map(idOf);
const drawn = { ...resolved, lotteryDraw: { at: '2026-09-01T00:00:00Z', order: DRAW } };

test('a valid draw fixes picks 1–4; 5–12 stay reverse standings', () => {
  const r = round1Order(drawn);
  assert.equal(r.complete, true);
  assert.deepEqual(r.slots.map(s => nameOf(s.originalTeamId)), [
    'Treliving it Up', 'Stop F***ing Crying Bro', 'HAULA IF YOU HEAR ME!', '🚨 The Trade Show 🚨',
    "Ain't No Hellebuyck Girl", 'Young Berube', 'The Zamboni Driver!', 'Da Real Dynasty', 'My Cozen Finnie',
    "Oscar Meier's Wiener", 'ХК опівнічник', 'the grit grinders',
  ]);
  assert.equal(r.slots[0].finish, 9, 'the seed shown is the standings finish');
});

test('a draw whose teams no longer match the eligible set is stale and not applied', () => {
  const r = round1Order({ ...drawn, draftOrderConfig: { lotteryTeams: 3 } });
  assert.equal(r.complete, false);
  assert.equal(r.reason, 'stale-lottery');
  assert.equal(lotteryDrawOf({ ...drawn, draftOrderConfig: { lotteryTeams: 3 } }).stale, true);
  assert.equal(lotteryDrawOf(drawn).stale, false);
});

test('legacy lotteryResults (names) is read as the draw when no lotteryDraw exists', () => {
  const legacy = {
    ...resolved,
    lotteryResults: [
      { pick: 1, owner: 'Treliving it Up', original: 'Treliving it Up', lottery: true },
      { pick: 2, owner: 'Stop F***ing Crying Bro', original: 'Stop F***ing Crying Bro', lottery: true },
      { pick: 3, owner: 'HAULA IF YOU HEAR ME!', original: 'HAULA IF YOU HEAR ME!', lottery: true },
      { pick: 4, owner: '🚨 The Trade Show 🚨', original: '🚨 The Trade Show 🚨', lottery: true },
      { pick: 5, owner: "Ain't No Hellebuyck Girl", original: "Ain't No Hellebuyck Girl", lottery: false },
    ],
  };
  assert.deepEqual(lotteryDrawOf(legacy).order, DRAW);
});

test('board: snake — odd rounds repeat round 1, even rounds reverse it; overall = (round−1)×12 + slot', () => {
  const league = { ...drawn, draftPicks: { rounds: 3, ownership: {} } };
  const b = buildDraftBoard(league);
  assert.equal(b.ok, true);
  assert.equal(b.complete, true);
  assert.equal(b.rounds, 3);
  assert.equal(b.picks.length, 36);
  const r1 = b.picks.filter(p => p.round === 1).map(p => p.originalTeamId);
  const r2 = b.picks.filter(p => p.round === 2).map(p => p.originalTeamId);
  const r3 = b.picks.filter(p => p.round === 3).map(p => p.originalTeamId);
  assert.deepEqual(r2, [...r1].reverse());
  assert.deepEqual(r3, r1);
  assert.equal(b.picks.find(p => p.round === 2 && p.slot === 1).overall, 13);
  assert.equal(b.picks.find(p => p.round === 3 && p.slot === 12).overall, 36);
  assert.equal(b.picks.find(p => p.overall === 12).originalTeamId, idOf('the grit grinders'));
  assert.equal(b.picks.find(p => p.overall === 13).originalTeamId, idOf('the grit grinders'), 'the turn');
});

test('board: a traded pick shows the original AND the current owner', () => {
  // "pick 37 belongs to Amar via Pedram": round 4 is even, so slot 1 is the
  // slot-12 team's (the grit grinders') pick — here traded to Treliving.
  let league = { ...drawn, draftPicks: { rounds: 4, ownership: {} } };
  league = reassignPick(league, 4, idOf('the grit grinders'), idOf('Treliving it Up'));
  const b = buildDraftBoard(league);
  const p37 = b.picks.find(p => p.overall === 37);
  assert.equal(p37.round, 4);
  assert.equal(p37.slot, 1);
  assert.equal(nameOf(p37.originalTeamId), 'the grit grinders');
  assert.equal(nameOf(p37.ownerTeamId), 'Treliving it Up');
  assert.equal(p37.traded, true);
  assert.equal(b.picks.filter(p => p.traded).length, 1);
});

test('board: round-1 pick trades recorded on the Lottery/Picks page apply to the drawn slot', () => {
  let league = { ...drawn, draftPicks: { rounds: 1, ownership: {} } };
  league = reassignPick(league, 1, idOf('Stop F***ing Crying Bro'), idOf('Young Berube'));
  const b = buildDraftBoard(league);
  const p2 = b.picks.find(p => p.overall === 2);
  assert.equal(nameOf(p2.originalTeamId), 'Stop F***ing Crying Bro');
  assert.equal(nameOf(p2.ownerTeamId), 'Young Berube');
});

test('board: pending lottery still lists every pick, with lottery slots unowned', () => {
  const b = buildDraftBoard({ ...resolved, draftPicks: { rounds: 2, ownership: {} } });
  assert.equal(b.ok, true);
  assert.equal(b.complete, false);
  assert.equal(b.reason, 'lottery-pending');
  assert.equal(b.picks.length, 24);
  assert.equal(b.picks.filter(p => p.pending).length, 8, 'four pending slots in each of two rounds');
  assert.equal(b.picks.find(p => p.overall === 24).pending, true, 'round 2 ends on the slot-1 team');
  assert.equal(b.picks.find(p => p.overall === 13).originalTeamId, idOf('the grit grinders'));
});

test('board: no lottery (0 teams) is complete straight from the standings', () => {
  const b = buildDraftBoard({ ...resolved, draftOrderConfig: { lotteryTeams: 0 }, draftPicks: { rounds: 1, ownership: {} } });
  assert.equal(b.complete, true);
  assert.equal(nameOf(b.picks[0].originalTeamId), 'Stop F***ing Crying Bro');
});

test('board: unresolved tie blocks it and names the tie', () => {
  const b = buildDraftBoard({ ...base, draftPicks: { rounds: 2, ownership: {} } });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'unresolved-ties');
  assert.equal(b.unresolvedTies.length, 1);
  assert.deepEqual(b.picks, []);
  assert.equal(b.lotteryEligible.length, 0, 'no eligibility claim while the order is unknown');
});

test('board: an auction league has no snake board', () => {
  const b = buildDraftBoard({ ...drawn, draftType: 'auction' });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'not-snake');
});

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
