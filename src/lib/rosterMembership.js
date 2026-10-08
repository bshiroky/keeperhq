// Who is on a team is decided by that team's ROSTER. The draft import only says
// what a player cost. Everything here exists to make that one rule checkable:
// is a team's roster actually on file (so its absence of a player means
// something), and what did the commissioner remove by hand (so a re-import can
// say it is about to bring them back).
//
// Pure, no UI — teamPool, the status index and the roster editor all read it,
// so none of them can disagree about when a draft record still counts.

import { normalizeName } from './players.js';
import { appendChanges, changeEntry } from './changeLog.js';

// A roster is "on file" once an import or a hand edit has touched it. Presence
// of players is enough on its own (every roster that predates this field);
// an EMPTY roster only counts when something stamped it, because a bare
// `roster: []` carries no information — it is what a team looks like before
// anything was pasted. A roster the commissioner emptied by hand IS stamped,
// which is how "removed everyone" differs from "not imported yet".
export function hasRosterOnFile(team) {
  if (!Array.isArray(team?.roster)) return false;
  return team.roster.length > 0 || !!team.rosterLoadedAt;
}

export function rosterIndex(league) {
  const owners = new Map();   // normalized name → team id (first roster wins)
  const onFile = new Set();   // team ids whose roster is on file
  for (const tm of league?.teams || []) {
    if (hasRosterOnFile(tm)) onFile.add(tm.id);
    for (const r of tm.roster || []) {
      const k = normalizeName(r.player);
      if (k && !owners.has(k)) owners.set(k, tm.id);
    }
  }
  return { owners, onFile };
}

// Does `team`'s draft record for `key` still put the player in play for it?
//   rostered by this team          → yes (the roster spine already has him)
//   rostered by another team       → no: his price is read from this record,
//                                    but he belongs to the other team
//   on NO roster                   → only while this team's roster hasn't been
//                                    imported. Once it has, the roster is the
//                                    truth about this team and the draft record
//                                    is just a price with no player attached.
export function draftRecordStands(index, team, key) {
  const owner = index.owners.get(key);
  if (owner) return owner === team?.id;
  return !index.onFile.has(team?.id);
}

// ── Hand removals ──
// `team.rosterRemovals: [{player, at}]`. A log of what was taken off by hand,
// kept only so a re-import can warn that the paste brings them back. It never
// changes membership — the roster itself does that.
export const recordedRemovals = (team) => (team?.rosterRemovals || []).map(r => r.player);

const mapTeam = (league, teamId, fn) => ({
  ...league, teams: (league.teams || []).map(tm => (tm.id === teamId ? fn(tm) : tm)),
});

// A roster import replaces the roster wholesale; the paste supersedes any
// earlier hand removal, so the record is cleared with it.
export function withRosterImport(league, teamId, roster, at = new Date().toISOString()) {
  return mapTeam(league, teamId, tm => {
    const { rosterRemovals, ...rest } = tm;
    return { ...rest, roster, rosterLoadedAt: at };
  });
}

// A hand edit: `next` computes the new roster from the old one. `removed` /
// `added` name the player so the removal record stays in step — removing
// appends, re-adding the same player clears it. The change-log entry is written
// HERE, on the same update, so no editor can change a roster without leaving a
// record of it. Only a real membership change is logged (removing someone who
// isn't on the roster, or adding someone already on it, is a no-op).
//
// Nothing here touches priorKeepers: a removed player's drafted price stays on
// file, so re-adding him brings the price back with no re-import.
export function withRosterEdit(league, teamId, next, { removed, added, at = new Date().toISOString() } = {}) {
  const team = (league.teams || []).find(tm => tm.id === teamId);
  const had = (name) => (team?.roster || []).some(r => normalizeName(r.player) === normalizeName(name));
  const entries = [];
  if (removed && had(removed)) entries.push(changeEntry({ kind: 'rosterRemove', teamId, teamName: team?.name, player: removed, at }));
  if (added && !had(added)) entries.push(changeEntry({ kind: 'rosterAdd', teamId, teamName: team?.name, player: added, at }));
  const edited = mapTeam(league, teamId, tm => {
    let removals = (tm.rosterRemovals || []).slice();
    if (added) removals = removals.filter(r => normalizeName(r.player) !== normalizeName(added));
    if (removed && !removals.some(r => normalizeName(r.player) === normalizeName(removed))) removals.push({ player: removed, at });
    const out = { ...tm, roster: next(tm.roster || []), rosterLoadedAt: tm.rosterLoadedAt || at };
    if (removals.length) out.rosterRemovals = removals; else delete out.rosterRemovals;
    return out;
  });
  return appendChanges(edited, entries);
}

// Standing state for the Settings roll-up: who is off a roster by hand RIGHT
// NOW, per team — the question the log can't answer once a player has been
// re-added or a roster re-imported.
export function handRemovalsByTeam(league) {
  return (league?.teams || [])
    .map(tm => ({ teamId: tm.id, teamName: tm.name, players: recordedRemovals(tm) }))
    .filter(t => t.players.length > 0);
}
