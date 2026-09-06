import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, Plus, X } from 'lucide-react';
import { makeTheme, tokens, NumberInput, Button, ConfirmBody, SrOnly } from '../components.jsx';
import { getDraftRounds, defaultDraftRounds, pickOwnerId, reassignPick, tradedPicks } from '../lib/draftPicks.js';
import { resolveTeamNames, rememberYahooTeams } from '../lib/teamMap.js';
import { picksImportImpact, picksGuardLines } from '../lib/importGuard.js';
import { parseDraftPicksText } from '../lib/picksParse.js';
import { buildDraftBoard, pickNumberFor, formatPickNumber, lotteryRangeFor, describeBoardReason } from '../lib/draftOrder.js';
import { sortTeamsByName } from '../lib/teamOrder.js';

// ── Draft Picks panel (the Picks door) ───────────────────────────────────────
// Commissioner-only view of pick OWNERSHIP for the upcoming draft, laid out as
// a DRAFT BOARD (rounds × slots, each cell the team on the clock) once
// standings give it an order, and as a round × team ownership grid until
// then. Ownership is stored sparsely (see lib/draftPicks.js), so the grid
// starts all-plain and only hand-recorded trades stand out. Round 1 stays in
// sync with the Lottery page (both write through the same helpers).
// Foundation for pick-cost keepers and trade validation — no rules logic yet.

// ── Paste-import modal (paste → preview/mapping → confirm) ───────────────────
// Reads Yahoo's Draft Picks page in its BY ROUND view (the parser lives in
// lib/picksParse.js). One modal, steps within — the team-name mapping and the
// overwrite confirm render as steps inside it, never a second stacked modal.
//
// By Round is COMPLETE — it lists every pick in every round — so the import
// writes every pick it resolves: a pick shown with its original owner clears
// any trade recorded on it by hand (the guard names those before anything
// is written). The by-team fallback format only lists what it annotates, so
// there only its trade rows are written and need names.
//
// `initialText` exists so a server render can exercise the PREVIEW step —
// the state a click normally reaches (the Rules-button lesson: a trigger and
// a step that each render fine can still be miswired between them).
function PicksPasteModal({ league, isDark, accentColor, onUpdateLeague, onClose, initialText = '', initialGridText = '' }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  // Parse + resolve names the same way the draft import does: saved
  // yahooTeamMap first (silent), then a similarity suggestion vs team names.
  const previewOf = (src, gridSrc) => {
    const result = parseDraftPicksText(src, { knownNames: teams.map(tm => tm.name), gridText: gridSrc });
    if (result.error) return { result: null, mapInit: {}, error: result.error };
    const mapInit = {};
    const names = [...new Set([...(result.teams || []), ...result.picks.flatMap(p => [p.originalName, p.ownerName])])];
    // Saved alias → silent; similarity → prefilled; otherwise the red select.
    const resolved = resolveTeamNames(league, names);
    names.forEach(n => { if (resolved[n]?.teamId) mapInit[n] = resolved[n].teamId; });
    return { result, mapInit, error: null };
  };
  const initial = React.useMemo(() => (initialText ? previewOf(initialText, initialGridText) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = React.useState(initialText);
  const [gridText, setGridText] = React.useState(initialGridText);
  const [parsed, setParsed] = React.useState(initial?.result || null); // parseDraftPicksText result | null
  const [mapping, setMapping] = React.useState(initial?.mapInit || {}); // { yahooName: teamId }
  const [error, setError] = React.useState(initial?.error || null);
  // A picksImportImpact while the overwrite confirm is showing (a step inside
  // this modal, never a second overlay).
  const [guard, setGuard] = React.useState(null);

  const teamName = (id) => teams.find(tm => tm.id === id)?.name || '?';
  const code = { background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 };

  const isByRound = parsed?.format === 'byRound';
  const picks = parsed?.picks || [];
  const trades = picks.filter(p => p.traded);
  const ownCount = picks.length - trades.length;
  // Rows the import writes: everything on a complete paste, trades only on the
  // by-team fallback. Every name on a written row has to resolve.
  const writable = isByRound ? picks : trades;
  const namesToResolve = isByRound
    ? (parsed.teams || [])
    : [...new Set(trades.flatMap(p => [p.originalName, p.ownerName]))];
  const unresolved = namesToResolve.filter(n => !mapping[n]);
  // Two Yahoo names on one app team would write two teams' picks to one
  // column — refuse it rather than let the grid quietly disagree with Yahoo.
  const dupTeamIds = [...new Set(Object.values(mapping).filter(id => id && namesToResolve.filter(n => mapping[n] === id).length > 1))];

  // Picking a team already mapped on another row STEALS it — that row
  // visibly reverts to unmapped instead of silently double-assigning (the
  // draft import's behaviour; two Yahoo names can't share a team).
  function pickTeam(name, id) {
    const next = { ...mapping };
    if (id) Object.keys(next).forEach(k => { if (k !== name && next[k] === id) delete next[k]; });
    if (id) next[name] = id; else delete next[name];
    setMapping(next);
  }
  const mappedCount = new Set(namesToResolve.map(n => mapping[n]).filter(Boolean)).size;

  function doPreview() {
    const { result, mapInit, error: err } = previewOf(text, gridText);
    setError(err);
    if (!result) return;
    setMapping(mapInit);
    setParsed(result);
  }

  // Resolved to ids so the guard can compare the paste against what's already
  // recorded. Rows whose names haven't been mapped yet are simply absent.
  const resolvedRows = writable
    .map(p => ({ round: p.round, originalTeamId: mapping[p.originalName], ownerTeamId: mapping[p.ownerName] }))
    .filter(p => p.originalTeamId && p.ownerTeamId);
  // What actually moves on the grid — trades not yet recorded, plus hand-
  // recorded trades the paste shows back with the original owner.
  const changes = resolvedRows.filter(p => pickOwnerId(league, p.round, p.originalTeamId) !== p.ownerTeamId);
  const clears = changes.filter(p => p.originalTeamId === p.ownerTeamId);

  // Preview-only checks on top of the parser's own (the parser never sees the league).
  const previewIssues = [...(parsed?.issues || [])];
  if (isByRound && parsed.teamCount !== teams.length) {
    previewIssues.push({ kind: 'teams', text: `The paste lists ${parsed.teamCount} team${parsed.teamCount === 1 ? '' : 's'}; this league has ${teams.length}.` });
  }

  const canApply = writable.length > 0 && unresolved.length === 0 && dupTeamIds.length === 0 && (isByRound ? changes.length > 0 : trades.length > 0);

  function doImport() {
    if (!canApply) return;
    // This paste writes ownership pick by pick, so the only thing it can
    // destroy is a trade the commissioner already recorded that the paste
    // contradicts. Ask only when that's actually the case.
    const impact = picksImportImpact(league, resolvedRows);
    if (impact.hasImpact) { setGuard(impact); return; }
    applyImport();
  }

  function applyImport() {
    setGuard(null);
    let next = league;
    let maxRound = 0;
    resolvedRows.forEach(p => {
      next = reassignPick(next, p.round, p.originalTeamId, p.originalTeamId === p.ownerTeamId ? null : p.ownerTeamId);
      maxRound = Math.max(maxRound, p.round);
    });
    // A pick deeper than the current grid must be visible — grow the explicit
    // round count to cover it.
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
  const pill = (color, bg, border) => ({ ...tokens.typePillEmphatic, color, background: bg, border: `1px solid ${border}`, borderRadius: tokens.radiusSm, padding: '2px 7px', flexShrink: 0 });

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12,
        width: '100%', maxWidth: 680, maxHeight: '88vh', overflow: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>Import Pick Ownership</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Paste Yahoo's Draft Picks page (By Round view) — who holds which pick is read off it and applied to the grid.</div>
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
                On Yahoo, open the league's <strong>Draft Picks</strong> page and switch it to <strong>By Round</strong>. Select everything on the page, copy, and paste it in the first box. Each round lists every team followed by the picks it holds — the original owners' names, run together, or <code style={code}>-</code> for none.
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>By Round <span style={{ color: t.danger }}>· required</span></span>
                <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                  placeholder={"Round 1\nTeam\tPicks Owned\nDuck Duck Goose\nDuck Duck GooseAlex\nAlex\n-\nBlake\nBlake\n\nRound 2\n..."}
                  style={{
                    width: '100%', minHeight: 180, background: t.sectionBg, border: `1px solid ${t.border}`,
                    borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace',
                    outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                  }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Grid <span style={{ color: t.textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· optional — pasted here, its per-team counts are checked against what was read, round by round</span></span>
                <textarea value={gridText} onChange={e => setGridText(e.target.value)}
                  placeholder={"Team\tRounds\n1\t2\t3\nDuck Duck Goose\t2\t1\t1\nAlex\t0\t1\t1\n..."}
                  style={{
                    width: '100%', minHeight: 90, background: t.sectionBg, border: `1px solid ${t.border}`,
                    borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace',
                    outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                  }} />
              </label>
              {error && (
                <div style={{ padding: '10px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger, lineHeight: 1.5 }}>{error}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                <Button variant="primary" size="md" accent={accentColor} isDark={isDark} disabled={!text.trim()} onClick={doPreview}>Preview →</Button>
              </div>
            </>
          )}

          {!guard && parsed && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary }}>
                {isByRound ? (
                  <>
                    Read <strong>{parsed.totalPicks}</strong> pick{parsed.totalPicks === 1 ? '' : 's'} across <strong>{parsed.rounds.length}</strong> round{parsed.rounds.length === 1 ? '' : 's'} and <strong>{parsed.teamCount}</strong> team{parsed.teamCount === 1 ? '' : 's'} · <strong>{trades.length}</strong> traded
                    <span style={{ color: t.textMuted }}> · {ownCount} with the original owner</span>.
                  </>
                ) : (
                  <>
                    Found <strong>{trades.length}</strong> traded pick{trades.length === 1 ? '' : 's'}
                    {ownCount > 0 && <span style={{ color: t.textMuted }}> · {ownCount} pick{ownCount === 1 ? ' is' : 's are'} with the original owner (left unchanged)</span>}.
                  </>
                )}
              </div>

              {/* Checks: the parser's own (round sums, unmatched chunks) plus
                  the Grid checksum when one was pasted. Reported, never
                  silently accepted — but not a hard block, because the fix
                  is on Yahoo's page, not in this modal. */}
              {isByRound && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {parsed.grid ? (
                    parsed.grid.ok ? (
                      <div style={{ padding: '8px 12px', background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: 6, fontSize: 12, color: t.success }}>
                        Grid check passed — every team's count matches in all {parsed.grid.rounds} rounds.
                      </div>
                    ) : (
                      <div style={{ padding: '8px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger }}>
                        Grid check failed on {parsed.grid.mismatches.length} team-round{parsed.grid.mismatches.length === 1 ? '' : 's'} — details below.
                      </div>
                    )
                  ) : (
                    <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>No Grid pasted — paste Yahoo's Grid view under the By Round text to double-check the counts.</div>
                  )}
                  {previewIssues.length > 0 && (
                    <div style={{ padding: '10px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger, lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Check before applying</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {previewIssues.map((i, k) => <li key={k}>{i.text}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!isByRound && trades.length === 0 && (
                <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, lineHeight: 1.5 }}>
                  No trade annotations found in the paste — nothing to import. Yahoo's By Round view is the reliable source: switch to it on the Draft Picks page and paste that instead.
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
                  {dupTeamIds.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.danger }}>
                      Two names are mapped to the same team ({dupTeamIds.map(teamName).join(', ')}) — each Yahoo team has to map to a different team here.
                    </div>
                  )}
                  {namesToResolve.map(name => (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '7px 12px' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <select value={mapping[name] || ''} onChange={e => pickTeam(name, e.target.value)}
                        aria-label={`Match ${name}`}
                        style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${mapping[name] && !dupTeamIds.includes(mapping[name]) ? accentColor : t.danger}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', minWidth: 140 }}>
                        <option value="">— Pick a team —</option>
                        {/* Teams mapped on OTHER rows stay listed (removing them
                            forces menu-hopping) but carry a marker. */}
                        {teams.map(tm => {
                          const usedElsewhere = namesToResolve.some(n => n !== name && mapping[n] === tm.id);
                          return <option key={tm.id} value={tm.id}>{usedElsewhere ? `${tm.name} ✓ (mapped)` : tm.name}</option>;
                        })}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Resulting reassignments */}
              {(trades.length > 0 || clears.length > 0) && (
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted }}>Traded picks in this paste</div>
                  <div style={{ padding: '4px 12px 8px' }}>
                    {trades.map((p, i) => {
                      const origId = mapping[p.originalName];
                      const ownerId = mapping[p.ownerName];
                      const already = origId && ownerId && pickOwnerId(league, p.round, origId) === ownerId;
                      return (
                        <div key={`${p.round}:${p.originalName}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < trades.length - 1 || clears.length > 0 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                          <span style={pill(t.warning, t.warningBg, t.warningBorder)}>R{p.round}</span>
                          <span style={{ ...tokens.typeBody, color: t.textBody, flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{origId ? teamName(origId) : p.originalName}'s pick</span>
                            <ArrowRight size={13} strokeWidth={2} color={t.textMuted} />
                            <span style={{ fontWeight: 700, color: t.textPrimary }}>{ownerId ? teamName(ownerId) : p.ownerName}</span>
                          </span>
                          {already && <span style={{ ...tokens.typePill, color: t.textMuted, flexShrink: 0 }}>already recorded</span>}
                        </div>
                      );
                    })}
                    {clears.map((p, i) => (
                      <div key={`clear:${p.round}:${p.originalTeamId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < clears.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                        <span style={pill(t.textMuted, t.sectionBg, t.border)}>R{p.round}</span>
                        <span style={{ ...tokens.typeBody, color: t.textBody, flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{teamName(p.originalTeamId)}'s pick</span>
                          <ArrowRight size={13} strokeWidth={2} color={t.textMuted} />
                          <span style={{ fontWeight: 700, color: t.textPrimary }}>back to {teamName(p.originalTeamId)}</span>
                        </span>
                        <span style={{ ...tokens.typePill, color: t.textMuted, flexShrink: 0 }}>recorded as traded to {teamName(pickOwnerId(league, p.round, p.originalTeamId))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isByRound && unresolved.length === 0 && dupTeamIds.length === 0 && changes.length === 0 && (
                <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>The grid already matches this paste — nothing to change.</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={() => { setParsed(null); setError(null); }}>← Back to paste</Button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {namesToResolve.length > 0 && (
                    <span style={{ ...tokens.typeBodyMeta, color: unresolved.length === 0 && dupTeamIds.length === 0 ? t.textMuted : t.danger }}>
                      {mappedCount} of {namesToResolve.length} team{namesToResolve.length === 1 ? '' : 's'} mapped
                    </span>
                  )}
                  <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                  <Button variant="primary" size="md" accent={accentColor} isDark={isDark}
                    disabled={!canApply} onClick={doImport}>
                    {isByRound
                      ? `Apply ${changes.length} change${changes.length === 1 ? '' : 's'}`
                      : `Apply ${trades.length} trade${trades.length === 1 ? '' : 's'}`}
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

// ── Draft board ──────────────────────────────────────────────────────────────
// Once standings are on file the grid IS the draft: columns are rounds, rows
// are pick slots, so each column reads top to bottom as the order that round
// will be drafted in. Each cell is the team on the clock, with the overall
// pick number above the name. A traded pick is highlighted and shows its
// CURRENT owner (the team that will actually pick); whose pick it was
// originally is on hover. ONE cell per pick per round, always — nothing
// merges.
//
// Before the lottery is drawn, a round's lottery slots (the first N in odd
// rounds, the last N in even — the snake) can't be mapped to a team yet, so
// each is a muted "Lottery pick" placeholder carrying only its overall
// number. When any lottery team's pick in that round has been traded, every
// placeholder in that round carries an asterisk, and hovering one says which
// team will pick somewhere in that range via whom — the trade is real, the
// slot isn't known yet. A line above the board names the lottery teams and
// links to the Lottery page; it disappears with the draw, when the
// placeholders fill with names and the asterisks resolve to specific cells.
const SLOT_W = 44;
const CELL_W = 92;

// A pick's original-owner half of the story is what a click edits: the
// select is always "who now owns {original}'s R{n} pick", whichever cell it
// was opened from.
function PickCell({ number, label, traded, title, ariaLabel, editing, ownerId, teams, onEdit, onPick, onBlur, isDark, accentColor }) {
  const t = makeTheme(isDark);
  if (editing) {
    return (
      <select autoFocus value={ownerId} onChange={e => onPick(e.target.value)} onBlur={onBlur}
        aria-label={ariaLabel}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`,
          borderRadius: tokens.radiusSm, padding: '4px 2px', fontSize: 11, fontWeight: 600,
          color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer',
        }}>
        {teams.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    );
  }
  return (
    <button onClick={onEdit} className={traded ? undefined : 'kh-pick-cell'} title={title} aria-label={ariaLabel}
      style={{
        width: '100%', boxSizing: 'border-box',
        background: traded ? t.warningBg : 'none',
        border: `1px solid ${traded ? t.warningBorder : 'transparent'}`,
        borderRadius: tokens.radiusSm, padding: '4px 4px',
        fontSize: 11, fontWeight: traded ? 700 : 500,
        color: traded ? t.warning : t.textBody,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
      }}>
      {number != null && (
        <span style={{ display: 'block', ...tokens.typeStatMeta, fontWeight: 700, color: traded ? t.warning : t.textSecondary, marginBottom: 1 }}>
          {number}
        </span>
      )}
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {label}
      </span>
    </button>
  );
}

// A lottery slot before the draw: the number is known, the team isn't. Not
// clickable — a placeholder maps to no owner, so a trade on a lottery team's
// pick is recorded from the Add-trade control instead. The asterisk marks a
// round in which a lottery team's pick has been traded; the title says whose.
function LotteryPlaceholder({ overall, trades, isDark }) {
  const t = makeTheme(isDark);
  const marked = trades.length > 0;
  const title = marked ? trades.join(' ') : `Pick ${overall} — a lottery slot; the team is set when the lottery is run.`;
  // The asterisk's meaning is in the DOM as read-only text, not just in the
  // hover: a screen reader hears the same sentences a sighted reader gets on
  // hover ("One of picks 25–28 is Corey's, via Pedram.").
  return (
    <span title={title}
      style={{
        display: 'block', width: '100%', boxSizing: 'border-box',
        border: `1px dashed ${t.border}`, borderRadius: tokens.radiusSm, padding: '4px 4px',
        textAlign: 'center', whiteSpace: 'nowrap', cursor: marked ? 'help' : 'default',
        position: 'relative',
      }}>
      <span style={{ display: 'block', ...tokens.typeStatMeta, fontWeight: 700, color: t.textMuted, marginBottom: 1 }}>
        {overall}{marked && <span aria-hidden style={{ color: t.warning, marginLeft: 2 }}>*</span>}
      </span>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: t.textMuted, fontStyle: 'italic' }}>Lottery pick</span>
      <SrOnly>{marked ? ` ${trades.join(' ')}` : ' The team is set when the lottery is run.'}</SrOnly>
    </span>
  );
}

// "One of picks 25–28 is Corey's, via Pedram." — one sentence per traded
// lottery-team pick in the round. Exported for the smoke test.
export function lotteryTradeLines(league, board, round, nameOf) {
  const range = lotteryRangeFor(board, round);
  if (!range) return [];
  const span = range[0] === range[1] ? `pick ${range[0]}` : `picks ${range[0]}–${range[1]}`;
  return board.lotteryEligible
    .map(id => ({ original: id, owner: pickOwnerId(league, round, id) }))
    .filter(p => p.owner !== p.original)
    .map(p => `One of ${span} is ${nameOf(p.owner)}'s, via ${nameOf(p.original)}.`);
}

function DraftBoardGrid({ league, board, teams, isDark, accentColor, editing, setEditing, reassign }) {
  const t = makeTheme(isDark);
  const nameOf = (id) => teams.find(tm => tm.id === id)?.name || '?';
  const n = board.teams;
  const rounds = board.rounds;
  const roundList = Array.from({ length: rounds }, (_, i) => i + 1);
  const bySlot = new Map(board.picks.map(p => [`${p.round}:${p.slot}`, p]));
  const tradeLinesByRound = new Map(roundList.map(r => [r, lotteryTradeLines(league, board, r, nameOf)]));
  const isEditing = (round, originalTeamId) => !!editing && editing.round === round && editing.originalTeamId === originalTeamId;
  const stickyBg = { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})` };
  const roundRule = `1px solid ${t.divider}`;

  const cellFor = (round, originalTeamId, number) => {
    const ownerId = pickOwnerId(league, round, originalTeamId);
    const traded = ownerId !== originalTeamId;
    const title = traded
      ? `Pick ${number} — originally ${nameOf(originalTeamId)}'s pick, now ${nameOf(ownerId)}'s. Click to reassign.`
      : `Pick ${number} — ${nameOf(originalTeamId)}'s own pick. Click to record a trade.`;
    // The accessible name carries everything the hover does — the origin of
    // a traded pick is only on hover visually, and hover doesn't exist for a
    // screen reader.
    return (
      <PickCell number={number} label={nameOf(ownerId)} traded={traded} title={title}
        ariaLabel={`Round ${round}, ${title}`}
        editing={isEditing(round, originalTeamId)} ownerId={ownerId} teams={teams}
        onEdit={() => setEditing({ round, originalTeamId })}
        onPick={id => reassign(round, originalTeamId, id)}
        onBlur={() => setEditing(null)}
        isDark={isDark} accentColor={accentColor} />
    );
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: SLOT_W + rounds * CELL_W }}>
        <thead>
          <tr>
            {/* Sticky cells layer the translucent sectionBg over the opaque
                cardBg — a bare sectionBg would let scrolled cells ghost through. */}
            <th scope="col" style={{ width: SLOT_W, padding: '10px 4px', ...stickyBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted, textAlign: 'center', position: 'sticky', left: 0, zIndex: 2 }}>Pick</th>
            {/* A rule on every round column's left edge: rounds-as-columns
                is the right layout, but fantasy readers know Yahoo's
                rounds-as-rows, so the columns have to read as distinct at a
                glance rather than as one undifferentiated grid. */}
            {roundList.map(round => (
              <th key={round} scope="col" style={{ width: CELL_W, padding: '10px 6px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, borderLeft: roundRule, ...tokens.typeLabelEyebrow, color: t.textSecondary, textAlign: 'center', whiteSpace: 'nowrap' }}>
                R{round}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => i + 1).map(slot => {
            const rowBorder = slot < n ? `1px solid ${t.dividerFaint}` : 'none';
            return (
              <tr key={slot}>
                <th scope="row" style={{ padding: '6px 4px', ...stickyBg, borderBottom: rowBorder, ...tokens.typeBodyMeta, fontWeight: 700, color: t.textSecondary, textAlign: 'center', position: 'sticky', left: 0, zIndex: 1 }}>
                  {slot}
                </th>
                {roundList.map(round => {
                  const pick = bySlot.get(`${round}:${slot}`);
                  return (
                    <td key={round} style={{ padding: '3px 4px', borderBottom: rowBorder, borderLeft: roundRule, textAlign: 'center' }}>
                      {!pick ? null : pick.pending
                        ? <LotteryPlaceholder overall={pick.overall} trades={tradeLinesByRound.get(round)} isDark={isDark} />
                        : cellFor(round, pick.originalTeamId, String(pick.overall))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The pre-lottery line above the board: who's in the lottery, and the way to
// run it. Gone once the draw is on file.
function LotteryPendingLine({ league, board, teams, isDark }) {
  const t = makeTheme(isDark);
  const names = sortTeamsByName(teams.filter(tm => board.lotteryEligible.includes(tm.id))).map(tm => tm.name);
  return (
    <div style={{ padding: '10px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...tokens.typeBodyMeta, color: t.textSecondary }}>
      <span>
        <strong style={{ color: t.textPrimary }}>Lottery not run</strong>
        {names.length > 0 && <> — {names.join(', ')} {names.length === 1 ? 'is' : 'are'} in it.</>}
      </span>
      <Link to={`/league/${league.id}/lottery`} style={{ ...tokens.typePill, fontWeight: 700, color: tokens.info, textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Run lottery →
      </Link>
    </div>
  );
}

// Record a trade without clicking a cell: round, original owner, new owner.
// Needed before the lottery (a placeholder maps to no owner) and for the
// pre-draft trades this page logs as they happen. Writes exactly what a
// cell click writes.
function AddTradeControl({ league, teams, rounds, isDark, accentColor, onReassign }) {
  const t = makeTheme(isDark);
  const [open, setOpen] = React.useState(false);
  const [round, setRound] = React.useState(1);
  const [original, setOriginal] = React.useState(teams[0]?.id || '');
  const [owner, setOwner] = React.useState(teams[1]?.id || teams[0]?.id || '');
  const sel = {
    background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm,
    padding: '6px 8px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer',
  };
  const canAdd = original && owner && original !== owner;
  function submit() {
    if (!canAdd) return;
    onReassign(Number(round), original, owner);
    setOpen(false);
  }
  if (!open) {
    return (
      <Button variant="secondary" size="sm" isDark={isDark} onClick={() => setOpen(true)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={13} strokeWidth={2.5} /> Add trade</span>
      </Button>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }} aria-label="Add a pick trade"
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...tokens.typeBodyMeta, color: t.textMuted }}>
        Round
        <select value={round} onChange={e => setRound(e.target.value)} style={sel} aria-label="Trade round">
          {Array.from({ length: rounds }, (_, i) => i + 1).map(r => <option key={r} value={r}>R{r}</option>)}
        </select>
      </label>
      <select value={original} onChange={e => setOriginal(e.target.value)} style={sel} aria-label="Original owner">
        {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}'s pick</option>)}
      </select>
      <ArrowRight size={13} strokeWidth={2} color={t.textMuted} />
      <select value={owner} onChange={e => setOwner(e.target.value)} style={sel} aria-label="New owner">
        {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
      </select>
      <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} disabled={!canAdd} onClick={submit}>Record</Button>
      <Button variant="secondary" size="sm" isDark={isDark} onClick={() => setOpen(false)}>Cancel</Button>
      {original && original === owner && <span style={{ ...tokens.typeBodyMeta, color: t.danger }}>Pick a different new owner.</span>}
    </form>
  );
}

// ── Ownership grid (fallback) ────────────────────────────────────────────────
// Without usable standings there is no order to lay the picks out in, so the
// grid falls back to the ownership view: each column is a team's ORIGINAL
// picks, round by round, and a traded cell shows where the pick went.
const ROUND_W = 44;

function OwnershipGrid({ league, teams, rounds, isDark, accentColor, editing, setEditing, reassign }) {
  const t = makeTheme(isDark);
  const nameOf = (id) => teams.find(tm => tm.id === id)?.name || '?';
  const isEditing = (round, originalTeamId) => !!editing && editing.round === round && editing.originalTeamId === originalTeamId;
  const stickyBg = { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})` };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: ROUND_W + teams.length * CELL_W }}>
        <thead>
          <tr>
            <th style={{ width: ROUND_W, padding: '10px 8px', ...stickyBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }}>Rd</th>
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
              <td style={{ padding: '6px 8px', ...stickyBg, borderBottom: round < rounds ? `1px solid ${t.dividerFaint}` : 'none', ...tokens.typeBodyMeta, fontWeight: 700, color: t.textSecondary, position: 'sticky', left: 0, zIndex: 1 }}>
                R{round}
              </td>
              {teams.map(tm => {
                const ownerId = pickOwnerId(league, round, tm.id);
                const traded = ownerId !== tm.id;
                return (
                  <td key={tm.id} style={{ padding: '3px 4px', borderBottom: round < rounds ? `1px solid ${t.dividerFaint}` : 'none', textAlign: 'center' }}>
                    <PickCell number={null}
                      // The pick moved TO the owner — an arrow, not "via",
                      // which pointed the wrong way in this column layout.
                      label={traded ? `→ ${nameOf(ownerId)}` : tm.name} traded={traded}
                      title={`${tm.name}'s R${round} pick — ${traded ? `traded to ${nameOf(ownerId)}. Click to reassign.` : 'click to record a trade'}`}
                      ariaLabel={`Owner of ${tm.name}'s round ${round} pick`}
                      editing={isEditing(round, tm.id)} ownerId={ownerId} teams={teams}
                      onEdit={() => setEditing({ round, originalTeamId: tm.id })}
                      onPick={id => reassign(round, tm.id, id)}
                      onBlur={() => setEditing(null)}
                      isDark={isDark} accentColor={accentColor} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftPicksPanel({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  // Team lists are alphabetical (selects, the fallback grid's columns) — a
  // lookup, and stored creation order tells a reader nothing. Display order
  // only; picks are keyed by team id.
  const teams = sortTeamsByName(league.teams || []);
  const rounds = getDraftRounds(league);
  // The board is the same one the shared page derives, so the commissioner
  // sees exactly what the league sees: the draft order once standings are on
  // file, exact numbers once the lottery is drawn.
  const board = React.useMemo(() => buildDraftBoard(league), [league]);
  const boardReady = board.ok;
  const numberAt = (round, originalTeamId) => formatPickNumber(pickNumberFor(board, round, originalTeamId));
  const [editing, setEditing] = React.useState(null); // { round, originalTeamId } | null
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

  // Where to go to get the board: standings live on the Import page, a tie
  // breaks on the Lottery page.
  const fallbackHint = board.reason === 'unresolved-ties'
    ? 'Break it on the Lottery page to lay the picks out as a draft board.'
    : 'Import last season’s standings (Import page) to lay the picks out as a draft board.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intro + rounds control */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>{boardReady ? 'Draft board' : 'Who owns which pick'}</div>
          <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
            {boardReady ? (
              <>
                Columns are rounds, rows are pick slots — each column reads top to bottom as that round&rsquo;s order, and each cell is the team on the clock with its overall pick number. <strong style={{ color: t.textSecondary }}>Click any pick to record a trade</strong> (or use Add trade below); traded picks are highlighted with their current owner, and hovering one says whose pick it was originally.
                {!board.complete && <> Lottery slots are placeholders until the lottery is run; an asterisk marks a round where a lottery team&rsquo;s pick has been traded.</>}
              </>
            ) : (
              <>
                <strong style={{ color: t.textSecondary }}>{describeBoardReason(board.reason)}</strong> {fallbackHint} Until then each column is a team&rsquo;s original picks — <strong style={{ color: t.textSecondary }}>click any pick to record a trade</strong>. Round 1 stays in sync with the Lottery page.
              </>
            )}
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

      {/* The grid: a draft board once there is an order, ownership by team until then */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        {/* Hover affordance for the click-to-reassign edit path — untraded
            cells only (traded cells already carry the warning tint). */}
        <style>{`
          .kh-pick-cell { transition: background 0.12s, border-color 0.12s, color 0.12s; }
          .kh-pick-cell:hover { background: ${t.sectionBg}; border-color: ${t.border} !important; color: ${t.textPrimary}; }
        `}</style>
        {boardReady && !board.complete && (
          <LotteryPendingLine league={league} board={board} teams={teams} isDark={isDark} />
        )}
        {boardReady ? (
          <DraftBoardGrid league={league} board={board} teams={teams} isDark={isDark} accentColor={accentColor}
            editing={editing} setEditing={setEditing} reassign={reassign} />
        ) : (
          <OwnershipGrid league={league} teams={teams} rounds={rounds} isDark={isDark} accentColor={accentColor}
            editing={editing} setEditing={setEditing} reassign={reassign} />
        )}
      </div>

      {/* Traded-picks roll-up */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Traded Picks</div>
            <div style={{ fontSize: '12px', color: t.textMuted }}>{traded.length === 0 ? 'none' : traded.length}</div>
          </div>
          <AddTradeControl league={league} teams={teams} rounds={rounds} isDark={isDark} accentColor={accentColor}
            onReassign={reassign} />
        </div>
        {traded.length === 0 ? (
          <div style={{ padding: '14px 20px', ...tokens.typeBodyMeta, color: t.textMuted }}>
            Every team owns its own picks. Record a trade by clicking a pick in the grid above, or with Add trade.
          </div>
        ) : (
          <div style={{ padding: '6px 20px 10px' }}>
            {traded.map((p, i) => (
              <div key={`${p.round}:${p.originalTeamId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < traded.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
                <span style={{ ...tokens.typePillEmphatic, color: t.warning, background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: tokens.radiusSm, padding: '2px 7px', flexShrink: 0 }}>R{p.round}</span>
                <span style={{ ...tokens.typeBody, color: t.textBody, flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {numberAt(p.round, p.originalTeamId) && <span style={{ fontWeight: 700, color: t.textPrimary }}>Pick {numberAt(p.round, p.originalTeamId)}</span>}
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

export { DraftPicksPanel, PicksPasteModal, parseDraftPicksText };
