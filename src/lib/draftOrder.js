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
// Ties are never sorted silently. The tiebreak CHAIN is:
//   1. the basis (regular-season points by default)
//   2. playoff finish — Yahoo's Rank column IS the playoff result, and the
//      worse rank picks earlier (it's already in the paste)
//   3. a coin flip, RECORDED with its seed so the same flip replays
// Nothing in the chain is applied without being recorded or derivable: a
// tie that reaches step 3 with no flip on file comes back as `unresolvedTies`
// (`needs: 'coinflip'`) and the order is not-ok until one is recorded. The
// `manual` setting is the override — every tie stops and asks for the order,
// and the recorded answer (`method: 'manual'`) beats the chain. Head-to-head
// is deliberately absent: it needs schedule data the paste doesn't carry.
//
// A recorded resolution is { method: 'manual'|'coinflip', order: [best…],
// seed?, at } under standings.tieResolutions[tieKey]; a bare array is read
// as a manual order (the first shape this shipped with).

import { pickOwnerId, getDraftRounds } from './draftPicks.js';
import { draftFormatOf } from './keeperRules.js';

export const BASIS_POINTS = 'points';   // regular-season Pts (default)
export const BASIS_RANK = 'rank';       // Yahoo's Rank column (reflects playoffs)
export const TIEBREAK_CHAIN = 'chain';     // points → playoff finish → coin flip (default)
export const TIEBREAK_MANUAL = 'manual';   // every tie stops and asks (the override)

export const BASIS_LABEL = { [BASIS_POINTS]: 'Regular-season points', [BASIS_RANK]: 'Final rank' };
export const TIEBREAK_LABEL = { [TIEBREAK_CHAIN]: 'Playoff finish, then coin flip', [TIEBREAK_MANUAL]: 'Ask me (manual)' };

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
    // Anything that isn't the manual override (including the retired W-L-T
    // and Pct options) is the chain.
    tiebreak: c.tiebreak === TIEBREAK_MANUAL ? TIEBREAK_MANUAL : TIEBREAK_CHAIN,
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

// Playoff finish: a lower Rank is a better finish. null ranks can't be
// compared and stay tied.
function rankCompare(a, b) {
  if (a.rank == null || b.rank == null) return 0;
  return b.rank - a.rank;   // >0 when a is BETTER (lower rank)
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

// A recorded resolution for exactly this set of teams, normalized, or null.
function resolutionFor(resolutions, teamIds) {
  const key = tieKey(teamIds);
  const raw = resolutions?.[key];
  const rec = Array.isArray(raw) ? { method: 'manual', order: raw } : raw;
  if (!rec || !Array.isArray(rec.order)) return null;
  if (rec.order.length !== teamIds.length || tieKey(rec.order) !== key) return null;
  return { method: rec.method === 'coinflip' ? 'coinflip' : 'manual', order: [...rec.order], seed: rec.seed ?? null, at: rec.at ?? null };
}

// A reproducible shuffle: mulberry32 over the SORTED ids, so the same seed
// on the same set always yields the same order (what "recorded" means).
export function coinFlipOrder(teamIds, seed) {
  const ids = [...teamIds].sort();
  let a = (Number(seed) >>> 0);
  const rnd = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

// Standings → finish order (best first), applying the basis, then the chain
// (or the manual override), then recorded resolutions. Ties that reach the
// end of the chain unrecorded are reported.
//
// → { ok, reason?, finish: [{teamId, ...row}] best-first,
//     ties: [{ key, teams, resolved, method: 'rank'|'manual'|'coinflip'|null, order, needs? }],
//     unresolvedTies: [...], missing: [teamId], config }
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
  const manual = config.tiebreak === TIEBREAK_MANUAL;

  const applyRecorded = (sub, allowed) => {
    const rec = resolutionFor(resolutions, sub.map(r => r.teamId));
    if (!rec || !allowed.includes(rec.method)) return false;
    const byTeam = new Map(sub.map(r => [r.teamId, r]));
    rec.order.forEach(id => finish.push(byTeam.get(id)));
    ties.push({ key: tieKey(rec.order), teams: sub.map(r => r.teamId), resolved: true, method: rec.method, order: rec.order, seed: rec.seed, at: rec.at });
    return true;
  };
  const leaveUnresolved = (sub, needs) => {
    sub.forEach(r => finish.push(r));
    ties.push({ key: tieKey(sub.map(r => r.teamId)), teams: sub.map(r => r.teamId), resolved: false, method: null, order: null, needs });
  };

  for (const group of groupBy(primary, (a, b) => basisValue(a, config.basis) === basisValue(b, config.basis))) {
    if (group.length === 1) { finish.push(group[0]); continue; }
    if (manual) {
      // The override: a recorded answer (of either kind) or stop.
      if (!applyRecorded(group, ['manual', 'coinflip'])) leaveUnresolved(group, 'manual');
      continue;
    }
    // Chain. A manual order recorded for this exact set still wins — that's
    // what makes manual an OVERRIDE rather than just another setting.
    if (applyRecorded(group, ['manual'])) continue;
    // Step 2: playoff finish. Worse rank → lower finish → earlier pick.
    const byRank = [...group].sort((a, b) => rankCompare(b, a));
    const subgroups = groupBy(byRank, (a, b) => rankCompare(a, b) === 0);
    if (subgroups.length === group.length) {
      byRank.forEach(r => finish.push(r));
      ties.push({ key: tieKey(group.map(r => r.teamId)), teams: group.map(r => r.teamId), resolved: true, method: 'rank', order: byRank.map(r => r.teamId) });
      continue;
    }
    for (const sub of subgroups) {
      if (sub.length === 1) { finish.push(sub[0]); continue; }
      // Step 3: a recorded coin flip (or a manual order for this sub-set).
      if (!applyRecorded(sub, ['coinflip', 'manual'])) leaveUnresolved(sub, 'coinflip');
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
export function resolveTie(league, orderedTeamIds, at = new Date().toISOString()) {
  const standings = standingsOf(league);
  if (!standings || !Array.isArray(orderedTeamIds) || orderedTeamIds.length < 2) return league;
  const key = tieKey(orderedTeamIds);
  if (new Set(orderedTeamIds).size !== orderedTeamIds.length) return league;
  return {
    ...league,
    standings: { ...standings, tieResolutions: { ...(standings.tieResolutions || {}), [key]: { method: 'manual', order: [...orderedTeamIds], at } } },
  };
}

// Record a coin flip for one tie group. The seed is what makes it
// reproducible: the stored order is coinFlipOrder(teamIds, seed), and a test
// (or a suspicious GM) can replay it. A seed is generated when none is given.
export function recordCoinFlip(league, teamIds, seed = null, at = new Date().toISOString()) {
  const standings = standingsOf(league);
  if (!standings || !Array.isArray(teamIds) || teamIds.length < 2) return league;
  if (new Set(teamIds).size !== teamIds.length) return league;
  const s = seed == null ? Math.floor(Math.random() * 0x100000000) : (Number(seed) >>> 0);
  const key = tieKey(teamIds);
  return {
    ...league,
    standings: { ...standings, tieResolutions: { ...(standings.tieResolutions || {}), [key]: { method: 'coinflip', seed: s, order: coinFlipOrder(teamIds, s), at } } },
  };
}

// Human-readable line for a broken tie.
export function describeTie(tie, nameOf) {
  const names = ids => ids.map(nameOf).join(' > ');
  if (!tie.resolved) return `${tie.teams.map(nameOf).join(' / ')} — ${tie.needs === 'coinflip' ? 'coin flip needed' : 'order needed'}`;
  if (tie.method === 'rank') return `${names(tie.order)} — by playoff finish`;
  if (tie.method === 'coinflip') return `${names(tie.order)} — coin flip (seed ${tie.seed})`;
  return `${names(tie.order)} — set by hand`;
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
    case 'unresolved-ties': return 'The standings have a tie still to break.';
    case 'lottery-pending': return 'The lottery hasn’t been run yet.';
    case 'stale-lottery': return 'The lottery on file no longer matches the standings — re-run it.';
    case 'not-snake': return 'Draft order applies to snake drafts only.';
    default: return '';
  }
}
