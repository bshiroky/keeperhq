// Fetch NHL player roster + previous-season stats from the official NHL API
// and write to public/players-nhl.json. Designed to be run as part of `npm run
// build` on Vercel, where outbound HTTP is unrestricted. On failure it leaves
// any existing players-nhl.json in place rather than breaking the build.

import fs from 'node:fs/promises';
import path from 'node:path';

const SEASON = '20252026'; // Most recent completed regular season (April 2026).
const BASE = 'https://api-web.nhle.com/v1';
const OUT_PATH = path.join(process.cwd(), 'public', 'players-nhl.json');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function getTeamAbbrevs() {
  const data = await fetchJson(`${BASE}/standings/now`);
  return data.standings.map(s => s.teamAbbrev.default);
}

function normalize(p, abbrev, kind) {
  const firstName = p.firstName?.default || '';
  const lastName = p.lastName?.default || '';
  const base = {
    id: String(p.playerId),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
    pos: kind === 'goalie' ? 'G' : (p.positionCode || ''),
    team: abbrev,
    headshot: p.headshot || null,
    kind,
    gp: p.gamesPlayed || 0,
  };
  if (kind === 'skater') {
    return {
      ...base,
      g: p.goals || 0,
      a: p.assists || 0,
      p: p.points || 0,
      plusMinus: p.plusMinus || 0,
      pim: p.penaltyMinutes || 0,
      sog: p.shots || 0,
      hit: p.hits || 0,
      blk: p.blockedShots || 0,
    };
  }
  return {
    ...base,
    w: p.wins || 0,
    l: p.losses || 0,
    gaa: p.goalsAgainstAverage || 0,
    svPct: p.savePercentage || 0,
    so: p.shutouts || 0,
  };
}

async function main() {
  console.log(`[players-nhl] Fetching for season ${SEASON}…`);
  let abbrevs;
  try {
    abbrevs = await getTeamAbbrevs();
  } catch (e) {
    console.warn(`[players-nhl] Could not list teams: ${e.message}`);
    return keepOrStub(e.message);
  }
  console.log(`[players-nhl] ${abbrevs.length} teams found.`);

  const players = [];
  for (const abbrev of abbrevs) {
    try {
      const data = await fetchJson(`${BASE}/club-stats/${abbrev}/${SEASON}/2`);
      const skaters = data.skaters || [];
      const goalies = data.goalies || [];
      for (const p of skaters) players.push(normalize(p, abbrev, 'skater'));
      for (const p of goalies) players.push(normalize(p, abbrev, 'goalie'));
      console.log(`[players-nhl]   ${abbrev}: ${skaters.length} skaters, ${goalies.length} goalies`);
    } catch (e) {
      console.warn(`[players-nhl]   ${abbrev}: ${e.message}`);
    }
  }

  if (players.length === 0) return keepOrStub('No players returned from any team');

  const out = {
    sport: 'nhl',
    season: SEASON,
    fetchedAt: new Date().toISOString(),
    players,
  };
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out));
  console.log(`[players-nhl] Wrote ${players.length} players → ${OUT_PATH}`);
}

async function keepOrStub(reason) {
  try {
    await fs.access(OUT_PATH);
    console.log(`[players-nhl] Keeping existing file (reason: ${reason}).`);
    return;
  } catch {}
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const stub = { sport: 'nhl', season: SEASON, fetchedAt: null, players: [], error: reason };
  await fs.writeFile(OUT_PATH, JSON.stringify(stub));
  console.log(`[players-nhl] Wrote empty stub (reason: ${reason}).`);
}

main().catch(e => {
  console.warn(`[players-nhl] Unexpected error: ${e.message}`);
  // Never fail the build over this.
  process.exit(0);
});
