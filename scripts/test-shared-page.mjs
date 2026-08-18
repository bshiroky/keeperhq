// Tests for the shared league page's data + rail rules — run via
// `npm run test:shared`. Plain node over an esbuild bundle (see the entry
// file); no rendering.
//
// The load-bearing claim these protect: the default "All players" view is the
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
  assert.equal(chips[0].label, 'All players');
  assert.deepEqual(chips.slice(1).map(c => c.label), ['Alpha', 'Beta', 'Gamma'],
    'all players + per-team chips is the whole rail');
});

test('rail: a league WITH a term keeps its "under contract" chip', () => {
  const chips = sharedFilterChips({ league: TERMED, locked: false, termed: true, hasExpired: false, teams: TERMED.teams });
  assert.ok(chips.some(c => c.id === 'contracts' && c.label === 'Under contract'),
    'being under contract is a real state where terms exist');
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

test('columns: the owner column says who holds the player', () => {
  assert.equal(OWNER_COLUMN_LABEL, 'Kept by');
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

test('all-players view pins league-wide keepers above everyone else', () => {
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
    assert.ok(html.includes('Cost to keep') && html.includes('Kept by'), 'renamed headers present');
    assert.ok(/Search players/.test(html), 'search still on the page');
  }
});

test('page renders for a termed league too (hockey path untouched)', () => {
  const html = renderPage(TERMED, false);
  assert.ok(html.length > 500);
  assert.ok(!/Eligible, not protected/i.test(html));
  assert.ok(html.includes('Contract'), 'termed leagues keep the Contract header');
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} SHARED-PAGE TESTS PASS`);
