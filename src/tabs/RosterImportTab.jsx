import React from 'react';
import { Camera, Loader, Check } from 'lucide-react';
import { makeTheme, tokens } from '../components.jsx';
import { loadPlayers, normalizeName } from '../lib/players.js';
import { PlayerAutocomplete, posForRoster } from '../PlayerAutocomplete.jsx';
import '../claudeStub.js';

// Per-Team Roster Import
// - Paste mode: parses Yahoo's roster HTML/text where player names appear twice consecutively
//   below a position code. Tolerant of stat rows, totals, IR sections, etc.
// - Screenshot mode: uploads image(s) and asks claude-haiku to extract a JSON list of names.
//
// The paste/OCR step extracts player NAMES only. Yahoo's leftmost column is a
// LINEUP SLOT (BN, IR+, Util…), not a position — a benched player is not
// position "BN" — so slot labels are used purely as parsing anchors and then
// discarded. Positions come from the NHL player directory (loadPlayers +
// normalizeName, the same matching machinery buildStatusIndex uses); names
// with no directory match are stored with no position and flagged in the
// preview so spelling can be fixed before saving.

const ROSTER_POSITIONS = new Set([
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

// Strip trailing junk Yahoo appends to player-name cells when you select the page text:
//   "No new player Notes", "NA No new player Notes", "New Player Note", "Player Note",
//   plus 1-2 char status flags (O, Q, IR, GTD, NA, K) and leftover whitespace.
function cleanPlayerName(raw) {
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

// Parser: walks lines looking for a position code, then the next non-empty line as the player name.
// Validates by checking the following line contains a " - " (Yahoo's team-position string, e.g. "SJ - C").
// Skips "(Empty)" slot placeholders and the various header / summary rows.
function parseYahooRosterText(text) {
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
    if (/^\(empty\)/i.test(next.value)) { i = next.idx; continue; }
    if (headerWords.test(next.value)) continue;
    // The line after that should be a team-position string like "SJ - C" — use as soft validation.
    const after = nonEmptyAfter(next.idx);
    const looksValid = after && / - /.test(after.value);
    const player = cleanPlayerName(next.value);
    if (!player || player.length < 2) continue;
    // If two consecutive lines both equal a position code (rare table-header case), skip.
    if (ROSTER_POSITIONS.has(player)) continue;
    // The slot label (`line`) is deliberately dropped — it anchors the parse
    // but is a lineup slot, not a position.
    out.push({ player, _ok: !!looksValid });
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

// Convert a File to base64 string (no data URL prefix)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractRosterFromImage(file) {
  const b64 = await fileToBase64(file);
  const mediaType = file.type || 'image/png';
  const prompt = `This is a screenshot of a Yahoo Fantasy roster page. Extract EVERY player visible, including bench (BN) and injured reserve (IR, IR+, IL) slots.

Return ONLY a valid JSON array. No prose, no markdown fences. Each entry must be:
{"player": "Full Name"}

Extract player names only — ignore the lineup-slot column (BN, IR, Util, etc.) and any stats.
Do not include team totals or summary rows.`;

  const response = await window.claude.complete({
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });

  // Find first [...] block in response
  const match = response.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in extraction response.');
  const arr = JSON.parse(match[0]);
  if (!Array.isArray(arr)) throw new Error('Extraction did not return an array.');
  return arr.map(p => ({ player: String(p.player || '').trim() })).filter(p => p.player);
}

function RosterImportModal({ league, initialTeamId, accentColor, isDark, onImport, onClose }) {
  const t = makeTheme(isDark);
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [teamId, setTeamId] = React.useState(initialTeamId || league.teams[0]?.id);
  const [mode, setMode] = React.useState('paste'); // 'paste' | 'screenshot'
  const [text, setText] = React.useState('');
  const [players, setPlayers] = React.useState([]); // [{player}] — positions derive from the directory
  const [extracting, setExtracting] = React.useState(false);
  const [error, setError] = React.useState(null);

  // NHL player directory — the source of truth for positions. Only hockey has
  // a directory today; other sports import names with no position data.
  const supportsDirectory = league.sport === 'hockey' || league.sport === 'nhl';
  const [directory, setDirectory] = React.useState(null);
  React.useEffect(() => {
    if (!supportsDirectory) return;
    let cancelled = false;
    loadPlayers('nhl')
      .then(d => { if (!cancelled) setDirectory(d.players || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [supportsDirectory]);
  const dirMap = React.useMemo(() => {
    if (!directory) return null;
    const m = new Map();
    directory.forEach(p => { const k = normalizeName(p.name); if (k && !m.has(k)) m.set(k, p); });
    return m;
  }, [directory]);
  // Directory record for a typed name; null = unmatched, undefined = no directory to match against.
  const matchFor = (name) => dirMap && dirMap.size > 0 ? (dirMap.get(normalizeName(name)) || null) : undefined;

  const selectedTeam = league.teams.find(tm => tm.id === teamId) || league.teams[0];
  const existingRoster = selectedTeam?.roster || [];

  function doParse() {
    setError(null);
    const parsed = parseYahooRosterText(text);
    if (parsed.length === 0) {
      setError("Couldn't find any players. Yahoo's roster page has each name listed twice in a row — make sure you copied the full table including names.");
      return;
    }
    setPlayers(parsed);
  }

  async function doExtractFromFile(file) {
    setError(null);
    setExtracting(true);
    try {
      const extracted = await extractRosterFromImage(file);
      if (extracted.length === 0) {
        setError("No players detected in screenshot. Try a clearer crop or use the paste tab.");
      } else {
        // Merge with whatever is already there (in case user uploads multiple screenshots — e.g. skaters + goalies)
        setPlayers(prev => {
          const seen = new Set(prev.map(p => p.player.toLowerCase()));
          const merged = [...prev];
          extracted.forEach(p => {
            if (!seen.has(p.player.toLowerCase())) {
              merged.push(p);
              seen.add(p.player.toLowerCase());
            }
          });
          return merged;
        });
      }
    } catch (e) {
      setError(`Extraction failed: ${e.message || e}. Try the paste tab instead.`);
    } finally {
      setExtracting(false);
    }
  }

  function updatePlayer(idx, patch) {
    setPlayers(players.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }
  function removePlayer(idx) {
    setPlayers(players.filter((_, i) => i !== idx));
  }
  function addEmpty() {
    setPlayers([...players, { player: '' }]);
  }

  function doImport() {
    // Position comes from the directory match (real position codes), never
    // from the paste. Unmatched names save with no pos at all — better no
    // data than a lineup-slot label masquerading as a position.
    const cleaned = players.filter(p => p.player.trim()).map(p => {
      const name = p.player.trim();
      const rec = matchFor(name);
      return rec?.pos ? { player: name, pos: posForRoster(rec.pos) } : { player: name };
    });
    if (cleaned.length === 0) {
      setError("Nothing to import.");
      return;
    }
    const newTeams = league.teams.map(tm => tm.id === teamId ? { ...tm, roster: cleaned } : tm);
    onImport({ ...league, teams: newTeams });
    onClose();
  }

  // Roster import is pure ingest: just capture who was on the team that day.
  // Eligibility / contract status / waiver-pickup analysis happens at Collect time, where it belongs.

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12,
        width: '100%', maxWidth: 820, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>Import Team Roster</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              Snapshot of who was on the team's roster before fantasy playoffs. Used to verify keeper eligibility.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* Team picker */}
        <div style={{ padding: '14px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 10, color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Team</label>
            <select value={teamId} onChange={e => { setTeamId(e.target.value); setPlayers([]); setText(''); setError(null); }}
              style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer' }}>
              {league.teams.map(tm => (
                <option key={tm.id} value={tm.id}>{tm.name}{tm.roster ? `  ·  ${tm.roster.length} loaded` : ''}</option>
              ))}
            </select>
          </div>
          {existingRoster.length > 0 && (
            <div style={{ padding: '7px 10px', background: tokens.successBg, border: `1px solid ${tokens.successBorder}`, borderRadius: 6, fontSize: 11, color: tokens.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={12} strokeWidth={2} /> {existingRoster.length} players already imported — re-import will overwrite.
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div style={{ padding: '0 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', gap: 0 }}>
          {[
            { id: 'paste', label: 'Paste from Yahoo' },
            { id: 'screenshot', label: 'Upload Screenshot' },
          ].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setError(null); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '9px 14px', fontSize: 12, fontWeight: 700,
                color: mode === m.id ? accentColor : t.textMuted,
                borderBottom: mode === m.id ? `2px solid ${accentColor}` : '2px solid transparent',
                marginBottom: -1, fontFamily: 'inherit',
              }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div style={{ padding: '16px 22px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'paste' && (
            <>
              <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                On Yahoo, open the team's roster page (use the URL date trick if needed), select the whole page, copy, and paste here. The parser keys on the duplicated player-name pattern Yahoo uses, so stats columns are ignored automatically.
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                placeholder={"Pos\tForwards/Defensemen\tAction\tOpp\t...\nC\nNico Hischier\nNico Hischier\nW, 3-2 vs EDM\n...\nC\nJohn Tavares\nJohn Tavares\n..."}
                style={{
                  width: '100%', minHeight: 220, background: t.sectionBg, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace',
                  outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={doParse} disabled={!text.trim()}
                  style={{ background: text.trim() ? accentColor : t.sectionBg, color: text.trim() ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                  Parse Roster →
                </button>
              </div>
            </>
          )}

          {mode === 'screenshot' && (
            <>
              <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                Drop one or more screenshots of the team's Yahoo roster page. Each image is sent through an OCR pass that pulls out player names and positions. Upload multiple if the roster spans goalies / pitchers / IR slots on separate scrolls.
              </div>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '32px 20px', border: `2px dashed ${t.border}`, borderRadius: 10,
                cursor: extracting ? 'wait' : 'pointer', background: t.sectionBg, gap: 6,
              }}>
                <span style={{ color: t.textSecondary, display: 'inline-flex' }}>
                  {extracting
                    ? <Loader size={22} strokeWidth={1.5} className="kh-spin" />
                    : <Camera size={22} strokeWidth={1.5} />}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>
                  {extracting ? 'Extracting players…' : 'Click to upload screenshot(s)'}
                </span>
                <span style={{ fontSize: 11, color: t.textMuted }}>PNG / JPG · adds to the preview below</span>
                <input type="file" accept="image/*" multiple disabled={extracting} style={{ display: 'none' }}
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    for (const f of files) {
                      await doExtractFromFile(f);
                    }
                    e.target.value = '';
                  }} />
              </label>
            </>
          )}

          {error && (
            <div style={{ padding: '10px 12px', background: 'rgba(232,82,82,0.08)', border: '1px solid rgba(232,82,82,0.3)', borderRadius: 6, fontSize: 12, color: '#e85252' }}>{error}</div>
          )}

          {/* Preview / edit list. Position chips are derived live from the
              directory match on the typed name — editing a misspelled name
              re-matches as you type. */}
          {players.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Preview · {players.length} player{players.length === 1 ? '' : 's'}
                  {(() => {
                    const unmatchedCount = players.filter(p => p.player.trim() && matchFor(p.player) === null).length;
                    return unmatchedCount > 0
                      ? <span style={{ color: tokens.danger, marginLeft: 8 }}>· {unmatchedCount} unmatched</span>
                      : null;
                  })()}
                </div>
                <button onClick={() => setPlayers([])}
                  style={{ background: 'none', border: 'none', fontSize: 11, color: t.textMuted, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                  Clear
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {players.map((p, i) => {
                  const rec = matchFor(p.player);
                  const unmatched = rec === null && !!p.player.trim();
                  // Directory autocomplete on every row — typing edits the
                  // name, picking a suggestion resolves it to the directory's
                  // exact formatting (the fix path for unmatched rows). Other
                  // rows' names are disabled to keep the roster dupe-free.
                  const otherNames = new Set(players.filter((_, oi) => oi !== i).map(op => normalizeName(op.player)).filter(Boolean));
                  return (
                    <div key={i} style={{ padding: '6px 8px', background: t.sectionBg, border: `1px solid ${unmatched ? tokens.dangerBorder : t.border}`, borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 42, boxSizing: 'border-box', flexShrink: 0, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: '3px 5px', fontSize: 11, color: rec?.pos ? t.textPrimary : t.textMuted, textAlign: 'center', fontWeight: 700 }}>
                          {rec?.pos ? posForRoster(rec.pos) : '—'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <PlayerAutocomplete
                            value={p.player}
                            onChange={name => updatePlayer(i, { player: name })}
                            sport={league.sport}
                            isDark={isDark}
                            placeholder="Player name"
                            league={league}
                            disabledNames={otherNames}
                            inputStyle={{ width: '100%', boxSizing: 'border-box', background: 'none', border: 'none', fontSize: 12, color: unmatched ? tokens.danger : t.textPrimary, fontFamily: 'inherit', outline: 'none', fontWeight: 600, padding: 0 }}
                          />
                        </div>
                        <button onClick={() => removePlayer(i)} title="Remove player"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 14, lineHeight: 1, padding: '0 2px', fontFamily: 'inherit' }}>×</button>
                      </div>
                      {unmatched && (
                        <div style={{ marginTop: 3, paddingLeft: 48, fontSize: 10, fontWeight: 600, color: tokens.danger }}>
                          unmatched — pick from the suggestions or fix the spelling
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={addEmpty}
                style={{ alignSelf: 'flex-start', background: 'none', border: `1px dashed ${t.border}`, borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit' }}>
                + Add player manually
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={onClose}
            style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={doImport} disabled={players.filter(p => p.player.trim()).length === 0}
            style={{
              background: players.filter(p => p.player.trim()).length > 0 ? accentColor : t.sectionBg,
              color: players.filter(p => p.player.trim()).length > 0 ? '#fff' : t.textMuted,
              border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700,
              cursor: players.filter(p => p.player.trim()).length > 0 ? 'pointer' : 'default', fontFamily: 'inherit',
            }}>
            Save Roster for {selectedTeam?.name}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RosterImportModal, parseYahooRosterText });

export { ROSTER_POSITIONS, cleanPlayerName, parseYahooRosterText, fileToBase64, extractRosterFromImage, RosterImportModal };
