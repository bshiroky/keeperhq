// Fetch the NHL player directory and write it to public/players-nhl.json.
//
// The directory is ROSTER-based: every current NHL team's full roster (from
// the api-web roster endpoints) is the base population, so players who missed
// all of last season (e.g. a season-long injury) are still present and
// matchable. Last-season stats from the stats REST API are merged onto those
// players where they exist; roster players with no stats simply carry no stat
// fields (readers render "—"). Last-season players who are NOT on any current
// roster (unsigned UFAs, retirees) are kept as stats-only records so coverage
// never shrinks vs the old stats-derived list.
//
// Off-season resilience (this script runs in July too):
//   * The team list tries /v1/standings/now first, but standings can be empty
//     between seasons — fallback derives the team set from the stats sweep's
//     teamAbbrevs (the stats host is the one the old script proved works).
//   * Each team's roster is the UNION of /roster/{team}/current and
//     /roster/{team}/{SEASON_ID} (current wins on shared players) — "current"
//     can be a thin next-season skeleton or 404 in the off-season, while the
//     completed season's roster always exists.
//
// FAILURE POLICY — never ship an empty directory silently:
//   * If the fetch fails but a previous GOOD players-nhl.json (non-empty
//     players array) exists, keep it and warn.
//   * If the fetch fails and there is no good previous file (e.g. a fresh
//     Vercel clone where the committed file is the empty placeholder), FAIL
//     THE BUILD (exit 1). A red build beats an app with no directory.
//     Consequence: `npm run build` in the NHL-API-blocked dev container fails
//     at this step unless a good players-nhl.json is present — use
//     `npx vite build` there, or seed a stub file.

import fs from 'node:fs/promises';
import path from 'node:path';

const SEASON_ID = '20252026'; // Most recent completed regular season (April 2026).
const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const WEB_BASE = 'https://api-web.nhle.com/v1';
const OUT_PATH = path.join(process.cwd(), 'public', 'players-nhl.json');

// A full-league roster sweep is ~700+ players (32 teams × ~23). Anything far
// below that means the roster endpoints changed shape or teams went missing —
// treat the sweep as failed rather than shipping a hollow directory.
const MIN_ROSTER_PLAYERS = 500;

const log = (msg) => console.log(`[players-nhl] ${msg}`);
const warn = (msg) => console.warn(`[players-nhl] ${msg}`);

async function fetchJson(url) {
  // A real-browser UA — some NHL endpoints are picky about default
  // fetch/bot user agents; the header is harmless where they aren't.
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });
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
  log(`stats ${endpoint}: ${byId.size} records`);
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

// ── Team list ───────────────────────────────────────────────────────────────
// standings/now first; if it errors or comes back empty (it can between
// seasons), derive the team set from every abbrev the stats sweep mentioned.
async function resolveTeamAbbrevs(statsRecords) {
  try {
    const data = await fetchJson(`${WEB_BASE}/standings/now`);
    const abbrevs = [...new Set(
      (data.standings || []).map(row => row.teamAbbrev?.default).filter(Boolean)
    )];
    if (abbrevs.length > 0) {
      log(`team list: ${abbrevs.length} teams from standings/now`);
      return abbrevs;
    }
    warn('standings/now returned no teams (off-season?) — deriving team list from stats');
  } catch (e) {
    warn(`standings/now failed (${e.message}) — deriving team list from stats`);
  }
  const fromStats = new Set();
  for (const rec of statsRecords) {
    for (const t of String(rec.teamAbbrevs || '').split(',')) {
      const abbrev = t.trim();
      if (abbrev) fromStats.add(abbrev);
    }
  }
  const abbrevs = [...fromStats].sort();
  log(`team list: ${abbrevs.length} teams derived from stats teamAbbrevs`);
  if (abbrevs.length === 0) throw new Error('No team list from standings/now or stats teamAbbrevs');
  return abbrevs;
}

// ── Roster base ─────────────────────────────────────────────────────────────

function flattenRoster(r, team) {
  const out = [];
  for (const group of ['forwards', 'defensemen', 'goalies']) {
    for (const p of r?.[group] || []) {
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
  return out;
}

// Union of the current roster and the completed season's roster (current wins
// on shared players — fresher team/position/headshot). Per-source failures
// are logged and tolerated; a team failing BOTH sources is reported to the
// caller so the sweep-size guard can decide whether the run is usable.
async function fetchTeamRoster(team) {
  const byId = new Map();
  const counts = [];
  for (const seasonPath of ['current', SEASON_ID]) {
    try {
      const r = await fetchJson(`${WEB_BASE}/roster/${team}/${seasonPath}`);
      const players = flattenRoster(r, team);
      counts.push(`${seasonPath}:${players.length}`);
      for (const p of players) if (!byId.has(p.id)) byId.set(p.id, p);
    } catch (e) {
      counts.push(`${seasonPath}:ERR(${e.message.replace(/ for http.*$/, '')})`);
    }
  }
  log(`  ${team}: ${byId.size} players (${counts.join(' · ')})`);
  return Array.from(byId.values());
}

async function fetchRosters(abbrevs) {
  const perTeam = await Promise.all(abbrevs.map(fetchTeamRoster));
  const failedTeams = abbrevs.filter((_, i) => perTeam[i].length === 0);
  if (failedTeams.length > 0) warn(`no roster from any source for: ${failedTeams.join(', ')}`);
  return perTeam.flat();
}

// ── Last-season stats (merged onto the roster base) ─────────────────────────

function mapSkaters(summary, realtime) {
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

function mapGoalies(summary) {
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
  log(`Fetching rosters + season ${SEASON_ID} stats…`);
  let players;
  try {
    // Stats first — they also back the team-list fallback.
    const [skaterSummary, skaterRealtime, goalieSummary] = await Promise.all([
      fetchAllPaged('skater/summary'),
      fetchAllPaged('skater/realtime'),
      fetchAllPaged('goalie/summary'),
    ]);
    const skaters = mapSkaters(skaterSummary, skaterRealtime);
    const goalies = mapGoalies(goalieSummary);

    const abbrevs = await resolveTeamAbbrevs([...skaterSummary, ...goalieSummary]);
    log(`roster sweep over ${abbrevs.length} teams…`);
    const rosterPlayers = await fetchRosters(abbrevs);
    log(`roster sweep total: ${rosterPlayers.length} unique roster records; ${skaters.length} skaters + ${goalies.length} goalies with stats`);
    if (rosterPlayers.length < MIN_ROSTER_PLAYERS) {
      throw new Error(`Roster sweep too small (${rosterPlayers.length} < ${MIN_ROSTER_PLAYERS}) — see per-team log lines above`);
    }
    players = buildDirectory(rosterPlayers, skaters, goalies);
    const noStats = players.filter(p => p.gp == null).length;
    log(`${players.length} directory records (${noStats} without last-season stats)`);
  } catch (e) {
    return failOrKeep(e.message);
  }

  if (!players.length) return failOrKeep('No players returned');

  const out = {
    sport: 'nhl',
    season: SEASON_ID,
    fetchedAt: new Date().toISOString(),
    players,
  };
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out));
  log(`Wrote ${players.length} players → ${OUT_PATH}`);
}

// Never ship an empty directory silently: keep a previous GOOD file (players
// array non-empty) with a warning; otherwise fail the build loudly. The
// committed placeholder has zero players, so a fresh clone with a failing
// fetch goes red instead of deploying a dead directory.
async function failOrKeep(reason) {
  try {
    const existing = JSON.parse(await fs.readFile(OUT_PATH, 'utf8'));
    if (Array.isArray(existing?.players) && existing.players.length > 0) {
      warn(`Fetch failed: ${reason}`);
      warn(`Keeping previous good file (${existing.players.length} players).`);
      return;
    }
  } catch {}
  console.error(
    `[players-nhl] FATAL: fetch failed (${reason}) and no previous good ` +
    `players-nhl.json exists — refusing to ship an empty player directory. ` +
    `Failing the build; check the per-step log lines above for the failing endpoint.`
  );
  process.exit(1);
}

main().catch(e => failOrKeep(`Unexpected error: ${e.message}`));
