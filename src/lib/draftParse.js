// Draft-results paste parser — supports BOTH Yahoo Draft Results views, any
// sport (tested against hockey / basketball / football shapes):
//
//   TEAM view — team-by-team blocks: the fantasy team's name on its own line,
//   then that team's picks below it. The leading "N." on a row is the ROUND.
//     Anthony!!!
//     Budget $200
//     1.  (22)  Cooper Flagg (DAL - PG,SG,SF)  $30
//     Unused $60
//
//   PICKS view — one flat table, every selection on one line, the fantasy
//   team at the END of the row. The leading "N." is the OVERALL pick, so
//   round = ceil(pick / team count) (snake semantics; harmless bookkeeping
//   on auction). A header row ("Pick  Player  Salary  Team") may lead it.
//     1. Victor Wembanyama (SAS - PF,C) $83 "Why are you"...
//
// The view is detected from the rows themselves (trailing team text), never
// asked. The $salary is the reliable split anchor between player block and
// team name — team names can contain quotes, ellipses, emoji, digits, spaces.
// Players are NEVER dropped for failing a directory match — matching is a
// display concern downstream; a valid paste yielding 0 players means this
// parser is wrong, and the import flow surfaces that as an error instead of
// showing a header row as a mappable "team".
//
// Row tolerance (the hockey-era regex was stricter and dropped real
// basketball rows): pro-team abbreviations may be mixed case (2–4 letters),
// position lists carry commas/slashes (PF,C · W/R/T), the dash can be
// en/em, and trailing row junk (keeper marks, notes) doesn't kill the match.
//
// Output shape (unchanged from the original parser, so DraftImportFlow and
// the dormant wizard path consume it as-is):
//   [{ name, players: [{ player, round, draftedFor, isKeeper, proTeam, positions }] }]

// "N." or "N)" · optional "(overall)" · name · "(TEAM - POS[,POS…])" · tail
const ROW_REGEX = /^(\d+)[.)]\s*(?:\((\d+)\)\s*)?(.+?)\s*\(([A-Za-z]{2,4})\s*[-–—]\s*([^)]+)\)\s*(.*)$/;

// A line made ONLY of table-header vocabulary is a header, never a team name
// ("Pick Player Salary Team" once parsed as a mappable team).
const HEADER_VOCAB = new Set([
  'pick', 'picks', 'player', 'players', 'salary', 'team', 'teams', 'round',
  'rd', 'pos', 'position', 'positions', 'cost', 'keeper', 'keepers', 'status',
  'note', 'notes', 'draft', 'results', 'order', 'overall', 'fantasy', 'no',
]);

export function isDraftHeaderLine(line) {
  const words = (line || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.every(w => HEADER_VOCAB.has(w));
}

// Split a row's tail into salary / keeper marker / trailing team name.
// "$83 \"Why are you\"..." → { salary: 83, teamName: '"Why are you"...' }
// "$30"                    → { salary: 30, teamName: null }   (TEAM view, auction)
// "Puck Dynasty"           → { salary: null, teamName: 'Puck Dynasty' } (PICKS view, snake)
// ""                       → { salary: null, teamName: null } (TEAM view, snake)
function parseTail(tail) {
  let rest = (tail || '').trim();
  let salary = null;
  let keeper = false;

  const m = rest.match(/\$\s*([\d,]+)/);
  if (m) {
    salary = parseInt(m[1].replace(/,/g, ''), 10);
    // The team name is whatever FOLLOWS the salary — text before it is row
    // noise, never the team (Yahoo's picks table ends "…$salary team").
    rest = rest.slice(m.index + m[0].length).trim();
  } else if (/^[\d,]+$/.test(rest)) {
    // Bare trailing cost with the $ lost in the copy.
    salary = parseInt(rest.replace(/,/g, ''), 10);
    rest = '';
  }
  rest = rest.replace(/\(K\)/gi, () => { keeper = true; return ' '; }).replace(/\s+/g, ' ').trim();
  return { salary, teamName: rest || null, keeper };
}

export function parseDraftResults(text) {
  // One ordered token stream: player rows and potential team-name lines.
  // Order matters for TEAM view (a name line owns the rows after it).
  const tokens = [];
  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (/^budget\b/i.test(line) || /^unused\b/i.test(line)) continue;
    if (isDraftHeaderLine(line)) continue;

    const m = line.match(ROW_REGEX);
    if (m) {
      const tail = parseTail(m[6]);
      tokens.push({
        type: 'row',
        leadNo: parseInt(m[1], 10),          // TEAM view: round · PICKS view: overall pick
        player: m[3].replace(/\s+/g, ' ').trim(),
        proTeam: m[4].toUpperCase(),
        positions: m[5].split(/[,/]/).map(s => s.trim()).filter(Boolean).join(','),
        draftedFor: tail.salary,
        teamName: tail.teamName,
        // Legacy multi-space keeper marker rides on the RAW line (pre-collapse).
        isKeeper: tail.keeper || / {2,}\(|\(K\)/.test(rawLine),
      });
      continue;
    }
    // Candidate team-name line (TEAM view): short, not a number/cost line.
    if (!/^\d/.test(line) && !/^\$/.test(line) && line.length < 80) {
      tokens.push({ type: 'name', name: line });
    }
  }

  const rows = tokens.filter(t => t.type === 'row');
  const rowsWithTeam = rows.filter(r => r.teamName);

  // PICKS view: most rows carry their fantasy team at the end. Threshold at
  // half so a stray note on one TEAM-view row can't flip the whole parse.
  const picksMode = rowsWithTeam.length >= 2 && rowsWithTeam.length * 2 >= rows.length;

  const teams = [];
  const byKey = new Map();
  const teamFor = (name) => {
    const key = name.toLowerCase();
    let t = byKey.get(key);
    if (!t) {
      t = { name, players: [] };
      byKey.set(key, t);
      teams.push(t);
    }
    return t;
  };

  if (picksMode) {
    const entries = [];
    for (const r of rowsWithTeam) {
      const p = {
        player: r.player, round: null, draftedFor: r.draftedFor,
        isKeeper: r.isKeeper, proTeam: r.proTeam, positions: r.positions,
      };
      teamFor(r.teamName).players.push(p);
      entries.push([r, p]);
    }
    // Overall pick → round only once the distinct team count is known.
    const teamCount = teams.length || 1;
    for (const [r, p] of entries) {
      if (Number.isFinite(r.leadNo)) p.round = Math.ceil(r.leadNo / teamCount);
    }
    return teams;
  }

  // TEAM view: walk the stream; a name line starts a block, rows join it.
  let current = null;
  for (const t of tokens) {
    if (t.type === 'name') {
      current = teamFor(t.name);
      continue;
    }
    if (!current) continue; // row before any team header — skip
    current.players.push({
      player: t.player, round: Number.isFinite(t.leadNo) ? t.leadNo : null,
      draftedFor: t.draftedFor, isKeeper: t.isKeeper,
      proTeam: t.proTeam, positions: t.positions,
    });
  }
  // A "team" that never collected a player is paste noise (stray text line),
  // not a mappable team — showing it would repeat the header-row bug.
  return teams.filter(t => t.players.length > 0);
}
