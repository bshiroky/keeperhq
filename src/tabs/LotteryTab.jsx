import React from 'react';
import { RotateCcw, Lock, Pencil, ArrowLeftRight } from 'lucide-react';
import { makeTheme, tokens } from '../components.jsx';

// Lottery Tab — bottom 4 teams compete for picks 1-4; top 8 get 5-12 in reverse standings.
// Supports traded pick reassignment before AND after the draw.

function LotteryTab({ league, accentColor, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const lotteryCount = league.bottomLotteryTeams || 4;
  const totalTeams = teams.length;

  const lotteryTeams = teams.slice(totalTeams - lotteryCount);
  const nonLotteryTeams = teams.slice(0, totalTeams - lotteryCount);

  // Pre-lottery slate: ordered list of picks with their *current* owners (post-trades).
  // Initially each lottery slot is "TBD" (decided by drawing); non-lottery slots filled in reverse standings.
  const [slate, setSlate] = React.useState(() => {
    if (league.lotteryResults) return league.lotteryResults;
    const lotterySlots = lotteryTeams.map((tm, i) => ({
      pick: i + 1, owner: null, lotteryEligible: lotteryTeams.map(x => x.name), lottery: true,
    }));
    const reversed = [...nonLotteryTeams].reverse();
    const nonLotterySlots = reversed.map((tm, i) => ({
      pick: lotteryCount + 1 + i, owner: tm.name, original: tm.name, lottery: false,
    }));
    return [...lotterySlots, ...nonLotterySlots];
  });
  const [running, setRunning] = React.useState(false);
  const [revealed, setRevealed] = React.useState(() => {
    if (!league.lotteryResults) return [];
    return league.lotteryResults.filter(r => r.owner).map(r => r.pick);
  });
  const [locked, setLocked] = React.useState(!!league.lotteryResults && league.lotteryResults.every(r => r.owner));
  const [editingPick, setEditingPick] = React.useState(null);

  const drawn = slate.every(s => s.owner);

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Reassign a *non-lottery* pick to another team (traded pick)
  // For lottery picks pre-draw, you reassign which TEAM is eligible for that slot.
  function reassignOwner(pickNum, newOwner) {
    const updated = slate.map(s => {
      if (s.pick !== pickNum) return s;
      // For lottery slot pre-draw: store as the eligible team
      if (s.lottery && !s.owner) {
        return { ...s, eligibleOwner: newOwner, original: s.original || s.eligibleOwner };
      }
      return { ...s, owner: newOwner };
    });
    setSlate(updated);
    if (locked && onUpdateLeague) onUpdateLeague({ ...league, lotteryResults: updated });
    setEditingPick(null);
  }

  function runLottery() {
    if (locked) return;
    // Lottery slots: the TEAMS that hold each lottery position (could be reassigned)
    // Default: each lottery slot is held by the same team that had it originally.
    // After trades: eligibleOwner can be different.
    // The actual draw: shuffle the 4 lottery TEAM SEEDS and assign their (possibly traded) owners to picks 1-4.

    // Build list of (originalLotteryTeam, currentOwner) — owner = whoever holds that pick now
    const lotteryEntries = lotteryTeams.map((tm, i) => {
      const slot = slate.find(s => s.pick === i + 1);
      return {
        originalTeam: tm.name,
        currentOwner: (slot && slot.eligibleOwner) || tm.name,
      };
    });
    const shuffled = shuffleArray(lotteryEntries);
    const newSlate = slate.map(s => {
      if (s.lottery) {
        const drawnEntry = shuffled[s.pick - 1];
        return {
          ...s,
          owner: drawnEntry.currentOwner,
          original: drawnEntry.originalTeam,
        };
      }
      return s;
    });
    setSlate(newSlate);
    setRevealed(slate.filter(s => !s.lottery).map(s => s.pick)); // non-lottery already shown
    setRunning(true);

    // Reveal lottery picks dramatically (4→3→2→1)
    [4, 3, 2, 1].forEach((pickNum, i) => {
      setTimeout(() => setRevealed(prev => [...new Set([...prev, pickNum])]), i * 600 + 300);
    });
    setTimeout(() => setRunning(false), 4 * 600 + 500);
  }

  function lockResults() {
    if (!drawn) return;
    setLocked(true);
    if (onUpdateLeague) onUpdateLeague({ ...league, lotteryResults: slate });
  }

  function resetLottery() {
    const lotterySlots = lotteryTeams.map((tm, i) => ({
      pick: i + 1, owner: null, lotteryEligible: lotteryTeams.map(x => x.name), lottery: true,
    }));
    const reversed = [...nonLotteryTeams].reverse();
    const nonLotterySlots = reversed.map((tm, i) => ({
      pick: lotteryCount + 1 + i, owner: tm.name, original: tm.name, lottery: false,
    }));
    setSlate([...lotterySlots, ...nonLotterySlots]);
    setRevealed([]);
    setLocked(false);
    if (onUpdateLeague) onUpdateLeague({ ...league, lotteryResults: null });
  }

  const allTeamNames = teams.map(tm => tm.name);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info card */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Draft Lottery</div>
            <div style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.5 }}>
              Bottom {lotteryCount} teams compete for picks <strong>1–{lotteryCount}</strong>.
              Top {totalTeams - lotteryCount} teams get picks {lotteryCount + 1}–{totalTeams} in reverse standings order.
            </div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 8 }}>
              💡 Click any owner below to reassign for traded picks — works before or after the draw.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!locked && !drawn && (
              <button onClick={runLottery} disabled={running} style={{
                background: running ? t.sectionBg : accentColor,
                border: 'none', borderRadius: 8, padding: '10px 20px',
                fontSize: '13px', fontWeight: 700, cursor: running ? 'default' : 'pointer',
                color: running ? t.textMuted : '#fff',
                opacity: running ? 0.7 : 1, fontFamily: 'inherit',
              }}>{running ? '🎱 Drawing…' : '🎱 Run Lottery'}</button>
            )}
            {!locked && drawn && (
              <>
                <button onClick={resetLottery} style={{
                  background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 16px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}><RotateCcw size={14} strokeWidth={1.5} />Re-run</button>
                <button onClick={lockResults} style={{
                  background: '#4caf7d', border: 'none', borderRadius: 8, padding: '10px 20px',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}><Lock size={14} strokeWidth={1.5} />Lock Results</button>
              </>
            )}
            {locked && (
              <button onClick={resetLottery} style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 20px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit',
              }}>Reset</button>
            )}
          </div>
        </div>
        {locked && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: tokens.successBg, borderRadius: 8 }}>
            <Lock size={16} strokeWidth={1.5} color={tokens.success} />
            <span style={{ fontSize: '13px', color: tokens.success, fontWeight: 600 }}>Results locked. You can still reassign picks for trades.</span>
          </div>
        )}
      </div>

      {/* PRE-DRAW: just the lottery teams */}
      {!drawn && (
        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Lottery Teams
            </div>
            <div style={{ fontSize: '11px', color: t.textMuted }}>Click any team to reassign for traded picks</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {lotteryTeams.map((tm, i) => {
              const slot = slate.find(s => s.pick === i + 1);
              const eligibleOwner = (slot && slot.eligibleOwner) || tm.name;
              const traded = eligibleOwner !== tm.name;
              return (
                <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: `1px solid ${t.dividerFaint}` }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: `${accentColor}22`, border: `1px solid ${accentColor}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>🎱</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingPick === i + 1 ? (
                      <select autoFocus defaultValue={eligibleOwner}
                        onChange={e => reassignOwner(i + 1, e.target.value)}
                        onBlur={() => setEditingPick(null)}
                        style={{
                          background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`,
                          borderRadius: 6, padding: '6px 10px', fontSize: '14px', fontWeight: 600,
                          color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', width: '100%', maxWidth: 240,
                        }}>
                        {allTeamNames.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                    ) : (
                      <div onClick={() => setEditingPick(i + 1)} style={{ cursor: 'pointer' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: t.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {eligibleOwner}
                          <span style={{ color: t.textMuted, opacity: 0.6, display: 'inline-flex' }}><Pencil size={12} strokeWidth={1.5} /></span>
                        </div>
                        {traded && (
                          <div style={{ fontSize: '11px', color: '#e8832a', fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ArrowLeftRight size={12} strokeWidth={1.5} />traded from {tm.name}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted, fontWeight: 600 }}>Seed #{totalTeams - lotteryCount + i + 1}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '12px 20px', background: t.sectionBg, borderTop: `1px solid ${t.divider}`, fontSize: '12px', color: t.textMuted, textAlign: 'center' }}>
            Picks <strong>5–{totalTeams}</strong> will be assigned in reverse standings order after the lottery is drawn.
          </div>
        </div>
      )}

      {/* POST-DRAW: full draft order */}
      {drawn && (
        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Draft Order</span>
              {locked ? <Lock size={13} strokeWidth={1.5} /> : <span>· Drawn</span>}
            </div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {slate.map((row) => {
              const isRevealed = !row.lottery || revealed.includes(row.pick);
              const justRevealed = revealed[revealed.length - 1] === row.pick && running;
              const displayOwner = row.owner || '?';
              const original = row.original || (row.lottery ? lotteryTeams[row.pick - 1]?.name : null);
              const traded = row.owner && original && row.owner !== original;

              return (
                <div key={row.pick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px',
                    borderBottom: `1px solid ${t.dividerFaint}`,
                    background: justRevealed ? `${accentColor}12` : 'transparent',
                    transition: 'background 0.4s, opacity 0.3s',
                    opacity: isRevealed ? 1 : 0.25,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: row.lottery ? `${accentColor}22` : t.sectionBg,
                    border: row.lottery ? `1px solid ${accentColor}44` : `1px solid ${t.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 800, color: row.lottery ? accentColor : t.textSecondary,
                  }}>{row.pick}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingPick === row.pick ? (
                      <select autoFocus defaultValue={displayOwner}
                        onChange={e => reassignOwner(row.pick, e.target.value)}
                        onBlur={() => setEditingPick(null)}
                        style={{
                          background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`,
                          borderRadius: 6, padding: '6px 10px', fontSize: '14px', fontWeight: 600,
                          color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', width: '100%', maxWidth: 240,
                        }}>
                        {allTeamNames.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                    ) : (
                      <div onClick={() => isRevealed && setEditingPick(row.pick)} style={{ cursor: isRevealed ? 'pointer' : 'default' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: isRevealed ? t.textPrimary : t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {displayOwner}
                          {isRevealed && <span style={{ color: t.textMuted, opacity: 0.6, display: 'inline-flex' }}><Pencil size={12} strokeWidth={1.5} /></span>}
                        </div>
                        {traded && (
                          <div style={{ fontSize: '11px', color: '#e8832a', fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ArrowLeftRight size={12} strokeWidth={1.5} />traded from {original}
                          </div>
                        )}
                        {row.lottery && row.owner && !traded && (
                          <div style={{ fontSize: '11px', color: accentColor, fontWeight: 600, marginTop: 1 }}>Lottery winner</div>
                        )}
                      </div>
                    )}
                  </div>
                  {row.lottery && row.owner && <div style={{ fontSize: 18 }}>🎱</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { LotteryTab });

export { LotteryTab };
