import React from 'react';
import { makeTheme } from '../components.jsx';
import { resolveYahooTeam, suggestTeam, rememberYahooTeams } from '../lib/teamMap.js';
import { parseDraftResults } from '../lib/draftParse.js';

// Import Last Year's Draft — the paste flow over lib/draftParse.js, which
// handles BOTH Yahoo Draft Results views (team-by-team blocks and the flat
// Picks table) across sports. See that file for the format notes; unit
// fixtures live in scripts/test-draft-parser.mjs.

// ── Draft-import flow (paste → match/confirm) ────────────────────────────────
// The two-step import as PAGE CONTENT, not an overlay — the live entry point
// is the Last Draft page, which renders this flow inline so the whole
// paste→map→confirm sequence involves zero modals. On confirm it writes the
// league and hands a per-team summary to onComplete; the host decides how to
// present the result (the page shows a transient success banner over the
// now-populated table; the dormant modal wrapper shows a result step).
function DraftImportFlow({ league, accentColor, isDark, onImport, onComplete, onCancel }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';
  const contractLen = league.contractYears || 3;
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState(null);
  const [mapping, setMapping] = React.useState({}); // {parsedName: leagueTeamId}
  // Snake carry-forward: per-player contract year entering THIS season
  // (1..contractLength), keyed "teamName|player". Defaults to Y1 (fresh
  // contract); K-marked players default to Y2 (already kept once).
  const [entryYears, setEntryYears] = React.useState({});
  const [expandedTeams, setExpandedTeams] = React.useState({}); // {teamName: bool}
  const [error, setError] = React.useState(null);

  const yearKey = (teamName, player) => `${teamName}|${player}`;
  const entryYearFor = (teamName, p) => entryYears[yearKey(teamName, p.player)] ?? (p.isKeeper ? Math.min(2, contractLen) : 1);

  function doPreview() {
    const parsed = parseDraftResults(text);
    // A valid draft paste always yields players — zero means WE failed to
    // read the format, so say so (and name the other Yahoo view) instead of
    // showing an empty or header-derived "team" to map.
    if (parsed.length === 0 || parsed.every(p => p.players.length === 0)) {
      setError("Couldn't find any players in that paste. Yahoo's Draft Results page has two views — the team-by-team view and the flat Picks list — and both work here, so try copying the OTHER view and pasting that. Rows should look like “1. Player Name (TEAM - POS) $20”, with the fantasy team either on its own line above its picks or at the end of each row.");
      return;
    }
    setError(null);
    setPreview(parsed);
    setEntryYears({});
    setExpandedTeams({});
    // Resolve each parsed Yahoo team name: the saved league.yahooTeamMap first
    // (previously-confirmed names resolve silently, surviving Yahoo renames),
    // then a string-similarity suggestion against the league's team names.
    // Anything still unresolved shows the red dropdown for the commissioner.
    const mapInit = {};
    parsed.forEach(p => {
      const match = resolveYahooTeam(league, p.name) || suggestTeam(league, p.name);
      if (match) mapInit[p.name] = match;
    });
    setMapping(mapInit);
  }

  function doImport() {
    if (!preview) return;
    // Build new teams array with priorKeepers populated
    const summary = [];
    const newTeams = league.teams.map(tm => {
      const fromParsed = preview.find(p => mapping[p.name] === tm.id);
      if (!fromParsed) return tm;
      const priorKeepers = fromParsed.players.map(p => {
        const base = {
          player: p.player, proTeam: p.proTeam, positions: p.positions,
          // Acquisition metadata (foundation for pick-cost keepers / rookie
          // rules): the draft paste is a draft record, so method is 'draft'
          // and the round comes straight from the parse. Rookie status isn't
          // in the paste — defaults false, commissioner-editable.
          acquisitionRound: p.round ?? null,
          acquisitionMethod: 'draft',
          rookieAtAcquisition: false,
        };
        if (isSnake) {
          // priorKeepers.contractYear stores years already served (data.js
          // convention: 0 = drafted last year, entering Y1 if kept), so the
          // pool advances an "entering Y2" import to exactly Y2.
          return { ...base, contractYear: entryYearFor(fromParsed.name, p) - 1, contractLength: contractLen };
        }
        return {
          ...base,
          keptFor: p.draftedFor,
          yearsKept: p.isKeeper ? 1 : 0, // if marked as keeper in last year's draft, they were already kept once
        };
      });
      summary.push({
        name: tm.name,
        players: priorKeepers.length,
        // Snake: contracts carried forward mid-deal (entering year > 1).
        // Auction: carry-over keepers (kept before) + rows with a price.
        withContracts: isSnake
          ? priorKeepers.filter(k => (k.contractYear || 0) > 0).length
          : priorKeepers.filter(k => (k.yearsKept || 0) > 0).length,
        withPrices: isSnake ? null : priorKeepers.filter(k => k.keptFor != null).length,
      });
      return { ...tm, priorKeepers };
    });
    // Persist the confirmed Yahoo-name → team mappings so the next import
    // (even after a Yahoo rename on either side) resolves without asking.
    onImport(rememberYahooTeams({ ...league, teams: newTeams }, mapping));
    onComplete({ teams: summary });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Two steps, swapped in place with a Back affordance — never a second
          overlay. The step line makes the flow's shape explicit. */}
      <div style={{ fontSize: 12, color: t.textMuted }}>
        {preview ? 'Step 2 of 2 · Match teams & confirm' : 'Step 1 of 2 · Paste the full team-by-team draft results from your fantasy site.'}
      </div>
      {!preview && (
        <>
          <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
            Copy either view of your fantasy site's Draft Results page — the <strong>team-by-team</strong> view (team name on its own line, then rows of <code style={{ background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>N. Player (TEAM - POS){isSnake ? '' : ' $cost'}</code>) or the flat <strong>Picks</strong> list (every selection on one line, ending with the fantasy team). Players kept from prior years (marked with K) will be flagged{isSnake ? ', and you can set each player’s current contract year on the preview step' : ''}.
          </div>
          {error && (
            <div style={{ padding: '10px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger, lineHeight: 1.5 }}>{error}</div>
          )}
          <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
            placeholder={"Anthony!!!\nBudget  $200\n1.\t(22)\tCooper Flagg (DAL - PG,SG,SF)\t$30\n2.\t(31)\tReed Sheppard (HOU - PG,SG)\t$9\n...\nUnused $60\n\nKeanu Reaves\nBudget $200\n1. (2) Tari Eason (HOU - SG,SF,PF) $9\n..."}
            style={{
              width: '100%', minHeight: 260, background: t.sectionBg, border: `1px solid ${t.border}`,
              borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace',
              outline: 'none', boxSizing: 'border-box', resize: 'vertical',
            }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
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
          {isSnake && (
            <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
              Carry-forward contracts: expand a team to set each player's contract year <em>entering this season</em> (Y1–Y{contractLen}, defaults to Y1). A player entering Y{contractLen} is in their final keepable year.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {preview.map((p, i) => {
              const isExpanded = !!expandedTeams[p.name];
              return (
              <div key={i} style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{p.players.length} players · {p.players.filter(pl => pl.isKeeper).length} marked as carry-over keepers</div>
                    {!mapping[p.name] && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#e85252', marginTop: 2 }}>
                        Unrecognized team name — pick whose team this is. It's remembered for future imports.
                      </div>
                    )}
                  </div>
                  {isSnake && (
                    <button onClick={() => setExpandedTeams({ ...expandedTeams, [p.name]: !isExpanded })}
                      style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {isExpanded ? 'Hide players ▾' : 'Set contract years (carry-forward) ▸'}
                    </button>
                  )}
                  <select value={mapping[p.name] || ''} onChange={e => setMapping({ ...mapping, [p.name]: e.target.value })}
                    style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${mapping[p.name] ? accentColor : '#e85252'}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', minWidth: 140 }}>
                    <option value="">— Pick a team —</option>
                    {league.teams.map(tm => (
                      <option key={tm.id} value={tm.id}>{tm.name}</option>
                    ))}
                  </select>
                </div>
                {isSnake && isExpanded && (
                  <div style={{ borderTop: `1px solid ${t.divider}`, padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.4, padding: '2px 0 4px' }}>
                      Set each player's current contract year entering this season.
                    </div>
                    {p.players.map((pl, pi) => {
                      const y = entryYearFor(p.name, pl);
                      return (
                        <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: t.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pl.player}
                            {pl.isKeeper && <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, marginLeft: 6 }}>K</span>}
                          </span>
                          <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enters</span>
                          <select value={y} onChange={e => setEntryYears({ ...entryYears, [yearKey(p.name, pl.player)]: parseInt(e.target.value) })}
                            style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${y >= contractLen ? '#e85252' : t.border}`, borderRadius: 6, padding: '4px 6px', fontSize: 12, color: y >= contractLen ? '#e85252' : t.textPrimary, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
                            {Array.from({ length: contractLen }, (_, yi) => yi + 1).map(v => (
                              <option key={v} value={v}>Y{v}/{contractLen}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button onClick={() => setPreview(null)} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>← Back to paste</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={doImport} disabled={Object.values(mapping).filter(Boolean).length === 0} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Import {Object.values(mapping).filter(Boolean).length} team{Object.values(mapping).filter(Boolean).length === 1 ? '' : 's'}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Modal wrapper — DORMANT path only ────────────────────────────────────────
// The live entry point runs DraftImportFlow inline on the Last Draft page.
// This wrapper survives for the unrouted SeasonSetupWizard path (SourcesTab),
// keeping its result step so that flow still ends on a summary, not silence.
function DraftImportModal({ league, accentColor, isDark, onImport, onClose }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';
  const [result, setResult] = React.useState(null); // { teams: [{name, players, withContracts, withPrices}] }

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
            {result && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Import complete</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 22px' }}>
          {result ? (() => {
            const totalPlayers = result.teams.reduce((s, tm) => s + tm.players, 0);
            const check = <span style={{ color: '#4caf7d', fontWeight: 700 }}>✓</span>;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                  {check} {totalPlayers} player{totalPlayers === 1 ? '' : 's'} imported across {result.teams.length} team{result.teams.length === 1 ? '' : 's'}
                </div>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  {result.teams.map((tm, i) => (
                    <div key={tm.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: t.sectionBg, borderBottom: i < result.teams.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tm.name}</span>
                      <span style={{ fontSize: 12, color: t.textSecondary, whiteSpace: 'nowrap' }}>{tm.players} player{tm.players === 1 ? '' : 's'}</span>
                      <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: 'nowrap' }}>
                        · {tm.withContracts} {isSnake ? 'with contracts' : 'kept before'}
                      </span>
                      {tm.withPrices != null && (
                        <span style={{ fontSize: 12, color: t.textMuted, whiteSpace: 'nowrap' }}>· {tm.withPrices} with prices</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                  {isSnake
                    ? "These players now seed each team's eligible keeper pool with their contract years and draft rounds."
                    : "These players now seed each team's eligible keeper pool — next-season keeper costs are calculated from the imported prices."}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={onClose} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
                </div>
              </div>
            );
          })() : (
            <DraftImportFlow league={league} accentColor={accentColor} isDark={isDark}
              onImport={onImport} onComplete={setResult} onCancel={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DraftImportModal, parseDraftResults });

export { parseDraftResults, DraftImportFlow, DraftImportModal };
