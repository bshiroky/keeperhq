import React from 'react';
import { Lock, Check, Clock, ClipboardList } from 'lucide-react';
import { makeTheme, tokens, Button } from '../components.jsx';
import { SeasonSetupWizard } from './SetupTab.jsx';
import { KeeperEditModal } from './KeepersTab.jsx';
import { SampleKeeperCell } from './keeper-grid-variants.jsx';
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
          <span style={{ fontSize: '11px', fontWeight: 700, color: t.success, background: t.successBg, borderRadius: 20, padding: '3px 10px', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {status === 'locked' ? <><Lock size={11} strokeWidth={2} /> Locked</> : <><Check size={11} strokeWidth={2} /> Done</>}
          </span>
        )}
      </div>

      {/* Middle: progress bar (spacer if absent so button stays at bottom) */}
      <div style={{ flex: 1 }}>
        {total > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '12px', color: t.textMuted }}>{value} of {total}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: done ? t.success : accentColor }}>{pct}%</span>
            </div>
            <div style={{ background: t.progressBg, borderRadius: 4, height: 5 }}>
              <div style={{ background: done ? t.success : accentColor, height: '100%', borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }}></div>
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
  // Grid accent is driven by draft type, not sport: contract/snake = blue,
  // auction = orange. Used for keeper values + empty "+ Add" cells + the
  // Pre-Season pill so both league types read as consistently themed.
  const gridAccent = league.draftType === 'auction' ? tokens.warning : tokens.info;

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
  const EDIT_W = 73;

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

  // A traded keeper is shown only on its ORIGINAL team's cell (struck-through
  // with a "→ traded to X" line). It is intentionally NOT rendered on the
  // receiving team — no incoming/acquired list, no duplicate, and the grid
  // never exceeds the league's max keeper slots.
  function getDisplayKeepers(team) {
    return (team.keepers || []).map((k, idx) => ({
      ...k, sourceTeamId: team.id, sourceIdx: idx,
      currentlyOwnedBy: k.tradedTo || team.id,
      isOutgoing: !!k.tradedTo,
    }));
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
            {isPreseason && <span style={{ fontSize: '11px', fontWeight: 700, color: gridAccent, background: `${gridAccent}18`, borderRadius: 20, padding: '2px 8px' }}>Pre-Season</span>}
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
            // Stretch: fill the container. Scroll: an explicit pixel width
            // (sum of fixed columns) — NOT max-content, which lets fixed-layout
            // columns grow to fit long names instead of truncating them.
            width: stretchMode ? '100%' : `${TEAM_W + maxKeepers * COL_W + EDIT_W}px`,
            tableLayout: 'fixed',
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
                // Slots are roster spots K1..maxKeepers, capped at the league
                // max. Each own keeper sits in its slot; traded-out keepers
                // stay in place (struck-through, "→ traded to X"). No incoming
                // keepers are added — a traded player shows only on its source
                // team — so a team never displays more than maxKeepers columns.
                const ownKeepers = team.keepers || [];
                const slots = Array.from({ length: maxKeepers }, (_, ki) => {
                  const k = ownKeepers[ki];
                  if (k) {
                    return {
                      ...k, sourceTeamId: team.id, sourceIdx: ki,
                      isOutgoing: !!k.tradedTo,
                      currentlyOwnedBy: k.tradedTo || team.id,
                    };
                  }
                  return null;
                });
                const activeCount = slots.filter(s => s && !s.isOutgoing).length;
                const requiredCount = league.contractsRequired ? maxKeepers : 0;
                const needsMore = isPreseason && activeCount < requiredCount;
                const rowBorder = i < teams.length - 1 ? `1px solid ${t.border}` : 'none';
                return (
                  <tr key={team.id} style={{ verticalAlign: 'middle' }}>
                    {/* Team name — sticky pinned to left edge while K columns scroll */}
                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: t.cardBg, padding: '12px 8px 12px 16px', whiteSpace: 'nowrap', width: TEAM_W, minWidth: TEAM_W, borderBottom: rowBorder, boxShadow: scrollCanLeft ? '4px 0 6px -3px rgba(0,0,0,0.12)' : 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</div>
                      {needsMore && (
                        <div style={{ fontSize: '10px', color: t.warning, marginTop: 2, fontWeight: 600 }}>
                          {activeCount}/{requiredCount} required
                        </div>
                      )}
                    </td>
                    {/* Keeper slots */}
                    {slots.map((slot, ki) => {
                      const popoverOpen = slot && movingKeeper && movingKeeper.teamId === slot.sourceTeamId && movingKeeper.keeperIdx === slot.sourceIdx;
                      return (
                        <td key={ki} style={{ padding: '8px 10px', verticalAlign: 'middle', borderBottom: rowBorder }}>
                          {slot ? (
                            <SampleKeeperCell
                              slot={slot}
                              isSnake={league.draftType === 'snake'}
                              isDark={isDark}
                              gridAccent={gridAccent}
                              onReassignClick={(e) => { e.stopPropagation(); setMovingKeeper(popoverOpen ? null : { teamId: slot.sourceTeamId, keeperIdx: slot.sourceIdx }); }}
                              tradedToName={slot.isOutgoing ? teamName(slot.tradedTo) : null}
                            >
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
                            </SampleKeeperCell>
                          ) : isPreseason ? (
                            <button onClick={() => setEditingTeam({ team, autoAdd: true })} title="Add a keeper" style={{
                              display: 'block', width: '100%', boxSizing: 'border-box',
                              background: needsMore ? `${gridAccent}10` : 'transparent',
                              border: `1px dashed ${gridAccent}`,
                              borderRadius: tokens.radiusSm,
                              padding: '12px 10px', fontSize: '11px', minHeight: 50,
                              color: gridAccent, cursor: 'pointer',
                              fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: needsMore ? 600 : 400,
                              textAlign: 'center',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.background = `${gridAccent}10`; }}
                              onMouseLeave={e => { e.currentTarget.style.background = needsMore ? `${gridAccent}10` : 'transparent'; }}
                            >+ Add</button>
                          ) : (
                            <span style={{ fontSize: '12px', color: t.textMuted, opacity: 0.4 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                    {/* Edit button — sticky pinned to right edge. Right-anchored
                        with a 20px right pad so the gap to the table edge matches
                        the 20px inter-card gap; EDIT_W (73) is sized so the left
                        gap (10px K-cell pad + button offset) lands at 20px too. */}
                    <td style={{ position: 'sticky', right: 0, zIndex: 2, background: t.cardBg, padding: '12px 20px 12px 10px', textAlign: 'right', width: EDIT_W, minWidth: EDIT_W, borderBottom: rowBorder, boxShadow: scrollCanRight ? '-4px 0 6px -3px rgba(0,0,0,0.12)' : 'none' }}>
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
      <div style={{ background: t.cardBg, border: `1px solid ${t.successBorder}`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 24, height: 24, borderRadius: '50%', background: t.successBg, color: t.success, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={14} strokeWidth={2.25} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>Season is set up</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>All {teamsAtCap}/{teams.length} teams locked in. Keepers below.</div>
        </div>
        <Button variant="secondary" size="sm" isDark={isDark} onClick={onStart}>Edit Setup</Button>
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
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: accentColor }}>
        {state === 'inprogress' ? <Clock size={18} strokeWidth={1.5} /> : <ClipboardList size={18} strokeWidth={1.5} />}
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
      <Button variant="primary" size="md" accent={accentColor} isDark={isDark} onClick={onStart} style={{ flexShrink: 0 }}>
        {ctaLabel}
      </Button>
    </div>
  );
}

// ── Redesigned Overview — full-width grid of uniform team cards ──────────────
// Each card: header (avatar + team name + x/N pill) over a fixed K1..N slot
// list. Filled slots reuse the SampleKeeperCell value/expiring color logic
// (gridAccent value; danger + "Final yr" when contractYear >= contractLength);
// empty slots read "Open slot". The whole card jumps to Set-keepers for that
// team. Below the grid, snake leagues get the "Expiring after this season"
// roll-up (the back-to-the-draft list).

function keeperValueText(k, isSnake) {
  return isSnake ? `Y${k.contractYear}/${k.contractLength}` : `$${k.keptFor}`;
}

function TeamKeeperCard({ team, league, accentColor, gridAccent, isDark, onOpen }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';
  const slots = league.keeperSlots || 0;
  const keepers = team.keepers || [];
  const count = keepers.length;
  const complete = slots > 0 && count >= slots;
  const countColor = complete ? tokens.success : (count > 0 ? gridAccent : t.textMuted);
  const countBg = complete ? t.successBg : (count > 0 ? `${gridAccent}18` : t.sectionBg);
  const countBorder = complete ? t.successBorder : (count > 0 ? `${gridAccent}55` : t.border);

  return (
    <button onClick={() => onOpen(team.id)} className="kh-team-card" style={{
      textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', padding: 0,
      background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg,
      boxShadow: t.cardShadow, overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${t.divider}`, background: t.sectionBg }}>
        <div style={{ width: 30, height: 30, borderRadius: tokens.radiusMd, background: `${accentColor}22`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          {(team.name || '?')[0]}
        </div>
        <span style={{ ...tokens.typeBody, fontWeight: 700, color: t.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</span>
        <span style={{ ...tokens.typePill, fontWeight: 700, color: countColor, background: countBg, border: `1px solid ${countBorder}`, borderRadius: tokens.radiusPill, padding: '2px 9px', flexShrink: 0 }}>{count}/{slots}</span>
      </div>
      <div style={{ padding: '2px 14px' }}>
        {Array.from({ length: slots }, (_, i) => {
          const k = keepers[i];
          const last = i === slots - 1;
          const expiring = k && isSnake && k.contractYear >= k.contractLength;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: last ? 'none' : `1px solid ${t.dividerFaint}`, minHeight: 38, boxSizing: 'border-box' }}>
              <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, width: 22, flexShrink: 0 }}>K{i + 1}</span>
              {k ? (
                <>
                  <span style={{ ...tokens.typeBody, fontWeight: 600, color: expiring ? t.danger : t.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.player}</span>
                  {expiring && <span style={{ ...tokens.typePillEmphatic, color: t.danger, flexShrink: 0 }}>Final yr</span>}
                  <span style={{ ...tokens.typePill, fontWeight: 700, color: expiring ? t.danger : gridAccent, flexShrink: 0 }}>{keeperValueText(k, isSnake)}</span>
                </>
              ) : (
                <span style={{ ...tokens.typeBody, color: t.textMuted, fontStyle: 'italic', flex: 1 }}>Open slot</span>
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

function ExpiringSection({ expiring, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, flexShrink: 0 }} />
        <span style={{ ...tokens.typeHeadingSection, color: t.textSecondary }}>Expiring after this season</span>
        <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginLeft: 'auto' }}>{expiring.length} going back to the draft</span>
      </div>
      <div style={{ padding: '14px 16px' }}>
        {expiring.length === 0 ? (
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>No contracts expire this season.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {expiring.map((k, i) => (
              <span key={`${k.teamName}-${k.player}-${i}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: tokens.radiusPill,
                padding: '4px 10px',
              }}>
                <span style={{ ...tokens.typePill, fontWeight: 700, color: t.danger }}>{k.player}</span>
                <span style={{ ...tokens.typePill, color: t.textMuted }}>· {k.teamName}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KeepersOverview({ league, accentColor, isDark, onOpenTeam }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const isSnake = league.draftType === 'snake';
  const slots = league.keeperSlots || 0;
  // Grid accent follows draft type (blue snake / orange auction), matching the
  // value coloring used across the keeper surfaces.
  const gridAccent = league.draftType === 'auction' ? tokens.warning : tokens.info;

  if (teams.length === 0 || slots === 0) {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.textSecondary, marginBottom: 4 }}>
          {teams.length === 0 ? 'No teams yet' : 'No keeper slots configured'}
        </div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>
          {teams.length === 0
            ? 'Add teams in Settings to start picking keepers.'
            : 'Set Keeper Slots in Settings to use this view.'}
        </div>
      </div>
    );
  }

  const expiring = isSnake
    ? teams.flatMap(tm => (tm.keepers || [])
        .filter(k => k.contractYear >= k.contractLength)
        .map(k => ({ ...k, teamName: tm.name })))
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <style>{`.kh-team-card { transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; } .kh-team-card:hover { transform: translateY(-2px); border-color: ${accentColor}66; }`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {teams.map(team => (
          <TeamKeeperCard key={team.id} team={team} league={league} accentColor={accentColor} gridAccent={gridAccent} isDark={isDark} onOpen={onOpenTeam} />
        ))}
      </div>
      {isSnake && <ExpiringSection expiring={expiring} isDark={isDark} />}
    </div>
  );
}

function OverviewTab({ league, accentColor, isDark, onUpdateLeague, showWizard: showWizardProp, setShowWizard: setShowWizardProp }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const isPreseason = league.status === 'pre-draft' || league.status === 'setup';
  // Wizard open-state is lifted to LeagueView (so its celebration effect can
  // skip while the wizard owns the moment). Fall back to local state if this
  // tab is ever rendered without the props.
  const [showWizardLocal, setShowWizardLocal] = React.useState(false);
  const showWizard = showWizardProp ?? showWizardLocal;
  const setShowWizard = setShowWizardProp ?? setShowWizardLocal;

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

Object.assign(window, { OverviewTab, CompactKeeperGrid, ChecklistCard, KeepersOverview });

export { ChecklistCard, CompactKeeperGrid, SetupSeasonBanner, OverviewTab, KeepersOverview, TeamKeeperCard, ExpiringSection };
