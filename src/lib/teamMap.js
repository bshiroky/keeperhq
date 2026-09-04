// Yahoo-team-name ↔ league-team mapping — pure helpers, no React.
//
// Uploads carry Yahoo TEAM names ("Duck Duck Goose"); the app keys teams by
// GM/owner name ("Mark"); Yahoo names change mid-season. The mapping lives in
// the league blob as league.yahooTeamMap: { "<yahoo name>": teamId }, and is
// ACCUMULATED — old names stay mapped forever, so a re-import after a Yahoo
// rename still resolves via the previously-confirmed name. Raw names are the
// keys; lookup normalizes both sides (case / punctuation / spacing noise).

// Exported because the pick-ownership paste segments concatenated team names
// on this same key — the two must never drift. Keeps any Unicode letter or
// digit (Cyrillic team names are real: "ЦСКА Совки"), drops case, diacritics,
// punctuation, emoji and spacing.
export function normalizeTeamName(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}
const normTeam = normalizeTeamName;

// Saved-mapping lookup. Returns the teamId if a stored name normalizes to the
// same key AND that team still exists; null otherwise. Last-written entry wins
// when raw variants collide.
export function resolveYahooTeam(league, yahooName) {
  const key = normTeam(yahooName);
  if (!key) return null;
  const teams = league.teams || [];
  let found = null;
  for (const [name, teamId] of Object.entries(league.yahooTeamMap || {})) {
    if (normTeam(name) === key && teams.some(tm => tm.id === teamId)) found = teamId;
  }
  return found;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Fuzzy auto-suggestion against the league's (GM) team names, used only when
// the saved mapping has no answer. Exact > containment > edit-distance ratio;
// anything under the threshold returns null and the commissioner picks by hand.
export function suggestTeam(league, yahooName) {
  const key = normTeam(yahooName);
  if (!key) return null;
  let best = null, bestScore = 0;
  for (const tm of league.teams || []) {
    const tn = normTeam(tm.name);
    if (!tn) continue;
    let score;
    if (tn === key) score = 1;
    else if (key.includes(tn) || tn.includes(key)) score = 0.85;
    else score = 1 - levenshtein(key, tn) / Math.max(key.length, tn.length);
    if (score > bestScore) { bestScore = score; best = tm.id; }
  }
  return bestScore >= 0.7 ? best : null;
}

// Persist confirmed mappings (called at import time). Stores every confirmed
// pair — including names that currently equal the team's own name, because the
// commissioner may rename the app team (Yahoo name → GM name) later and the
// stored pair is what keeps the next import resolving.
export function rememberYahooTeams(league, pairs) {
  const teams = league.teams || [];
  const additions = {};
  for (const [name, teamId] of Object.entries(pairs || {})) {
    const clean = (name || '').trim();
    if (!clean || !teamId || !teams.some(tm => tm.id === teamId)) continue;
    additions[clean] = teamId;
  }
  if (Object.keys(additions).length === 0) return league;
  return { ...league, yahooTeamMap: { ...(league.yahooTeamMap || {}), ...additions } };
}

// ── Aliases: the per-GM view of the same map ────────────────────────────────
// Yahoo team names change constantly, so each GM accumulates a LIST of names
// they've used. That list IS yahooTeamMap inverted — no second store, so the
// Settings editor and every paste read the same truth. Order is insertion
// order (the order names were confirmed), which reads as a history.
export function aliasesByTeam(league) {
  const out = {};
  for (const tm of league?.teams || []) out[tm.id] = [];
  for (const [name, teamId] of Object.entries(league?.yahooTeamMap || {})) {
    if (out[teamId]) out[teamId].push(name);
  }
  return out;
}

// Rebuild the map from per-team lists (the Settings editor's write path).
// A name listed under two teams goes to the LAST one — the editor prevents
// that anyway by moving a name when it's added elsewhere. Names that map to a
// team that no longer exists are dropped; everything else is preserved.
export function withTeamAliases(league, byTeam) {
  const teams = league?.teams || [];
  const map = {};
  for (const tm of teams) {
    for (const raw of byTeam?.[tm.id] || []) {
      const name = (raw || '').trim();
      if (name) map[name] = tm.id;
    }
  }
  return { ...league, yahooTeamMap: map };
}

// Resolve a batch of pasted names the way EVERY Yahoo paste must: a saved
// alias resolves silently; otherwise a similarity suggestion is offered for
// confirmation; otherwise the commissioner is asked. The `source` is what
// lets a surface tell "already known" from "prefilled guess" — the guess is
// still a prompt, just one with a default.
//
// → { "<name>": { teamId: string|null, source: 'alias'|'suggested'|'none' } }
export function resolveTeamNames(league, names) {
  const out = {};
  for (const name of names || []) {
    if (name in out) continue;
    const saved = resolveYahooTeam(league, name);
    if (saved) { out[name] = { teamId: saved, source: 'alias' }; continue; }
    const guess = suggestTeam(league, name);
    out[name] = guess ? { teamId: guess, source: 'suggested' } : { teamId: null, source: 'none' };
  }
  return out;
}
