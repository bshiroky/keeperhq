// Yahoo import — turning the bundle the server returns into league data.
// Pure: no network, no React. It writes through the SAME primitives the paste
// imports use (withRosterImport, refreshComputedPrice, reassignPick,
// rememberYahooTeams, the change log), so a league filled from Yahoo is
// indistinguishable from one filled by pasting.
//
// Four independent sections, each optional:
//   rosters   → team.roster            (who each team can keep)
//   draft     → team.priorKeepers      (what each player cost: price or round)
//   standings → league.standings       (the draft order's input)
//   picks     → league.draftPicks      (who owns which round)
//
// The Yahoo league to import is LAST season's: its end-of-season rosters, its
// draft, its standings, and the pick trades made during it (which are for the
// draft that follows).

import { normalizeName } from './players.js';
import { withRosterImport } from './rosterMembership.js';
import { refreshComputedPrice, isPriceOverridden, countOverriddenPrices } from './priceProvenance.js';
import { reassignPick, getDraftRounds, pickOwnerId } from './draftPicks.js';
import { rememberYahooTeams, resolveTeamNames } from './teamMap.js';
import { appendChanges, changeEntry } from './changeLog.js';
import { standingsImportImpact } from './importGuard.js';
import { lotteryEligible } from './draftOrder.js';
import { hasTerm, termOf, draftFormatOf, hasLastDraftPage } from './keeperRules.js';

export const GAME_CODE_FOR_SPORT = { hockey: 'nhl', basketball: 'nba', football: 'nfl', baseball: 'mlb' };

// Yahoo labels a season by the year it STARTS. Hockey and basketball seasons
// span two years, so "2026" alone reads as the wrong season half the time.
export function seasonLabel(season, gameCode) {
  const y = Number(season);
  if (!y) return String(season || '');
  return gameCode === 'nhl' || gameCode === 'nba' ? `${y}–${String((y + 1) % 100).padStart(2, '0')}` : String(y);
}

// A league is over when Yahoo says so, or when it has already been renewed
// into a following season (the league LIST doesn't always carry the flag).
export const isSeasonOver = l => !!(l?.isFinished || l?.nextLeagueKey);

// The league an import most likely wants: the one imported from before, else
// the most recent season that is over (keepers are set from LAST season).
export function defaultYahooLeague(leagues, lastKey) {
  const list = leagues || [];
  return list.find(l => l.leagueKey === lastKey)
    || list.find(isSeasonOver)
    || list.find(l => l.leagueKey === list[0]?.previousLeagueKey)
    || list[0] || null;
}

// Which sections make sense for this league. Draft values only matter where
// the draft sets a keeper's cost; pick ownership only exists in a snake draft.
export function sectionsFor(league, bundle) {
  return {
    rosters: Object.keys(bundle?.rosters?.final || {}).length > 0,
    draft: hasLastDraftPage(league) && (bundle?.draft || []).length > 0,
    standings: (bundle?.standings || []).length > 0,
    picks: draftFormatOf(league) === 'snake' && (bundle?.pickTrades || []).length > 0,
  };
}

// Initial Yahoo team → KeeperHQ team guesses, by the same alias-then-similarity
// path every paste uses. A team two Yahoo names both guess keeps only the first.
export function initialMapping(league, bundle) {
  const names = (bundle?.teams || []).map(t => t.name);
  const resolved = resolveTeamNames(league, names);
  const taken = new Set();
  const map = {};
  for (const t of bundle?.teams || []) {
    const id = resolved[t.name]?.teamId || null;
    map[t.teamKey] = id && !taken.has(id) ? id : null;
    if (map[t.teamKey]) taken.add(id);
  }
  return map;
}

// For a league whose teams are still placeholders: pair Yahoo teams with the
// league's teams in order, and name each team after its manager (or its Yahoo
// team name). Returns the mapping plus the renames to apply on import.
export function mappingInOrder(league, bundle, nameBy = 'manager') {
  const map = {}; const renames = {};
  const teams = league?.teams || [];
  (bundle?.teams || []).forEach((yt, i) => {
    const tm = teams[i];
    map[yt.teamKey] = tm ? tm.id : null;
    if (tm) renames[tm.id] = (nameBy === 'manager' && yt.managers?.[0]) || yt.name;
  });
  return { mapping: map, renames };
}

export function mappingProblems(league, bundle, mapping) {
  const used = {};
  for (const [key, id] of Object.entries(mapping || {})) if (id) (used[id] ||= []).push(key);
  return {
    unmapped: (bundle?.teams || []).filter(t => !mapping?.[t.teamKey]).map(t => t.name),
    duplicates: Object.entries(used).filter(([, keys]) => keys.length > 1).map(([id]) => (league.teams || []).find(tm => tm.id === id)?.name || id),
    mappedCount: Object.keys(used).length,
  };
}

// Players on a team at season's end who were NOT there at the cutoff: the
// playoff-window pickups the cutoff roster leaves out.
export function lateAdditions(bundle) {
  const out = {};
  const cutoff = bundle?.rosters?.cutoff;
  if (!cutoff) return out;
  for (const [key, final] of Object.entries(bundle.rosters.final || {})) {
    const had = new Set((cutoff[key] || []).map(p => normalizeName(p.name)));
    const late = final.filter(p => !had.has(normalizeName(p.name))).map(p => p.name);
    if (late.length) out[key] = late;
  }
  return out;
}

const rosterEntry = p => {
  const pos = p.primaryPosition || p.positions?.[0] || null;
  return { player: p.name, ...(pos ? { pos } : {}), ...(p.yahooPlayerId ? { yahooPlayerId: p.yahooPlayerId } : {}), sourceName: p.name };
};

// Final owner of every pick Yahoo saw traded, by replaying the trades in order.
// → [{ round, originalTeamId, ownerTeamId }] for picks whose teams are mapped.
export function resolvedPickOwners(bundle, mapping) {
  const owner = new Map();   // "round:originalKey" → current Yahoo team key
  for (const t of bundle?.pickTrades || []) {
    if (!t.round || !t.originalTeamKey || !t.toTeamKey) continue;
    owner.set(`${t.round}:${t.originalTeamKey}`, t.toTeamKey);
  }
  const out = [];
  for (const [k, toKey] of owner) {
    const [round, originalKey] = [Number(k.slice(0, k.indexOf(':'))), k.slice(k.indexOf(':') + 1)];
    const originalTeamId = mapping?.[originalKey]; const ownerTeamId = mapping?.[toKey];
    if (originalTeamId && ownerTeamId) out.push({ round, originalTeamId, ownerTeamId });
  }
  return out.sort((a, b) => a.round - b.round);
}

// What is on file that this import replaces — counted before anything is
// written, so the confirm can name it. `hasImpact` false = nothing to confirm.
export function yahooImportImpact(league, bundle, mapping, sections) {
  const mapped = new Set(Object.values(mapping || {}).filter(Boolean));
  const teams = (league.teams || []).filter(tm => mapped.has(tm.id));
  const lines = [];
  const s = n => (n === 1 ? '' : 's');
  if (sections.rosters) {
    const withRoster = teams.filter(tm => (tm.roster || []).length > 0);
    const players = withRoster.reduce((n, tm) => n + tm.roster.length, 0);
    if (players) lines.push({ tone: 'danger', text: `${players} player${s(players)} on ${withRoster.length} roster${s(withRoster.length)} will be replaced by Yahoo's rosters, including any you added or removed by hand.` });
    const incoming = new Set();
    const set = bundle.rosters[sections.rosterSet === 'final' ? 'final' : 'cutoff'] || bundle.rosters.final;
    for (const [key, list] of Object.entries(set || {})) if (mapping[key]) for (const p of list) incoming.add(`${mapping[key]}:${normalizeName(p.name)}`);
    const dropped = [];
    for (const tm of teams) for (const k of tm.keepers || []) if (!incoming.has(`${tm.id}:${normalizeName(k.player)}`)) dropped.push(`${k.player} (${tm.name})`);
    if (dropped.length) lines.push({ tone: 'danger', text: `${dropped.length} declared keeper${s(dropped.length)} ${dropped.length === 1 ? 'is' : 'are'} not on the Yahoo roster and will drop out of the eligible pool: ${dropped.slice(0, 6).join(', ')}${dropped.length > 6 ? '…' : ''}.` });
  }
  if (sections.draft) {
    const rows = teams.reduce((n, tm) => n + (tm.priorKeepers || []).length, 0);
    if (rows) {
      lines.push({ tone: 'danger', text: `${rows} draft record${s(rows)} on file will be replaced by Yahoo's draft results.` });
      const kept = teams.reduce((n, tm) => n + countOverriddenPrices(tm.priorKeepers || []), 0);
      if (kept) lines.push({ tone: 'ok', text: `${kept} price${s(kept)} you set by hand stay${kept === 1 ? 's' : ''} in force.` });
      if (hasTerm(league)) lines.push({ tone: 'ok', text: 'Contract years already recorded are carried over for players who appear in both.' });
    }
  }
  let drawCleared = false;
  if (sections.standings) {
    const impact = standingsImportImpact(league, withStandings(league, bundle, mapping), { lotteryEligible });
    drawCleared = impact.drawCleared;
    if (impact.replacing) lines.push({ tone: 'danger', text: `${impact.replacing} standings row${s(impact.replacing)} on file will be replaced${impact.tieOrders ? `, and ${impact.tieOrders} recorded tie-break${s(impact.tieOrders)} cleared` : ''}.` });
    if (impact.drawCleared) lines.push({ tone: 'danger', text: 'The lottery draw on file will be cleared: the new standings change which teams are in the lottery.' });
  }
  if (sections.picks) {
    const changed = resolvedPickOwners(bundle, mapping).filter(p => {
      const now = pickOwnerId(league, p.round, p.originalTeamId);
      return now !== p.originalTeamId && now !== p.ownerTeamId;
    });
    if (changed.length) lines.push({ tone: 'danger', text: `${changed.length} pick trade${s(changed.length)} you recorded by hand will be overwritten where Yahoo shows a different owner.` });
  }
  const destructive = lines.some(l => l.tone === 'danger');
  if (destructive) lines.push({ tone: 'ok', text: 'Declared keepers and anything not listed above are untouched.' });
  return { hasImpact: destructive, lines, drawCleared };
}

function withStandings(league, bundle, mapping) {
  const rows = (bundle.standings || []).filter(r => mapping[r.teamKey]).map(r => ({
    teamId: mapping[r.teamKey], rank: r.rank, wins: r.wins, losses: r.losses, ties: r.ties, pct: r.pct, pts: r.pts,
    clinched: r.playoffSeed != null, sourceName: r.name,
  }));
  return { ...league, standings: { season: league.season || null, importedAt: new Date().toISOString(), rows, tieResolutions: {} } };
}

// Apply the chosen sections. Returns the next league and a per-section summary
// for the result step. Nothing here asks for confirmation — the caller shows
// yahooImportImpact first.
export function applyYahooImport(league, bundle, mapping, { rosters = false, draft = false, standings = false, picks = false, rosterSet = 'cutoff', renames = {} } = {}) {
  let next = league;
  const summary = {};
  const entries = [];
  const teamIdFor = key => mapping?.[key] || null;
  const mappedKeys = (bundle.teams || []).filter(t => teamIdFor(t.teamKey));

  // Renames first, so every summary and log line below uses the new names.
  const renamed = Object.entries(renames || {}).filter(([id, name]) => name && (next.teams || []).some(tm => tm.id === id && tm.name !== name));
  if (renamed.length) {
    const byId = Object.fromEntries(renamed);
    next = { ...next, teams: next.teams.map(tm => (byId[tm.id] ? { ...tm, name: byId[tm.id] } : tm)) };
    summary.renamed = renamed.length;
  }

  if (rosters) {
    const set = (rosterSet === 'final' ? bundle.rosters.final : bundle.rosters.cutoff) || bundle.rosters.final || {};
    let players = 0;
    for (const t of mappedKeys) {
      const list = (set[t.teamKey] || []).filter(p => p.name).map(rosterEntry);
      next = withRosterImport(next, teamIdFor(t.teamKey), list);
      players += list.length;
    }
    summary.rosters = { teams: mappedKeys.length, players, asOf: rosterSet === 'final' || !bundle.rosters.cutoff ? null : bundle.rosters.cutoffDate };
    entries.push(changeEntry({ kind: 'import', field: 'roster', note: `Yahoo: ${players} players across ${mappedKeys.length} teams${summary.rosters.asOf ? ` as of ${summary.rosters.asOf}` : ''}` }));
  }

  if (draft) {
    const termed = hasTerm(league);
    const length = termOf(league).years || null;
    const byTeam = new Map();
    for (const p of bundle.draft || []) {
      const id = teamIdFor(p.teamKey);
      if (!id || !p.name) continue;
      if (!byTeam.has(id)) byTeam.set(id, []);
      byTeam.get(id).push(p);
    }
    let rows = 0; let priced = 0;
    next = { ...next, teams: next.teams.map(tm => {
      const drafted = byTeam.get(tm.id);
      if (!drafted) return tm;
      const existingBy = new Map((tm.priorKeepers || []).map(p => [normalizeName(p.player), p]));
      const priorKeepers = drafted.map(p => {
        const existing = existingBy.get(normalizeName(p.name));
        const base = {
          player: p.name, proTeam: p.proTeam || undefined, positions: (p.positions || []).join(',') || undefined,
          ...(p.yahooPlayerId ? { yahooPlayerId: p.yahooPlayerId } : {}), sourceName: p.name,
          acquisitionRound: p.round ?? null, acquisitionMethod: 'draft', rookieAtAcquisition: false,
        };
        const price = p.cost != null || isPriceOverridden(existing) ? refreshComputedPrice(existing, p.cost) : {};
        if (price.keptFor != null) priced++;
        if (!termed) return { ...base, ...price, yearsKept: existing?.yearsKept ?? 0 };
        // Yahoo knows nothing about contract terms: a term already recorded
        // for this player is carried over rather than reset to year one.
        const term = existing
          ? Object.fromEntries(['contractYear', 'contractLength', 'startSeason', 'expired', 'contractStatus', 'expiredAfterSeason'].filter(k => existing[k] !== undefined).map(k => [k, existing[k]]))
          : { contractYear: 0, contractLength: length };
        return { ...base, ...term, ...price };
      });
      rows += priorKeepers.length;
      return { ...tm, priorKeepers };
    }) };
    summary.draft = { teams: byTeam.size, players: rows, priced };
    entries.push(changeEntry({ kind: 'import', field: 'priorKeepers', note: `Yahoo: ${rows} drafted players across ${byTeam.size} teams` }));
  }

  if (standings) {
    const before = next;
    next = { ...next, standings: withStandings(next, bundle, mapping).standings };
    const impact = standingsImportImpact(before, next, { lotteryEligible });
    if (impact.drawCleared) next = { ...next, lotteryDraw: null, lotteryResults: null };
    summary.standings = { teams: next.standings.rows.length, drawCleared: impact.drawCleared };
    entries.push(changeEntry({ kind: 'import', field: 'standings', note: `Yahoo: ${next.standings.rows.length} teams${impact.drawCleared ? ' · lottery draw cleared' : ''}` }));
  }

  if (picks) {
    const owners = resolvedPickOwners(bundle, mapping);
    let maxRound = 0; let traded = 0;
    for (const p of owners) {
      const own = p.originalTeamId === p.ownerTeamId;
      next = reassignPick(next, p.round, p.originalTeamId, own ? null : p.ownerTeamId);
      if (!own) traded++;
      maxRound = Math.max(maxRound, p.round);
    }
    if (maxRound > getDraftRounds(next)) next = { ...next, draftPicks: { ownership: {}, ...next.draftPicks, rounds: maxRound } };
    summary.picks = { traded };
    entries.push(changeEntry({ kind: 'import', field: 'draftPicks', note: `Yahoo: ${traded} traded pick${traded === 1 ? '' : 's'}` }));
  }

  // Remember every confirmed Yahoo name → team, so later pastes resolve too.
  next = rememberYahooTeams(next, Object.fromEntries(mappedKeys.map(t => [t.name, teamIdFor(t.teamKey)])));
  next = { ...next, yahooSource: { leagueKey: bundle.league.leagueKey, name: bundle.league.name, season: bundle.league.season, importedAt: new Date().toISOString() } };
  return { league: appendChanges(next, entries), summary };
}
