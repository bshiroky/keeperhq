// Unit tests for src/lib/nflDirectory.js — run via `npm run test:nfl`
// (plain node, no framework). Covers the row mapping, the match key, the
// disambiguation rules, and the cross-platform id summary. The I/O half
// (Sleeper fetch / Supabase) is deliberately not exercised here.
import assert from 'node:assert/strict';
import {
  directoryKey, normalizeProTeam, sleeperToRow, sleeperPayloadToRows,
  summarizeCrossIds, pct, pickDirectoryMatch, importFieldsFor, isNflSport,
  chunkRowsByBytes, writeDirectoryRows, diagnoseWrite,
} from '../src/lib/nflDirectory.js';

let passed = 0;
// Async variant — the write tests await their assertions, and a sync runner
// would report a rejected promise as a pass.
async function atest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
}

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

// ── Chunked, self-healing writes ────────────────────────────────────────────
// These are the regression tests for the real failure: a 12,221-player refresh
// that died at row 750 with "TypeError: Failed to fetch". Fixed-size ROW
// chunks meant wildly varying REQUEST sizes, so the tests below hold the byte
// budget and prove the writer recovers from both candidate causes.

// Rows of a known serialized size, so byte budgets are exact rather than
// approximate.
const padTo = (bytes, i) => {
  const row = { player_id: `p${i}`, data: '' };
  const overhead = JSON.stringify(row).length;
  return { ...row, data: 'x'.repeat(Math.max(0, bytes - overhead)) };
};
const noSleep = () => {};

test('chunkRowsByBytes: bounds request size instead of row count', () => {
  const rows = Array.from({ length: 10 }, (_, i) => padTo(1000, i));
  const chunks = chunkRowsByBytes(rows, 3000);
  assert.ok(chunks.every(c => JSON.stringify(c).length <= 3200), 'no chunk blows the budget');
  assert.equal(chunks.flat().length, 10, 'every row is still sent exactly once');
});

test('chunkRowsByBytes: an oversized single row still gets sent, never dropped', () => {
  const chunks = chunkRowsByBytes([padTo(5000, 1), padTo(100, 2)], 1000);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 1);
  assert.equal(chunks.flat().length, 2);
});

await atest('write: happy path sends everything once', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => padTo(200, i));
  const seen = [];
  const stats = await writeDirectoryRows({
    rows, budgetBytes: 1000, sleep: noSleep,
    call: async chunk => { seen.push(...chunk.map(r => r.player_id)); return chunk.length; },
  });
  assert.equal(stats.written, 50);
  assert.equal(new Set(seen).size, 50);
  assert.equal(stats.retries, 0);
  assert.equal(stats.splits, 0);
});

await atest('write: a transient failure is retried with backoff, not surfaced', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => padTo(200, i));
  let calls = 0;
  const delays = [];
  const stats = await writeDirectoryRows({
    rows, budgetBytes: 1000, sleep: ms => { delays.push(ms); },
    call: async chunk => {
      calls++;
      // Fail the second request once, the way a dropped connection would.
      if (calls === 2) throw new TypeError('Failed to fetch');
      return chunk.length;
    },
  });
  assert.equal(stats.written, 20, 'every row still lands');
  assert.equal(stats.retries, 1);
  assert.equal(stats.splits, 0, 'a one-off drop must not trigger a split');
  assert.ok(delays.length === 1 && delays[0] >= 500, `backoff applied, got ${delays[0]}`);
  assert.match(diagnoseWrite(stats), /retry/i);
});

await atest('write: backoff grows exponentially across attempts', async () => {
  const delays = [];
  let calls = 0;
  await writeDirectoryRows({
    rows: [padTo(200, 1)], budgetBytes: 1000, sleep: ms => { delays.push(ms); },
    call: async () => { calls++; if (calls <= 3) throw new TypeError('Failed to fetch'); return 1; },
  });
  assert.equal(delays.length, 3);
  assert.ok(delays[0] >= 500 && delays[0] < 700, `first ~500ms, got ${delays[0]}`);
  assert.ok(delays[1] >= 1000 && delays[1] < 1200, `second ~1s, got ${delays[1]}`);
  assert.ok(delays[2] >= 2000 && delays[2] < 2200, `third ~2s, got ${delays[2]}`);
});

await atest('write: a size limit is discovered by splitting, and every row lands', async () => {
  // The failure mode the real run most likely hit: anything over a byte
  // threshold gets no response at all.
  const LIMIT = 2500;
  const rows = Array.from({ length: 40 }, (_, i) => padTo(300, i));
  const written = [];
  const stats = await writeDirectoryRows({
    rows, budgetBytes: 100000, sleep: noSleep, // deliberately over the limit
    call: async chunk => {
      if (JSON.stringify(chunk).length > LIMIT) throw new TypeError('Failed to fetch');
      written.push(...chunk.map(r => r.player_id));
      return chunk.length;
    },
  });
  assert.equal(stats.written, 40, 'the run completes despite the limit');
  assert.equal(new Set(written).size, 40, 'no row is lost or double-counted');
  assert.ok(stats.splits > 0, 'splitting is what recovered it');
  assert.match(diagnoseWrite(stats), /too large/i);
});

await atest('write: reports how far it got when a row is genuinely unwritable', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => padTo(200, i));
  let calls = 0;
  await assert.rejects(
    writeDirectoryRows({
      rows, budgetBytes: 400, sleep: noSleep,
      call: async chunk => {
        calls++;
        // First chunk lands; everything after it is permanently broken.
        if (calls === 1) return chunk.length;
        throw new TypeError('Failed to fetch');
      },
    }),
    err => {
      assert.ok(err.stats.written > 0, 'partial progress is reported, not discarded');
      assert.ok(err.stats.written < 10);
      assert.match(err.message, /row\(s\) \/ \d+KB failed/, 'the message names the failing chunk size');
      return true;
    },
  );
});

await atest('write: an auth failure aborts immediately instead of retrying 12k rows', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => padTo(200, i));
  let calls = 0;
  await assert.rejects(
    writeDirectoryRows({
      rows, budgetBytes: 400, sleep: noSleep,
      call: async () => {
        calls++;
        throw Object.assign(new Error('JWT expired'), { fatal: true });
      },
    }),
    /JWT expired/,
  );
  assert.equal(calls, 1, 'no retries, no splits — waiting and shrinking cannot fix auth');
});

await atest('write: progress is reported throughout, not only at the end', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => padTo(200, i));
  const seen = [];
  await writeDirectoryRows({
    rows, budgetBytes: 500, sleep: noSleep,
    onProgress: p => seen.push(p.done),
    call: async chunk => chunk.length,
  });
  assert.ok(seen.length > 3, `expected progress per chunk, got ${seen.length} updates`);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'progress only moves forward');
  assert.equal(seen[seen.length - 1], 30);
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} NFL-DIRECTORY TESTS PASS`);
