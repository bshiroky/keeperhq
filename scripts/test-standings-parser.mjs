// Unit tests for src/lib/standingsParse.js — `npm run test:parser` (plain node).
// The main fixture is the user's real hockey standings paste, verbatim.
import assert from 'node:assert/strict';
import { parseStandingsText, STANDINGS_PASTE_ERRORS } from '../src/lib/standingsParse.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

export const REAL_PASTE = `Rank\tTeam\tW-L-T\tPct\tPts\tLast Week\tWaiver\tMoves
*1\tlogo Da Real Dynasty\t144-123-27\t.536\t315\t-\t5\t67
*2\tlogo ХК опівнічник\t150-114-30\t.561\t330\t-\t10\t88
*3\tlogo the grit grinders\t171-97-26\t.626\t368\t-\t12\t89
*4\tlogo Oscar Meier's Wiener\t142-118-34\t.541\t318\t-\t9\t47
*5\tlogo My Cozen Finnie\t144-123-27\t.536\t315\t-\t7\t77
*6\tlogo Young Berube\t140-125-29\t.526\t309\t-\t3\t81
*7\tlogo The Zamboni Driver!\t140-123-31\t.529\t311\t-\t2\t44
*8\tlogo Ain't No Hellebuyck Girl\t141-127-26\t.524\t308\t-\t11\t81
9\tlogo Treliving it Up\t128-138-28\t.483\t284\t-\t8\t72
10\tlogo 🚨 The Trade Show 🚨\t120-147-27\t.454\t267\t-\t4\t60
11\tlogo HAULA IF YOU HEAR ME!\t92-173-29\t.362\t213\t-\t1\t25
12\tlogo Stop F***ing Crying Bro\t81-185-28\t.323\t190\t-\t6\t27
`;

test('real paste: 12 rows, in rank order', () => {
  const r = parseStandingsText(REAL_PASTE);
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 12);
  assert.deepEqual(r.rows.map(x => x.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(r.issues, []);
});

test('real paste: "logo" is stripped and names survive intact (Cyrillic, emoji, apostrophes, asterisks)', () => {
  const r = parseStandingsText(REAL_PASTE);
  const names = r.rows.map(x => x.team);
  assert.deepEqual(names, [
    'Da Real Dynasty', 'ХК опівнічник', 'the grit grinders', "Oscar Meier's Wiener", 'My Cozen Finnie',
    'Young Berube', 'The Zamboni Driver!', "Ain't No Hellebuyck Girl", 'Treliving it Up',
    '🚨 The Trade Show 🚨', 'HAULA IF YOU HEAR ME!', 'Stop F***ing Crying Bro',
  ]);
  assert.ok(!names.some(n => /^logo/i.test(n)), 'no name keeps the logo prefix');
});

test('real paste: the clinched * is a flag, never part of the rank', () => {
  const r = parseStandingsText(REAL_PASTE);
  assert.deepEqual(r.rows.map(x => x.clinched), [true, true, true, true, true, true, true, true, false, false, false, false]);
  assert.equal(r.rows[0].rank, 1);
});

test('real paste: W-L-T, Pct and Pts are numbers', () => {
  const r = parseStandingsText(REAL_PASTE);
  const dyn = r.rows[0];
  assert.deepEqual([dyn.wins, dyn.losses, dyn.ties, dyn.pct, dyn.pts], [144, 123, 27, 0.536, 315]);
  const stop = r.rows[11];
  assert.deepEqual([stop.wins, stop.losses, stop.ties, stop.pct, stop.pts], [81, 185, 28, 0.323, 190]);
});

test('real paste: the Dynasty / Finnie tie is preserved as identical values (the parser does not break ties)', () => {
  const r = parseStandingsText(REAL_PASTE);
  const a = r.rows.find(x => x.team === 'Da Real Dynasty');
  const b = r.rows.find(x => x.team === 'My Cozen Finnie');
  assert.equal(a.pts, b.pts);
  assert.equal(a.pct, b.pct);
  assert.deepEqual([a.wins, a.losses, a.ties], [b.wins, b.losses, b.ties]);
});

test('whitespace-separated copy (no tabs) parses to the same rows', () => {
  const loose = REAL_PASTE.replace(/\t/g, '   ');
  const r = parseStandingsText(loose);
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 12);
  assert.equal(r.rows[3].team, "Oscar Meier's Wiener");
  assert.equal(r.rows[3].pts, 318);
  assert.equal(r.rows[9].team, '🚨 The Trade Show 🚨');
  assert.equal(r.rows[0].clinched, true);
});

test('one-cell-per-line copy is reassembled', () => {
  const cells = `Rank
Team
W-L-T
Pct
Pts
*1
logo Da Real Dynasty
144-123-27
.536
315
-
5
67
9
logo Treliving it Up
128-138-28
.483
284
-
8
72
`;
  const r = parseStandingsText(cells);
  assert.equal(r.error, null);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows.map(x => [x.rank, x.team, x.pts, x.clinched]), [[1, 'Da Real Dynasty', 315, true], [9, 'Treliving it Up', 284, false]]);
});

test('no header: columns are located by shape', () => {
  const r = parseStandingsText(`3\tlogo the grit grinders\t171-97-26\t.626\t368\n12\tlogo Stop F***ing Crying Bro\t81-185-28\t.323\t190\n`);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].pts, 368);
  assert.equal(r.rows[1].wins, 81);
  assert.ok(r.issues.some(i => i.kind === 'gap'), 'a two-row paste with ranks 3 and 12 reports the gap');
});

test('a missing logo prefix is fine', () => {
  const r = parseStandingsText(`Rank\tTeam\tW-L-T\tPct\tPts\n1\tAlex\t10-2-0\t.833\t20\n2\tBlake\t2-10-0\t.167\t4\n`);
  assert.deepEqual(r.rows.map(x => x.team), ['Alex', 'Blake']);
});

test('extra and reordered columns follow the header', () => {
  const r = parseStandingsText(`Rank\tTeam\tPts\tW-L-T\tGB\tPct\n1\tlogo Alex\t20\t10-2-0\t-\t.833\n2\tlogo Blake\t4\t2-10-0\t8\t.167\n`);
  assert.equal(r.rows[0].pts, 20);
  assert.equal(r.rows[0].pct, 0.833);
  assert.equal(r.rows[1].losses, 10);
});

test('rotisserie shape (no W-L-T) still yields rank, team and pts', () => {
  const r = parseStandingsText(`Rank\tTeam\tPts\n1\tlogo Alex\t91.5\n2\tlogo Blake\t70\n`);
  assert.deepEqual(r.rows.map(x => [x.team, x.pts, x.wins]), [['Alex', 91.5, null], ['Blake', 70, null]]);
});

test('missing Pts is null, never 0, and reported', () => {
  const r = parseStandingsText(`Rank\tTeam\tW-L-T\tPct\tPts\n1\tlogo Alex\t10-2-0\t.833\t20\n2\tlogo Blake\t2-10-0\t.167\t-\n`);
  assert.equal(r.rows[1].pts, null);
  assert.ok(r.issues.some(i => i.kind === 'missingPts' && i.text.includes('Blake')));
});

test('duplicates are reported', () => {
  const r = parseStandingsText(`Rank\tTeam\tPts\n1\tlogo Alex\t20\n1\tlogo Alex\t20\n`);
  assert.ok(r.issues.some(i => i.kind === 'dupRank'));
  assert.ok(r.issues.some(i => i.kind === 'dupTeam'));
});

test('empty and unreadable pastes return an error, not an empty preview', () => {
  assert.equal(parseStandingsText('').error, STANDINGS_PASTE_ERRORS.empty);
  assert.equal(parseStandingsText('Round 1\nTeam\tPicks Owned\nAlex\nAlex\n').error, STANDINGS_PASTE_ERRORS.noRows);
});

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
