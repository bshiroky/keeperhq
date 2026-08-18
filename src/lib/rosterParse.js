// Yahoo roster-paste parser — pure JS (extracted from RosterImportTab so it's
// unit-testable without JSX; fixtures in scripts/test-roster-parser.mjs).
//
// Walks lines looking for a lineup-slot code, then takes the next non-empty
// line as the player name. The slot label anchors the parse and is then
// DISCARDED — Yahoo's leftmost column is a lineup slot (BN, IR+, Util…), not
// a position; positions come from the directory match downstream.

export const ROSTER_POSITIONS = new Set([
  // Hockey
  'C', 'LW', 'RW', 'D', 'G', 'Util',
  // Basketball
  'PG', 'SG', 'SF', 'PF', 'F',
  // Football
  'QB', 'WR', 'RB', 'TE', 'W/R/T', 'W/T', 'Q/W/R/T', 'K', 'DEF', 'D/ST',
  // Baseball
  '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP', 'P',
  // Bench / IR (common across sports)
  'BN', 'IR', 'IR+', 'IL', 'IL+', 'NA',
]);

// Vacant-slot furniture Yahoo renders where a player name would be:
// "(Empty)" on some pages, "--empty--" on others (real basketball case — it
// imported as a player literally named "--empty--"). Anything that is only
// dashes/space around "empty", or only punctuation, is never a player.
const PLACEHOLDER_ROW = /^[-–—\s]*\(?\s*empty\s*\)?[-–—\s]*$/i;
const PUNCTUATION_ONLY = /^[-–—.·\s]*$/;

export function isRosterPlaceholder(line) {
  return PLACEHOLDER_ROW.test(line) || PUNCTUATION_ONLY.test(line);
}

// Strip trailing junk Yahoo appends to player-name cells when you select the page text:
//   "No new player Notes", "NA No new player Notes", "New Player Note", "Player Note",
//   plus 1-2 char status flags (O, Q, IR, GTD, NA, K) and leftover whitespace.
export function cleanPlayerName(raw) {
  if (!raw) return '';
  let s = raw;
  // Strip the long note-action phrases first (any case)
  s = s.replace(/(?:no\s+new\s+player\s+notes?|new\s+player\s+note|player\s+note)\s*$/i, '');
  // Strip trailing status flags after the name (NA, O, Q, IR, GTD, DTD, K).
  // The flag must be whitespace-separated — with `\s*` this used to chop the
  // last letter off any name ending in a flag character (Hellebuyck → K,
  // Tkachuk → K, Marchenko → O), which then never matched the directory.
  s = s.replace(/\s+(NA|GTD|DTD|IR|IL|K|O|Q|P)\s*$/i, (m, flag, off) => off >= 4 ? '' : m);
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Yahoo's team-position line under a name ("SJ - C", "Buf - QB", "CLE - PF,C").
// Read as a HINT only — it disambiguates a name that matches more than one
// directory player (common last names, juniors). It is never stored as the
// player's position: the leftmost column is a lineup slot, and positions come
// from the directory match downstream.
const TEAM_POS_LINE = /^([A-Za-z]{2,4})\s*[-–—]\s*([A-Za-z0-9,/\s]{1,20})$/;

function hintFrom(line) {
  const m = TEAM_POS_LINE.exec((line || '').trim());
  if (!m) return null;
  return { proTeam: m[1].trim(), positions: m[2].trim() };
}

// Parser: position code line → next non-empty line is the player name.
// Validates by checking the following line contains a " - " (Yahoo's
// team-position string, e.g. "SJ - C"). Skips vacant-slot placeholders and
// the various header / summary rows.
export function parseYahooRosterText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const out = [];
  const headerWords = /^(totals|action|opp|pos|rank|fantasy|offense|goaltend|forwards|defensemen|pre-season|starting lineup|legends|the fine print|note:|projections|goaltender appearances)/i;

  function nonEmptyAfter(i) {
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j]) return { idx: j, value: lines[j] };
    }
    return null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (!ROSTER_POSITIONS.has(line)) continue;
    // Found a position line. Next non-empty line should be the player name (with junk).
    const next = nonEmptyAfter(i);
    if (!next) continue;
    if (isRosterPlaceholder(next.value)) { i = next.idx; continue; }
    if (headerWords.test(next.value)) continue;
    // The line after that should be a team-position string like "SJ - C" — use as soft validation.
    const after = nonEmptyAfter(next.idx);
    const looksValid = after && / - /.test(after.value);
    const player = cleanPlayerName(next.value);
    if (!player || player.length < 2) continue;
    // A cleaned "name" that is still placeholder-shaped is furniture, not a player.
    if (isRosterPlaceholder(player)) continue;
    // If two consecutive lines both equal a position code (rare table-header case), skip.
    if (ROSTER_POSITIONS.has(player)) continue;
    // The slot label (`line`) is deliberately dropped — it anchors the parse
    // but is a lineup slot, not a position.
    // Yahoo prints the name twice, so the "TEAM - POS" line usually sits two
    // lines below it. Scan a short lookahead for it and stop at the next slot
    // label, so a hint can never be read off the following player's block.
    let hint = null;
    for (let k = next.idx + 1, seen = 0; k < lines.length && seen < 3; k++) {
      if (!lines[k]) continue;
      seen++;
      if (ROSTER_POSITIONS.has(lines[k])) break;
      hint = hintFrom(lines[k]);
      if (hint) break;
    }
    out.push({ player, ...(hint ? { hint } : {}), _ok: !!looksValid });
    i = next.idx; // advance past the name line
  }

  // Dedupe by player name (keep first)
  const seen = new Set();
  return out.filter(p => {
    const k = p.player.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(({ _ok, ...rest }) => rest);
}
