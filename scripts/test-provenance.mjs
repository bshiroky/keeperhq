// Price provenance, the change log, and the import-guard impact counts.
// Plain node, no framework — same shape as the other test scripts.
//
// These three are the pure half of the data-integrity work: if a re-import
// silently eats a hand-set price, or a guard under-counts what it's about to
// replace, it fails here rather than on the commissioner's live league.

import {
  priceOf, computedPriceOf, isPriceOverridden, setPrice, resetPrice,
  refreshComputedPrice, countOverriddenPrices, overriddenPricesIn,
} from '../src/lib/priceProvenance.js';
import {
  appendChanges, changeEntry, changeLogOf, describeChange, formatChangeTime, CHANGE_LOG_LIMIT,
} from '../src/lib/changeLog.js';
import {
  rosterImportImpact, draftImportImpact, priorKeepersImpact,
  picksImportImpact, rosterGuardLines, draftGuardLines, picksGuardLines,
} from '../src/lib/importGuard.js';
import { startNewSeason, advanceKeeper } from '../src/lib/season.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.error(`  ✗ ${name}${extra ? `\n      ${extra}` : ''}`);
}
function eq(name, actual, expected) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function section(title) { console.log(`\n${title}`); }

// ── priceProvenance ─────────────────────────────────────────────────────────
section('price provenance');

{
  const plain = { player: 'A', keptFor: 88 };
  eq('a plain row reads its price', priceOf(plain), 88);
  eq('a plain row IS its own computed value', computedPriceOf(plain), 88);
  ok('a plain row is not overridden', !isPriceOverridden(plain));
}

{
  const before = { player: 'A', keptFor: 88 };
  const patch = setPrice(before, 95);
  eq('override stores the typed value in force', patch.keptFor, 95);
  eq('override preserves the calculated value', patch.keptForComputed, 88);
  ok('override sets the flag', patch.keptForOverridden === true);

  const after = { ...before, ...patch };
  eq('the value in force is the override', priceOf(after), 95);
  eq('the calculated value is still readable', computedPriceOf(after), 88);
  ok('the row reads as overridden', isPriceOverridden(after));

  // Re-overriding must not lose the ORIGINAL calculated value.
  const again = { ...after, ...setPrice(after, 99) };
  eq('re-override keeps the original calculated value', computedPriceOf(again), 88);
  eq('re-override updates the value in force', priceOf(again), 99);

  const reset = { ...again, ...resetPrice(again) };
  eq('reset restores the calculated value', priceOf(reset), 88);
  ok('reset clears the flag', !isPriceOverridden(reset));
  eq('reset clears the preserved value', reset.keptForComputed, null);
}

{
  // Typing the calculated number back is not an override — otherwise a badge
  // sticks to a row nobody actually changed.
  const row = { player: 'A', keptFor: 88 };
  const same = { ...row, ...setPrice(row, 88) };
  ok('typing the calculated value back is not an override', !isPriceOverridden(same));

  const over = { ...row, ...setPrice(row, 95) };
  const back = { ...over, ...setPrice(over, 88) };
  ok('typing back TO the calculated value clears the override', !isPriceOverridden(back));
  eq('…and restores it as the value in force', priceOf(back), 88);
}

{
  // A row the import gave no price for: the calculated value is legitimately
  // null, which is exactly why the flag is not "the two numbers differ".
  const blank = { player: 'A' };
  const typed = { ...blank, ...setPrice(blank, 40) };
  ok('a price typed onto a price-less row is an override', isPriceOverridden(typed));
  eq('…with null as the calculated value', computedPriceOf(typed), null);
  const undone = { ...typed, ...resetPrice(typed) };
  eq('resetting it goes back to no price', priceOf(undone), null);
  ok('…and clears the flag', !isPriceOverridden(undone));
}

{
  // The whole point: a re-import refreshes the calculated value underneath
  // while the commissioner's number stays in force.
  const existing = { player: 'A', keptFor: 95, keptForComputed: 88, keptForOverridden: true };
  const refreshed = { player: 'A', ...refreshComputedPrice(existing, 90) };
  eq('re-import keeps the override in force', priceOf(refreshed), 95);
  eq('re-import refreshes the calculated value', computedPriceOf(refreshed), 90);
  ok('re-import keeps the row marked', isPriceOverridden(refreshed));

  const clean = { player: 'B', keptFor: 20 };
  const cleanRefreshed = { player: 'B', ...refreshComputedPrice(clean, 24) };
  eq('an un-edited row just takes the new price', priceOf(cleanRefreshed), 24);
  ok('…and stays unmarked', !isPriceOverridden(cleanRefreshed));

  const fresh = { player: 'C', ...refreshComputedPrice(undefined, 12) };
  eq('a player not previously on file takes the imported price', priceOf(fresh), 12);
  ok('…and is not marked', !isPriceOverridden(fresh));
  eq('…and carries no provenance keys', Object.keys(fresh).sort(), ['keptFor', 'player']);
}

{
  const list = [
    { player: 'A', keptFor: 95, keptForComputed: 88, keptForOverridden: true },
    { player: 'B', keptFor: 20 },
    { player: 'C', keptFor: 5, keptForComputed: null, keptForOverridden: true },
  ];
  eq('counts hand-set prices', countOverriddenPrices(list), 2);
  eq('an empty list counts zero', countOverriddenPrices([]), 0);
  eq('a missing list counts zero', countOverriddenPrices(undefined), 0);

  const league = { teams: [
    { id: 't1', name: 'Ryan', keepers: [list[0]], priorKeepers: [list[1], list[2]] },
    { id: 't2', name: 'Blake', keepers: [], priorKeepers: [] },
  ] };
  eq('finds hand-set prices across both record types', overriddenPricesIn(league).map(o => `${o.kind}:${o.player}`), ['keeper:A', 'draft:C']);
}

// ── season rollover ─────────────────────────────────────────────────────────
section('season rollover');

{
  const league = { season: '2025-26', auctionRules: { costIncreasePerYear: 5 }, keeperCostModel: 'auction', teams: [] };
  const kept = advanceKeeper({ player: 'A', keptFor: 95, keptForComputed: 88, keptForOverridden: true }, league);
  eq('the price in force is what escalates', kept.keptFor, 100);
  ok('the new price reads as calculated, not edited', !isPriceOverridden(kept));
  eq('the stale calculated value is cleared', kept.keptForComputed, null);
}

{
  const league = {
    season: '2025-26', keeperCostModel: 'auction', auctionRules: { costIncreasePerYear: 5 },
    teams: [{ id: 't1', name: 'Ryan', keepers: [{ player: 'A', keptFor: 20 }], priorKeepers: [] }],
  };
  const rolled = startNewSeason(league);
  eq('rollover advances the season label', rolled.season, '2026-27');
  eq('rollover records itself in the log', changeLogOf(rolled)[0].kind, 'season');
  eq('rollover carries keepers forward', rolled.teams[0].priorKeepers.length, 1);
}

// ── change log ──────────────────────────────────────────────────────────────
section('change log');

{
  const league = { name: 'L', teams: [] };
  eq('a league with no log reads as empty', changeLogOf(league), []);
  eq('appending nothing returns the same object', appendChanges(league, []), league);
  ok('appending nothing is identity, not a copy', appendChanges(league, []) === league);

  const one = appendChanges(league, changeEntry({
    kind: 'price', teamName: 'Ryan', player: 'A', from: 88, to: 95, at: '2026-08-20T12:00:00.000Z',
  }));
  eq('one entry lands', changeLogOf(one).length, 1);
  eq('the league is not mutated', changeLogOf(league).length, 0);

  const two = appendChanges(one, changeEntry({
    kind: 'price', teamName: 'Ryan', player: 'B', from: 10, to: 12, at: '2026-08-20T13:00:00.000Z',
  }));
  eq('newest entry is first', changeLogOf(two)[0].player, 'B');

  // A batch appended in one call keeps its own order, newest first.
  const batch = appendChanges(league, [
    changeEntry({ kind: 'term', field: 'contractYear', player: 'X', from: 1, to: 2, at: '2026-08-20T12:00:00.000Z' }),
    changeEntry({ kind: 'term', field: 'contractLength', player: 'X', from: 3, to: 4, at: '2026-08-20T12:00:00.000Z' }),
  ]);
  eq('a batch lands newest-first', changeLogOf(batch).map(e => e.field), ['contractLength', 'contractYear']);
}

{
  // The cap is what keeps an append-only array inside a jsonb blob bounded.
  let league = { teams: [] };
  const many = Array.from({ length: CHANGE_LOG_LIMIT + 20 }, (_, i) =>
    changeEntry({ kind: 'price', player: `P${i}`, from: i, to: i + 1, at: '2026-08-20T12:00:00.000Z' }));
  league = appendChanges(league, many);
  eq('the log is capped', changeLogOf(league).length, CHANGE_LOG_LIMIT);
  eq('the cap keeps the NEWEST entries', changeLogOf(league)[0].player, `P${CHANGE_LOG_LIMIT + 19}`);
}

{
  const d = describeChange(changeEntry({ kind: 'price', teamName: 'Ryan', player: 'A', from: 88, to: 95 }));
  eq('a price change names the player', d.subject, 'A');
  eq('…and shows both values', d.detail, '$88 → $95');
  eq('…and names the team', d.where, 'Ryan');

  const blank = describeChange(changeEntry({ kind: 'draftPrice', player: 'B', from: null, to: 40 }));
  eq('a price set on a blank row reads as a dash', blank.detail, '— → $40');

  const round = describeChange(changeEntry({ kind: 'round', player: 'C', from: null, to: 3 }));
  eq('a round change formats as rounds', round.detail, '— → R3');

  const imp = describeChange(changeEntry({ kind: 'import', field: 'roster', teamName: 'Ryan', note: '14 players imported' }));
  eq('an import names the team', imp.subject, 'Ryan');
  eq('…and what it did', imp.detail, '14 players imported');
}

{
  const now = Date.parse('2026-08-20T12:00:00.000Z');
  eq('a fresh change reads as just now', formatChangeTime('2026-08-20T11:59:40.000Z', now), 'just now');
  eq('minutes read as minutes', formatChangeTime('2026-08-20T11:30:00.000Z', now), '30 min ago');
  eq('hours read as hours', formatChangeTime('2026-08-20T09:00:00.000Z', now), '3 hours ago');
  eq('garbage reads as empty', formatChangeTime('not-a-date', now), '');
}

// ── import guards ───────────────────────────────────────────────────────────
section('import guards');

const guardLeague = {
  teams: [
    {
      id: 't1', name: 'Ryan',
      roster: [{ player: 'Nikola Jokic' }, { player: 'Luka Doncic' }, { player: 'Devin Booker' }],
      keepers: [
        { player: 'Nikola Jokic', keptFor: 47, keptForComputed: 42, keptForOverridden: true },
        { player: 'Luka Doncic', keptFor: 33 },
        { player: 'Anthony Davis', keptFor: 26 },
      ],
      priorKeepers: [
        { player: 'Nikola Jokic', keptFor: 42, acquisitionRound: 1 },
        { player: 'Luka Doncic', keptFor: 28, keptForComputed: 26, keptForOverridden: true },
      ],
    },
    { id: 't2', name: 'Blake', roster: [], keepers: [], priorKeepers: [] },
  ],
};

{
  const impact = rosterImportImpact(guardLeague, 't1', ['Nikola Jokic', 'Luka Doncic', 'Jayson Tatum']);
  eq('roster impact names the team', impact.teamName, 'Ryan');
  eq('roster impact counts what is replaced', impact.replacing, 3);
  eq('roster impact counts declared keepers', impact.keepers, 3);
  eq('roster impact names keepers missing from the paste', impact.keepersMissing, ['Anthony Davis']);
  ok('roster impact fires when a roster exists', impact.hasImpact);

  // Name matching goes through normalizeName, so punctuation/spacing can't
  // fake a "missing" keeper and scare the commissioner off a good import.
  const punct = rosterImportImpact(
    { teams: [{ id: 't1', name: 'R', roster: [{ player: 'x' }], keepers: [{ player: "Ryan O'Reilly" }] }] },
    't1', ['Ryan OReilly']);
  eq('punctuation differences do not read as a missing keeper', punct.keepersMissing, []);

  const empty = rosterImportImpact(guardLeague, 't2', ['Anyone']);
  ok('a first import has nothing at stake', !empty.hasImpact);
  eq('…and nothing to replace', empty.replacing, 0);

  const unknown = rosterImportImpact(guardLeague, 'nope', ['Anyone']);
  ok('an unknown team does not throw and has no impact', !unknown.hasImpact);
}

{
  const lines = rosterGuardLines(rosterImportImpact(guardLeague, 't1', ['Nikola Jokic', 'Luka Doncic']));
  ok('roster guard leads with the replacement', lines[0].tone === 'danger' && lines[0].text.includes('3 players'));
  ok('roster guard names the stranded keeper', lines.some(l => l.text.includes('Anthony Davis')));

  const clean = rosterGuardLines(rosterImportImpact(guardLeague, 't1', ['Nikola Jokic', 'Luka Doncic', 'Anthony Davis']));
  ok('roster guard reassures when no keeper is stranded', clean.some(l => l.tone === 'ok' && l.text.includes('unaffected')));
}

{
  const preview = [{ name: "Ryan's Team", players: [] }, { name: 'Blake FC', players: [] }];
  const mapping = { "Ryan's Team": 't1', 'Blake FC': 't2' };
  const impact = draftImportImpact(guardLeague, mapping, preview);
  eq('draft impact only counts teams with data on file', impact.teams.map(t => t.teamName), ['Ryan']);
  eq('draft impact counts rows being replaced', impact.replacing, 2);
  eq('draft impact counts surviving hand-set prices', impact.overrides, 1);
  eq('draft impact counts rounds being overwritten', impact.rounds, 1);
  eq('draft impact counts declared keepers league-wide', impact.declaredKeepers, 3);
  ok('draft impact fires', impact.hasImpact);

  const lines = draftGuardLines(impact);
  ok('draft guard says what is replaced', lines.some(l => l.tone === 'danger' && l.text.includes('2 draft rows')));
  ok('draft guard says hand-set prices survive', lines.some(l => l.tone === 'ok' && l.text.includes('1 hand-set price')));
  ok('draft guard says declared keepers are untouched', lines.some(l => l.tone === 'ok' && l.text.includes('3 declared keepers')));

  const unmapped = draftImportImpact(guardLeague, {}, preview);
  ok('an unmapped preview has no impact', !unmapped.hasImpact);

  const virgin = draftImportImpact(guardLeague, { 'Blake FC': 't2' }, preview);
  ok('a team with no draft on file has nothing at stake', !virgin.hasImpact);
}

{
  // The dormant contracts paste replaces priorKeepers by TEAM NAME rather than
  // through the Yahoo mapping, so it resolves ids itself — same counts either
  // way, one implementation.
  const byId = priorKeepersImpact(guardLeague, ['t1', 't2']);
  eq('a name-resolved replace counts the same rows', byId.replacing, 2);
  eq('…and the same surviving overrides', byId.overrides, 1);
  eq('…and ignores teams with nothing on file', byId.teams.map(t => t.teamName), ['Ryan']);
  eq('a duplicated team id is only counted once', priorKeepersImpact(guardLeague, ['t1', 't1']).replacing, 2);
  ok('no teams means no impact', !priorKeepersImpact(guardLeague, []).hasImpact);
}

section('pick-trade paste guard');

{
  // draftPicks is SPARSE: absent = the team owns its own pick. So only a pick
  // ALREADY recorded as traded can be destroyed by a paste.
  const picksLeague = {
    teams: [{ id: 't1', name: 'Ryan' }, { id: 't2', name: 'Blake' }, { id: 't3', name: 'Casey' }],
    draftPicks: { ownership: { '2:t1': 't2' } },
  };

  const agrees = picksImportImpact(picksLeague, [{ round: 2, originalTeamId: 't1', ownerTeamId: 't2' }]);
  ok('a paste that agrees with the grid is not a conflict', !agrees.hasImpact);

  const untouched = picksImportImpact(picksLeague, [{ round: 5, originalTeamId: 't1', ownerTeamId: 't3' }]);
  ok('writing an untraded pick destroys nothing', !untouched.hasImpact);

  const clash = picksImportImpact(picksLeague, [{ round: 2, originalTeamId: 't1', ownerTeamId: 't3' }]);
  ok('a paste that contradicts a recorded trade IS a conflict', clash.hasImpact);
  eq('the conflict names both owners', [clash.conflicts[0].from, clash.conflicts[0].to], ['Blake', 'Casey']);
  eq('…and whose pick it is', clash.conflicts[0].original, 'Ryan');

  const lines = picksGuardLines(clash);
  ok('the picks guard spells out the change', lines[0].text.includes("R2 Ryan's pick (Blake → Casey)"));
  ok('…and says untouched picks are safe', lines.some(l => l.tone === 'ok'));

  ok('an empty trade list has no impact', !picksImportImpact(picksLeague, []).hasImpact);
  ok('a league with no recorded trades has no impact', !picksImportImpact(
    { teams: picksLeague.teams }, [{ round: 2, originalTeamId: 't1', ownerTeamId: 't3' }]).hasImpact);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
