import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { makeTheme, SPORT_CONFIG, DRAFT_LABEL, SportBadge, SportLogo, DraftBadge, StatusPill, getLeagueStats, HScrollRow, tokens } from './components.jsx';
import { OverviewTab } from './tabs/OverviewTab.jsx';
import { LotteryTab } from './tabs/LotteryTab.jsx';
import { PlayersTab } from './tabs/PlayersTab.jsx';
import { DraftImportModal } from './tabs/ImportTab.jsx';
import { RosterImportModal } from './tabs/RosterImportTab.jsx';
import { startNewSeason } from './lib/season.js';

// League Detail — shell + PayoutsTab + SettingsTab

function TabBar({ tabs, active, basePath, accentColor, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ borderBottom: `1px solid ${t.border}`, marginBottom: 0 }}>
      <HScrollRow isDark={isDark} t={t} gap={0}>
      {tabs.map(tab => (
        <Link key={tab.id} to={`${basePath}/${tab.id}`} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '9px 16px', fontSize: '12px', fontWeight: 600,
          color: active === tab.id ? accentColor : t.textMuted,
          borderBottom: active === tab.id ? `2px solid ${accentColor}` : '2px solid transparent',
          marginBottom: -1, transition: 'all 0.15s', letterSpacing: '0.01em',
          display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
          textDecoration: 'none',
        }}>
          {tab.label}
          {tab.badge != null && (
            <span style={{
              background: active === tab.id ? accentColor : t.badgeBg,
              color: active === tab.id ? '#fff' : t.badgeColor,
              borderRadius: 20, fontSize: '10px', fontWeight: 700,
              padding: '1px 6px', minWidth: 18, textAlign: 'center',
            }}>{tab.badge}</span>
          )}
        </Link>
      ))}
      </HScrollRow>
    </div>
  );
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function PayoutsTab({ league, isDark, onUpdateLeague, accentColor }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const teamCount = league.teamCount || teams.length;
  const liveBuyIn = league.buyIn || 0;
  const liveTotalPool = liveBuyIn * teamCount;
  const paid = teams.filter(tm => tm.paid).length;
  const collected = paid * liveBuyIn;

  const [expandedTeam, setExpandedTeam] = React.useState(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [extraRows, setExtraRows] = React.useState([]); // session-only places added during this edit

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

  // Active data: draft when editing, league otherwise
  const buyIn = isEditing ? draft.buyIn : liveBuyIn;
  const standings = isEditing ? draft.standings : (league.payouts?.standings || []);
  const other = isEditing ? draft.other : (league.payouts?.other || []);
  const payoutNote = isEditing ? draft.payoutNote : (league.payoutNote || '');
  const totalPool = buyIn * teamCount;
  const sumStandings = standings.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const sumOther = other.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const allocated = sumStandings + sumOther;
  const remaining = totalPool - allocated;

  const fieldStyle = {
    background: isDark ? '#161a22' : '#f7f9fc',
    border: `1px solid ${t.border}`,
    borderRadius: 5,
    padding: '5px 8px',
    fontSize: 13,
    color: t.textPrimary,
    fontFamily: 'inherit',
    outline: 'none',
  };

  // Payments handlers (live, never drafted)
  function updateTeam(teamId, patch) {
    const newTeams = teams.map(tm => tm.id === teamId ? { ...tm, ...patch } : tm);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
  }
  function togglePaid(team) {
    if (team.paid) {
      updateTeam(team.id, { paid: false, paidDate: null, paidNote: null });
    } else {
      updateTeam(team.id, { paid: true, paidDate: team.paidDate || todayStr() });
      setExpandedTeam(team.id);
    }
  }

  // Edit lifecycle
  function startEdit() {
    setDraft({
      buyIn: liveBuyIn,
      standings: (league.payouts?.standings || []).map(p => ({ ...p })),
      other: (league.payouts?.other || []).map(p => ({ ...p })),
      payoutNote: league.payoutNote || '',
    });
    setExtraRows([]);
    setIsEditing(true);
  }
  function cancel() {
    setIsEditing(false);
    setDraft(null);
    setExtraRows([]);
  }
  function save() {
    onUpdateLeague({
      ...league,
      buyIn: draft.buyIn,
      totalPool: draft.buyIn * teamCount,
      payouts: { standings: draft.standings, other: draft.other },
      payoutNote: draft.payoutNote,
    });
    setIsEditing(false);
    setDraft(null);
    setExtraRows([]);
  }

  // Draft mutators
  function setDraftBuyIn(v) {
    setDraft(d => ({ ...d, buyIn: Number(v) || 0 }));
  }
  function setDraftCell(place, phase, raw) {
    setDraft(d => {
      const std = d.standings.slice();
      const idx = std.findIndex(p => p.place === place && p.phase === phase);
      if (raw === '' || raw == null) {
        if (idx >= 0) std.splice(idx, 1);
      } else {
        const n = Number(raw);
        if (Number.isNaN(n)) return d;
        if (idx >= 0) std[idx] = { ...std[idx], amount: n };
        else std.push({ place, phase, amount: n });
      }
      return { ...d, standings: std };
    });
  }
  function removeRow(place) {
    setDraft(d => ({ ...d, standings: d.standings.filter(p => p.place !== place) }));
    setExtraRows(rows => rows.filter(p => p !== place));
  }
  function addRow(place) {
    setExtraRows(rows => rows.includes(place) ? rows : [...rows, place]);
  }
  function setDraftOther(idx, patch) {
    setDraft(d => ({ ...d, other: d.other.map((p, i) => i === idx ? { ...p, ...patch } : p) }));
  }
  function addDraftOther() {
    setDraft(d => ({ ...d, other: [...d.other, { label: '', amount: 0 }] }));
  }
  function removeDraftOther(idx) {
    setDraft(d => ({ ...d, other: d.other.filter((_, i) => i !== idx) }));
  }
  function setDraftPayoutNote(v) {
    setDraft(d => ({ ...d, payoutNote: v }));
  }

  function amountColor(v) {
    const n = Number(v) || 0;
    if (n === 0) return t.textPrimary;
    return n < 0 ? t.danger : t.success;
  }
  function fmtAmount(v) {
    const n = Number(v) || 0;
    return n < 0 ? `-$${Math.abs(n).toLocaleString()}` : `$${n.toLocaleString()}`;
  }

  // Visible places: places with data, plus session-added rows (edit mode only)
  const placeSet = new Set(standings.map(p => p.place));
  if (isEditing) extraRows.forEach(p => placeSet.add(p));
  const visiblePlaces = [...placeSet].sort((a, b) => a - b);

  // Addable places (edit mode picker): 1..teamCount minus already-shown
  const cap = teamCount || 20;
  const addablePlaces = [];
  for (let p = 1; p <= cap; p++) if (!placeSet.has(p)) addablePlaces.push(p);

  function cellAmount(place, phase) {
    const row = standings.find(p => p.place === place && p.phase === phase);
    return row ? row.amount : null;
  }

  const sectionHeading = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textSecondary };
  const columnHeader = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textMuted, textAlign: 'right' };
  const gridCols = isEditing
    ? '1fr 110px 110px 28px'    // place | reg | playoffs | × (or spacer)
    : '1fr 110px 110px';        // place | reg | playoffs

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Prize Structure</div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancel} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={save} style={{ background: accentColor, border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
            </div>
          ) : (
            <button onClick={startEdit} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
          )}
        </div>

        {/* Buy-in */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '14px', color: t.textBody, flex: 1 }}>Buy-in (per team)</span>
          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: t.textMuted }}>$</span>
              <input type="number" step="25" value={buyIn || ''} onChange={e => setDraftBuyIn(e.target.value)}
                style={{ ...fieldStyle, width: 80, textAlign: 'right', fontWeight: 700 }} />
            </div>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>${buyIn.toLocaleString()}</span>
          )}
        </div>
        <div style={{ padding: '8px 20px 16px', fontSize: 11, color: t.textMuted }}>
          × {teamCount} teams = <span style={{ color: t.textSecondary, fontWeight: 700 }}>${totalPool.toLocaleString()}</span> total pool
        </div>

        {/* Standings grid */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ ...sectionHeading, padding: '16px 0 12px' }}>Standings Payouts</div>
          {visiblePlaces.length === 0 && !isEditing && (
            <div style={{ color: t.textMuted, fontSize: '12px', padding: '4px 0 16px' }}>
              No standings payouts configured.
            </div>
          )}
          {(visiblePlaces.length > 0 || isEditing) && (
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 8, rowGap: 12, alignItems: 'center' }}>
              <span />
              <span style={columnHeader}>Regular Season</span>
              <span style={columnHeader}>Playoffs</span>
              {isEditing && <span />}
              {visiblePlaces.map(place => {
                const reg = cellAmount(place, 'regular');
                const pf = cellAmount(place, 'playoffs');
                return (
                  <React.Fragment key={place}>
                    <span style={{ fontSize: 13, color: t.textBody }}>{ordinal(place)}</span>
                    {isEditing ? (
                      <>
                        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, color: t.textMuted }}>$</span>
                          <input type="number" step="25" value={reg ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') { setDraftCell(place, 'regular', ''); return; }
                              const n = Number(raw);
                              if (Number.isNaN(n)) return;
                              setDraftCell(place, 'regular', n);
                            }}
                            placeholder="—"
                            style={{ ...fieldStyle, width: 78, textAlign: 'right', fontWeight: reg != null && reg !== 0 ? 700 : 500, color: amountColor(reg) }} />
                        </div>
                        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, color: t.textMuted }}>$</span>
                          <input type="number" step="25" value={pf ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') { setDraftCell(place, 'playoffs', ''); return; }
                              const n = Number(raw);
                              if (Number.isNaN(n)) return;
                              setDraftCell(place, 'playoffs', n);
                            }}
                            placeholder="—"
                            style={{ ...fieldStyle, width: 78, textAlign: 'right', fontWeight: pf != null && pf !== 0 ? 700 : 500, color: amountColor(pf) }} />
                        </div>
                        <button onClick={() => removeRow(place)} title="Remove row"
                          style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px', fontFamily: 'inherit', justifySelf: 'center' }}>×</button>
                      </>
                    ) : (
                      <>
                        <span style={{ justifySelf: 'end', fontSize: 13, fontWeight: reg != null && reg !== 0 ? 700 : 500, color: reg == null ? t.textMuted : amountColor(reg) }}>
                          {reg == null ? '—' : fmtAmount(reg)}
                        </span>
                        <span style={{ justifySelf: 'end', fontSize: 13, fontWeight: pf != null && pf !== 0 ? 700 : 500, color: pf == null ? t.textMuted : amountColor(pf) }}>
                          {pf == null ? '—' : fmtAmount(pf)}
                        </span>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
              {isEditing && (
                addablePlaces.length > 0 ? (
                  <div style={{ gridColumn: '1 / -1', paddingTop: 4 }}>
                    {visiblePlaces.length === 0 && (
                      <div style={{ color: t.textMuted, fontSize: '12px', paddingBottom: 8 }}>
                        Pick a place to add your first payout.
                      </div>
                    )}
                    <select value=""
                      onChange={e => { if (e.target.value) { addRow(Number(e.target.value)); e.target.value = ''; } }}
                      style={{ ...fieldStyle, cursor: 'pointer', padding: '6px 8px', marginLeft: -9 }}>
                      <option value="">+ Add place…</option>
                      {addablePlaces.map(p => (
                        <option key={p} value={p}>{ordinal(p)}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ gridColumn: '1 / -1', paddingTop: 4, fontSize: 12, color: t.textMuted }}>
                    All places added.
                  </div>
                )
              )}
            </div>
          )}
          <div style={{ height: 20 }} />
        </div>

        {/* Other Payouts */}
        {(isEditing || other.length > 0) && (
          <div style={{ padding: '0 20px', borderTop: `1px solid ${t.divider}` }}>
            <div style={{ ...sectionHeading, padding: '16px 0 12px' }}>Other Payouts</div>
            {!isEditing && other.length === 0 && (
              <div style={{ color: t.textMuted, fontSize: '12px', padding: '4px 0 16px' }}>None.</div>
            )}
            {isEditing && other.length === 0 && (
              <div style={{ color: t.textMuted, fontSize: '12px', padding: '4px 0 12px' }}>
                For prizes that don't map to place×phase — weekly winners, sweep bonuses, etc.
              </div>
            )}
            {other.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < other.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                {isEditing ? (
                  <>
                    <input type="text" value={p.label} onChange={e => setDraftOther(i, { label: e.target.value })} placeholder="e.g. Weekly high score — $5/week"
                      style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
                    <span style={{ fontSize: 13, color: (Number(p.amount) || 0) < 0 ? t.danger : t.textMuted }}>$</span>
                    <input type="number" step="25" value={p.amount}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') { setDraftOther(i, { amount: 0 }); return; }
                        const n = Number(raw);
                        if (Number.isNaN(n)) return;
                        setDraftOther(i, { amount: n });
                      }}
                      style={{ ...fieldStyle, width: 80, textAlign: 'right', fontWeight: 700, color: amountColor(Number(p.amount) || 0) }} />
                    <button onClick={() => removeDraftOther(i)} title="Remove payout"
                      style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px', fontFamily: 'inherit' }}>×</button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 13, color: t.textBody, flex: 1, minWidth: 0 }}>{p.label || <em style={{ color: t.textMuted }}>(no label)</em>}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: amountColor(Number(p.amount) || 0) }}>
                      {fmtAmount(Number(p.amount) || 0)}
                    </span>
                  </>
                )}
              </div>
            ))}
            {isEditing && (
              <div style={{ padding: '12px 0 16px' }}>
                <button onClick={addDraftOther}
                  style={{ background: 'none', border: `1px dashed ${t.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: accentColor, cursor: 'pointer', fontFamily: 'inherit' }}>
                  + Add Other Payout
                </button>
              </div>
            )}
          </div>
        )}

        {/* Payout note */}
        {(isEditing || payoutNote) && (
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${t.divider}` }}>
            {isEditing ? (
              <input type="text" value={payoutNote} onChange={e => setDraftPayoutNote(e.target.value)}
                placeholder="Optional note about the payout structure…"
                style={{ ...fieldStyle, width: '100%', boxSizing: 'border-box' }} />
            ) : (
              <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic' }}>{payoutNote}</div>
            )}
          </div>
        )}

        {/* Totals */}
        <div style={{ margin: '0 20px', borderTop: `1px solid ${t.divider}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 6px', alignItems: 'baseline' }}>
            <span style={{ fontSize: '13px', color: t.textMuted }}>Total Pool</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: t.textPrimary }}>${totalPool.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', alignItems: 'baseline' }}>
            <span style={{ fontSize: '12px', color: t.textMuted }}>Allocated</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: t.textSecondary }}>${allocated.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 16px', alignItems: 'baseline' }}>
            <span style={{ fontSize: '12px', color: t.textMuted }}>{remaining < 0 ? 'Over-allocated by' : 'Unallocated'}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: remaining < 0 ? t.danger : (remaining === 0 ? t.success : t.textSecondary) }}>
              ${Math.abs(remaining).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Payments</div>
          <div style={{ fontSize: '13px', color: t.textMuted }}>${collected.toLocaleString()} / ${liveTotalPool.toLocaleString()}</div>
        </div>
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ background: t.progressBg, borderRadius: 4, height: 5, marginBottom: 14 }}>
            <div style={{ background: collected >= liveTotalPool ? t.success : t.warning, height: '100%', borderRadius: 4, width: `${Math.min((collected / (liveTotalPool || 1)) * 100, 100)}%`, transition: 'width 0.4s' }}></div>
          </div>
        </div>
        <div style={{ padding: '0 20px' }}>
          {teams.map((team, i) => {
            const isOpen = expandedTeam === team.id;
            return (
              <div key={team.id} style={{ borderBottom: i < teams.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                  <span style={{ fontSize: '14px', color: t.textBody, flex: 1, minWidth: 0 }}>{team.name}</span>
                  {team.paid && (
                    <button onClick={() => setExpandedTeam(isOpen ? null : team.id)} title="Edit payment details"
                      style={{ background: 'none', border: 'none', fontSize: '11px', color: t.textMuted, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{team.paidDate ? fmtDate(team.paidDate) : 'no date'}</span>
                      {team.paidNote && <span style={{ color: accentColor }} title={team.paidNote}>· note</span>}
                      <span>{isOpen ? '▾' : '✎'}</span>
                    </button>
                  )}
                  <button onClick={() => togglePaid(team)}
                    style={{
                      background: team.paid ? t.successBg : t.dangerBg,
                      border: `1px solid ${team.paid ? t.successBorder : t.dangerBorder}`,
                      borderRadius: 6, padding: '4px 10px', fontSize: '12px', fontWeight: 700,
                      color: team.paid ? t.success : t.danger, cursor: 'pointer', fontFamily: 'inherit',
                      minWidth: 70, textAlign: 'center',
                    }}>
                    {team.paid ? `✓ $${liveBuyIn}` : 'Mark Paid'}
                  </button>
                </div>
                {isOpen && team.paid && (
                  <div style={{ display: 'flex', gap: 8, padding: '0 0 12px 0', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <label style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Paid Date</label>
                      <input type="date" value={team.paidDate || ''}
                        onChange={e => updateTeam(team.id, { paidDate: e.target.value })}
                        style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 8px', fontSize: '12px', color: t.textPrimary, fontFamily: 'inherit' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 160 }}>
                      <label style={{ fontSize: 10, color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Note (optional)</label>
                      <input type="text" placeholder="EMT, cash, Venmo…" value={team.paidNote || ''}
                        onChange={e => updateTeam(team.id, { paidNote: e.target.value })}
                        style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 8px', fontSize: '12px', color: t.textPrimary, fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ margin: '0 20px', display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: `1px solid ${t.divider}`, marginTop: 8 }}>
          <span style={{ fontSize: '13px', color: t.textMuted }}>Collected</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: t.textPrimary }}>${collected.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Small input primitives styled to match the existing cards ──────────────
function inputStyle(t, isDark) {
  return {
    background: isDark ? '#161a22' : '#f7f9fc',
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: '13px',
    color: t.textPrimary,
    fontFamily: 'inherit',
    outline: 'none',
    width: 160,
    textAlign: 'left',
    boxSizing: 'border-box',
  };
}

function TextField({ value, onChange, t, isDark, type = 'text', width }) {
  return <input type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} style={{ ...inputStyle(t, isDark), width: width || 160 }} />;
}

function SelectField({ value, onChange, options, t, isDark }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle(t, isDark), cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ToggleField({ value, onChange, t, isDark }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      background: value ? t.success : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)'),
      position: 'relative', transition: 'background 0.15s', padding: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

// EditableCard: header with title + Edit (or Save/Cancel). Body switches between
// the supplied viewRows (read-only) and editRows (form inputs).
function EditableCard({ title, t, isDark, accentColor, viewRows, editRows, onSave, initialDraft }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(initialDraft);

  function startEdit() { setDraft(initialDraft); setIsEditing(true); }
  function cancel() { setIsEditing(false); }
  function save() { onSave(draft); setIsEditing(false); }

  const rows = isEditing ? editRows(draft, setDraft) : viewRows;

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{title}</div>
        {isEditing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={cancel} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={save} style={{ background: accentColor, border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
          </div>
        ) : (
          <button onClick={startEdit} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
        )}
      </div>
      <div style={{ padding: '0 20px' }}>
        {rows.map((row, i) => {
          const showControl = isEditing && !row.locked && row.control;
          return (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', padding: '11px 0', borderBottom: i < rows.length - 1 ? `1px solid ${t.dividerFaint}` : 'none', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: '13px', color: t.textSecondary }}>{row.label}</span>
                {row.help && <span style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.35 }}>{row.help}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', minHeight: 22 }}>
                {showControl
                  ? row.control
                  : <span style={{ fontSize: '14px', fontWeight: 600, color: t.textPrimary }}>{row.value}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab({ league, isDark, onUpdateLeague, accentColor }) {
  const t = makeTheme(isDark);
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const [showImport, setShowImport] = React.useState(false);
  const [showRosterImport, setShowRosterImport] = React.useState(null); // teamId or 'new'
  const [showRolloverConfirm, setShowRolloverConfirm] = React.useState(false);
  const rostersLoaded = (league.teams || []).filter(tm => tm.roster && tm.roster.length > 0).length;
  const totalTeams = league.teamCount || (league.teams || []).length;

  function rolloverSeason() {
    onUpdateLeague(startNewSeason(league));
    setShowRolloverConfirm(false);
  }

  // ── Keeper Rules card (also surfaces league-level identity at the top) ─────
  const isSnake = league.draftType === 'snake';
  const isAuction = league.draftType === 'auction';
  const ar = league.auctionRules || {};

  // Sport and Draft Type are foundational decisions set at league creation and
  // can't be edited mid-league — keeper records would be invalidated. Teams is
  // a structural property that's also locked.
  const leagueIdentityRows = [
    { label: 'Sport', value: sport.label, locked: true },
    { label: 'Draft Type', value: DRAFT_LABEL[league.draftType] || league.draftType, locked: true },
    { label: 'Teams', value: league.teamCount || league.teams.length, locked: true },
  ];

  const rulesView = [
    ...leagueIdentityRows,
    { label: 'Season', value: league.season },
    { label: 'Keeper Slots', value: `${league.minKeepers === 0 ? '0–' : ''}${league.keeperSlots} per team` },
    { label: 'Min Keepers Required', value: league.minKeepers || 0, help: 'Minimum number of keepers each team must declare. 0 = optional.' },
    ...(isSnake ? [
      { label: 'Contract Length', value: `${league.contractYears} years`, help: 'How many years a keeper can be held before returning to the draft pool.' },
      { label: 'Contracts Required', value: league.contractsRequired ? 'All slots must be filled' : 'Optional', help: 'Whether teams must fill every keeper slot.' },
      { label: 'Contracts on Trade', value: (league.contractsFollowTrade ?? true) ? 'Travel with the player' : 'Renewable by new owner', help: 'When a contract holder is traded, does the contract travel with the player or can the new owner renegotiate?' },
    ] : []),
    ...(isAuction ? [
      { label: 'Cost Increase per Year', value: `+$${ar.costIncreasePerYear || 0}`, help: "How much a keeper's salary increases each year you keep them." },
      { label: 'Undrafted Player Cost', value: `$${ar.undraftedStartCost || 0} first year`, help: "First-year cost for keeping a player who wasn't drafted last season." },
    ] : []),
  ];
  const rulesDraftInitial = {
    season: league.season || '',
    keeperSlots: league.keeperSlots || 0,
    minKeepers: league.minKeepers || 0,
    contractYears: league.contractYears || 3,
    contractsRequired: !!league.contractsRequired,
    contractsFollowTrade: league.contractsFollowTrade ?? true,
    costIncreasePerYear: ar.costIncreasePerYear || 0,
    undraftedStartCost: ar.undraftedStartCost || 0,
  };
  function rulesEdit(draft, setDraft) {
    const set = (k, v) => setDraft({ ...draft, [k]: v });
    return [
      ...leagueIdentityRows,
      { label: 'Season', control: <TextField value={draft.season} onChange={v => set('season', v)} t={t} isDark={isDark} /> },
      { label: 'Keeper Slots', control: <TextField type="number" value={draft.keeperSlots} onChange={v => set('keeperSlots', v)} t={t} isDark={isDark} /> },
      { label: 'Min Keepers Required', help: 'Minimum number of keepers each team must declare. 0 = optional.', control: <TextField type="number" value={draft.minKeepers} onChange={v => set('minKeepers', v)} t={t} isDark={isDark} /> },
      ...(isSnake ? [
        { label: 'Contract Length (years)', help: 'How many years a keeper can be held before returning to the draft pool.', control: <TextField type="number" value={draft.contractYears} onChange={v => set('contractYears', v)} t={t} isDark={isDark} /> },
        { label: 'Contracts Required', help: 'Whether teams must fill every keeper slot.', control: <ToggleField value={draft.contractsRequired} onChange={v => set('contractsRequired', v)} t={t} isDark={isDark} /> },
        { label: 'Contracts on Trade', help: 'Travel with the player, or renewable by the new owner?', control: <SelectField value={draft.contractsFollowTrade ? 'follow' : 'renewable'} onChange={v => set('contractsFollowTrade', v === 'follow')} t={t} isDark={isDark}
            options={[{value:'follow',label:'Travel with player'},{value:'renewable',label:'Renewable by new owner'}]} /> },
      ] : []),
      ...(isAuction ? [
        { label: 'Cost Increase per Year ($)', help: "How much a keeper's salary increases each year you keep them.", control: <TextField type="number" value={draft.costIncreasePerYear} onChange={v => set('costIncreasePerYear', v)} t={t} isDark={isDark} /> },
        { label: 'Undrafted Player Cost ($)', help: "First-year cost for keeping a player who wasn't drafted last season.", control: <TextField type="number" value={draft.undraftedStartCost} onChange={v => set('undraftedStartCost', v)} t={t} isDark={isDark} /> },
      ] : []),
    ];
  }
  function saveRules(draft) {
    const next = {
      ...league,
      season: draft.season,
      keeperSlots: draft.keeperSlots,
      minKeepers: draft.minKeepers,
    };
    if (isSnake) {
      next.contractYears = draft.contractYears;
      next.contractsRequired = draft.contractsRequired;
      next.contractsFollowTrade = draft.contractsFollowTrade;
    }
    if (isAuction) {
      next.auctionRules = {
        ...ar,
        costIncreasePerYear: draft.costIncreasePerYear,
        undraftedStartCost: draft.undraftedStartCost,
      };
    }
    onUpdateLeague(next);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EditableCard title="Keeper Rules" t={t} isDark={isDark} accentColor={accentColor}
        viewRows={rulesView} initialDraft={rulesDraftInitial} editRows={rulesEdit} onSave={saveRules} />

      {/* Season rollover */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Season</div>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🔄</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Start New Season</div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>
              Advances {league.season} to {/* show next */}the next year. Current keepers move to last-season history (contract years +1, expired contracts dropped). Keeper submissions reset.
            </div>
          </div>
          <button onClick={() => setShowRolloverConfirm(true)} style={{ flexShrink: 0, background: accentColor, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Start New Season
          </button>
        </div>
      </div>

      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Import Last Year's Draft</div>
          <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>Paste your fantasy site's draft results to pre-populate every team's eligible keeper pool with player names and prices.</div>
        </div>
        <button onClick={() => setShowImport(true)} style={{ flexShrink: 0, background: accentColor, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Paste Draft</button>
      </div>

      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>📥</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pre-Playoff Rosters</div>
              <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 2 }}>Snapshot who was on each team's roster before fantasy playoffs — used to verify keeper eligibility (no waiver pickups).</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: rostersLoaded === totalTeams ? t.success : t.textMuted, fontWeight: 700 }}>
              {rostersLoaded}/{totalTeams} loaded
            </span>
            <button onClick={() => setShowRosterImport('new')}
              style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add Roster
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
          {(league.teams || []).map((tm, i, arr) => {
            const hasRoster = tm.roster && tm.roster.length > 0;
            const rowBorder = i < arr.length - 2 ? `1px solid ${t.dividerFaint}` : 'none';
            return (
              <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 20px', borderBottom: rowBorder, borderRight: i % 2 === 0 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasRoster ? t.success : t.border, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary }}>{tm.name}</div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>
                    {hasRoster ? `${tm.roster.length} players · as of ${tm.rosterAsOfDate || '—'}` : 'No roster on file'}
                  </div>
                </div>
                <button onClick={() => setShowRosterImport(tm.id)}
                  style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 5, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: hasRoster ? t.textSecondary : accentColor, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {hasRoster ? 'Re-import' : 'Import'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {showImport && <DraftImportModal league={league} accentColor={accentColor} isDark={isDark} onImport={onUpdateLeague} onClose={() => setShowImport(false)} />}
      {showRosterImport && <RosterImportModal
        league={league}
        initialTeamId={showRosterImport === 'new' ? undefined : showRosterImport}
        accentColor={accentColor} isDark={isDark}
        onImport={onUpdateLeague} onClose={() => setShowRosterImport(null)} />}

      {showRolloverConfirm && (
        <RolloverConfirmModal league={league} accentColor={accentColor} isDark={isDark}
          onConfirm={rolloverSeason} onCancel={() => setShowRolloverConfirm(false)} />
      )}
    </div>
  );
}

function RolloverConfirmModal({ league, accentColor, isDark, onConfirm, onCancel }) {
  const t = makeTheme(isDark);
  // Count what would happen
  const carriedCount = (league.teams || []).reduce((sum, tm) => sum + (tm.keepers || []).filter(k => {
    if (league.draftType !== 'snake') return true;
    const length = k.contractLength || league.contractYears || 3;
    return (k.contractYear || 0) + 1 <= length;
  }).length, 0);
  const expiredCount = (league.teams || []).reduce((sum, tm) => sum + (tm.keepers || []).filter(k => {
    if (league.draftType !== 'snake') return false;
    const length = k.contractLength || league.contractYears || 3;
    return (k.contractYear || 0) + 1 > length;
  }).length, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, maxWidth: 480, width: '100%', padding: 24 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.textPrimary }}>Start a new season?</h3>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: t.textBody, lineHeight: 1.5 }}>
          This will roll <strong>{league.name}</strong> from <strong>{league.season}</strong> into the next season.
        </p>
        <ul style={{ margin: '14px 0 0', paddingLeft: 18, fontSize: 13, color: t.textBody, lineHeight: 1.7 }}>
          <li><strong>{carriedCount}</strong> keeper contract{carriedCount === 1 ? '' : 's'} will carry forward to next-season history with their year advanced.</li>
          {league.draftType === 'snake' && <li><strong>{expiredCount}</strong> contract{expiredCount === 1 ? ' has' : 's have'} expired and will return to the draft pool.</li>}
          <li>Every team's keeper submissions and paid-status will reset.</li>
          <li>The league status returns to <em>pre-draft</em> and the draft date is cleared.</li>
        </ul>
        <p style={{ margin: '14px 0 0', fontSize: 12, color: t.textMuted }}>You can't undo this from inside the app, but your previous data still lives in browser storage until you make further changes.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: accentColor, border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Start New Season</button>
        </div>
      </div>
    </div>
  );
}

function LeagueView({ league, isDark, onUpdateLeague, activeTab }) {
  const t = makeTheme(isDark);
  const navigate = useNavigate();
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const accentColor = sport.color;
  const stats = getLeagueStats(league);
  const totalTeams = league.teamCount || league.teams.length;
  const basePath = `/league/${league.id}`;

  const tabs = [
    { id: 'overview', label: 'Overview', badge: `${stats.withKeepers}/${totalTeams}` },
    ...(league.draftType === 'snake' ? [{ id: 'lottery', label: 'Lottery' }] : []),
    { id: 'players', label: 'Players' },
    { id: 'payouts', label: 'Payouts & Pay' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 40px' }}>
      <Link to="/" style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 10px', letterSpacing: '0.02em', whiteSpace: 'nowrap', textDecoration: 'none' }}>
        ← All Leagues
      </Link>

      {/* Season-complete banner — prompts the commissioner to roll forward */}
      {league.status === 'completed' && (
        <div style={{ background: 'linear-gradient(135deg, rgba(59,138,230,0.18), rgba(107,77,230,0.12))', border: `1px solid ${accentColor}55`, borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🔄</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>The {league.season} season is complete</div>
            <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>Roll the league forward to set up next season's keepers.</div>
          </div>
          <button onClick={() => navigate(`${basePath}/settings`)} style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Go to Settings
          </button>
        </div>
      )}

      {/* League header card with tabs integrated */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderTop: `3px solid ${accentColor}`, borderRadius: 12, boxShadow: t.cardShadow, marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: `${accentColor}1f`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden',
            }}>
              <SportLogo sport={league.sport} height={32} />
            </div>
            <h1 style={{ margin: 0, ...tokens.typeHeadingPage, color: t.textPrimary, whiteSpace: 'nowrap' }}>{league.name}</h1>
            <SportBadge sport={league.sport} />
            <DraftBadge draftType={league.draftType} />
            <StatusPill status={league.status} />
          </div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center', textAlign: 'center' }}>
            {[
              { label: 'Teams', value: totalTeams },
              { label: 'Keepers', value: `${stats.withKeepers}/${totalTeams}`, accent: stats.withKeepers === totalTeams ? t.success : undefined },
              { label: 'Paid', value: `${stats.paid}/${totalTeams}`, accent: stats.paid < totalTeams ? t.warning : t.success },
              // POOL is universal (prize money). EXPIRING is an additional
              // snake-only stat (count of contracts going back to the draft).
              { label: 'Pool', value: `$${league.totalPool.toLocaleString()}` },
              ...(league.draftType === 'snake'
                ? [{ label: 'Expiring', value: stats.expiring || '—', accent: stats.expiring > 0 ? t.danger : undefined }]
                : []),
            ].map(s => (
              <div key={s.label}>
                <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>{s.label}</div>
                <div style={{ ...tokens.typeNumericInline, color: s.accent || t.textPrimary, lineHeight: 1.1, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${t.divider}`, padding: '0 20px' }}>
          <TabBar tabs={tabs} active={activeTab} basePath={basePath} accentColor={accentColor} isDark={isDark} />
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab league={league} accentColor={accentColor} isDark={isDark} onUpdateLeague={onUpdateLeague} />}
      {activeTab === 'lottery' && league.draftType === 'snake' && <LotteryTab league={league} accentColor={accentColor} isDark={isDark} onUpdateLeague={onUpdateLeague} />}
      {activeTab === 'players' && <PlayersTab league={league} isDark={isDark} accentColor={accentColor} onUpdateLeague={onUpdateLeague} />}
      {activeTab === 'payouts' && <PayoutsTab league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} accentColor={accentColor} />}
      {activeTab === 'settings' && <SettingsTab league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} accentColor={accentColor} />}
    </div>
  );
}

Object.assign(window, { LeagueView });

export { TabBar, PayoutsTab, SettingsTab, LeagueView };
