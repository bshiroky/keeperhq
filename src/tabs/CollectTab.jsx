import React from 'react';
import { makeTheme } from '../components.jsx';

// Per-team Keeper Collection View — sidebar of teams + main pane with prior keepers as suggestion chips

function StatusDot({ state, size = 10 }) {
  // state: 'submitted' (green), 'pending' (gray), 'partial' (amber)
  const color = state === 'submitted' ? '#4caf7d' : state === 'partial' ? '#e8832a' : '#9aa3b2';
  const bg = state === 'submitted' ? 'rgba(76,175,125,0.18)' : state === 'partial' ? 'rgba(232,131,42,0.18)' : 'rgba(154,163,178,0.18)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size + 6, height: size + 6, borderRadius: '50%', background: bg, flexShrink: 0 }}>
      <span style={{ width: size - 2, height: size - 2, borderRadius: '50%', background: color, display: 'block' }} />
    </span>
  );
}

function teamStatus(team) {
  // 'submitted' if has any keepers; else 'pending'
  return (team.keepers && team.keepers.length > 0) ? 'submitted' : 'pending';
}

function CollectKeepersView({ league, teams, accentColor, isDark, onUpdateLeague, onEditTeam }) {
  const t = makeTheme(isDark);
  const [selectedId, setSelectedId] = React.useState(() => {
    // Pick first pending team
    const pending = teams.find(tm => teamStatus(tm) === 'pending');
    return (pending || teams[0])?.id;
  });
  const selected = teams.find(tm => tm.id === selectedId) || teams[0];
  const slotsTotal = league.keeperSlots;
  const submitted = teams.filter(tm => teamStatus(tm) === 'submitted').length;

  function updateTeam(teamId, patch) {
    const newTeams = teams.map(tm => tm.id === teamId ? { ...tm, ...patch } : tm);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
  }

  function addSuggestion(suggest) {
    const current = selected.keepers || [];
    if (current.length >= slotsTotal) return;
    if (current.some(k => k.player === suggest.player)) return;
    // Increment contract year (rolling forward from prior season)
    const newYr = (suggest.contractYear || 0) + 1;
    const newKeeper = {
      player: suggest.player,
      contractYear: newYr,
      contractLength: suggest.contractLength || 3,
      expiresAfter: `${2025 + ((suggest.contractLength || 3) - newYr)}-${String(2025 + ((suggest.contractLength || 3) - newYr) + 1).slice(2)}`,
    };
    updateTeam(selected.id, { keepers: [...current, newKeeper] });
  }

  function removeKeeper(idx) {
    const newKeepers = (selected.keepers || []).filter((_, i) => i !== idx);
    updateTeam(selected.id, { keepers: newKeepers });
  }

  function clearTeam() {
    updateTeam(selected.id, { keepers: [] });
  }

  const priorKeepers = selected.priorKeepers || [];
  const currentKeepers = selected.keepers || [];
  const usedPlayers = new Set(currentKeepers.map(k => k.player));
  const rosterPlayers = new Set((selected.roster || []).map(r => r.player.toLowerCase()));
  const hasRoster = (selected.roster || []).length > 0;
  // Players on this team's pre-playoff roster that aren't in priorKeepers (waiver pickups / IR mid-season etc)
  const waiverPickups = hasRoster
    ? (selected.roster || []).filter(r => !priorKeepers.some(p => p.player.toLowerCase() === r.player.toLowerCase()))
    : [];
  const requiredCount = league.contractsRequired ? slotsTotal : 0;
  const meetsRequired = currentKeepers.length >= requiredCount;

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Collect Keepers</div>
        <div style={{ fontSize: '12px', color: t.textMuted }}>{submitted}/{teams.length} teams submitted</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 480 }}>
        {/* Sidebar */}
        <div style={{ borderRight: `1px solid ${t.divider}`, background: t.sectionBg, overflow: 'auto', maxHeight: 600 }}>
          {teams.map(team => {
            const status = teamStatus(team);
            const isSelected = team.id === selectedId;
            return (
              <button key={team.id} onClick={() => setSelectedId(team.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', border: 'none', cursor: 'pointer',
                  background: isSelected ? t.cardBg : 'transparent',
                  borderLeft: `3px solid ${isSelected ? accentColor : 'transparent'}`,
                  borderBottom: `1px solid ${t.dividerFaint}`, fontFamily: 'inherit', textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
                <StatusDot state={status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary }}>{team.name}</div>
                  <div style={{ fontSize: '10px', color: t.textMuted, marginTop: 1 }}>
                    {status === 'submitted' ? `${(team.keepers || []).length} keeper${(team.keepers || []).length === 1 ? '' : 's'}` : 'Awaiting submission'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Main pane */}
        <div style={{ padding: '20px 24px', overflow: 'auto', maxHeight: 600 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>{selected.name[0]}</div>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: t.textPrimary }}>{selected.name}</div>
                <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 1 }}>
                  {currentKeepers.length}/{slotsTotal} keeper slots
                  {requiredCount > 0 && !meetsRequired && <span style={{ color: '#e8832a', fontWeight: 700 }}> · {requiredCount - currentKeepers.length} more required</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {currentKeepers.length > 0 && (
                <button onClick={clearTeam} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit' }}>
                  Clear
                </button>
              )}
              <button onClick={() => onEditTeam(selected)} style={{ background: accentColor, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit' }}>
                Edit Contracts ✎
              </button>
            </div>
          </div>

          {/* Last year's keepers — suggestion chips */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Last Year's Eligible Keepers</span>
              <span style={{ color: t.textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· click to add as suggestion</span>
              {hasRoster && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6dd4a8', background: 'rgba(76,175,125,0.12)', border: '1px solid rgba(76,175,125,0.3)', padding: '2px 7px', borderRadius: 10, fontWeight: 700, letterSpacing: 0, textTransform: 'none' }}>
                  ✓ Pre-playoff roster loaded · {(selected.roster || []).length} players{selected.rosterAsOfDate ? ` · ${selected.rosterAsOfDate}` : ''}
                </span>
              )}
            </div>
            {priorKeepers.length === 0 ? (
              <div style={{ fontSize: 12, color: t.textMuted, padding: '8px 0', fontStyle: 'italic' }}>No prior keepers on file.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {priorKeepers.map((p, i) => {
                  const used = usedPlayers.has(p.player);
                  const yrsLeft = (p.contractLength || 3) - ((p.contractYear || 0) + 1);
                  const expired = p.expired || yrsLeft < 0;
                  const offRoster = hasRoster && !rosterPlayers.has(p.player.toLowerCase());
                  const blocked = expired || offRoster;
                  const blockReason = expired
                    ? 'Contract expired — back to draft'
                    : offRoster
                      ? `Not on ${selected.name}'s pre-playoff roster — likely traded or dropped`
                      : null;
                  return (
                    <button key={i} onClick={() => !used && !blocked && addSuggestion(p)}
                      disabled={used || blocked}
                      title={p.note || blockReason || `Add ${p.player} as keeper`}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                        background: used ? t.sectionBg : (blocked ? 'transparent' : t.cardBg),
                        border: `1px dashed ${used ? t.divider : (blocked ? t.divider : t.border)}`,
                        borderRadius: 8, padding: '8px 12px', cursor: (used || blocked) ? 'not-allowed' : 'pointer',
                        opacity: blocked ? 0.5 : 1, fontFamily: 'inherit', textAlign: 'left',
                        textDecoration: expired ? 'line-through' : 'none',
                      }}
                      onMouseEnter={e => { if (!used && !blocked) { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}10`; } }}
                      onMouseLeave={e => { if (!used && !blocked) { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.background = t.cardBg; } }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: used ? t.textMuted : t.textPrimary }}>{p.player}</span>
                        {used && <span style={{ fontSize: 10, color: '#4caf7d', fontWeight: 700 }}>✓ Added</span>}
                        {!used && offRoster && !expired && <span style={{ fontSize: 9, color: '#e85252', fontWeight: 700, background: 'rgba(232,82,82,0.12)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Not on roster</span>}
                      </div>
                      <div style={{ fontSize: 10, color: t.textMuted }}>
                        Last yr: Y{(p.contractYear || 0) + 1} of {p.contractLength || 3}
                        {p.note && <span> · {p.note}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Waiver pickups — players on roster but NOT on last year's draft/keeper list */}
          {hasRoster && waiverPickups.length > 0 && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: t.sectionBg, border: `1px dashed ${t.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Also on roster · waiver pickups{league.noPlayoffPickupKeepers ? ' (ineligible to keep)' : ''}</span>
                <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {waiverPickups.length}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {waiverPickups.map((r, i) => (
                  <span key={i} title={`${r.pos || ''} · picked up mid-season`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: t.textMuted, background: t.cardBg, border: `1px solid ${t.dividerFaint}`, padding: '3px 7px', borderRadius: 4, opacity: league.noPlayoffPickupKeepers ? 0.6 : 1 }}>
                    {r.pos && r.pos !== '?' && <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, opacity: 0.7 }}>{r.pos}</span>}
                    <span>{r.player}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Current keepers list */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              {currentKeepers.length === 0 ? "This Year's Keepers · none yet" : `This Year's Keepers · ${currentKeepers.length} of ${slotsTotal}`}
            </div>
            {currentKeepers.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', border: `2px dashed ${t.border}`, borderRadius: 10, color: t.textMuted, fontSize: 13 }}>
                No keepers submitted yet for {selected.name}.<br/>
                <span style={{ fontSize: 11 }}>Click suggestions above, or use Edit Contracts for manual entry.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {currentKeepers.map((k, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, width: 22 }}>K{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>{k.player || <em style={{ color: t.textMuted }}>(unnamed)</em>}</span>
                    {league.draftType === 'snake' && (
                      <span style={{ fontSize: 11, color: t.textMuted }}>Y{k.contractYear} of {k.contractLength}</span>
                    )}
                    <button onClick={() => removeKeeper(i)} style={{ background: 'rgba(232,82,82,0.12)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#e85252', fontSize: 14, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CollectKeepersView, StatusDot, DraftPoolPanel });

function DraftPoolPanel({ league, teams, accentColor, isDark }) {
  const t = makeTheme(isDark);
  // Build set of player names currently kept across all teams
  const keptNames = new Set();
  teams.forEach(tm => (tm.keepers || []).forEach(k => k.player && keptNames.add(k.player)));

  // Going back to draft = priorKeepers - currently kept
  const back = [];
  teams.forEach(tm => {
    (tm.priorKeepers || []).forEach(p => {
      if (!keptNames.has(p.player)) {
        const expired = p.expired || ((p.contractYear || 0) + 1) > (p.contractLength || 3);
        back.push({
          ...p,
          fromTeam: tm.name,
          fromTeamId: tm.id,
          reason: expired ? 'Contract expired' : (tm.keepersSubmitted || (tm.keepers && tm.keepers.length > 0) ? 'Dropped by ' + tm.name : 'Pending'),
          reasonType: expired ? 'expired' : (tm.keepers && tm.keepers.length > 0 ? 'dropped' : 'pending'),
        });
      }
    });
  });

  // Sort: expired first, then dropped, then pending
  const sortOrder = { expired: 0, dropped: 1, pending: 2 };
  back.sort((a, b) => sortOrder[a.reasonType] - sortOrder[b.reasonType] || a.player.localeCompare(b.player));

  const totalPrior = teams.reduce((sum, tm) => sum + (tm.priorKeepers || []).length, 0);
  const expiredCount = back.filter(b => b.reasonType === 'expired').length;
  const droppedCount = back.filter(b => b.reasonType === 'dropped').length;
  const pendingCount = back.filter(b => b.reasonType === 'pending').length;

  if (totalPrior === 0) return null;

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>↩</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Going Back to Draft</span>
          <span style={{ fontSize: 11, color: t.textMuted }}>· {back.length} player{back.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textMuted, alignItems: 'center' }}>
          {expiredCount > 0 && <span><span style={{ color: '#e85252', fontWeight: 700 }}>●</span> {expiredCount} expired</span>}
          {droppedCount > 0 && <span><span style={{ color: '#e8832a', fontWeight: 700 }}>●</span> {droppedCount} dropped</span>}
          {pendingCount > 0 && <span><span style={{ color: '#9aa3b2', fontWeight: 700 }}>●</span> {pendingCount} pending</span>}
        </div>
      </div>
      {back.length === 0 ? (
        <div style={{ padding: '18px', textAlign: 'center', fontSize: 12, color: t.textMuted }}>Every prior keeper has been re-kept. Nothing going back to the draft.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px' }}>
          {back.map((p, i) => {
            const color = p.reasonType === 'expired' ? '#e85252' : p.reasonType === 'dropped' ? '#e8832a' : '#9aa3b2';
            const bg = p.reasonType === 'expired' ? 'rgba(232,82,82,0.08)' : p.reasonType === 'dropped' ? 'rgba(232,131,42,0.08)' : t.sectionBg;
            return (
              <div key={i} title={`${p.reason} · was on ${p.fromTeam}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '6px 10px', background: bg, border: `1px solid ${color}33`, borderRadius: 6, fontSize: 12 }}>
                <span style={{ color: p.reasonType === 'expired' ? color : t.textPrimary, fontWeight: 600 }}>{p.player}</span>
                <span style={{ fontSize: 10, color: t.textMuted }}>was on {p.fromTeam} · {p.reason}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { StatusDot, teamStatus, CollectKeepersView, DraftPoolPanel };
