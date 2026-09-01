// Render-smoke for the pick-ownership paste modal's PREVIEW step.
//
// The parser is covered by scripts/test-picks-parser.mjs. This asserts the
// numbers it produces reach the HTML the commissioner sees — the pick /
// trade totals, the Grid checksum verdict, a round that doesn't add up, a
// hand-recorded trade the paste clears — through the real modal with a real
// league, in both themes. Needs the esbuild bundle — see `npm run test:picks-ui`.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, body: { style: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { PicksPasteModal, DraftPicksPanel } = await import('../.tmp-picks-bundle.mjs');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${(e.stack || String(e)).split('\n').slice(0, 3).join('\n  ')}`); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const includes = (html, s) => assert(html.includes(s), `expected rendered output to contain ${JSON.stringify(s)}`);
const excludes = (html, s) => assert(!html.includes(s), `expected rendered output NOT to contain ${JSON.stringify(s)}`);
const h = React.createElement;
const render = el => renderToStaticMarkup(el);

const TEAMS = ['Alex', 'Blake', 'Casey', 'Drew'];
const league = {
  id: 'hockey-x', sport: 'hockey', draftType: 'snake',
  teams: TEAMS.map((name, i) => ({ id: `t${i + 1}`, name, roster: [], priorKeepers: [] })),
  // A hand-recorded trade the paste will CLEAR (R2 Casey's pick shows back
  // home), and one it agrees with (R1 Blake's pick → Alex).
  draftPicks: { ownership: { '1:t2': 't1', '2:t3': 't4' } },
};
const BY_ROUND = `Round 1
Team\tPicks Owned
Alex
AlexBlake
Blake
-
Casey
Casey
Drew
Drew
Round 2
Team\tPicks Owned
Alex
Alex
Blake
Blake
Casey
Casey
Drew
Drew
`;
const GRID_OK = `Team\t1\t2\nAlex\t2\t1\nBlake\t0\t1\nCasey\t1\t1\nDrew\t1\t1\n`;
const GRID_BAD = `Team\t1\t2\nAlex\t1\t1\nBlake\t1\t1\nCasey\t1\t1\nDrew\t1\t1\n`;

for (const isDark of [true, false]) {
  const theme = isDark ? 'dark' : 'light';
  const props = { league, isDark, accentColor: '#3b8ae6', onUpdateLeague() {}, onClose() {} };

  test(`${theme}: the paste step has two labelled fields — By Round required, Grid optional`, () => {
    const html = render(h(PicksPasteModal, props));
    assert((html.match(/<textarea/g) || []).length === 2, 'expected two textareas');
    includes(html, 'By Round <span');
    includes(html, 'required');
    includes(html, 'Grid <span');
    includes(html, 'optional');
  });

  test(`${theme}: the Grid field is the checksum (two-line Yahoo header)`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: BY_ROUND, initialGridText: 'Team\tRounds\n1\t2\nAlex\t2\t1\nBlake\t0\t1\nCasey\t1\t1\nDrew\t1\t1\n' }));
    includes(html, 'Grid check passed');
    includes(html, '<strong>8</strong> pick');
  });

  test(`${theme}: a team mapped on another row is marked in the dropdown`, () => {
    // Drew is unresolved; Alex/Blake/Casey auto-resolve. Drew's dropdown lists
    // the three taken teams with the marker.
    const html = render(h(PicksPasteModal, { ...props, initialText: BY_ROUND.replace(/Drew/g, 'Zzyzx Road') }));
    includes(html, 'Alex ✓ (mapped)');
    includes(html, '3 of 4 teams mapped');
  });

  test(`${theme}: preview shows totals, the trade, and the clear of a hand-recorded trade`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: BY_ROUND }));
    includes(html, '<strong>8</strong> pick');
    includes(html, '<strong>2</strong> round');
    includes(html, '<strong>4</strong> team');
    includes(html, '<strong>1</strong> traded');
    includes(html, 'already recorded');           // R1 Blake → Alex is on the grid already
    includes(html, 'back to Casey');              // R2 Casey's pick returns home
    includes(html, 'recorded as traded to Drew');
    includes(html, 'Apply 1 change');
    includes(html, 'No Grid pasted');
    excludes(html, 'Check before applying');
  });

  test(`${theme}: a matching Grid passes the checksum`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: `${BY_ROUND}\n${GRID_OK}` }));
    includes(html, 'Grid check passed');
    excludes(html, 'Grid check failed');
  });

  test(`${theme}: a disagreeing Grid names the round and team`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: `${BY_ROUND}\n${GRID_BAD}` }));
    includes(html, 'Grid check failed on 2 team-rounds');
    includes(html, 'R1 · Alex: the Grid says 1 pick, the By Round paste has 2');
    includes(html, 'R1 · Blake: the Grid says 1 pick, the By Round paste has 0');
  });

  test(`${theme}: a round that doesn't add up is reported`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: BY_ROUND.replace('AlexBlake', 'Alex') }));
    includes(html, 'Check before applying');
    includes(html, 'R1 accounts for 3 picks, not 4');
    includes(html, 'Blake&#x27;s pick isn&#x27;t listed under any team');
  });

  test(`${theme}: Grid alone is refused on the paste step`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: GRID_OK }));
    includes(html, 'only has pick COUNTS');
    excludes(html, 'Apply ');
  });

  test(`${theme}: an unrecognized name asks for a mapping and blocks Apply`, () => {
    const html = render(h(PicksPasteModal, { ...props, initialText: BY_ROUND.replace(/Drew/g, 'Zzyzx Road') }));
    includes(html, 'Unrecognized team name');
    includes(html, 'Match Zzyzx Road');
    assert(/<button[^>]*disabled[^>]*>Apply/.test(html), 'Apply should be disabled while a name is unmapped');
  });

  test(`${theme}: the Picks page still renders`, () => {
    const html = render(h(DraftPicksPanel, props));
    includes(html, 'Paste from Yahoo');
  });
}

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
