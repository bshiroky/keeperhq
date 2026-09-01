// Unit tests for src/lib/picksParse.js — `npm run test:parser` (plain node).
// Fixtures mirror Yahoo's Draft Picks page: the By Round view (with the
// concatenated-original-owner lines that make it hard), the Grid view used
// as a checksum, and the by-team fallback.
import assert from 'node:assert/strict';
import {
  parseDraftPicksText, parsePicksByRound, parsePicksGrid, segmentTeamNames, detectPicksFormat,
} from '../src/lib/picksParse.js';
import { normalizeTeamName } from '../src/lib/teamMap.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// The real 12 team names from the user's hockey league — emoji, apostrophes,
// asterisks, Cyrillic, a trailing "!" and a lowercase name that glues onto the
// one before it ("Brothe").
const TEAMS = [
  'My Cozen Finnie', "Ain't No Hellebuyck Girl", 'Da Real Dynasty', 'HAULA IF YOU HEAR ME!',
  "Oscar Meier's Wiener", 'Stop F***ing Crying Bro', 'the grit grinders', 'The Zamboni Driver!',
  "It's Hiller Time", 'Young Berube', 'ЦСКА Совки', '🚨 The Trade Show 🚨',
];
const [FINNIE, HELLEBUYCK, DYNASTY, HAULA, OSCAR, STOP, GRIT, ZAMBONI, HILLER, BERUBE, CSKA, TRADESHOW] = TEAMS;

// Verbatim Round 1 from the user's paste.
const ROUND_1 = `Round 1
Team\tPicks Owned
My Cozen Finnie
-
Ain't No Hellebuyck Girl
-
Da Real Dynasty
Da Real Dynasty
HAULA IF YOU HEAR ME!
HAULA IF YOU HEAR ME!🚨 The Trade Show 🚨
Oscar Meier's Wiener
Oscar Meier's Wiener
Stop F***ing Crying Bro
Ain't No Hellebuyck GirlStop F***ing Crying Brothe grit grinders
the grit grinders
-
The Zamboni Driver!
The Zamboni Driver!
It's Hiller Time
It's Hiller Time
Young Berube
Young Berube
ЦСКА Совки
ЦСКА Совки
🚨 The Trade Show 🚨
My Cozen Finnie
`;

const findPick = (r, round, original) => r.picks.find(p => p.round === round && p.originalName === original);

test('normalizeTeamName keeps Cyrillic and drops emoji/punctuation/case', () => {
  assert.equal(normalizeTeamName('ЦСКА Совки'), 'цскасовки');
  assert.equal(normalizeTeamName('🚨 The Trade Show 🚨'), 'thetradeshow');
  assert.equal(normalizeTeamName('Stop F***ing Crying Bro'), 'stopfingcryingbro');
  assert.equal(normalizeTeamName('Tim Stützle'), 'timstutzle');
});

test('detects the By Round view (each round header once)', () => {
  assert.equal(detectPicksFormat(ROUND_1), 'byRound');
});

test('Round 1 sample: 12 picks, 4 traded, exactly as the page reads', () => {
  const r = parseDraftPicksText(ROUND_1);
  assert.equal(r.format, 'byRound');
  assert.equal(r.error, undefined);
  assert.equal(r.teamCount, 12);
  assert.equal(r.totalPicks, 12);
  assert.equal(r.tradedCount, 4);
  assert.deepEqual(r.issues, []);
  // Da Real Dynasty holds its own.
  assert.equal(findPick(r, 1, DYNASTY).ownerName, DYNASTY);
  assert.equal(findPick(r, 1, DYNASTY).traded, false);
  // HAULA holds its own plus The Trade Show's.
  assert.equal(findPick(r, 1, TRADESHOW).ownerName, HAULA);
  // Stop F***ing Crying Bro holds three.
  assert.equal(findPick(r, 1, HELLEBUYCK).ownerName, STOP);
  assert.equal(findPick(r, 1, STOP).ownerName, STOP);
  assert.equal(findPick(r, 1, GRIT).ownerName, STOP);
  // My Cozen Finnie holds none; The Trade Show has it.
  assert.equal(findPick(r, 1, FINNIE).ownerName, TRADESHOW);
  assert.equal(r.picks.filter(p => p.ownerName === FINNIE).length, 0);
});

test('concatenated originals split on the normalised key ("Brothe" = Bro + the)', () => {
  const vocab = new Map(TEAMS.map(n => [normalizeTeamName(n), n]));
  const seg = segmentTeamNames("Ain't No Hellebuyck GirlStop F***ing Crying Brothe grit grinders", vocab);
  assert.deepEqual(seg.names, [HELLEBUYCK, STOP, GRIT]);
  assert.deepEqual(seg.residuals, []);
  assert.equal(seg.ambiguous, false);
  const emoji = segmentTeamNames('HAULA IF YOU HEAR ME!🚨 The Trade Show 🚨', vocab);
  assert.deepEqual(emoji.names, [HAULA, TRADESHOW]);
  const cyr = segmentTeamNames('ЦСКА СовкиYoung Berube', vocab);
  assert.deepEqual(cyr.names, [CSKA, BERUBE]);
});

test('an unmatchable chunk is reported in its raw spelling, never guessed', () => {
  const vocab = new Map(TEAMS.map(n => [normalizeTeamName(n), n]));
  const seg = segmentTeamNames('Young BerubeNobody Home FCЦСКА Совки', vocab);
  assert.deepEqual(seg.names, [BERUBE, CSKA]);
  assert.deepEqual(seg.residuals, ['Nobody Home FC']);
});

// ── Synthetic full paste: 17 rounds × 12 teams with a known trade set ───────
// Builds the By Round text from a trade map, so the expected totals are
// known by construction: 204 picks, and exactly the trades listed.
const TRADES = { // "round:original" → owner
  [`1:${TRADESHOW}`]: HAULA, [`1:${HELLEBUYCK}`]: STOP, [`1:${GRIT}`]: STOP, [`1:${FINNIE}`]: TRADESHOW,
  [`3:${CSKA}`]: BERUBE, [`3:${BERUBE}`]: CSKA,
  [`7:${OSCAR}`]: ZAMBONI, [`7:${HILLER}`]: ZAMBONI, [`7:${DYNASTY}`]: ZAMBONI,
  [`12:${STOP}`]: GRIT,
  [`17:${FINNIE}`]: HELLEBUYCK,
};
function ownerOf(round, original) { return TRADES[`${round}:${original}`] || original; }
function buildByRound(rounds = 17, trades = TRADES, teams = TEAMS) {
  const own = (round, original) => trades[`${round}:${original}`] || original;
  let out = '';
  for (let round = 1; round <= rounds; round++) {
    out += `Round ${round}\nTeam\tPicks Owned\n`;
    for (const owner of teams) {
      const held = teams.filter(orig => own(round, orig) === owner);
      out += `${owner}\n${held.length ? held.join('') : '-'}\n`;
    }
  }
  return out;
}
function buildGrid(rounds = 17, trades = TRADES, teams = TEAMS, { total = false } = {}) {
  const own = (round, original) => trades[`${round}:${original}`] || original;
  let out = `Team\t${Array.from({ length: rounds }, (_, i) => i + 1).join('\t')}${total ? '\tTotal' : ''}\n`;
  for (const owner of teams) {
    const counts = Array.from({ length: rounds }, (_, i) => teams.filter(orig => own(i + 1, orig) === owner).length);
    out += `${owner}\t${counts.join('\t')}${total ? `\t${counts.reduce((s, c) => s + c, 0)}` : ''}\n`;
  }
  return out;
}

test('17 rounds × 12 teams: 204 picks, every trade recovered, no issues', () => {
  const r = parseDraftPicksText(buildByRound());
  assert.equal(r.totalPicks, 204);
  assert.equal(r.teamCount, 12);
  assert.equal(r.rounds.length, 17);
  assert.equal(r.tradedCount, Object.keys(TRADES).length);
  assert.deepEqual(r.issues, []);
  for (const [key, owner] of Object.entries(TRADES)) {
    const [round, original] = [parseInt(key, 10), key.slice(key.indexOf(':') + 1)];
    const p = findPick(r, round, original);
    assert.equal(p.ownerName, owner, `${key} → ${owner}`);
    assert.equal(p.traded, true);
  }
  assert.equal(findPick(r, 5, DYNASTY).traded, false);
});

test('a Grid pasted below By Round is a checksum that passes when they agree', () => {
  const r = parseDraftPicksText(`${buildByRound()}\n${buildGrid()}`);
  assert.equal(r.totalPicks, 204);
  assert.ok(r.grid);
  assert.equal(r.grid.ok, true);
  assert.equal(r.grid.rounds, 17);
  assert.deepEqual(r.issues, []);
});

test('the Grid can come FIRST, and with a Total column', () => {
  const r = parseDraftPicksText(`${buildGrid(17, TRADES, TEAMS, { total: true })}\n${buildByRound()}`);
  assert.equal(r.totalPicks, 204);
  assert.equal(r.grid.ok, true);
  assert.deepEqual(r.issues, []);
});

test('a Grid that disagrees names the round and team, and the round-sum check fires', () => {
  // Grid built from a DIFFERENT trade set: R3 CSKA's pick stays home.
  const otherTrades = { ...TRADES }; delete otherTrades[`3:${CSKA}`];
  const r = parseDraftPicksText(`${buildByRound()}\n${buildGrid(17, otherTrades)}`);
  assert.equal(r.grid.ok, false);
  const rounds = r.grid.mismatches.map(m => `${m.round}:${m.team}:${m.expected}/${m.found}`).sort();
  assert.deepEqual(rounds, [`3:${BERUBE}:0/1`, `3:${CSKA}:2/1`]);
  assert.ok(r.issues.some(i => i.kind === 'grid' && i.round === 3 && i.team === BERUBE));
});

test('a round that does not sum to the team count is reported, not accepted', () => {
  // Drop one held line's contents: STOP holds only its own in R1 → 10 picks.
  const text = buildByRound(2).replace("Ain't No Hellebuyck GirlStop F***ing Crying Brothe grit grinders", 'Stop F***ing Crying Bro');
  const r = parseDraftPicksText(text);
  assert.equal(r.picks.filter(p => p.round === 1).length, 10);
  assert.ok(r.issues.some(i => i.kind === 'count' && i.round === 1 && /10 picks, not 12/.test(i.text)));
  assert.ok(r.issues.some(i => i.kind === 'missing' && i.round === 1 && i.text.includes(HELLEBUYCK)));
  assert.ok(r.issues.some(i => i.kind === 'missing' && i.round === 1 && i.text.includes(GRIT)));
  assert.equal(r.issues.filter(i => i.round === 2).length, 0);
});

test('an unknown name in a held cell is reported with the pick skipped', () => {
  const text = buildByRound(1).replace('Da Real Dynasty\nDa Real Dynasty', 'Da Real Dynasty\nDa Real DynastyMystery Team');
  const r = parseDraftPicksText(text);
  assert.ok(r.issues.some(i => i.kind === 'unmatched' && i.text.includes('"Mystery Team"')));
  assert.equal(r.totalPicks, 12);
});

test("the league's own names are a second-tier vocabulary for a held cell", () => {
  // A held cell names a team by its app name, which never appears as an owner.
  const text = buildByRound(1).replace('Da Real Dynasty\nDa Real Dynasty', 'Da Real Dynasty\nDa Real DynastyBen');
  const r = parsePicksByRound(text, { knownNames: ['Ben'] });
  assert.equal(r.issues.filter(i => i.kind === 'unmatched').length, 0);
  assert.equal(findPick(r, 1, 'Ben').ownerName, DYNASTY);
});

test('tab-separated rows (owner<TAB>held on one line) parse the same', () => {
  const text = buildByRound(1).split('\n').reduce((acc, line, i, arr) => {
    // Pair owner/held lines onto one tab-separated line after the header.
    if (i < 2 || i % 2 === 1) return acc;
    return acc + `${line}\t${arr[i + 1] ?? ''}\n`;
  }, 'Round 1\nTeam\tPicks Owned\n');
  const r = parseDraftPicksText(text);
  assert.equal(r.totalPicks, 12);
  assert.equal(r.tradedCount, 4);
  assert.deepEqual(r.issues, []);
});

test('Grid alone is refused with a message that names By Round', () => {
  const r = parseDraftPicksText(buildGrid());
  assert.equal(r.format, 'grid');
  assert.equal(r.picks.length, 0);
  assert.match(r.error, /Grid view/);
  assert.match(r.error, /By Round/);
});

test('an empty or unrelated paste says where to find By Round', () => {
  const r = parseDraftPicksText('Draft Picks\nSome page chrome\n');
  assert.equal(r.picks.length, 0);
  assert.match(r.error, /By Round/);
});

test('parsePicksGrid reads counts from the END of the row (names may hold digits)', () => {
  const g = parsePicksGrid('Team\t1\t2\t3\nTeam 2\t1\t0\t2\nBig 7 Crew\t1\t2\t1\n');
  assert.equal(g.rounds, 3);
  assert.deepEqual(g.teams, [{ name: 'Team 2', counts: [1, 0, 2] }, { name: 'Big 7 Crew', counts: [1, 2, 1] }]);
});

test('the by-team block format still parses as a fallback', () => {
  const r = parseDraftPicksText('Duck Duck Goose\nRound 1\nRound 2\nRound 3 (from Alex)\n\nAlex\nRound 1\nRound 2 (from Blake)\n');
  assert.equal(r.format, 'byTeam');
  assert.equal(r.totalPicks, 5);
  assert.equal(r.tradedCount, 2);
  assert.equal(findPick(r, 3, 'Alex').ownerName, 'Duck Duck Goose');
});

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}`);
