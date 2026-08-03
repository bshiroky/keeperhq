// Render-smoke for the create-league wizard.
//
// Walks every screen on all three cost-model paths and server-renders each,
// so a runtime error in any screen fails here rather than only in a browser.
// Also asserts the flow's structural invariants: five fixed rail phases on
// every path, the specced screen counts, and no "Step N of M" anywhere.
//
// Needs the esbuild bundle — see `npm run test:wizard`.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.window = {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const {
  CreateLeagueWizard, screensOf, reducer, makeInitial, WizardScreen, PHASES, DarkContext,
} = await import('../.tmp-wizard-bundle.mjs');

const COST_SLOT = 'slot', COST_PICKS = 'picks', COST_AUCTION = 'auction';

let pass = 0, fail = 0;
function ok(label) { pass++; }
function bad(label, msg) { fail++; console.error(`  ✗ ${label}: ${msg}`); }
function check(label, fn) {
  try { fn(); ok(label); } catch (e) { bad(label, e.message); }
}
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return ok(label);
  bad(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(n) { console.log(`\n${n}`); }

function renderScreen(id, state, isDark) {
  return renderToStaticMarkup(
    React.createElement(DarkContext.Provider, { value: isDark },
      React.createElement(WizardScreen, {
        id, s: state, dispatch() {}, isDark, accent: '#3b8ae6', gotoPhase() {},
      })));
}

// ── Every screen renders, on every path, in both themes ───────────────────
section('Screen renders');
for (const cost of [COST_SLOT, COST_PICKS, COST_AUCTION]) {
  for (const termModel of ['none', 'fixed']) {
    const state = { ...makeInitial(), keeperCostModel: cost, termModel, sport: 'hockey', name: 'Test' };
    for (const sc of screensOf(state)) {
      for (const isDark of [false, true]) {
        check(`${cost}/${termModel} · ${sc.id} · ${isDark ? 'dark' : 'light'}`, () => {
          const html = renderScreen(sc.id, state, isDark);
          if (!html || html.length < 20) throw new Error('empty render');
        });
      }
    }
  }
}

// ── Rail is five fixed phases on every path ───────────────────────────────
section('Rail invariants');
eq(PHASES, ['Basics', 'League type', 'Keeper rules', 'Teams', 'Review'], 'five named phases');
for (const cost of [COST_SLOT, COST_PICKS, COST_AUCTION]) {
  const screens = screensOf({ ...makeInitial(), keeperCostModel: cost });
  const phases = [...new Set(screens.map(s => s.phase))].sort();
  eq(phases, [0, 1, 2, 3, 4], `${cost}: all five phases present, none added or dropped`);
  // Phases must appear in order and never revisit an earlier one.
  const seq = screens.map(s => s.phase);
  eq(seq.every((p, i) => i === 0 || p >= seq[i - 1]), true, `${cost}: phases never reorder`);
}

// ── Screen counts per path (spec §1/§5) ───────────────────────────────────
section('Screen counts');
const keeperScreens = cost =>
  screensOf({ ...makeInitial(), keeperCostModel: cost }).filter(s => s.phase === 2).map(s => s.id);
eq(keeperScreens(COST_SLOT), ['count', 'cost', 'term'], 'slot-only: 3 screens, specifics skipped');
eq(keeperScreens(COST_AUCTION), ['count', 'cost', 'auction', 'term'], 'auction: 4 screens');
eq(keeperScreens(COST_PICKS), ['count', 'cost', 'picksWhich', 'picksDials', 'term'],
  'picks: 4 numbered screens, specifics split into 3a + 3b');

// ── Cost-model switches preserve every other model's values ───────────────
section('Preserve on switch');
let st = { ...makeInitial(), keeperCostModel: COST_AUCTION, auctionInflation: 9, undraftedStartCost: 7 };
st = reducer(st, { type: 'costModel', value: COST_PICKS });
st = reducer(st, { type: 'set', patch: { pickEscalation: 3 } });
st = reducer(st, { type: 'costModel', value: COST_AUCTION });
eq(st.auctionInflation, 9, 'auction values survive a round trip through picks');
eq(st.undraftedStartCost, 7, 'undrafted cost survives too');
st = reducer(st, { type: 'costModel', value: COST_PICKS });
eq(st.pickEscalation, 3, 'pick values survive the reverse trip');

// ── The preview pill holds each half back until answered ──────────────────
section('Preview pill gating');
let p = makeInitial();
eq(p.costAnswered, false, 'cost starts unanswered');
// Advance to the cost screen and past it.
const idxOf = (state, id) => screensOf(state).findIndex(s => s.id === id);
p = reducer(p, { type: 'goto', step: idxOf(p, 'cost') });
p = reducer(p, { type: 'next' });
eq(p.costAnswered, true, 'answering the cost screen reveals the cost half');
eq(p.termAnswered, false, 'term still held back');
p = reducer(p, { type: 'goto', step: idxOf(p, 'term') });
p = reducer(p, { type: 'next' });
eq(p.termAnswered, true, 'answering the term screen reveals the term half');

// ── mustFillSlots couples the min to the max ──────────────────────────────
section('Keeper count coupling');
let c = reducer(makeInitial(), { type: 'mustFillSlots', value: true });
eq(c.minKeepers, c.keeperSlots, 'must-fill sets fewest = most');
c = reducer(c, { type: 'keeperSlots', value: 6 });
eq(c.minKeepers, 6, 'raising the max keeps them coupled while must-fill is on');
c = reducer(c, { type: 'mustFillSlots', value: false });
eq(c.minKeepers, 0, 'turning must-fill off releases the min');

// ── No "Step N of M" anywhere in the rendered shell ───────────────────────
section('No step counter');
const shell = renderToStaticMarkup(React.createElement(CreateLeagueWizard, {
  isDark: false, existingLeagues: [], onCreate() {}, onCancel() {},
}));
eq(/step\s+\d+\s+of\s+\d+/i.test(shell), false, 'shell renders no "Step N of M" eyebrow');
eq(shell.includes('Basics') && shell.includes('Review'), true, 'rail renders all phases');

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
