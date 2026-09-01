// Yahoo draft-picks paste parser — pure JS, no React (unit tests in
// scripts/test-picks-parser.mjs, `npm run test:parser`).
//
// Yahoo's Draft Picks page has three views. Only BY ROUND is complete on its
// own, so that's the one the import reads:
//
//   Round 1
//   Team	Picks Owned
//   My Cozen Finnie              ← the CURRENT owner
//   -                            ← holds no pick this round
//   Stop F***ing Crying Bro
//   Ain't No Hellebuyck GirlStop F***ing Crying Brothe grit grinders
//                                ← the ORIGINAL owners of the picks it holds,
//                                  run together with NO separator
//
// Every value on a held line is one of the league's team names, and the
// owner lines of the same paste list every one of them, so the concatenated
// string is segmented against that vocabulary on the normalised key the GM
// mapping already uses (`normalizeTeamName`) — case, spacing, punctuation,
// emoji all fall away, which is what makes "Brothe" = "Bro" + "the" split.
// A chunk that no team name covers is reported as an issue, never guessed.
//
// The GRID view (team × round, counts only) can't say WHICH picks a team
// holds, so it is never a valid input alone — but pasted alongside By Round
// it is a checksum: every team's per-round count must match. Mismatches are
// reported by round and team; nothing is silently accepted.
//
// The BY TEAM view, and the older hand-guessed "Round 2 (from X)" block
// format, still parse through `parsePicksByTeam` as a fallback.
//
// Output (both formats): picks = [{ round, originalName, ownerName, traded }]
// — one entry per (round, original team), exactly the per-pick model the
// grid stores (draftPicks.ownership is keyed "<round>:<originalTeamId>").

import { normalizeTeamName } from './teamMap.js';

const ROUND_HEADER = /^round\s*(\d+)\s*$/i;
const NONE_CELL = /^[-–—]?$/;
const BY_ROUND_SKIP = /^(team|picks owned|team picks owned|picks|draft picks)$/i;

const collapse = (s) => s.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();

// ── normalisation with a raw-index map ──────────────────────────────────────
// Segmentation runs on the normalised string, but an unmatched chunk has to
// be shown to the commissioner in its RAW spelling, so every normalised char
// remembers where in the raw string it came from.
function normalizeWithMap(raw) {
  const chars = [];
  const rawIdx = [];
  let i = 0;
  for (const ch of raw) {
    const n = normalizeTeamName(ch);
    for (const c of n) { chars.push(c); rawIdx.push(i); }
    i += ch.length;
  }
  return { norm: chars.join(''), rawIdx, rawLen: raw.length };
}

// ── vocabulary segmentation ─────────────────────────────────────────────────
// Exact-cover DP: minimise unmatched characters, then the number of segments
// (so a name is never split into two shorter names that also happen to be
// teams). Counts the zero-residual segmentations so a genuinely ambiguous
// string is flagged rather than silently resolved one way.
export function segmentTeamNames(raw, vocab) {
  const { norm, rawIdx, rawLen } = normalizeWithMap(raw);
  const n = norm.length;
  const entries = [...vocab.entries()] // [key, name]
    .filter(([key]) => key)
    .sort((a, b) => b[0].length - a[0].length);
  // best[i] = { residual, segs, next: { key, len } | 'skip', ways }
  const best = new Array(n + 1);
  best[n] = { residual: 0, segs: 0, next: null, ways: 1 };
  for (let i = n - 1; i >= 0; i--) {
    let cand = { residual: 1 + best[i + 1].residual, segs: best[i + 1].segs, next: 'skip', ways: 0 };
    let ways = 0;
    for (const [key, name] of entries) {
      if (norm.startsWith(key, i)) {
        const after = best[i + key.length];
        const c = { residual: after.residual, segs: after.segs + 1, next: { key, name, len: key.length }, ways: 0 };
        if (c.residual < cand.residual || (c.residual === cand.residual && c.segs < cand.segs)) cand = c;
        if (after.residual === 0) ways += after.ways;
      }
    }
    cand.ways = cand.residual === 0 ? ways : 0;
    best[i] = cand;
  }
  const names = [];
  const residuals = [];
  let i = 0;
  let resStart = -1;
  const flushResidual = (end) => {
    if (resStart < 0) return;
    const from = rawIdx[resStart];
    const to = end < n ? rawIdx[end] : rawLen;
    residuals.push(raw.slice(from, to).trim());
    resStart = -1;
  };
  while (i < n) {
    const step = best[i].next;
    if (step === 'skip') { if (resStart < 0) resStart = i; i += 1; continue; }
    flushResidual(i);
    names.push(step.name);
    i += step.len;
  }
  flushResidual(n);
  return { names, residuals: residuals.filter(Boolean), ambiguous: best[0].ways > 1 };
}

// ── GRID view ───────────────────────────────────────────────────────────────
// Counts per team per round. Yahoo's page copies its header as TWO lines —
//   Team	Rounds
//   1	2	3	…	17
// — though a one-line "Team 1 2 3 … N [Total]" is read too. Then one row per
// team: the name followed by N integers. Team names may contain digits and
// spaces, so the counts are read from the END of the row — exactly as many
// as the header declared.
//
// The header is also the BOUNDARY when the Grid is pasted under a By Round
// paste in one field: nothing in By Round produces it, so round parsing
// stops there (the header line index is returned as `startLine`). Without a
// header a grid is recognised only when `requireHeader` is off (the
// dedicated Grid field), by rows agreeing on a width of ≥ 3 counts.
function findGridHeader(lines) {
  const seq = (tokens) => {
    const t = tokens.filter(Boolean);
    const hasTotal = /^total$/i.test(t[t.length - 1] || '');
    const nums = (hasTotal ? t.slice(0, -1) : t).map(Number);
    if (nums.length < 2 || !nums.every((v, k) => v === k + 1)) return null;
    return { rounds: nums.length, hasTotal };
  };
  for (let i = 0; i < lines.length; i++) {
    const l = collapse(lines[i]);
    const one = l.match(/^team\s+(.+)$/i);
    if (one && !/^rounds?$/i.test(one[1])) {
      const r = seq(one[1].split(' '));
      if (r) return { line: i, rowsFrom: i + 1, ...r };
      continue;
    }
    if (/^team(\s+rounds?)?$/i.test(l)) {
      const next = lines[i + 1] == null ? null : collapse(lines[i + 1]);
      const r = next ? seq(next.split(' ')) : null;
      if (r) return { line: i, rowsFrom: i + 2, ...r };
    }
  }
  return null;
}

export function parsePicksGrid(text, { requireHeader = false } = {}) {
  const lines = (text || '').split(/\r?\n/);
  const header = findGridHeader(lines);
  if (!header && requireHeader) return null;
  const headerRounds = header ? header.rounds : null;
  const hasTotal = header ? header.hasTotal : false;
  const rows = [];
  const lineIdx = new Set();
  if (header) for (let i = header.line; i < header.rowsFrom; i++) lineIdx.add(i);
  const TRAILING = /^(.*?)((?:\s+\d+)+)$/;
  for (let i = header ? header.rowsFrom : 0; i < lines.length; i++) {
    const l = collapse(lines[i]);
    if (!l || ROUND_HEADER.test(l)) continue;
    const m = l.match(TRAILING);
    if (!m) continue;
    let counts = m[2].trim().split(' ').map(Number);
    let name = m[1].trim();
    // Without a header, a row needs enough trailing numbers to be a grid row
    // at all rather than a team name that happens to end in a digit.
    if (headerRounds == null && counts.length < 3) continue;
    if (headerRounds != null) {
      const need = headerRounds + (hasTotal ? 1 : 0);
      if (counts.length < need) continue;
      // Digits that belong to the team name spill into the trailing run;
      // keep only the last `need` numbers and return the rest to the name.
      if (counts.length > need) {
        name = collapse(`${name} ${counts.slice(0, counts.length - need).join(' ')}`);
        counts = counts.slice(counts.length - need);
      }
      if (hasTotal) counts = counts.slice(0, headerRounds);
    }
    if (!name) continue;
    rows.push({ name, counts, line: i });
  }
  if (!header) {
    // No header: rows must agree on a width to count as a grid at all.
    if (rows.length < 2) return null;
    const width = rows[0].counts.length;
    if (!rows.every(r => r.counts.length === width)) return null;
  }
  if (rows.length === 0) return null;
  rows.forEach(r => lineIdx.add(r.line));
  return {
    rounds: headerRounds ?? rows[0].counts.length,
    teams: rows.map(({ name, counts }) => ({ name, counts })),
    lineIdx,
    startLine: header ? header.line : Math.min(...rows.map(r => r.line)),
  };
}

// ── BY ROUND view ───────────────────────────────────────────────────────────
// opts.knownNames — the league's own team names, used as a second-tier
// vocabulary only when the paste's own owner lines can't cover a held cell
// (a Yahoo rename mid-paste, or a commissioner-renamed team).
// opts.gridText — the Grid view pasted in its own field. When absent, a Grid
// pasted UNDER the By Round text in the same field is found by its header
// and read from there; either way round parsing never runs past it.
export function parsePicksByRound(text, opts = {}) {
  const rawLines = (text || '').split(/\r?\n/);
  const issues = [];
  const embedded = parsePicksGrid(text, { requireHeader: true });
  let grid = embedded;
  if ((opts.gridText || '').trim()) {
    grid = parsePicksGrid(opts.gridText);
    if (!grid) issues.push({ round: null, kind: 'grid', text: "The Grid field couldn't be read as Yahoo's Grid view — expected a Team / Rounds header and one row of counts per team. It was ignored." });
  }
  const skipIdx = embedded?.lineIdx || new Set();
  // A Grid UNDER the By Round text ends round parsing at its header — any
  // trailing furniture (a Total row, page chrome) can't leak into the last
  // round. A Grid pasted FIRST is skipped as a span instead, since rounds
  // follow it.
  let stopAt = rawLines.length;
  if (embedded) {
    const gridEnd = Math.max(...embedded.lineIdx);
    const roundsFollow = rawLines.slice(gridEnd + 1).some(l => ROUND_HEADER.test(collapse(l)));
    if (roundsFollow) for (let i = embedded.startLine; i <= gridEnd; i++) skipIdx.add(i);
    else stopAt = embedded.startLine;
  }

  // Pass 1 — structure: round blocks of (owner, held) pairs. Rows come either
  // as two consecutive lines (the copy the sample shows) or tab-separated on
  // one line (a table copied cell-wise).
  const blocks = [];
  let current = null;
  let pendingOwner = null;
  for (let i = 0; i < stopAt; i++) {
    if (skipIdx.has(i)) continue;
    const line = rawLines[i].replace(/\r/g, '');
    const flat = collapse(line);
    if (!flat) continue;
    const rh = flat.match(ROUND_HEADER);
    if (rh) {
      current = { round: parseInt(rh[1], 10), rows: [] };
      blocks.push(current);
      pendingOwner = null;
      continue;
    }
    if (!current) continue; // page title / preamble before the first round
    if (BY_ROUND_SKIP.test(flat)) continue;
    if (line.includes('\t')) {
      const [owner, ...rest] = line.split('\t').map(s => s.trim());
      if (!owner) continue;
      current.rows.push({ owner, held: rest.join('').trim() });
      pendingOwner = null;
      continue;
    }
    if (pendingOwner == null) { pendingOwner = flat; continue; }
    current.rows.push({ owner: pendingOwner, held: flat });
    pendingOwner = null;
  }

  if (blocks.length === 0) return { format: 'byRound', picks: [], rounds: [], teams: [], teamCount: 0, totalPicks: 0, tradedCount: 0, issues, grid: null };
  if (pendingOwner != null) {
    issues.push({ round: current.round, kind: 'structure', text: `R${current.round}: "${pendingOwner}" has no picks line under it — the paste may be cut off.` });
  }

  // Pass 2 — vocabulary: every current owner across every round, keyed on
  // the normalised name, first raw spelling kept.
  const vocab = new Map();
  for (const b of blocks) for (const r of b.rows) {
    const key = normalizeTeamName(r.owner);
    if (key && !vocab.has(key)) vocab.set(key, r.owner);
  }
  const fallbackVocab = new Map(vocab);
  for (const name of opts.knownNames || []) {
    const key = normalizeTeamName(name);
    if (key && !fallbackVocab.has(key)) fallbackVocab.set(key, name);
  }
  const teams = [...vocab.values()];
  const teamCount = teams.length;

  // Pass 3 — picks.
  const picks = [];
  const seenRounds = new Set();
  for (const b of blocks) {
    if (seenRounds.has(b.round)) issues.push({ round: b.round, kind: 'structure', text: `Round ${b.round} appears more than once in the paste.` });
    seenRounds.add(b.round);
    const originals = new Map(); // key → count
    for (const r of b.rows) {
      if (NONE_CELL.test(r.held.trim())) continue;
      let seg = segmentTeamNames(r.held, vocab);
      if (seg.residuals.length && fallbackVocab.size > vocab.size) seg = segmentTeamNames(r.held, fallbackVocab);
      if (seg.ambiguous) issues.push({ round: b.round, kind: 'ambiguous', text: `R${b.round} · ${r.owner}: "${r.held}" splits into team names more than one way — check this round on Yahoo.` });
      for (const res of seg.residuals) {
        issues.push({ round: b.round, kind: 'unmatched', text: `R${b.round} · ${r.owner}: couldn't match "${res}" to a team — that pick was skipped.` });
      }
      for (const originalName of seg.names) {
        const key = normalizeTeamName(originalName);
        originals.set(key, (originals.get(key) || 0) + 1);
        picks.push({ round: b.round, originalName, ownerName: r.owner, traded: key !== normalizeTeamName(r.owner) });
      }
    }
    // Every team's pick must appear exactly once per round.
    const total = [...originals.values()].reduce((s, c) => s + c, 0);
    if (total !== teamCount) issues.push({ round: b.round, kind: 'count', text: `R${b.round} accounts for ${total} pick${total === 1 ? '' : 's'}, not ${teamCount} (one per team).` });
    for (const [key, name] of vocab) {
      const c = originals.get(key) || 0;
      if (c === 0) issues.push({ round: b.round, kind: 'missing', text: `R${b.round}: ${name}'s pick isn't listed under any team.` });
      else if (c > 1) issues.push({ round: b.round, kind: 'duplicate', text: `R${b.round}: ${name}'s pick is listed ${c} times.` });
    }
  }
  const rounds = [...seenRounds].sort((a, b) => a - b);

  // Grid checksum — per team per round.
  let gridReport = null;
  if (grid) {
    const mismatches = [];
    const gridTeamsUnknown = [];
    const ownedCount = (round, key) => picks.filter(p => p.round === round && normalizeTeamName(p.ownerName) === key).length;
    for (const gt of grid.teams) {
      const key = normalizeTeamName(gt.name);
      if (!vocab.has(key)) { gridTeamsUnknown.push(gt.name); continue; }
      gt.counts.forEach((expected, ri) => {
        const round = ri + 1;
        if (!seenRounds.has(round)) return;
        const found = ownedCount(round, key);
        if (found !== expected) mismatches.push({ round, team: vocab.get(key), expected, found });
      });
    }
    const gridRounds = grid.rounds;
    const parsedMax = rounds[rounds.length - 1] || 0;
    if (gridRounds !== parsedMax) issues.push({ round: null, kind: 'grid', text: `The Grid covers ${gridRounds} round${gridRounds === 1 ? '' : 's'} but the By Round paste has ${parsedMax}.` });
    for (const name of gridTeamsUnknown) issues.push({ round: null, kind: 'grid', text: `Grid team "${name}" doesn't appear in the By Round paste.` });
    for (const m of mismatches) issues.push({ round: m.round, kind: 'grid', team: m.team, text: `R${m.round} · ${m.team}: the Grid says ${m.expected} pick${m.expected === 1 ? '' : 's'}, the By Round paste has ${m.found}.` });
    gridReport = { rounds: gridRounds, teams: grid.teams.length, mismatches, ok: mismatches.length === 0 && gridTeamsUnknown.length === 0 && gridRounds === parsedMax };
  }

  return {
    format: 'byRound',
    picks,
    rounds,
    teams,
    teamCount,
    totalPicks: picks.length,
    tradedCount: picks.filter(p => p.traded).length,
    issues,
    grid: gridReport,
  };
}

// ── BY TEAM / legacy block view ─────────────────────────────────────────────
// Team-name header, then that team's pick lines:
//   "Round 2"                        → own pick
//   "Round 2 (from X)" / "(via X)"   → X's pick, held by the block team
//   "Round 2 (to X)"                 → block team's pick, traded away to X
//   "2nd Round pick (from X)", "Rd 2 (from X)", "2022 Round 2 (from X)"
// Trade-annotated entries beat plain ones (a traded pick can be listed under
// both teams). Incomplete by nature — untraded picks that aren't listed are
// simply not written.
const PICK_LINE_REGEX = /^(?:20\d{2}\s+)?(?:(?:round|rd\.?)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+round)(?:\s+pick)?\s*(?:[-–—:]\s*)?(?:\(\s*(from|via|to)\s+([^)]+)\)|(from|via|to)\s+(.+))?\s*$/i;
const PICK_SKIP_REGEX = /^(draft picks?|traded(?:\s+draft)?\s+picks?|picks?|round|team|original(?:\s+owner)?|current(?:\s+owner)?|owner|year|notes?|20\d{2}(?:\s+season)?|.*draft results.*)$/i;

export function parsePicksByTeam(text) {
  const lines = (text || '').split(/\r?\n/).map(collapse);
  const byKey = new Map();
  let currentTeam = null;
  const record = (round, originalName, ownerName, traded) => {
    if (!round || !originalName || !ownerName) return;
    const key = `${round}|${normalizeTeamName(originalName)}`;
    const prev = byKey.get(key);
    if (prev && prev.traded && !traded) return;
    byKey.set(key, { round, originalName, ownerName, traded });
  };
  for (const line of lines) {
    if (!line) continue;
    if (PICK_SKIP_REGEX.test(line)) continue;
    const m = line.match(PICK_LINE_REGEX);
    if (m) {
      if (!currentTeam) continue;
      const round = parseInt(m[1] || m[2], 10);
      const dir = (m[3] || m[5] || '').toLowerCase();
      const other = (m[4] || m[6] || '').trim();
      if (!Number.isFinite(round)) continue;
      if (!dir || !other) record(round, currentTeam, currentTeam, false);
      else if (dir === 'to') record(round, currentTeam, other, true);
      else record(round, other, currentTeam, true);
      continue;
    }
    if (!/^\d/.test(line) && !/^\$/.test(line) && line.length < 80) currentTeam = line;
  }
  const picks = [...byKey.values()];
  return { format: 'byTeam', picks, issues: [], totalPicks: picks.length, tradedCount: picks.filter(p => p.traded).length, grid: null };
}

// ── format detection + dispatch ─────────────────────────────────────────────
// By Round: every "Round N" line is a block header that appears once. In the
// by-team format the same round line repeats under every team.
export function detectPicksFormat(text) {
  const lines = (text || '').split(/\r?\n/).map(collapse).filter(Boolean);
  const headers = lines.filter(l => ROUND_HEADER.test(l)).map(l => parseInt(l.match(ROUND_HEADER)[1], 10));
  const uniqueHeaders = new Set(headers);
  if (headers.length > 0 && uniqueHeaders.size === headers.length) return 'byRound';
  if (parsePicksGrid(text, { requireHeader: true })) return 'grid';
  if (lines.some(l => PICK_LINE_REGEX.test(l))) return 'byTeam';
  if (parsePicksGrid(text)) return 'grid';
  return 'unknown';
}

export const PICKS_PASTE_ERRORS = {
  grid: "This looks like Yahoo's Grid view, which only has pick COUNTS — not which picks each team holds. On the Draft Picks page switch to By Round, copy that, and paste it here. The Grid goes in its own field below, where it's used to double-check the counts.",
  unknown: "Couldn't find any rounds. On Yahoo's Draft Picks page choose the By Round view, select everything, copy, and paste it here.",
  empty: "Found the round headers but no picks under them — make sure the whole By Round page is selected when copying.",
};

export function parseDraftPicksText(text, opts = {}) {
  const format = detectPicksFormat(text);
  if (format === 'byRound') {
    const result = parsePicksByRound(text, opts);
    if (result.picks.length === 0) return { ...result, error: PICKS_PASTE_ERRORS.empty };
    return result;
  }
  if (format === 'byTeam') {
    const result = parsePicksByTeam(text);
    if (result.picks.length === 0) return { ...result, error: PICKS_PASTE_ERRORS.unknown };
    return result;
  }
  return { format, picks: [], issues: [], totalPicks: 0, tradedCount: 0, grid: null, error: PICKS_PASTE_ERRORS[format === 'grid' ? 'grid' : 'unknown'] };
}
