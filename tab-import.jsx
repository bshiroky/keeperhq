// Import Last Year's Draft — paste tool for auction draft results
// Format parsed: lines like "1.   (22)   Cooper Flagg (DAL - PG,SG,SF)   $30"
// Multiple team blocks separated by "Team Name" headers + "Budget $200" markers + "Unused $X" trailers.

function parseDraftResults(text) {
  const teams = []; // [{ name, players: [{ player, draftedFor, isKeeper }] }]
  let current = null;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Match player row: starts with "N." or "N) " then pick, name (TEAM - pos), $cost
  // Tolerant of various whitespace/tab separators.
  const playerRegex = /^(\d+)[.)]\s*(?:\(\d+\)\s*)?(.+?)\s*\(([A-Z]{2,4})\s*-\s*([^)]+)\)\s*\$?(\d+)\s*$/;

  for (const raw of lines) {
    // Skip header rows
    if (/^budget\b/i.test(raw)) continue;
    if (/^unused\b/i.test(raw)) {
      // End of team block
      continue;
    }

    const m = raw.match(playerRegex);
    if (m) {
      if (!current) continue; // player line without a team — skip
      const playerName = m[2].replace(/\s+/g, ' ').trim();
      const proTeam = m[3];
      const positions = m[4].split(',').map(s => s.trim()).join(',');
      const dollar = parseInt(m[5], 10);
      const isKeeper = / {2,}\(|\(K\)/.test(raw);
      current.players.push({ player: playerName, draftedFor: dollar, isKeeper, proTeam, positions });
      continue;
    }

    // Otherwise: this is a team name line (heuristic — not all numbers, no $, not the headers we skipped)
    // We treat this as starting a new team block.
    if (!/^\d/.test(raw) && !/^\$/.test(raw) && raw.length < 80) {
      current = { name: raw, players: [] };
      teams.push(current);
    }
  }
  return teams;
}

function DraftImportModal({ league, accentColor, isDark, onImport, onClose }) {
  const t = makeTheme(isDark);
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState(null);
  const [mapping, setMapping] = React.useState({}); // {parsedName: leagueTeamId}

  function doPreview() {
    const parsed = parseDraftResults(text);
    setPreview(parsed);
    // Auto-map by name (case-insensitive, fuzzy contains)
    const mapInit = {};
    parsed.forEach(p => {
      const norm = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = league.teams.find(tm => {
        const tn = tm.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return norm.includes(tn) || tn.includes(norm);
      });
      if (match) mapInit[p.name] = match.id;
    });
    setMapping(mapInit);
  }

  function doImport() {
    if (!preview) return;
    const bump = (league.auctionRules && league.auctionRules.costIncreasePerYear) || 5;
    // Build new teams array with priorKeepers populated
    const newTeams = league.teams.map(tm => {
      const fromParsed = preview.find(p => mapping[p.name] === tm.id);
      if (!fromParsed) return tm;
      const priorKeepers = fromParsed.players.map(p => ({
        player: p.player,
        keptFor: p.draftedFor,
        yearsKept: p.isKeeper ? 1 : 0, // if marked as keeper in last year's draft, they were already kept once
        proTeam: p.proTeam,
        positions: p.positions,
      }));
      return { ...tm, priorKeepers };
    });
    onImport({ ...league, teams: newTeams });
    onClose();
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12,
        width: '100%', maxWidth: 760, maxHeight: '88vh', overflow: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>Import Last Year's Draft</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Paste the full team-by-team draft results from your fantasy site.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!preview && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                Format: each team block has the team name on its own line, a "Budget" line, then rows of <code style={{ background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>N. (pick) Player (TEAM - POS) $cost</code>, ending with "Unused $X". Players kept from prior years (marked with K) will be flagged.
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                placeholder={"Anthony!!!\nBudget  $200\n1.\t(22)\tCooper Flagg (DAL - PG,SG,SF)\t$30\n2.\t(31)\tReed Sheppard (HOU - PG,SG)\t$9\n...\nUnused $60\n\nKeanu Reaves\nBudget $200\n1. (2) Tari Eason (HOU - SG,SF,PF) $9\n..."}
                style={{
                  width: '100%', minHeight: 260, background: t.sectionBg, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace',
                  outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onClose} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={doPreview} disabled={!text.trim()} style={{ background: text.trim() ? accentColor : t.sectionBg, color: text.trim() ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>Preview Parse →</button>
              </div>
            </>
          )}

          {preview && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4 }}>
                Parsed <strong>{preview.length}</strong> team{preview.length === 1 ? '' : 's'} ·{' '}
                <strong>{preview.reduce((s, p) => s + p.players.length, 0)}</strong> players. Map each parsed name to one of your league's teams:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                {preview.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{p.players.length} players · {p.players.filter(pl => pl.isKeeper).length} marked as carry-over keepers</div>
                    </div>
                    <select value={mapping[p.name] || ''} onChange={e => setMapping({ ...mapping, [p.name]: e.target.value })}
                      style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${mapping[p.name] ? accentColor : '#e85252'}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', minWidth: 140 }}>
                      <option value="">— Pick a team —</option>
                      {league.teams.map(tm => (
                        <option key={tm.id} value={tm.id}>{tm.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>← Back to paste</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={onClose} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={doImport} disabled={Object.values(mapping).filter(Boolean).length === 0} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Import {Object.values(mapping).filter(Boolean).length} team{Object.values(mapping).filter(Boolean).length === 1 ? '' : 's'}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DraftImportModal, parseDraftResults });
