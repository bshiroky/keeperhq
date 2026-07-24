import React from 'react';
import { Camera, Loader, Check } from 'lucide-react';
import { makeTheme, tokens } from '../components.jsx';
import { loadPlayers, normalizeName } from '../lib/players.js';
import { ROSTER_POSITIONS, cleanPlayerName, parseYahooRosterText } from '../lib/rosterParse.js';
import { PlayerAutocomplete, posForRoster } from '../PlayerAutocomplete.jsx';
import '../claudeStub.js';

// Per-Team Roster Import
// - Paste mode: lib/rosterParse.js (Yahoo roster text; names appear twice
//   below a lineup-slot code; placeholder rows like "--empty--" are skipped).
// - Screenshot mode: uploads image(s) and asks claude-haiku to extract a JSON list of names.
//
// The paste/OCR step extracts player NAMES only — positions come from the NHL
// directory match; unmatched names store no pos and are flagged in the
// preview so spelling can be fixed before saving.

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

// Paste samples per sport — the format explainer should show rows shaped like
// the league's own Yahoo page, not hockey examples for everyone.
const ROSTER_SAMPLES = {
  hockey: "Pos\tForwards/Defensemen\tAction\tOpp\t...\nC\nNico Hischier\nNico Hischier\nW, 3-2 vs EDM\n...\nBN\nJohn Tavares\nJohn Tavares\n...",
  basketball: "Pos\tPlayers\tAction\tOpp\t...\nPG\nJalen Brunson\nJalen Brunson\nW, 112-104 vs BOS\n...\nBN\nEvan Mobley\nEvan Mobley\n...",
  football: "Pos\tOffense\tAction\tOpp\t...\nQB\nJosh Allen\nJosh Allen\nW, 31-24 vs MIA\n...\nBN\nBijan Robinson\nBijan Robinson\n...",
  baseball: "Pos\tBatters\tAction\tOpp\t...\n1B\nFreddie Freeman\nFreddie Freeman\nW, 5-3 vs SD\n...\nBN\nBobby Witt Jr.\nBobby Witt Jr.\n...",
};

function RosterImportModal({ league, initialTeamId, accentColor, isDark, onImport, onClose }) {
  const t = makeTheme(isDark);
  const rosterSample = ROSTER_SAMPLES[league.sport] || ROSTER_SAMPLES.hockey;
  const todayStr = () => new Date().toISOString().slice(0, 10);

  const [teamId, setTeamId] = React.useState(initialTeamId || league.teams[0]?.id);
  const [mode, setMode] = React.useState('paste'); // 'paste' | 'screenshot'
  const [text, setText] = React.useState('');
  const [players, setPlayers] = React.useState([]); // [{player}] — positions derive from the directory
  const [extracting, setExtracting] = React.useState(false);
  const [error, setError] = React.useState(null);
  // Result step: after saving, show what the import did (counts + directory
  // match rate) instead of closing into silence.
  const [result, setResult] = React.useState(null); // { teamName, total, matched }

  // NHL player directory — the source of truth for positions. Only hockey has
  // a directory today; other sports import names with no position data.
  // dirStatus distinguishes "still loading" from "loaded but EMPTY/broken" —
  // an empty directory must read as an error state (banner below), not as
  // every name silently passing with no position.
  const supportsDirectory = league.sport === 'hockey' || league.sport === 'nhl';
  const [directory, setDirectory] = React.useState(null);
  const [dirStatus, setDirStatus] = React.useState(supportsDirectory ? 'loading' : 'none'); // loading | ready | empty | error | none
  React.useEffect(() => {
    if (!supportsDirectory) return;
    let cancelled = false;
    loadPlayers('nhl')
      .then(d => {
        if (cancelled) return;
        const list = d.players || [];
        setDirectory(list);
        setDirStatus(list.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => { if (!cancelled) setDirStatus('error'); });
    return () => { cancelled = true; };
  }, [supportsDirectory]);
  const dirUnavailable = dirStatus === 'empty' || dirStatus === 'error';
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
    setResult({
      teamName: selectedTeam?.name || '?',
      total: cleaned.length,
      matched: cleaned.filter(p => p.pos).length,
    });
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
              Paste this team's end-of-season roster from your fantasy site — it seeds who this team can keep.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {/* Team picker */}
        {!result && <div style={{ padding: '14px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
        </div>}

        {/* Mode tabs */}
        {!result && <div style={{ padding: '0 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', gap: 0 }}>
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
        </div>}

        {/* Body — scrollable */}
        <div style={{ padding: '16px 22px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {result && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                <span style={{ color: tokens.success, fontWeight: 700 }}>✓</span> {result.total} player{result.total === 1 ? '' : 's'} saved to {result.teamName}
              </div>
              {supportsDirectory && dirStatus === 'ready' && (
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                  {result.matched} matched the NHL directory (position filled in)
                  {result.total - result.matched > 0 && (
                    <span style={{ color: tokens.warning }}> · {result.total - result.matched} unmatched — saved name-only, re-import to fix spelling</span>
                  )}.
                </div>
              )}
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                This roster seeds {result.teamName}'s eligible keeper pool (players with no prior contract show as fresh deals).
              </div>
            </>
          )}
          {!result && dirUnavailable && (
            <div style={{
              padding: '10px 12px', background: tokens.warningBg,
              border: `1px solid ${tokens.warningBorder}`, borderRadius: 6,
              fontSize: 12, color: tokens.warning, lineHeight: 1.5,
            }}>
              <strong>Player directory unavailable</strong> — names can't be checked
              against the NHL directory right now, so spelling won't be verified and
              positions won't be filled in. You can still import names and re-import
              later, but matching is off until the directory loads.
            </div>
          )}
          {!result && mode === 'paste' && (
            <>
              <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                On Yahoo, open the team's roster page (use the URL date trick if needed), select the whole page, copy, and paste here. The parser keys on the duplicated player-name pattern Yahoo uses, so stats columns are ignored automatically.
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                placeholder={rosterSample}
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

          {!result && mode === 'screenshot' && (
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

          {!result && error && (
            <div style={{ padding: '10px 12px', background: 'rgba(232,82,82,0.08)', border: '1px solid rgba(232,82,82,0.3)', borderRadius: 6, fontSize: 12, color: '#e85252' }}>{error}</div>
          )}

          {/* Preview / edit list. Position chips are derived live from the
              directory match on the typed name — editing a misspelled name
              re-matches as you type. */}
          {!result && players.length > 0 && (
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
        <div style={{ padding: '12px 22px', borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: result ? 'flex-end' : 'space-between', gap: 8 }}>
          {result ? (
            <button onClick={onClose}
              style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
          ) : (<>
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
          </>)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RosterImportModal, parseYahooRosterText });

export { ROSTER_POSITIONS, cleanPlayerName, parseYahooRosterText, fileToBase64, extractRosterFromImage, RosterImportModal };
