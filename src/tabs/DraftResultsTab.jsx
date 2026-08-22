import React from 'react';
import { ClipboardList, X } from 'lucide-react';
import { isAuctionCost } from '../lib/keeperRules.js';
import { makeTheme, tokens, Button, Headshot, HScrollRow, PriceMarkSlot } from '../components.jsx';
import { PlayerAutocomplete, posForRoster } from '../PlayerAutocomplete.jsx';
import { loadPlayers, normalizeName } from '../lib/players.js';
import { isNflSport } from '../lib/nflDirectory.js';
import { sortTeamsByName } from '../lib/teamOrder.js';
import { getDraftRounds } from '../lib/draftPicks.js';
import { setPrice, resetPrice, priceOf, computedPriceOf, isPriceOverridden } from '../lib/priceProvenance.js';
import { appendChanges, changeEntry } from '../lib/changeLog.js';
import { DraftImportFlow } from './ImportTab.jsx';

// ── Last Draft page (the "Last Draft" door) ──────────────────────────────────
// The home for the imported prior-year draft — every team's players in one
// view, with the VALUE (drafted price on auction, draft round on snake)
// editable inline for fixing paste glitches, and unmatched names resolvable
// in place via the directory autocomplete (same treatment as roster imports).
//
// It's also where the draft import LANDS: the paste→map→confirm flow runs ON
// this page as steps (DraftImportFlow), never as a modal — after confirming,
// the commissioner is simply here looking at the result under a transient
// success banner. Full page, persistent-nav pattern (rendered by LeagueView
// like Picks/Lottery); available to both draft types.
//
// Data source is team.priorKeepers — the record the draft import writes.

// One draft row: headshot · pos chip · name (autocomplete-in-place) · value ·
// remove. The name cell holds a local draft so typing doesn't commit a league
// write per keystroke — it commits on suggestion pick or blur; the pos chip
// and unmatched flag re-derive live from the committed name.
function NameCell({ value, onCommit, league, isDark, unmatched, disabledNames }) {
  const t = makeTheme(isDark);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { setDraft(value); }, [value]);

  // `picked` is the directory record when the name came from a suggestion —
  // that's how an NFL row with no player ID gets one attached in place
  // (the caller decides what to store).
  function commit(name, picked) {
    const clean = (name || '').trim();
    if (clean && (clean !== value || picked)) onCommit(clean, picked);
    else setDraft(value); // blanked or unchanged — snap back to the saved name
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) commit(draft); }}>
      <PlayerAutocomplete
        value={draft}
        onChange={(name, picked) => { setDraft(name); if (picked) commit(name, picked); }}
        sport={league.sport} isDark={isDark} placeholder="Player name"
        league={league} disabledNames={disabledNames}
        inputStyle={{
          width: '100%', boxSizing: 'border-box', background: 'none', border: 'none',
          fontSize: 13, fontWeight: 600, color: unmatched ? tokens.danger : t.textPrimary,
          fontFamily: 'inherit', outline: 'none', padding: 0,
        }}
      />
    </div>
  );
}

// Auction price cell — local draft committed on blur/Enter, NOT per
// keystroke: rows are value-sorted, so a live commit would resort the list
// under the cursor mid-edit.
function PriceCell({ entry, gridAccent, isDark, onCommit, onReset }) {
  const t = makeTheme(isDark);
  const value = priceOf(entry);
  const overridden = isPriceOverridden(entry);
  const [draft, setDraft] = React.useState(value ?? '');
  React.useEffect(() => { setDraft(value ?? ''); }, [value]);
  function commit() {
    const next = draft === '' ? null : (parseInt(draft, 10) || 0);
    if (next !== (value ?? null)) onCommit(next);
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <span style={{ ...tokens.typeBody, color: t.textMuted }}>$</span>
      {/* Typing over an imported price keeps the imported one underneath, so a
          re-import can refresh it without discarding the correction.
          flexShrink 0: the field's width is fixed, never something the row can
          borrow from mid-edit. */}
      <input type="number" min="0" value={draft} placeholder="—" aria-label="Drafted price"
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ width: 50, flexShrink: 0, background: t.cardBg, border: `1px solid ${overridden ? t.textMuted : t.border}`, borderRadius: tokens.radiusSm, padding: '5px 6px', color: gridAccent, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center' }} />
      {/* Always rendered, invisible until overridden — the mark must never
          appear mid-edit and shift the field. */}
      <PriceMarkSlot overridden={overridden} computed={computedPriceOf(entry)} isDark={isDark} onReset={onReset} />
    </span>
  );
}

function DraftRow({ entry, team, idx, league, isDark, gridAccent, dirMap, dirReady, maxRound, onUpdate, onSetPrice, onResetPrice, onSetRound, onRemove }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';
  const nfl = isNflSport(league.sport);
  const rec = dirMap ? dirMap.get(normalizeName(entry.player)) : null;
  // NFL flags rows with no stored player ID (nothing to join on later);
  // hockey flags names the JSON directory doesn't know.
  const unmatched = nfl
    ? (!entry.playerId && !!entry.player)
    : (dirReady && !rec && !!entry.player);
  // Position: directory match wins (real codes); the paste's own position
  // string is the fallback for unmatched/non-NHL rows.
  const pos = nfl
    ? (entry.pos || (entry.positions || '').split(',')[0].trim() || null)
    : (rec?.pos ? posForRoster(rec.pos) : (entry.positions || '').split(',')[0].trim() || null);
  const otherNames = new Set(
    (team.priorKeepers || []).filter((_, oi) => oi !== idx).map(p => normalizeName(p.player)).filter(Boolean)
  );

  const selStyle = {
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm,
    padding: '5px 6px', color: gridAccent, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  };

  return (
    <div style={{
      background: t.sectionBg, border: `1px solid ${unmatched ? t.dangerBorder : t.border}`,
      borderRadius: tokens.radiusMd, padding: '7px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Headshot name={entry.player} map={dirMap} size={28} isDark={isDark} />
        <span style={{ ...tokens.typePill, fontWeight: 700, color: t.textMuted, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 3, padding: '1px 5px', minWidth: 24, textAlign: 'center', flexShrink: 0 }}>
          {pos || '—'}
        </span>
        <NameCell value={entry.player} league={league} isDark={isDark} unmatched={unmatched}
          disabledNames={otherNames}
          onCommit={(name, picked) => onUpdate(nfl && picked?.playerId
            // Picking a suggestion resolves the row: store the id and keep
            // (or set) the source string this row came from.
            ? { player: name, playerId: picked.playerId, ...(picked.pos ? { pos: picked.pos } : {}), sourceName: entry.sourceName || entry.player }
            : { player: name })} />
        {isSnake ? (
          <select value={entry.acquisitionRound ?? ''} aria-label="Draft round"
            onChange={e => onSetRound(e.target.value === '' ? null : parseInt(e.target.value))}
            style={{ ...selStyle, color: entry.acquisitionRound != null ? gridAccent : t.textMuted, flexShrink: 0 }}>
            <option value="">Rd —</option>
            {Array.from({ length: maxRound }, (_, ri) => ri + 1).map(v => <option key={v} value={v}>Rd {v}</option>)}
          </select>
        ) : (
          <PriceCell entry={entry} gridAccent={gridAccent} isDark={isDark}
            onCommit={onSetPrice} onReset={onResetPrice} />
        )}
        <button onClick={onRemove} aria-label="Remove row" title="Remove row"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, lineHeight: 1, padding: 4, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit', flexShrink: 0 }}>
          <X size={14} strokeWidth={2} />
        </button>
      </div>
      {unmatched && (
        <div style={{ marginTop: 3, paddingLeft: 68, fontSize: 10, fontWeight: 600, color: tokens.danger }}>
          {nfl
            ? 'no player ID — pick this player from the suggestions to attach one'
            : 'unmatched — pick from the suggestions or fix the spelling'}
        </div>
      )}
    </div>
  );
}

function LastDraftPanel({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';
  const gridAccent = league.draftType === 'auction' ? tokens.warning : tokens.info;
  const teams = league.teams || [];
  const maxRound = getDraftRounds(league);

  // NHL directory — matching + headshots + the in-place autocomplete. Same
  // status handling as the roster import: "loaded but empty" is an explicit
  // error state (banner), never silent pass-through.
  // NFL rows carry their own resolution (playerId, stamped at import), so this
  // page needs no directory load for them — only the in-place typeahead,
  // which queries Supabase itself.
  const nfl = isNflSport(league.sport);
  const supportsDirectory = league.sport === 'hockey' || league.sport === 'nhl';
  const [dirMap, setDirMap] = React.useState(null);
  const [dirStatus, setDirStatus] = React.useState(supportsDirectory ? 'loading' : 'none'); // loading | ready | empty | error | none
  React.useEffect(() => {
    if (!supportsDirectory) return;
    let cancelled = false;
    loadPlayers('nhl')
      .then(d => {
        if (cancelled) return;
        const list = d.players || [];
        const m = new Map();
        list.forEach(p => { const k = normalizeName(p.name); if (k && !m.has(k)) m.set(k, p); });
        setDirMap(m);
        setDirStatus(list.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => { if (!cancelled) setDirStatus('error'); });
    return () => { cancelled = true; };
  }, [supportsDirectory]);
  const dirReady = dirStatus === 'ready';
  const dirUnavailable = dirStatus === 'empty' || dirStatus === 'error';

  const teamsWithDraft = teams.filter(tm => (tm.priorKeepers || []).length > 0);
  const totalPlayers = teamsWithDraft.reduce((s, tm) => s + tm.priorKeepers.length, 0);
  const hasData = totalPlayers > 0;
  // "Unmatched" means two different things by sport, and both are the same
  // problem: a row with no resolved identity. Hockey reads it off the JSON
  // directory; NFL reads it off the stored playerId — a row without one is
  // exactly the row that can't be joined to another platform later, and it
  // needs no lookup to spot.
  const unmatchedCount = nfl
    ? teamsWithDraft.reduce((s, tm) => s + tm.priorKeepers.filter(p => p.player && !p.playerId).length, 0)
    : (dirReady
      ? teamsWithDraft.reduce((s, tm) => s + tm.priorKeepers.filter(p => p.player && !dirMap.get(normalizeName(p.player))).length, 0)
      : 0);

  const [importing, setImporting] = React.useState(false);
  const [summary, setSummary] = React.useState(null); // transient success banner
  const [teamFilter, setTeamFilter] = React.useState('all');

  function updateEntry(teamId, idx, patch, changes = []) {
    onUpdateLeague(appendChanges({
      ...league,
      teams: teams.map(tm => tm.id === teamId
        ? { ...tm, priorKeepers: (tm.priorKeepers || []).map((p, i) => i === idx ? { ...p, ...patch } : p) }
        : tm),
    }, changes));
  }

  const entryAt = (teamId, idx) =>
    (teams.find(tm => tm.id === teamId)?.priorKeepers || [])[idx] || null;
  const teamNameOf = (teamId) => teams.find(tm => tm.id === teamId)?.name || '';

  // Drafted price: the imported value stays underneath the commissioner's, so
  // a later re-import refreshes it without discarding the correction.
  function setEntryPrice(teamId, idx, next) {
    const entry = entryAt(teamId, idx);
    if (!entry || priceOf(entry) === next) return;
    const patch = setPrice(entry, next);
    updateEntry(teamId, idx, patch, changeEntry({
      kind: patch.keptForOverridden ? 'draftPrice' : 'draftPriceReset', field: 'keptFor',
      teamId, teamName: teamNameOf(teamId), player: entry.player,
      from: priceOf(entry), to: patch.keptFor,
    }));
  }
  function resetEntryPrice(teamId, idx) {
    const entry = entryAt(teamId, idx);
    if (!entry || !isPriceOverridden(entry)) return;
    const patch = resetPrice(entry);
    updateEntry(teamId, idx, patch, changeEntry({
      kind: 'draftPriceReset', field: 'keptFor',
      teamId, teamName: teamNameOf(teamId), player: entry.player,
      from: priceOf(entry), to: patch.keptFor,
    }));
  }
  // Rounds are logged but carry no stored provenance — a re-import replaces
  // them outright, which is what the draft import's guard says.
  function setEntryRound(teamId, idx, next) {
    const entry = entryAt(teamId, idx);
    if (!entry || (entry.acquisitionRound ?? null) === next) return;
    updateEntry(teamId, idx, { acquisitionRound: next }, changeEntry({
      kind: 'round', field: 'acquisitionRound',
      teamId, teamName: teamNameOf(teamId), player: entry.player,
      from: entry.acquisitionRound ?? null, to: next,
    }));
  }
  function removeEntry(teamId, idx) {
    onUpdateLeague({
      ...league,
      teams: teams.map(tm => tm.id === teamId
        ? { ...tm, priorKeepers: (tm.priorKeepers || []).filter((_, i) => i !== idx) }
        : tm),
    });
  }

  // ── Import mode: the paste→map→confirm flow as page content ────────────────
  // Full content width, like every other full page — no sheet-era maxWidth
  // (the flow's mapping list is width-aware and goes two-up on desktop).
  if (importing) {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Import Last Year's Draft</div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {hasData && (
            <div style={{ marginBottom: 12, padding: '9px 12px', background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: tokens.radiusSm, fontSize: 12, color: t.warning, lineHeight: 1.5 }}>
              Re-importing replaces the draft data of every team matched in the paste.
            </div>
          )}
          <DraftImportFlow league={league} accentColor={accentColor} isDark={isDark}
            onImport={onUpdateLeague}
            onComplete={s => { setSummary(s); setImporting(false); setTeamFilter('all'); }}
            onCancel={() => setImporting(false)} />
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!hasData) {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.textSecondary }}>No draft imported yet</div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>
          {isAuctionCost(league)
            ? "Paste last year's draft results to attach each player's drafted price — this is how keeper costs are calculated."
            : "Paste last year's draft results to record draft rounds (used by pick-based keeper rules) and carry forward existing terms."}
        </div>
        <div style={{ marginTop: 14 }}>
          <Button variant="primary" size="md" accent={accentColor} isDark={isDark} onClick={() => setImporting(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ClipboardList size={14} strokeWidth={2} /> Paste Draft
            </span>
          </Button>
        </div>
      </div>
    );
  }

  // ── Populated view ─────────────────────────────────────────────────────────
  const shownTeams = teamFilter === 'all'
    ? teamsWithDraft
    : teamsWithDraft.filter(tm => tm.id === teamFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Transient success banner — the import's landing acknowledgement; the
          table below IS the result. Gone on dismiss or navigation. */}
      {summary && (() => {
        const n = summary.teams.reduce((s, tm) => s + tm.players, 0);
        return (
          <div style={{ background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.success }}>
                ✓ {n} player{n === 1 ? '' : 's'} imported across {summary.teams.length} team{summary.teams.length === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: 12, color: t.textSecondary, marginTop: 2, lineHeight: 1.45 }}>
                {isSnake
                  ? 'Contracts and draft rounds are attached below — fix any parse glitch in place.'
                  : 'Drafted prices are attached below — fix any parse glitch in place.'}
              </div>
            </div>
            <button onClick={() => setSummary(null)} aria-label="Dismiss"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, lineHeight: 1, padding: 4, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit', flexShrink: 0 }}>
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        );
      })()}

      {/* Header card: what this is + the re-import entry point */}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>Last year's draft</div>
          <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
            {totalPlayers} player{totalPlayers === 1 ? '' : 's'} across {teamsWithDraft.length} team{teamsWithDraft.length === 1 ? '' : 's'}
            {unmatchedCount > 0 && <span style={{ color: tokens.danger, fontWeight: 600 }}> · {unmatchedCount} unmatched</span>}
            {' — '}{isAuctionCost(league)
              ? 'drafted prices are what keeper costs are calculated from.'
              : 'draft rounds feed pick-based keeper rules; terms carry into the eligible pool.'}
          </div>
          {/* State the league's actual escalation rule (from config, matching
              buildTeamPool's fallbacks) so the price→cost math is explicit. */}
          {isAuctionCost(league) && (
            <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 3 }}>
              Keeper cost = drafted price + ${league.auctionRules?.costIncreasePerYear || 5}/yr · undrafted players start at ${league.auctionRules?.undraftedStartCost || 5}
            </div>
          )}
        </div>
        <Button variant="primary" size="sm" accent={accentColor} isDark={isDark} onClick={() => setImporting(true)} style={{ flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ClipboardList size={14} strokeWidth={2} /> Paste Draft
          </span>
        </Button>
      </div>

      {dirUnavailable && (
        <div style={{ padding: '10px 12px', background: tokens.warningBg, border: `1px solid ${tokens.warningBorder}`, borderRadius: 6, fontSize: 12, color: tokens.warning, lineHeight: 1.5 }}>
          <strong>Player directory unavailable</strong> — names can't be checked against the NHL directory right now, so spelling won't be verified. Values stay editable.
        </div>
      )}

      {/* Team filter chips — the Set-keepers chip pattern */}
      <HScrollRow isDark={isDark} t={t}>
        {[{ id: 'all', name: 'All teams' }, ...sortTeamsByName(teamsWithDraft)].map(tm => {
          const active = teamFilter === tm.id;
          return (
            <button key={tm.id} onClick={() => setTeamFilter(tm.id)} style={{
              background: active ? accentColor : t.sectionBg,
              border: `1px solid ${active ? accentColor : t.border}`,
              borderRadius: tokens.radiusMd, padding: '6px 12px', ...tokens.typePill, fontWeight: 700, cursor: 'pointer',
              color: active ? '#fff' : t.textSecondary, fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap',
            }}>{tm.name}</button>
          );
        })}
      </HScrollRow>

      {/* Per-team sections */}
      {shownTeams.map(tm => (
        <div key={tm.id} style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '11px 16px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{tm.name}</div>
            <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>{tm.priorKeepers.length} player{tm.priorKeepers.length === 1 ? '' : 's'}</div>
          </div>
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Display order is value-sorted (price desc on auction, round asc
                on snake; missing values last, alphabetical tiebreak) while
                edits/removes still address the ORIGINAL index into the
                priorKeepers array — never the display position. */}
            {tm.priorKeepers
              .map((entry, i) => ({ entry, i }))
              .sort((a, b) => {
                if (isSnake) {
                  const ra = a.entry.acquisitionRound ?? Infinity;
                  const rb = b.entry.acquisitionRound ?? Infinity;
                  if (ra !== rb) return ra - rb;
                } else {
                  const ca = a.entry.keptFor ?? -1;
                  const cb = b.entry.keptFor ?? -1;
                  if (ca !== cb) return cb - ca;
                }
                return (a.entry.player || '').localeCompare(b.entry.player || '');
              })
              .map(({ entry, i }) => (
                <DraftRow key={`${tm.id}-${i}`} entry={entry} team={tm} idx={i} league={league} isDark={isDark}
                  gridAccent={gridAccent} dirMap={dirMap} dirReady={dirReady} maxRound={maxRound}
                  onUpdate={patch => updateEntry(tm.id, i, patch)}
                  onSetPrice={v => setEntryPrice(tm.id, i, v)}
                  onResetPrice={() => resetEntryPrice(tm.id, i)}
                  onSetRound={v => setEntryRound(tm.id, i, v)}
                  onRemove={() => removeEntry(tm.id, i)} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { LastDraftPanel });

export { LastDraftPanel };
