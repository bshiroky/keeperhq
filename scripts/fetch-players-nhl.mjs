// Fetch the NHL player directory and write it to public/players-nhl.json.
//
// The directory is ROSTER-based: every current NHL team's full roster (from
// the api-web roster endpoints) is the base population, so players who missed
// all of last season (e.g. a season-long injury) are still present and
// matchable. Last-season stats from the stats REST API are merged onto those
// players where they exist; roster players with no stats simply carry no stat
// fields (readers render "—" / zeros). Last-season players who are NOT on any
// current roster (unsigned UFAs, retirees) are kept as stats-only records so
// coverage never shrinks vs the old stats-derived list.
//
// Uses the stats REST season-aggregate endpoints for stats because they
// include hits/blocks (the api-web /club-stats endpoint omits those).
// Designed to run as part of `npm run build` on Vercel; if any fetch fails
// (or the roster sweep looks implausibly small) the build keeps the existing
// players-nhl.json in place rather than failing.

import fs from 'node:fs/promises';
import path from 'node:path';

const SEASON_ID = '20252026'; // Most recent completed regular season (April 2026).
const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const WEB_BASE = 'https://api-web.nhle.com/v1';
const OUT_PATH = path.join(process.cwd(), 'public', 'players-nhl.json');

// A full-league roster sweep is ~700+ players (32 teams × ~23). Anything far
// below that means the roster endpoints changed shape or a team went missing —
// fall back to the last good file instead of shipping a hollow directory.
const MIN_ROSTER_PLAYERS = 500;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchAllPaged(endpoint) {
  const limit = 100;
  const MAX_PAGES = 30; // ~3000 records ceiling; way more than any NHL season has
  let start = 0;
  const byId = new Map(); // dedupe defensively in case the API returns overlapping pages
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(limit),
      start: String(start),
      cayenneExp: `seasonId=${SEASON_ID} and gameTypeId=2`,
    });
    const url = `${STATS_BASE}/${endpoint}?${params}`;
    const data = await fetchJson(url);
    const items = data.data || [];
    let newCount = 0;
    for (const item of items) {
      if (!byId.has(item.playerId)) {
        byId.set(item.playerId, item);
        newCount++;
      }
    }
    // Stop if the page is short OR every item was a duplicate (API ignoring `start`)
    if (items.length < limit || newCount === 0) break;
    start += limit;
  }
  return Array.from(byId.values());
}

function lastTeam(teamAbbrevs) {
  if (!teamAbbrevs) return '';
  // Stats API returns comma-separated abbrevs for traded players, chronological.
  const parts = String(teamAbbrevs).split(',').map(s => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || '';
}

function headshotUrl(playerId, team) {
  if (!team) return null;
  return `https://assets.nhle.com/mugs/nhl/${SEASON_ID}/${team}/${playerId}.png`;
}

// ── Roster base ─────────────────────────────────────────────────────────────

async function fetchTeamAbbrevs() {
  const data = await fetchJson(`${WEB_BASE}/standings/now`);
  const abbrevs = [...new Set(
    (data.standings || []).map(row => row.teamAbbrev?.default).filter(Boolean)
  )];
  if (abbrevs.length === 0) throw new Error('standings/now returned no teams');
  return abbrevs;
}

// One record per rostered player, regardless of games played. The roster
// endpoint supplies its own headshot URL; fall back to the mugs pattern.
async function fetchRosters(abbrevs) {
  const out = [];
  const rosters = await Promise.all(abbrevs.map(async team => {
    const r = await fetchJson(`${WEB_BASE}/roster/${team}/current`);
    return { team, r };
  }));
  for (const { team, r } of rosters) {
    for (const group of ['forwards', 'defensemen', 'goalies']) {
      for (const p of r[group] || []) {
        if (!p?.id) continue;
        const firstName = p.firstName?.default || '';
        const lastName = p.lastName?.default || '';
        const pos = p.positionCode || (group === 'goalies' ? 'G' : '');
        out.push({
          id: String(p.id),
          firstName,
          lastName,
          name: `${firstName} ${lastName}`.trim(),
          pos,
          team,
          headshot: p.headshot || headshotUrl(p.id, team),
          kind: pos === 'G' ? 'goalie' : 'skater',
        });
      }
    }
  }
  return out;
}

// ── Last-season stats (merged onto the roster base) ─────────────────────────

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
      headshot: headshotUrl(s.playerId, lastTeam(s.teamAbbrevs)),
      kind: 'skater',
      gp: s.gamesPlayed || 0,
      g: s.goals || 0,
      a: s.assists || 0,
      p: s.points || 0,
      plusMinus: s.plusMinus || 0,
      pim: s.penaltyMinutes || 0,
      // Power-play splits for the shared-page stat table. summary carries
      // ppGoals + ppPoints; PP assists are the difference.
      ppg: s.ppGoals || 0,
      ppa: Math.max(0, (s.ppPoints || 0) - (s.ppGoals || 0)),
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
      saves: g.saves || 0,
    };
  });
}

// ── Merge ───────────────────────────────────────────────────────────────────
// Roster record wins on identity fields (name, current team, position,
// headshot) — the stats list's team is where the player *finished last
// season*, which goes stale after off-season moves. Stat fields ride along
// from the stats record; a roster player with no stats record simply has no
// stat fields (readers show "—"). Stats-only players (not on any current
// roster) are appended unchanged so last season's coverage never shrinks.
function buildDirectory(rosterPlayers, skaters, goalies) {
  const statsById = new Map([...skaters, ...goalies].map(p => [p.id, p]));
  const byId = new Map();
  for (const rp of rosterPlayers) {
    const stats = statsById.get(rp.id);
    byId.set(rp.id, stats ? { ...stats, ...rp } : rp);
  }
  for (const [id, p] of statsById) {
    if (!byId.has(id)) byId.set(id, p);
  }
  return Array.from(byId.values());
}

async function main() {
  console.log(`[players-nhl] Fetching rosters + season ${SEASON_ID} stats…`);
  let players;
  try {
    const abbrevs = await fetchTeamAbbrevs();
    const [rosterPlayers, skaters, goalies] = await Promise.all([
      fetchRosters(abbrevs),
      fetchSkaters(),
      fetchGoalies(),
    ]);
    console.log(`[players-nhl] ${rosterPlayers.length} rostered across ${abbrevs.length} teams; ${skaters.length} skaters + ${goalies.length} goalies with stats`);
    if (rosterPlayers.length < MIN_ROSTER_PLAYERS) {
      throw new Error(`Roster sweep looks too small (${rosterPlayers.length} < ${MIN_ROSTER_PLAYERS})`);
    }
    players = buildDirectory(rosterPlayers, skaters, goalies);
    const noStats = players.filter(p => p.gp == null).length;
    console.log(`[players-nhl] ${players.length} directory records (${noStats} without last-season stats)`);
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
