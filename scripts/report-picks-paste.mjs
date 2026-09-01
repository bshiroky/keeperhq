// Parse a saved Yahoo Draft Picks paste (By Round, optionally with the Grid
// below it) and print what the import would see: picks per round, total
// traded, every issue by round and team. Read-only — touches no league.
//   node scripts/report-picks-paste.mjs <file>
import fs from 'node:fs';
import { parseDraftPicksText } from '../src/lib/picksParse.js';

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/report-picks-paste.mjs <paste.txt>'); process.exit(2); }
const r = parseDraftPicksText(fs.readFileSync(file, 'utf8'));
if (r.error) { console.error(r.error); process.exit(1); }
console.log(`format: ${r.format}`);
console.log(`teams: ${r.teamCount}  rounds: ${r.rounds.length} (${r.rounds[0]}–${r.rounds[r.rounds.length - 1]})`);
console.log(`picks: ${r.totalPicks}  traded: ${r.tradedCount}  untraded: ${r.totalPicks - r.tradedCount}`);
if (r.grid) console.log(`grid: ${r.grid.ok ? 'matches on every team and round' : `${r.grid.mismatches.length} mismatch(es)`}`);
else console.log('grid: not included');
if (r.issues.length === 0) console.log('issues: none');
else { console.log(`issues (${r.issues.length}):`); for (const i of r.issues) console.log(`  - ${i.text}`); }
process.exit(r.issues.length ? 1 : 0);
