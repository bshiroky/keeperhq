import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Lock, Pencil, ArrowLeftRight, Upload } from 'lucide-react';
import { makeTheme, tokens, Button } from '../components.jsx';
import { reassignPick, pickOwnerId } from '../lib/draftPicks.js';
import {
  draftOrderConfigOf, baseDraftOrder, round1Order, lotteryDrawOf, BASIS_LABEL, describeBoardReason,
} from '../lib/draftOrder.js';
import { TieBreakEditor, tiesResolved, applyTieOrders } from './StandingsTab.jsx';

// Lottery — the worst N teams (by the configured standings basis) draw for
// picks 1–N; the rest pick in reverse standings order.
//
// Seeds come from the imported STANDINGS (lib/draftOrder.js), never from the
// order teams happen to be stored in. No standings → the page says so and
// points at Import. A tie the tiebreak can't break stops here too, with the
// editor to break it — the order is never guessed.
//
// The draw is stored as league.lotteryDraw = { at, order: [teamId…] } (the
// eligible teams in pick order). Pick trades — before or after the draw — are
// round-1 OWNERSHIP and live in league.draftPicks via reassignPick, exactly
// as the Picks page records them, so the two can't disagree.

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function LotteryTab({ league, accentColor, isDark, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const navigate = useNavigate();
  const teams = league.teams || [];
  const nameOf = id => teams.find(tm => tm.id === id)?.name || '?';
  const config = draftOrderConfigOf(league);
  const lotteryCount = config.lotteryTeams;
  const totalTeams = teams.length;

  const base = baseDraftOrder(league);
  const r1 = round1Order(league);
  const draw = lotteryDrawOf(league);
  const locked = !!draw && !draw.stale;

  const [pendingDraw, setPendingDraw] = React.useState(null); // drawn, not yet locked
  const [revealed, setRevealed] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const [editing, setEditing] = React.useState(null); // { originalTeamId }
  const [tieOrders, setTieOrders] = React.useState({});
  const timers = React.useRef([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const card = { background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow };
  const selStyle = { background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`, borderRadius: 6, padding: '6px 10px', fontSize: '14px', fontWeight: 600, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', width: '100%', maxWidth: 240 };

  // ── Blocked: no usable standings ──────────────────────────────────────────
  if (!base.ok && base.reason !== 'unresolved-ties') {
    return (
      <div style={{ ...card, padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ ...tokens.typeHeadingCard, color: t.textPrimary }}>Standings needed first</div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 6, lineHeight: 1.5, maxWidth: 480, margin: '6px auto 0' }}>
          {describeBoardReason(base.reason)} The lottery seeds and the draft order are built from last season's standings, so nothing here can be right until they're on file.
          {base.reason === 'incomplete' && base.missing?.length > 0 && (
            <> Missing: <strong style={{ color: t.textSecondary }}>{base.missing.map(nameOf).join(', ')}</strong>.</>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" size="md" accent={accentColor} isDark={isDark} onClick={() => navigate(`/league/${league.id}/import`)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Upload size={14} strokeWidth={2} /> Import standings</span>
          </Button>
        </div>
      </div>
    );
  }

  // ── Blocked: a tie to break ───────────────────────────────────────────────
  if (!base.ok) {
    return (
      <div style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Break the tie before the lottery</div>
          <div style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.5 }}>
            Two or more teams finished level on {BASIS_LABEL[config.basis].toLowerCase()} and nothing in the standings separates them. The order you set here is recorded with the standings.
          </div>
        </div>
        <TieBreakEditor league={league} ties={base.unresolvedTies} value={tieOrders} onChange={setTieOrders} isDark={isDark} accentColor={accentColor} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" size="md" accent={accentColor} isDark={isDark}
            disabled={!tiesResolved(base.unresolvedTies, tieOrders)}
            onClick={() => { onUpdateLeague(applyTieOrders(league, tieOrders)); setTieOrders({}); }}>
            Save finishing order
          </Button>
        </div>
      </div>
    );
  }

  // ── The lottery ───────────────────────────────────────────────────────────
  const eligible = base.order.slice(0, lotteryCount);       // [{ slot, teamId, finish }]
  const finishOf = new Map(base.order.map(e => [e.teamId, e.finish]));
  const drawn = lotteryCount === 0 || locked || !!pendingDraw;
  const slots = r1.slots.map((s, i) => {
    const original = pendingDraw && s.lottery ? pendingDraw[i] : s.originalTeamId;
    const owner = original ? pickOwnerId(league, 1, original) : null;
    return { slot: s.slot, lottery: s.lottery, original, owner, finish: original ? finishOf.get(original) : null };
  });

  function reassign(originalTeamId, ownerTeamId) {
    onUpdateLeague(reassignPick(league, 1, originalTeamId, ownerTeamId === originalTeamId ? null : ownerTeamId));
    setEditing(null);
  }

  function runLottery() {
    if (locked || lotteryCount === 0) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPendingDraw(shuffleArray(eligible.map(e => e.teamId)));
    setRevealed([]);
    setRunning(true);
    // Reveal picks N → 1, the worst-to-best drama the old page had.
    for (let k = 0; k < lotteryCount; k++) {
      const pick = lotteryCount - k;
      timers.current.push(setTimeout(() => setRevealed(prev => [...new Set([...prev, pick])]), k * 600 + 300));
    }
    timers.current.push(setTimeout(() => setRunning(false), lotteryCount * 600 + 500));
  }

  function lockResults() {
    if (!pendingDraw) return;
    onUpdateLeague({ ...league, lotteryDraw: { at: new Date().toISOString(), order: pendingDraw }, lotteryResults: null });
    setPendingDraw(null);
  }

  function resetLottery() {
    timers.current.forEach(clearTimeout);
    setPendingDraw(null);
    setRevealed([]);
    setRunning(false);
    if (league.lotteryDraw || league.lotteryResults) onUpdateLeague({ ...league, lotteryDraw: null, lotteryResults: null });
  }

  const drawnAt = draw?.at ? new Date(draw.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info card */}
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Draft Lottery</div>
            <div style={{ fontSize: '13px', color: t.textMuted, lineHeight: 1.5 }}>
              {lotteryCount > 0 ? (
                <>Bottom {lotteryCount} teams by <strong>{BASIS_LABEL[config.basis].toLowerCase()}</strong> compete for picks <strong>1–{lotteryCount}</strong>. The other {totalTeams - lotteryCount} pick {lotteryCount + 1}–{totalTeams} in reverse standings order.</>
              ) : (
                <>No lottery — all {totalTeams} teams pick in reverse order of <strong>{BASIS_LABEL[config.basis].toLowerCase()}</strong>. (Lottery size is set in Settings.)</>
              )}
            </div>
            <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 8 }}>
              💡 Click any owner below to reassign a traded pick — works before or after the draw, and shows on the Picks page too.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {lotteryCount > 0 && !locked && !pendingDraw && (
              <button onClick={runLottery} disabled={running} style={{ background: running ? t.sectionBg : accentColor, border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: running ? 'default' : 'pointer', color: running ? t.textMuted : '#fff', opacity: running ? 0.7 : 1, fontFamily: 'inherit' }}>
                {running ? '🎱 Drawing…' : '🎱 Run Lottery'}
              </button>
            )}
            {pendingDraw && (
              <>
                <button onClick={runLottery} disabled={running} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}><RotateCcw size={14} strokeWidth={1.5} />Re-run</button>
                <button onClick={lockResults} disabled={running} style={{ background: '#4caf7d', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Lock size={14} strokeWidth={1.5} />Lock Results</button>
              </>
            )}
            {locked && (
              <button onClick={resetLottery} style={{ background: 'none', border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: t.textMuted, fontFamily: 'inherit' }}>Reset</button>
            )}
          </div>
        </div>
        {locked && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: tokens.successBg, borderRadius: 8 }}>
            <Lock size={16} strokeWidth={1.5} color={tokens.success} />
            <span style={{ fontSize: '13px', color: tokens.success, fontWeight: 600 }}>Results locked{drawnAt ? ` ${drawnAt}` : ''}. You can still reassign picks for trades.</span>
          </div>
        )}
        {draw?.stale && !pendingDraw && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: 8, fontSize: '13px', color: t.warning, fontWeight: 600 }}>
            The lottery on file no longer matches the standings (the lottery teams changed) — run it again.
          </div>
        )}
      </div>

      {/* PRE-DRAW: the lottery teams, seeded from the standings */}
      {!drawn && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Lottery Teams</div>
            <div style={{ fontSize: '11px', color: t.textMuted }}>Click any team to reassign a traded pick</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {eligible.map(e => {
              const owner = pickOwnerId(league, 1, e.teamId);
              const traded = owner !== e.teamId;
              const isEditing = editing?.originalTeamId === e.teamId;
              return (
                <div key={e.teamId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: `1px solid ${t.dividerFaint}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: `${accentColor}22`, border: `1px solid ${accentColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎱</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <select autoFocus defaultValue={owner} onChange={ev => reassign(e.teamId, ev.target.value)} onBlur={() => setEditing(null)} style={selStyle} aria-label={`Owner of ${nameOf(e.teamId)}'s lottery pick`}>
                        {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                      </select>
                    ) : (
                      <div onClick={() => setEditing({ originalTeamId: e.teamId })} style={{ cursor: 'pointer' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: t.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {nameOf(owner)}
                          <span style={{ color: t.textMuted, opacity: 0.6, display: 'inline-flex' }}><Pencil size={12} strokeWidth={1.5} /></span>
                        </div>
                        {traded && (
                          <div style={{ fontSize: '11px', color: t.warning, fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ArrowLeftRight size={12} strokeWidth={1.5} />traded from {nameOf(e.teamId)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: t.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>Seed #{e.finish}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: '12px 20px', background: t.sectionBg, borderTop: `1px solid ${t.divider}`, fontSize: '12px', color: t.textMuted, textAlign: 'center' }}>
            Picks <strong>{lotteryCount + 1}–{totalTeams}</strong> are assigned in reverse standings order after the lottery is drawn.
          </div>
        </div>
      )}

      {/* POST-DRAW (or no lottery): the full round-1 order */}
      {drawn && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Draft Order · Round 1</span>
              {locked ? <Lock size={13} strokeWidth={1.5} /> : pendingDraw ? <span>· Drawn</span> : null}
            </div>
            <div style={{ fontSize: '11px', color: t.textMuted }}>Even rounds reverse this order (snake)</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {slots.map(row => {
              const isRevealed = !row.lottery || locked || revealed.includes(row.slot);
              const justRevealed = running && revealed[revealed.length - 1] === row.slot;
              const traded = row.original && row.owner !== row.original;
              const isEditing = row.original && editing?.originalTeamId === row.original;
              return (
                <div key={row.slot} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 20px', borderBottom: `1px solid ${t.dividerFaint}`, background: justRevealed ? `${accentColor}12` : 'transparent', transition: 'background 0.4s, opacity 0.3s', opacity: isRevealed ? 1 : 0.25 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: row.lottery ? `${accentColor}22` : t.sectionBg, border: row.lottery ? `1px solid ${accentColor}44` : `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: row.lottery ? accentColor : t.textSecondary }}>{row.slot}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <select autoFocus defaultValue={row.owner} onChange={ev => reassign(row.original, ev.target.value)} onBlur={() => setEditing(null)} style={selStyle} aria-label={`Owner of pick ${row.slot}`}>
                        {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                      </select>
                    ) : (
                      <div onClick={() => isRevealed && row.original && setEditing({ originalTeamId: row.original })} style={{ cursor: isRevealed && row.original ? 'pointer' : 'default' }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: isRevealed ? t.textPrimary : t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {row.owner ? nameOf(row.owner) : '?'}
                          {isRevealed && row.original && <span style={{ color: t.textMuted, opacity: 0.6, display: 'inline-flex' }}><Pencil size={12} strokeWidth={1.5} /></span>}
                        </div>
                        {traded && (
                          <div style={{ fontSize: '11px', color: t.warning, fontWeight: 600, marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ArrowLeftRight size={12} strokeWidth={1.5} />traded from {nameOf(row.original)}
                          </div>
                        )}
                        {row.lottery && row.original && !traded && (
                          <div style={{ fontSize: '11px', color: accentColor, fontWeight: 600, marginTop: 1 }}>Lottery winner</div>
                        )}
                      </div>
                    )}
                  </div>
                  {row.finish != null && <div style={{ fontSize: '11px', color: t.textMuted, fontWeight: 600, whiteSpace: 'nowrap' }}>Seed #{row.finish}</div>}
                  {row.lottery && row.original && <div style={{ fontSize: 18 }}>🎱</div>}
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
