import React from 'react';
import { makeTheme } from '../components.jsx';
import { loadPlayers, normalizeName, buildStatusIndex } from '../lib/players.js';
import { posForRoster } from '../PlayerAutocomplete.jsx';

const SKATER_COLS = [
  { key: 'name',   label: 'Player', align: 'left',  sortable: true,  width: 200 },
  { key: 'pos',    label: 'Pos',    align: 'left',  sortable: true,  width: 60 },
  { key: 'team',   label: 'Team',   align: 'left',  sortable: true,  width: 60 },
  { key: 'gp',     label: 'GP',     align: 'right', sortable: true },
  { key: 'g',      label: 'G',      align: 'right', sortable: true },
  { key: 'a',      label: 'A',      align: 'right', sortable: true },
  { key: 'p',      label: 'P',      align: 'right', sortable: true },
  { key: 'plusMinus', label: '+/-', align: 'right', sortable: true },
  { key: 'sog',    label: 'SOG',    align: 'right', sortable: true },
  { key: 'hit',    label: 'HIT',    align: 'right', sortable: true },
  { key: 'blk',    label: 'BLK',    align: 'right', sortable: true },
  { key: 'status', label: 'Status', align: 'left',  sortable: false, width: 160 },
];

const GOALIE_COLS = [
  { key: 'name',   label: 'Goalie', align: 'left',  sortable: true,  width: 200 },
  { key: 'team',   label: 'Team',   align: 'left',  sortable: true,  width: 60 },
  { key: 'gp',     label: 'GP',     align: 'right', sortable: true },
  { key: 'w',      label: 'W',      align: 'right', sortable: true },
  { key: 'l',      label: 'L',      align: 'right', sortable: true },
  { key: 'gaa',    label: 'GAA',    align: 'right', sortable: true },
  { key: 'svPct',  label: 'SV%',    align: 'right', sortable: true },
  { key: 'status', label: 'Status', align: 'left',  sortable: false, width: 160 },
];

function fmtSvPct(v) {
  if (!v) return '—';
  return v.toFixed(3).replace(/^0/, '');
}

export function PlayersTab({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const sport = league.sport;

  if (sport !== 'hockey' && sport !== 'nhl') {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '36px 24px 28px', textAlign: 'center', boxShadow: t.cardShadow }}>
        <img src="/mascot-soon.png" alt="" height={140}
          style={{ height: 140, width: 'auto', display: 'block', margin: '0 auto 10px', imageRendering: 'pixelated' }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>Coming soon</div>
        <div style={{ fontSize: 13, color: t.textSecondary }}>Player directory for {sport.toUpperCase()} is on the roadmap. NHL ships first.</div>
      </div>
    );
  }

  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [kind, setKind] = React.useState('skater'); // 'skater' | 'goalie'
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all'); // 'all' | 'rostered' | 'keeper' | 'available'
  const [sortKey, setSortKey] = React.useState('p');
  const [sortDir, setSortDir] = React.useState('desc');
  const [page, setPage] = React.useState(0);
  const [managing, setManaging] = React.useState(null); // { player, entry }
  const [targetTeamId, setTargetTeamId] = React.useState('');
  const PAGE_SIZE = 50;

  function openManage(player, entry) {
    setManaging({ player, entry });
    setTargetTeamId(entry?.tradedToTeamId || entry?.teamId || '');
  }
  function closeManage() {
    setManaging(null);
    setTargetTeamId('');
  }

  // ESC closes the modal
  React.useEffect(() => {
    if (!managing) return;
    function onKey(e) { if (e.key === 'Escape') closeManage(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [managing]);

  // Append a fresh keeper entry on the target team. Caller is responsible
  // for not invoking this when the player is already a keeper (use
  // tradeKeeper for that case so the existing contract is preserved).
  function makeKeeperFresh(player, toTeamId) {
    const isSnake = league.draftType === 'snake';
    const ar = league.auctionRules || {};
    const kp = isSnake
      ? { player: player.name, contractYear: 1, contractLength: league.contractYears || 3 }
      : { player: player.name, keptFor: ar.undraftedStartCost || 0, yearsKept: 1 };
    const teams = (league.teams || []).map(tm => {
      if (tm.id !== toTeamId) return tm;
      return { ...tm, keepers: [...(tm.keepers || []), kp] };
    });
    onUpdateLeague({ ...league, teams });
  }

  // Ensure the player is on `toTeamId`'s roster and not on anyone else's.
  // Covers both "add free agent to a roster" and "move between rosters".
  function assignToRoster(player, toTeamId) {
    const target = normalizeName(player.name);
    const teams = (league.teams || []).map(tm => {
      const stripped = (tm.roster || []).filter(r => normalizeName(r.player) !== target);
      if (tm.id === toTeamId) {
        return { ...tm, roster: [...stripped, { player: player.name, pos: posForRoster(player.pos) }] };
      }
      return { ...tm, roster: stripped };
    });
    onUpdateLeague({ ...league, teams });
  }

  function releaseFromRoster(player, fromTeamId) {
    const target = normalizeName(player.name);
    const teams = (league.teams || []).map(tm => {
      if (tm.id !== fromTeamId) return tm;
      return { ...tm, roster: (tm.roster || []).filter(r => normalizeName(r.player) !== target) };
    });
    onUpdateLeague({ ...league, teams });
  }

  function tradeKeeper(player, entry, toTeamId) {
    const teams = (league.teams || []).map(tm => {
      if (tm.id !== entry.teamId) return tm;
      const list = (tm[entry.keeperList] || []).map((kp, i) => {
        if (i !== entry.keeperIdx) return kp;
        const next = { ...kp };
        if (!next.originalTeamId) next.originalTeamId = entry.teamId;
        next.tradedTo = toTeamId === entry.teamId ? null : toTeamId;
        return next;
      });
      return { ...tm, [entry.keeperList]: list };
    });
    onUpdateLeague({ ...league, teams });
  }

  function onAddToRoster() {
    if (!managing || !targetTeamId || !onUpdateLeague) return;
    assignToRoster(managing.player, targetTeamId);
    closeManage();
  }

  function onMakeKeeper() {
    if (!managing || !targetTeamId || !onUpdateLeague) return;
    const { player, entry } = managing;
    if (entry?.status === 'keeper') tradeKeeper(player, entry, targetTeamId);
    else makeKeeperFresh(player, targetTeamId);
    closeManage();
  }

  // Reset to page 1 whenever the visible set changes
  React.useEffect(() => { setPage(0); }, [kind, query, statusFilter, sortKey, sortDir]);

  React.useEffect(() => {
    let cancelled = false;
    loadPlayers('nhl')
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, []);

  const statusIndex = React.useMemo(() => buildStatusIndex(league), [league]);

  const rows = React.useMemo(() => {
    if (!data?.players) return [];
    const q = normalizeName(query);
    let list = data.players.filter(p => p.kind === kind);
    if (q) list = list.filter(p => normalizeName(p.name).includes(q));
    if (statusFilter !== 'all') {
      list = list.filter(p => {
        const entry = statusIndex.get(normalizeName(p.name));
        if (statusFilter === 'available') return !entry;
        if (statusFilter === 'expired') return entry?.status === 'expired';
        if (statusFilter === 'rostered') return entry?.status === 'rostered';
        if (statusFilter === 'keeper') return entry?.status === 'keeper';
        return true;
      });
    }
    // Sort
    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return list;
  }, [data, kind, query, statusFilter, sortKey, sortDir, statusIndex]);

  const cols = kind === 'skater' ? SKATER_COLS : GOALIE_COLS;
  const asOf = data?.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null;

  function clickHeader(c) {
    if (!c.sortable) return;
    if (sortKey === c.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(c.key); setSortDir(c.align === 'right' ? 'desc' : 'asc'); }
  }

  function renderCell(p, c) {
    if (c.key === 'status') {
      const entry = statusIndex.get(normalizeName(p.name));
      const status = entry?.status;
      let label, bg, fg;
      if (!entry) {
        label = 'Free Agent';
        bg = 'transparent'; fg = t.textMuted;
      } else if (status === 'expired') {
        label = `Expired · ${entry.teamName}`;
        bg = t.dangerBg; fg = t.danger;
      } else if (status === 'keeper') {
        label = `Keeper · ${entry.teamName}`;
        bg = 'rgba(107,77,230,0.14)'; fg = '#9d8cf0';
      } else {
        label = entry.teamName;
        bg = t.successBg; fg = t.success;
      }
      return (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <button
            onClick={() => onUpdateLeague && openManage(p, entry)}
            disabled={!onUpdateLeague}
            title={onUpdateLeague ? 'Manage player' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 12,
              background: bg, color: fg,
              border: !entry ? `1px dashed ${t.border}` : 'none',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              cursor: onUpdateLeague ? 'pointer' : 'default',
              maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {onUpdateLeague && <span style={{ opacity: 0.7, fontSize: 10 }}>✎</span>}
          </button>
          {entry?.tradedToTeamName && (
            <span style={{ fontSize: 10, color: t.warning, fontWeight: 700, whiteSpace: 'nowrap' }}>
              → traded to {entry.tradedToTeamName}
            </span>
          )}
        </span>
      );
    }
    if (c.key === 'svPct') return fmtSvPct(p.svPct);
    if (c.key === 'gaa') return p.gaa ? p.gaa.toFixed(2) : '—';
    if (c.key === 'plusMinus') {
      const v = p.plusMinus || 0;
      return <span style={{ color: v > 0 ? t.success : v < 0 ? t.danger : t.textBody }}>{v > 0 ? `+${v}` : v}</span>;
    }
    if (c.key === 'name') {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {p.headshot ? (
            <img src={p.headshot} alt="" width={26} height={26}
              style={{ borderRadius: '50%', background: t.sectionBg, objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
          ) : (
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: t.sectionBg, display: 'inline-block' }} />
          )}
          <span style={{ color: t.textPrimary, fontWeight: 600 }}>{p.name}</span>
        </span>
      );
    }
    return p[c.key] ?? '—';
  }

  const inputStyle = {
    background: isDark ? '#161a22' : '#f7f9fc',
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    color: t.textPrimary,
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>NHL Players</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {data?.season ? `${data.season.slice(0,4)}–${data.season.slice(6)} regular season` : '—'}
            {asOf ? ` · as of ${asOf}` : ' · no data yet'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: isDark ? '#0e1218' : '#eef1f5', padding: 3, borderRadius: 8 }}>
          {['skater','goalie'].map(k => (
            <button key={k} onClick={() => setKind(k)}
              style={{
                background: kind === k ? accentColor : 'transparent',
                color: kind === k ? '#fff' : t.textSecondary,
                border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
              }}>
              {k === 'skater' ? 'Skaters' : 'Goalies'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${t.divider}` }}>
        <input type="text" placeholder="Search by name…" value={query} onChange={e => setQuery(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle}>
          <option value="all">All statuses</option>
          <option value="available">Free Agents</option>
          <option value="rostered">Rostered</option>
          <option value="keeper">Keepers</option>
          <option value="expired">Expired</option>
        </select>
        <span style={{ fontSize: 12, color: t.textMuted }}>{rows.length} shown</span>
      </div>

      {err && (
        <div style={{ padding: 24, color: t.textSecondary, fontSize: 13 }}>
          Couldn't load player data: {err}
        </div>
      )}
      {!err && !data && (
        <div style={{ padding: 24, color: t.textMuted, fontSize: 13 }}>Loading players…</div>
      )}
      {!err && data && rows.length === 0 && (
        <div style={{ padding: 24, color: t.textMuted, fontSize: 13 }}>
          {data.players?.length === 0
            ? 'No player data yet — redeploy on Vercel to fetch fresh data from the NHL.'
            : 'No players match your filters.'}
        </div>
      )}
      {!err && data && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          {(() => {
            const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
            const currentPage = Math.min(page, totalPages - 1);
            const start = currentPage * PAGE_SIZE;
            const pageRows = rows.slice(start, start + PAGE_SIZE);
            return (
          <>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: t.sectionBg }}>
                {cols.map(c => (
                  <th key={c.key}
                    onClick={() => clickHeader(c)}
                    style={{
                      padding: '9px 12px', textAlign: c.align, fontSize: 11, fontWeight: 600,
                      color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase',
                      borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap',
                      cursor: c.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      width: c.width || undefined,
                    }}>
                    {c.label}{c.sortable && sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p, i) => (
                <tr key={`${p.id}-${start + i}`}
                  style={{ borderBottom: i < pageRows.length - 1 ? `1px solid ${t.dividerFaint}` : 'none', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = t.sectionBg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {cols.map(c => (
                    <td key={c.key} style={{ padding: '8px 12px', textAlign: c.align, fontSize: 13, color: t.textBody, whiteSpace: 'nowrap' }}>
                      {renderCell(p, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${t.divider}`, fontSize: 12, color: t.textSecondary }}>
            <span>
              {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}
                style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: currentPage === 0 ? t.textMuted : t.textPrimary, cursor: currentPage === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>‹ Prev</button>
              <span style={{ fontSize: 12, color: t.textMuted, minWidth: 64, textAlign: 'center' }}>Page {currentPage + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}
                style={{ background: t.sectionBg, border: `1px solid ${t.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: currentPage >= totalPages - 1 ? t.textMuted : t.textPrimary, cursor: currentPage >= totalPages - 1 ? 'default' : 'pointer', fontFamily: 'inherit' }}>Next ›</button>
            </div>
          </div>
          </>
            );
          })()}
        </div>
      )}
      {managing && <ManageModal
        managing={managing}
        league={league}
        t={t}
        accentColor={accentColor}
        isDark={isDark}
        targetTeamId={targetTeamId}
        setTargetTeamId={setTargetTeamId}
        onClose={closeManage}
        onAddToRoster={onAddToRoster}
        onMakeKeeper={onMakeKeeper}
        onRelease={() => {
          const { player, entry } = managing;
          if (entry?.status === 'rostered') releaseFromRoster(player, entry.teamId);
          closeManage();
        }}
      />}
    </div>
  );
}

function ManageModal({ managing, league, t, accentColor, isDark, targetTeamId, setTargetTeamId, onClose, onAddToRoster, onMakeKeeper, onRelease }) {
  const { player, entry } = managing;
  const teams = league.teams || [];
  const status = entry?.status; // 'rostered' | 'keeper' | 'expired' | undefined
  const isExpired = !!entry?.isExpired || status === 'expired';
  const rosteredTeamId = status === 'rostered' ? entry.teamId : null;
  const keeperCurrentOwnerId = status === 'keeper' ? (entry.tradedToTeamId || entry.teamId) : null;

  let currentText;
  if (status === 'expired') currentText = `Contract expired (was ${entry.teamName}'s keeper) — returns to the draft pool`;
  else if (!entry) currentText = 'Free Agent — not on any roster';
  else if (status === 'rostered' && isExpired) currentText = `Rostered by ${entry.teamName} · expired contract from ${entry.expiredFromTeamName || 'last season'}`;
  else if (status === 'rostered') currentText = `Rostered by ${entry.teamName}`;
  else if (entry.tradedToTeamName) currentText = `Keeper · ${entry.teamName} → traded to ${entry.tradedToTeamName}`;
  else currentText = `Keeper · ${entry.teamName}`;

  const isSnake = league.draftType === 'snake';
  const ar = league.auctionRules || {};

  // Contract preview: show the CURRENT contract for existing keepers, or what
  // the NEW contract would be for everyone else (i.e. what "Make keeper"
  // would grant).
  let contractPreview = null;
  let contractLabel = 'New contract';
  if (status === 'keeper') {
    const sourceTeam = league.teams?.find(tm => tm.id === entry.teamId);
    const kp = sourceTeam?.[entry.keeperList]?.[entry.keeperIdx];
    if (kp) {
      contractLabel = 'Current contract';
      if (isSnake) {
        const yr = kp.contractYear || 1;
        const len = kp.contractLength || (league.contractYears || 3);
        const remaining = Math.max(0, len - yr);
        contractPreview = `Year ${yr} of ${len}` + (remaining === 0 ? ' · expires after this season' : ` · ${remaining} year${remaining === 1 ? '' : 's'} remaining`);
      } else {
        const next = (kp.keptFor != null) ? kp.keptFor + (ar.costIncreasePerYear || 0) : (ar.undraftedStartCost || 0);
        contractPreview = kp.keptFor != null
          ? `Kept for $${kp.keptFor} this season · would cost $${next} next year`
          : `$${kp.keptFor || 0} · year ${kp.yearsKept || 1}`;
      }
    }
  } else if (!isExpired) {
    contractPreview = isSnake
      ? `Year 1 of a ${league.contractYears || 3}-year contract`
      : `$${ar.undraftedStartCost || 0} for year 1 · +$${ar.costIncreasePerYear || 0}/year thereafter`;
  }

  // Action-button enablement + labels.
  const hasTarget = !!targetTeamId;
  // "Add to roster": disabled when no target, or that team already has them.
  const rosterDisabled = !hasTarget || rosteredTeamId === targetTeamId;
  const rosterLabel = rosteredTeamId && rosteredTeamId !== targetTeamId ? 'Move roster' : 'Add to roster';
  // "Make keeper": disabled when no target, expired, or that team already keeps them.
  const keeperDisabled = !hasTarget || isExpired || keeperCurrentOwnerId === targetTeamId;
  let keeperLabel = 'Make keeper';
  if (status === 'keeper' && targetTeamId && targetTeamId !== keeperCurrentOwnerId) {
    keeperLabel = targetTeamId === entry.teamId ? 'Cancel trade' : 'Trade keeper';
  }
  const keeperTooltip = isExpired
    ? 'Contract expired — this player goes back to the draft pool and can\'t be kept.'
    : (keeperCurrentOwnerId === targetTeamId ? 'Already a keeper for this team.' : null);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 16,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)', width: '100%', maxWidth: 420,
          overflow: 'hidden',
        }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Manage Player</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, fontFamily: 'inherit' }}>×</button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${t.dividerFaint}` }}>
          {player.headshot ? (
            <img src={player.headshot} alt="" width={48} height={48}
              style={{ borderRadius: '50%', background: t.sectionBg, objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
          ) : (
            <span style={{ width: 48, height: 48, borderRadius: '50%', background: t.sectionBg, display: 'inline-block' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{player.pos || '—'} · {player.team || '—'}</div>
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${t.dividerFaint}`, fontSize: 12, color: t.textSecondary }}>
          <span style={{ color: t.textMuted, marginRight: 6 }}>Currently:</span>
          {currentText}
        </div>

        <div style={{ padding: '14px 18px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6 }}>
            Team
          </label>
          <select value={targetTeamId} onChange={e => setTargetTeamId(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: isDark ? '#161a22' : '#f7f9fc',
              border: `1px solid ${t.border}`, borderRadius: 6,
              padding: '8px 10px', fontSize: 13, color: t.textPrimary,
              fontFamily: 'inherit', outline: 'none',
            }}>
            <option value="" disabled>Select team…</option>
            {teams.map(tm => {
              const labels = [];
              if (tm.id === rosteredTeamId) labels.push('rostered');
              if (tm.id === keeperCurrentOwnerId) labels.push('keeper');
              if (status === 'keeper' && tm.id === entry.teamId && entry.tradedToTeamId) labels.push('origin');
              const suffix = labels.length ? ` (${labels.join(', ')})` : '';
              return <option key={tm.id} value={tm.id}>{tm.name}{suffix}</option>;
            })}
          </select>
          {contractPreview && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: `${accentColor}12`, border: `1px solid ${accentColor}33`, borderRadius: 6, fontSize: 12, color: t.textSecondary }}>
              <span style={{ color: t.textMuted, marginRight: 6 }}>{contractLabel}:</span>
              <span style={{ fontWeight: 600, color: t.textPrimary }}>{contractPreview}</span>
            </div>
          )}
          {isExpired && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, borderRadius: 6, fontSize: 12, color: t.danger }}>
              Contract expired — this player returns to the draft and can't be kept.
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${t.divider}`, background: t.sectionBg, gap: 8, flexWrap: 'wrap' }}>
          <div>
            {status === 'rostered' && (
              <button onClick={onRelease}
                style={{ background: 'none', border: 'none', color: t.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit' }}>
                Remove from team
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, color: t.textSecondary, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={onAddToRoster} disabled={rosterDisabled}
              title={rosterDisabled && rosteredTeamId === targetTeamId ? 'Already on this team\'s roster.' : undefined}
              style={{
                background: rosterDisabled ? t.sectionBg : 'transparent',
                color: rosterDisabled ? t.textMuted : accentColor,
                border: `1px solid ${rosterDisabled ? t.border : `${accentColor}88`}`,
                borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                cursor: rosterDisabled ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>
              {rosterLabel}
            </button>
            <button onClick={onMakeKeeper} disabled={keeperDisabled}
              title={keeperTooltip || undefined}
              style={{
                background: keeperDisabled ? t.sectionBg : accentColor,
                color: keeperDisabled ? t.textMuted : '#fff',
                border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                cursor: keeperDisabled ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>
              {keeperLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
