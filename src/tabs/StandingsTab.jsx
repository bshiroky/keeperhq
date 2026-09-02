import React from 'react';
import { ClipboardList, Star } from 'lucide-react';
import { makeTheme, tokens, Button, ConfirmBody } from '../components.jsx';
import { parseStandingsText } from '../lib/standingsParse.js';
import { resolveTeamNames, rememberYahooTeams } from '../lib/teamMap.js';
import {
  rankStandings, lotteryEligible, resolveTie, recordCoinFlip, draftOrderConfigOf, describeTie,
  BASIS_LABEL, TIEBREAK_LABEL, TIEBREAK_MANUAL, standingsOf,
} from '../lib/draftOrder.js';
import { standingsImportImpact, standingsGuardLines } from '../lib/importGuard.js';
import { appendChanges, changeEntry } from '../lib/changeLog.js';

// ── Standings (last season) ──────────────────────────────────────────────────
// The third Yahoo paste, and the one that makes the draft order computable:
// Picks knows ownership and the Lottery knows the draw, but neither knew who
// finished where. Commissioner-only. Deliberately minimal — enough to import
// and verify; member-facing views come from a design pass.

const code = (t) => ({ background: t.sectionBg, padding: '1px 5px', borderRadius: 3, fontSize: 11 });

export function formatRecord(row) {
  if (row.wins == null) return '—';
  return `${row.wins}-${row.losses}-${row.ties}`;
}
export function formatPct(v) {
  if (v == null) return '—';
  return Number(v).toFixed(3).replace(/^0\./, '.');
}

// ── Tie-break editor ─────────────────────────────────────────────────────────
// "Stop and ask" — the manual override: for each tie that needs an order
// from the commissioner, the tied teams go in finishing order. Controlled —
// `value` is { [tieKey]: [teamIds best-first] } and the caller decides when
// it's written (the import applies it with the standings; the Lottery page
// saves it on its own). Selecting a team already placed elsewhere in the
// same tie moves it, so an order can never name one team twice.
//
// Under the chain (points → playoff finish → coin flip) this editor only
// appears for a tie that ALSO needs a manual answer; coin flips are recorded
// by `flipUnresolved` and shown, not edited.
export function tiesResolved(ties, value) {
  return (ties || []).every(tie => {
    const order = value?.[tie.key];
    return Array.isArray(order) && order.length === tie.teams.length && order.every(Boolean) && new Set(order).size === order.length;
  });
}
export function applyTieOrders(league, value) {
  let next = league;
  for (const order of Object.values(value || {})) {
    if (Array.isArray(order) && order.every(Boolean)) next = resolveTie(next, order);
  }
  return next;
}

// Record a coin flip for every tie that has reached the end of the chain.
// Returns the league with the flips on file (identity when there's nothing
// to flip). Seeds are generated and stored, so the result replays.
export function flipUnresolved(league) {
  let next = league;
  for (const tie of rankStandings(next).unresolvedTies) {
    if (tie.needs === 'coinflip') next = recordCoinFlip(next, tie.teams);
  }
  return next;
}

// Read-only list of how each tie was broken (playoff finish / coin flip /
// by hand), for the import's tie step and the Lottery page.
export function BrokenTiesList({ league, ties, isDark }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const nameOf = id => teams.find(tm => tm.id === id)?.name || '?';
  const shown = (ties || []).filter(tie => tie.resolved);
  if (shown.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted }}>Ties broken</div>
      <div style={{ padding: '4px 12px 8px' }}>
        {shown.map((tie, i) => (
          <div key={tie.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < shown.length - 1 ? `1px solid ${t.dividerFaint}` : 'none' }}>
            <span style={{ ...tokens.typePillEmphatic, color: tie.method === 'coinflip' ? t.warning : t.textMuted, background: tie.method === 'coinflip' ? t.warningBg : t.sectionBg, border: `1px solid ${tie.method === 'coinflip' ? t.warningBorder : t.border}`, borderRadius: tokens.radiusSm, padding: '2px 7px', flexShrink: 0 }}>
              {tie.method === 'coinflip' ? 'Coin flip' : tie.method === 'rank' ? 'Playoff finish' : 'By hand'}
            </span>
            <span style={{ ...tokens.typeBody, color: t.textBody }}>{describeTie(tie, nameOf)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TieBreakEditor({ league, ties, value, onChange, isDark, accentColor }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const rowsById = new Map((standingsOf(league)?.rows || []).map(r => [r.teamId, r]));
  const nameOf = id => teams.find(tm => tm.id === id)?.name || '?';
  const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`;
  const config = draftOrderConfigOf(league);

  function setPosition(tie, idx, teamId) {
    const cur = Array.isArray(value?.[tie.key]) ? [...value[tie.key]] : Array(tie.teams.length).fill(null);
    if (teamId) cur.forEach((id, i) => { if (id === teamId && i !== idx) cur[i] = null; });
    cur[idx] = teamId || null;
    onChange({ ...(value || {}), [tie.key]: cur });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '10px 12px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: 6, fontSize: 12, color: t.warning, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700 }}>{ties.length === 1 ? 'A tie has to be broken by hand' : `${ties.length} ties have to be broken by hand`}</div>
        <div style={{ marginTop: 2 }}>
          {config.tiebreak === TIEBREAK_MANUAL
            ? 'Your tiebreak setting is “ask me”, so every tie stops here.'
            : 'These teams are level on points and playoff finish.'}
          {' '}Put them in finishing order — the draft order never sorts a tie silently.
        </div>
      </div>
      {ties.map(tie => {
        const order = Array.isArray(value?.[tie.key]) ? value[tie.key] : [];
        const sample = rowsById.get(tie.teams[0]);
        return (
          <div key={tie.key} style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Tied: {tie.teams.map(nameOf).join(' · ')}</span>
              {sample && (
                <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>
                  {sample.pts != null ? `${sample.pts} pts` : ''}{sample.wins != null ? ` · ${formatRecord(sample)}` : ''}{sample.pct != null ? ` · ${formatPct(sample.pct)}` : ''}
                </span>
              )}
            </div>
            <div style={{ padding: '6px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tie.teams.map((_, idx) => (
                <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ ...tokens.typeBody, color: t.textSecondary, width: 110, flexShrink: 0 }}>Finishes {ordinal(idx + 1)} of {tie.teams.length}</span>
                  <select value={order[idx] || ''} onChange={e => setPosition(tie, idx, e.target.value)}
                    aria-label={`Team finishing ${ordinal(idx + 1)} in the tie`}
                    style={{ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${order[idx] ? accentColor : t.danger}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', minWidth: 200 }}>
                    <option value="">— Pick a team —</option>
                    {tie.teams.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Paste modal (paste → preview/mapping → ties → confirm) ───────────────────
// One modal, steps within. `initialText` is the render-test seam (the
// Rules-button lesson: a trigger and a step that each render fine can still
// be miswired between them).
// `initialStep: 'ties'` jumps a fully-resolved initial paste straight to the
// tie-break step, for the same reason — that step is only reachable by
// clicking Continue.
export function StandingsPasteModal({ league, isDark, accentColor, onUpdateLeague, onClose, initialText = '', initialStep = null }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const teamName = id => teams.find(tm => tm.id === id)?.name || '?';

  const previewOf = (src) => {
    const result = parseStandingsText(src);
    if (result.error) return { parsed: null, mapInit: {}, sources: {}, error: result.error };
    const resolved = resolveTeamNames(league, result.rows.map(r => r.team));
    const mapInit = {}, sources = {};
    for (const [name, r] of Object.entries(resolved)) {
      if (r.teamId) mapInit[name] = r.teamId;
      sources[name] = r.source;
    }
    return { parsed: result, mapInit, sources, error: null };
  };
  const initial = React.useMemo(() => (initialText ? previewOf(initialText) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText] = React.useState(initialText);
  const [parsed, setParsed] = React.useState(initial?.parsed || null);
  const [mapping, setMapping] = React.useState(initial?.mapInit || {});
  const [sources, setSources] = React.useState(initial?.sources || {});
  const [error, setError] = React.useState(initial?.error || null);
  const [step, setStep] = React.useState(initial?.parsed ? (initialStep === 'ties' ? 'ties' : 'preview') : 'paste'); // paste | preview | ties | guard
  const [tieOrders, setTieOrders] = React.useState({});
  const [guard, setGuard] = React.useState(null);

  const rows = parsed?.rows || [];
  const names = rows.map(r => r.team);
  const unresolved = names.filter(n => !mapping[n]);
  const suggested = names.filter(n => mapping[n] && sources[n] === 'suggested');
  const dupTeamIds = [...new Set(Object.values(mapping).filter(id => id && names.filter(n => mapping[n] === id).length > 1))];
  const mappedCount = new Set(names.map(n => mapping[n]).filter(Boolean)).size;
  const missingTeams = teams.filter(tm => !names.some(n => mapping[n] === tm.id));

  function pickTeam(name, id) {
    const next = { ...mapping };
    if (id) Object.keys(next).forEach(k => { if (k !== name && next[k] === id) delete next[k]; });
    if (id) next[name] = id; else delete next[name];
    setMapping(next);
    setSources({ ...sources, [name]: 'confirmed' });
  }

  function doPreview() {
    const { parsed: p, mapInit, sources: src, error: err } = previewOf(text);
    setError(err);
    if (!p) return;
    setParsed(p); setMapping(mapInit); setSources(src); setStep('preview'); setTieOrders({});
  }

  // The league as it would be after this paste — standings swapped in, the
  // confirmed names remembered — so tie detection and the overwrite guard
  // both look at the real outcome.
  function provisional() { return provisionalFor(mapping); }
  function provisionalFor(map) {
    const standingsRows = rows.filter(r => map[r.team]).map(r => ({
      teamId: map[r.team],
      rank: r.rank, wins: r.wins, losses: r.losses, ties: r.ties, pct: r.pct, pts: r.pts,
      clinched: !!r.clinched,
      // What the paste actually said, so a wrong mapping is visible later.
      sourceName: r.team,
    }));
    const base = {
      ...league,
      standings: { season: league.season || null, importedAt: new Date().toISOString(), rows: standingsRows, tieResolutions: {} },
    };
    return rememberYahooTeams(base, map);
  }

  const canContinue = rows.length > 0 && unresolved.length === 0 && dupTeamIds.length === 0 && missingTeams.length === 0;

  // Coin flips recorded during this import (chain step 3), kept with the
  // paste so the tie step can show them and Apply writes them.
  // (The tie-step render seam runs the chain up front, as Continue would.)
  const [flips, setFlips] = React.useState(() => (initialStep === 'ties' && initial?.parsed ? flipUnresolved(provisionalFor(initial.mapInit)) : null)); // league | null

  function fromPreview() {
    if (!canContinue) return;
    // The chain runs by itself: points, then playoff finish, then a coin
    // flip that's recorded here. Only a tie that still needs a hand-set
    // order (the manual override) stops on the editor — but every broken
    // tie is SHOWN before anything is written.
    const flipped = flipUnresolved(provisional());
    setFlips(flipped);
    const ranked = rankStandings(flipped);
    if (ranked.ties.length > 0) { setStep('ties'); return; }
    fromTies(flipped);
  }
  function fromTies(baseLeague) {
    const next = applyTieOrders(baseLeague || flips || provisional(), tieOrders);
    const impact = standingsImportImpact(league, next, { lotteryEligible });
    if (impact.hasImpact) { setGuard(impact); setStep('guard'); return; }
    applyImport(next, impact);
  }
  function applyImport(nextArg, impactArg) {
    const next0 = nextArg || applyTieOrders(flips || provisional(), tieOrders);
    const impact = impactArg || guard || standingsImportImpact(league, next0, { lotteryEligible });
    let next = next0;
    // A draw made among the wrong teams is void — clear it rather than let the
    // board apply picks 1–N to teams that aren't in the lottery any more.
    if (impact.drawCleared) next = { ...next, lotteryDraw: null, lotteryResults: null };
    next = appendChanges(next, changeEntry({
      kind: 'import', field: 'standings',
      note: `${next.standings.rows.length} teams${impact.drawCleared ? ' · lottery draw cleared' : ''}`,
    }));
    onUpdateLeague(next);
    onClose();
  }

  const ranked = step === 'ties' ? rankStandings(flips || provisional()) : null;
  const manualTies = ranked ? ranked.unresolvedTies.filter(tie => tie.needs !== 'coinflip') : [];

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 };
  const selStyle = (okBorder) => ({ background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${okBorder ? accentColor : t.danger}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer', minWidth: 150, maxWidth: 220 });
  const th = { padding: '6px 8px', ...tokens.typeLabelEyebrow, color: t.textMuted, textAlign: 'left', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap' };
  const td = { padding: '5px 8px', ...tokens.typeBody, color: t.textBody, borderBottom: `1px solid ${t.dividerFaint}`, verticalAlign: 'middle' };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '88vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>Import Standings</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Paste Yahoo's Standings page — rank, record and points feed the draft order.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 'guard' && guard && (
            <ConfirmBody
              isDark={isDark} accentColor={accentColor} danger
              title="Replace the standings on file?"
              intro="This league already has standings imported. There's no undo."
              lines={standingsGuardLines(guard)}
              note="Cancel leaves everything as it is — your paste stays on the preview step."
              confirmLabel="Replace standings"
              cancelLabel="← Back"
              onConfirm={() => applyImport()}
              onCancel={() => { setGuard(null); setStep('preview'); }}
            />
          )}

          {step === 'paste' && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                On Yahoo, open <strong>League → Standings</strong>, select the whole table (header row included is fine) and paste it here. Each row reads like <code style={code(t)}>*1 logo Da Real Dynasty 144-123-27 .536 315</code> — the <code style={code(t)}>logo</code> is dropped and the <code style={code(t)}>*</code> is read as a clinched playoff spot.
              </div>
              <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
                placeholder={"Rank\tTeam\tW-L-T\tPct\tPts\n*1\tlogo Da Real Dynasty\t144-123-27\t.536\t315\n*2\tlogo the grit grinders\t171-97-26\t.626\t368\n..."}
                style={{ width: '100%', minHeight: 200, background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 8, padding: 10, fontSize: 12, color: t.textPrimary, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              {error && (
                <div style={{ padding: '10px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger, lineHeight: 1.5 }}>{error}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                <Button variant="primary" size="md" accent={accentColor} isDark={isDark} disabled={!text.trim()} onClick={doPreview}>Preview →</Button>
              </div>
            </>
          )}

          {step === 'preview' && parsed && (
            <>
              <div style={{ fontSize: 12, color: t.textSecondary }}>
                Read <strong>{rows.length}</strong> team{rows.length === 1 ? '' : 's'}
                {rows.some(r => r.clinched) && <span style={{ color: t.textMuted }}> · {rows.filter(r => r.clinched).length} clinched a playoff spot</span>}.
                {' '}The draft order will sort on <strong>{BASIS_LABEL[draftOrderConfigOf(league).basis].toLowerCase()}</strong> (change this in Settings).
              </div>

              {parsed.issues.length > 0 && (
                <div style={{ padding: '10px 12px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Check before continuing</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>{parsed.issues.map((i, k) => <li key={k}>{i.text}</li>)}</ul>
                </div>
              )}

              {(unresolved.length > 0 || suggested.length > 0 || dupTeamIds.length > 0 || missingTeams.length > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {unresolved.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.danger }}>
                      Unrecognized team name{unresolved.length === 1 ? '' : 's'} — pick whose team each one is. It's remembered, so you map each new name once.
                    </div>
                  )}
                  {suggested.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.warning }}>
                      {suggested.length} name{suggested.length === 1 ? ' was' : 's were'} matched by similarity — check the suggestion before continuing.
                    </div>
                  )}
                  {dupTeamIds.length > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.danger }}>
                      Two rows are mapped to the same team ({dupTeamIds.map(teamName).join(', ')}) — every row needs its own team.
                    </div>
                  )}
                  {missingTeams.length > 0 && unresolved.length === 0 && dupTeamIds.length === 0 && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: t.danger }}>
                      No row for {missingTeams.map(tm => tm.name).join(', ')} — the draft order needs every team.
                    </div>
                  )}
                </div>
              )}

              <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={th}>Rank</th><th style={th}>Yahoo name</th><th style={th}>Team</th><th style={th}>W-L-T</th><th style={th}>Pct</th><th style={th}>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const id = mapping[r.team];
                      const src = sources[r.team];
                      const bad = !id || dupTeamIds.includes(id);
                      return (
                        <tr key={`${r.rank}:${r.team}`}>
                          <td style={{ ...td, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' }}>
                            {r.rank}{r.clinched && <Star size={11} strokeWidth={2} fill="currentColor" style={{ marginLeft: 4, color: t.success, verticalAlign: '-1px' }} aria-label="clinched playoff spot" />}
                          </td>
                          <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.team}>{r.team}</td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <select value={id || ''} onChange={e => pickTeam(r.team, e.target.value)} aria-label={`Match ${r.team}`} style={selStyle(!bad)}>
                                <option value="">— Pick a team —</option>
                                {teams.map(tm => {
                                  const usedElsewhere = names.some(n => n !== r.team && mapping[n] === tm.id);
                                  return <option key={tm.id} value={tm.id}>{usedElsewhere ? `${tm.name} ✓ (mapped)` : tm.name}</option>;
                                })}
                              </select>
                              {id && src === 'suggested' && <span style={{ ...tokens.typePill, color: t.warning, whiteSpace: 'nowrap' }}>suggested</span>}
                              {!id && <span style={{ ...tokens.typePill, color: t.danger, whiteSpace: 'nowrap' }}>new name</span>}
                            </div>
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatRecord(r)}</td>
                          <td style={td}>{formatPct(r.pct)}</td>
                          <td style={{ ...td, fontWeight: 700, color: t.textPrimary }}>{r.pts ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={() => { setStep('paste'); setError(null); }}>← Back to paste</Button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...tokens.typeBodyMeta, color: canContinue ? t.textMuted : t.danger }}>{mappedCount} of {rows.length} team{rows.length === 1 ? '' : 's'} mapped</span>
                  <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                  <Button variant="primary" size="md" accent={accentColor} isDark={isDark} disabled={!canContinue} onClick={fromPreview}>Continue →</Button>
                </div>
              </div>
            </>
          )}

          {step === 'ties' && ranked && (
            <>
              {manualTies.length === 0 && (
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                  Teams level on points were separated by the tiebreak chain — playoff finish (a worse finish picks earlier), then a recorded coin flip. Nothing was sorted silently; here's how each one broke.
                </div>
              )}
              <BrokenTiesList league={flips || provisional()} ties={ranked.ties} isDark={isDark} />
              {manualTies.length > 0 && (
                <TieBreakEditor league={flips || provisional()} ties={manualTies} value={tieOrders} onChange={setTieOrders} isDark={isDark} accentColor={accentColor} />
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={() => setStep('preview')}>← Back to preview</Button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" size="md" isDark={isDark} onClick={onClose}>Cancel</Button>
                  <Button variant="primary" size="md" accent={accentColor} isDark={isDark} disabled={!tiesResolved(manualTies, tieOrders)} onClick={() => fromTies()}>Continue →</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Import-page card ─────────────────────────────────────────────────────────
// Standings on file (rank · team · W-L-T · Pct · Pts, ★ = clinched) with the
// paste button. The draft-order settings line points at Settings; a tie that
// still needs breaking points at the Lottery page, where it's resolved.
export function StandingsCard({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const [showPaste, setShowPaste] = React.useState(false);
  const teams = league.teams || [];
  const nameOf = id => teams.find(tm => tm.id === id)?.name || '?';
  const standings = standingsOf(league);
  const rows = standings ? [...standings.rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : [];
  const config = draftOrderConfigOf(league);
  const ranked = standings ? rankStandings(league) : null;
  const importedAt = standings?.importedAt ? new Date(standings.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

  const th = { padding: '6px 20px', ...tokens.typeLabelEyebrow, color: t.textMuted, textAlign: 'left', borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap' };
  const td = { padding: '6px 20px', ...tokens.typeBody, color: t.textBody, borderBottom: `1px solid ${t.dividerFaint}` };

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ClipboardList size={16} strokeWidth={1.5} color={t.textSecondary} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Last Season's Standings</div>
            <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 2 }}>Who finished where. This is what the draft order and the lottery are built from.</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: standings ? t.success : t.textMuted, fontWeight: 700 }}>
            {standings ? `${rows.length} teams${importedAt ? ` · imported ${importedAt}` : ''}` : 'None on file'}
          </span>
          <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => setShowPaste(true)}>
            {standings ? 'Re-import' : 'Paste from Yahoo'}
          </Button>
        </div>
      </div>
      {!standings ? (
        <div style={{ padding: '14px 20px', ...tokens.typeBodyMeta, color: t.textMuted }}>
          No standings imported yet. Paste Yahoo's Standings page to seed the draft order.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={th}>Rank</th><th style={th}>Team</th><th style={th}>W-L-T</th><th style={th}>Pct</th><th style={th}>Pts</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.teamId}>
                    <td style={{ ...td, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap', borderBottom: i < rows.length - 1 ? td.borderBottom : 'none' }}>
                      {r.rank}{r.clinched && <Star size={11} strokeWidth={2} fill="currentColor" style={{ marginLeft: 4, color: t.success, verticalAlign: '-1px' }} aria-label="clinched playoff spot" />}
                    </td>
                    <td style={{ ...td, fontWeight: 600, color: t.textPrimary, borderBottom: i < rows.length - 1 ? td.borderBottom : 'none' }}>
                      {nameOf(r.teamId)}
                      {r.sourceName && r.sourceName !== nameOf(r.teamId) && <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginLeft: 6 }}>as “{r.sourceName}”</span>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', borderBottom: i < rows.length - 1 ? td.borderBottom : 'none' }}>{formatRecord(r)}</td>
                    <td style={{ ...td, borderBottom: i < rows.length - 1 ? td.borderBottom : 'none' }}>{formatPct(r.pct)}</td>
                    <td style={{ ...td, fontWeight: 700, color: t.textPrimary, borderBottom: i < rows.length - 1 ? td.borderBottom : 'none' }}>{r.pts ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 20px', background: t.sectionBg, borderTop: `1px solid ${t.divider}`, ...tokens.typeBodyMeta, color: t.textMuted, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>Draft order sorts on <strong style={{ color: t.textSecondary }}>{BASIS_LABEL[config.basis].toLowerCase()}</strong> · {config.lotteryTeams > 0 ? `${config.lotteryTeams}-team lottery` : 'no lottery'} · ties: {TIEBREAK_LABEL[config.tiebreak].toLowerCase()} — set in Settings.</span>
            {ranked && ranked.unresolvedTies.length > 0 && (
              <span style={{ color: t.warning, fontWeight: 600 }}>
                Tie to break: {ranked.unresolvedTies.map(tie => tie.teams.map(nameOf).join(' / ')).join('; ')} — on the Lottery page.
              </span>
            )}
            {ranked && ranked.unresolvedTies.length === 0 && ranked.ties.length > 0 && (
              <span>Ties broken: {ranked.ties.map(tie => describeTie(tie, nameOf)).join('; ')}.</span>
            )}
          </div>
        </>
      )}
      {showPaste && (
        <StandingsPasteModal league={league} isDark={isDark} accentColor={accentColor} onUpdateLeague={onUpdateLeague} onClose={() => setShowPaste(false)} />
      )}
    </div>
  );
}
