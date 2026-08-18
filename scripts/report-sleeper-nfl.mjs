// Cross-platform ID coverage report for the Sleeper NFL directory.
//
//   npm run players:nfl:report              # fetch live from Sleeper
//   npm run players:nfl:report -- some.json # read a saved payload instead
//
// Why this exists as a script: the numbers that matter for the later Yahoo
// work (how many players carry a yahoo_id / espn_id) can't be assumed —
// Sleeper's own docs show a null yahoo_id for Tom Brady. The app measures and
// displays the same numbers on every refresh (the Import page's directory
// card); this is the same measurement without a browser, and the only way to
// get it from a machine that can reach api.sleeper.app.
//
// This script NEVER writes to the database. Refresh is a manual, in-app
// action by design.
import { readFile } from 'node:fs/promises';
import { sleeperPayloadToRows, summarizeCrossIds, pct } from '../src/lib/nflDirectory.js';

const URL = 'https://api.sleeper.app/v1/players/nfl';

async function loadPayload(file) {
  if (file) {
    console.log(`Reading ${file}…`);
    return JSON.parse(await readFile(file, 'utf8'));
  }
  console.log(`Fetching ${URL} (~5MB)…`);
  const res = await fetch(URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper returned ${res.status} ${res.statusText}`);
  return res.json();
}

function bar(label, n, of) {
  const p = pct(n, of);
  const filled = Math.round(p / 5);
  return `  ${label.padEnd(22)} ${String(n).padStart(6)} / ${String(of).padStart(6)}  ${String(p).padStart(5)}%  ${'█'.repeat(filled)}${'·'.repeat(20 - filled)}`;
}

const rows = sleeperPayloadToRows(await loadPayload(process.argv[2]));
const s = summarizeCrossIds(rows);

const byPos = {};
for (const r of rows) {
  if ((r.status || '').toLowerCase() !== 'active') continue;
  const k = r.pos || '—';
  byPos[k] = byPos[k] || { n: 0, yahoo: 0, espn: 0 };
  byPos[k].n++;
  if (r.yahoo_id) byPos[k].yahoo++;
  if (r.espn_id) byPos[k].espn++;
}

console.log(`\nSleeper NFL directory — ${s.total.toLocaleString()} usable players (${s.active.toLocaleString()} active)\n`);
console.log('Cross-platform ID fill rates');
console.log(bar('yahoo_id (active)', s.yahooActive, s.active));
console.log(bar('espn_id  (active)', s.espnActive, s.active));
console.log(bar('yahoo_id (all stored)', s.yahooTotal, s.total));
console.log(bar('espn_id  (all stored)', s.espnTotal, s.total));

console.log('\nActive players by position');
for (const [pos, v] of Object.entries(byPos).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${pos.padEnd(6)} ${String(v.n).padStart(5)}   yahoo ${String(pct(v.yahoo, v.n)).padStart(5)}%   espn ${String(pct(v.espn, v.n)).padStart(5)}%`);
}
console.log('');
