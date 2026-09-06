// Contract year as a FACT from last season — set directly on a pool row,
// separate from this season's keep decision. Pure, no React.
//
// A migrated contracts league arrives with every roster imported and every
// player reading "No contract · Y1/3", when many are actually mid-contract.
// The only way to record that used to be clicking Keep, which DECLARES the
// player for this season — the wrong action: the contract year is last
// season's fact, and whether he's kept this year is a decision the GM hasn't
// made yet. This writes the fact where the pool already reads it from: the
// player's prior-keeper record.
//
// Storage convention (same as the draft import's "Enters Y_/len" select):
// `priorKeepers[].contractYear` is the years SERVED entering this season, so
// a player entering Y2/3 is stored as { contractYear: 1, contractLength: 3 }
// and buildTeamPool advances him to nextYear 2. This module takes the
// ENTERING year (what the row displays) and stores year − 1.
//
// Where the record lives: the price follows the player, so an existing prior
// record on ANY team is patched in place (drafted by A, rostered by B — the
// record stays on A and B's pool still reads it); a player with no record
// gets one on the roster team. A declared keeper on the team is patched too,
// so the slot and the pool row can't disagree.

import { normalizeName } from './players.js';
import { changeEntry } from './changeLog.js';
import { hasTerm, termOf } from './keeperRules.js';

// The entering-year options a row can be set to: Y1..Ylen. EXPIRED is the
// one state past that — the contract ran out last season and the player is
// back in the draft. It's the same state the Expired tab shows, exposed on
// the row so a migrated league can mark it directly.
export const EXPIRED = 'expired';

export function contractYearOptions(length) {
  return Array.from({ length: Math.max(1, length || 1) }, (_, i) => i + 1);
}

export const CONTRACT_LENGTH_OPTIONS = [1, 2, 3, 4, 5];

// → { league, changes }  — `changes` are change-log entries (kind 'term')
// for what actually moved; empty when nothing did. `year` is an entering
// year (1..length) or EXPIRED.
export function setContractYear(league, teamId, playerName, { year, length }) {
  const teams = league?.teams || [];
  const key = normalizeName(playerName);
  const team = teams.find(tm => tm.id === teamId);
  if (!team || !key) return { league, changes: [] };
  const len = Math.max(1, Math.floor(length || 1));
  const expire = year === EXPIRED;
  // Expired is stored as every year served PLUS the explicit flag buildTeamPool
  // already reads — either alone would do; both means the record reads the
  // same under either check.
  const entering = expire ? len + 1 : Math.min(Math.max(1, Math.floor(year || 1)), len);
  const served = entering - 1;
  const logged = expire ? EXPIRED : entering;

  const changes = [];
  const logTerm = (from, to, field) => {
    if (from === to) return;
    changes.push(changeEntry({ kind: 'term', field, teamId, teamName: team.name, player: playerName, from, to }));
  };

  // Patch the existing prior record wherever it lives.
  let patched = false;
  let nextTeams = teams.map(tm => {
    const priors = tm.priorKeepers || [];
    const idx = priors.findIndex(p => normalizeName(p.player) === key);
    if (idx < 0) return tm;
    patched = true;
    const prior = priors[idx];
    const wasExpired = !!prior.expired || (prior.contractYear || 0) + 1 > (prior.contractLength || len);
    // Log in the row's vocabulary: the entering year, not the stored count.
    logTerm(wasExpired ? EXPIRED : (prior.contractYear || 0) + 1, logged, 'contractYear');
    logTerm(prior.contractLength ?? null, len, 'contractLength');
    const next = { ...prior, contractYear: served, contractLength: len };
    // A record flagged expired that's explicitly given a live year is live.
    if (expire) next.expired = true;
    else if (next.expired) delete next.expired;
    return { ...tm, priorKeepers: priors.map((p, i) => (i === idx ? next : p)) };
  });

  if (!patched) {
    // Entering Y1 at the league's default length IS the no-contract state —
    // it's exactly what a rostered player with no record already reads as —
    // so writing a record for it would only make him indistinguishable from a
    // real prior contract. A true no-op. (Y1 at a NON-default length is a
    // fact worth a record: the length has to live somewhere.)
    const defaultLen = termOf(league).years || league?.contractYears || 3;
    if (!expire && entering === 1 && len === defaultLen) return { league, changes: [] };
    // No record anywhere: the roster team gets one. Position comes from the
    // roster row so the pool entry keeps rendering its chip.
    const rosterRow = (team.roster || []).find(r => normalizeName(r.player) === key);
    const record = { player: rosterRow?.player || playerName, contractYear: served, contractLength: len };
    if (expire) record.expired = true;
    if (rosterRow?.pos) record.pos = rosterRow.pos;
    logTerm(1, logged, 'contractYear');
    logTerm(null, len, 'contractLength');
    nextTeams = nextTeams.map(tm => (tm.id === teamId ? { ...tm, priorKeepers: [...(tm.priorKeepers || []), record] } : tm));
  }

  // A keeper already declared on this team reads the same fact. (Expiring a
  // declared keeper leaves the keeper record alone — removing a declaration
  // is the slot's × button, a separate, visible act.)
  nextTeams = nextTeams.map(tm => {
    if (tm.id !== teamId || expire) return tm;
    const keepers = tm.keepers || [];
    if (!keepers.some(k => normalizeName(k.player) === key)) return tm;
    return { ...tm, keepers: keepers.map(k => (normalizeName(k.player) === key ? { ...k, contractYear: entering, contractLength: len } : k)) };
  });

  return { league: { ...league, teams: nextTeams }, changes };
}

// Unkeep. A keeper in Y1 is under contract ONLY because of this season's
// keep — removing the declaration removes the contract state with it, so he
// goes back to "Rostered · no contract" instead of lingering as an "On a
// contract · Y1/3" row indistinguishable from a real prior deal. A keeper in
// Y2+ is a contract that predates the decision, and stays.
//
// What "clears" is the player's prior record, wherever it lives — but only a
// record that reads as entering Y1 and carries nothing else. A record with a
// drafted price or draft round on it came from an import: that's last
// season's fact, not this season's keep, and it stays untouched (the pool
// will still show him at Y1 of a deal, which is what an imported draft
// record means in a termed league).
//
// → { league, changes }
export function clearContractOnUnkeep(league, teamId, keeper) {
  if (!league || !keeper || !hasTerm(league)) return { league, changes: [] };
  if ((keeper.contractYear || 1) > 1) return { league, changes: [] };
  const key = normalizeName(keeper.player);
  const team = (league.teams || []).find(tm => tm.id === teamId);
  if (!key || !team) return { league, changes: [] };
  let cleared = null;
  const teams = league.teams.map(tm => {
    const priors = tm.priorKeepers || [];
    const idx = priors.findIndex(p => normalizeName(p.player) === key);
    if (idx < 0) return tm;
    const p = priors[idx];
    const imported = p.keptFor != null || p.acquisitionRound != null;
    const enteringY1 = !p.expired && (p.contractYear || 0) === 0;
    if (imported || !enteringY1) return tm;
    cleared = p;
    return { ...tm, priorKeepers: priors.filter((_, i) => i !== idx) };
  });
  if (!cleared) return { league, changes: [] };
  return {
    league: { ...league, teams },
    changes: [changeEntry({ kind: 'term', field: 'contractYear', teamId, teamName: team.name, player: keeper.player, from: 1, to: null })],
  };
}
