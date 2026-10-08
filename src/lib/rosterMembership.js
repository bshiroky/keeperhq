// Who is on a team is decided by that team's ROSTER. The draft import only says
// what a player cost. Everything here exists to make that one rule checkable:
// is a team's roster actually on file (so its absence of a player means
// something), and what did the commissioner remove by hand (so a re-import can
// say it is about to bring them back).
//
// Pure, no UI — teamPool, the status index and the roster editor all read it,
// so none of them can disagree about when a draft record still counts.

import { normalizeName } from './players.js';

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

// Draft records that are attached to no roster on a team whose roster IS on
// file: invisible in every pool by design. Listed so a surface (or a human)
// can check them — the usual cause is a spelling that differs between the two
// pastes ("Jaime Jaquez Jr." vs "Jaime Jaquez"), which no pool can fix.
export function draftOnlyRecords(league) {
  const index = rosterIndex(league);
  const out = [];
  for (const tm of league?.teams || []) {
    for (const p of tm.priorKeepers || []) {
      const k = normalizeName(p.player);
      if (!k || p.expired) continue;
      if (!index.owners.has(k) && index.onFile.has(tm.id)) out.push({ teamId: tm.id, teamName: tm.name, player: p.player });
    }
  }
  return out;
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
// appends, re-adding the same player clears it.
export function withRosterEdit(league, teamId, next, { removed, added, at = new Date().toISOString() } = {}) {
  return mapTeam(league, teamId, tm => {
    let removals = (tm.rosterRemovals || []).slice();
    if (added) removals = removals.filter(r => normalizeName(r.player) !== normalizeName(added));
    if (removed && !removals.some(r => normalizeName(r.player) === normalizeName(removed))) removals.push({ player: removed, at });
    const out = { ...tm, roster: next(tm.roster || []), rosterLoadedAt: tm.rosterLoadedAt || at };
    if (removals.length) out.rosterRemovals = removals; else delete out.rosterRemovals;
    return out;
  });
}
