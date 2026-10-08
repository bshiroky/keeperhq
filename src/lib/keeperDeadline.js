// The keeper deadline as an EVENT, not just a countdown.
//
// Until now `keeperDeadline` only drove a clock on the shared page. Nothing in
// the app treated its passing as changing anything, so a player on Y2/3 whom
// nobody kept still read as "under contract" after the deadline — and the
// shared page's "Under contract" tab listed players who, by the league's own
// rule, no longer had one. In a league with fixed terms, not being kept ends
// the contract: the player goes back into the draft.
//
// EVERYTHING HERE IS DERIVED. No record is deleted or mutated when the
// deadline passes, so moving the deadline later restores the prior state
// exactly, with no data loss — the same reason `void` is not a stored status
// in contractSeason.js. The deadline is an input to a read, never a trigger
// for a write.

import { normalizeName } from './players.js';
import { hasTerm } from './keeperRules.js';

// The exact moment keepers lock. Mirrors the shared page's countdown: a
// date-only deadline (older data, before the time control existed) means
// 11:59 PM local on that date. Null when no deadline is set — a league that
// never set one never locks, which is why every caller must handle null
// rather than defaulting to "passed".
export function deadlineMoment(league) {
  const date = league?.keeperDeadline;
  if (!date) return null;
  const time = league.keeperDeadlineTime || '23:59';
  const ms = new Date(`${date}T${time}:59`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// `now` is injectable so this is testable without waiting for a date, and so
// a caller rendering a whole page evaluates one consistent instant.
export function isDeadlinePassed(league, now = Date.now()) {
  const at = deadlineMoment(league);
  return at != null && now >= at;
}

// Every player declared as a keeper anywhere in the league, normalized. A
// contract is voided by NOT being kept, and a player kept by any team has
// been kept — a traded keeper is declared on the team that made the
// declaration, so scanning every team is the only reading that can't strand
// someone mid-trade.
export function declaredKeeperNames(league) {
  const names = new Set();
  for (const team of league?.teams || []) {
    for (const k of team.keepers || []) {
      const key = normalizeName(k.player);
      if (key) names.add(key);
    }
  }
  return names;
}

// Whether contracts can be voided in this league at this moment. Fixed term
// only: where keeping costs dollars and nothing else there is no contract to
// void, and where there is no deadline nothing has happened yet. Hoisted out
// of the per-player check so a caller does it once per league, not once per
// row.
export function voidingActive(league, now = Date.now()) {
  return hasTerm(league) && isDeadlinePassed(league, now);
}

// The per-player question, given the two league-level facts above. Kept as a
// separate tiny function so a loop can hoist `voidingActive` and the set of
// declared names, and so the rule reads as one sentence at its call site.
export function contractVoided(playerName, { active, declared }) {
  if (!active) return false;
  const key = normalizeName(playerName);
  return !!key && !declared.has(key);
}

// One-shot convenience for a single lookup (tests, one-off reads). Builds the
// declared-name set each call, so don't use it inside a loop.
export function isContractVoided(league, playerName, now = Date.now()) {
  return contractVoided(playerName, {
    active: voidingActive(league, now),
    declared: declaredKeeperNames(league),
  });
}
