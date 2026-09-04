// Import guards — what a bulk import is about to destroy, counted before it runs.
//
// Every paste import in this app REPLACES the list it targets: a roster
// re-import replaces team.roster, a draft re-import replaces team.priorKeepers
// for each mapped team. That's fine on an empty league and quietly expensive
// once the commissioner has done real work on top of the imported data, which
// is exactly when a re-import is most likely (fixing one bad row by pasting the
// whole thing again).
//
// This module computes the impact; the caller shows it and asks. It returns
// COUNTS the app already knows rather than a generic "are you sure" — a
// warning that can't say what's at stake teaches people to click through it.
//
// Deliberately NOT here: merge-instead-of-replace, and snapshot/undo. Both are
// the better answer and both are logged as follow-ups; this is the guard.
//
// Pure — no React — so scripts/test-provenance.mjs runs it in plain node.

import { normalizeName } from './players.js';
import { countOverriddenPrices } from './priceProvenance.js';

// A roster re-import replaces one team's roster list. It does NOT delete
// declared keepers — but the roster is the spine of buildTeamPool, so a keeper
// whose name isn't in the new paste drops out of that team's eligible pool
// while still sitting in its keeper slot. That's the sharp, specific loss
// worth naming, and it's knowable here: the parsed names are already in hand.
export function rosterImportImpact(league, teamId, incomingNames) {
  const team = (league?.teams || []).find(tm => tm.id === teamId) || null;
  const roster = team?.roster || [];
  const keepers = team?.keepers || [];
  const incoming = new Set((incomingNames || []).map(normalizeName).filter(Boolean));
  const keepersMissing = keepers
    .map(k => k.player)
    .filter(name => name && !incoming.has(normalizeName(name)));

  return {
    teamId,
    teamName: team?.name || '',
    replacing: roster.length,
    keepers: keepers.length,
    keepersMissing,
    // A roster carries no prices, so an override count here would be noise —
    // stated explicitly so a future reader doesn't "fix" its absence.
    hasImpact: roster.length > 0,
  };
}

// A draft re-import replaces priorKeepers for every team the paste maps to.
// Hand-set PRICES survive it (refreshComputedPrice carries the override while
// the imported value underneath refreshes) — that's worth saying, because a
// guard that only lists losses gets dismissed. Everything else on those rows —
// draft rounds, term years, resolved player IDs — comes from the paste and
// replaces what's on file.
export function draftImportImpact(league, mapping, parsedTeams) {
  const ids = (parsedTeams || []).map(parsed => mapping?.[parsed.name]).filter(Boolean);
  return priorKeepersImpact(league, ids);
}

// The same counts for any import that REPLACES priorKeepers on a set of teams,
// however it decided which teams those are. draftImportImpact resolves them
// through the Yahoo-name mapping; the dormant contracts paste matches on team
// name. One implementation so a second paste surface can't ship a weaker
// warning than the first.
export function priorKeepersImpact(league, teamIds) {
  const teams = [];
  for (const teamId of [...new Set(teamIds || [])]) {
    const team = (league?.teams || []).find(tm => tm.id === teamId);
    if (!team) continue;
    const priors = team.priorKeepers || [];
    if (priors.length === 0) continue;
    teams.push({
      teamId,
      teamName: team.name,
      replacing: priors.length,
      overrides: countOverriddenPrices(priors),
      rounds: priors.filter(p => p.acquisitionRound != null).length,
    });
  }
  const totals = teams.reduce((acc, tm) => ({
    replacing: acc.replacing + tm.replacing,
    overrides: acc.overrides + tm.overrides,
    rounds: acc.rounds + tm.rounds,
  }), { replacing: 0, overrides: 0, rounds: 0 });

  return {
    teams,
    ...totals,
    // Declared keepers hold their own snapshotted keep cost, so a draft
    // re-import doesn't touch them. Counted so the dialog can say so.
    declaredKeepers: (league?.teams || []).reduce((s, tm) => s + (tm.keepers || []).length, 0),
    hasImpact: teams.length > 0,
  };
}

// Bullet lines for the confirm dialog. Kept here (not in the component) so the
// wording is testable and the two import surfaces can't drift apart.
export function rosterGuardLines(impact) {
  const lines = [];
  const s = (n) => (n === 1 ? '' : 's');
  lines.push({
    tone: 'danger',
    text: `${impact.replacing} player${s(impact.replacing)} currently on file for ${impact.teamName} will be replaced by this paste — including any you added or removed by hand.`,
  });
  if (impact.keepers > 0) {
    const miss = impact.keepersMissing.length;
    if (miss > 0) {
      lines.push({
        tone: 'danger',
        text: `${miss} of ${impact.teamName}'s ${impact.keepers} declared keeper${s(impact.keepers)} ${miss === 1 ? 'is' : 'are'} not in this paste (${impact.keepersMissing.join(', ')}). They stay declared, but they'll no longer appear in the eligible pool.`,
      });
    } else {
      lines.push({
        tone: 'ok',
        text: `All ${impact.keepers} declared keeper${s(impact.keepers)} for ${impact.teamName} appear in this paste and are unaffected.`,
      });
    }
  }
  return lines;
}

// A pick-trade paste doesn't replace a list — it writes ownership pair by pair
// (reassignPick), so the only thing it can destroy is a pick trade the
// commissioner recorded by hand and the paste now contradicts. That's a
// per-pick comparison, not a count of rows, so it gets its own impact shape.
//
// `trades` are the paste's rows already resolved to ids:
//   [{ round, originalTeamId, ownerTeamId }]
export function picksImportImpact(league, trades) {
  const ownership = league?.draftPicks?.ownership || {};
  const conflicts = [];
  for (const trade of trades || []) {
    if (!trade?.originalTeamId) continue;
    const key = `${trade.round}:${trade.originalTeamId}`;
    const current = ownership[key];
    if (!current) continue;                       // untraded today — nothing to lose
    if (current === trade.ownerTeamId) continue;  // the paste agrees
    const nameOf = id => (league?.teams || []).find(tm => tm.id === id)?.name || '?';
    conflicts.push({
      round: trade.round,
      original: nameOf(trade.originalTeamId),
      from: nameOf(current),
      to: trade.ownerTeamId ? nameOf(trade.ownerTeamId) : nameOf(trade.originalTeamId),
    });
  }
  return { conflicts, hasImpact: conflicts.length > 0 };
}

export function picksGuardLines(impact) {
  const n = impact.conflicts.length;
  return [{
    tone: 'danger',
    text: `${n} pick${n === 1 ? '' : 's'} you already recorded as traded ${n === 1 ? 'is' : 'are'} owned differently in this paste and will be overwritten: ${
      impact.conflicts.map(c => `R${c.round} ${c.original}'s pick (${c.from} → ${c.to})`).join('; ')}.`,
  }, {
    tone: 'ok',
    text: 'Every other pick you set by hand is left exactly as it is — this paste only writes the picks it names.',
  }];
}

export function draftGuardLines(impact) {
  const lines = [];
  const s = (n) => (n === 1 ? '' : 's');
  const names = impact.teams.map(tm => tm.teamName).join(', ');
  lines.push({
    tone: 'danger',
    text: `${impact.replacing} draft row${s(impact.replacing)} on file for ${names} will be replaced by this paste.`,
  });
  if (impact.rounds > 0) {
    lines.push({
      tone: 'danger',
      text: `${impact.rounds} draft round${s(impact.rounds)} on those rows come from the paste and will be overwritten, including any you set by hand.`,
    });
  }
  if (impact.overrides > 0) {
    lines.push({
      tone: 'ok',
      text: `${impact.overrides} hand-set price${s(impact.overrides)} will be kept — the imported price underneath refreshes, your edit stays in force.`,
    });
  }
  if (impact.declaredKeepers > 0) {
    lines.push({
      tone: 'ok',
      text: `${impact.declaredKeepers} declared keeper${s(impact.declaredKeepers)} across the league keep the cost already recorded on them.`,
    });
  }
  return lines;
}

// A standings paste replaces the whole standings block (rows AND the manual
// tie orders recorded against them). The sharp loss is downstream: a lottery
// already drawn was drawn among the WORST N under the old standings, so if
// the new standings change who those N are, the draw is void and is cleared.
// The comparison needs the new eligible set, so the caller passes the
// provisional league (standings swapped in, nothing saved yet).
export function standingsImportImpact(league, provisional, { lotteryEligible } = {}) {
  const rows = league?.standings?.rows || [];
  const tieOrders = Object.keys(league?.standings?.tieResolutions || {}).length;
  const eligibleNow = typeof lotteryEligible === 'function' ? lotteryEligible(league) : [];
  const eligibleNext = typeof lotteryEligible === 'function' ? lotteryEligible(provisional) : [];
  const hasDraw = !!(league?.lotteryDraw?.order?.length) || !!(Array.isArray(league?.lotteryResults) && league.lotteryResults.length);
  const sameSet = eligibleNow.length === eligibleNext.length && [...eligibleNow].sort().join('|') === [...eligibleNext].sort().join('|');
  const drawCleared = hasDraw && !sameSet;
  return {
    replacing: rows.length,
    tieOrders,
    hasDraw,
    drawCleared,
    drawKept: hasDraw && sameSet,
    hasImpact: rows.length > 0 || drawCleared,
  };
}

export function standingsGuardLines(impact) {
  const lines = [];
  const s = (n) => (n === 1 ? '' : 's');
  if (impact.replacing > 0) {
    lines.push({ tone: 'danger', text: `${impact.replacing} standings row${s(impact.replacing)} on file will be replaced by this paste.` });
  }
  if (impact.tieOrders > 0) {
    lines.push({ tone: 'danger', text: `${impact.tieOrders} recorded tie-break${s(impact.tieOrders)} (hand-set orders and coin flips) will be cleared — any tie in the new standings is broken again.` });
  }
  if (impact.drawCleared) {
    lines.push({ tone: 'danger', text: 'The lottery draw on file will be cleared: the new standings change which teams are in the lottery, so the draw no longer applies. Re-run it on the Lottery page.' });
  } else if (impact.drawKept) {
    lines.push({ tone: 'ok', text: 'The lottery draw on file stays valid — the same teams are in the lottery under the new standings.' });
  }
  lines.push({ tone: 'ok', text: 'Pick trades recorded on the Picks page and every keeper are untouched.' });
  return lines;
}
