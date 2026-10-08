// One-time backfill: write `startSeason` onto contract records that predate
// season anchoring.
//
// THE DEFAULT IS A DRY RUN AND THERE IS NO AUTOMATIC PATH. `planBackfill` is
// pure and writes nothing; `applyBackfill` returns a new league object and is
// reached only from a button a person clicks twice. Nothing here runs on
// deploy, on page load, or as a side effect of any other call — the planner
// is the only thing any surface calls without being asked.
//
// WHAT IT COMPUTES. The anchor is the season a contract's Y1 was:
//   startSeason = current season − (entering year − 1)
// where the entering year comes from the stored counter under whichever
// convention that array uses (see contractSeason.js). Nothing else about the
// record is touched — the counter stays, so a record is readable by an
// un-migrated client exactly as before and the backfill is reversible by
// deleting one field.
//
// WHAT IT REFUSES TO GUESS. Anything it cannot compute confidently is FLAGGED
// and excluded from the write rather than given a plausible value: a season
// label it cannot parse, a contract year outside its own term, a record whose
// existing anchor disagrees with its counter. A wrong anchor is worse than no
// anchor — no anchor falls back to today's behaviour, while a wrong one is
// silently authoritative.

import { normalizeName } from './players.js';
import { changeEntry } from './changeLog.js';
import { hasTerm, termOf } from './keeperRules.js';
import {
  seasonStartYear, seasonLabelFrom, counterEnteringYear,
  isArchivedContract, BASIS_SERVED, BASIS_ENTERING,
} from './contractSeason.js';

export const ACTION_SET = 'set';             // will gain an anchor
export const ACTION_ANCHORED = 'anchored';   // already has one, left alone
export const ACTION_FLAG = 'flag';           // cannot compute — excluded

// One record's plan. `basis` is carried so the writer patches the right array.
function planRecord(league, team, record, index, array, basis, defaultLen) {
  const base = {
    teamId: team.id, teamName: team.name, array, index,
    player: record.player,
    contractYear: record.contractYear ?? null,
    contractLength: record.contractLength ?? null,
    currentStartSeason: record.startSeason || null,
    proposedStartSeason: null,
    action: ACTION_FLAG,
    flag: null,
    note: null,
  };

  const currentStart = seasonStartYear(league.season);
  if (currentStart == null) {
    return { ...base, flag: `League season "${league.season ?? '(none)'}" is not a year I can read, so there is no season to count back from.` };
  }

  // Read the COUNTER, not enteringYearOf — on an already-anchored record the
  // anchor would feed its own comparison and the disagreement below could
  // never fire.
  const entering = counterEnteringYear(record, basis);
  if (entering == null || !Number.isFinite(entering)) {
    return { ...base, flag: 'No readable contract year on this record.' };
  }

  const len = record.contractLength || defaultLen;
  if (entering > len) {
    return { ...base, flag: `Its contract year reads as entering year ${entering} of a ${len}-year deal — the contract is already over, or the stored year is wrong.` };
  }

  const proposed = seasonLabelFrom(league.season, currentStart - (entering - 1));
  if (!proposed) {
    return { ...base, flag: 'Could not build a season label for the computed start year.' };
  }

  if (record.startSeason) {
    // Already anchored. Only worth mentioning when the two sources disagree —
    // which means one of them is wrong and a human has to say which.
    if (record.startSeason !== proposed) {
      return {
        ...base, proposedStartSeason: proposed,
        flag: `Already anchored to ${record.startSeason}, but its contract year says ${proposed}. Left alone — the two disagree and only you know which is right.`,
      };
    }
    return { ...base, proposedStartSeason: proposed, action: ACTION_ANCHORED };
  }

  const note = record.contractYear == null
    ? `No contract year stored; read as entering year ${entering}, which is how the app already displays it.`
    : null;
  return { ...base, proposedStartSeason: proposed, action: ACTION_SET, note, enteringYear: entering };
}

// → the plan for ONE league. Pure. `skipped` is set (and `records` empty) when
// the league has no contracts to anchor, which is the answer for every
// term-less league — the report says so explicitly rather than silently
// showing nothing.
export function planBackfill(league) {
  const out = {
    leagueId: league?.id ?? null,
    leagueName: league?.name ?? '(unnamed)',
    season: league?.season ?? null,
    sport: league?.sport ?? null,
    teams: (league?.teams || []).length,
    termed: hasTerm(league),
    skipped: null,
    records: [],
    counts: { total: 0, toSet: 0, anchored: 0, flagged: 0, archived: 0 },
  };

  if (!hasTerm(league)) {
    out.skipped = 'No fixed term — keeping costs dollars or a slot and nothing carries a contract year. Nothing to anchor, nothing will be written.';
    return out;
  }

  const defaultLen = termOf(league).years || league.contractYears || 3;

  for (const team of league.teams || []) {
    // Archived records describe contracts that already ended; they carry
    // `expiredAfterSeason`, which is the season fact an anchor would give
    // them. Skipped rather than anchored — a closed contract needs no clock.
    const plans = [
      ...(team.keepers || []).map((r, i) => ({ r, i, array: 'keepers', basis: BASIS_ENTERING })),
      ...(team.priorKeepers || []).map((r, i) => ({ r, i, array: 'priorKeepers', basis: BASIS_SERVED })),
    ];
    for (const { r, i, array, basis } of plans) {
      if (isArchivedContract(r)) { out.counts.archived++; continue; }
      const plan = planRecord(league, team, r, i, array, basis, defaultLen);
      out.records.push(plan);
      out.counts.total++;
      if (plan.action === ACTION_SET) out.counts.toSet++;
      else if (plan.action === ACTION_ANCHORED) out.counts.anchored++;
      else out.counts.flagged++;
    }
  }

  return out;
}

// → the plan across every league. The shape the dry-run report renders.
export function planBackfillAll(leagues) {
  const plans = (leagues || []).map(planBackfill);
  const totals = plans.reduce((acc, p) => ({
    leagues: acc.leagues + 1,
    termedLeagues: acc.termedLeagues + (p.termed ? 1 : 0),
    untouchedLeagues: acc.untouchedLeagues + (p.skipped ? 1 : 0),
    total: acc.total + p.counts.total,
    toSet: acc.toSet + p.counts.toSet,
    anchored: acc.anchored + p.counts.anchored,
    flagged: acc.flagged + p.counts.flagged,
    archived: acc.archived + p.counts.archived,
  }), { leagues: 0, termedLeagues: 0, untouchedLeagues: 0, total: 0, toSet: 0, anchored: 0, flagged: 0, archived: 0 });
  return { plans, totals };
}

// Apply ONE league's plan. → { league, changes, written }
//
// Writes only records the plan marked ACTION_SET; a flagged record is skipped
// by construction, so a report a person read and a write they then authorized
// cannot diverge. Records are addressed by array index, exactly as the plan
// read them, so a league edited between the dry run and the apply is caught by
// the player-name check rather than patching the wrong row.
export function applyBackfill(league, plan) {
  const byTeam = new Map();
  for (const rec of plan?.records || []) {
    if (rec.action !== ACTION_SET || !rec.proposedStartSeason) continue;
    if (!byTeam.has(rec.teamId)) byTeam.set(rec.teamId, []);
    byTeam.get(rec.teamId).push(rec);
  }
  if (byTeam.size === 0) return { league, changes: [], written: 0 };

  const changes = [];
  let written = 0;

  const teams = (league.teams || []).map(team => {
    const recs = byTeam.get(team.id);
    if (!recs) return team;
    const next = { ...team };
    for (const rec of recs) {
      const list = next[rec.array] || [];
      const row = list[rec.index];
      // The plan was built from a snapshot. If the row moved or changed
      // identity, skip it rather than anchoring the wrong player's contract.
      if (!row || normalizeName(row.player) !== normalizeName(rec.player)) continue;
      if (row.startSeason) continue;
      next[rec.array] = list.map((r, i) => (i === rec.index ? { ...r, startSeason: rec.proposedStartSeason } : r));
      written++;
      changes.push(changeEntry({
        kind: 'term', field: 'startSeason',
        teamId: team.id, teamName: team.name, player: row.player,
        from: null, to: rec.proposedStartSeason,
        note: `contract anchored to its start season (was reading year ${rec.enteringYear ?? '?'} off the counter)`,
      }));
    }
    return next;
  });

  return { league: { ...league, teams }, changes, written };
}
