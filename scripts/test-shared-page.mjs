// Tests for the shared league page's data + rail rules — run via
// `npm run test:shared`. Plain node over an esbuild bundle (see the entry
// file); no rendering.
//
// The load-bearing claim these protect: the default "Rostered" view is the
// trade-and-keeper-decision view — EVERY rostered player across EVERY team,
// with what they'd cost to keep and who holds them, sorted by cost desc, and a
// player with no cost still appears rather than disappearing.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The bundle pulls in modules that touch browser globals at import time
// (window/localStorage), so stub them before loading it.
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  // Desktop by default so the render smoke exercises the sticky TABLE, which
  // is where the flat-list change actually lives.
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const {
  buildSharedRows, sortRowsDefault, sharedFilterChips, costColumnLabel, OWNER_COLUMN_LABEL,
  keepersFirst, sortTeamsByName, SharedLeaguePage,
  keeperRuleFacts, ruleNotes, LeagueRulesModal, RulesButton, InvalidLinkPage,
  buildTeamPool, buildStatusIndex,
} = await import('../.tmp-shared-bundle.mjs');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

// An auction league with no term — the shape being shared with the league.
const AUCTION = {
  id: 'football-1', name: 'Test', sport: 'football', draftType: 'auction',
  keeperCostModel: 'auction', termModel: 'none', keeperSlots: 4,
  auctionRules: { costIncreasePerYear: 5, undraftedStartCost: 5 },
  teams: [
    {
      id: 't1', name: 'Alpha',
      priorKeepers: [{ player: "Ja'Marr Chase", keptFor: 83 }],
      roster: [{ player: "Ja'Marr Chase" }, { player: 'Undrafted Rookie' }],
      keepers: [],
    },
    {
      id: 't2', name: 'Beta',
      priorKeepers: [],
      roster: [{ player: 'Bijan Robinson' }, { player: 'Deep Bench Guy' }],
      keepers: [],
    },
    {
      id: 't3', name: 'Gamma',
      priorKeepers: [{ player: 'Josh Allen', keptFor: 60 }],
      roster: [{ player: 'Josh Allen' }, { player: 'Priced Nobody' }],
      // Declared keeper with no price recorded — the "no keep cost" case.
      keepers: [{ player: 'Josh Allen', keptFor: null }],
    },
  ],
};

const TERMED = {
  id: 'hockey-1', name: 'Termed', sport: 'hockey', draftType: 'snake',
  keeperCostModel: 'slot', termModel: 'fixed', termYears: 3, contractYears: 3,
  teams: [{ id: 't1', name: 'Alpha', priorKeepers: [], roster: [{ player: 'Nico Hischier' }], keepers: [] }],
};

const rows = buildSharedRows(AUCTION);
const byName = new Map(rows.map(r => [r.player, r]));

test('all players: every rostered player across every team is present', () => {
  const rostered = AUCTION.teams.flatMap(t => t.roster.map(p => p.player));
  for (const name of rostered) {
    assert.ok(byName.has(name), `${name} is missing from the shared rows`);
  }
});

test('all players: one row per player, even when rostered AND under a prior deal', () => {
  // Chase and Allen each appear on a roster and in priorKeepers; Allen is also
  // a declared keeper. Each must collapse to exactly one row.
  assert.equal(rows.filter(r => r.player === "Ja'Marr Chase").length, 1);
  assert.equal(rows.filter(r => r.player === 'Josh Allen').length, 1);
  assert.equal(byName.get('Josh Allen').kind, 'keeper', 'the strongest state wins the row');
});

test('all players: every row says which team holds the player', () => {
  for (const row of rows) {
    assert.ok(row.teamName, `${row.player} has no owning team`);
    assert.ok(row.teamId, `${row.player} has no team id`);
  }
  assert.equal(byName.get("Ja'Marr Chase").teamName, 'Alpha');
  assert.equal(byName.get('Bijan Robinson').teamName, 'Beta');
});

test('all players: keep cost is the escalated price, or the undrafted floor', () => {
  assert.equal(byName.get("Ja'Marr Chase").cost, 88, 'drafted $83 + $5/yr');
  assert.equal(byName.get('Undrafted Rookie').cost, 5, 'undrafted players start at the floor');
  assert.equal(byName.get('Bijan Robinson').cost, 5);
});

test('all players: a player with NO keep cost still appears', () => {
  const allen = byName.get('Josh Allen');
  assert.ok(allen, 'a declared keeper with no recorded price must not vanish');
  assert.equal(allen.cost, null);
});

test('all players: sorted by cost descending, cost-less rows last but present', () => {
  const sorted = sortRowsDefault(rows, null, AUCTION);
  const costs = sorted.map(r => r.cost);
  const priced = costs.filter(c => c != null);
  assert.deepEqual(priced, [...priced].sort((a, b) => b - a), 'priced rows descend');
  assert.equal(sorted[0].player, "Ja'Marr Chase", 'most expensive first');
  assert.equal(sorted[sorted.length - 1].cost, null, 'no-cost row sinks to the bottom…');
  assert.equal(sorted.length, rows.length, '…and is never dropped');
});

// ── Filter rail ─────────────────────────────────────────────────────────────

test('rail: no "drafted last year" chip where keeping costs dollars and nothing else', () => {
  const chips = sharedFilterChips({ league: AUCTION, locked: false, termed: false, hasExpired: false, teams: AUCTION.teams });
  assert.ok(!chips.some(c => c.id === 'contracts'), 'the redundant chip is gone');
  assert.ok(!chips.some(c => /drafted last year/i.test(c.label)));
  assert.equal(chips[0].label, 'Rostered',
    'the default view names what it holds — last season\'s rosters, not "all players"');
  assert.deepEqual(chips.slice(1).map(c => c.label), ['Alpha', 'Beta', 'Gamma'],
    'the default view + per-team chips is the whole rail');
});

test('rail: a league WITH a term keeps its "under contract" chip', () => {
  const chips = sharedFilterChips({ league: TERMED, locked: false, termed: true, hasExpired: false, teams: TERMED.teams });
  assert.ok(chips.some(c => c.id === 'contracts' && c.label === 'Under contract'),
    'being under contract is a real state where terms exist');
});

test('rail: the default chip reads the same on every league type', () => {
  // One label across sports and cost models. A termed league's default view
  // holds last season's rosters exactly like an auction league's, and the
  // coming eligibility cutoff would contradict "Keepable" in either.
  const auction = sharedFilterChips({ league: AUCTION, locked: false, termed: false, hasExpired: false, teams: [] });
  const termed = sharedFilterChips({ league: TERMED, locked: false, termed: true, hasExpired: false, teams: [] });
  assert.equal(auction[0].label, 'Rostered');
  assert.equal(termed[0].label, 'Rostered', 'no per-sport variant to re-fix when the cutoff ships');

  const lockedAuction = sharedFilterChips({ league: AUCTION, locked: true, termed: false, hasExpired: false, teams: [] });
  const lockedTermed = sharedFilterChips({ league: TERMED, locked: true, termed: true, hasExpired: false, teams: [] });
  assert.equal(lockedAuction[0].label, 'Final keepers');
  assert.equal(lockedTermed[0].label, 'Final keepers', 'and post-lock too');
});

test('rail: post-lock the default view relabels, expired stays conditional', () => {
  const locked = sharedFilterChips({ league: AUCTION, locked: true, termed: false, hasExpired: false, teams: [] });
  assert.equal(locked[0].label, 'Final keepers');
  const withExpired = sharedFilterChips({ league: TERMED, locked: false, termed: true, hasExpired: true, teams: [] });
  assert.ok(withExpired.some(c => c.id === 'expired'));
});

// ── Column headers ──────────────────────────────────────────────────────────

test('columns: the cost column names a price only where keeping costs money', () => {
  assert.equal(costColumnLabel(AUCTION), 'Cost to keep');
  assert.equal(costColumnLabel(TERMED), 'Contract',
    'a termed league\'s cell holds "Y1/3" — calling that a cost would be wrong');
});

test('columns: the owner column says whose roster the player is on', () => {
  // Not "Kept by": pre-deadline nobody has kept anyone, and the row highlight
  // carries the kept state on its own once they have.
  assert.equal(OWNER_COLUMN_LABEL, 'On team');
});

// ── Team chip order ─────────────────────────────────────────────────────────

test('team chips are alphabetical, not creation order', () => {
  const creationOrder = [
    { id: 'a', name: 'Ben Sh.' }, { id: 'b', name: 'Kyle' }, { id: 'c', name: 'Ryan' },
    { id: 'd', name: 'Ben Sc.' }, { id: 'e', name: 'Zach' }, { id: 'f', name: 'Mark C' },
    { id: 'g', name: 'Graham' },
  ];
  const chips = sharedFilterChips({ league: AUCTION, locked: false, termed: false, hasExpired: false, teams: creationOrder });
  const teamLabels = chips.filter(c => c.id.startsWith('team:')).map(c => c.label);
  assert.deepEqual(teamLabels, ['Ben Sc.', 'Ben Sh.', 'Graham', 'Kyle', 'Mark C', 'Ryan', 'Zach']);
  assert.equal(chips[0].id, 'keepable', '"All players" stays pinned first');
});

test('sortTeamsByName does not mutate or drop teams', () => {
  const input = [{ id: 'b', name: 'Zach' }, { id: 'a', name: 'Alice' }];
  const out = sortTeamsByName(input);
  assert.equal(input[0].name, 'Zach', 'input order is untouched');
  assert.deepEqual(out.map(t => t.id), ['a', 'b']);
  assert.equal(sortTeamsByName([]).length, 0);
  assert.equal(sortTeamsByName(undefined).length, 0);
});

// ── One flat list, kept pinned ──────────────────────────────────────────────

test('kept players pin to the top, everyone else keeps the sort order', () => {
  const list = [
    { player: 'Expensive Guy', kind: 'rostered', cost: 90 },
    { player: 'Kept Cheap', kind: 'keeper', cost: 10 },
    { player: 'Mid Guy', kind: 'rostered', cost: 50 },
    { player: 'Kept Pricey', kind: 'keeper', cost: 70 },
  ];
  const out = keepersFirst(list);
  assert.deepEqual(out.map(r => r.player),
    ['Kept Cheap', 'Kept Pricey', 'Expensive Guy', 'Mid Guy'],
    'keepers lift to the top; order WITHIN each group is preserved');
});

test('keepersFirst is stable and works on wrapped rows', () => {
  const wrapped = [
    { row: { player: 'A', kind: 'rostered' } },
    { row: { player: 'B', kind: 'keeper' } },
    { row: { player: 'C', kind: 'rostered' } },
  ];
  assert.deepEqual(keepersFirst(wrapped, x => x.row).map(x => x.row.player), ['B', 'A', 'C']);
});

test('rostered view pins league-wide keepers above everyone else', () => {
  const sorted = keepersFirst(sortRowsDefault(buildSharedRows(AUCTION), null, AUCTION));
  const firstNonKeeper = sorted.findIndex(r => r.kind !== 'keeper');
  const lastKeeper = sorted.map(r => r.kind).lastIndexOf('keeper');
  assert.ok(lastKeeper < firstNonKeeper, 'no keeper appears below a non-keeper');
  assert.equal(sorted[0].player, 'Josh Allen', 'the declared keeper leads the list');
  assert.equal(sorted.length, buildSharedRows(AUCTION).length, 'nothing is dropped by pinning');
});

// ── Render smoke ────────────────────────────────────────────────────────────
// The page going out to the league — rendered on the desktop table path so a
// runtime error in the flattened table fails here rather than in front of
// twelve leaguemates.

function renderPage(league, isDark) {
  return renderToStaticMarkup(React.createElement(SharedLeaguePage, { league, isDark }));
}

test('page renders on both themes with no section labels left', () => {
  for (const isDark of [false, true]) {
    const html = renderPage(AUCTION, isDark);
    assert.ok(html.length > 500, 'page rendered');
    assert.ok(!/Eligible, not protected/i.test(html), 'the section label is gone');
    assert.ok(html.includes('Cost to keep') && html.includes('On team'), 'renamed headers present');
    assert.ok(/Search players/.test(html), 'search still on the page');
  }
});

test('page renders for a termed league too (hockey path untouched)', () => {
  const html = renderPage(TERMED, false);
  assert.ok(html.length > 500);
  assert.ok(!/Eligible, not protected/i.test(html));
  assert.ok(html.includes('Contract'), 'termed leagues keep the Contract header');
});

// ── Rules modal ─────────────────────────────────────────────────────────────
// The facts are DERIVED from the same config the app computes costs from, so
// the rules a member reads can't drift from the rules the app applies.

const factMap = (league) => new Map(keeperRuleFacts(league).map(f => [f.key, f]));

test('rules: an auction league states its escalation and undrafted floor', () => {
  const f = factMap(AUCTION);
  assert.equal(f.get('cost').value, 'Auction dollars');
  assert.match(f.get('cost').detail, /\$5 each year/);
  assert.equal(f.get('undrafted').value, '$5');
  assert.equal(f.get('term').value, 'No limit');
  assert.equal(f.get('slots').value, '4');
});

test('rules: escalation copy follows the config, including zero', () => {
  const flat = { ...AUCTION, auctionRules: { costIncreasePerYear: 0, undraftedStartCost: 12 } };
  const f = factMap(flat);
  assert.match(f.get('cost').detail, /no escalation/i);
  assert.equal(f.get('undrafted').value, '$12');
});

test('rules: a termed league says how long and what happens after', () => {
  const f = factMap(TERMED);
  assert.equal(f.get('term').value, '3 years');
  assert.match(f.get('term').detail, /back into the draft/i);
  assert.equal(f.get('cost').value, 'A roster slot');
});

test('rules: a pick-cost league states the pick, escalation and waiver round', () => {
  const picks = {
    ...TERMED, keeperCostModel: 'picks', termModel: 'none', termYears: null, contractYears: null,
    pickRules: { subModel: 'draftedRound', escalationPerYear: 1, waiverRound: 'last' },
  };
  const f = factMap(picks);
  assert.equal(f.get('cost').value, 'A draft pick');
  assert.match(f.get('cost').detail, /round he was drafted/i);
  assert.equal(f.get('escalation').value, '−1 round');
  assert.equal(f.get('waiver').value, 'Last round');
});

test('rules: slot counts say whether every slot must be filled', () => {
  assert.match(factMap({ ...AUCTION, mustFillSlots: true }).get('slots').detail, /must be filled/i);
  assert.match(factMap(AUCTION).get('slots').detail, /fewer is fine/i);
});

test('rules: rookie rules appear only when enabled', () => {
  assert.ok(!factMap(AUCTION).has('rookies'));
  const withRookies = { ...AUCTION, rookieRules: { enabled: true, extraYears: 1, freeFirstYear: true } };
  assert.ok(factMap(withRookies).has('rookies'));
});

test('rules: notes are omitted when blank, and preserved when written', () => {
  assert.deepEqual(ruleNotes(AUCTION), []);
  assert.deepEqual(ruleNotes({ ...AUCTION, sharedRulesNote: '   ' }), [], 'whitespace is not content');
  const notes = ruleNotes({ ...AUCTION, sharedRulesNote: 'No trades after week 12.', sharedPayoutsNote: '1st $500' });
  assert.deepEqual(notes.map(n => n.title), ['House rules', 'Payouts']);
  assert.equal(notes[0].body, 'No trades after week 12.');
});

test('rules modal renders derived facts, and written notes only when present', () => {
  const bare = renderToStaticMarkup(React.createElement(LeagueRulesModal,
    { league: AUCTION, isDark: false, onClose() {} }));
  assert.ok(bare.includes('Auction dollars'), 'derived facts render');
  assert.ok(!/House rules/.test(bare), 'no empty note headings');

  const withNotes = renderToStaticMarkup(React.createElement(LeagueRulesModal,
    { league: { ...AUCTION, sharedRulesNote: 'Trade deadline is week 12.' }, isDark: true, onClose() {} }));
  assert.ok(withNotes.includes('House rules'));
  assert.ok(withNotes.includes('Trade deadline is week 12.'));
});

// ── One grid on every view ──────────────────────────────────────────────────

test('page: the team header block is gone, and the grid is identical on both views', () => {
  const html = renderPage(AUCTION, false);
  assert.ok(!/keepers declared/i.test(html), 'the team header block is removed');
  assert.ok(html.includes('Rules'), 'the rules trigger is beside the league name');
});

// ── The Rules button actually opens something ───────────────────────────────
// Regression: the trigger and its state lived on the page while the modal
// render had landed in InvalidLinkPage, so clicking did nothing and nothing
// threw. The old tests passed because they rendered the button and the modal
// SEPARATELY — never the wiring between them. These render the trigger in its
// open state, which is the thing that was broken.

test('rules button: open state renders the modal, not just the trigger', () => {
  const closed = renderToStaticMarkup(React.createElement(RulesButton,
    { league: AUCTION, isDark: false }));
  assert.ok(closed.includes('Rules'), 'the trigger renders');
  // The closed trigger carries aria-label="League rules", so the dialog role
  // is the only honest marker of "a modal is on screen".
  assert.ok(!closed.includes('role="dialog"'), 'nothing is open yet');

  const open = renderToStaticMarkup(React.createElement(RulesButton,
    { league: AUCTION, isDark: false, defaultOpen: true }));
  assert.ok(open.includes('role="dialog"'), 'the modal renders from the trigger itself');
  assert.ok(open.includes('Auction dollars'), 'and it carries the derived facts');
});

test('invalid-link page renders on its own — no stray rules wiring', () => {
  const html = renderToStaticMarkup(React.createElement(InvalidLinkPage, { isDark: false }));
  assert.ok(/no longer valid/i.test(html), 'the invalid-link state still renders');
  assert.ok(!/League rules/.test(html), 'and carries no orphaned modal');
});

// ── The search survives its own filter ──────────────────────────────────────

test('search bar persists when the search matches nothing', () => {
  // Without this, a member who mistypes has no way to clear the box short of
  // reloading: the input was inside the table, and the table was gone.
  const noMatch = { ...AUCTION, teams: [{ id: 't1', name: 'Alpha', priorKeepers: [], roster: [], keepers: [] }] };
  const html = renderPage(noMatch, false);
  assert.ok(/Search players/.test(html), 'the filter control outlives the results');
  assert.ok(/Nothing here yet|No players match/.test(html), 'and the empty message shows');
});

test('search bar survives on a hockey view where only goalies match', () => {
  // The toolbar rode on the skaters table; an all-goalie result set emptied
  // that table and took the search with it.
  const goaliesOnly = {
    ...TERMED,
    teams: [{ id: 't1', name: 'Alpha', priorKeepers: [], keepers: [], roster: [{ player: 'Igor Shesterkin', pos: 'G' }] }],
  };
  const html = renderPage(goaliesOnly, false);
  assert.ok(/Search players/.test(html), 'search renders even with no skaters');
  assert.ok(/Igor Shesterkin/.test(html), 'and the goalie table still renders');
});

// ── Ownership: roster wins, draft supplies the price ────────────────────────
// The reported bug: a commissioner imported last year's draft, then the
// rosters. Every traded or dropped player then showed under the team that
// DRAFTED him instead of the team that finished the season with him — and the
// team that actually had him saw him as an undrafted pickup at the floor
// price. One root cause, three surfaces.

const TRADED = {
  id: 'football-2', name: 'Traded', sport: 'football', draftType: 'auction',
  keeperCostModel: 'auction', termModel: 'none', keeperSlots: 4,
  auctionRules: { costIncreasePerYear: 5, undraftedStartCost: 5 },
  teams: [
    {
      id: 'alpha', name: 'Alpha', keepers: [],
      // Alpha DRAFTED Caleb for $40 and no longer has him.
      priorKeepers: [{ player: 'Caleb Williams', keptFor: 40 }],
      roster: [{ player: 'Alpha Own Guy' }],
    },
    {
      id: 'beta', name: 'Beta', keepers: [], priorKeepers: [],
      // Beta finished the season with him.
      roster: [{ player: 'Caleb Williams' }, { player: 'Beta Own Guy' }],
    },
  ],
};

test('ownership: a drafted-by-A, rostered-by-B player belongs to B on the shared page', () => {
  const row = buildSharedRows(TRADED).find(r => r.player === 'Caleb Williams');
  assert.ok(row, 'the player must still appear');
  assert.equal(row.teamName, 'Beta', 'the roster decides ownership, not the draft');
  assert.equal(row.draftedCost, 40, "and carries A's drafted price");
  assert.equal(row.cost, 45, 'so the keep cost escalates off that price, not the floor');
  assert.equal(buildSharedRows(TRADED).filter(r => r.player === 'Caleb Williams').length, 1,
    'exactly one row — not one per source');
});

test('ownership: the keeper pool moves him too, at the right price', () => {
  const alpha = buildTeamPool(TRADED, TRADED.teams[0]);
  const beta = buildTeamPool(TRADED, TRADED.teams[1]);
  const inPool = (pool) => [...pool.onContract, ...pool.rosteredNoContract]
    .find(e => e.player === 'Caleb Williams');

  assert.equal(inPool(alpha), undefined, 'Alpha cannot keep a player they no longer roster');
  const held = inPool(beta);
  assert.ok(held, 'Beta can');
  assert.equal(held.kind, 'contract', 'as a contract, not an undrafted pickup');
  assert.equal(held.nextCost, 45, 'at $40 + $5/yr — NOT the $5 undrafted floor');
  assert.equal(held.wasCost, 40);
});

test('ownership: the status index names the roster team, not the drafting team', () => {
  const entry = buildStatusIndex(TRADED).get('calebwilliams');
  assert.equal(entry.teamName, 'Beta');
});

test('ownership: a declared keeper still wins — that is an explicit act', () => {
  // Alpha DECLARED him a keeper. That is a commissioner decision, not an
  // import artifact, so it is not overridden by roster data.
  const declared = {
    ...TRADED,
    teams: [
      { ...TRADED.teams[0], keepers: [{ player: 'Caleb Williams', keptFor: 45 }] },
      TRADED.teams[1],
    ],
  };
  const row = buildSharedRows(declared).find(r => r.player === 'Caleb Williams');
  assert.equal(row.kind, 'keeper');
  assert.equal(row.teamName, 'Alpha', 'a declared keeper is deliberate and stands');
});

test('ownership: a drafted player on NOBODY\'s roster stays with the drafting team', () => {
  // Rosters can be incomplete mid-import. Dropping him silently would be
  // worse than showing him under the team that paid for him.
  const cut = {
    ...TRADED,
    teams: [TRADED.teams[0], { ...TRADED.teams[1], roster: [{ player: 'Beta Own Guy' }] }],
  };
  const row = buildSharedRows(cut).find(r => r.player === 'Caleb Williams');
  assert.ok(row, 'not dropped');
  assert.equal(row.teamName, 'Alpha');
});

test('ownership: a draft-only league (no rosters imported) is unaffected', () => {
  const draftOnly = {
    ...TRADED,
    teams: TRADED.teams.map(t => ({ ...t, roster: [] })),
  };
  const pool = buildTeamPool(draftOnly, draftOnly.teams[0]);
  assert.equal(pool.onContract.length, 1, 'the drafting team keeps its whole pool');
  assert.equal(pool.onContract[0].player, 'Caleb Williams');
});

test('ownership: rosters and draft agreeing is unchanged', () => {
  // The ordinary case — same team in both sources — must be untouched.
  const pool = buildTeamPool(AUCTION, AUCTION.teams[0]);
  const chase = pool.onContract.find(e => e.player === "Ja'Marr Chase");
  assert.ok(chase, 'still on contract to the team that drafted AND rosters him');
  assert.equal(chase.nextCost, 88);
  assert.equal(pool.rosteredNoContract.length, 1, 'and his teammate is still an undrafted row');
  assert.equal(pool.rosteredNoContract[0].player, 'Undrafted Rookie');
});

// ── Price provenance reaching the public page ───────────────────────────────
// The commissioner can now type over a calculated keep cost. keptFor is
// deliberately the field that holds the value IN FORCE (the calculated one
// moves to keptForComputed), precisely so this page — which reads through a
// SQL projection naming keptFor and nothing else — shows the price actually in
// force with no migration. If that ever inverts, leaguemates start seeing
// pre-edit prices, so it gets a test here rather than only in the app.

test('an overridden keep cost is what the shared page shows', () => {
  const edited = {
    ...AUCTION,
    teams: AUCTION.teams.map(t => ({
      ...t,
      keepers: (t.keepers || []).map(k => ({ ...k, keptFor: 120, keptForComputed: 88, keptForOverridden: true })),
    })),
  };
  const keeperRows = buildSharedRows(edited).filter(r => r.kind === 'keeper');
  assert.ok(keeperRows.length > 0, 'fixture has at least one declared keeper');
  keeperRows.forEach(r => assert.equal(r.cost, 120, 'the page shows the price in force, not the calculated one'));
});

test('an overridden DRAFTED price flows into the calculated keep cost', () => {
  // The escalation reads the prior record's keptFor, so correcting a bad
  // imported price has to change what the page quotes.
  const before = buildSharedRows(AUCTION).find(r => r.player === "Ja'Marr Chase");
  const corrected = {
    ...AUCTION,
    teams: AUCTION.teams.map(t => ({
      ...t,
      priorKeepers: (t.priorKeepers || []).map(p => p.player === "Ja'Marr Chase"
        ? { ...p, keptFor: 100, keptForComputed: 83, keptForOverridden: true }
        : p),
    })),
  };
  const after = buildSharedRows(corrected).find(r => r.player === "Ja'Marr Chase");
  assert.notEqual(after.cost, before.cost, 'the quoted keep cost moves with the corrected price');
  assert.equal(after.draftedCost, 100, 'and the "drafted" line shows the corrected price');
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} SHARED-PAGE TESTS PASS`);
