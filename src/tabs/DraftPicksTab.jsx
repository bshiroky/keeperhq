import React from 'react';
import { ArrowRight, X } from 'lucide-react';
import { makeTheme, tokens, NumberInput } from '../components.jsx';
import { getDraftRounds, defaultDraftRounds, pickOwnerId, reassignPick, tradedPicks } from '../lib/draftPicks.js';

// ── Draft Picks panel (the Picks door) ───────────────────────────────────────
// Commissioner-only round × team grid of pick OWNERSHIP for the upcoming
// draft. Default state: every team owns its own pick in every round (stored
// sparsely — see lib/draftPicks.js), so the grid starts all-plain and only
// hand-recorded trades stand out. Round 1 stays in sync with the Lottery
// page's reassignment feature (both write through the same helpers).
// Foundation for pick-cost keepers and trade validation — no rules logic yet.

const ROUND_W = 44;
const CELL_W = 92;

function DraftPicksPanel({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const rounds = getDraftRounds(league);
  const [editing, setEditing] = React.useState(null); // { round, teamId } | null

  const teamName = (id) => teams.find(tm => tm.id === id)?.name || '?';
  const traded = tradedPicks(league);

  function setRounds(v) {
    const n = Number(v);
    onUpdateLeague({
      ...league,
      draftPicks: {
        ...(league.draftPicks || {}),
        ownership: league.draftPicks?.ownership || {},
        rounds: Number.isFinite(n) && n > 0 ? Math.min(n, 40) : null,
      },
    });
  }

  function reassign(round, originalTeamId, ownerTeamId) {
    onUpdateLeague(reassignPick(league, round, originalTeamId, ownerTeamId));
    setEditing(null);
  }

  if (teams.length === 0) {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.textSecondary }}>No teams yet</div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4 }}>Add teams in Settings to track pick ownership.</div>
      </div>
    );
  }

  const cellSelStyle = {
    width: '100%', boxSizing: 'border-box',
    background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`,
    borderRadius: tokens.radiusSm, padding: '4px 2px', fontSize: 11, fontWeight: 600,
    color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intro + rounds control */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Who owns which pick</div>
          <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
            Each column is a team's original picks. Click a pick to hand it to another team when a trade includes picks — reassigned picks are highlighted. Round 1 stays in sync with the Lottery page.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Rounds</span>
          <NumberInput size="sm" align="right" width={56} isDark={isDark}
            value={rounds} onChange={e => setRounds(e.target.value)} style={{ fontWeight: 700 }} />
          {league.draftPicks?.rounds == null && (
            <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }} title={`Derived from the deepest roster/draft list on file (${defaultDraftRounds(league)})`}>auto</span>
          )}
        </div>
      </div>

      {/* Round × team ownership grid */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: ROUND_W + teams.length * CELL_W }}>
            <thead>
              <tr>
                {/* Sticky cells layer the translucent sectionBg over the opaque
                    cardBg — a bare sectionBg would let scrolled cells ghost
                    through (same pitfall as the shared-page stat table). */}
                <th style={{ width: ROUND_W, padding: '10px 8px', backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})`, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }}>Rd</th>
                {teams.map(tm => (
                  <th key={tm.id} style={{ width: CELL_W, padding: '10px 6px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textSecondary, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tm.name}>
                    {tm.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rounds }, (_, ri) => ri + 1).map(round => (
                <tr key={round}>
                  <td style={{ padding: '6px 8px', backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})`, borderBottom: round < rounds ? `1px solid ${t.dividerFaint}` : 'none', ...tokens.typeBodyMeta, fontWeight: 700, color: t.textSecondary, position: 'sticky', left: 0, zIndex: 1 }}>
                    R{round}
                  </td>
                  {teams.map(tm => {
                    const ownerId = pickOwnerId(league, round, tm.id);
                    const isTraded = ownerId !== tm.id;
                    const isEditing = editing && editing.round === round && editing.teamId === tm.id;
                    return (
                      <td key={tm.id} style={{ padding: '3px 4px', borderBottom: round < rounds ? `1px solid ${t.dividerFaint}` : 'none', textAlign: 'center' }}>
                        {isEditing ? (
                          <select autoFocus value={ownerId}
                            onChange={e => reassign(round, tm.id, e.target.value)}
                            onBlur={() => setEditing(null)}
                            style={cellSelStyle} aria-label={`Owner of ${tm.name}'s round ${round} pick`}>
                            {teams.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setEditing({ round, teamId: tm.id })}
                            title={isTraded ? `${tm.name}'s R${round} pick — now owned by ${teamName(ownerId)}` : `${tm.name}'s R${round} pick`}
                            style={{
                              width: '100%', boxSizing: 'border-box',
                              background: isTraded ? t.warningBg : 'none',
                              border: `1px solid ${isTraded ? t.warningBorder : 'transparent'}`,
                              borderRadius: tokens.radiusSm, padding: '4px 4px',
                              fontSize: 11, fontWeight: isTraded ? 700 : 500,
                              color: isTraded ? t.warning : t.textMuted,
                              cursor: 'pointer', fontFamily: 'inherit',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                            {isTraded ? `via ${teamName(ownerId)}` : teamName(ownerId)}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Traded-picks roll-up */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Traded Picks</div>
          <div style={{ fontSize: '12px', color: t.textMuted }}>{traded.length === 0 ? 'none' : traded.length}</div>
        </div>
        {traded.length === 0 ? (
          <div style={{ padding: '14px 20px', ...tokens.typeBodyMeta, color: t.textMuted }}>
            Every team owns its own picks. Record a trade by clicking a pick in the grid above.
          </div>
        ) : (
          <div style={{ padding: '6px 20px 10px' }}>
            {traded.map((p, i) => (
              <div key={`${p.round}:${p.originalTeamId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < traded.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                <span style={{ ...tokens.typePillEmphatic, color: t.warning, background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: tokens.radiusSm, padding: '2px 7px', flexShrink: 0 }}>R{p.round}</span>
                <span style={{ ...tokens.typeBody, color: t.textBody, flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{teamName(p.originalTeamId)}'s pick</span>
                  <ArrowRight size={13} strokeWidth={2} color={t.textMuted} />
                  <span style={{ fontWeight: 700, color: t.textPrimary }}>{teamName(p.ownerTeamId)}</span>
                </span>
                <button onClick={() => reassign(p.round, p.originalTeamId, null)} title="Return pick to original owner"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, lineHeight: 1, padding: 4, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}>
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { DraftPicksPanel });

export { DraftPicksPanel };
