import React from 'react';
import { ArrowLeftRight, Check, Plus, Search, X } from 'lucide-react';
import { makeTheme, tokens, HScrollRow, Button, usePlayerMap, Headshot } from '../components.jsx';
import { PlayerAutocomplete } from '../PlayerAutocomplete.jsx';
import { loadPlayers, normalizeName, buildStatusIndex } from '../lib/players.js';
import { acquisitionOf } from '../lib/acquisition.js';
import { RosterEditor } from './RosterImportTab.jsx';

// ── Set-keepers workbench ────────────────────────────────────────────────────
// The per-team keeper editor: a team-chip selector over a two-column layout —
// the team's keeper panel (left) beside the Eligible Pool (right). It edits
// team.keepers and persists straight to the league via onUpdateLeague (no
// wizard, no draft state); the URL/league re-render reflects each change.
//
// The trade (⇄) affordance is intentionally inert for v1 — see TradeButton.

// Build a keeper record from a pool/directory entry, in the shape today's data
// model uses (snake: contractYear/contractLength; auction: keptFor/yearsKept).
function makeKeeper(entry, league) {
  // Acquisition metadata rides along from the pool entry (which carried it
  // from the prior-keeper / roster record); absent fields normalize to the
  // defaults (round null, method 'manual', rookie false).
  if (league.draftType === 'snake') {
    return {
      player: entry.player,
      contractYear: entry.nextYear || 1,
      contractLength: entry.length || league.contractYears || 3,
      ...acquisitionOf(entry),
    };
  }
  return {
    player: entry.player,
    keptFor: entry.nextCost != null ? entry.nextCost : (league.auctionRules?.undraftedStartCost || 5),
    yearsKept: entry.yearsKept || 1,
    ...acquisitionOf(entry),
  };
}

// Per-team eligible pool, split into the three groups the handoff calls for:
//   onContract        — prior keepers not expired, advanced one contract year
//                       (final when nextYear >= contractLength)
//   rosteredNoContract — roster players with no prior contract → fresh Y1 deal
//   expired           — contracts that ran out → blocked, back to the draft
function buildTeamPool(league, team) {
  const isSnake = league.draftType === 'snake';
  const len = league.contractYears || 3;
  const bump = league.auctionRules?.costIncreasePerYear || 5;
  const base = league.auctionRules?.undraftedStartCost || 5;
  const priors = team?.priorKeepers || [];
  const roster = team?.roster || [];
  const priorByName = new Map(priors.map(p => [normalizeName(p.player), p]));

  const isExpired = (p) => !!(p.expired || (isSnake && (p.contractYear || 0) + 1 > (p.contractLength || len)));

  // Thread acquisition metadata through pool entries (only fields actually
  // present on the source record) so makeKeeper can stamp it on the keeper.
  const acqCarry = (p) => {
    const out = {};
    if (p.acquisitionRound != null) out.acquisitionRound = p.acquisitionRound;
    if (p.acquisitionMethod) out.acquisitionMethod = p.acquisitionMethod;
    if (p.rookieAtAcquisition) out.rookieAtAcquisition = true;
    return out;
  };

  const onContract = [];
  const expired = [];
  priors.forEach(p => {
    if (isExpired(p)) {
      expired.push({ player: p.player, pos: p.pos, kind: 'expired' });
      return;
    }
    if (isSnake) {
      const nextYear = (p.contractYear || 0) + 1;
      const length = p.contractLength || len;
      onContract.push({ player: p.player, pos: p.pos, kind: 'contract', nextYear, length, final: nextYear >= length, ...acqCarry(p) });
    } else {
      onContract.push({ player: p.player, pos: p.pos, kind: 'contract', nextCost: (p.keptFor != null ? p.keptFor + bump : base), wasCost: p.keptFor, yearsKept: (p.yearsKept || 0) + 1, ...acqCarry(p) });
    }
  });

  const rosteredNoContract = [];
  roster.forEach(r => {
    if (priorByName.has(normalizeName(r.player))) return;
    rosteredNoContract.push(isSnake
      ? { player: r.player, pos: r.pos, kind: 'rostered', nextYear: 1, length: len, final: 1 >= len, ...acqCarry(r) }
      : { player: r.player, pos: r.pos, kind: 'rostered', nextCost: base, yearsKept: 1, ...acqCarry(r) });
  });

  return { onContract, rosteredNoContract, expired };
}

// Inert trade affordance. The off-season trade model is still undecided
// (grid indicator vs transaction history — Open item #9), so v1 ships the
// button present but non-functional rather than inventing an interaction.
function TradeButton({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <button type="button" disabled title="Trades — coming soon"
      aria-label="Trade (coming soon)"
      style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm, padding: '6px 8px', cursor: 'not-allowed', color: t.textMuted, opacity: 0.6, lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}>
      <ArrowLeftRight size={14} strokeWidth={1.75} />
    </button>
  );
}

// One keeper slot in the left panel. Filled = editable value + trade/remove;
// empty = a clickable "Open slot" that browses the pool (mobile opens overlay).
function KeeperSlot({ index, keeper, league, accentColor, gridAccent, isDark, onUpdate, onRemove, onBrowse, playerMap, draftedCost }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';

  if (!keeper) {
    return (
      <button onClick={onBrowse} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
        background: 'transparent', border: `1px dashed ${gridAccent}`, borderRadius: tokens.radiusMd,
        padding: '11px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = `${gridAccent}10`; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
        <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, width: 22, flexShrink: 0 }}>K{index + 1}</span>
        <span style={{ ...tokens.typeBody, color: gridAccent, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Plus size={14} strokeWidth={2} /> Open slot
        </span>
      </button>
    );
  }

  const expiring = isSnake && keeper.contractYear >= keeper.contractLength;
  const length = keeper.contractLength || league.contractYears || 3;
  const yearOpts = Array.from({ length }, (_, i) => i + 1);
  const selStyle = {
    background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm,
    padding: '5px 6px', color: t.textPrimary, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  };

  // Acquisition metadata (round/method/rookie) is dormant foundation data no
  // current archetype consumes — deliberately NOT displayed or editable here
  // (unexplainable bloat until the pick-cost archetype surfaces it by
  // default). Imports keep stamping the fields silently.
  return (
    <div style={{
      width: '100%', boxSizing: 'border-box',
      background: expiring ? t.dangerBg : t.sectionBg,
      border: `1px solid ${expiring ? t.dangerBorder : t.border}`,
      borderRadius: tokens.radiusMd, padding: '8px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, width: 22, flexShrink: 0 }}>K{index + 1}</span>
        <Headshot name={keeper.player} map={playerMap} size={28} isDark={isDark} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...tokens.typeBody, fontWeight: 700, color: expiring ? t.danger : t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{keeper.player}</div>
          {expiring && <div style={{ ...tokens.typePillEmphatic, color: t.danger, marginTop: 1 }}>Final yr · back to draft after this season</div>}
        </div>
        {isSnake ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <select value={keeper.contractYear} onChange={e => onUpdate({ contractYear: parseInt(e.target.value) })} style={selStyle} aria-label="Contract year">
              {yearOpts.map(v => <option key={v} value={v}>Y{v}</option>)}
            </select>
            <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>/</span>
            <select value={keeper.contractLength} onChange={e => onUpdate({ contractLength: parseInt(e.target.value) })} style={selStyle} aria-label="Contract length">
              {[2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* Escalation math in place: last year's price → this year's keep
                cost (the editable input). Only when the imported draft
                actually carries a price for this player. */}
            {draftedCost != null && (
              <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, whiteSpace: 'nowrap' }}>Drafted ${draftedCost} →</span>
            )}
            <span style={{ ...tokens.typeBody, color: t.textMuted }}>$</span>
            <input type="number" min="1" value={keeper.keptFor} onChange={e => onUpdate({ keptFor: parseInt(e.target.value) || 1 })}
              style={{ width: 54, background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm, padding: '5px 6px', color: gridAccent, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', textAlign: 'center' }} />
          </div>
        )}
        <TradeButton isDark={isDark} />
        <button onClick={onRemove} aria-label="Remove keeper"
          style={{ background: t.dangerBg, border: 'none', borderRadius: tokens.radiusSm, padding: '6px 8px', cursor: 'pointer', color: t.danger, lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }}>
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

// A single eligible-pool row: position badge + player + status pill + Keep
// toggle. Blocked (expired) rows are non-interactive; full/already-elsewhere
// rows show a disabled Keep.
function PoolRow({ entry, isDark, accentColor, gridAccent, isSnake, keeping, blocked, disabled, onToggle }) {
  const t = makeTheme(isDark);
  // Auction value states the ACTION cost ("Keep $88") so it reads as the keep
  // price next to the muted "Drafted $83" status — the +$/yr math is visible
  // on the row instead of an unexplained number.
  const valueText = entry.kind === 'expired' ? null
    : isSnake ? `Y${entry.nextYear}/${entry.length}` : `Keep $${entry.nextCost}`;
  const valueColor = entry.final ? t.danger : gridAccent;

  let btn;
  if (blocked) {
    btn = <span style={{ ...tokens.typePill, color: t.danger, flexShrink: 0 }}>Back to draft</span>;
  } else if (keeping) {
    btn = (
      <button onClick={onToggle} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.successBg, border: `1px solid ${t.successBorder}`, borderRadius: tokens.radiusSm, padding: '5px 10px', cursor: 'pointer', color: tokens.success, ...tokens.typePill, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
        <Check size={13} strokeWidth={2.5} /> Keeping
      </button>
    );
  } else {
    btn = (
      <button onClick={onToggle} disabled={disabled}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: `1px solid ${disabled ? t.border : `${accentColor}77`}`, borderRadius: tokens.radiusSm, padding: '5px 10px', cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? t.textMuted : accentColor, opacity: disabled ? 0.6 : 1, ...tokens.typePill, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 }}>
        <Plus size={13} strokeWidth={2.5} /> Keep
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: tokens.radiusSm, background: keeping ? t.successBg : 'transparent', border: `1px solid ${keeping ? t.successBorder : t.border}`, opacity: blocked ? 0.6 : 1 }}>
      {entry.pos && (
        <span style={{ ...tokens.typePill, fontWeight: 700, color: t.textMuted, background: t.sectionBg, borderRadius: 3, padding: '1px 5px', minWidth: 22, textAlign: 'center', flexShrink: 0 }}>{entry.pos}</span>
      )}
      <span style={{ ...tokens.typeBody, fontWeight: 600, color: blocked ? t.textMuted : t.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: blocked ? 'line-through' : 'none' }}>{entry.player}</span>
      {entry.statusLabel && <span style={{ ...tokens.typePill, color: entry.statusColor || t.textMuted, flexShrink: 0 }}>{entry.statusLabel}</span>}
      {valueText && <span style={{ ...tokens.typePill, fontWeight: 700, color: valueColor, flexShrink: 0 }}>{valueText}</span>}
      {btn}
    </div>
  );
}

function GroupHeader({ label, isDark }) {
  const t = makeTheme(isDark);
  return <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, padding: '8px 4px 4px' }}>{label}</div>;
}

function EligiblePool({ league, team, accentColor, gridAccent, isDark, keepingNames, keptAnywhere, isFull, onAdd, onRemoveName, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const isSnake = league.draftType === 'snake';
  const [tab, setTab] = React.useState('roster'); // 'roster' | 'league' | 'expired'
  const [search, setSearch] = React.useState('');
  // Roster corrections in place — the SAME RosterEditor the Import page's
  // accordion renders, because this is where a bad row actually gets noticed.
  const [editingRoster, setEditingRoster] = React.useState(false);
  React.useEffect(() => { setEditingRoster(false); }, [team?.id, tab]);
  const [directory, setDirectory] = React.useState(null);

  const statusIndex = React.useMemo(() => buildStatusIndex(league), [league]);
  const teamPool = React.useMemo(() => buildTeamPool(league, team), [league, team]);

  const supportsDirectory = league.sport === 'hockey' || league.sport === 'nhl';
  React.useEffect(() => {
    if (tab !== 'league' || !supportsDirectory || directory) return;
    let cancelled = false;
    loadPlayers('nhl').then(d => { if (!cancelled) setDirectory(d.players || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [tab, supportsDirectory, directory]);

  const matches = (name) => !search || normalizeName(name).includes(normalizeName(search));

  // Toggle helper for a Keep button.
  function toggle(entry) {
    if (keepingNames.has(normalizeName(entry.player))) onRemoveName(entry.player);
    else onAdd(entry);
  }
  const rowProps = (entry) => {
    const keeping = keepingNames.has(normalizeName(entry.player));
    const elsewhere = !keeping && keptAnywhere.has(normalizeName(entry.player));
    return { keeping, disabled: (!keeping && isFull) || elsewhere, onToggle: () => toggle(entry) };
  };

  // Auction leagues have no expiry concept — the Expired tab is snake-only
  // (mirrors the shared page's snake-gated Expired filter).
  const tabs = [
    { id: 'roster',  label: 'My roster' },
    { id: 'league',  label: 'League' },
    ...(isSnake ? [{ id: 'expired', label: 'Expired' }] : []),
  ];

  // Build the active tab's rows.
  let body;
  if (tab === 'roster' && editingRoster && onUpdateLeague) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Editing {team?.name}'s roster</span>
          <button onClick={() => setEditingRoster(false)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', ...tokens.typeBodyMeta, fontWeight: 700, color: accentColor, textDecoration: 'underline' }}>
            Done editing
          </button>
        </div>
        <RosterEditor league={league} team={team} isDark={isDark} accentColor={accentColor} onUpdateLeague={onUpdateLeague} />
      </div>
    );
  } else if (tab === 'roster') {
    // Auction vocabulary: no contract concept — the drafted price IS the
    // state ("Drafted $83", muted), and the value shows the keep cost so the
    // escalation math reads on the row. Price-bearing lists sort by value
    // desc, alphabetical tiebreak.
    const onC = teamPool.onContract.filter(e => matches(e.player)).map(e => ({
      ...e,
      statusLabel: isSnake
        ? (e.final ? 'Final year' : 'On contract')
        : (e.wasCost != null ? `Drafted $${e.wasCost}` : 'Drafted'),
      statusColor: isSnake ? (e.final ? t.danger : tokens.info) : t.textMuted,
    }));
    const ros = teamPool.rosteredNoContract.filter(e => matches(e.player)).map(e => ({
      ...e,
      statusLabel: isSnake ? 'No contract' : 'Undrafted',
      statusColor: t.textMuted,
    }));
    if (!isSnake) {
      onC.sort((a, b) => ((b.nextCost ?? -1) - (a.nextCost ?? -1)) || a.player.localeCompare(b.player));
      ros.sort((a, b) => a.player.localeCompare(b.player));
    }
    if (onC.length === 0 && ros.length === 0) {
      body = <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, textAlign: 'center', padding: '24px 12px', lineHeight: 1.5 }}>No eligible players on file.<br/>Import this team's roster or last year's draft from the Import door.</div>;
    } else {
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {onC.length > 0 && <GroupHeader label={isSnake ? 'On a contract · eligible' : 'Drafted last year · eligible'} isDark={isDark} />}
          {onC.map((e, i) => <PoolRow key={`c-${e.player}-${i}`} entry={e} isDark={isDark} accentColor={accentColor} gridAccent={gridAccent} isSnake={isSnake} {...rowProps(e)} />)}
          {ros.length > 0 && <GroupHeader label={isSnake ? 'Rostered · no contract' : 'Rostered · undrafted'} isDark={isDark} />}
          {ros.map((e, i) => <PoolRow key={`r-${e.player}-${i}`} entry={e} isDark={isDark} accentColor={accentColor} gridAccent={gridAccent} isSnake={isSnake} {...rowProps(e)} />)}
          {onUpdateLeague && (team?.roster || []).length > 0 && (
            <div style={{ paddingTop: 6 }}>
              <button onClick={() => setEditingRoster(true)}
                title="Remove a bad import row or add a missing player"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', ...tokens.typeBodyMeta, fontWeight: 600, color: t.textMuted, textDecoration: 'underline' }}>
                Edit roster
              </button>
            </div>
          )}
        </div>
      );
    }
  } else if (tab === 'league') {
    if (!supportsDirectory) {
      body = <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, textAlign: 'center', padding: '24px 12px' }}>Player directory is NHL-only for now.</div>;
    } else if (!search || search.length < 2) {
      body = <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, textAlign: 'center', padding: '24px 12px' }}>Search the league directory to add a free agent.</div>;
    } else {
      const results = (directory || []).filter(p => matches(p.name)).slice(0, 30).map(p => {
        const e = statusIndex.get(normalizeName(p.name));
        let statusLabel = 'Free agent', statusColor = tokens.success;
        if (e?.status === 'keeper') { statusLabel = `Keeper · ${e.teamName}`; statusColor = t.textMuted; }
        else if (e?.status === 'rostered') { statusLabel = e.teamName; statusColor = t.textMuted; }
        const base = isSnake ? { kind: 'free', nextYear: 1, length: league.contractYears || 3, final: (league.contractYears || 3) <= 1 } : { kind: 'free', nextCost: league.auctionRules?.undraftedStartCost || 5, yearsKept: 1 };
        return { player: p.name, pos: p.pos, statusLabel, statusColor, ...base };
      });
      body = results.length === 0
        ? <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, textAlign: 'center', padding: '24px 12px' }}>No players match “{search}”.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{results.map((e, i) => <PoolRow key={`d-${e.player}-${i}`} entry={e} isDark={isDark} accentColor={accentColor} gridAccent={gridAccent} isSnake={isSnake} {...rowProps(e)} />)}</div>;
    }
  } else {
    const exp = teamPool.expired.filter(e => matches(e.player)).map(e => ({ ...e, statusLabel: 'Expired', statusColor: t.danger }));
    body = exp.length === 0
      ? <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, textAlign: 'center', padding: '24px 12px', display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'center', width: '100%' }}><Check size={13} strokeWidth={2} /> No expired contracts — everyone on file can be kept.</div>
      : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{exp.map((e, i) => <PoolRow key={`e-${e.player}-${i}`} entry={e} isDark={isDark} accentColor={accentColor} gridAccent={gridAccent} isSnake={isSnake} keeping={false} blocked />)}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div style={{ ...tokens.typeHeadingSection, color: t.textSecondary }}>Eligible Pool</div>
        <div style={{ ...tokens.typeBodyMeta, color: isFull ? t.warning : t.textMuted }}>{isFull ? 'Slots full' : `${(league.keeperSlots || 0) - keepingNames.size} slot${(league.keeperSlots || 0) - keepingNames.size === 1 ? '' : 's'} open`}</div>
      </div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={14} strokeWidth={2} color={t.textMuted} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…"
          style={{ width: '100%', boxSizing: 'border-box', background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, padding: '8px 10px 8px 30px', fontSize: 13, color: t.textPrimary, fontFamily: 'inherit', outline: 'none' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {tabs.map(o => {
          const active = tab === o.id;
          return (
            <button key={o.id} onClick={() => setTab(o.id)} style={{
              flex: 1, background: active ? accentColor : 'transparent', border: `1px solid ${active ? accentColor : t.border}`,
              borderRadius: tokens.radiusSm, padding: '5px 8px', ...tokens.typePill, fontWeight: 700, cursor: 'pointer',
              color: active ? '#fff' : t.textSecondary, fontFamily: 'inherit',
            }}>{o.label}</button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 2 }}>{body}</div>
    </div>
  );
}

function SetKeepersWorkbench({ league, accentColor, isDark, onUpdateLeague, selectedTeamId, onSelectTeam }) {
  const t = makeTheme(isDark);
  const teams = league.teams || [];
  const isSnake = league.draftType === 'snake';
  const slots = league.keeperSlots || 0;
  const gridAccent = league.draftType === 'auction' ? tokens.warning : tokens.info;

  const team = teams.find(tm => tm.id === selectedTeamId) || teams[0] || null;
  const keepers = team?.keepers || [];
  const isFull = keepers.length >= slots;
  const [manualValue, setManualValue] = React.useState('');
  const [poolOpen, setPoolOpen] = React.useState(false);
  const playerMap = usePlayerMap(league.sport);

  // The eligible pool is inline (right column) on desktop, so there's no overlay
  // there. Only mobile — where the column is hidden — opens it as a full-screen
  // sheet. 900px matches the .kh-workbench single-column breakpoint below.
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = e => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Desktop never holds the overlay open (e.g. after a resize from mobile).
  React.useEffect(() => { if (!isMobile && poolOpen) setPoolOpen(false); }, [isMobile, poolOpen]);
  const openPool = () => { if (isMobile) setPoolOpen(true); };

  // Auction: last year's drafted price per player (from the imported draft),
  // shown next to the keep-cost input so the +$/yr escalation reads in place.
  const draftedCostByName = React.useMemo(() => {
    if (isSnake) return null;
    const m = new Map();
    (team?.priorKeepers || []).forEach(p => { if (p.keptFor != null) m.set(normalizeName(p.player), p.keptFor); });
    return m;
  }, [team, isSnake]);

  const keepingNames = React.useMemo(() => new Set(keepers.map(k => normalizeName(k.player))), [keepers]);
  const keptAnywhere = React.useMemo(() => {
    const s = new Set();
    teams.forEach(tm => (tm.keepers || []).forEach(k => k.player && s.add(normalizeName(k.player))));
    return s;
  }, [teams]);

  // Scroll-lock + Esc-to-close while the pool overlay is open.
  React.useEffect(() => {
    if (!poolOpen) return;
    const onKey = e => { if (e.key === 'Escape') setPoolOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [poolOpen]);

  if (!team) {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.textSecondary }}>No teams yet</div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 4 }}>Add teams in Settings to start setting keepers.</div>
      </div>
    );
  }

  function commit(nextKeepers) {
    const newTeams = teams.map(tm => tm.id === team.id ? { ...tm, keepers: nextKeepers } : tm);
    onUpdateLeague({ ...league, teams: newTeams });
  }
  function addEntry(entry) {
    if (keepers.length >= slots) return;
    if (keepingNames.has(normalizeName(entry.player))) return;
    commit([...keepers, makeKeeper(entry, league)]);
  }
  function removeName(name) {
    commit(keepers.filter(k => normalizeName(k.player) !== normalizeName(name)));
  }
  function updateAt(i, patch) {
    commit(keepers.map((k, idx) => idx === i ? { ...k, ...patch } : k));
  }
  function addManual(name) {
    const clean = (name || '').trim();
    if (!clean || keepingNames.has(normalizeName(clean)) || keepers.length >= slots) return;
    addEntry({ player: clean });
    setManualValue('');
  }

  const poolProps = {
    league, team, accentColor, gridAccent, isDark, keepingNames, keptAnywhere, isFull,
    onAdd: addEntry, onRemoveName: removeName, onUpdateLeague,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .kh-workbench { display: grid; grid-template-columns: 1fr 380px; gap: 16px; align-items: start; }
        .kh-pool-col { position: sticky; top: 80px; height: calc(100vh - 120px); max-height: 640px; }
        .kh-browse-btn { display: none; }
        @media (max-width: 900px) {
          .kh-workbench { grid-template-columns: 1fr; }
          .kh-pool-col { display: none; }
          .kh-browse-btn { display: inline-flex; }
        }
      `}</style>

      {/* Team chip selector */}
      <HScrollRow isDark={isDark} t={t}>
        {teams.map(tm => {
          const count = (tm.keepers || []).length;
          const active = tm.id === team.id;
          const complete = slots > 0 && count >= slots;
          return (
            <button key={tm.id} onClick={() => onSelectTeam && onSelectTeam(tm.id)} style={{
              background: active ? accentColor : t.sectionBg,
              border: `1px solid ${active ? accentColor : t.border}`,
              borderRadius: tokens.radiusMd, padding: '6px 12px', ...tokens.typePill, fontWeight: 700, cursor: 'pointer',
              color: active ? '#fff' : t.textSecondary, fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, whiteSpace: 'nowrap',
            }}>
              <span>{tm.name}</span>
              <span style={{
                ...tokens.typePill, fontWeight: 700,
                color: active ? '#fff' : (complete ? tokens.success : (count > 0 ? accentColor : t.textMuted)),
                background: active ? 'rgba(255,255,255,0.18)' : (complete ? t.successBg : t.cardBg),
                padding: '1px 6px', borderRadius: tokens.radiusPill,
              }}>{count}/{slots}</span>
            </button>
          );
        })}
      </HScrollRow>

      <div className="kh-workbench">
        {/* Left: keeper panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
              <div style={{ ...tokens.typeHeadingCard, color: t.textPrimary }}>{team.name}</div>
              <div style={{ ...tokens.typeBodyMeta, color: isFull ? tokens.success : t.textMuted }}>{keepers.length}/{slots} keepers</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: slots }, (_, i) => (
                <KeeperSlot key={i} index={i} keeper={keepers[i]} league={league} accentColor={accentColor} gridAccent={gridAccent} isDark={isDark}
                  onUpdate={patch => updateAt(i, patch)} onRemove={() => removeName(keepers[i].player)}
                  onBrowse={openPool} playerMap={playerMap}
                  draftedCost={keepers[i] && draftedCostByName ? draftedCostByName.get(normalizeName(keepers[i].player)) ?? null : null} />
              ))}
              {slots === 0 && <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, textAlign: 'center', padding: '12px 0' }}>No keeper slots configured. Set Keeper Slots in Settings.</div>}


              {/* + Add manually. Selecting an autocomplete suggestion adds
                  immediately; the Add button commits a typed name, which is the
                  only path for non-NHL sports (no directory → plain input). */}
              {!isFull && slots > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: 6 }}>Add manually</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <PlayerAutocomplete
                        value={manualValue}
                        onChange={(name, picked) => { if (picked) addManual(name); else setManualValue(name); }}
                        sport={league.sport} isDark={isDark} placeholder="Player name…"
                        league={league} disabledNames={keptAnywhere}
                        inputStyle={{ width: '100%', boxSizing: 'border-box', background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, padding: '9px 12px', fontSize: 14, color: t.textPrimary, outline: 'none', fontFamily: 'inherit' }}
                      />
                    </div>
                    <Button variant="primary" size="md" accent={accentColor} isDark={isDark} disabled={!manualValue.trim()} onClick={() => addManual(manualValue)}>Add</Button>
                  </div>
                </div>
              )}

              <button className="kh-browse-btn" onClick={() => setPoolOpen(true)}
                style={{ marginTop: 4, alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: 'transparent', border: `1px solid ${accentColor}77`, borderRadius: tokens.radiusMd, padding: '9px', ...tokens.typePill, fontWeight: 700, color: accentColor, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Search size={14} strokeWidth={2} /> Browse eligible pool
              </button>
            </div>
          </div>

          {/* Commissioner tip */}
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, lineHeight: 1.5, padding: '0 4px' }}>
            Tip: import this team's roster {isSnake ? '' : 'and last year’s draft '}from the <strong style={{ color: t.textSecondary, fontWeight: 600 }}>Import</strong> door to seed the pool with {isSnake ? 'prior contracts' : 'drafted prices'}.
          </div>
        </div>

        {/* Right: eligible pool (desktop column) */}
        <div className="kh-pool-col" style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, padding: '14px 14px', boxSizing: 'border-box' }}>
          <EligiblePool {...poolProps} />
        </div>
      </div>

      {/* Eligible-pool sheet — MOBILE ONLY (full-screen). Desktop has no overlay;
          its pool lives inline in the right column above. */}
      {isMobile && poolOpen && (
        <div role="dialog" aria-label="Eligible pool"
          style={{ position: 'fixed', inset: 0, zIndex: 950, background: t.cardBg, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${t.divider}`, flexShrink: 0 }}>
            <div style={{ ...tokens.typeHeadingCard, color: t.textPrimary }}>{team.name} · Eligible Pool</div>
            <button onClick={() => setPoolOpen(false)} aria-label="Close"
              style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: tokens.radiusSm, color: t.textMuted, cursor: 'pointer', padding: 0 }}>
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '14px 16px', boxSizing: 'border-box' }}>
            <EligiblePool {...poolProps} />
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SetKeepersWorkbench });

export { SetKeepersWorkbench, EligiblePool, buildTeamPool, makeKeeper };
