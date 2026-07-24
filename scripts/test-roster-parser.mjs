// Unit tests for src/lib/rosterParse.js — run via `npm run test:parser`
// (plain node, no framework). Includes the real-QA fixture: Yahoo renders
// "--empty--" where a vacant roster slot's player name would be, and a
// basketball import once saved it as a player literally named "--empty--".
import assert from 'node:assert/strict';
import { parseYahooRosterText, cleanPlayerName, isRosterPlaceholder } from '../src/lib/rosterParse.js';

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

const names = (out) => out.map(p => p.player);

// ── Hockey roster paste (the original shape) ────────────────────────────────
const HOCKEY_PASTE = `Pos\tForwards/Defensemen
C
Nico Hischier
Nico Hischier
NJ - C
W, 3-2 vs EDM
BN
Connor Hellebuyck K
Connor Hellebuyck K
WPG - G
`;

test('hockey paste: names extracted, flags stripped', () => {
  const out = parseYahooRosterText(HOCKEY_PASTE);
  assert.deepEqual(names(out), ['Nico Hischier', 'Connor Hellebuyck']);
});

// ── Basketball paste with Yahoo's "--empty--" vacant-slot rows ──────────────
const BASKETBALL_EMPTY_PASTE = `Pos\tPlayers
PG
Jalen Brunson
Jalen Brunson
NY - PG
BN
--empty--
BN
--Empty--
C
Evan Mobley
Evan Mobley
CLE - PF,C
IL
(Empty)
`;

test('basketball paste: "--empty--" placeholder rows are skipped', () => {
  const out = parseYahooRosterText(BASKETBALL_EMPTY_PASTE);
  assert.deepEqual(names(out), ['Jalen Brunson', 'Evan Mobley'],
    `got: ${names(out).join(', ')}`);
});

test('isRosterPlaceholder: furniture shapes, not real names', () => {
  assert.ok(isRosterPlaceholder('--empty--'));
  assert.ok(isRosterPlaceholder('(Empty)'));
  assert.ok(isRosterPlaceholder('empty'));
  assert.ok(isRosterPlaceholder('—'));
  assert.ok(isRosterPlaceholder('--'));
  assert.ok(!isRosterPlaceholder('Evan Mobley'));
  assert.ok(!isRosterPlaceholder('A.J. Griffin'));
});

test('cleanPlayerName: whitespace-anchored flag strip (Hellebuyck regression)', () => {
  assert.equal(cleanPlayerName('Connor Hellebuyck'), 'Connor Hellebuyck');
  assert.equal(cleanPlayerName('Connor Hellebuyck K'), 'Connor Hellebuyck');
  assert.equal(cleanPlayerName('Matthew Tkachuk No new player Notes'), 'Matthew Tkachuk');
});

test('dedupe keeps the first occurrence', () => {
  const out = parseYahooRosterText('C\nNico Hischier\nNico Hischier\nNJ - C\nBN\nNico Hischier\nNico Hischier\nNJ - C\n');
  assert.deepEqual(names(out), ['Nico Hischier']);
});

console.log(process.exitCode ? '\nFAILURES above' : `\nALL ${passed} ROSTER-PARSER TESTS PASS`);
