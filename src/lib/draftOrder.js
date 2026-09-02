// Draft order — standings in, draft board out. Pure, no React.
//
// Before this module, the draft order was uncomputable: Picks knew who owned
// which round-slot and the Lottery reordered four hand-picked teams, but
// nothing knew the STANDINGS, so nothing could say "pick 37 belongs to Amar
// via Pedram". This is the data layer for that sentence. Member-facing views
// come later, from a design pass; this only has to be right.
//
// Inputs (all in the league blob, no schema change):
//   league.standings = {
//     season, importedAt,
//     rows: [{ teamId, rank, wins, losses, ties, pct, pts, clinched }],
//     // Manual tie orders, keyed by the SET of tied teams (sorted ids joined
//     // by '|'), value = those teams best-first. Keyed on the set so it holds
//     // regardless of which tiebreak produced the group, and lives inside
//     // `standings` so a re-import (new season) clears it with the rows.
//     tieResolutions: { "<idA|idB>": [idA, idB] },
//   }
//   league.draftOrderConfig = { basis, lotteryTeams, tiebreak }   // Settings
//   league.lotteryDraw = { at, order: [teamId...] }   // the lottery-eligible
//     teams in the order they drew picks 1..N (Lottery page)
//   league.draftPicks   — pick OWNERSHIP by round (draftPicks.js)
//
// Ties are never sorted silently. A tie the configured tiebreak can't break
// (or any tie at all under `manual`) comes back as `unresolvedTies` and the
// order is reported as not-ok — a wrong draft order is worse than a stalled
// import, and nobody notices a wrong one until the draft.

import { pickOwnerId, getDraftRounds } from './draftPicks.js';
import { draftFormatOf } from './keeperRules.js';

export const BASIS_POINTS = 'points';   // regular-season Pts (default)
export const BASIS_RANK = 'rank';       // Yahoo's Rank column (reflects playoffs)
export const TIEBREAK_MANUAL = 'manual';
export const TIEBREAK_RECORD = 'record';   // W-L-T
export const TIEBREAK_PCT = 'pct';

export const BASIS_LABEL = { [BASIS_POINTS]: 'Regular-season points', [BASIS_RANK]: 'Final rank' };
export const TIEBREAK_LABEL = { [TIEBREAK_MANUAL]: 'Ask me (manual)', [TIEBREAK_RECORD]: 'W-L-T record', [TIEBREAK_PCT]: 'Win %' };

export const DEFAULT_LOTTERY_TEAMS = 4;

// Settings → a fully-defaulted config. `bottomLotteryTeams` is the pre-existing
// field the old Lottery page read; it's honoured as the fallback so a league
// that set it keeps its count.
export function draftOrderConfigOf(league) {
  const c = league?.draftOrderConfig || {};
  const legacy = league?.bottomLotteryTeams;
  const lottery = Number.isFinite(c.lotteryTeams) ? c.lotteryTeams
    : Number.isFinite(legacy) ? legacy
    : DEFAULT_LOTTERY_TEAMS;
  return {
    basis: c.basis === BASIS_RANK ? BASIS_RANK : BASIS_POINTS,
    lotteryTeams: Math.max(0, Math.floor(lottery)),
    tiebreak: c.tiebreak === TIEBREAK_RECORD || c.tiebreak === TIEBREAK_PCT ? c.tiebreak : TIEBREAK_MANUAL,
  };
}

export function standingsOf(league) {
  const s = league?.standings;
  return s && Array.isArray(s.rows) && s.rows.length > 0 ? s : null;
}

export function tieKey(teamIds) {
  return [...teamIds].sort().join('|');
}

// The primary sort value under a basis — HIGHER is better in both cases, so
// rank is negated. null when the row can't be ranked on that basis.
function basisValue(row, basis) {
  if (basis === BASIS_RANK) return row.rank == null ? null : -row.rank;
  return row.pts == null ? null : row.pts;
}

// Secondary comparison for a tie group. Returns >0 when a is BETTER than b.
function tiebreakCompare(a, b, tiebreak) {
  if (tiebreak === TIEBREAK_RECORD) {
    if (a.wins != null && b.wins != null && a.wins !== b.wins) return a.wins - b.wins;
    if (a.losses != null && b.losses != null && a.losses !== b.losses) return b.losses - a.losses;
    if (a.ties != null && b.ties != null && a.ties !== b.ties) return a.ties - b.ties;
    return 0;
  }
  if (tiebreak === TIEBREAK_PCT) {
    if (a.pct != null && b.pct != null && a.pct !== b.pct) return a.pct - b.pct;
    return 0;
  }
  return 0;
}

// Split a list into runs of rows the comparator can't separate (stable).
function groupBy(rows, same) {
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && same(last[0], row)) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

// Standings → finish order (best first), applying basis, tiebreak, and any
// recorded manual tie orders. Ties that survive all three are reported.
//
// → { ok, reason?, finish: [{teamId, ...row}] best-first, ties: [{teams, key, resolved}], unresolvedTies: [...], missing: [teamId] }
export function rankStandings(league) {
  const teams = league?.teams || [];
  const config = draftOrderConfigOf(league);
  const standings = standingsOf(league);
  if (!standings) return { ok: false, reason: 'no-standings', finish: [], ties: [], unresolvedTies: [], missing: teams.map(t => t.id), config };

  const byId = new Map(teams.map(t => [t.id, t]));
  const rows = standings.rows.filter(r => r && byId.has(r.teamId));
  const covered = new Set(rows.map(r => r.teamId));
  const missing = teams.filter(t => !covered.has(t.id)).map(t => t.id);
  if (missing.length > 0) {
    return { ok: false, reason: 'incomplete', finish: [], ties: [], unresolvedTies: [], missing, config };
  }
  const unranked = rows.filter(r => basisValue(r, config.basis) == null).map(r => r.teamId);
  if (unranked.length > 0) {
    return { ok: false, reason: 'unranked', finish: [], ties: [], unresolvedTies: [], missing: [], unranked, config };
  }

  // Primary sort, best first. Stable on the imported row order underneath.
  const primary = [...rows].sort((a, b) => basisValue(b, config.basis) - basisValue(a, config.basis));
  const resolutions = standings.tieResolutions || {};
  const finish = [];
  const ties = [];
  for (const group of groupBy(primary, (a, b) => basisValue(a, config.basis) === basisValue(b, config.basis))) {
    if (group.length === 1) { finish.push(group[0]); continue; }
    // Configured tiebreak first (manual = none), then whatever it leaves tied
    // goes to the recorded manual orders.
    const manual = config.tiebreak === TIEBREAK_MANUAL;
    const broken = manual ? group : [...group].sort((a, b) => tiebreakCompare(b, a, config.tiebreak));
    const subgroups = manual ? [broken] : groupBy(broken, (a, b) => tiebreakCompare(a, b, config.tiebreak) === 0);
    for (const sub of subgroups) {
      if (sub.length === 1) { finish.push(sub[0]); continue; }
      const key = tieKey(sub.map(r => r.teamId));
      const recorded = resolutions[key];
      const valid = Array.isArray(recorded) && recorded.length === sub.length && tieKey(recorded) === key;
      if (valid) {
        const byTeam = new Map(sub.map(r => [r.teamId, r]));
        recorded.forEach(id => finish.push(byTeam.get(id)));
        ties.push({ key, teams: sub.map(r => r.teamId), resolved: true, order: [...recorded] });
      } else {
        sub.forEach(r => finish.push(r));
        ties.push({ key, teams: sub.map(r => r.teamId), resolved: false, order: null });
      }
    }
  }
  const unresolvedTies = ties.filter(t => !t.resolved);
  return {
    ok: unresolvedTies.length === 0,
    reason: unresolvedTies.length ? 'unresolved-ties' : null,
    finish,
    ties,
    unresolvedTies,
    missing: [],
    config,
  };
}

// Record a manual order for one tie group (teamIds best-first). Validates
// that it names exactly the tied set — a partial or foreign order is ignored
// rather than stored wrong.
export function resolveTie(league, orderedTeamIds) {
  const standings = standingsOf(league);
  if (!standings || !Array.isArray(orderedTeamIds) || orderedTeamIds.length < 2) return league;
  const key = tieKey(orderedTeamIds);
  if (new Set(orderedTeamIds).size !== orderedTeamIds.length) return league;
  return {
    ...league,
    standings: { ...standings, tieResolutions: { ...(standings.tieResolutions || {}), [key]: [...orderedTeamIds] } },
  };
}

// Base draft order: worst finisher first. Slot 1 = the worst team's pick
// before any lottery. `finish` on each entry is the standings position
// (1 = best), which is what the Lottery page shows as the seed.
//
// → { ok, reason, order: [{ slot, teamId, finish }], ties, unresolvedTies, config }
export function baseDraftOrder(league) {
  const ranked = rankStandings(league);
  const n = ranked.finish.length;
  const order = [...ranked.finish].reverse().map((row, i) => ({ slot: i + 1, teamId: row.teamId, finish: n - i }));
  return { ...ranked, order };
}

// The worst N teams — the ones in the lottery for picks 1..N. Empty when
// there's no lottery, or no usable standings.
export function lotteryEligible(league) {
  const base = baseDraftOrder(league);
  if (!base.ok) return [];
  return base.order.slice(0, base.config.lotteryTeams).map(e => e.teamId);
}

// The lottery draw on file, validated against today's eligible set. A draw
// whose teams no longer match the standings (re-import, config change) is
// reported stale rather than applied: `{ order, stale }`; null when none.
//
// Legacy: a league locked on the old Lottery page carries `lotteryResults`
// (a slate keyed by team NAME) and no `lotteryDraw`. Its lottery rows'
// `original` names are read as the draw so an already-run lottery survives.
export function lotteryDrawOf(league) {
  const teams = league?.teams || [];
  let order = null, at = null;
  if (Array.isArray(league?.lotteryDraw?.order) && league.lotteryDraw.order.length > 0) {
    order = league.lotteryDraw.order.filter(id => teams.some(t => t.id === id));
    at = league.lotteryDraw.at || null;
  } else if (Array.isArray(league?.lotteryResults)) {
    const idOf = name => teams.find(t => t.name === name)?.id;
    const rows = league.lotteryResults.filter(r => r.lottery && r.original).sort((a, b) => a.pick - b.pick);
    const ids = rows.map(r => idOf(r.original)).filter(Boolean);
    if (ids.length > 0 && ids.length === rows.length) order = ids;
  }
  if (!order || order.length === 0) return null;
  const eligible = lotteryEligible(league);
  const stale = eligible.length !== order.length || tieKey(eligible) !== tieKey(order);
  return { order, at, stale };
}

// Round 1, slot by slot: the ORIGINAL owner of each slot after the lottery.
// Lottery slots without a draw yet are pending (originalTeamId null) — the
// board still lists them so a view can show "pick 3 · lottery · TBD".
//
// → { ok, reason, slots: [{ slot, originalTeamId, finish, lottery, pending }], complete, base, draw }
export function round1Order(league) {
  const base = baseDraftOrder(league);
  if (!base.ok) return { ok: false, reason: base.reason, slots: [], complete: false, base, draw: null };
  const n = base.config.lotteryTeams;
  const draw = lotteryDrawOf(league);
  const usable = draw && !draw.stale ? draw : null;
  const finishOf = new Map(base.order.map(e => [e.teamId, e.finish]));
  const slots = base.order.map((e, i) => {
    if (i < n) {
      const id = usable ? usable.order[i] : null;
      return { slot: e.slot, originalTeamId: id, finish: id ? finishOf.get(id) : null, lottery: true, pending: !id };
    }
    return { slot: e.slot, originalTeamId: e.teamId, finish: e.finish, lottery: false, pending: false };
  });
  const complete = n === 0 || !!usable;
  return {
    ok: true,
    reason: complete ? null : (draw?.stale ? 'stale-lottery' : 'lottery-pending'),
    slots, complete, base, draw,
  };
}

// The full board: every pick in every round with its original and current
// owner. Snake — even rounds reverse round 1 — is applied ONLY when the
// league's draft format says snake; an auction league has no board here
// (nomination order is a different thing and out of scope).
//
// Overall pick number = (round − 1) × teams + slot.
//
// → { ok, reason, format, teams, rounds, complete, picks: [{ round, slot, overall, originalTeamId, ownerTeamId, lottery, pending, traded }], round1, ties, unresolvedTies, lotteryEligible, config }
export function buildDraftBoard(league) {
  const format = draftFormatOf(league);
  const config = draftOrderConfigOf(league);
  if (format !== 'snake') {
    return { ok: false, reason: 'not-snake', format, teams: (league?.teams || []).length, rounds: 0, complete: false, picks: [], round1: [], ties: [], unresolvedTies: [], lotteryEligible: [], config };
  }
  const r1 = round1Order(league);
  const base = r1.base;
  const common = {
    format, config,
    teams: (league?.teams || []).length,
    ties: base.ties, unresolvedTies: base.unresolvedTies,
    lotteryEligible: base.ok ? base.order.slice(0, config.lotteryTeams).map(e => e.teamId) : [],
  };
  if (!r1.ok) return { ...common, ok: false, reason: r1.reason, rounds: 0, complete: false, picks: [], round1: [], missing: base.missing, unranked: base.unranked };

  const rounds = getDraftRounds(league);
  const n = r1.slots.length;
  const picks = [];
  for (let round = 1; round <= rounds; round++) {
    const seq = round % 2 === 1 ? r1.slots : [...r1.slots].reverse();
    seq.forEach((s, i) => {
      const slot = i + 1;
      const originalTeamId = s.originalTeamId;
      const ownerTeamId = originalTeamId ? pickOwnerId(league, round, originalTeamId) : null;
      picks.push({
        round, slot, overall: (round - 1) * n + slot,
        originalTeamId, ownerTeamId,
        lottery: s.lottery, pending: s.pending,
        traded: !!originalTeamId && ownerTeamId !== originalTeamId,
      });
    });
  }
  return {
    ...common,
    ok: true,
    reason: r1.reason,
    rounds, complete: r1.complete, picks, round1: r1.slots,
    draw: r1.draw,
  };
}

// Human-readable reason for a board that couldn't be built or isn't final.
export function describeBoardReason(reason) {
  switch (reason) {
    case 'no-standings': return 'No standings imported yet.';
    case 'incomplete': return 'The standings on file don’t cover every team.';
    case 'unranked': return 'Some standings rows have no value to sort on under the configured basis.';
    case 'unresolved-ties': return 'The standings have a tie that has to be broken by hand.';
    case 'lottery-pending': return 'The lottery hasn’t been run yet.';
    case 'stale-lottery': return 'The lottery on file no longer matches the standings — re-run it.';
    case 'not-snake': return 'Draft order applies to snake drafts only.';
    default: return '';
  }
}
