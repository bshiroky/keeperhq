import React from 'react';
import { makeTheme, SPORT_CONFIG, DRAFT_LABEL, SportBadge, DraftBadge, StatusPill, getLeagueStats } from './components.jsx';
import { OverviewTab } from './tabs/OverviewTab.jsx';
import { LotteryTab } from './tabs/LotteryTab.jsx';
import { DraftImportModal } from './tabs/ImportTab.jsx';
import { RosterImportModal } from './tabs/RosterImportTab.jsx';
import { startNewSeason } from './lib/season.js';

// League Detail — shell + PayoutsTab + SettingsTab

function TabBar({ tabs, active, onChange, accentColor, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${t.border}`, marginBottom: 0 }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '9px 16px', fontSize: '12px', fontWeight: 600,
          color: active === tab.id ? accentColor : t.textMuted,
          borderBottom: active === tab.id ? `2px solid ${accentColor}` : '2px solid transparent',
          marginBottom: -1, transition: 'all 0.15s', letterSpacing: '0.01em',
          display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
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
        </button>
      ))}
    </div>
  );
}

function PayoutsTab({ league, isDark, onUpdateLeague, accentColor }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const paid = teams.filter(tm => tm.paid).length;
  const collected = paid * league.buyIn;
  const [expandedTeam, setExpandedTeam] = React.useState(null);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (s) => s ? new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

  function updateTeam(teamId, patch) {
    const newTeams = teams.map(tm => tm.id === teamId ? { ...tm, ...patch } : tm);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
  }
  function togglePaid(team) {
    if (team.paid) {
      updateTeam(team.id, { paid: false, paidDate: null, paidNote: null });
    } else {
      updateTeam(team.id, { paid: true, paidDate: team.paidDate || todayStr() });
      setExpandedTeam(team.id); // open the editor so user can add note/edit date
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Prize Structure</div>
        </div>
        <div style={{ padding: '0 20px' }}>
          {league.payouts.length === 0 && <div style={{ color: t.textMuted, fontSize: '13px', padding: '16px 0' }}>No payouts configured yet.</div>}
          {league.payouts.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < league.payouts.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
              <span style={{ fontSize: '14px', color: t.textBody }}>{p.label}</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: p.amount < 0 ? '#e85252' : '#6dd4a8' }}>
                {p.amount < 0 ? `-$${Math.abs(p.amount)}` : `$${p.amount.toLocaleString()}`}
              </span>
            </div>
          ))}
        </div>
        {league.payoutNote && (
          <div style={{ margin: '0 20px 16px', padding: '12px', background: t.noteBg, borderRadius: 8, fontSize: '12px', color: t.textSecondary, lineHeight: 1.5 }}>
            {league.payoutNote}
          </div>
        )}
        <div style={{ margin: '0 20px', display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderTop: `1px solid ${t.divider}` }}>
          <span style={{ fontSize: '13px', color: t.textMuted }}>Total Pool</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: t.textPrimary }}>${league.totalPool.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Payments</div>
          <div style={{ fontSize: '13px', color: t.textMuted }}>${collected.toLocaleString()} / ${league.totalPool.toLocaleString()}</div>
        </div>
        <div style={{ padding: '14px 20px 0' }}>
          <div style={{ background: t.progressBg, borderRadius: 4, height: 5, marginBottom: 14 }}>
            <div style={{ background: collected >= league.totalPool ? '#4caf7d' : '#e8832a', height: '100%', borderRadius: 4, width: `${Math.min((collected / (league.totalPool || 1)) * 100, 100)}%`, transition: 'width 0.4s' }}></div>
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
                      background: team.paid ? 'rgba(76,175,125,0.12)' : 'rgba(232,82,82,0.1)',
                      border: `1px solid ${team.paid ? 'rgba(109,212,168,0.3)' : 'rgba(232,82,82,0.3)'}`,
                      borderRadius: 6, padding: '4px 10px', fontSize: '12px', fontWeight: 700,
                      color: team.paid ? '#6dd4a8' : '#e85252', cursor: 'pointer', fontFamily: 'inherit',
                      minWidth: 70, textAlign: 'center',
                    }}>
                    {team.paid ? `✓ $${league.buyIn}` : 'Mark Paid'}
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
      background: value ? '#6dd4a8' : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)'),
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

  // ── League Info card ──────────────────────────────────────────────────────
  // Sport and Draft Type are locked: they're foundational decisions set when the
  // league is created. Changing them mid-league would invalidate keeper records.
  const lockedRows = [
    { label: 'Sport', value: sport.label, locked: true },
    { label: 'Draft Type', value: DRAFT_LABEL[league.draftType] || league.draftType, locked: true },
  ];
  const infoView = [
    ...lockedRows,
    { label: 'Season', value: league.season },
    { label: 'Teams', value: league.teamCount || league.teams.length },
  ];
  const infoDraftInitial = {
    season: league.season || '',
  };
  function infoEdit(draft, setDraft) {
    const set = (k, v) => setDraft({ ...draft, [k]: v });
    return [
      ...lockedRows,
      { label: 'Season', control: <TextField value={draft.season} onChange={v => set('season', v)} t={t} isDark={isDark} /> },
      { label: 'Teams', value: league.teamCount || league.teams.length, locked: true },
    ];
  }
  function saveInfo(draft) {
    onUpdateLeague({ ...league, season: draft.season });
  }

  // ── Keeper Rules card ─────────────────────────────────────────────────────
  const isSnake = league.draftType === 'snake';
  const isAuction = league.draftType === 'auction';
  const ar = league.auctionRules || {};

  const rulesView = [
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
    { label: 'No Playoff Pickup Keepers', value: league.noPlayoffPickupKeepers ? 'Enforced' : 'Not enforced', help: 'Block keeping players added after the playoff start date.' },
  ];
  const rulesDraftInitial = {
    keeperSlots: league.keeperSlots || 0,
    minKeepers: league.minKeepers || 0,
    contractYears: league.contractYears || 3,
    contractsRequired: !!league.contractsRequired,
    contractsFollowTrade: league.contractsFollowTrade ?? true,
    noPlayoffPickupKeepers: !!league.noPlayoffPickupKeepers,
    costIncreasePerYear: ar.costIncreasePerYear || 0,
    undraftedStartCost: ar.undraftedStartCost || 0,
  };
  function rulesEdit(draft, setDraft) {
    const set = (k, v) => setDraft({ ...draft, [k]: v });
    return [
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
      { label: 'No Playoff Pickup Keepers', help: 'Block keeping players added after the playoff start date.', control: <ToggleField value={draft.noPlayoffPickupKeepers} onChange={v => set('noPlayoffPickupKeepers', v)} t={t} isDark={isDark} /> },
    ];
  }
  function saveRules(draft) {
    const next = {
      ...league,
      keeperSlots: draft.keeperSlots,
      minKeepers: draft.minKeepers,
      noPlayoffPickupKeepers: draft.noPlayoffPickupKeepers,
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
      <EditableCard title="League Info" t={t} isDark={isDark} accentColor={accentColor}
        viewRows={infoView} initialDraft={infoDraftInitial} editRows={infoEdit} onSave={saveInfo} />

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
            <span style={{ fontSize: 12, color: rostersLoaded === totalTeams ? '#6dd4a8' : t.textMuted, fontWeight: 700 }}>
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
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: hasRoster ? '#6dd4a8' : t.border, flexShrink: 0 }} />
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

function LeagueView({ league, onBack, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const accentColor = sport.color;
  const [tab, setTab] = React.useState('overview');
  const [currentLeague, setCurrentLeague] = React.useState(league);
  const stats = getLeagueStats(currentLeague);
  const totalTeams = currentLeague.teamCount || currentLeague.teams.length;

  // Keep local state in sync when the parent passes a refreshed copy
  // (e.g. after persisting to localStorage and re-selecting).
  React.useEffect(() => { setCurrentLeague(league); }, [league.id]);

  function handleUpdateLeague(updated) {
    setCurrentLeague(updated);
    if (onUpdateLeague) onUpdateLeague(updated);
  }

  const tabs = [
    { id: 'overview', label: 'Overview', badge: `${stats.submitted}/${totalTeams}` },
    ...(currentLeague.draftType === 'snake' ? [{ id: 'lottery', label: 'Lottery' }] : []),
    { id: 'payouts', label: 'Payouts & Pay' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 40px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 10px', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
        ← All Leagues
      </button>

      {/* Season-complete banner — prompts the commissioner to roll forward */}
      {currentLeague.status === 'completed' && (
        <div style={{ background: 'linear-gradient(135deg, rgba(59,138,230,0.18), rgba(107,77,230,0.12))', border: `1px solid ${accentColor}55`, borderRadius: 10, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🔄</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>The {currentLeague.season} season is complete</div>
            <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>Roll the league forward to set up next season's keepers.</div>
          </div>
          <button onClick={() => setTab('settings')} style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Go to Settings
          </button>
        </div>
      )}

      {/* League header card with tabs integrated */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderTop: `3px solid ${accentColor}`, borderRadius: '0 0 12px 12px', boxShadow: t.cardShadow, marginBottom: 16 }}>
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
            <span style={{ fontSize: 22 }}>{sport.icon}</span>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{currentLeague.name}</h1>
            <SportBadge sport={currentLeague.sport} />
            <DraftBadge draftType={currentLeague.draftType} />
            <StatusPill status={currentLeague.status} />
          </div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center', textAlign: 'center' }}>
            {[
              { label: 'Teams', value: totalTeams },
              { label: 'Submitted', value: `${stats.submitted}/${totalTeams}`, accent: stats.submitted === totalTeams ? '#6dd4a8' : undefined },
              { label: 'Paid', value: `${stats.paid}/${totalTeams}`, accent: stats.paid < totalTeams ? '#e8832a' : '#6dd4a8' },
              { label: currentLeague.draftType === 'snake' ? 'Expiring' : 'Pool', value: currentLeague.draftType === 'snake' ? (stats.expiring || '—') : `$${currentLeague.totalPool.toLocaleString()}`, accent: currentLeague.draftType === 'snake' && stats.expiring > 0 ? '#e85252' : undefined },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '9px', color: t.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: s.accent || t.textPrimary, lineHeight: 1.1, marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${t.divider}`, padding: '0 20px' }}>
          <TabBar tabs={tabs} active={tab} onChange={setTab} accentColor={accentColor} isDark={isDark} />
        </div>
      </div>

      {tab === 'overview' && <OverviewTab league={currentLeague} accentColor={accentColor} isDark={isDark} onGoToTab={setTab} onUpdateLeague={handleUpdateLeague} />}
      {tab === 'lottery' && currentLeague.draftType === 'snake' && <LotteryTab league={currentLeague} accentColor={accentColor} isDark={isDark} onUpdateLeague={handleUpdateLeague} />}
      {tab === 'payouts' && <PayoutsTab league={currentLeague} isDark={isDark} onUpdateLeague={handleUpdateLeague} accentColor={accentColor} />}
      {tab === 'settings' && <SettingsTab league={currentLeague} isDark={isDark} onUpdateLeague={handleUpdateLeague} accentColor={accentColor} />}
    </div>
  );
}

Object.assign(window, { LeagueView });

export { TabBar, PayoutsTab, SettingsTab, LeagueView };
