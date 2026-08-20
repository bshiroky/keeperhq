// Render-smoke for the price-provenance markers and the import guards.
//
// The pure logic is covered by scripts/test-provenance.mjs. What THIS covers is
// the half that has burned this codebase before: logic that's correct and
// simply never reaches the screen (the Rules-button case — trigger and modal
// rendered fine in isolation while the wiring between them was missing).
//
// So every assertion here is "the number is in the HTML the commissioner
// actually gets", rendered through the real surface component with real league
// data, not through a helper called directly.
//
// Needs the esbuild bundle — see `npm run test:guards`.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, body: { style: {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const {
  ConfirmBody, SetKeepersWorkbench, KeepersOverview, LastDraftPanel, SettingsPanel,
  rosterImportImpact, draftImportImpact, rosterGuardLines, draftGuardLines,
  appendChanges, changeEntry,
} = await import('../.tmp-provenance-bundle.mjs');

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
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function includes(html, needle) {
  assert(html.includes(needle), `expected rendered output to contain ${JSON.stringify(needle)}`);
}
function excludes(html, needle) {
  assert(!html.includes(needle), `expected rendered output NOT to contain ${JSON.stringify(needle)}`);
}

const render = el => renderToStaticMarkup(el);

// An auction league mid-keeper-season: one keeper whose keep cost the
// commissioner typed over, one prior-draft row whose imported price he
// corrected, and one of each left alone.
const auction = {
  id: 'basketball-1', name: 'Test Auction', sport: 'basketball', draftType: 'auction',
  keeperCostModel: 'auction', termModel: 'none', keeperSlots: 3, season: '2026-27',
  auctionRules: { costIncreasePerYear: 5, undraftedStartCost: 5 },
  teams: [
    {
      id: 't1', name: 'Ryan',
      roster: [{ player: 'Nikola Jokic' }, { player: 'Luka Doncic' }, { player: 'Devin Booker' }],
      keepers: [
        { player: 'Nikola Jokic', keptFor: 61, keptForComputed: 47, keptForOverridden: true },
        { player: 'Luka Doncic', keptFor: 33 },
        { player: 'Devin Booker', keptFor: 19 },
      ],
      priorKeepers: [
        { player: 'Nikola Jokic', keptFor: 42 },
        { player: 'Luka Doncic', keptFor: 28, keptForComputed: 26, keptForOverridden: true },
        { player: 'Devin Booker', keptFor: 14 },
      ],
    },
    { id: 't2', name: 'Blake', roster: [], keepers: [], priorKeepers: [] },
  ],
};

const noop = () => {};
const surfaces = (league, isDark) => ({
  workbench: () => render(React.createElement(SetKeepersWorkbench, {
    league, accentColor: '#e8832a', isDark, onUpdateLeague: noop,
    selectedTeamId: 't1', onSelectTeam: noop,
  })),
  overview: () => render(React.createElement(KeepersOverview, {
    league, accentColor: '#e8832a', isDark, onOpenTeam: noop,
  })),
  lastDraft: () => render(React.createElement(LastDraftPanel, {
    league, isDark, accentColor: '#e8832a', onUpdateLeague: noop,
  })),
  settings: () => render(React.createElement(SettingsPanel, {
    league, isDark, accentColor: '#e8832a', onUpdateLeague: noop, onSaved: noop,
  })),
});

for (const isDark of [false, true]) {
  const theme = isDark ? 'dark' : 'light';
  const s = surfaces(auction, isDark);

  test(`every provenance surface renders (${theme})`, () => {
    Object.entries(s).forEach(([name, fn]) => {
      const html = fn();
      assert(typeof html === 'string' && html.length > 0, `${name} rendered nothing`);
    });
  });

  test(`set-keepers marks the hand-set keep cost and names the calculated one (${theme})`, () => {
    const html = s.workbench();
    includes(html, 'value="61"');                       // the override is what's editable
    includes(html, 'Reset to calculated value ($47)');  // and the way back is offered
  });

  test(`set-keepers leaves an untouched keep cost unmarked (${theme})`, () => {
    const html = s.workbench();
    includes(html, 'value="33"');
    excludes(html, 'Reset to calculated value ($33)');
  });

  test(`the eligible pool marks a drafted price that was set by hand (${theme})`, () => {
    const html = s.workbench();
    // Luka's prior price was corrected 26 → 28, and the pool shows the keep
    // cost calculated FROM it. Both halves must be on screen.
    includes(html, 'Drafted $28');
    includes(html, 'Keep $33');
  });

  test(`the overview grid marks a hand-set cost (${theme})`, () => {
    const html = s.overview();
    includes(html, '$61');
    includes(html, '$33');
  });

  test(`last draft marks the corrected price and offers the imported one back (${theme})`, () => {
    const html = s.lastDraft();
    includes(html, 'value="28"');
    includes(html, 'Reset to calculated value ($26)');
    excludes(html, 'Reset to calculated value ($42)'); // Jokic's row was never touched
  });

  test(`settings renders the change log, empty (${theme})`, () => {
    const html = s.settings();
    includes(html, 'Change Log');
    includes(html, 'nothing yet');
  });

  test(`settings names the prices that are hand-set right now (${theme})`, () => {
    const html = s.settings();
    // Standing state, not log history — two overrides live on this league.
    includes(html, '2 prices are set by hand');
    includes(html, 'Nikola Jokic, Luka Doncic');
  });

  test(`settings shows recorded changes with both values (${theme})`, () => {
    const logged = appendChanges(auction, [
      changeEntry({ kind: 'price', teamName: 'Ryan', player: 'Nikola Jokic', from: 47, to: 61 }),
      changeEntry({ kind: 'import', field: 'roster', teamName: 'Ryan', note: '14 players imported' }),
    ]);
    const html = render(React.createElement(SettingsPanel, {
      league: logged, isDark, accentColor: '#e8832a', onUpdateLeague: noop, onSaved: noop,
    }));
    includes(html, 'keep cost set by hand');
    includes(html, '$47 → $61');
    includes(html, 'roster re-imported');
    includes(html, '14 players imported');
    excludes(html, 'nothing yet');
  });

  test(`the roster guard renders its real counts (${theme})`, () => {
    const impact = rosterImportImpact(auction, 't1', ['Nikola Jokic', 'Luka Doncic']);
    const html = render(React.createElement(ConfirmBody, {
      isDark, accentColor: '#e8832a', danger: true,
      title: `Replace ${impact.teamName}'s roster?`,
      lines: rosterGuardLines(impact),
      confirmLabel: 'Replace roster', cancelLabel: '← Back to preview',
      onConfirm: noop, onCancel: noop,
    }));
    includes(html, "Replace Ryan&#x27;s roster?");
    includes(html, '3 players currently on file');
    includes(html, 'Devin Booker');           // the keeper the paste would strand, by name
    includes(html, 'Replace roster');
    includes(html, 'Back to preview');
  });

  test(`the draft guard renders losses AND what survives (${theme})`, () => {
    const impact = draftImportImpact(auction, { 'Ryan Yahoo': 't1' }, [{ name: 'Ryan Yahoo', players: [] }]);
    const html = render(React.createElement(ConfirmBody, {
      isDark, accentColor: '#e8832a', danger: true,
      title: 'Replace the draft on file?', lines: draftGuardLines(impact),
      confirmLabel: 'Replace draft data', onConfirm: noop, onCancel: noop,
    }));
    includes(html, '3 draft rows');
    includes(html, '1 hand-set price');
    includes(html, '3 declared keepers');
  });
}

// A snake/term league must be untouched by any of this — no dollar markers, no
// reset affordances, and the guard still counts rows correctly.
const snake = {
  id: 'hockey-1', name: 'Test Snake', sport: 'hockey', draftType: 'snake',
  keeperCostModel: 'slot', termModel: 'fixed', termYears: 3, keeperSlots: 3, season: '2026-27',
  teams: [
    {
      id: 't1', name: 'Ryan',
      roster: [{ player: 'Connor McDavid' }],
      keepers: [{ player: 'Connor McDavid', contractYear: 2, contractLength: 3 }],
      priorKeepers: [{ player: 'Connor McDavid', contractYear: 1, contractLength: 3, acquisitionRound: 1 }],
    },
  ],
};

test('a term league shows no price markers anywhere', () => {
  const html = render(React.createElement(SetKeepersWorkbench, {
    league: snake, accentColor: '#3b8ae6', isDark: false, onUpdateLeague: noop,
    selectedTeamId: 't1', onSelectTeam: noop,
  })) + render(React.createElement(KeepersOverview, {
    league: snake, accentColor: '#3b8ae6', isDark: false, onOpenTeam: noop,
  }));
  excludes(html, 'Reset to calculated value');
  includes(html, 'Y2/3');
});

test('a term league draft guard counts rounds, not prices', () => {
  const impact = draftImportImpact(snake, { Yahoo: 't1' }, [{ name: 'Yahoo', players: [] }]);
  const lines = draftGuardLines(impact).map(l => l.text).join(' ');
  assert(lines.includes('1 draft round'), 'expected the round-overwrite warning');
  assert(!lines.includes('hand-set price'), 'expected no price line where there are no overrides');
});

if (process.exitCode) {
  console.error('\nPROVENANCE-UI SMOKE FAILED');
} else {
  console.log(`\nALL ${passed} PROVENANCE-UI SMOKE TESTS PASS`);
}
