// Yahoo Standings paste parser — pure JS, no React.
//
// Reads the League → Standings page copied whole. The real shape (hockey,
// head-to-head categories):
//
//   Rank  Team                  W-L-T       Pct   Pts  Last Week  Waiver  Moves
//   *1    logo Da Real Dynasty  144-123-27  .536  315  -          5       67
//   9     logo Treliving it Up  128-138-28  .483  284  -          8       72
//
// The literal word "logo" is the alt text of the team avatar and precedes
// every team name — stripped. A leading "*" on the rank marks a clinched
// playoff spot — captured as a flag, never part of the rank. Cells are
// tab-separated when copied from a browser; a whitespace-only copy and the
// one-cell-per-line copy are both accepted too, because the commissioner
// pastes whatever their browser gave them.
//
// Every row is returned whether or not its team resolves — resolution is the
// caller's job (teamMap.js), the parser never sees the league. Numbers are
// parsed leniently: a column that isn't there is null, never 0, so a missing
// value can't masquerade as a real one when the draft order sorts on it.
//
// Yahoo's Rank column reflects PLAYOFF results once the season is over; Pts is
// the regular-season standing. Both are captured; which one the draft order
// sorts on is a league setting (draftOrder.js), not the parser's call.

const LOGO_PREFIX = /^(?:logo|team logo)\s+/i;
const RANK_RE = /^\s*(\*)?\s*(\d+)\s*(\*)?\s*$/;
const RECORD_RE = /^(\d+)-(\d+)-(\d+)$/;
const PCT_RE = /^(?:\d+)?\.\d+$|^1\.000$|^0$|^1$/;

function isHeaderLine(line) {
  const l = line.trim().toLowerCase();
  return l.startsWith('rank') && l.includes('team');
}

function num(s) {
  if (s == null) return null;
  const clean = String(s).trim().replace(/,/g, '');
  if (clean === '' || clean === '-' || clean === '—') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function cleanTeamName(raw) {
  return (raw || '').trim().replace(LOGO_PREFIX, '').trim();
}

// Column indices from a tab-separated header row. Only the columns the draft
// order can use are located; everything else (Last Week, Waiver, Moves) is
// ignored by name so a league whose page shows extra columns still parses.
function columnsFromHeader(cells) {
  const lower = cells.map(c => c.trim().toLowerCase());
  const find = (...names) => {
    for (const n of names) {
      const i = lower.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    rank: find('rank'),
    team: find('team'),
    record: find('w-l-t', 'w-l', 'record'),
    pct: find('pct', 'win %', 'win%'),
    // A points league shows "Pts For"; a categories league shows "Pts".
    pts: find('pts', 'points', 'pts for', 'pf', 'fantasy points'),
  };
}

function rowFromCells(cells, cols) {
  const cell = (i) => (i >= 0 && i < cells.length ? cells[i] : '');
  const rankCell = cell(cols.rank);
  const rm = RANK_RE.exec(rankCell);
  if (!rm) return null;
  const team = cleanTeamName(cell(cols.team));
  if (!team) return null;
  const row = {
    rank: Number(rm[2]),
    clinched: !!(rm[1] || rm[3]),
    team,
    wins: null, losses: null, ties: null, pct: null, pts: null,
  };
  const rec = RECORD_RE.exec(cell(cols.record).trim());
  if (rec) { row.wins = Number(rec[1]); row.losses = Number(rec[2]); row.ties = Number(rec[3]); }
  row.pct = num(cell(cols.pct));
  row.pts = num(cell(cols.pts));
  return row;
}

// Header-less fallback: locate the columns by what they look like — the
// first W-L-T token, the first ".536"-shaped token after it, then the next
// number. Team name is everything between the rank and the record.
function rowFromTokens(line) {
  const m = /^\s*(\*?\d+\*?)\s+(.*)$/.exec(line);
  if (!m) return null;
  const rm = RANK_RE.exec(m[1]);
  if (!rm) return null;
  const rest = m[2].split(/\t|\s{2,}|\s/).filter(Boolean);
  // Find the record token; the team name is everything before it.
  let recIdx = rest.findIndex(tok => RECORD_RE.test(tok));
  let team, tail;
  if (recIdx >= 0) {
    team = rest.slice(0, recIdx).join(' ');
    tail = rest.slice(recIdx);
  } else {
    // No record column (rotisserie): team name runs until the first numeric.
    const firstNum = rest.findIndex((tok, i) => i > 0 && num(tok) != null && !/[a-z]/i.test(tok));
    team = (firstNum >= 0 ? rest.slice(0, firstNum) : rest).join(' ');
    tail = firstNum >= 0 ? rest.slice(firstNum) : [];
  }
  team = cleanTeamName(team);
  if (!team) return null;
  const row = { rank: Number(rm[2]), clinched: !!(rm[1] || rm[3]), team, wins: null, losses: null, ties: null, pct: null, pts: null };
  let i = 0;
  const rec = tail[i] && RECORD_RE.exec(tail[i]);
  if (rec) { row.wins = Number(rec[1]); row.losses = Number(rec[2]); row.ties = Number(rec[3]); i++; }
  if (tail[i] != null && PCT_RE.test(tail[i].trim())) { row.pct = num(tail[i]); i++; }
  if (tail[i] != null) row.pts = num(tail[i]);
  return row;
}

// The one-cell-per-line copy: a rank on its own line, then each cell on its
// own line until the next rank. Reassembled into tab rows.
function reflowOneCellPerLine(lines) {
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A rank is always followed by a team name; a bare number followed by
    // another bare number (Waiver, Moves) is a trailing cell, not a new row.
    const next = lines[i + 1];
    const startsRow = RANK_RE.test(line) && next != null && !RANK_RE.test(next) && !/^[\d.\-]+$/.test(next.trim());
    if (startsRow) {
      if (cur) out.push(cur.join('\t'));
      cur = [line.trim()];
    } else if (cur) {
      cur.push(line.trim());
    }
  }
  if (cur) out.push(cur.join('\t'));
  return out;
}

export const STANDINGS_PASTE_ERRORS = {
  empty: 'Nothing to read — paste the Standings page from Yahoo (League → Standings), selecting the whole table.',
  noRows: "Couldn't find any standings rows. Each row should start with the rank (\"1\" or \"*1\" for a clinched spot) followed by the team name, W-L-T, Pct and Pts — copy the whole standings table and paste it here.",
};

// → { rows: [{rank, clinched, team, wins, losses, ties, pct, pts}], issues: [{kind, text}], error? }
export function parseStandingsText(text) {
  const raw = (text || '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return { rows: [], issues: [], error: STANDINGS_PASTE_ERRORS.empty };
  let lines = raw.split('\n').map(l => l.replace(/ /g, ' ')).filter(l => l.trim());

  let cols = null;
  const headerIdx = lines.findIndex(isHeaderLine);
  if (headerIdx >= 0) {
    const headerCells = lines[headerIdx].split('\t');
    if (headerCells.length >= 3) cols = columnsFromHeader(headerCells);
    lines = lines.slice(headerIdx + 1);
  }

  // Detect the one-cell-per-line copy: rank-only lines with no tabs anywhere.
  const rankOnly = lines.filter(l => RANK_RE.test(l)).length;
  if (rankOnly >= 2 && !lines.some(l => l.includes('\t'))) {
    lines = reflowOneCellPerLine(lines);
    // A header that was split across lines is gone by now; locate by shape.
    cols = null;
  }

  const rows = [];
  for (const line of lines) {
    let row = null;
    if (cols && cols.rank >= 0 && cols.team >= 0 && line.includes('\t')) {
      row = rowFromCells(line.split('\t'), cols);
    }
    if (!row) row = rowFromTokens(line);
    if (row) rows.push(row);
  }
  if (rows.length === 0) return { rows: [], issues: [], error: STANDINGS_PASTE_ERRORS.noRows };

  const issues = [];
  const seenRank = new Map();
  const seenTeam = new Map();
  for (const r of rows) {
    seenRank.set(r.rank, (seenRank.get(r.rank) || 0) + 1);
    seenTeam.set(r.team, (seenTeam.get(r.team) || 0) + 1);
  }
  for (const [rank, n] of seenRank) if (n > 1) issues.push({ kind: 'dupRank', text: `Rank ${rank} appears ${n} times.` });
  for (const [team, n] of seenTeam) if (n > 1) issues.push({ kind: 'dupTeam', text: `"${team}" appears ${n} times.` });
  const ranks = [...seenRank.keys()].sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) { issues.push({ kind: 'gap', text: `Ranks aren't 1–${rows.length} without gaps (found ${ranks.join(', ')}).` }); break; }
  }
  const noPts = rows.filter(r => r.pts == null);
  if (noPts.length > 0 && noPts.length < rows.length) {
    issues.push({ kind: 'missingPts', text: `${noPts.length} row${noPts.length === 1 ? '' : 's'} had no Pts value (${noPts.map(r => r.team).join(', ')}).` });
  } else if (noPts.length === rows.length) {
    issues.push({ kind: 'noPts', text: 'No Pts column was read — the draft order can only sort on final rank until it is.' });
  }
  return { rows, issues, error: null };
}
