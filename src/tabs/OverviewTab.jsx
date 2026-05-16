import React from 'react';
import { makeTheme, Tooltip } from '../components.jsx';
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
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Keepers</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '12px', color: t.textMuted }}>{withKeepersCount}/{teams.length} teams started</span>
            {isPreseason && <span style={{ fontSize: '11px', fontWeight: 700, color: accentColor, background: `${accentColor}18`, borderRadius: 20, padding: '2px 8px' }}>Pre-Season</span>}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
            <thead>
              <tr style={{ background: t.sectionBg }}>
                <th style={{ padding: '9px 16px 9px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap', width: 130 }}>Team</th>
                {Array.from({ length: maxKeepers }, (_, i) => (
                  <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap' }}>
                    K{i + 1}
                  </th>
                ))}
                <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: `1px solid ${t.divider}`, width: 60 }}></th>
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
                    style={{ borderBottom: i < teams.length - 1 ? `1px solid ${t.dividerFaint}` : 'none', transition: 'background 0.12s', verticalAlign: 'middle' }}
                    onMouseEnter={e => e.currentTarget.style.background = t.sectionBg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Team name */}
                    <td style={{ padding: '12px 8px 12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>
                          {team.name[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary }}>{team.name}</div>
                          {(needsMore || overflow.length > 0) && (
                            <div style={{ fontSize: '10px', color: '#e8832a', marginTop: 2, fontWeight: 600 }}>
                              {needsMore && `${activeCount}/${requiredCount} required`}
                              {overflow.length > 0 && ` +${overflow.length} extra`}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Keeper slots */}
                    {slots.map((slot, ki) => {
                      const popoverOpen = slot && movingKeeper && movingKeeper.teamId === slot.sourceTeamId && movingKeeper.keeperIdx === slot.sourceIdx;
                      const expiring = slot && league.draftType === 'snake' && slot.contractYear >= slot.contractLength;
                      return (
                        <td key={ki} style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                          {slot ? (
                            <Tooltip
                              isDark={isDark}
                              content={expiring && !slot.isOutgoing
                                ? `Final year of contract — ${slot.player} goes back to the draft after this season.`
                                : null}>
                            <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                {(() => {
                                  const p = playerMap?.get(normalizeName(slot.player));
                                  return p?.headshot ? (
                                    <img src={p.headshot} alt="" width={22} height={22}
                                      style={{ borderRadius: '50%', background: t.sectionBg, objectFit: 'cover', flexShrink: 0, opacity: slot.isOutgoing ? 0.45 : 1 }}
                                      onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
                                  ) : null;
                                })()}
                                <span style={{
                                  fontSize: '13px',
                                  color: slot.isOutgoing ? t.textMuted : (expiring ? '#e85252' : t.textPrimary),
                                  fontWeight: slot.isOutgoing ? 500 : 700,
                                  textDecoration: slot.isOutgoing ? 'line-through' : 'none',
                                }}>
                                  {slot.player}
                                </span>
                                {league.draftType === 'snake' && (
                                  <span style={{ fontSize: '10px', color: slot.isOutgoing ? t.textMuted : (expiring ? '#e85252' : t.textMuted), textDecoration: slot.isOutgoing ? 'line-through' : 'none' }}>
                                    Y{slot.contractYear}/{slot.contractLength}
                                  </span>
                                )}
                                {league.draftType === 'auction' && (
                                  <span style={{ fontSize: '10px', color: slot.isOutgoing ? t.textMuted : accentColor, fontWeight: 700, textDecoration: slot.isOutgoing ? 'line-through' : 'none' }}>${slot.keptFor}</span>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setMovingKeeper(popoverOpen ? null : { teamId: slot.sourceTeamId, keeperIdx: slot.sourceIdx }); }}
                                  title="Reassign to another team (mid-season trade)"
                                  style={{ background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', fontSize: '10px', color: t.textMuted, opacity: 0.5, lineHeight: 1, fontFamily: 'inherit' }}
                                  onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = accentColor; }}
                                  onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = t.textMuted; }}
                                >✎</button>
                              </div>
                              {slot.isOutgoing && (
                                <span style={{ fontSize: '10px', color: '#e8832a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  → traded to {teamName(slot.tradedTo)}
                                </span>
                              )}
                              {slot.isIncoming && (
                                <span style={{ fontSize: '10px', color: '#4caf7d', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                  ← from {slot.fromTeamName}
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
                              background: needsMore ? `${accentColor}10` : 'none',
                              border: `1px dashed ${needsMore ? accentColor : t.border}`,
                              borderRadius: 6, padding: '5px 10px', fontSize: '11px',
                              color: needsMore ? accentColor : t.textMuted, cursor: 'pointer',
                              fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: needsMore ? 600 : 400,
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
                    {/* Edit button */}
                    <td style={{ padding: '12px 16px 12px 12px', textAlign: 'center' }}>
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

function OverviewTab({ league, accentColor, isDark, onGoToTab, onUpdateLeague }) {
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
