// Read-only: parse a saved Yahoo Standings paste and report what the draft
// order engine makes of it, without touching any league.
//
//   node scripts/report-standings-paste.mjs <standings.txt> [league.json] [--break "A > B"] [--seed N]
//
// league.json (optional) is a league blob — its teams + yahooTeamMap are what
// the names resolve against, so the report can say which names would hit the
// alias prompt. Without it, a league is synthesized from the paste's own
// names (every name resolves, nothing prompts). --break records a manual
// tie order (best first, ">"-separated; repeatable) — the override; the
// chain (points → playoff finish → coin flip) runs otherwise, and a coin
// flip is recorded with --seed as its seed. --seed also makes the lottery
// draw reproducible.
import fs from 'node:fs';
import { parseStandingsText } from '../src/lib/standingsParse.js';
import { resolveTeamNames } from '../src/lib/teamMap.js';
import {
  draftOrderConfigOf, rankStandings, baseDraftOrder, lotteryEligible, round1Order, buildDraftBoard, resolveTie,
  recordCoinFlip, describeTie, BASIS_LABEL, TIEBREAK_LABEL,
} from '../src/lib/draftOrder.js';

const args = process.argv.slice(2);
const breaks = [];
let seed = null;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--break') breaks.push(args[++i]);
  else if (args[i] === '--seed') seed = Number(args[++i]);
  else positional.push(args[i]);
}
const [pasteFile, leagueFile] = positional;
if (!pasteFile) {
  console.error('usage: node scripts/report-standings-paste.mjs <standings.txt> [league.json] [--break "A > B"] [--seed N]');
  process.exit(2);
}

const parsed = parseStandingsText(fs.readFileSync(pasteFile, 'utf8'));
if (parsed.error) { console.error(`✗ ${parsed.error}`); process.exit(1); }
console.log(`Parsed ${parsed.rows.length} rows${parsed.issues.length ? ` · ${parsed.issues.length} issue(s)` : ''}`);
for (const i of parsed.issues) console.log(`  ! ${i.text}`);

let league;
if (leagueFile) {
  league = JSON.parse(fs.readFileSync(leagueFile, 'utf8'));
  if (!Array.isArray(league.teams)) throw new Error('league.json has no teams');
} else {
  league = { draftType: 'snake', teams: parsed.rows.map((r, i) => ({ id: `t${i + 1}`, name: r.team })), yahooTeamMap: {} };
  parsed.rows.forEach((r, i) => { league.yahooTeamMap[r.team] = `t${i + 1}`; });
}
league.draftType = league.draftType || 'snake';
const nameOf = id => league.teams.find(t => t.id === id)?.name || '?';

// Names → teams, the way the modal does it.
const resolved = resolveTeamNames(league, parsed.rows.map(r => r.team));
console.log('\nName resolution:');
const prompts = [];
for (const r of parsed.rows) {
  const res = resolved[r.team];
  const tag = res.source === 'alias' ? 'alias (silent)' : res.source === 'suggested' ? `SUGGESTED → ${nameOf(res.teamId)} (prompts, prefilled)` : 'UNKNOWN (prompts)';
  if (res.source !== 'alias') prompts.push(r.team);
  console.log(`  ${r.team.padEnd(28)} ${tag}`);
}
console.log(`Alias prompt hits: ${prompts.length ? prompts.join(', ') : 'none'}`);

// Resolve unknowns by position so the report can continue (the app would
// stop here and ask; the report assumes the obvious mapping and says so).
const unmapped = parsed.rows.filter(r => !resolved[r.team].teamId);
if (unmapped.length) {
  const taken = new Set(Object.values(resolved).map(r => r.teamId).filter(Boolean));
  const free = league.teams.filter(t => !taken.has(t.id));
  if (free.length !== unmapped.length) { console.error(`✗ ${unmapped.length} unmapped names but ${free.length} unmapped teams — pass a league.json whose aliases cover them`); process.exit(1); }
  console.log(`  (report assumes: ${unmapped.map((r, i) => `${r.team} → ${free[i].name}`).join('; ')})`);
  unmapped.forEach((r, i) => { resolved[r.team].teamId = free[i].id; });
}

let working = {
  ...league,
  standings: {
    rows: parsed.rows.map(r => ({ teamId: resolved[r.team].teamId, rank: r.rank, wins: r.wins, losses: r.losses, ties: r.ties, pct: r.pct, pts: r.pts, clinched: r.clinched, sourceName: r.team })),
    tieResolutions: {},
  },
};
const config = draftOrderConfigOf(working);
console.log(`\nConfig: basis=${BASIS_LABEL[config.basis]} · lottery teams=${config.lotteryTeams} · tiebreak=${TIEBREAK_LABEL[config.tiebreak]}`);

for (const b of breaks) {
  const ids = b.split('>').map(s => s.trim()).map(n => league.teams.find(t => t.name === n)?.id);
  if (ids.some(x => !x)) { console.error(`✗ --break names a team not in the league: ${b}`); process.exit(1); }
  working = resolveTie(working, ids);
}

// Chain step 3: record a coin flip for anything still level (seeded when a
// seed was given, so the report replays).
for (const tie of rankStandings(working).unresolvedTies) {
  if (tie.needs === 'coinflip') working = recordCoinFlip(working, tie.teams, seed == null ? null : seed);
}
const base = baseDraftOrder(working);
console.log('\nBase order (worst first, before the lottery):');
for (const e of base.order) {
  const row = working.standings.rows.find(r => r.teamId === e.teamId);
  console.log(`  slot ${String(e.slot).padStart(2)} · finish ${String(e.finish).padStart(2)} · ${nameOf(e.teamId).padEnd(28)} ${row.pts ?? '—'} pts · ${row.wins}-${row.losses}-${row.ties} · rank ${row.rank}${row.clinched ? '*' : ''}`);
}
if (base.unresolvedTies.length) {
  console.log('\nSTOPPED — tie(s) that must be broken by hand (manual override):');
  for (const tie of base.unresolvedTies) {
    const row = working.standings.rows.find(r => r.teamId === tie.teams[0]);
    console.log(`  ${tie.teams.map(nameOf).join(' / ')} — ${row.pts} pts, ${row.wins}-${row.losses}-${row.ties}, ${row.pct}`);
  }
  console.log('  Re-run with --break "Better team > Worse team" to continue.');
  process.exit(0);
}
if (base.ties.length) {
  console.log('\nTies broken:');
  for (const tie of base.ties) console.log(`  ${describeTie(tie, nameOf)}`);
}

const eligible = lotteryEligible(working);
console.log(`\nLottery-eligible (worst ${config.lotteryTeams}): ${eligible.map(nameOf).join(' · ') || 'none'}`);

// Deterministic draw when seeded (mulberry32), Math.random otherwise.
let rnd = Math.random;
if (seed != null) {
  let a = seed >>> 0;
  rnd = () => { a += 0x6D2B79F5; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const order = [...eligible];
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
if (order.length) working = { ...working, lotteryDraw: { at: new Date().toISOString(), order } };

const r1 = round1Order(working);
console.log(`\nRound 1 after the lottery${seed != null ? ` (seed ${seed})` : ''}:`);
for (const s of r1.slots) {
  const board = buildDraftBoard(working);
  const pick = board.picks.find(p => p.round === 1 && p.slot === s.slot);
  const via = pick && pick.traded ? ` → owned by ${nameOf(pick.ownerTeamId)} (via ${nameOf(pick.originalTeamId)})` : '';
  console.log(`  pick ${String(s.slot).padStart(2)} · overall ${String(s.slot).padStart(2)} · ${nameOf(s.originalTeamId).padEnd(28)} seed #${s.finish}${s.lottery ? ' · lottery' : ''}${via}`);
}
const board = buildDraftBoard(working);
console.log(`\nBoard: ${board.picks.length} picks over ${board.rounds} rounds · complete=${board.complete} · traded=${board.picks.filter(p => p.traded).length}`);
