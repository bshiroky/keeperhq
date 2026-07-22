// Yahoo-team-name ↔ league-team mapping — pure helpers, no React.
//
// Uploads carry Yahoo TEAM names ("Duck Duck Goose"); the app keys teams by
// GM/owner name ("Mark"); Yahoo names change mid-season. The mapping lives in
// the league blob as league.yahooTeamMap: { "<yahoo name>": teamId }, and is
// ACCUMULATED — old names stay mapped forever, so a re-import after a Yahoo
// rename still resolves via the previously-confirmed name. Raw names are the
// keys; lookup normalizes both sides (case / punctuation / spacing noise).

const normTeam = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/g, '');

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
