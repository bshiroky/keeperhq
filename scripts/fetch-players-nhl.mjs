// Fetch NHL player stats from the NHL Stats REST API and write to
// public/players-nhl.json. Uses the season-aggregate endpoints which include
// hits/blocks (the api-web /club-stats endpoint omits those). Designed to run
// as part of `npm run build` on Vercel; if the fetch fails the build keeps any
// existing players-nhl.json in place rather than failing.

import fs from 'node:fs/promises';
import path from 'node:path';

const SEASON_ID = '20252026'; // Most recent completed regular season (April 2026).
const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const OUT_PATH = path.join(process.cwd(), 'public', 'players-nhl.json');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchAllPaged(endpoint) {
  const limit = 100;
  let start = 0;
  const all = [];
  while (true) {
    const params = new URLSearchParams({
      limit: String(limit),
      start: String(start),
      cayenneExp: `seasonId=${SEASON_ID} and gameTypeId=2`,
    });
    const url = `${STATS_BASE}/${endpoint}?${params}`;
    const data = await fetchJson(url);
    const items = data.data || [];
    all.push(...items);
    if (items.length < limit) break;
    start += limit;
  }
  return all;
}

function lastTeam(teamAbbrevs) {
  if (!teamAbbrevs) return '';
  // Stats API returns comma-separated abbrevs for traded players, chronological.
  const parts = String(teamAbbrevs).split(',').map(s => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function headshotUrl(playerId) {
  return `https://assets.nhle.com/mugs/nhl/${SEASON_ID}/${playerId}.png`;
}

async function fetchSkaters() {
  const [summary, realtime] = await Promise.all([
    fetchAllPaged('skater/summary'),
    fetchAllPaged('skater/realtime'),
  ]);
  const rtById = new Map(realtime.map(r => [r.playerId, r]));
  return summary.map(s => {
    const rt = rtById.get(s.playerId) || {};
    const firstName = s.skaterFullName?.split(' ')[0] || '';
    const lastName = s.skaterFullName?.split(' ').slice(1).join(' ') || '';
    return {
      id: String(s.playerId),
      firstName,
      lastName,
      name: s.skaterFullName || '',
      pos: s.positionCode || '',
      team: lastTeam(s.teamAbbrevs),
      headshot: headshotUrl(s.playerId),
      kind: 'skater',
      gp: s.gamesPlayed || 0,
      g: s.goals || 0,
      a: s.assists || 0,
      p: s.points || 0,
      plusMinus: s.plusMinus || 0,
      pim: s.penaltyMinutes || 0,
      sog: s.shots || 0,
      hit: rt.hits || 0,
      blk: rt.blockedShots || 0,
    };
  });
}

async function fetchGoalies() {
  const summary = await fetchAllPaged('goalie/summary');
  return summary.map(g => {
    const firstName = g.goalieFullName?.split(' ')[0] || '';
    const lastName = g.goalieFullName?.split(' ').slice(1).join(' ') || '';
    return {
      id: String(g.playerId),
      firstName,
      lastName,
      name: g.goalieFullName || '',
      pos: 'G',
      team: lastTeam(g.teamAbbrevs),
      headshot: headshotUrl(g.playerId),
      kind: 'goalie',
      gp: g.gamesPlayed || 0,
      w: g.wins || 0,
      l: g.losses || 0,
      gaa: g.goalsAgainstAverage || 0,
      svPct: g.savePercentage || 0,
      so: g.shutouts || 0,
    };
  });
}

async function main() {
  console.log(`[players-nhl] Fetching for season ${SEASON_ID}…`);
  let players;
  try {
    const [skaters, goalies] = await Promise.all([fetchSkaters(), fetchGoalies()]);
    players = [...skaters, ...goalies];
    console.log(`[players-nhl] ${skaters.length} skaters, ${goalies.length} goalies`);
  } catch (e) {
    console.warn(`[players-nhl] Fetch failed: ${e.message}`);
    return keepOrStub(e.message);
  }

  if (!players.length) return keepOrStub('No players returned');

  const out = {
    sport: 'nhl',
    season: SEASON_ID,
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
  const stub = { sport: 'nhl', season: SEASON_ID, fetchedAt: null, players: [], error: reason };
  await fs.writeFile(OUT_PATH, JSON.stringify(stub));
  console.log(`[players-nhl] Wrote empty stub (reason: ${reason}).`);
}

main().catch(e => {
  console.warn(`[players-nhl] Unexpected error: ${e.message}`);
  process.exit(0);
});
