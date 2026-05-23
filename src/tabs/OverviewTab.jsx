import React from 'react';
import { makeTheme, Tooltip, tokens } from '../components.jsx';
import { SeasonSetupWizard } from './SetupTab.jsx';
import { KeeperEditModal } from './KeepersTab.jsx';
import { loadPlayers, normalizeName } from '../lib/players.js';

// Overview Tab — Pre-season dashboard + compact keeper grid

function ChecklistCard({ icon, title, subtitle, value, total, status, accentColor, isDark, action }) {
  const t = makeTheme(isDark);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const done = (total > 0 && value === total) || status === 'locked';

  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${done ? accentColor + '44' : t.border}`,
      borderRadius: 12, boxShadow: t.cardShadow, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14,
    }}>
      {/* Top: icon + title + done badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: done ? `${accentColor}22` : t.sectionBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>{title}</div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 1 }}>{subtitle}</div>
          </div>
        </div>
        {done && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#6dd4a8', background: 'rgba(76,175,125,0.15)', borderRadius: 20, padding: '3px 10px', flexShrink: 0 }}>
            {status === 'locked' ? '🔒 Locked' : '✓ Done'}
          </span>
        )}
      </div>

      {/* Middle: progress bar (spacer if absent so button stays at bottom) */}
      <div style={{ flex: 1 }}>
        {total > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '12px', color: t.textMuted }}>{value} of {total}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: done ? '#6dd4a8' : accentColor }}>{pct}%</span>
            </div>
            <div style={{ background: t.progressBg, borderRadius: 4, height: 5 }}>
              <div style={{ background: done ? '#4caf7d' : accentColor, height: '100%', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }}></div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: action button — always at same vertical position */}
      {action && (
        <button onClick={action.onClick} style={{
          background: done ? t.sectionBg : accentColor,
          color: done ? t.textSecondary : '#fff',
          border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '12px', fontWeight: 600,
          cursor: 'pointer', alignSelf: 'flex-start', transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >{action.label}</button>
      )}
    </div>
  );
}

function CompactKeeperGrid({ league, accentColor, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const [teams, setTeams] = React.useState(league.teams || []);
  const [editingTeam, setEditingTeam] = React.useState(null); // { team, autoAdd }
  const [movingKeeper, setMovingKeeper] = React.useState(null); // { teamId, keeperIdx }
  const [playerMap, setPlayerMap] = React.useState(null); // normalized name → player record
  const maxKeepers = league.keeperSlots;
  const isPreseason = league.status === 'pre-draft' || league.status === 'setup';

  // Column-width constants — Team & Edit are pinned (sticky). K columns
  // operate in one of two mutually exclusive modes:
  //   stretch (when total natural width fits the container): K columns share
  //     the remaining space equally, no overflow, no scroll, no chevrons.
  //   scroll (when total natural width exceeds the container): K columns
  //     stay fixed at COL_W; the container scrolls with snap, chevrons
  //     advance one column per click, scroll-padding-left = TEAM_W so K
  //     columns snap flush against the post-sticky boundary.
  // Mode is decided by measuring container width vs natural K-column width.
  const TEAM_W = 140;
  const COL_W = 180;
  const EDIT_W = 60;

  const tableScrollRef = React.useRef(null);
  const [containerW, setContainerW] = React.useState(0);
  const [scrollCanLeft, setScrollCanLeft] = React.useState(false);
  const [scrollCanRight, setScrollCanRight] = React.useState(false);

  const naturalW = TEAM_W + maxKeepers * COL_W + EDIT_W;
  const stretchMode = containerW > 0 && naturalW <= containerW;

  // Largest scrollLeft that's also a valid snap point (multiple of COL_W,
  // since K columns are placed at TEAM_W + n*COL_W and scroll-padding-left
  // shifts the snap origin to scrollLeft = n*COL_W). Clamping chevron
  // targets to this avoids landing between snap points at the rightmost end.
  function maxValidSnap() {
    const el = tableScrollRef.current;
    if (!el) return 0;
    const maxScroll = el.scrollWidth - el.clientWidth;
    return Math.max(0, Math.floor(maxScroll / COL_W) * COL_W);
  }
  React.useEffect(() => {
    function update() {
      const el = tableScrollRef.current;
      if (!el) return;
      setContainerW(el.clientWidth);
      setScrollCanLeft(el.scrollLeft > 1);
      setScrollCanRight(el.scrollLeft + 1 < maxValidSnap());
    }
    update();
    const el = tableScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [maxKeepers, teams.length]);
  function scrollTable(dir) {
    const el = tableScrollRef.current;
    if (!el) return;
    // One whole column per click. Floor-for-right / ceil-for-left so a
    // clamped landing between snap points still steps cleanly back instead
    // of jumping to 0.
    const cur = el.scrollLeft;
    const raw = dir > 0
      ? (Math.floor(cur / COL_W) + 1) * COL_W
      : (Math.ceil(cur / COL_W) - 1) * COL_W;
    const target = Math.max(0, Math.min(maxValidSnap(), raw));
    el.scrollTo({ left: target, behavior: 'smooth' });
  }

  // Look up keeper headshots from the static player directory (NHL only for now).
  React.useEffect(() => {
    if (league.sport !== 'hockey' && league.sport !== 'nhl') return;
    let cancelled = false;
    loadPlayers('nhl').then(d => {
      if (cancelled) return;
      const m = new Map();
      for (const p of (d.players || [])) m.set(normalizeName(p.name), p);
      setPlayerMap(m);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [league.sport]);

  function moveKeeperToTeam(srcTeamId, keeperIdx, destTeamId) {
    if (srcTeamId === destTeamId) { setMovingKeeper(null); return; }
    const newTeams = teams.map(tm => ({ ...tm, keepers: (tm.keepers || []).map(k => ({ ...k })) }));
    const src = newTeams.find(t => t.id === srcTeamId);
    if (!src) return;
    const keeper = src.keepers[keeperIdx];
    if (!keeper) return;
    // Track origin once; updates to current owner happen via tradedTo
    if (!keeper.originalTeamId) keeper.originalTeamId = srcTeamId;
    keeper.tradedTo = destTeamId === keeper.originalTeamId ? null : destTeamId;
    setTeams(newTeams);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
    setMovingKeeper(null);
  }

  function teamName(id) { return (teams.find(t => t.id === id) || {}).name || '?'; }

  // Build per-team display lists: own keepers (including those traded out, marked) + acquired keepers from other teams
  function getDisplayKeepers(team) {
    const own = (team.keepers || []).map((k, idx) => ({
      ...k, sourceTeamId: team.id, sourceIdx: idx,
      currentlyOwnedBy: k.tradedTo || team.id,
      isOutgoing: !!k.tradedTo,
    }));
    const acquired = [];
    teams.forEach(other => {
      if (other.id === team.id) return;
      (other.keepers || []).forEach((k, idx) => {
        if (k.tradedTo === team.id) {
          acquired.push({ ...k, sourceTeamId: other.id, sourceIdx: idx, currentlyOwnedBy: team.id, isIncoming: true, fromTeamName: other.name });
        }
      });
    });
    return [...own, ...acquired];
  }

  function handleSave(updatedTeam) {
    const newTeams = teams.map(tm => tm.id === updatedTeam.id ? updatedTeam : tm);
    setTeams(newTeams);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
    setEditingTeam(null);
  }
  const withKeepersCount = teams.filter(tm => (tm.keepers || []).length > 0).length;

  return (
    <>
      {editingTeam && (
        <KeeperEditModal
          team={editingTeam.team} league={league} accentColor={accentColor} isDark={isDark}
          onSave={handleSave} onClose={() => setEditingTeam(null)} allTeams={teams}
          autoAddOnOpen={editingTeam.autoAdd}
        />
      )}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <style>{`.kh-keeper-pencil { opacity: 0; transition: opacity 0.15s; } .kh-keeper-cell:hover .kh-keeper-pencil { opacity: 0.6; } .kh-keeper-pencil:hover { opacity: 1; }`}</style>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Keepers</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {league.draftType === 'snake' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11px', color: t.textMuted }}>
                <span aria-hidden="true" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: t.dangerBg, border: `1px solid ${t.dangerBorder}` }} />
                Final year
              </span>
            )}
            <span style={{ fontSize: '12px', color: t.textMuted }}>{withKeepersCount}/{teams.length} teams started</span>
            {isPreseason && <span style={{ fontSize: '11px', fontWeight: 700, color: accentColor, background: `${accentColor}18`, borderRadius: 20, padding: '2px 8px' }}>Pre-Season</span>}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
        {teams.length === 0 || maxKeepers === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, marginBottom: 4 }}>
              {teams.length === 0 ? 'No teams yet' : 'No keeper slots configured'}
            </div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {teams.length === 0
                ? 'Set up the season to add teams and start picking keepers.'
                : 'Set Keeper Slots in Settings to use this grid.'}
            </div>
          </div>
        ) : (<>
        {scrollCanLeft && (
          <button onClick={() => scrollTable(-1)} aria-label="Previous keepers"
            style={{ position: 'absolute', left: TEAM_W - 14, top: '50%', transform: 'translateY(-50%)', zIndex: 6, width: 28, height: 28, borderRadius: '50%', background: t.cardBg, border: `1px solid ${t.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', cursor: 'pointer', color: t.textSecondary, fontSize: 16, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>‹</button>
        )}
        {scrollCanRight && (
          <button onClick={() => scrollTable(1)} aria-label="More keepers"
            style={{ position: 'absolute', right: EDIT_W - 14, top: '50%', transform: 'translateY(-50%)', zIndex: 6, width: 28, height: 28, borderRadius: '50%', background: t.cardBg, border: `1px solid ${t.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.18)', cursor: 'pointer', color: t.textSecondary, fontSize: 16, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>›</button>
        )}
        <div ref={tableScrollRef} style={{
          overflowX: stretchMode ? 'hidden' : 'auto',
          scrollSnapType: stretchMode ? 'none' : 'x mandatory',
          scrollPaddingLeft: stretchMode ? 0 : TEAM_W,
        }}>
          <table style={{
            width: stretchMode ? '100%' : 'max-content',
            tableLayout: stretchMode ? 'fixed' : 'auto',
            borderCollapse: 'separate', borderSpacing: 0,
          }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 3, background: t.sectionBg, padding: '9px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap', width: TEAM_W, minWidth: TEAM_W, boxShadow: scrollCanLeft ? '4px 0 6px -3px rgba(0,0,0,0.12)' : 'none' }}>Team</th>
                {Array.from({ length: maxKeepers }, (_, i) => (
                  <th key={i} style={{
                    background: t.sectionBg,
                    padding: '9px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: t.textMuted,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                    borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap',
                    width: stretchMode ? 'auto' : COL_W,
                    minWidth: stretchMode ? 0 : COL_W,
                    scrollSnapAlign: stretchMode ? 'none' : 'start',
                  }}>
                    K{i + 1}
                  </th>
                ))}
                <th style={{ position: 'sticky', right: 0, zIndex: 3, background: t.sectionBg, padding: '9px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${t.divider}`, width: EDIT_W, minWidth: EDIT_W, boxShadow: scrollCanRight ? '-4px 0 6px -3px rgba(0,0,0,0.12)' : 'none' }}></th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => {
                const displayKeepers = getDisplayKeepers(team);
                // Slots are roster spots K1..maxKeepers — fill with kept-AND-here keepers (own non-traded + incoming).
                // Outgoing keepers stay in their original slot position so user sees "→ traded to X" in place.
                const ownKeepers = team.keepers || [];
                // Build slot array of length maxKeepers — preserve original index for own keepers
                const slots = Array.from({ length: maxKeepers }, (_, ki) => {
                  const k = ownKeepers[ki];
                  if (k) {
                    // It's still in this slot whether or not traded out
                    return {
                      ...k, sourceTeamId: team.id, sourceIdx: ki,
                      isOutgoing: !!k.tradedTo,
                      currentlyOwnedBy: k.tradedTo || team.id,
                    };
                  }
                  return null;
                });
                // Incoming keepers append into first empty slots
                const incoming = displayKeepers.filter(k => k.isIncoming);
                let inIdx = 0;
                for (let s = 0; s < slots.length && inIdx < incoming.length; s++) {
                  if (!slots[s]) { slots[s] = incoming[inIdx++]; }
                }
                // If still more incoming than slots — they'll need a warning row (over-capacity)
                const overflow = incoming.slice(inIdx);
                const activeCount = slots.filter(s => s && !s.isOutgoing).length + overflow.length;
                const requiredCount = league.contractsRequired ? maxKeepers : 0;
                const needsMore = isPreseason && activeCount < requiredCount;
                return (
                  <tr key={team.id}
                    style={{ borderBottom: i < teams.length - 1 ? `1px solid ${t.dividerFaint}` : 'none', verticalAlign: 'middle' }}
                  >
                    {/* Team name — sticky pinned to left edge while K columns scroll */}
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: t.cardBg, padding: '12px 8px 12px 16px', whiteSpace: 'nowrap', width: TEAM_W, minWidth: TEAM_W, boxShadow: scrollCanLeft ? '4px 0 6px -3px rgba(0,0,0,0.12)' : 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
                      {(needsMore || overflow.length > 0) && (
                        <div style={{ fontSize: '10px', color: '#e8832a', marginTop: 2, fontWeight: 600 }}>
                          {needsMore && `${activeCount}/${requiredCount} required`}
                          {overflow.length > 0 && ` +${overflow.length} extra`}
                        </div>
                      )}
                    </td>
                    {/* Keeper slots */}
                    {slots.map((slot, ki) => {
                      const popoverOpen = slot && movingKeeper && movingKeeper.teamId === slot.sourceTeamId && movingKeeper.keeperIdx === slot.sourceIdx;
                      const expiring = slot && league.draftType === 'snake' && slot.contractYear >= slot.contractLength;
                      const isSnake = league.draftType === 'snake';
                      const valueText = slot && (isSnake
                        ? `Y${slot.contractYear}/${slot.contractLength}`
                        : `$${slot.keptFor}`);
                      const valueColor = !slot ? null
                        : slot.isOutgoing ? t.textMuted
                        : expiring ? t.danger
                        : (isSnake ? t.textSecondary : accentColor);
                      return (
                        <td key={ki} style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                          {slot ? (
                            <Tooltip
                              isDark={isDark}
                              content={expiring
                                ? `Final year of contract — ${slot.player} goes back to the draft after this season.`
                                : null}>
                            <div className="kh-keeper-cell" style={{
                              position: 'relative',
                              border: `1px solid ${expiring ? t.dangerBorder : t.border}`,
                              background: expiring ? t.dangerBg : t.sectionBg,
                              borderRadius: tokens.radiusSm,
                              padding: '8px 10px',
                              display: 'flex', flexDirection: 'column', gap: 2,
                              minWidth: 0,
                            }}>
                              {/* Line 1: name + hover-only reassign pencil */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                <span style={{
                                  fontSize: '13px',
                                  fontWeight: slot.isOutgoing ? 500 : 700,
                                  color: slot.isOutgoing ? t.textMuted : (expiring ? t.danger : t.textPrimary),
                                  textDecoration: slot.isOutgoing ? 'line-through' : 'none',
                                  flex: 1, minWidth: 0,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }} title={slot.player}>
                                  {slot.player}
                                </span>
                                <button
                                  className="kh-keeper-pencil"
                                  onClick={(e) => { e.stopPropagation(); setMovingKeeper(popoverOpen ? null : { teamId: slot.sourceTeamId, keeperIdx: slot.sourceIdx }); }}
                                  title="Reassign to another team (mid-season trade)"
                                  style={{ background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', fontSize: '11px', color: t.textMuted, lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}
                                  onMouseEnter={e => { e.currentTarget.style.color = accentColor; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}
                                >✎</button>
                              </div>
                              {/* Line 2: value + FINAL YR badge — left-grouped (stays bound to value, doesn't float to far cell edge in stretch mode) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  color: valueColor,
                                  textDecoration: slot.isOutgoing ? 'line-through' : 'none',
                                }}>
                                  {valueText}
                                </span>
                                {expiring && (
                                  <span style={{ ...tokens.typePillEmphatic, color: t.danger, lineHeight: 1, flexShrink: 0 }}>
                                    Final yr
                                  </span>
                                )}
                              </div>
                              {/* Line 3 (outgoing only): traded-to indicator on its own line */}
                              {slot.isOutgoing && (
                                <span style={{ fontSize: '10px', color: t.warning, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  → traded to {teamName(slot.tradedTo)}
                                </span>
                              )}
                              {popoverOpen && (
                                <div style={{
                                  position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
                                  background: t.cardBg, border: `1px solid ${accentColor}`, borderRadius: 8,
                                  boxShadow: '0 6px 20px rgba(0,0,0,0.15)', padding: '6px 0', minWidth: 200,
                                }}
                                  onMouseLeave={() => setMovingKeeper(null)}
                                >
                                  <div style={{ padding: '4px 12px 6px', fontSize: '10px', fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${t.dividerFaint}`, marginBottom: 4 }}>
                                    Move {slot.player} to:
                                  </div>
                                  {teams.map(other => {
                                    const isCurrent = other.id === slot.currentlyOwnedBy;
                                    const isOrigin = other.id === slot.sourceTeamId;
                                    return (
                                      <div key={other.id}
                                        onClick={() => moveKeeperToTeam(slot.sourceTeamId, slot.sourceIdx, other.id)}
                                        style={{ padding: '6px 12px', fontSize: '12px', color: isCurrent ? t.textMuted : t.textBody, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontStyle: isCurrent ? 'italic' : 'normal' }}
                                        onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.background = t.sectionBg; e.currentTarget.style.color = accentColor; } }}
                                        onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.textBody; } }}
                                      >
                                        <span>{other.name}</span>
                                        {isCurrent && <span style={{ fontSize: 10 }}>current</span>}
                                        {isOrigin && !isCurrent && <span style={{ fontSize: 10, color: t.textMuted }}>origin</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            </Tooltip>
                          ) : isPreseason ? (
                            <button onClick={() => setEditingTeam({ team, autoAdd: true })} title="Add a keeper" style={{
                              display: 'block', width: '100%', boxSizing: 'border-box',
                              background: needsMore ? `${accentColor}10` : 'transparent',
                              border: `1px dashed ${needsMore ? accentColor : t.border}`,
                              borderRadius: tokens.radiusSm,
                              padding: '12px 10px', fontSize: '11px', minHeight: 50,
                              color: needsMore ? accentColor : t.textMuted, cursor: 'pointer',
                              fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: needsMore ? 600 : 400,
                              textAlign: 'center',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.color = accentColor; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = needsMore ? accentColor : t.border; e.currentTarget.style.color = needsMore ? accentColor : t.textMuted; }}
                            >+ Add</button>
                          ) : (
                            <span style={{ fontSize: '12px', color: t.textMuted, opacity: 0.4 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    {/* Edit button — sticky pinned to right edge while K columns scroll */}
                    <td style={{ position: 'sticky', right: 0, zIndex: 2, background: t.cardBg, padding: '12px 16px 12px 12px', textAlign: 'center', width: EDIT_W, minWidth: EDIT_W, boxShadow: scrollCanRight ? '-4px 0 6px -3px rgba(0,0,0,0.12)' : 'none' }}>
                      <button onClick={() => setEditingTeam({ team, autoAdd: false })} style={{
                        background: 'none', border: `1px solid ${t.border}`, borderRadius: 6,
                        padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                        color: t.textSecondary, cursor: 'pointer', whiteSpace: 'nowrap',
                        fontFamily: 'inherit',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.color = accentColor; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.color = t.textSecondary; }}
                      >Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>)}
        </div>
      </div>
    </>
  );
}

function SetupSeasonBanner({ league, isDark, accentColor, onStart }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const slot = league.keeperSlots;
  // Detect progress against THIS season's keepers (not the priorKeepers we seed for display)
  const teamsWithKeepers = teams.filter(tm => (tm.keepers || []).length > 0).length;
  const teamsAtCap = teams.filter(tm => (tm.keepers || []).length >= slot).length;
  const rostersLoaded = teams.filter(tm => (tm.roster || []).length > 0).length;
  const state = league.setupComplete
    ? 'complete'
    : (teamsWithKeepers > 0 || rostersLoaded > 0)
      ? 'inprogress'
      : 'notstarted';

  if (state === 'complete') {
    return (
      <div style={{ background: t.cardBg, border: `1px solid rgba(76,175,125,0.3)`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(76,175,125,0.2)', color: '#6dd4a8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>✓</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>Season is set up</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>All {teamsAtCap}/{teams.length} teams locked in. Keepers below.</div>
        </div>
        <button onClick={onStart} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Edit Setup</button>
      </div>
    );
  }

  const ctaLabel = state === 'inprogress' ? 'Continue setup →' : 'Set up new season →';
  const titleText = state === 'inprogress' ? `Season setup in progress` : `Ready to set up the ${league.season} season`;
  const subText = state === 'inprogress'
    ? `${teamsWithKeepers}/${teams.length} teams started${rostersLoaded > 0 ? ` · ${rostersLoaded} roster${rostersLoaded === 1 ? '' : 's'} loaded` : ''}`
    : `Walk through keeper selection for all ${teams.length} teams. Roster imports, prior contracts, and draft values feed into one place.`;
  const pct = teams.length > 0 ? (teamsWithKeepers / teams.length) * 100 : 0;

  return (
    <div style={{
      background: state === 'inprogress' ? `linear-gradient(135deg, ${accentColor}14, ${accentColor}05)` : t.cardBg,
      border: `1px solid ${state === 'inprogress' ? `${accentColor}55` : t.border}`,
      borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        {state === 'inprogress' ? '⏳' : '📋'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>{titleText}</span>
          {state === 'inprogress' && (
            <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, background: `${accentColor}18`, padding: '2px 8px', borderRadius: 10, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>In progress</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>{subText}</div>
        {state === 'inprogress' && (
          <div style={{ background: t.progressBg, borderRadius: 4, height: 4, marginTop: 8, maxWidth: 320 }}>
            <div style={{ background: accentColor, height: '100%', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }}></div>
          </div>
        )}
      </div>
      <button onClick={onStart} style={{
        background: accentColor, color: '#fff', border: 'none', borderRadius: 8,
        padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        {ctaLabel}
      </button>
    </div>
  );
}

function OverviewTab({ league, accentColor, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const isPreseason = league.status === 'pre-draft' || league.status === 'setup';
  const [showWizard, setShowWizard] = React.useState(false);

  if (showWizard) {
    return (
      <SeasonSetupWizard
        league={league}
        accentColor={accentColor}
        isDark={isDark}
        onUpdateLeague={onUpdateLeague}
        onComplete={() => {
          if (onUpdateLeague) onUpdateLeague({ ...league, setupComplete: true });
          setShowWizard(false);
        }}
        onExit={() => setShowWizard(false)}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isPreseason && (
        <SetupSeasonBanner league={league} isDark={isDark} accentColor={accentColor} onStart={() => setShowWizard(true)} />
      )}
      <CompactKeeperGrid
        league={league}
        accentColor={accentColor}
        isDark={isDark}
        onUpdateLeague={onUpdateLeague}
      />
    </div>
  );
}

Object.assign(window, { OverviewTab, CompactKeeperGrid, ChecklistCard });

export { ChecklistCard, CompactKeeperGrid, SetupSeasonBanner, OverviewTab };
