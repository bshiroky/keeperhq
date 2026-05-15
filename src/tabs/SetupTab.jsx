import React from 'react';
import { makeTheme, getLeagueStats, HScrollRow } from '../components.jsx';
import { RosterImportModal } from './RosterImportTab.jsx';
import { DataSourcesPanel } from './SourcesTab.jsx';
import '../claudeStub.js';

// Season Setup Wizard

const SETUP_STEPS_SNAKE = ['keepers', 'done'];
const SETUP_STEPS_AUCTION = ['keepers', 'done'];

const STEP_META = {
  'intro':    { label: 'Overview', icon: '📋' },
  'keepers':  { label: 'Keepers',  icon: '👥' },
  'done':     { label: 'Ready',    icon: '✓'  },
};

// ── Step progress bar ────────────────────────────────────────────────────────
function WizardProgress({ steps, currentStep, accentColor, isDark }) {
  const t = makeTheme(isDark);
  const currentIdx = steps.indexOf(currentStep);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {steps.map((step, i) => {
        const meta = STEP_META[step];
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={step}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: '0 0 auto' }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: done ? '#4caf7d' : active ? accentColor : t.sectionBg,
                border: `2px solid ${done ? '#4caf7d' : active ? accentColor : t.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
                color: done || active ? '#fff' : t.textMuted,
                transition: 'all 0.2s',
              }}>{done ? '✓' : meta.icon}</div>
              <div style={{ fontSize: '11px', fontWeight: active ? 700 : 500, color: active ? accentColor : done ? t.textSecondary : t.textMuted, whiteSpace: 'nowrap' }}>
                {meta.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < currentIdx ? '#4caf7d' : t.border, margin: '0 8px', marginBottom: 20 }}></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, accentColor, isDark, onConfirm, onCancel }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '24px 28px', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={onConfirm} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Step: Intro ──────────────────────────────────────────────────────────────
function StepIntro({ league, steps, accentColor, isDark, onNext }) {
  const t = makeTheme(isDark);
  const isNew = !league.teams || league.teams.every(tm => !tm.keepers || tm.keepers.length === 0);
  const descriptions = {
    'keepers':  'Set each team’s keepers. Click eligible players in the side panel, or import a roster.',
  };
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, padding: '24px 28px' }}>
      <div style={{ fontSize: '20px', fontWeight: 800, color: t.textPrimary, marginBottom: 6 }}>Set up {league.season} season</div>
      <div style={{ fontSize: '14px', color: t.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
        {isNew ? "This is a new league. We'll walk through each step to get ready for draft day." : "Let's get this season set up. We've pre-loaded last season's keepers as a starting point."}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {steps.filter(s => s !== 'intro' && s !== 'done').map((step, i) => {
          const meta = STEP_META[step];
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', background: t.sectionBg, borderRadius: 10, border: `1px solid ${t.border}` }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, marginTop: 1 }}>{meta.icon}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Step {i + 1}: {meta.label}</div>
                <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>{descriptions[step]}</div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={onNext} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Begin Setup →</button>
    </div>
  );
}

// ── Player search using Claude completion ────────────────────────────────────
function PlayerSearch({ sport, value, onChange, accentColor, isDark, autoFocus }) {
  const t = makeTheme(isDark);
  const [query, setQuery] = React.useState(value || '');
  const [suggestions, setSuggestions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const debounceRef = React.useRef(null);

  React.useEffect(() => {
    if (!query || query.length < 2) { setSuggestions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const sportLabel = sport === 'hockey' ? 'NHL hockey' : sport === 'basketball' ? 'NBA basketball' : sport === 'baseball' ? 'MLB baseball' : 'NFL football';
        const result = await window.claude.complete(
          `List 5 active ${sportLabel} player names matching "${query}". Return ONLY a JSON array of strings, no other text. Example: ["Connor McDavid","Connor Bedard"]`
        );
        const cleaned = result.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) setSuggestions(parsed.slice(0, 5));
      } catch (e) { setSuggestions([]); }
      setLoading(false);
    }, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [query, sport]);

  function pick(name) { setQuery(name); onChange(name); setOpen(false); }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        autoFocus={autoFocus}
        placeholder="Search player…"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{ width: '100%', background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', fontSize: '14px', color: t.textPrimary, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      {open && (loading || suggestions.length > 0) && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: isDark ? '#1c2130' : '#ffffff', border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
          {loading && <div style={{ padding: '8px 12px', fontSize: '12px', color: t.textMuted }}>Searching…</div>}
          {!loading && suggestions.map(name => (
            <div key={name} onMouseDown={() => pick(name)} style={{ padding: '8px 12px', fontSize: '13px', color: t.textPrimary, cursor: 'pointer', borderBottom: `1px solid ${t.dividerFaint}` }}
              onMouseEnter={e => e.currentTarget.style.background = t.sectionBg}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step: Review existing keepers ───────────────────────────────────────────
function StepReviewKeepers({ league, accentColor, isDark, onUpdateLeague, onNext, onBack }) {
  const t = makeTheme(isDark);
  // Seed initial state from priorKeepers (last season's roster).
  // Advance contract year by 1 immediately so user sees what THIS year's contract would be if kept.
  const [teams, setTeams] = React.useState(() => {
    const cloned = JSON.parse(JSON.stringify(league.teams || []));
    return cloned.map(tm => {
      const source = (tm.keepers && tm.keepers.length > 0) ? tm.keepers : (tm.priorKeepers || []);
      return {
        ...tm,
        keepers: source.map(k => {
          if (league.draftType === 'snake') {
            const newYr = (k.contractYear || 0) + 1;
            return {
              player: k.player,
              contractYear: newYr,
              contractLength: k.contractLength || 3,
              note: k.note,
              expiresAfter: `${2025 + ((k.contractLength || 3) - newYr)}-${String(2025 + ((k.contractLength || 3) - newYr) + 1).slice(2)}`,
            };
          }
          return k;
        }).filter(k => league.draftType !== 'snake' || k.contractYear <= k.contractLength),
      };
    });
  });
  const [dropped, setDropped] = React.useState([]);
  const [draggedPlayer, setDraggedPlayer] = React.useState(null);
  const [editingPlayer, setEditingPlayer] = React.useState(null); // {teamId, idx}

  function dropPlayer(teamId, idx) {
    const team = teams.find(tm => tm.id === teamId);
    const player = team.keepers[idx];
    setDropped([...dropped, { ...player, fromTeam: team.name, fromTeamId: teamId }]);
    setTeams(teams.map(tm => tm.id === teamId ? { ...tm, keepers: tm.keepers.filter((_, i) => i !== idx) } : tm));
  }

  function undropPlayer(droppedIdx) {
    const p = dropped[droppedIdx];
    const { fromTeam, fromTeamId, ...keeper } = p;
    setTeams(teams.map(tm => tm.id === fromTeamId ? { ...tm, keepers: [...tm.keepers, keeper] } : tm));
    setDropped(dropped.filter((_, i) => i !== droppedIdx));
  }

  function movePlayer(fromTeamId, playerIdx, toTeamId) {
    if (fromTeamId === toTeamId) return;
    const fromTeam = teams.find(tm => tm.id === fromTeamId);
    const player = fromTeam.keepers[playerIdx];
    setTeams(teams.map(tm => {
      if (tm.id === fromTeamId) return { ...tm, keepers: tm.keepers.filter((_, i) => i !== playerIdx) };
      if (tm.id === toTeamId) return { ...tm, keepers: [...tm.keepers, { ...player, movedFrom: fromTeam.name }] };
      return tm;
    }));
  }

  function editPlayerTeam(fromTeamId, idx, toTeamId) {
    movePlayer(fromTeamId, idx, toTeamId);
    setEditingPlayer(null);
  }

  function handleNext() {
    // Already advanced contract years on entry; just persist as-is.
    if (onUpdateLeague) onUpdateLeague({ ...league, teams });
    onNext();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, padding: '16px 20px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: t.textPrimary }}>Review Existing Keepers</div>
        <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2 }}>Players staying with their team will auto-roll over. <strong style={{ color: '#e85252' }}>Drop</strong> any you're releasing back to the draft pool. Drag a card to another team for offseason trades. Click the ✎ to change a player's team.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {teams.map(team => (
          <div key={team.id}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (draggedPlayer) {
                if (draggedPlayer.dropped) {
                  // undrop into this team
                  const p = dropped[draggedPlayer.idx];
                  const { fromTeam, fromTeamId, ...keeper } = p;
                  setTeams(teams.map(tm => tm.id === team.id ? { ...tm, keepers: [...tm.keepers, { ...keeper, movedFrom: fromTeam }] } : tm));
                  setDropped(dropped.filter((_, i) => i !== draggedPlayer.idx));
                } else {
                  movePlayer(draggedPlayer.teamId, draggedPlayer.playerIdx, team.id);
                }
                setDraggedPlayer(null);
              }
            }}
            style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}
          >
            <div style={{ padding: '10px 14px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>{team.name[0]}</div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary, flex: 1 }}>{team.name}</span>
              <span style={{ fontSize: '11px', color: t.textMuted }}>{team.keepers.length}</span>
            </div>
            <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
              {team.keepers.length === 0 && (
                <div style={{ fontSize: '12px', color: t.textMuted, fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>Drop players here to reassign</div>
              )}
              {team.keepers.map((k, i) => {
                const expiring = league.draftType === 'snake' && k.contractYear === k.contractLength;
                const isEditing = editingPlayer && editingPlayer.teamId === team.id && editingPlayer.idx === i;
                return (
                  <div key={i}
                    draggable
                    onDragStart={() => setDraggedPlayer({ teamId: team.id, playerIdx: i })}
                    onDragEnd={() => setDraggedPlayer(null)}
                    style={{
                      padding: '8px 10px', borderRadius: 8, cursor: 'grab',
                      background: t.sectionBg, border: `1px solid ${t.border}`,
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary }}>{k.player}</span>
                          <button onClick={() => setEditingPlayer({ teamId: team.id, idx: i })} title="Change team"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: t.textMuted, opacity: 0.7 }}>✎</button>
                        </div>
                        {isEditing && (
                          <select autoFocus
                            defaultValue={team.id}
                            onChange={e => editPlayerTeam(team.id, i, e.target.value)}
                            onBlur={() => setEditingPlayer(null)}
                            style={{ marginTop: 4, background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`, borderRadius: 6, padding: '3px 6px', fontSize: '11px', color: t.textPrimary, fontFamily: 'inherit', width: '100%' }}>
                            {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                          </select>
                        )}
                        {league.draftType === 'snake' && (
                          <div style={{ fontSize: '11px', color: expiring ? '#e85252' : t.textMuted, marginTop: 1 }}>
                            Y{k.contractYear}/{k.contractLength}{expiring && ' · last year ⚠'}
                          </div>
                        )}
                        {league.draftType === 'auction' && (
                          <div style={{ fontSize: '11px', color: accentColor, fontWeight: 700, marginTop: 1 }}>${k.keptFor}</div>
                        )}
                        {k.movedFrom && (
                          <div style={{ fontSize: '10px', color: '#e8832a', fontWeight: 600, marginTop: 2 }}>↔ from {k.movedFrom}</div>
                        )}
                      </div>
                      <button onClick={() => dropPlayer(team.id, i)} title="Drop to draft pool"
                        style={{ background: 'rgba(232,82,82,0.12)', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#e85252', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Drop</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {dropped.length > 0 && (
        <div style={{ background: t.cardBg, border: `1px dashed #e85252`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'rgba(232,82,82,0.06)', borderBottom: `1px solid rgba(232,82,82,0.2)`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>↩</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#e85252', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Going Back to Draft ({dropped.length})</span>
            <span style={{ fontSize: '11px', color: t.textMuted, marginLeft: 'auto' }}>Click "Undo" to put a player back on their team</span>
          </div>
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dropped.map((p, i) => (
              <div key={i}
                draggable
                onDragStart={() => setDraggedPlayer({ dropped: true, idx: i })}
                onDragEnd={() => setDraggedPlayer(null)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, cursor: 'grab' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary }}>{p.player}</span>
                  <span style={{ fontSize: '11px', color: t.textMuted, marginLeft: 8 }}>dropped from {p.fromTeam}</span>
                </div>
                <button onClick={() => undropPlayer(i)} style={{ background: 'rgba(76,175,125,0.12)', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: '11px', fontWeight: 600, color: '#6dd4a8', cursor: 'pointer', fontFamily: 'inherit' }}>↶ Undo</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>← Back</button>
        <button onClick={handleNext} style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit' }}>Continue → Add New</button>
      </div>
    </div>
  );
}

// ── Step: Add new keepers (per-team) ─────────────────────────────────────────
function StepAddNewKeepers({ league, accentColor, isDark, onUpdateLeague, onNext, onBack }) {
  const t = makeTheme(isDark);
  const [teams, setTeams] = React.useState(() => JSON.parse(JSON.stringify(league.teams || [])));
  const [activeTeamIdx, setActiveTeamIdx] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [viewMode, setViewMode] = React.useState('team'); // 'team' | 'all'
  const [newPlayer, setNewPlayer] = React.useState('');
  const [newCost, setNewCost] = React.useState(1);
  const [newTermYears, setNewTermYears] = React.useState(3);
  const [poolFilter, setPoolFilter] = React.useState('own'); // 'own' | 'other' | 'ineligible'
  const [poolSearch, setPoolSearch] = React.useState('');
  const [ineligibleSort, setIneligibleSort] = React.useState('reason'); // 'reason' | 'alpha' | 'team'
  const [showRosterImport, setShowRosterImport] = React.useState(false);

  const activeTeam = teams[activeTeamIdx];
  const activeKeepers = activeTeam.keepers || [];
  const slotsLeft = league.keeperSlots - activeKeepers.length;
  const overSlots = activeKeepers.length > league.keeperSlots;

  const lastNameOf = (name) => {
    const parts = (name || '').trim().split(/\s+/);
    return parts.length ? parts[parts.length - 1].toLowerCase() : '';
  };

  // ─── Build the eligible pool ──────────────────────────────────────────────
  // Per team: produces an entry for every player who *could* show up in any tab,
  // with eligibility metadata so the filter can split them between 3 tabs.
  const allKeptThisYear = new Set();
  teams.forEach(tm => (tm.keepers || []).forEach(k => k.player && allKeptThisYear.add(k.player)));

  const bumpAuction = (league.auctionRules && league.auctionRules.costIncreasePerYear) || 5;
  const baseAuction = (league.auctionRules && league.auctionRules.undraftedStartCost) || 5;

  const pool = [];
  teams.forEach(tm => {
    const roster = tm.roster || [];
    const rosterMode = roster.length > 0;
    const priors = tm.priorKeepers || [];
    const priorByName = new Map(priors.map(p => [p.player.toLowerCase(), p]));
    const rosterByName = new Map(roster.map(r => [r.player.toLowerCase(), r]));

    function buildEntry({ source, player, pos, prior, isOnRoster }) {
      // Compute expired (snake only)
      const expired = !!prior && (prior.expired || (league.draftType === 'snake' && (prior.contractYear || 0) + 1 > (prior.contractLength || 3)));

      // Snake eligibility: needs a non-expired contract + (if rosterMode) on roster
      // Auction eligibility: in rosterMode -> on roster; otherwise prior keeper (any non-expired entry)
      let eligible, reason;
      if (league.draftType === 'snake') {
        if (!prior)             { eligible = false; reason = 'no-contract'; }
        else if (expired)       { eligible = false; reason = 'expired'; }
        else if (rosterMode && !isOnRoster) { eligible = false; reason = 'not-on-roster'; }
        else                    { eligible = true;  reason = null; }
      } else {
        if (rosterMode) {
          if (!isOnRoster)      { eligible = false; reason = 'not-on-roster'; }
          else                  { eligible = true;  reason = null; }
        } else {
          if (!prior)           { eligible = false; reason = 'no-history'; }
          else                  { eligible = true;  reason = null; }
        }
      }

      return {
        player,
        pos: pos || rosterByName.get(player.toLowerCase())?.pos,
        fromTeamId: tm.id,
        fromTeamName: tm.name,
        isOwn: tm.id === activeTeam.id,
        // contract/value info (may be undefined for waiver players)
        contractYear: prior?.contractYear,
        contractLength: prior?.contractLength,
        keptFor: prior?.keptFor,
        yearsKept: prior?.yearsKept,
        proTeam: prior?.proTeam,
        positions: prior?.positions,
        // status flags
        hasContract: !!prior,
        isOnRoster,
        isExpired: expired,
        eligible,
        ineligibleReason: reason,
        rosterMode,
        source,
      };
    }

    const seen = new Set();
    if (rosterMode) {
      // Every rostered player gets an entry. Cross-ref contract/value from priors.
      roster.forEach(r => {
        if (seen.has(r.player.toLowerCase())) return;
        seen.add(r.player.toLowerCase());
        pool.push(buildEntry({
          source: 'roster',
          player: r.player, pos: r.pos,
          prior: priorByName.get(r.player.toLowerCase()),
          isOnRoster: true,
        }));
      });
      // Contracts/priors NOT on roster — typically traded or dropped mid-season → ineligible
      priors.forEach(p => {
        if (seen.has(p.player.toLowerCase())) return;
        seen.add(p.player.toLowerCase());
        pool.push(buildEntry({
          source: 'orphan-contract',
          player: p.player,
          prior: p,
          isOnRoster: false,
        }));
      });
    } else {
      // No roster on file: pool comes purely from priorKeepers
      priors.forEach(p => {
        if (seen.has(p.player.toLowerCase())) return;
        seen.add(p.player.toLowerCase());
        pool.push(buildEntry({
          source: 'prior',
          player: p.player,
          prior: p,
          isOnRoster: true, // unknown; assume yes when no roster uploaded
        }));
      });
    }
  });

  // Strip players already kept this year (added to a team in this session)
  const availablePool = pool.filter(p => !allKeptThisYear.has(p.player));

  const filteredPool = availablePool
    .filter(p => {
      if (poolFilter === 'own')        return p.isOwn  && p.eligible;
      if (poolFilter === 'other')      return !p.isOwn && p.eligible;
      if (poolFilter === 'ineligible') return !p.eligible;
      return false;
    })
    .filter(p => !poolSearch || p.player.toLowerCase().includes(poolSearch.toLowerCase()))
    .sort((a, b) => {
      // In "own", pin players with contracts to the top
      if (poolFilter === 'own' && a.hasContract !== b.hasContract) return a.hasContract ? -1 : 1;
      // In "other", group by team
      if (poolFilter === 'other' && a.fromTeamId !== b.fromTeamId) return a.fromTeamName.localeCompare(b.fromTeamName);
      // Ineligible: explicit sort
      if (poolFilter === 'ineligible') {
        if (ineligibleSort === 'alpha') return lastNameOf(a.player).localeCompare(lastNameOf(b.player));
        if (ineligibleSort === 'team')  return a.fromTeamName.localeCompare(b.fromTeamName) || lastNameOf(a.player).localeCompare(lastNameOf(b.player));
        // default: group by reason, then alpha by last name
        const order = { 'expired': 0, 'not-on-roster': 1, 'no-contract': 2, 'no-history': 3 };
        const ar = order[a.ineligibleReason] ?? 9, br = order[b.ineligibleReason] ?? 9;
        if (ar !== br) return ar - br;
        return lastNameOf(a.player).localeCompare(lastNameOf(b.player));
      }
      if (league.draftType === 'auction') {
        const aCost = (a.keptFor != null ? a.keptFor + ((a.yearsKept || 0) + 1) * bumpAuction : baseAuction);
        const bCost = (b.keptFor != null ? b.keptFor + ((b.yearsKept || 0) + 1) * bumpAuction : baseAuction);
        return bCost - aCost;
      }
      return a.player.localeCompare(b.player);
    });

  // Counts for tab badges
  const ownCount = availablePool.filter(p => p.isOwn  && p.eligible).length;
  const otherCount = availablePool.filter(p => !p.isOwn && p.eligible).length;
  const ineligibleCount = availablePool.filter(p => !p.eligible).length;

  function addFromPool(p) {
    if (slotsLeft <= 0) return;
    const newKeeper = league.draftType === 'snake'
      ? (() => {
          const newYr = (p.contractYear || 0) + 1;
          const len = p.contractLength || league.contractYears || 3;
          return {
            player: p.player,
            contractYear: p.hasContract ? newYr : 1,
            contractLength: len,
            expiresAfter: `${2025 + (len - (p.hasContract ? newYr : 1))}-${String(2025 + (len - (p.hasContract ? newYr : 1)) + 1).slice(2)}`,
            fromTeam: p.isOwn ? null : p.fromTeamName,
            adminOverride: !p.eligible || undefined,
          };
        })()
      : (() => {
          // First-time undrafted keep = base cost. Drafted/kept before = previous + bump.
          const cost = p.keptFor != null ? p.keptFor + bumpAuction : baseAuction;
          return { player: p.player, keptFor: cost, yearsKept: (p.yearsKept || 0) + 1, fromTeam: p.isOwn ? null : p.fromTeamName, adminOverride: !p.eligible || undefined };
        })();
    setTeams(teams.map((tm, i) => i === activeTeamIdx ? { ...tm, keepers: [...activeKeepers, newKeeper] } : tm));
  }

  function commitAdd() {
    if (!newPlayer.trim()) return;
    const newKeeper = league.draftType === 'snake'
      ? { player: newPlayer.trim(), contractYear: 1, contractLength: parseInt(newTermYears) || 3, expiresAfter: `+${newTermYears}y`, isNew: true, advanced: true }
      : { player: newPlayer.trim(), keptFor: parseInt(newCost) || 1, yearsKept: 1, isNew: true };
    setTeams(teams.map((tm, i) => i === activeTeamIdx ? { ...tm, keepers: [...activeKeepers, newKeeper] } : tm));
    setNewPlayer(''); setNewCost(1); setNewTermYears(3);
    setAdding(false);
  }

  function cancelAdd() { setNewPlayer(''); setNewCost(1); setNewTermYears(3); setAdding(false); }

  function parseCsv() { /* replaced by RosterImportModal */ }

  function handleRosterImported(updatedLeague) {
    // Pull the roster the modal saved back into local teams state
    const next = (updatedLeague.teams || []).map(tm => ({ ...tm }));
    setTeams(next);
  }

  function removeNewKeeper(i) {
    setTeams(teams.map((tm, idx) => idx === activeTeamIdx ? { ...tm, keepers: activeKeepers.filter((_, ki) => ki !== i) } : tm));
  }

  function handleNext() { if (onUpdateLeague) onUpdateLeague({ ...league, teams }); onNext(); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showRosterImport && (
        <RosterImportModal
          league={{ ...league, teams }}
          initialTeamId={activeTeam.id}
          accentColor={accentColor} isDark={isDark}
          onImport={handleRosterImported}
          onClose={() => setShowRosterImport(false)} />
      )}

      {/* Data sources (rosters, contracts/draft, etc) */}
      <DataSourcesPanel league={{ ...league, teams }} accentColor={accentColor} isDark={isDark}
        onUpdateLeague={(updated) => setTeams(updated.teams || [])}
        defaultExpanded={teams.some(tm => !tm.roster || tm.roster.length === 0) || teams.some(tm => !tm.priorKeepers || tm.priorKeepers.length === 0)} />

      {/* View mode toggle + team selector */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 2, gap: 2 }}>
            {[
              { id: 'team', label: 'By team' },
              { id: 'all', label: 'All keepers' },
            ].map(o => (
              <button key={o.id} onClick={() => setViewMode(o.id)}
                style={{
                  background: viewMode === o.id ? accentColor : 'transparent',
                  border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  color: viewMode === o.id ? '#fff' : t.textSecondary, fontFamily: 'inherit',
                }}>{o.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted }}>
            {teams.reduce((sum, tm) => sum + (tm.keepers || []).length, 0)} keepers across {teams.length} teams
          </div>
        </div>
        {viewMode === 'team' && (
          <HScrollRow isDark={isDark} t={t}>
            {teams.map((team, i) => {
              const count = (team.keepers || []).length;
              const isActive = activeTeamIdx === i;
              const complete = count >= league.keeperSlots;
              return (
                <button key={team.id} onClick={() => { setActiveTeamIdx(i); setAdding(false); }} style={{
                  background: isActive ? accentColor : t.sectionBg,
                  border: `1px solid ${isActive ? accentColor : t.border}`,
                  borderRadius: 8, padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  color: isActive ? '#fff' : t.textSecondary,
                  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  <span>{team.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: isActive ? '#fff' : (complete ? '#6dd4a8' : (count > 0 ? accentColor : t.textMuted)),
                    background: isActive ? 'rgba(255,255,255,0.18)' : (complete ? 'rgba(76,175,125,0.15)' : t.cardBg),
                    padding: '1px 6px', borderRadius: 10, lineHeight: 1.4, letterSpacing: '0.02em',
                  }}>{count}/{league.keeperSlots}</span>
                </button>
              );
            })}
          </HScrollRow>
        )}
      </div>

      {viewMode === 'team' && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 14, alignItems: 'flex-start' }}>
        {/* Main: active team editor */}
        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: t.textPrimary }}>{activeTeam.name}</div>
                <div style={{ fontSize: '11px', color: overSlots ? '#e8832a' : t.textMuted, marginTop: 1 }}>
                  {activeKeepers.length}/{league.keeperSlots} slots
                  {overSlots && ` · ⚠ ${activeKeepers.length - league.keeperSlots} over`}
                  {!overSlots && slotsLeft > 0 && ` · ${slotsLeft} remaining`}
                </div>
              </div>
            </div>
            {!adding && slotsLeft > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setShowRosterImport(true)} title="Import this team's roster from Yahoo (paste or screenshot)" style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>📥 Import Roster</button>
                <button onClick={() => setAdding(true)} style={{ background: accentColor, border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit' }}>+ Add Manually</button>
              </div>
            )}
          </div>

          <div style={{ padding: '12px 18px' }}>
            {activeKeepers.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeKeepers.map((k, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 11px', background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: t.textPrimary }}>{k.player}</span>
                      {league.draftType === 'snake' && <span style={{ fontSize: '11px', color: t.textMuted, marginLeft: 8 }}>Y{k.contractYear}/{k.contractLength}</span>}
                      {league.draftType === 'auction' && <span style={{ fontSize: '11px', color: accentColor, marginLeft: 8, fontWeight: 700 }}>${k.keptFor}</span>}
                      {k.fromTeam && <span style={{ fontSize: '10px', color: '#4caf7d', marginLeft: 8, fontWeight: 700 }}>← {k.fromTeam}</span>}
                      {k.isNew && <span style={{ fontSize: '10px', color: '#6dd4a8', marginLeft: 8, fontWeight: 700, background: 'rgba(76,175,125,0.15)', padding: '2px 6px', borderRadius: 10 }}>NEW</span>}
                    </div>
                    <button onClick={() => removeNewKeeper(i)} title="Remove"
                      style={{ background: 'rgba(232,82,82,0.12)', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: '11px', fontWeight: 600, color: '#e85252', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: t.textMuted, textAlign: 'center', padding: '20px 0', fontStyle: 'italic' }}>No keepers yet. Click an eligible player on the right →</div>
            )}

            {adding && (
              <div style={{ marginTop: 10, background: t.sectionBg, border: `1px solid ${accentColor}`, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: accentColor, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>Add Manually (not in pool)</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <PlayerSearch sport={league.sport} value={newPlayer} onChange={setNewPlayer} accentColor={accentColor} isDark={isDark} autoFocus />
                  {league.draftType === 'snake' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: t.textMuted }}>Term:</span>
                      <select value={newTermYears} onChange={e => setNewTermYears(e.target.value)} style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px', fontSize: '12px', color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer' }}>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </div>
                  )}
                  {league.draftType === 'auction' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: '12px', color: t.textMuted }}>$</span>
                      <input type="number" value={newCost} onChange={e => setNewCost(e.target.value)} style={{ width: 50, background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px', fontSize: '12px', color: t.textPrimary, fontFamily: 'inherit', textAlign: 'center' }} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                  <button onClick={cancelAdd} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={commitAdd} disabled={!newPlayer.trim()} style={{ background: newPlayer.trim() ? accentColor : t.sectionBg, color: newPlayer.trim() ? '#fff' : t.textMuted, border: newPlayer.trim() ? 'none' : `1px solid ${t.border}`, borderRadius: 6, padding: '5px 12px', fontSize: '11px', fontWeight: 700, cursor: newPlayer.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>Save</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: eligible players pool */}
        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden', maxHeight: 560, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 12px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Eligible Pool</div>
              <div style={{ fontSize: '10px', color: t.textMuted }}>{filteredPool.length} player{filteredPool.length === 1 ? '' : 's'}</div>
            </div>
            <input type="text" placeholder="Search player…" value={poolSearch}
              onChange={e => setPoolSearch(e.target.value)}
              style={{ width: '100%', marginTop: 6, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {[
                { id: 'own', label: 'Roster', count: ownCount },
                { id: 'other', label: 'League', count: otherCount },
                { id: 'ineligible', label: 'Ineligible', count: ineligibleCount },
              ].map(o => (
                <button key={o.id} onClick={() => setPoolFilter(o.id)}
                  style={{
                    background: poolFilter === o.id ? accentColor : 'transparent',
                    border: `1px solid ${poolFilter === o.id ? accentColor : t.border}`,
                    borderRadius: 6, padding: '3px 7px', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                    color: poolFilter === o.id ? '#fff' : (o.id === 'ineligible' ? t.textMuted : t.textSecondary),
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center', whiteSpace: 'nowrap',
                  }}>
                  <span>{o.label}</span>
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{o.count}</span>
                </button>
              ))}
            </div>
            {poolFilter === 'ineligible' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sort</span>
                <select value={ineligibleSort} onChange={e => setIneligibleSort(e.target.value)}
                  style={{ flex: 1, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 5, padding: '3px 6px', fontSize: 10, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="reason">Reason</option>
                  <option value="alpha">By last name</option>
                  <option value="team">Team</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
            {pool.length === 0 ? (
              <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
                No players in pool yet.<br/>
                <span style={{ fontSize: 10, color: t.textMuted }}>
                  {league.draftType === 'auction'
                    ? "Go to Settings → Import Last Year's Draft, or import a Pre-Playoff Roster."
                    : "Go to Settings → Import a Pre-Playoff Roster, or seed prior contracts."}
                </span>
              </div>
            ) : filteredPool.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: t.textMuted }}>
                {poolFilter === 'ineligible'
                  ? '✓ No ineligible players — everyone on file can be kept.'
                  : poolFilter === 'own'
                    ? `No eligible keepers found for ${activeTeam.name}.`
                    : 'No players match'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredPool.map((p, i) => {
                  const prev = i > 0 ? filteredPool[i - 1] : null;
                  // Group dividers: by team in "other", by contract-or-not in "own" with roster
                  const showTeamHeader = poolFilter === 'other' && (!prev || prev.fromTeamId !== p.fromTeamId);
                  const showContractDivider = poolFilter === 'own' && p.rosterMode && prev && prev.hasContract && !p.hasContract;

                  // Build the cost/contract label
                  let statusLabel = null;
                  let chipTooltip = p.eligible ? `Add ${p.player} for ${activeTeam.name}` : null;
                  if (league.draftType === 'snake') {
                    if (p.hasContract && !p.isExpired) {
                      const nextYr = (p.contractYear || 0) + 1;
                      const isLastYr = nextYr === (p.contractLength || 3);
                      statusLabel = (
                        <span style={{ fontSize: 10, color: isLastYr ? '#e8832a' : t.textMuted, fontWeight: 600, flexShrink: 0 }}>
                          Y{nextYr}/{p.contractLength || 3}{isLastYr && ' ⚠'}
                        </span>
                      );
                      if (isLastYr) chipTooltip = `Final year of contract — will go back to the draft after the ${league.season} season. Add ${p.player} for ${activeTeam.name}.`;
                    }
                  } else {
                    // auction
                    const next = p.keptFor != null ? p.keptFor + bumpAuction : baseAuction;
                    statusLabel = (
                      <span style={{ fontSize: 10, color: accentColor, fontWeight: 700, flexShrink: 0 }}>
                        ${next}{p.keptFor == null && <span style={{ color: t.textMuted, fontWeight: 500 }}> base</span>}
                      </span>
                    );
                  }

                  // Ineligible reason badge
                  const reasonLabel = {
                    'expired':       'Expired',
                    'not-on-roster': 'Off roster',
                    'no-contract':   'No contract',
                    'no-history':    'No history',
                  }[p.ineligibleReason];

                  return (
                    <React.Fragment key={`${p.fromTeamId}-${p.player}-${i}`}>
                      {showTeamHeader && (
                        <div style={{ padding: '6px 4px 2px', fontSize: 9, fontWeight: 700, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: i > 0 ? 4 : 0 }}>
                          {p.fromTeamName}
                        </div>
                      )}
                      {showContractDivider && (
                        <div style={{ padding: '4px 4px', fontSize: 9, fontWeight: 600, color: t.textMuted, letterSpacing: '0.04em', borderTop: `1px dashed ${t.dividerFaint}`, marginTop: 4 }}>
                          Rostered, no contract
                        </div>
                      )}
                      <button onClick={() => addFromPool(p)} disabled={slotsLeft <= 0}
                        title={chipTooltip || `${reasonLabel || 'Ineligible'} — click to add anyway (admin override)`}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
                          background: p.isOwn && p.eligible ? `${accentColor}10` : 'transparent',
                          border: `1px solid ${p.isOwn && p.eligible ? `${accentColor}55` : t.border}`,
                          borderRadius: 6, padding: '6px 9px',
                          cursor: slotsLeft > 0 ? 'pointer' : 'not-allowed',
                          opacity: slotsLeft <= 0 ? 0.4 : (p.eligible ? 1 : 0.6),
                          fontFamily: 'inherit', textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (slotsLeft > 0) { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.background = `${accentColor}18`; } }}
                        onMouseLeave={e => { if (slotsLeft > 0) { e.currentTarget.style.borderColor = p.isOwn && p.eligible ? `${accentColor}55` : t.border; e.currentTarget.style.background = p.isOwn && p.eligible ? `${accentColor}10` : 'transparent'; } }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
                          {p.pos && p.pos !== '?' && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, background: t.sectionBg, padding: '1px 4px', borderRadius: 3, flexShrink: 0, minWidth: 18, textAlign: 'center' }}>{p.pos}</span>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: p.eligible ? t.textPrimary : t.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: p.isExpired ? 'line-through' : 'none' }}>{p.player}</span>
                          {statusLabel}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: t.textMuted, fontWeight: 500, width: '100%' }}>
                          {p.hasContract && league.draftType === 'auction' && p.keptFor != null && (
                            <span>was ${p.keptFor}</span>
                          )}
                          {!p.eligible && reasonLabel && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#e85252', background: 'rgba(232,82,82,0.1)', padding: '1px 5px', borderRadius: 3, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{reasonLabel}</span>
                          )}
                          {poolFilter !== 'other' && (
                            <span style={{ color: p.isOwn ? accentColor : t.textMuted, fontWeight: p.isOwn ? 700 : 500, marginLeft: 'auto' }}>
                              {p.isOwn ? '★ own' : p.fromTeamName}
                            </span>
                          )}
                        </div>
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {viewMode === 'all' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {teams.map((team, idx) => {
            const count = (team.keepers || []).length;
            const complete = count >= league.keeperSlots;
            const partial = count > 0 && !complete;
            const empty = count === 0;
            return (
              <div key={team.id}
                onClick={() => { setActiveTeamIdx(idx); setViewMode('team'); setAdding(false); }}
                style={{
                  background: t.cardBg,
                  border: `1px solid ${complete ? 'rgba(76,175,125,0.4)' : empty ? t.border : `${accentColor}55`}`,
                  borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 0.12s, box-shadow 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ padding: '10px 14px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: `${accentColor}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: accentColor, flexShrink: 0 }}>{team.name[0]}</div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary, flex: 1 }}>{team.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: complete ? '#6dd4a8' : (partial ? accentColor : t.textMuted),
                    background: complete ? 'rgba(76,175,125,0.15)' : (partial ? `${accentColor}18` : t.cardBg),
                    border: `1px solid ${complete ? 'rgba(76,175,125,0.3)' : (partial ? `${accentColor}55` : t.border)}`,
                    padding: '2px 7px', borderRadius: 10, letterSpacing: '0.02em',
                  }}>{count}/{league.keeperSlots}</span>
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 64 }}>
                  {(team.keepers || []).length === 0 && (
                    <div style={{ fontSize: 11, color: t.textMuted, fontStyle: 'italic', padding: '4px 0' }}>No keepers added yet.</div>
                  )}
                  {(team.keepers || []).map((k, i) => {
                    const expiring = league.draftType === 'snake' && k.contractYear === k.contractLength;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.textBody }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, width: 18 }}>K{i + 1}</span>
                        <span style={{ flex: 1, color: t.textPrimary, fontWeight: 600 }}>{k.player || <em style={{ color: t.textMuted, fontWeight: 400 }}>(unnamed)</em>}</span>
                        {league.draftType === 'snake' && k.contractYear != null && (
                          <span style={{ fontSize: 10, color: expiring ? '#e8832a' : t.textMuted, fontWeight: 600 }}>Y{k.contractYear}/{k.contractLength}{expiring && ' ⚠'}</span>
                        )}
                        {league.draftType === 'auction' && k.keptFor != null && (
                          <span style={{ fontSize: 10, color: accentColor, fontWeight: 700 }}>${k.keptFor}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>← Back</button>
        <button onClick={handleNext} style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit' }}>Continue →</button>
      </div>
    </div>
  );
}

// ── Step: Payments ───────────────────────────────────────────────────────────
function StepPayments({ league, accentColor, isDark, onUpdateLeague, onNext, onBack }) {
  const t = makeTheme(isDark);
  const [teams, setTeams] = React.useState(() => JSON.parse(JSON.stringify(league.teams || [])));
  const [editingDateFor, setEditingDateFor] = React.useState(null);

  function togglePaid(id) {
    const newTeams = teams.map(tm => {
      if (tm.id !== id) return tm;
      if (tm.paid) return { ...tm, paid: false, paidDate: null };
      return { ...tm, paid: true, paidDate: new Date().toISOString().split('T')[0] };
    });
    setTeams(newTeams);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
  }

  function setPaidDate(id, date) {
    const newTeams = teams.map(tm => tm.id === id ? { ...tm, paidDate: date } : tm);
    setTeams(newTeams);
    if (onUpdateLeague) onUpdateLeague({ ...league, teams: newTeams });
    setEditingDateFor(null);
  }

  const paidCount = teams.filter(tm => tm.paid).length;
  const collected = paidCount * league.buyIn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Payment Status</div>
          <div style={{ fontSize: '13px', color: t.textMuted }}>${collected.toLocaleString()} / ${league.totalPool.toLocaleString()}</div>
        </div>
        <div style={{ padding: '8px 20px 0' }}>
          <div style={{ background: t.progressBg, borderRadius: 4, height: 5, marginBottom: 14 }}>
            <div style={{ background: collected >= league.totalPool ? '#4caf7d' : accentColor, height: '100%', borderRadius: 4, width: `${Math.min((collected / (league.totalPool || 1)) * 100, 100)}%`, transition: 'width 0.4s' }}></div>
          </div>
        </div>
        <div style={{ padding: '0 20px' }}>
          {teams.map((team, i) => (
            <div key={team.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < teams.length - 1 ? `1px solid ${t.dividerFaint}` : 'none', gap: 8 }}>
              <span style={{ fontSize: '14px', color: t.textBody, flex: 1 }}>{team.name}</span>
              {team.paid && team.paidDate && editingDateFor !== team.id && (
                <button onClick={() => setEditingDateFor(team.id)} style={{ background: 'none', border: 'none', fontSize: '11px', color: t.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>
                  paid {new Date(team.paidDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} ✎
                </button>
              )}
              {team.paid && editingDateFor === team.id && (
                <input type="date" autoFocus defaultValue={team.paidDate}
                  onBlur={e => setPaidDate(team.id, e.target.value)}
                  onChange={e => setPaidDate(team.id, e.target.value)}
                  style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`, borderRadius: 4, padding: '3px 6px', fontSize: '11px', color: t.textPrimary, fontFamily: 'inherit' }} />
              )}
              <button onClick={() => togglePaid(team.id)} style={{
                background: team.paid ? 'rgba(76,175,125,0.12)' : 'rgba(232,82,82,0.1)',
                border: `1px solid ${team.paid ? 'rgba(76,175,125,0.3)' : 'rgba(232,82,82,0.3)'}`,
                borderRadius: 6, padding: '5px 12px', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer', color: team.paid ? '#6dd4a8' : '#e85252', fontFamily: 'inherit',
              }}>{team.paid ? `✓ $${league.buyIn} paid` : 'Mark paid'}</button>
            </div>
          ))}
        </div>
        <div style={{ margin: '0 20px', padding: '14px 0', borderTop: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: t.textMuted }}>Collected</span>
          <span style={{ fontSize: '16px', fontWeight: 700, color: t.textPrimary }}>${collected.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textSecondary, fontFamily: 'inherit' }}>← Back</button>
        <button onClick={onNext} style={{ background: accentColor, border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit' }}>Continue →</button>
      </div>
    </div>
  );
}

// ── Step: Done ───────────────────────────────────────────────────────────────
function StepDone({ league, accentColor, isDark, onFinish }) {
  const t = makeTheme(isDark);
  const stats = getLeagueStats(league);
  const totalTeams = league.teams.length;
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${accentColor}44`, borderRadius: 12, boxShadow: t.cardShadow, padding: '32px 28px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: t.textPrimary, marginBottom: 8 }}>Setup complete!</div>
      <div style={{ fontSize: '14px', color: t.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
        {stats.submitted}/{totalTeams} teams have submitted keepers · {stats.paid}/{totalTeams} have paid.
      </div>
      <button onClick={onFinish} style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Go to League Dashboard →</button>
    </div>
  );
}

// ── Main Wizard ──────────────────────────────────────────────────────────────
function SeasonSetupWizard({ league, accentColor, isDark, onUpdateLeague, onComplete, onExit }) {
  const steps = league.draftType === 'snake' ? SETUP_STEPS_SNAKE : SETUP_STEPS_AUCTION;
  const [currentStep, setCurrentStep] = React.useState(steps[0]);
  const t = makeTheme(isDark);

  const currentIdx = steps.indexOf(currentStep);
  function goNext() { if (currentIdx < steps.length - 1) setCurrentStep(steps[currentIdx + 1]); }
  function goBack() { if (currentIdx > 0) setCurrentStep(steps[currentIdx - 1]); else if (onExit) onExit(); }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={onExit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          ← Save & exit
        </button>
        <div style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>
          Setting up <span style={{ color: t.textPrimary, fontWeight: 700 }}>{league.season}</span> · progress auto-saves
        </div>
      </div>
      {currentStep === 'keepers' && <StepAddNewKeepers league={league} accentColor={accentColor} isDark={isDark} onUpdateLeague={onUpdateLeague} onNext={goNext} onBack={onExit} />}
      {currentStep === 'done'    && <StepDone league={league} accentColor={accentColor} isDark={isDark} onFinish={onComplete} />}
    </div>
  );
}

Object.assign(window, { SeasonSetupWizard });

export {
  SETUP_STEPS_SNAKE, SETUP_STEPS_AUCTION, STEP_META,
  WizardProgress, ConfirmModal, StepIntro, PlayerSearch,
  StepReviewKeepers, StepAddNewKeepers, StepPayments, StepDone,
  SeasonSetupWizard,
};
