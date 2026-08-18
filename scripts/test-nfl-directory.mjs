// Unit tests for src/lib/nflDirectory.js — run via `npm run test:nfl`
// (plain node, no framework). Covers the row mapping, the match key, the
// disambiguation rules, and the cross-platform id summary. The I/O half
// (Sleeper fetch / Supabase) is deliberately not exercised here.
import assert from 'node:assert/strict';
import {
  directoryKey, normalizeProTeam, sleeperToRow, sleeperPayloadToRows,
  summarizeCrossIds, pct, pickDirectoryMatch, importFieldsFor, isNflSport,
} from '../src/lib/nflDirectory.js';

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

// A trimmed slice of Sleeper's payload shape, including the cases that matter:
// a team defense (non-numeric player_id), a punctuated name, a null yahoo_id
// (Sleeper's own docs show one for Tom Brady), and an inactive player.
const PAYLOAD = {
  '4881': {
    player_id: '4881', first_name: 'A.J.', last_name: 'Brown', full_name: 'A.J. Brown',
    search_full_name: 'ajbrown', team: 'PHI', position: 'WR', fantasy_positions: ['WR'],
    status: 'Active', number: 11, years_exp: 6,
    yahoo_id: '31883', espn_id: '3915416', sportradar_id: 'sr:1', rotowire_id: '13154',
    stats_id: null, fantasy_data_id: 20889,
  },
  '6790': {
    player_id: '6790', first_name: 'AJ', last_name: 'Brown', full_name: 'AJ Brown',
    search_full_name: 'ajbrown', team: 'CIN', position: 'TE', fantasy_positions: ['TE'],
    status: 'Inactive', number: null, years_exp: 1,
    yahoo_id: null, espn_id: '4242222',
  },
  'CAR': {
    player_id: 'CAR', first_name: 'Carolina', last_name: 'Panthers', full_name: 'Carolina Panthers',
    search_full_name: 'carolinapanthers', team: 'CAR', position: 'DEF', fantasy_positions: ['DEF'],
    status: 'Active', yahoo_id: null, espn_id: null,
  },
  'junk': { first_name: '', last_name: '' },
};

test('directoryKey: punctuation and spacing are noise', () => {
  assert.equal(directoryKey('A.J. Brown'), 'ajbrown');
  assert.equal(directoryKey('AJ Brown'), 'ajbrown');
  assert.equal(directoryKey("Ja'Marr Chase"), 'jamarrchase');
  assert.equal(directoryKey('Amon-Ra St. Brown'), 'amonrastbrown');
});

test('directoryKey agrees with Sleeper search_full_name on real names', () => {
  for (const p of Object.values(PAYLOAD)) {
    if (!p.search_full_name || !p.full_name) continue;
    assert.equal(directoryKey(p.full_name), p.search_full_name,
      `${p.full_name}: ours ${directoryKey(p.full_name)} vs Sleeper ${p.search_full_name}`);
  }
});

test('normalizeProTeam: Yahoo abbreviations map onto Sleeper', () => {
  assert.equal(normalizeProTeam('Buf'), 'BUF');
  assert.equal(normalizeProTeam('WSH'), 'WAS');
  assert.equal(normalizeProTeam('JAC'), 'JAX');
  assert.equal(normalizeProTeam('OAK'), 'LV');
  assert.equal(normalizeProTeam(''), '');
});

test('sleeperToRow: promotes columns, keeps the raw object', () => {
  const row = sleeperToRow('4881', PAYLOAD['4881']);
  assert.equal(row.player_id, '4881');
  assert.equal(row.search_key, 'ajbrown');
  assert.equal(row.pos, 'WR');
  assert.equal(row.jersey_number, 11);
  assert.equal(row.yahoo_id, '31883');
  assert.equal(row.fantasy_data_id, '20889', 'numeric cross-platform ids stringify');
  assert.equal(row.stats_id, null, 'empty/null ids stay null, never ""');
  assert.equal(row.data, PAYLOAD['4881'], 'full unfiltered payload rides along');
});

test('sleeperToRow: team defenses (non-numeric ids) survive', () => {
  const row = sleeperToRow('CAR', PAYLOAD.CAR);
  assert.equal(row.player_id, 'CAR');
  assert.equal(row.pos, 'DEF');
});

test('sleeperPayloadToRows: unusable entries are skipped, not stored blank', () => {
  const rows = sleeperPayloadToRows(PAYLOAD);
  assert.equal(rows.length, 3);
  assert.ok(!rows.some(r => r.player_id === 'junk'));
});

test('summarizeCrossIds: fill rates measured against active players', () => {
  const s = summarizeCrossIds(sleeperPayloadToRows(PAYLOAD));
  assert.equal(s.total, 3);
  assert.equal(s.active, 2);          // A.J. Brown + CAR defense
  assert.equal(s.yahooActive, 1);
  assert.equal(s.espnActive, 1);
  assert.equal(s.yahooTotal, 1);
  assert.equal(s.espnTotal, 2);       // the inactive one has an espn_id too
  assert.equal(pct(1, 2), 50);
  assert.equal(pct(1, 0), 0);
});

// ── Disambiguation ──────────────────────────────────────────────────────────
const rows = sleeperPayloadToRows(PAYLOAD);
const brownCandidates = rows.filter(r => r.search_key === 'ajbrown');

test('pickDirectoryMatch: no candidates → unmatched, never a guess', () => {
  const r = pickDirectoryMatch([], { proTeam: 'PHI' });
  assert.equal(r.status, 'unmatched');
  assert.equal(r.row, null);
});

test('pickDirectoryMatch: single candidate matches with no hint', () => {
  const r = pickDirectoryMatch([brownCandidates[0]], {});
  assert.equal(r.status, 'matched');
  assert.equal(r.row.player_id, '4881');
});

test('pickDirectoryMatch: pro team from the paste separates same-name players', () => {
  const r = pickDirectoryMatch(brownCandidates, { proTeam: 'Cin' });
  assert.equal(r.status, 'matched');
  assert.equal(r.row.player_id, '6790');
});

test('pickDirectoryMatch: position separates them when team does not', () => {
  const r = pickDirectoryMatch(brownCandidates, { positions: 'WR' });
  assert.equal(r.status, 'matched');
  assert.equal(r.row.player_id, '4881');
});

test('pickDirectoryMatch: active status is the last tiebreak', () => {
  const r = pickDirectoryMatch(brownCandidates, {});
  assert.equal(r.status, 'matched');
  assert.equal(r.row.player_id, '4881', 'the active A.J. Brown wins over the inactive one');
});

test('pickDirectoryMatch: a true tie stays ambiguous for a human to pick', () => {
  const twins = [
    { player_id: 'a', search_key: 'johnsmith', team: 'NE', pos: 'RB', status: 'Active' },
    { player_id: 'b', search_key: 'johnsmith', team: 'NE', pos: 'RB', status: 'Active' },
  ];
  const r = pickDirectoryMatch(twins, { proTeam: 'NE', positions: 'RB' });
  assert.equal(r.status, 'ambiguous');
  assert.equal(r.row, null);
  assert.equal(r.candidates.length, 2);
});

test('pickDirectoryMatch: an unhelpful hint never eliminates every candidate', () => {
  // The paste says a team nobody in the list plays for — fall back to the
  // other signals instead of returning "unmatched" for a name we do have.
  const r = pickDirectoryMatch(brownCandidates, { proTeam: 'SEA' });
  assert.equal(r.status, 'matched');
  assert.equal(r.row.player_id, '4881');
});

test('importFieldsFor: id + source string on matched rows, source alone otherwise', () => {
  const matched = importFieldsFor(brownCandidates[0], '  A.J. Brown  ');
  assert.equal(matched.playerId, '4881');
  assert.equal(matched.pos, 'WR');
  assert.equal(matched.sourceName, 'A.J. Brown');

  const unmatched = importFieldsFor(null, 'AJ Brownn');
  assert.equal(unmatched.playerId, undefined);
  assert.equal(unmatched.sourceName, 'AJ Brownn', 'what was pasted is stored either way');
});

test('isNflSport: football only — other sports keep their current behavior', () => {
  assert.ok(isNflSport('football'));
  assert.ok(isNflSport('nfl'));
  assert.ok(!isNflSport('hockey'));
  assert.ok(!isNflSport('basketball'));
  assert.ok(!isNflSport('baseball'));
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} NFL-DIRECTORY TESTS PASS`);
