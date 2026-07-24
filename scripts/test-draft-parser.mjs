// Unit tests for src/lib/draftParse.js — run with `npm run test:parser`
// (plain node, no framework). Fixtures mirror real Yahoo Draft Results
// pastes: 3 sports × both views (team-by-team blocks and the flat Picks
// table), plus the header-row and zero-player failure modes that shipped
// broken once (a basketball Picks paste parsed as '1 team · 0 players'
// with the header row as the team).
import assert from 'node:assert/strict';
import { parseDraftResults, isDraftHeaderLine } from '../src/lib/draftParse.js';

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

const totalPlayers = (teams) => teams.reduce((s, t) => s + t.players.length, 0);
const find = (teams, teamName, player) =>
  teams.find(t => t.name === teamName)?.players.find(p => p.player === player);

// ── Hockey · TEAM view (snake — no dollar amounts; leading N. is the round) ──
const HOCKEY_TEAM_VIEW = `Puck Dynasty
1.\t(4)\tConnor McDavid (EDM - C)
2.\t(21)\tCale Makar (COL - D)
3.\t(28)\tIgor Shesterkin (NYR - G)

Zamboni Drivers
1.\t(5)\tNathan MacKinnon (COL - C)
2.\t(20)\tTim Stützle (OTT - C,LW)
`;

test('hockey TEAM view: blocks, rounds from leading N., no salaries', () => {
  const teams = parseDraftResults(HOCKEY_TEAM_VIEW);
  assert.equal(teams.length, 2);
  assert.equal(totalPlayers(teams), 5);
  const makar = find(teams, 'Puck Dynasty', 'Cale Makar');
  assert.equal(makar.round, 2);
  assert.equal(makar.draftedFor, null);
  assert.equal(makar.positions, 'D');
  assert.equal(find(teams, 'Zamboni Drivers', 'Tim Stützle').positions, 'C,LW');
});

// ── Hockey · PICKS view (snake — flat list, fantasy team ends each row) ─────
const HOCKEY_PICKS_VIEW = `Pick\tPlayer\tTeam
1. Connor McDavid (EDM - C) Puck Dynasty
2. Nathan MacKinnon (COL - C) Zamboni Drivers
3. Auston Matthews (TOR - C) Zamboni Drivers
4. Cale Makar (COL - D) Puck Dynasty
`;

test('hockey PICKS view: 2 teams, round = ceil(pick / team count)', () => {
  const teams = parseDraftResults(HOCKEY_PICKS_VIEW);
  assert.equal(teams.length, 2);
  assert.equal(totalPlayers(teams), 4);
  assert.equal(find(teams, 'Puck Dynasty', 'Connor McDavid').round, 1);  // pick 1 / 2 teams
  assert.equal(find(teams, 'Zamboni Drivers', 'Auston Matthews').round, 2); // pick 3 / 2 teams
  assert.equal(find(teams, 'Puck Dynasty', 'Cale Makar').round, 2);      // pick 4 / 2 teams
});

// ── Basketball · TEAM view (auction — trailing $cost; NBA abbrevs, PF,C) ────
const BASKETBALL_TEAM_VIEW = `The Mobley Dicks
Budget  $200
1.\t(3)\tVictor Wembanyama (SAS - PF,C)\t$83
2.\t(30)\tEvan Mobley (CLE - PF,C)\t$31
Unused  $12

"Why are you"...
Budget $200
1.\t(7)\tLuka Doncic (LAL - PG,SG)\t$68
2.\t(19)\tScottie Barnes (Tor - SG,SF,PF)\t$25
`;

test('basketball TEAM view: multi-position rows, mixed-case abbrev, salaries', () => {
  const teams = parseDraftResults(BASKETBALL_TEAM_VIEW);
  assert.equal(teams.length, 2);
  assert.equal(totalPlayers(teams), 4);
  const wemby = find(teams, 'The Mobley Dicks', 'Victor Wembanyama');
  assert.equal(wemby.draftedFor, 83);
  assert.equal(wemby.positions, 'PF,C');
  assert.equal(wemby.round, 1);
  const barnes = find(teams, '"Why are you"...', 'Scottie Barnes');
  assert.equal(barnes.draftedFor, 25);
  assert.equal(barnes.proTeam, 'TOR'); // mixed-case "Tor" normalized
  assert.equal(barnes.positions, 'SG,SF,PF');
});

// ── Basketball · PICKS view (auction — the REAL failure-1 shape: header row,
//    quoted/ellipsized team names, $salary as the split anchor) ──────────────
const BB_TEAMS = [
  '"Why are you"...', 'The Mobley Dicks', 'Ballers United', 'Dunk Dynasty',
  'Sixth Man Standing', 'Triple Double Trouble', 'Hoop There It Is 🏀', 'Brick City',
  'Glass Cleaners', 'The Splash Bros', 'Cap Space Cowboys', 'Load Management',
];
const BB_PLAYERS = [
  ['Victor Wembanyama', 'SAS', 'PF,C', 83], ['Nikola Jokic', 'DEN', 'C', 81],
  ['Luka Doncic', 'LAL', 'PG,SG', 68], ['Giannis Antetokounmpo', 'MIL', 'PF,C', 74],
  ['Shai Gilgeous-Alexander', 'OKC', 'PG,SG', 70], ['Jayson Tatum', 'BOS', 'SF,PF', 62],
  ['Anthony Edwards', 'MIN', 'SG,SF', 60], ['Evan Mobley', 'CLE', 'PF,C', 31],
  ['Tyrese Haliburton', 'IND', 'PG,SG', 45], ['Domantas Sabonis', 'SAC', 'PF,C', 40],
  ['Scottie Barnes', 'TOR', 'SG,SF,PF', 25], ['Cade Cunningham', 'DET', 'PG,SG', 44],
  ['Devin Booker', 'PHO', 'PG,SG', 39], ['Karl-Anthony Towns', 'NYK', 'PF,C', 38],
  ['Jalen Brunson', 'NYK', 'PG', 41], ['Bam Adebayo', 'MIA', 'PF,C', 30],
  ['Trae Young', 'ATL', 'PG', 33], ['Paolo Banchero', 'ORL', 'PF', 32],
  ['Chet Holmgren', 'OKC', 'PF,C', 29], ['LaMelo Ball', 'CHA', 'PG,SG', 28],
  ['Zion Williamson', 'NOP', 'PF', 24], ['Ja Morant', 'MEM', 'PG', 27],
  ['De’Aaron Fox', 'SAS', 'PG', 26], ['Franz Wagner', 'ORL', 'SF,PF', 23],
];
const BASKETBALL_PICKS_VIEW = 'Pick Player Salary Team\n' + BB_PLAYERS.map(([name, pro, pos, sal], i) =>
  `${i + 1}. ${name} (${pro} - ${pos}) $${sal} ${BB_TEAMS[i % 12]}`).join('\n');

test('basketball PICKS view: header skipped, 12 teams, 24 players, prices kept', () => {
  const teams = parseDraftResults(BASKETBALL_PICKS_VIEW);
  assert.equal(teams.length, 12, `expected 12 teams, got ${teams.length}: ${teams.map(t => t.name).join(' | ')}`);
  assert.equal(totalPlayers(teams), 24);
  assert.ok(!teams.some(t => /^pick\b/i.test(t.name)), 'header row must never become a team');
  const wemby = find(teams, '"Why are you"...', 'Victor Wembanyama');
  assert.equal(wemby.draftedFor, 83);
  assert.equal(wemby.round, 1);                 // pick 1 of 12 teams
  const wagner = find(teams, 'Load Management', 'Franz Wagner');
  assert.equal(wagner.round, 2);                // pick 24 of 12 teams
  assert.equal(find(teams, 'Hoop There It Is 🏀', 'Anthony Edwards').draftedFor, 60);
});

// ── Football · TEAM view (auction; compound position slots) ─────────────────
const FOOTBALL_TEAM_VIEW = `Gridiron Gang
Budget $200
1. (2) Ja'Marr Chase (Cin - WR) $61
2. (28) Josh Allen (Buf - QB) $38

Touchdown Town
Budget $200
1. (9) Bijan Robinson (Atl - RB) $55
2. (16) Travis Kelce (KC - TE) $22
`;

test('football TEAM view: NFL shapes parse with salaries and rounds', () => {
  const teams = parseDraftResults(FOOTBALL_TEAM_VIEW);
  assert.equal(teams.length, 2);
  assert.equal(totalPlayers(teams), 4);
  assert.equal(find(teams, 'Gridiron Gang', "Ja'Marr Chase").draftedFor, 61);
  assert.equal(find(teams, 'Touchdown Town', 'Travis Kelce').round, 2);
});

// ── Football · PICKS view (snake — no salaries at all) ──────────────────────
const FOOTBALL_PICKS_VIEW = `Pick Player Team
1. Bijan Robinson (Atl - RB) Touchdown Town
2. Ja'Marr Chase (Cin - WR) Gridiron Gang
3. Josh Allen (Buf - QB) Gridiron Gang
4. Saquon Barkley (Phi - RB) Touchdown Town
5. Justin Jefferson (Min - WR) Touchdown Town
6. Travis Kelce (KC - TE) Gridiron Gang
`;

test('football PICKS view (snake): teams grouped, rounds computed, no salaries', () => {
  const teams = parseDraftResults(FOOTBALL_PICKS_VIEW);
  assert.equal(teams.length, 2);
  assert.equal(totalPlayers(teams), 6);
  const kelce = find(teams, 'Gridiron Gang', 'Travis Kelce');
  assert.equal(kelce.draftedFor, null);
  assert.equal(kelce.round, 3);                 // pick 6 of 2 teams
  assert.equal(find(teams, 'Touchdown Town', 'Justin Jefferson').round, 3);
});

// ── Failure modes ───────────────────────────────────────────────────────────
test('header row alone parses to zero teams (never a mappable team)', () => {
  const teams = parseDraftResults('Pick Player Salary Team\n');
  assert.equal(teams.length, 0);
});

test('isDraftHeaderLine flags header rows, not real team names', () => {
  assert.ok(isDraftHeaderLine('Pick Player Salary Team'));
  assert.ok(isDraftHeaderLine('Rd Pick Player Salary Team'));
  assert.ok(isDraftHeaderLine('Draft Results'));
  assert.ok(!isDraftHeaderLine('The Mobley Dicks'));
  assert.ok(!isDraftHeaderLine('"Why are you"...'));
  assert.ok(!isDraftHeaderLine('Team Alpha'));  // 'alpha' is not header vocab
});

test('prose paste yields zero teams (teams need at least one player)', () => {
  const teams = parseDraftResults('hello there\nthis is not a draft\njust some notes');
  assert.equal(teams.length, 0);
});

test('keeper (K) markers survive both views', () => {
  const teamView = parseDraftResults('Puck Dynasty\n1. (4) Connor McDavid (EDM - C) (K)\n2. (21) Cale Makar (COL - D)\n');
  assert.equal(find(teamView, 'Puck Dynasty', 'Connor McDavid').isKeeper, true);
  assert.equal(find(teamView, 'Puck Dynasty', 'Cale Makar').isKeeper, false);
  const picksView = parseDraftResults('1. Connor McDavid (EDM - C) (K) Puck Dynasty\n2. Nathan MacKinnon (COL - C) Zamboni Drivers\n3. Cale Makar (COL - D) Puck Dynasty\n');
  assert.equal(find(picksView, 'Puck Dynasty', 'Connor McDavid').isKeeper, true);
});

test('slash position lists normalize (W/R/T)', () => {
  const teams = parseDraftResults('Gridiron Gang\n1. (2) Some Player (KC - W/R/T) $10\n');
  assert.equal(find(teams, 'Gridiron Gang', 'Some Player').positions, 'W,R,T');
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} PARSER TESTS PASS`);
