// Keeper declarations as pure league → league edits. Pure, no React.
//
// Every surface that keeps or unkeeps a player goes through here, so the
// commissioner's team tab and (later) a GM's own team tab can't drift apart
// in what a keep writes. Each function returns the next league with its
// change-log entries already appended, or the SAME league object when nothing
// changed (callers can skip the save on identity).

import { normalizeName } from './players.js';
import { acquisitionOf } from './acquisition.js';
import { termOf, isAuctionCost, TERM_FIXED } from './keeperRules.js';
import { clearContractOnUnkeep } from './contractYear.js';
import { setPrice, resetPrice, priceOf, isPriceOverridden } from './priceProvenance.js';
import { appendChanges, changeEntry } from './changeLog.js';

// Build a keeper record from a pool/directory entry. Cost and term are
// independent, so the record carries whichever fields the league's rules call
// for and can carry both: an auction league with a term stamps keptFor AND
// contractYear. A slot/pick cost with no term needs neither.
export function makeKeeper(entry, league) {
  // Acquisition metadata rides along from the pool entry (which carried it
  // from the prior-keeper / roster record); absent fields normalize to the
  // defaults (round null, method 'manual', rookie false).
  const keeper = { player: entry.player, ...acquisitionOf(entry) };
  if (isAuctionCost(league)) {
    keeper.keptFor = entry.nextCost != null ? entry.nextCost : (league.auctionRules?.undraftedStartCost || 5);
    keeper.yearsKept = entry.yearsKept || 1;
  }
  const term = termOf(league);
  if (term.model === TERM_FIXED) {
    keeper.contractYear = entry.nextYear || 1;
    keeper.contractLength = entry.length || term.years || 3;
    // Anchor the contract to the season its Y1 was, so this record survives a
    // miscounted rollover. A continuing contract carries the prior record's
    // anchor, a fresh Y1 carries the current season.
    const startSeason = entry.startSeason || league?.season || null;
    if (startSeason) keeper.startSeason = startSeason;
  }
  return keeper;
}

const teamOf = (league, teamId) => (league?.teams || []).find(tm => tm.id === teamId) || null;
const withTeam = (league, teamId, patch) => ({
  ...league,
  teams: (league.teams || []).map(tm => (tm.id === teamId ? { ...tm, ...patch } : tm)),
});

// Why a Keep isn't allowed right now, or null when it is. The UI shows the
// reason on the disabled control rather than hiding it.
export function keepBlockedReason(league, teamId, playerName) {
  const team = teamOf(league, teamId);
  if (!team) return 'No such team';
  const key = normalizeName(playerName);
  const keepers = team.keepers || [];
  if (keepers.some(k => normalizeName(k.player) === key)) return null; // already kept: unkeep is allowed
  for (const tm of league.teams || []) {
    if (tm.id !== teamId && (tm.keepers || []).some(k => normalizeName(k.player) === key)) {
      return `Kept by ${tm.name}`;
    }
  }
  const slots = league.keeperSlots || 0;
  if (keepers.length >= slots) return `All ${slots} keeper slots are used`;
  return null;
}

export function isKeptBy(league, teamId, playerName) {
  const key = normalizeName(playerName);
  return (teamOf(league, teamId)?.keepers || []).some(k => normalizeName(k.player) === key);
}

// Declare a keeper. `entry` is a pool entry (it carries the next contract year
// and keep cost) or just `{ player, pos }` for a player off the roster.
export function keepPlayer(league, teamId, entry) {
  const team = teamOf(league, teamId);
  if (!team || !entry?.player) return league;
  if (keepBlockedReason(league, teamId, entry.player)) return league;
  if (isKeptBy(league, teamId, entry.player)) return league;
  const keeper = makeKeeper(entry, league);
  return appendChanges(withTeam(league, teamId, { keepers: [...(team.keepers || []), keeper] }), [
    changeEntry({ kind: 'keep', teamId, teamName: team.name, player: entry.player, to: 'kept' }),
  ]);
}

// Undo a declaration. A Y1 keeper's contract exists only because of this
// keep, so it goes with it (lib/contractYear decides exactly what that
// means); Y2+ predates the decision and stays.
export function unkeepPlayer(league, teamId, playerName) {
  const team = teamOf(league, teamId);
  const key = normalizeName(playerName);
  const keeper = (team?.keepers || []).find(k => normalizeName(k.player) === key);
  if (!keeper) return league;
  const { league: cleared, changes } = clearContractOnUnkeep(league, teamId, keeper);
  const clearedTeam = teamOf(cleared, teamId) || team;
  const next = withTeam(cleared, teamId, { keepers: (clearedTeam.keepers || []).filter(k => normalizeName(k.player) !== key) });
  return appendChanges(next, [
    ...changes,
    changeEntry({ kind: 'keep', teamId, teamName: team.name, player: keeper.player, from: 'kept', to: 'unkept' }),
  ]);
}

function patchKeeper(league, teamId, playerName, makePatch) {
  const team = teamOf(league, teamId);
  const key = normalizeName(playerName);
  const idx = (team?.keepers || []).findIndex(k => normalizeName(k.player) === key);
  if (idx < 0) return league;
  const k = team.keepers[idx];
  const res = makePatch(k);
  if (!res) return league;
  const keepers = team.keepers.map((x, i) => (i === idx ? { ...x, ...res.patch } : x));
  return appendChanges(withTeam(league, teamId, { keepers }), [
    changeEntry({ ...res.log, teamId, teamName: team.name, player: k.player }),
  ]);
}

// Hand-set keep cost — through priceProvenance so the calculated value is
// kept underneath and the "Edited" marker stays true.
export function setKeeperPrice(league, teamId, playerName, next) {
  return patchKeeper(league, teamId, playerName, k => {
    if (!Number.isFinite(next) || priceOf(k) === next) return null;
    const patch = setPrice(k, next);
    return { patch, log: { kind: patch.keptForOverridden ? 'price' : 'priceReset', field: 'keptFor', from: priceOf(k), to: patch.keptFor } };
  });
}

export function resetKeeperPrice(league, teamId, playerName) {
  return patchKeeper(league, teamId, playerName, k => {
    if (!isPriceOverridden(k)) return null;
    const patch = resetPrice(k);
    return { patch, log: { kind: 'priceReset', field: 'keptFor', from: priceOf(k), to: patch.keptFor } };
  });
}
