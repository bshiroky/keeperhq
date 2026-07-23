import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Check, RefreshCw, ClipboardList, Download, X, Upload, Wallet, Dices, ListOrdered, Settings as SettingsIcon, Clock, Link2, Trash2 } from 'lucide-react';
import { makeTheme, SPORT_CONFIG, DRAFT_LABEL, SportLogo, HScrollRow, tokens, Input, Select, NumberInput, Button, MOTION_STYLES, SaveToast, KeepersCelebration } from './components.jsx';
import { shouldCelebrate, markSeen } from './lib/celebration.js';
import { KeepersOverview } from './tabs/OverviewTab.jsx';
import { SetKeepersWorkbench } from './tabs/SetKeepersTab.jsx';
import { LotteryTab } from './tabs/LotteryTab.jsx';
import { DraftPicksPanel } from './tabs/DraftPicksTab.jsx';
import { DraftImportModal } from './tabs/ImportTab.jsx';
import { RosterImportModal } from './tabs/RosterImportTab.jsx';
import { startNewSeason } from './lib/season.js';
import { supabase } from './lib/supabase.js';
import { fetchShareToken, regenerateShareToken } from './lib/leagueStore.js';

// League Detail — Keepers home shell + PayoutsTab + SettingsPanel/ImportPanel

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

function PayoutsTab({ league, isDark, onUpdateLeague, accentColor, onSaved }) {
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
    onSaved?.();
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
    <div className="kh-payouts-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <style>{`
        /* Inside the Pool & Payouts sheet the two cards reflow to a single
           column on phones (the sheet goes full-width at the same breakpoint),
           so neither card's content is cramped. Desktop keeps the two-up grid. */
        @media (max-width: 760px) {
          .kh-payouts-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Prize Structure</div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" isDark={isDark} onClick={cancel}>Cancel</Button>
              <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={save}>Save</Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" isDark={isDark} onClick={startEdit}>Edit</Button>
          )}
        </div>

        {/* Buy-in */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '14px', color: t.textBody, flex: 1 }}>Buy-in (per team)</span>
          {isEditing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: t.textMuted }}>$</span>
              <NumberInput size="sm" align="right" step={25} width={80} isDark={isDark}
                value={buyIn || ''} onChange={e => setDraftBuyIn(e.target.value)}
                style={{ fontWeight: 700 }} />
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
                          <NumberInput size="sm" align="right" step={25} width={78} placeholder="—" isDark={isDark}
                            value={reg ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') { setDraftCell(place, 'regular', ''); return; }
                              const n = Number(raw);
                              if (Number.isNaN(n)) return;
                              setDraftCell(place, 'regular', n);
                            }}
                            style={{ fontWeight: reg != null && reg !== 0 ? 700 : 500, color: amountColor(reg) }} />
                        </div>
                        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 12, color: t.textMuted }}>$</span>
                          <NumberInput size="sm" align="right" step={25} width={78} placeholder="—" isDark={isDark}
                            value={pf ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') { setDraftCell(place, 'playoffs', ''); return; }
                              const n = Number(raw);
                              if (Number.isNaN(n)) return;
                              setDraftCell(place, 'playoffs', n);
                            }}
                            style={{ fontWeight: pf != null && pf !== 0 ? 700 : 500, color: amountColor(pf) }} />
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
                    <Select value="" placeholder="+ Add place…" width={160} isDark={isDark}
                      options={addablePlaces.map(p => ({ value: p, label: ordinal(p) }))}
                      onChange={v => { if (v) addRow(Number(v)); }} />
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Input size="sm" width="100%" isDark={isDark} value={p.label}
                        onChange={e => setDraftOther(i, { label: e.target.value })}
                        placeholder="e.g. Weekly high score — $5/week" />
                    </div>
                    <span style={{ fontSize: 13, color: (Number(p.amount) || 0) < 0 ? t.danger : t.textMuted }}>$</span>
                    <NumberInput size="sm" align="right" step={25} width={80} isDark={isDark}
                      value={p.amount}
                      onChange={e => {
                        const raw = e.target.value;
                        if (raw === '') { setDraftOther(i, { amount: 0 }); return; }
                        const n = Number(raw);
                        if (Number.isNaN(n)) return;
                        setDraftOther(i, { amount: n });
                      }}
                      style={{ fontWeight: 700, color: amountColor(Number(p.amount) || 0) }} />
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
              <Input size="sm" width="100%" isDark={isDark} value={payoutNote}
                onChange={e => setDraftPayoutNote(e.target.value)}
                placeholder="Optional note about the payout structure…" />
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
                      {isOpen ? <span>▾</span> : <Pencil size={12} strokeWidth={1.5} />}
                    </button>
                  )}
                  <button onClick={() => togglePaid(team)} className="kh-state-fade"
                    style={{
                      background: team.paid ? t.successBg : t.dangerBg,
                      border: `1px solid ${team.paid ? t.successBorder : t.dangerBorder}`,
                      borderRadius: 6, padding: '4px 10px', fontSize: '12px', fontWeight: 700,
                      color: team.paid ? t.success : t.danger, cursor: 'pointer', fontFamily: 'inherit',
                      minWidth: 70, textAlign: 'center',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}>
                    {team.paid ? <><Check size={14} strokeWidth={1.5} /> ${liveBuyIn}</> : 'Mark Paid'}
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
// Thin value-based binding adapters over the shared field primitives — they
// carry no styles of their own (the recipe lives in components.jsx); they
// just adapt the settings form's onChange(value) ergonomics to the
// primitives' event-based onChange.
function TextField({ value, onChange, isDark, type = 'text', width }) {
  if (type === 'number') {
    return <NumberInput value={value ?? ''} width={width || 160} isDark={isDark}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  }
  return <Input value={value ?? ''} width={width || 160} isDark={isDark}
    onChange={e => onChange(e.target.value)} />;
}

function SelectField({ value, onChange, options, isDark }) {
  return <Select value={value} onChange={onChange} options={options} width={160} isDark={isDark} />;
}

function ToggleField({ value, onChange, t, isDark }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="kh-state-fade" style={{
      width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
      background: value ? t.success : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)'),
      position: 'relative', padding: 0,
    }}>
      <span className="kh-toggle-knob" style={{ position: 'absolute', top: 2, left: value ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

// EditableCard: header with title + Edit (or Save/Cancel). Body switches between
// the supplied viewRows (read-only) and editRows (form inputs).
function EditableCard({ title, t, isDark, accentColor, viewRows, editRows, onSave, initialDraft, onSaved }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(initialDraft);

  function startEdit() { setDraft(initialDraft); setIsEditing(true); }
  function cancel() { setIsEditing(false); }
  function save() { onSave(draft); setIsEditing(false); onSaved?.(); }

  const rows = isEditing ? editRows(draft, setDraft) : viewRows;

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{title}</div>
        {isEditing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" isDark={isDark} onClick={cancel}>Cancel</Button>
            <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={save}>Save</Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" isDark={isDark} onClick={startEdit}>Edit</Button>
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

// ── Share league page card (Settings) ────────────────────────────────────────
// Commissioner-side control for the public shared page at /l/:token. Shows
// the tokenized URL + Copy, and a Regenerate action behind an inline danger
// confirm — regenerating invalidates the old link immediately. The token is
// a real column on the league's Supabase row, so demo/localStorage leagues
// (and the no-Supabase container) get the quiet "needs your account" note.
function ShareLeagueCard({ league, isDark, accentColor }) {
  const t = makeTheme(isDark);
  const [token, setToken] = React.useState(null);
  const [status, setStatus] = React.useState('loading'); // loading | ready | unavailable
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copiedAt, setCopiedAt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    if (!supabase) { setStatus('unavailable'); return; }
    setStatus('loading');
    fetchShareToken(league.id)
      .then(tok => { if (!cancelled) { setToken(tok); setStatus(tok ? 'ready' : 'unavailable'); } })
      .catch(() => { if (!cancelled) setStatus('unavailable'); });
    return () => { cancelled = true; };
  }, [league.id]);

  const url = token ? `${window.location.origin}/l/${token}` : null;
  const displayUrl = token
    ? `${window.location.origin}/l/${token.slice(0, 6)}…${token.slice(-4)}`
    : null;

  function copy() {
    if (!url || !navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(() => setCopiedAt(Date.now())).catch(() => {});
  }

  function regenerate() {
    setBusy(true);
    regenerateShareToken(league.id)
      .then(tok => { setToken(tok); setConfirming(false); })
      .catch(e => console.warn('[KeeperHQ] Failed to regenerate share link:', e))
      .finally(() => setBusy(false));
  }

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Share League Page</div>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link2 size={18} strokeWidth={1.5} color={t.textSecondary} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Read-only page for your league</div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
              Anyone with the link can see keepers, contracts, and the keeper deadline — no login needed. Pin it in the league group chat.
            </div>
          </div>
        </div>

        {status === 'loading' && (
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>Loading link…</div>
        )}
        {status === 'unavailable' && (
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, lineHeight: 1.45 }}>
            Sharing needs this league saved to your account — sign in and the link appears here.
          </div>
        )}

        {status === 'ready' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <code style={{
                flex: 1, minWidth: 200, boxSizing: 'border-box',
                background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd,
                padding: '8px 12px', fontSize: 12, color: t.textBody,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={url}>
                {displayUrl}
              </code>
              <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={copy} style={{ flexShrink: 0 }}>
                Copy link
              </Button>
            </div>

            {confirming ? (
              <div style={{
                background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: tokens.radiusMd,
                padding: '12px 14px',
              }}>
                <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.danger }}>Regenerate this link?</div>
                <div style={{ ...tokens.typeBodyMeta, color: t.textBody, marginTop: 4, lineHeight: 1.5 }}>
                  This makes a new link. The old one stops working immediately — anyone still using it (or with it pinned in a group chat) will lose access.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                  <Button variant="secondary" size="sm" isDark={isDark} onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
                  <Button variant="destructive" size="sm" isDark={isDark} onClick={regenerate} disabled={busy}>
                    {busy ? 'Regenerating…' : 'Regenerate link'}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <button onClick={() => setConfirming(true)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                  ...tokens.typeBodyMeta, fontWeight: 600, color: t.danger, textDecoration: 'underline',
                }}>
                  Regenerate link
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <SaveToast trigger={copiedAt} isDark={isDark} message="Link copied" />
    </div>
  );
}

// ── Delete league card (Settings) ────────────────────────────────────────────
// Soft delete: the league drops out of My Leagues (and its shared page link
// stops resolving) but stays recoverable from the "Recently deleted" section
// on the My Leagues page — owner self-restore, no admin involved. Inline
// danger confirm mirrors the share-link regenerate pattern.
function DeleteLeagueCard({ league, isDark, onDeleteLeague }) {
  const t = makeTheme(isDark);
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: t.danger, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Delete League</div>
      </div>
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Trash2 size={18} strokeWidth={1.5} color={t.danger} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Delete {league.name}</div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
              The league disappears from My Leagues and its shared page link stops working. You can restore it from “Recently deleted” on the My Leagues page.
            </div>
          </div>
        </div>
        {confirming ? (
          <div style={{ background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: tokens.radiusMd, padding: '12px 14px' }}>
            <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.danger }}>Delete {league.name}?</div>
            <div style={{ ...tokens.typeBodyMeta, color: t.textBody, marginTop: 4, lineHeight: 1.5 }}>
              It disappears from My Leagues immediately, and anyone opening the shared league page will see an invalid-link message. Restore it any time from “Recently deleted” on the My Leagues page.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <Button variant="secondary" size="sm" isDark={isDark} onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" isDark={isDark} onClick={() => onDeleteLeague(league)}>Delete league</Button>
            </div>
          </div>
        ) : (
          <div>
            <button onClick={() => setConfirming(true)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
              ...tokens.typeBodyMeta, fontWeight: 600, color: t.danger, textDecoration: 'underline',
            }}>
              Delete league
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings panel — league rules + season rollover ──────────────────────────
// (Roster / draft imports live in ImportPanel, reached from the Import door.)
function SettingsPanel({ league, isDark, onUpdateLeague, accentColor, onSaved, onDeleteLeague }) {
  const t = makeTheme(isDark);
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const teams = league.teams || [];
  const [showRolloverConfirm, setShowRolloverConfirm] = React.useState(false);

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

  // ── Teams card — inline team renames (EditableCard pattern). Teams are
  // referenced by id everywhere (keepers' tradedTo, payment rows, import
  // mapping, the shared page projection), so a rename propagates on its own.
  const teamsView = teams.map((tm, i) => ({
    label: `Team ${i + 1}`,
    value: tm.name,
    ...(tm.isCommissioner ? { help: 'Commissioner' } : {}),
  }));
  const teamsDraftInitial = { names: Object.fromEntries(teams.map(tm => [tm.id, tm.name])) };
  function teamsEdit(draft, setDraft) {
    return teams.map((tm, i) => ({
      label: `Team ${i + 1}`,
      ...(tm.isCommissioner ? { help: 'Commissioner' } : {}),
      control: <TextField value={draft.names[tm.id]} width={220} isDark={isDark} t={t}
        onChange={v => setDraft({ ...draft, names: { ...draft.names, [tm.id]: v } })} />,
    }));
  }
  function saveTeams(draft) {
    onUpdateLeague({
      ...league,
      teams: teams.map(tm => {
        const name = (draft.names[tm.id] || '').trim();
        // A blanked-out field keeps the old name — no way to save a nameless team.
        return name && name !== tm.name ? { ...tm, name } : tm;
      }),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EditableCard title="Keeper Rules" t={t} isDark={isDark} accentColor={accentColor}
        viewRows={rulesView} initialDraft={rulesDraftInitial} editRows={rulesEdit} onSave={saveRules} onSaved={onSaved} />

      {teams.length > 0 && (
        <EditableCard title="Teams" t={t} isDark={isDark} accentColor={accentColor}
          viewRows={teamsView} initialDraft={teamsDraftInitial} editRows={teamsEdit} onSave={saveTeams} onSaved={onSaved} />
      )}

      <ShareLeagueCard league={league} isDark={isDark} accentColor={accentColor} />

      {/* Season rollover */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Season</div>
        </div>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <RefreshCw size={18} strokeWidth={1.5} color={t.textSecondary} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Start New Season</div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>
              Advances {league.season} to {/* show next */}the next year. Current keepers move to last-season history (contract years +1, expired contracts dropped). Keeper submissions reset.
            </div>
          </div>
          <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => setShowRolloverConfirm(true)} style={{ flexShrink: 0 }}>
            Start New Season
          </Button>
        </div>
      </div>

      {onDeleteLeague && (
        <DeleteLeagueCard league={league} isDark={isDark} onDeleteLeague={onDeleteLeague} />
      )}

      {showRolloverConfirm && (
        <RolloverConfirmModal league={league} accentColor={accentColor} isDark={isDark}
          onConfirm={rolloverSeason} onCancel={() => setShowRolloverConfirm(false)} />
      )}
    </div>
  );
}

// ── Import panel — rosters & last-year's-draft upload (the Import door) ───────
function ImportPanel({ league, isDark, onUpdateLeague, accentColor }) {
  const t = makeTheme(isDark);
  const [showImport, setShowImport] = React.useState(false);
  const [showRosterImport, setShowRosterImport] = React.useState(null); // teamId or 'new'
  const rostersLoaded = (league.teams || []).filter(tm => tm.roster && tm.roster.length > 0).length;
  const totalTeams = league.teamCount || (league.teams || []).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <ClipboardList size={18} strokeWidth={1.5} color={t.textSecondary} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Import Last Year's Draft</div>
          <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>Paste your fantasy site's draft results to pre-populate every team's eligible keeper pool with player names and prices.</div>
        </div>
        <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => setShowImport(true)} style={{ flexShrink: 0 }}>Paste Draft</Button>
      </div>

      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Download size={16} strokeWidth={1.5} color={t.textSecondary} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Pre-Playoff Rosters</div>
              <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 2 }}>Snapshot who was on each team's roster before fantasy playoffs — used to verify keeper eligibility (no waiver pickups).</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: rostersLoaded === totalTeams ? t.success : t.textMuted, fontWeight: 700 }}>
              {rostersLoaded}/{totalTeams} loaded
            </span>
            <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => setShowRosterImport('new')}>
              + Add Roster
            </Button>
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
          <Button variant="secondary" size="md" isDark={isDark} onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="md" accent={accentColor} isDark={isDark} onClick={onConfirm}>Start New Season</Button>
        </div>
      </div>
    </div>
  );
}

// ── Section sheet (Import / Pool / Settings) ─────────────────────────────────
// A right-anchored slide-in panel over a scrim. It's driven by the URL — the
// section doors are <Link>s and closing routes back to the Keepers home — so
// deep links and refresh land on the open panel. Lottery is a full page, not a
// sheet, so it isn't routed through here.
const SHEET_STYLES = `
  @keyframes kh-sheet-slide { from { transform: translateX(24px); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }
  @keyframes kh-scrim-fade  { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: no-preference) {
    .kh-sheet       { animation: kh-sheet-slide 0.24s cubic-bezier(.2,.8,.2,1); }
    .kh-sheet-scrim { animation: kh-scrim-fade 0.2s ease; }
  }
  @media (max-width: 760px) { .kh-sheet { max-width: 100% !important; } }
`;

function SectionPanel({ title, isDark, onClose, children }) {
  const t = makeTheme(isDark);
  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="kh-sheet-scrim"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', justifyContent: 'flex-end', background: t.scrim, backdropFilter: 'blur(2px)' }}>
      <div className="kh-sheet" role="dialog" aria-label={title} style={{
        width: '100%', maxWidth: 720, height: '100%', boxSizing: 'border-box',
        background: t.cardBg2, borderLeft: `1px solid ${t.border}`,
        boxShadow: '-12px 0 40px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: `${tokens.spaceMd}px ${tokens.spaceLg}px`, borderBottom: `1px solid ${t.divider}`, flexShrink: 0 }}>
          <h2 style={{ margin: 0, ...tokens.typeHeadingCard, color: t.textPrimary, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: tokens.radiusSm, color: t.textMuted, cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = t.sectionBg; e.currentTarget.style.color = t.textSecondary; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textMuted; }}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: tokens.spaceLg }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Keepers-home sub-tab toggle (Overview · Set keepers) ─────────────────────
function SubTabs({ view, onChange, isDark, accentColor }) {
  const t = makeTheme(isDark);
  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'set',      label: 'Set keepers' },
  ];
  return (
    <div style={{ display: 'inline-flex', background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, padding: 3, gap: 3 }}>
      {items.map(o => {
        const active = view === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            background: active ? accentColor : 'transparent', border: 'none',
            borderRadius: tokens.radiusSm, padding: '7px 16px',
            ...tokens.typePill, fontWeight: 700,
            color: active ? '#fff' : t.textSecondary, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.15s, color 0.15s',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// Phase pill copy for the identity card, derived from league.status.
const PHASE_LABEL = {
  'pre-draft': 'Pre-Draft', 'setup': 'Setup', 'draft-ready': 'Draft Ready',
  'active': 'In Season', 'in-season': 'In Season', 'completed': 'Complete',
};
function phaseLabel(status) {
  if (PHASE_LABEL[status]) return PHASE_LABEL[status];
  if (!status) return 'Pre-Draft';
  return status.split(/[-_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Inline keeper-deadline control on the right of the identity card. Writes
// league.keeperDeadline (date) + league.keeperDeadlineTime ('HH:MM', local);
// a date-only deadline (older data) is read as 11:59 PM. Goes warning-colored
// when ≤7 days out. The shared page's live countdown reads the same pair.
function DeadlineLine({ league, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const [editing, setEditing] = React.useState(false);
  const deadline = league.keeperDeadline || '';
  const time = league.keeperDeadlineTime || '23:59';
  const target = deadline ? new Date(`${deadline}T${time}:59`) : null;
  const daysLeft = target ? Math.ceil((target - new Date()) / 86400000) : null;
  const urgent = daysLeft != null && daysLeft >= 0 && daysLeft <= 7;
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(2000, 0, 1, h || 0, m || 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const labelColor = urgent ? t.warning : t.textSecondary;
  const editInputStyle = { ...tokens.typeBodyMeta, fontFamily: 'inherit', color: t.textPrimary, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm, padding: '2px 6px' };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, maxWidth: '100%',
      padding: '7px 12px', borderRadius: tokens.radiusPill,
      background: urgent ? t.warningBg : t.sectionBg,
      border: `1px solid ${urgent ? t.warningBorder : t.border}`,
    }}>
      <Clock size={14} strokeWidth={2} color={labelColor} style={{ flexShrink: 0 }} />
      <span style={{ ...tokens.typeBodyMeta, fontWeight: 600, color: labelColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {deadline
          ? `Keeper deadline · ${fmt(deadline)}, ${fmtTime(time)}${daysLeft != null ? ` · ${daysLeft < 0 ? 'passed' : `${daysLeft}d left`}` : ''}`
          : 'Keeper deadline · not set'}
      </span>
      {editing ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <input type="date" value={deadline} autoFocus
            onChange={e => {
              const v = e.target.value;
              // Picking a date defaults the time to 11:59 PM local; clearing
              // the date clears the time with it.
              onUpdateLeague({
                ...league,
                keeperDeadline: v || null,
                keeperDeadlineTime: v ? (league.keeperDeadlineTime || '23:59') : null,
              });
            }}
            style={editInputStyle} />
          <input type="time" value={time} disabled={!deadline}
            onChange={e => onUpdateLeague({ ...league, keeperDeadlineTime: e.target.value || '23:59' })}
            style={{ ...editInputStyle, opacity: deadline ? 1 : 0.5 }} />
          <button onClick={() => setEditing(false)}
            style={{ ...tokens.typeBodyMeta, fontWeight: 700, color: t.info, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, whiteSpace: 'nowrap' }}>
            Done
          </button>
        </span>
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ ...tokens.typeBodyMeta, fontWeight: 700, color: t.info, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {deadline ? 'Change' : 'Set'}
        </button>
      )}
    </div>
  );
}

// A section "door" — a secondary, bordered entry button that sits in the
// Keepers tab row (right of the Overview/Set-keepers toggle). Routed <Link>;
// the destination opens as a slide-in panel (Lottery is a full page).
function SectionDoorButton({ to, active, label, Icon, isDark }) {
  const t = makeTheme(isDark);
  return (
    <Link to={to} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      fontSize: 13, fontWeight: 600,
      color: active ? t.textPrimary : t.textSecondary,
      padding: '7px 13px', borderRadius: tokens.radiusMd,
      background: t.cardBg, border: `1px solid ${active ? t.textMuted : t.border}`,
      textDecoration: 'none', whiteSpace: 'nowrap',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = t.textMuted; e.currentTarget.style.color = t.textPrimary; }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textSecondary; } }}
    >
      <Icon size={15} strokeWidth={2} />
      {label}
    </Link>
  );
}

function LeagueView({ league, isDark, onUpdateLeague, onDeleteLeague, activeTab }) {
  const t = makeTheme(isDark);
  const navigate = useNavigate();
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const accentColor = sport.color;
  const basePath = `/league/${league.id}`;
  const teams = league.teams || [];
  const totalTeams = league.teamCount || teams.length;

  // League-identity card: avatar + name + phase pill, then sport/draft/teams
  // pills + season/draft meta. Identity only — no stat strip, no character.
  const draftDateLabel = league.draftDate
    ? `Draft ${new Date(league.draftDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : null;

  // Section doors — the supporting surfaces, opened from the Keepers tab row.
  // Pool / Settings / Import open as routed slide-in sheets; Lottery (snake
  // only) is a full-page takeover, enforced by the route gate.
  const sectionDoors = [
    { id: 'import',   label: 'Import',   Icon: Upload },
    { id: 'payouts',  label: 'Pool',     Icon: Wallet },
    // Picks + Lottery are snake-only (round-based draft picks don't exist in
    // an auction; the route gate mirrors this) and both open as FULL PAGES,
    // not sheets — the round×team grid is page-sized content.
    ...(league.draftType === 'snake' ? [
      { id: 'picks',   label: 'Picks',   Icon: ListOrdered },
      { id: 'lottery', label: 'Lottery', Icon: Dices },
    ] : []),
    { id: 'settings', label: 'Settings', Icon: SettingsIcon },
  ];

  // Bumped on a deliberate edit-card Save (Keeper Rules / Prize Structure) to
  // fire the "Saved" toast. Intentionally NOT wired to Mark Paid or toggles.
  const [savedAt, setSavedAt] = React.useState(0);
  const notifySaved = () => setSavedAt(Date.now());

  // Keepers home internal sub-view + the team focused in Set-keepers. Clicking a
  // team card on Overview jumps into Set-keepers for that team.
  const [view, setView] = React.useState('overview'); // 'overview' | 'set'
  const [selectedTeamId, setSelectedTeamId] = React.useState(teams[0]?.id || null);
  function openSetKeepers(teamId) {
    if (teamId) setSelectedTeamId(teamId);
    setView('set');
  }

  // Keepers-declared celebration. Skip while the Set-keepers view owns the
  // moment (its StepDone fires the inline celebration + writes the season flag,
  // so we stay silent on the way back).
  const [celebrating, setCelebrating] = React.useState(false);
  React.useEffect(() => {
    if (view === 'set') return;
    if (shouldCelebrate(league)) {
      markSeen(league.id, league.season);  // write on SHOW, not dismiss
      setCelebrating(true);
    }
  }, [league.teams, league.season, league.id, view]);

  const closePanel = () => navigate(`${basePath}/overview`);

  // Lottery and Picks are full-page takeovers (snake-only; the route gate
  // enforces it). Picks was born a slide-in sheet but the round×team grid is
  // page-sized content — it graduated to the Lottery pattern.
  if (activeTab === 'lottery' && league.draftType === 'snake') {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0 16px' }}>
          <h1 style={{ margin: 0, ...tokens.typeHeadingPage, color: t.textPrimary }}>Draft Lottery</h1>
          <Link to={`${basePath}/overview`} style={{ ...tokens.typeBodyMeta, fontWeight: 600, color: t.textMuted, textDecoration: 'none', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.color = t.textSecondary; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}>
            ← Back to Keepers
          </Link>
        </div>
        <LotteryTab league={league} accentColor={accentColor} isDark={isDark} onUpdateLeague={onUpdateLeague} />
      </div>
    );
  }
  if (activeTab === 'picks' && league.draftType === 'snake') {
    return (
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0 16px' }}>
          <h1 style={{ margin: 0, ...tokens.typeHeadingPage, color: t.textPrimary }}>Draft Picks</h1>
          <Link to={`${basePath}/overview`} style={{ ...tokens.typeBodyMeta, fontWeight: 600, color: t.textMuted, textDecoration: 'none', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.color = t.textSecondary; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}>
            ← Back to Keepers
          </Link>
        </div>
        <DraftPicksPanel league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} accentColor={accentColor} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 24px 80px' }}>
      <style>{MOTION_STYLES}</style>
      <style>{SHEET_STYLES}</style>

      {/* Season-complete banner — prompts the commissioner to roll forward */}
      {league.status === 'completed' && (
        <div style={{ background: 'linear-gradient(135deg, rgba(59,138,230,0.18), rgba(107,77,230,0.12))', border: `1px solid ${accentColor}55`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <RefreshCw size={22} strokeWidth={1.5} color={accentColor} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>The {league.season} season is complete</div>
            <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>Roll the league forward to set up next season's keepers.</div>
          </div>
          <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => navigate(`${basePath}/settings`)} style={{ flexShrink: 0 }}>
            Go to Settings
          </Button>
        </div>
      )}

      {/* Section A — league-identity card (3px sport-color top border; identity
          on the left, keeper-deadline control on the right; no stat strip) */}
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderTop: `3px solid ${accentColor}`,
        borderRadius: tokens.radiusLg, boxShadow: t.cardShadow,
        padding: '14px 20px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: sport.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            <SportLogo sport={league.sport} height={36} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, ...tokens.typeHeadingPage, color: t.textPrimary, whiteSpace: 'nowrap' }}>{league.name}</h1>
              <span style={{ ...tokens.typePillEmphatic, color: t.info, background: t.infoBg, borderRadius: tokens.radiusPill, padding: '3px 9px', whiteSpace: 'nowrap' }}>{phaseLabel(league.status)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ ...tokens.typePill, background: sport.tint, color: sport.color, border: `1px solid ${sport.border}`, borderRadius: tokens.radiusPill, padding: '3px 10px' }}>{sport.label}</span>
              <span style={{ ...tokens.typePill, background: t.badgeBg, color: t.textSecondary, border: `1px solid ${t.border}`, borderRadius: tokens.radiusPill, padding: '3px 10px' }}>{DRAFT_LABEL[league.draftType] || league.draftType}</span>
              <span style={{ ...tokens.typePill, background: t.badgeBg, color: t.textSecondary, border: `1px solid ${t.border}`, borderRadius: tokens.radiusPill, padding: '3px 10px' }}>{totalTeams} teams</span>
              <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginLeft: 2 }}>{league.season}{draftDateLabel ? ` · ${draftDateLabel}` : ''}</span>
            </div>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <DeadlineLine league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} />
        </div>
      </div>

      {/* Section B — Overview/Set-keepers toggle (left) + section doors (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '0 0 16px' }}>
        <SubTabs view={view} onChange={setView} isDark={isDark} accentColor={accentColor} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          {sectionDoors.map(d => (
            <SectionDoorButton key={d.id} to={`${basePath}/${d.id}`} active={activeTab === d.id} label={d.label} Icon={d.Icon} isDark={isDark} />
          ))}
        </div>
      </div>

      {view === 'overview' ? (
        <KeepersOverview league={league} accentColor={accentColor} isDark={isDark} onOpenTeam={openSetKeepers} />
      ) : (
        <SetKeepersWorkbench
          league={league} accentColor={accentColor} isDark={isDark} onUpdateLeague={onUpdateLeague}
          selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId}
        />
      )}

      {/* Section panels — routed; closing returns to the Keepers home */}
      {activeTab === 'payouts' && (
        <SectionPanel title="Pool &amp; Payouts" isDark={isDark} onClose={closePanel}>
          <PayoutsTab league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} accentColor={accentColor} onSaved={notifySaved} />
        </SectionPanel>
      )}
      {activeTab === 'settings' && (
        <SectionPanel title="League Settings" isDark={isDark} onClose={closePanel}>
          <SettingsPanel league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} accentColor={accentColor} onSaved={notifySaved} onDeleteLeague={onDeleteLeague} />
        </SectionPanel>
      )}
      {activeTab === 'import' && (
        <SectionPanel title="Import Rosters &amp; Draft" isDark={isDark} onClose={closePanel}>
          <ImportPanel league={league} isDark={isDark} onUpdateLeague={onUpdateLeague} accentColor={accentColor} />
        </SectionPanel>
      )}

      <SaveToast trigger={savedAt} isDark={isDark} />

      {celebrating && (
        <KeepersCelebration
          league={league}
          isDark={isDark}
          onDismiss={() => setCelebrating(false)}
          onSetDraft={() => { setCelebrating(false); navigate(`${basePath}/settings`); }}
        />
      )}
    </div>
  );
}

Object.assign(window, { LeagueView });

export { TabBar, PayoutsTab, SettingsPanel, ImportPanel, SectionPanel, LeagueView };
