import React from 'react';
import { Download, DollarSign, Check } from 'lucide-react';
import { isAuctionCost } from '../lib/keeperRules.js';
import { makeTheme, tokens, ConfirmBody } from '../components.jsx';
import { DraftImportModal } from './ImportTab.jsx';
import { priorKeepersImpact, draftGuardLines } from '../lib/importGuard.js';
import { RosterImportModal } from './RosterImportTab.jsx';

// Centralized "Data Sources" panel — used inside the season setup step.
// Shows progress on all the imports a commissioner needs to do before assigning keepers:
//   - Snake: pre-playoff rosters + prior contracts
//   - Auction: pre-playoff rosters + prior draft results
// Each section is collapsible and clicking through opens the relevant modal.

function PrevContractsPasteModal({ league, accentColor, isDark, onImport, onClose }) {
  const t = makeTheme(isDark);
  const [text, setText] = React.useState('');
  const [preview, setPreview] = React.useState(null);
  const [error, setError] = React.useState(null);
  // A priorKeepersImpact while the overwrite confirm is showing — a step
  // inside this modal, never a second overlay.
  const [guard, setGuard] = React.useState(null);

  // Parser for the "Team | Player | Contract Awarded | Expires After" format
  // (matches the user's Disney on Ice spreadsheet structure).
  function parse(raw) {
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const parts = line.split(/\t|,(?!\s*\d{4})/).map(s => s.trim()).filter(Boolean);
      if (parts.length < 3) continue;
      // Skip header
      if (/team\s*name/i.test(parts[0]) && /player/i.test(parts[1])) continue;
      const [team, player, awarded, expires] = parts;
      if (!team || !player) continue;
      // Parse "3 year" or "3" -> 3
      const lengthMatch = (awarded || '').match(/(\d+)/);
      const contractLength = lengthMatch ? parseInt(lengthMatch[1], 10) : 3;
      // Parse expires "2025-2026" or "2025-26" -> compute current year and contractYear
      // If we know it's a 3-year contract expiring 2025-2026, and "current" setup season is league.season,
      // we can derive what year of the contract they're on going INTO the season we're setting up.
      const expiresFirstYear = (() => {
        const m = (expires || '').match(/(\d{4})/);
        return m ? parseInt(m[1], 10) : null;
      })();
      const seasonFirstYear = (() => {
        const m = (league.season || '').match(/(\d{4})/);
        return m ? parseInt(m[1], 10) : null;
      })();
      // contractYear going INTO this season = contractLength - (expiresFirstYear - seasonFirstYear) - 1
      // e.g. 3-year contract expires 2025-2026, setting up 2026-27 (firstYear 2026):
      //   contractYear = 3 - (2025-2026) -1 = 3 - 1 - 1 = ... actually let me think:
      // expiresFirstYear=2025 means last playing season is 2025-26. Going into 2026-27 they're done -> expired.
      // expiresFirstYear=2026 means last playing season is 2026-27. Going into 2026-27 they have 1 yr left of 3, so contractYear=3 (it's their final/current year).
      // expiresFirstYear=2027 means going into 2026-27 they have 2 yrs left of 3, contractYear=2.
      // So: yearsRemainingThisSeason = expiresFirstYear - seasonFirstYear + 1 (if expires>=season, else negative)
      // contractYear = contractLength - yearsRemainingThisSeason + 1
      let contractYear = null, expired = false;
      if (expiresFirstYear != null && seasonFirstYear != null) {
        const yearsRemaining = expiresFirstYear - seasonFirstYear + 1;
        if (yearsRemaining <= 0) {
          expired = true;
          contractYear = contractLength; // mark as last year
        } else {
          contractYear = contractLength - yearsRemaining + 1;
        }
      }
      rows.push({
        team: team.trim(),
        player: player.trim(),
        awarded: awarded?.trim() || '',
        expires: expires?.trim() || '',
        contractLength,
        contractYear: contractYear ?? 1,
        expired,
      });
    }
    return rows;
  }

  function doPreview() {
    setError(null);
    const parsed = parse(text);
    if (parsed.length === 0) {
      setError("Couldn't parse any contracts. Expected 4 columns: Team, Player, Contract Awarded, Expires After (tab- or comma-separated).");
      return;
    }
    setPreview(parsed);
  }

  function doImport() {
    if (!preview) return;
    // This paste REPLACES priorKeepers for every team it names, and it writes
    // contract fields only — a drafted price on an existing row is dropped
    // outright. Same guard as the other replace-the-list imports.
    const impact = priorKeepersImpact(league, teamIdsInPreview());
    if (impact.hasImpact) { setGuard(impact); return; }
    applyImport();
  }

  // Team matching is by name here (this surface predates the yahooTeamMap
  // path), so the guard resolves ids the same way doImport does.
  function teamIdsInPreview() {
    const names = new Set((preview || []).map(row => (row.team || '').toLowerCase()));
    return (league.teams || []).filter(tm => names.has(tm.name.toLowerCase())).map(tm => tm.id);
  }

  function applyImport() {
    setGuard(null);
    // Group by team and merge into priorKeepers
    const byTeam = {};
    preview.forEach(row => {
      const key = row.team.toLowerCase();
      (byTeam[key] = byTeam[key] || []).push({
        player: row.player,
        contractYear: row.contractYear,
        contractLength: row.contractLength,
        expired: row.expired || undefined,
      });
    });
    // Match team names case-insensitively
    const newTeams = (league.teams || []).map(tm => {
      const matchKey = tm.name.toLowerCase();
      const rows = byTeam[matchKey];
      if (!rows) return tm;
      return { ...tm, priorKeepers: rows };
    });
    onImport({ ...league, teams: newTeams });
    onClose();
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>Import Prior Contracts</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
              Paste your contracts spreadsheet (e.g. last year's tab from your Excel/Sheets file). Format: <code style={{ background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>Team\tPlayer\tContract Awarded\tExpires After</code>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 22px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Overwrite confirm as a STEP inside this modal (one-modal-max). */}
          {guard && (
            <ConfirmBody
              isDark={isDark} accentColor={accentColor} danger
              title="Replace the contracts on file?"
              intro={`This paste replaces last season's records for ${guard.teams.length} team${guard.teams.length === 1 ? '' : 's'}, and it carries no prices — any drafted price on those rows goes with them. There's no undo.`}
              lines={draftGuardLines(guard)}
              note="Cancel leaves everything as it is — your paste stays on the preview step."
              confirmLabel="Replace contracts"
              cancelLabel="← Back to preview"
              onConfirm={applyImport}
              onCancel={() => setGuard(null)}
            />
          )}
          {!guard && !preview && (
            <>
              <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                placeholder={"Mark\tTim Stützle\t3 year\t2025-2026\nMark\tMatthew Tkachuk\t3 year\t2026-2027\nMark\tLane Hutson\t3 year\t2027-2028\nAmar\tConnor Hellebuyck\t3 year\t2027-2028\n..."}
                style={{ width: '100%', minHeight: 240, background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              {error && <div style={{ padding: '10px 12px', background: 'rgba(232,82,82,0.08)', border: '1px solid rgba(232,82,82,0.3)', borderRadius: 6, fontSize: 12, color: '#e85252' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onClose} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
                <button onClick={doPreview} disabled={!text.trim()}
                  style={{ background: text.trim() ? accentColor : t.sectionBg, color: text.trim() ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                  Preview →
                </button>
              </div>
            </>
          )}

          {!guard && preview && (() => {
            const grouped = {};
            preview.forEach(r => { (grouped[r.team] = grouped[r.team] || []).push(r); });
            const teamNames = Object.keys(grouped);
            const matchedTeams = teamNames.filter(name => (league.teams || []).some(tm => tm.name.toLowerCase() === name.toLowerCase()));
            const unmatched = teamNames.filter(name => !(league.teams || []).some(tm => tm.name.toLowerCase() === name.toLowerCase()));
            return (
              <>
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                  Parsed <strong>{preview.length}</strong> contract{preview.length === 1 ? '' : 's'} across <strong>{teamNames.length}</strong> teams.
                  {matchedTeams.length > 0 && <span style={{ color: tokens.success }}> {matchedTeams.length} matched.</span>}
                  {unmatched.length > 0 && <span style={{ color: '#e85252' }}> {unmatched.length} unmatched: {unmatched.join(', ')}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
                  {teamNames.map(name => {
                    const matched = (league.teams || []).find(tm => tm.name.toLowerCase() === name.toLowerCase());
                    return (
                      <div key={name} style={{ padding: '10px 12px', background: t.sectionBg, border: `1px solid ${matched ? t.border : 'rgba(232,82,82,0.4)'}`, borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{name}</span>
                          {matched ? (
                            <span style={{ fontSize: 9, color: tokens.success, background: tokens.successBg, padding: '1px 6px', borderRadius: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>matched</span>
                          ) : (
                            <span style={{ fontSize: 9, color: '#e85252', background: 'rgba(232,82,82,0.12)', padding: '1px 6px', borderRadius: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>no match</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {grouped[name].map((r, i) => (
                            <div key={i} style={{ fontSize: 11, color: t.textBody, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ flex: 1 }}>{r.player}</span>
                              <span style={{ color: r.expired ? '#e85252' : t.textMuted }}>
                                {r.expired ? 'Expired' : `Y${r.contractYear}/${r.contractLength}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <button onClick={() => setPreview(null)} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>← Back to paste</button>
                  <button onClick={doImport} disabled={matchedTeams.length === 0}
                    style={{ background: matchedTeams.length > 0 ? accentColor : t.sectionBg, color: matchedTeams.length > 0 ? '#fff' : t.textMuted, border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: matchedTeams.length > 0 ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                    Import {matchedTeams.length} team{matchedTeams.length === 1 ? '' : 's'}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function DataSourcesPanel({ league, accentColor, isDark, onUpdateLeague, defaultExpanded }) {
  const t = makeTheme(isDark);
  const [expanded, setExpanded] = React.useState(defaultExpanded !== false);
  const [showRosterImport, setShowRosterImport] = React.useState(null); // teamId or 'new'
  const [showDraftImport, setShowDraftImport] = React.useState(false);
  const [showContractsImport, setShowContractsImport] = React.useState(false);

  const teams = league.teams || [];
  const totalTeams = teams.length;
  const rostersLoaded = teams.filter(tm => (tm.roster || []).length > 0).length;
  const contractsLoaded = teams.filter(tm => (tm.priorKeepers || []).length > 0).length;
  const draftLoaded = teams.filter(tm => (tm.priorKeepers || []).some(p => p.keptFor != null)).length;

  const isSnake = !isAuctionCost(league);
  const isAuction = isAuctionCost(league);

  // Build source list per league type. Prior contracts are NOT in the renew flow —
  // they carry forward automatically from last season's keeper assignments.
  const sources = [];
  if (isAuction) {
    sources.push({
      key: 'draft',
      Icon: DollarSign,
      label: "Last season's draft",
      desc: 'Sets each kept player\'s base cost; +$' + ((league.auctionRules?.costIncreasePerYear) || 5) + '/yr per keeper rule.',
      loaded: draftLoaded,
      total: totalTeams,
      action: () => setShowDraftImport(true),
      actionLabel: draftLoaded > 0 ? 'Re-import' : 'Paste draft',
    });
  }
  sources.push({
    key: 'rosters',
    Icon: Download,
    label: "Last season's rosters",
    desc: 'Who was on each team. Used to verify keeper eligibility.',
    loaded: rostersLoaded,
    total: totalTeams,
    action: null,
    actionLabel: null,
  });

  function pct(n, total) { return total > 0 ? Math.round((n / total) * 100) : 0; }

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', background: t.sectionBg, border: 'none', borderBottom: expanded ? `1px solid ${t.divider}` : 'none', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
        <Download size={16} strokeWidth={1.5} color={t.textSecondary} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Data Sources</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
            {sources.map(s => `${s.label}: ${s.loaded}/${s.total}`).join('  ·  ')}
          </div>
        </div>
        <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 700 }}>{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sources.filter(s => s.key !== 'rosters').map(s => {
            const p = pct(s.loaded, s.total);
            const done = s.loaded > 0;
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: done ? tokens.successBg : t.sectionBg, border: `1px solid ${done ? tokens.successBorder : t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? tokens.success : t.textSecondary }}>{done ? <Check size={14} strokeWidth={1.75} /> : <s.Icon size={14} strokeWidth={1.5} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: done ? tokens.success : t.textMuted, fontWeight: 600 }}>{s.loaded}/{s.total} teams</span>
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{s.desc}</div>
                </div>
                <button onClick={s.action}
                  style={{ background: done ? 'none' : accentColor, color: done ? t.textSecondary : '#fff', border: done ? `1px solid ${t.border}` : 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {s.actionLabel}
                </button>
              </div>
            );
          })}

          {/* Rosters: per-team grid */}
          {(() => {
            const s = sources.find(x => x.key === 'rosters');
            const done = s.loaded === s.total;
            return (
              <div style={{ borderTop: `1px solid ${t.dividerFaint}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: done ? tokens.successBg : t.sectionBg, border: `1px solid ${done ? tokens.successBorder : t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? tokens.success : t.textSecondary }}>{done ? <Check size={14} strokeWidth={1.75} /> : <s.Icon size={14} strokeWidth={1.5} />}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: done ? tokens.success : t.textMuted, fontWeight: 600 }}>{s.loaded}/{s.total} teams</span>
                    </div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{s.desc}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, paddingLeft: 44 }}>
                  {teams.map(tm => {
                    const hasRoster = (tm.roster || []).length > 0;
                    return (
                      <button key={tm.id} onClick={() => setShowRosterImport(tm.id)}
                        title={hasRoster ? `Re-import ${tm.name}'s roster` : `Import ${tm.name}'s roster`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: hasRoster ? tokens.successBg : t.sectionBg,
                          border: `1px solid ${hasRoster ? tokens.successBorder : t.border}`,
                          borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                          transition: 'border-color 0.12s, background 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}10`; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = hasRoster ? tokens.successBorder : t.border; e.currentTarget.style.background = hasRoster ? tokens.successBg : t.sectionBg; }}>
                        {hasRoster ? (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M3 8.5L6.5 12L13 4.5" stroke={tokens.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M8 11V3M8 3L4.5 6.5M8 3L11.5 6.5" stroke={t.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2.5 11.5V13.5C2.5 13.7761 2.72386 14 3 14H13C13.2761 14 13.5 13.7761 13.5 13.5V11.5" stroke={t.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tm.name}</span>
                        <span style={{ fontSize: 10, color: hasRoster ? tokens.success : t.textMuted, fontWeight: 700, flexShrink: 0 }}>
                          {hasRoster ? `${tm.roster.length}` : 'Upload'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {showRosterImport && (
        <RosterImportModal
          league={league}
          initialTeamId={showRosterImport === 'new' ? undefined : showRosterImport}
          accentColor={accentColor} isDark={isDark}
          onImport={onUpdateLeague}
          onClose={() => setShowRosterImport(null)} />
      )}
      {showDraftImport && (
        <DraftImportModal league={league} accentColor={accentColor} isDark={isDark} onImport={onUpdateLeague} onClose={() => setShowDraftImport(false)} />
      )}
      {showContractsImport && (
        <PrevContractsPasteModal league={league} accentColor={accentColor} isDark={isDark} onImport={onUpdateLeague} onClose={() => setShowContractsImport(false)} />
      )}
    </div>
  );
}

Object.assign(window, { DataSourcesPanel, PrevContractsPasteModal });

export { PrevContractsPasteModal, DataSourcesPanel };
