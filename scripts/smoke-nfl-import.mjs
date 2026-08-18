// Render-smoke for the NFL-directory import surfaces.
//
// The directory work branches four surfaces by sport (roster import modal,
// roster editor, Last Draft page, draft import flow). This server-renders each
// one on a FOOTBALL league and on a HOCKEY league, in both themes, so a
// runtime error or a broken sport branch fails here rather than only in a
// browser — and asserts that the hockey path still reads as the hockey path
// (the standing rule for this work: NFL only, other sports untouched).
//
// Supabase is not configured in a test run, so the football surfaces render
// their "directory unavailable" state — which is itself worth asserting: an
// unreachable directory must degrade to a banner, never to silent
// pass-through.
//
// Needs the esbuild bundle — see `npm run test:nfl-ui`.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { RosterImportModal, RosterEditor, NflDirectoryCard, LastDraftPanel, DraftImportFlow } =
  await import('../.tmp-nfl-bundle.mjs');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n  ${(e.stack || String(e)).split('\n').slice(0, 3).join('\n  ')}`);
    process.exitCode = 1;
  }
}

const football = {
  id: 'football-1', name: 'Test NFL', sport: 'football', draftType: 'snake',
  keeperSlots: 3, contractYears: 3, season: '2026',
  teams: [
    {
      id: 't1', name: 'Alpha',
      roster: [{ player: 'Josh Allen', pos: 'QB', playerId: '4984', sourceName: 'Josh Allen' }],
      priorKeepers: [
        { player: 'A.J. Brown', playerId: '4881', pos: 'WR', sourceName: 'A.J. Brown', acquisitionRound: 2 },
        { player: 'Mystery Guy', sourceName: 'Mystery Guy', acquisitionRound: 5 },
      ],
    },
    { id: 't2', name: 'Beta', roster: [], priorKeepers: [] },
  ],
};
const hockey = { ...football, id: 'hockey-1', sport: 'hockey' };

const render = el => renderToStaticMarkup(el);
const surfaces = (league, isDark) => ({
  directoryCard: () => render(React.createElement(NflDirectoryCard, { isDark, accentColor: '#3ca96b' })),
  rosterImport: () => render(React.createElement(RosterImportModal, {
    league, accentColor: '#3ca96b', isDark, onImport() {}, onClose() {} })),
  rosterEditor: () => render(React.createElement(RosterEditor, {
    league, team: league.teams[0], isDark, accentColor: '#3ca96b', onUpdateLeague() {} })),
  lastDraft: () => render(React.createElement(LastDraftPanel, {
    league, isDark, accentColor: '#3ca96b', onUpdateLeague() {} })),
  draftImport: () => render(React.createElement(DraftImportFlow, {
    league, accentColor: '#3ca96b', isDark, onImport() {}, onComplete() {}, onCancel() {} })),
});

for (const isDark of [false, true]) {
  const theme = isDark ? 'dark' : 'light';
  for (const [sport, league] of [['football', football], ['hockey', hockey]]) {
    const s = surfaces(league, isDark);
    for (const [name, fn] of Object.entries(s)) {
      // The directory card is football-only in the app; rendering it on both
      // is still the cheapest way to prove it never throws.
      test(`${sport} · ${theme} · ${name} renders`, () => {
        const html = fn();
        if (!html || html.length < 40) throw new Error(`suspiciously empty render (${html.length} chars)`);
      });
    }
  }
}

// Sport branching — the rule for this work is NFL only.
test('football roster import: unreachable directory degrades to a banner', () => {
  const html = surfaces(football, false).rosterImport();
  if (!/NFL directory/i.test(html)) throw new Error('football import should name the NFL directory when it is unavailable');
  if (/NHL directory/i.test(html)) throw new Error('football import must not mention the NHL directory');
});

test('hockey roster import is untouched by the NFL work', () => {
  const html = surfaces(hockey, false).rosterImport();
  if (/NFL directory/i.test(html)) throw new Error('hockey import must not mention the NFL directory');
});

test('Last Draft flags an NFL row with no stored player ID', () => {
  const html = surfaces(football, false).lastDraft();
  if (!/no player ID/i.test(html)) throw new Error('a priorKeeper without playerId should be flagged');
  // The row that HAS an id must not be flagged: one flag, not two.
  const flags = html.match(/no player ID/gi) || [];
  if (flags.length !== 1) throw new Error(`expected exactly 1 flagged row, got ${flags.length}`);
});

test('Last Draft on hockey keeps the spelling-based unmatched copy', () => {
  const html = surfaces(hockey, false).lastDraft();
  if (/no player ID/i.test(html)) throw new Error('hockey rows must not be judged on playerId');
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} NFL-IMPORT SMOKE TESTS PASS`);
