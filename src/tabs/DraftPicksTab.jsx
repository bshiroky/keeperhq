import React from 'react';
import { ArrowRight, ClipboardList, X } from 'lucide-react';
import { makeTheme, tokens, NumberInput, Button, ConfirmBody } from '../components.jsx';
import { getDraftRounds, defaultDraftRounds, pickOwnerId, reassignPick, tradedPicks } from '../lib/draftPicks.js';
import { resolveYahooTeam, suggestTeam, rememberYahooTeams } from '../lib/teamMap.js';
import { picksImportImpact, picksGuardLines } from '../lib/importGuard.js';

// ── Draft Picks panel (the Picks door) ───────────────────────────────────────
// Commissioner-only round × team grid of pick OWNERSHIP for the upcoming
// draft. Default state: every team owns its own pick in every round (stored
// sparsely — see lib/draftPicks.js), so the grid starts all-plain and only
// hand-recorded trades stand out. Round 1 stays in sync with the Lottery
// page's reassignment feature (both write through the same helpers).
// Foundation for pick-cost keepers and trade validation — no rules logic yet.

const ROUND_W = 44;
const CELL_W = 92;

// ── Yahoo draft-picks paste parser ───────────────────────────────────────────
// Yahoo's draft-picks page lists each team's picks for the upcoming draft,
// with traded picks annotated. Built tolerant of the noise patterns the other
// Yahoo pastes have (headers, blank lines, tabs, optional year prefixes);
// the exact live format may need iteration once a real sample lands.
//
// Recognized pick-line shapes (case-insensitive), inside a team-name block:
//   "Round 2"                        → own pick (no reassignment)
//   "Round 2 (from Duck Duck Goose)" → that team's pick, held by the block team
//   "Round 2 (via X)" / "- from X"   → same
//   "Round 2 (to X)"                 → block team's pick, traded away to X
//   "2nd Round pick (from X)", "Rd 2 (from X)", "2022 Round 2 (from X)"
// Returns { picks: [{ round, originalName, ownerName }] } — one entry per
// (round, original team), trade-annotated entries winning over plain ones.

const PICK_LINE_REGEX = /^(?:20\d{2}\s+)?(?:(?:round|rd\.?)\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+round)(?:\s+pick)?\s*(?:[-–—:]\s*)?(?:\(\s*(from|via|to)\s+([^)]+)\)|(from|via|to)\s+(.+))?\s*$/i;
const PICK_SKIP_REGEX = /^(draft picks?|traded(?:\s+draft)?\s+picks?|picks?|round|team|original(?:\s+owner)?|current(?:\s+owner)?|owner|year|notes?|20\d{2}(?:\s+season)?|.*draft results.*)$/i;

function parseDraftPicksText(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim());
  const byKey = new Map(); // "round|originalName(lower)" → { round, originalName, ownerName, traded }
  let currentTeam = null;

  const record = (round, originalName, ownerName, traded) => {
    if (!round || !originalName || !ownerName) return;
    const key = `${round}|${originalName.toLowerCase()}`;
    const prev = byKey.get(key);
    // Trade-annotated entries beat plain "own pick" listings; among trades,
    // the later line wins (Yahoo lists a traded pick under both teams).
    if (prev && prev.traded && !traded) return;
    byKey.set(key, { round, originalName, ownerName, traded });
  };

  for (const line of lines) {
    if (!line) continue;
    if (PICK_SKIP_REGEX.test(line)) continue;
    const m = line.match(PICK_LINE_REGEX);
    if (m) {
      if (!currentTeam) continue; // pick line before any team header — skip
      const round = parseInt(m[1] || m[2], 10);
      const dir = (m[3] || m[5] || '').toLowerCase();
      const other = (m[4] || m[6] || '').trim();
      if (!Number.isFinite(round)) continue;
      if (!dir || !other) record(round, currentTeam, currentTeam, false);
      else if (dir === 'to') record(round, currentTeam, other, true);
      else record(round, other, currentTeam, true); // from / via
      continue;
    }
    // Anything else short enough is a team-name header starting a new block
    // (same heuristic as the draft-results paste).
    if (!/^\d/.test(line) && !/^\$/.test(line) && line.length < 80) {
      currentTeam = line;
    }
  }
  return { picks: [...byKey.values()] };
}

// ── Paste-import modal (paste → preview/mapping → confirm) ───────────────────
// One modal, steps within — the team-name mapping renders as part of the
// preview step (never a second stacked modal), matching the draft import.
function PicksPasteModal({ league, isDark, accentColor, onUpdateLeague, onClose }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const [text, setText] = React.useState('');
  const [parsed, setParsed] = React.useState(null); // { picks } | null
  const [mapping, setMapping] = React.useState({}); // { yahooName: teamId }
  const [error, setError] = React.useState(null);
  // A picksImportImpact while the overwrite confirm is showing (a step inside
  // this modal, never a second overlay).
  const [guard, setGuard] = React.useState(null);

  const teamName = (id) => teams.find(tm => tm.id === id)?.name || '?';

  // Trade rows are the only entries that change anything; own-pick rows are
  // listed in the paste but need no write (sparse default) and no mapping.
  const trades = (parsed?.picks || []).filter(p => p.traded && p.originalName.toLowerCase() !== p.ownerName.toLowerCase());
  const ownCount = (parsed?.picks || []).length - trades.length;
  const namesToResolve = [...new Set(trades.flatMap(p => [p.originalName, p.ownerName]))];
  const unresolved = namesToResolve.filter(n => !mapping[n]);

  function doPreview() {
    setError(null);
    const result = parseDraftPicksText(text);
    if (result.picks.length === 0) {
      setError("Couldn't find any picks. Expected lines like \"Round 2\" or \"Round 2 (from Team Name)\" under each team's name — copy the whole draft-picks page and paste it here.");
      return;
    }
    // Resolve names the same way the draft import does: saved yahooTeamMap
    // first (silent), then a similarity suggestion vs team names.
    const mapInit = {};
    const names = [...new Set(result.picks.flatMap(p => [p.originalName, p.ownerName]))];
    names.forEach(n => {
      const match = resolveYahooTeam(league, n) || suggestTeam(league, n);
      if (match) mapInit[n] = match;
    });
    setMapping(mapInit);
    setParsed(result);
  }

  // Resolved to ids so the guard can compare the paste against what's already
  // recorded. Rows whose names haven't been mapped yet are simply absent.
  const resolvedTrades = trades
    .map(p => ({ round: p.round, originalTeamId: mapping[p.originalName], ownerTeamId: mapping[p.ownerName] }))
    .filter(p => p.originalTeamId && p.ownerTeamId);

  function doImport() {
    if (unresolved.length > 0) return;
    // This paste writes ownership pick by pick, so the only thing it can
    // destroy is a trade the commissioner already recorded that the paste
    // contradicts. Ask only when that's actually the case.
    const impact = picksImportImpact(league, resolvedTrades);
    if (impact.hasImpact) { setGuard(impact); return; }
    applyImport();
  }

  function applyImport() {
    setGuard(null);
    let next = league;
    let maxRound = 0;
    trades.forEach(p => {
      const origId = mapping[p.originalName];
      const ownerId = mapping[p.ownerName];
      if (!origId || !ownerId) return;
      next = reassignPick(next, p.round, origId, origId === ownerId ? null : ownerId);
      maxRound = Math.max(maxRound, p.round);
    });
    // A traded pick deeper than the current grid must be visible — grow the
    // explicit round count to cover it.
    if (maxRound > getDraftRounds(next)) {
      next = { ...next, draftPicks: { ownership: {}, ...next.draftPicks, rounds: maxRound } };
    }
    next = rememberYahooTeams(next, mapping);
    onUpdateLeague(next);
    onClose();
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12,
        width: '100%', maxWidth: 680, maxHeight: '88vh', overflow: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>Import Pick Trades</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Paste Yahoo's draft-picks page — traded picks are detected and applied to the grid.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Overwrite confirm is a STEP inside this modal (one-modal-max
              rule); Back returns to the mapping with the parse intact. */}
          {guard && (
            <ConfirmBody
              isDark={isDark} accentColor={accentColor} danger
              title="Overwrite pick trades you already recorded?"
              intro="This paste disagrees with pick ownership already on the grid."
              lines={picksGuardLines(guard)}
              note="Cancel leaves the grid as it is — your paste stays on the mapping step."
              confirmLabel="Apply the paste"
              cancelLabel="← Back to mapping"
              onConfirm={applyImport}
              onCancel={() => setGuard(null)}
            />
          )}
          {!guard && !parsed && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                On Yahoo, open the league's draft-picks page, select everything, copy, and paste here. Each team's name is followed by its picks — plain rounds like <code style={{ background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>Round 3</code> stay put; annotated ones like <code style={{ background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>Round 2 (from Duck Duck Goose)</code> become trades.
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                placeholder={"Duck Duck Goose\nRound 1\nRound 2\nRound 3 (from Alex)\n\nAlex\nRound 1\nRound 2 (from Blake)\n..."}
                style={{
                  width: '100%', minHeight: 220, background: t.sectionBg, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace',
                  outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                }} />
              {error && (
                <div style={{ padding: '10px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger }}>{error}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                <Button variant="primary" size="md" accent={accentColor} isDark={isDark} disabled={!text.trim()} onClick={doPreview}>Preview Trades →</Button>
              </div>
            </>
          )}

          {!guard && parsed && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary }}>
                Found <strong>{trades.length}</strong> traded pick{trades.length === 1 ? '' : 's'}
                {ownCount > 0 && <span style={{ color: t.textMuted }}> · {ownCount} pick{ownCount === 1 ? ' is' : 's are'} with the original owner (left unchanged)</span>}.
              </div>

              {trades.length === 0 && (
                <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, lineHeight: 1.5 }}>
                  No trade annotations found in the paste — nothing to import. If Yahoo marks traded picks differently than "(from Team)", paste a sample in the PR/chat and the parser can learn it.
                </div>
              )}

              {/* Unrecognized-name mapping — a step inside this modal, same
                  pattern as the draft import's preview. */}
              {namesToResolve.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unresolved.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.danger }}>
                      Unrecognized team name{unresolved.length === 1 ? '' : 's'} — pick whose team each one is. It's remembered for future imports.
                    </div>
                  )}
                  {namesToResolve.map(name => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '7px 12px' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <select value={mapping[name] || ''} onChange={e => setMapping({ ...mapping, [name]: e.target.value })}
                        aria-label={`Match ${name}`}
                        style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${mapping[name] ? accentColor : t.danger}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', minWidth: 140 }}>
                        <option value="">— Pick a team —</option>
                        {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Resulting reassignments */}
              {trades.length > 0 && (
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted }}>Reassignments to apply</div>
                  <div style={{ padding: '4px 12px 8px' }}>
                    {trades.map((p, i) => {
                      const origId = mapping[p.originalName];
                      const ownerId = mapping[p.ownerName];
                      const already = origId && ownerId && pickOwnerId(league, p.round, origId) === ownerId;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < trades.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                          <span style={{ ...tokens.typePillEmphatic, color: t.warning, background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: tokens.radiusSm, padding: '2px 7px', flexShrink: 0 }}>R{p.round}</span>
                          <span style={{ ...tokens.typeBody, color: t.textBody, flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{origId ? teamName(origId) : p.originalName}'s pick</span>
                            <ArrowRight size={13} strokeWidth={2} color={t.textMuted} />
                            <span style={{ fontWeight: 700, color: t.textPrimary }}>{ownerId ? teamName(ownerId) : p.ownerName}</span>
                          </span>
                          {already && <span style={{ ...tokens.typePill, color: t.textMuted, flexShrink: 0 }}>already recorded</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={() => { setParsed(null); setError(null); }}>← Back to paste</Button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                  <Button variant="primary" size="md" accent={accentColor} isDark={isDark}
                    disabled={trades.length === 0 || unresolved.length > 0} onClick={doImport}>
                    Apply {trades.length} trade{trades.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftPicksPanel({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const rounds = getDraftRounds(league);
  const [editing, setEditing] = React.useState(null); // { round, teamId } | null
  const [showPaste, setShowPaste] = React.useState(false);

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
            <strong style={{ color: t.textSecondary }}>Click any pick to record a trade</strong> — it moves to the team you choose and shows highlighted. Each column is a team's original picks. Round 1 stays in sync with the Lottery page.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Rounds</span>
            <NumberInput size="sm" align="right" width={56} isDark={isDark}
              value={rounds} onChange={e => setRounds(e.target.value)} style={{ fontWeight: 700 }} />
            {league.draftPicks?.rounds == null && (
              <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }} title={`Derived from the deepest roster/draft list on file (${defaultDraftRounds(league)})`}>auto</span>
            )}
          </div>
          <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => setShowPaste(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ClipboardList size={14} strokeWidth={2} /> Paste from Yahoo
            </span>
          </Button>
        </div>
      </div>

      {showPaste && (
        <PicksPasteModal league={league} isDark={isDark} accentColor={accentColor}
          onUpdateLeague={onUpdateLeague} onClose={() => setShowPaste(false)} />
      )}

      {/* Round × team ownership grid */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        {/* Hover affordance for the click-to-reassign edit path — untraded
            cells only (traded cells already carry the warning tint). */}
        <style>{`
          .kh-pick-cell { transition: background 0.12s, border-color 0.12s, color 0.12s; }
          .kh-pick-cell:hover { background: ${t.sectionBg}; border-color: ${t.border} !important; color: ${t.textPrimary}; }
        `}</style>
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
                            className={isTraded ? undefined : 'kh-pick-cell'}
                            title={isTraded ? `${tm.name}'s R${round} pick — now owned by ${teamName(ownerId)}. Click to reassign.` : `${tm.name}'s R${round} pick — click to record a trade`}
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

Object.assign(window, { DraftPicksPanel, parseDraftPicksText });

export { DraftPicksPanel, parseDraftPicksText };
