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
// MemoryRouter uses useLayoutEffect, which React warns about on the server —
// expected here, and noise in the output.
const rawError = console.error;
console.error = (...a) => { if (String(a[0]).includes('useLayoutEffect does nothing on the server')) return; rawError(...a); };

const { PicksPasteModal, DraftPicksPanel, lotteryTradeLines, MemoryRouter } = await import('../.tmp-picks-bundle.mjs');
// The board's pre-lottery line links to the Lottery page, so the panel renders inside a router.
const panel = props => h(MemoryRouter, null, h(DraftPicksPanel, props));

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

  test(`${theme}: without standings the Picks page falls back to the ownership grid and says so`, () => {
    const html = render(panel(props));
    includes(html, 'Paste from Yahoo');
    includes(html, 'No standings imported yet.');
    includes(html, 'Import last season’s standings');
    includes(html, '>Rd<');
    excludes(html, 'Draft board');
    // A traded cell says where the pick WENT, in the original owner's column.
    includes(html, '→ Alex');
    excludes(html, 'via ');
  });

  // Standings for the four teams: Drew worst, Alex best. Two lottery teams.
  const STANDINGS = {
    rows: [
      { teamId: 't1', rank: 1, pts: 40 }, { teamId: 't2', rank: 2, pts: 30 },
      { teamId: 't3', rank: 3, pts: 20 }, { teamId: 't4', rank: 4, pts: 10 },
    ],
  };
  const ordered = { ...league, standings: STANDINGS, draftOrderConfig: { lotteryTeams: 2 }, draftPicks: { rounds: 3, ownership: league.draftPicks.ownership } };

  test(`${theme}: with standings + lottery the Picks page is a draft board — rounds across, slots down, numbers in the cells`, () => {
    const drawn = { ...ordered, lotteryDraw: { at: '2026-09-01T00:00:00Z', order: ['t3', 't4'] } };
    const html = render(panel({ ...props, league: drawn }));
    includes(html, 'Draft board');
    includes(html, '>R1<'); includes(html, '>R2<'); includes(html, '>R3<');
    includes(html, '>Pick<');
    excludes(html, '>Rd<');
    excludes(html, 'Lottery');
    // Round 1 order: Casey (won the lottery), Drew, Blake's pick → Alex, Alex.
    assert(/>1<\/span><span[^>]*>Casey</.test(html), 'pick 1 is Casey');
    assert(/>3<\/span><span[^>]*>Alex</.test(html), 'pick 3 (Blake\'s) is now Alex\'s');
    includes(html, 'originally Blake&#x27;s pick');
    // Round 2 snakes: Alex picks 5, Blake's pick (6) → Alex, Drew 7, Casey's pick (8) → Drew.
    assert(/>8<\/span><span[^>]*>Drew</.test(html), 'Casey\'s round-2 pick belongs to Drew');
    assert(/Pick 8<\/span><span>Casey&#x27;s pick/.test(html), 'the roll-up numbers the traded pick');
  });

  test(`${theme}: before the lottery every slot is its own cell — placeholders with numbers, a line naming the lottery teams`, () => {
    const html = render(panel({ ...props, league: ordered }));
    includes(html, 'Draft board');
    excludes(html, 'rowspan');
    excludes(html, 'rowSpan');
    // The line above the board: who's in it, and the way to run it.
    includes(html, 'Lottery not run');
    includes(html, 'Casey, Drew');
    assert(/href="\/league\/hockey-x\/lottery"[^>]*>Run lottery/.test(html), 'links to the Lottery page');
    // Two lottery slots per round, each a placeholder carrying only its number.
    assert((html.match(/Lottery pick/g) || []).length === 6, 'two placeholders in each of three rounds');
    assert(/>1<[^]*?Lottery pick/.test(html) && />2<[^]*?Lottery pick/.test(html), 'R1 slots 1–2');
    assert(/>7<[^]*?Lottery pick/.test(html) && />8<[^]*?Lottery pick/.test(html), 'R2 snakes them to 7–8');
    excludes(html, 'Lottery · ');
    // Non-lottery rows are exact already.
    assert(/>3<\/span><span[^>]*>Alex</.test(html), 'pick 3 is fixed from standings');
    assert(/>4<\/span><span[^>]*>Alex</.test(html), 'pick 4 is Alex');
    // Casey's R2 pick went to Drew: both R2 placeholders carry the asterisk and name it on hover; R1/R3 don't.
    const lines = lotteryTradeLines(ordered, { ...ordered, teams: 4 }, 2, id => ({ t1: 'Alex', t2: 'Blake', t3: 'Casey', t4: 'Drew' })[id]);
    assert((html.match(/>\*<\/span>/g) || []).length === 2, `exactly the two R2 placeholders are starred (got ${(html.match(/>\*<\/span>/g) || []).length})`);
    includes(html, 'One of picks 7–8 is Drew&#x27;s, via Casey.');
    excludes(html, 'One of picks 1–2');
    void lines;
  });

  test(`${theme}: after the lottery the line and the asterisks are gone`, () => {
    const drawn = { ...ordered, lotteryDraw: { at: '2026-09-01T00:00:00Z', order: ['t3', 't4'] } };
    const html = render(panel({ ...props, league: drawn }));
    excludes(html, 'Lottery not run');
    excludes(html, 'Lottery pick');
    excludes(html, '>*</span>');
    excludes(html, 'One of picks');
  });

  test(`${theme}: the Traded Picks list carries an Add trade control`, () => {
    const html = render(panel({ ...props, league: ordered }));
    includes(html, 'Add trade');
  });
}

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
