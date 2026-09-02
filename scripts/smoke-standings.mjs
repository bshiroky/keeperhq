// Render-smoke for the standings import and the standings-seeded Lottery page.
//
// The parser and the order engine are covered by their own scripts. This
// asserts what they produce reaches the HTML the commissioner sees — the
// alias prompt on a renamed team, the tie-break step naming the tied teams,
// the Lottery page blocked without standings, seeded from them once on file,
// and the Settings Draft Order card — through the real components with a
// real league, in both themes. Shares the bundle with smoke-picks-paste.mjs.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { REAL_PASTE } from './test-standings-parser.mjs';

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

const { StandingsPasteModal, StandingsCard, LotteryTab, SettingsPanel, MemoryRouter } = await import('../.tmp-picks-bundle.mjs');

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
const routed = el => h(MemoryRouter, null, el);

// The league as it stood BEFORE the standings paste: two teams still carry
// the names the picks paste had (It's Hiller Time, ЦСКА Совки), and every
// name from that paste is already an alias.
const OLD_NAMES = [
  'My Cozen Finnie', "Ain't No Hellebuyck Girl", 'Da Real Dynasty', 'HAULA IF YOU HEAR ME!',
  "Oscar Meier's Wiener", 'Stop F***ing Crying Bro', 'the grit grinders', 'The Zamboni Driver!',
  "It's Hiller Time", 'Young Berube', 'ЦСКА Совки', '🚨 The Trade Show 🚨',
];
const teams = OLD_NAMES.map((name, i) => ({ id: `t${i + 1}`, name, roster: [], priorKeepers: [], keepers: [] }));
const league = {
  id: 'hockey-1', sport: 'hockey', draftType: 'snake', season: '2026-27', keeperCostModel: 'slot', termModel: 'fixed', termYears: 3,
  teams,
  yahooTeamMap: Object.fromEntries(teams.map(tm => [tm.name, tm.id])),
};
const idOf = name => teams.find(t => t.name === name).id;
// …and after it: standings on file with the renamed teams mapped.
const NEW_FOR = { "It's Hiller Time": 'Treliving it Up', 'ЦСКА Совки': 'ХК опівнічник' };
const withStandings = (() => {
  const rows = REAL_PASTE.split('\n').slice(1).filter(Boolean).map(line => {
    const [rank, team, rec, pct, pts] = line.split('\t');
    const name = team.replace(/^logo /, '');
    const oldName = Object.keys(NEW_FOR).find(k => NEW_FOR[k] === name) || name;
    const [w, l, t] = rec.split('-').map(Number);
    return { teamId: idOf(oldName), rank: Number(rank.replace('*', '')), clinched: rank.startsWith('*'), wins: w, losses: l, ties: t, pct: Number(pct), pts: Number(pts), sourceName: name };
  });
  return { ...league, standings: { season: '2025-26', importedAt: '2026-09-01T00:00:00Z', rows, tieResolutions: {} } };
})();
const DYN = idOf('Da Real Dynasty'), FIN = idOf('My Cozen Finnie');
const resolved = { ...withStandings, standings: { ...withStandings.standings, tieResolutions: { [[DYN, FIN].sort().join('|')]: [FIN, DYN] } } };

for (const isDark of [true, false]) {
  const theme = isDark ? 'dark' : 'light';
  const props = { league, isDark, accentColor: '#3b8ae6', onUpdateLeague() {}, onClose() {} };

  test(`${theme}: preview — known aliases resolve silently, the two renamed teams are the only prompts`, () => {
    const html = render(h(StandingsPasteModal, { ...props, initialText: REAL_PASTE }));
    includes(html, 'Read <strong>12</strong> teams');
    includes(html, '8 clinched a playoff spot');
    includes(html, 'Unrecognized team names');
    includes(html, 'Match Treliving it Up');
    includes(html, 'Match ХК опівнічник');
    assert((html.match(/>new name</g) || []).length === 2, 'exactly two rows flagged as new names');
    includes(html, '10 of 12 teams mapped');
    assert(/<button[^>]*disabled[^>]*>Continue/.test(html), 'Continue is disabled while a name is unmapped');
    // The two unmapped rows list the ten taken teams with the marker.
    includes(html, 'Da Real Dynasty ✓ (mapped)');
  });

  test(`${theme}: preview — a fully-aliased paste needs no prompt`, () => {
    const aliased = { ...league, yahooTeamMap: { ...league.yahooTeamMap, 'Treliving it Up': idOf("It's Hiller Time"), 'ХК опівнічник': idOf('ЦСКА Совки') } };
    const html = render(h(StandingsPasteModal, { ...props, league: aliased, initialText: REAL_PASTE }));
    excludes(html, 'Unrecognized team name');
    excludes(html, '>new name<');
    includes(html, '12 of 12 teams mapped');
    assert(!/<button[^>]*disabled[^>]*>Continue/.test(html), 'Continue is enabled');
  });

  test(`${theme}: the tie-break step names the tied teams and their identical line`, () => {
    const aliased = { ...league, yahooTeamMap: { ...league.yahooTeamMap, 'Treliving it Up': idOf("It's Hiller Time"), 'ХК опівнічник': idOf('ЦСКА Совки') } };
    const html = render(h(StandingsPasteModal, { ...props, league: aliased, initialText: REAL_PASTE, initialStep: 'ties' }));
    includes(html, 'A tie has to be broken by hand');
    includes(html, 'Tied: Da Real Dynasty · My Cozen Finnie');
    includes(html, '315 pts · 144-123-27 · .536');
    includes(html, 'Finishes 1st of 2');
    includes(html, 'Finishes 2nd of 2');
    assert(/<button[^>]*disabled[^>]*>Continue/.test(html), 'Continue waits for the order');
  });

  test(`${theme}: Import-page card — empty state, then the standings on file with the pasted name kept`, () => {
    const empty = render(h(StandingsCard, props));
    includes(empty, 'No standings imported yet');
    includes(empty, 'Paste from Yahoo');
    const html = render(h(StandingsCard, { ...props, league: withStandings }));
    includes(html, '12 teams · imported Sep 1');
    includes(html, 'as “Treliving it Up”');
    includes(html, 'Tie to break: Da Real Dynasty / My Cozen Finnie');
    includes(html, 'regular-season points');
    includes(html, '4-team lottery');
  });

  test(`${theme}: Lottery page — blocked without standings, pointing at Import`, () => {
    const html = render(routed(h(LotteryTab, props)));
    includes(html, 'Standings needed first');
    includes(html, 'Import standings');
    excludes(html, 'Run Lottery');
  });

  test(`${theme}: Lottery page — stops on the tie with the editor`, () => {
    const html = render(routed(h(LotteryTab, { ...props, league: withStandings })));
    includes(html, 'Break the tie before the lottery');
    includes(html, 'Tied: Da Real Dynasty · My Cozen Finnie');
    excludes(html, 'Run Lottery');
  });

  test(`${theme}: Lottery page — seeded from the standings once the tie is broken`, () => {
    const html = render(routed(h(LotteryTab, { ...props, league: resolved })));
    includes(html, 'Run Lottery');
    includes(html, 'Bottom 4 teams by <strong>regular-season points</strong>');
    // Worst four by points, in seed order 12 → 9.
    const idx = name => html.indexOf(name);
    assert(idx('Stop F***ing Crying Bro') < idx('HAULA IF YOU HEAR ME!'), 'worst first');
    assert(idx('HAULA IF YOU HEAR ME!') < idx('🚨 The Trade Show 🚨'), 'then 11th');
    // (apostrophes are HTML-escaped in the output, so match on the unescaped tail)
    assert(idx('🚨 The Trade Show 🚨') < idx('Hiller Time'), 'then 10th, then 9th (shown under the app name)');
    includes(html, 'Seed #12');
    includes(html, 'Seed #9');
    excludes(html, 'Seed #8');
  });

  test(`${theme}: Lottery page — a locked draw shows the full round-1 order with a traded pick`, () => {
    const order = ["It's Hiller Time", 'Stop F***ing Crying Bro', 'HAULA IF YOU HEAR ME!', '🚨 The Trade Show 🚨'].map(idOf);
    const drawn = {
      ...resolved,
      lotteryDraw: { at: '2026-09-02T00:00:00Z', order },
      draftPicks: { ownership: { [`1:${idOf('Stop F***ing Crying Bro')}`]: idOf('Young Berube') } },
    };
    const html = render(routed(h(LotteryTab, { ...props, league: drawn })));
    includes(html, 'Results locked');
    includes(html, 'Draft Order · Round 1');
    includes(html, 'traded from Stop F***ing Crying Bro');
    includes(html, 'Lottery winner');
    includes(html, 'Even rounds reverse this order');
  });

  test(`${theme}: Settings — the Draft Order card and per-team Yahoo names`, () => {
    const withAlias = { ...resolved, yahooTeamMap: { ...resolved.yahooTeamMap, 'Treliving it Up': idOf("It's Hiller Time") } };
    const html = render(routed(h(SettingsPanel, { league: withAlias, isDark, accentColor: '#3b8ae6', onUpdateLeague() {}, onSaved() {} })));
    includes(html, 'Draft Order');
    includes(html, 'Standings Basis');
    includes(html, 'Regular-season points');
    includes(html, 'Worst 4');
    includes(html, 'Ask me (manual)');
    includes(html, 'Yahoo names: Treliving it Up');
  });

  test(`${theme}: Settings — no Draft Order card on an auction league`, () => {
    const html = render(routed(h(SettingsPanel, { league: { ...resolved, draftType: 'auction' }, isDark, accentColor: '#3b8ae6', onUpdateLeague() {}, onSaved() {} })));
    excludes(html, 'Standings Basis');
  });
}

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
