import React from 'react';
import { makeTheme } from '../components.jsx';
import { loadPlayers, normalizeName, buildStatusIndex } from '../lib/players.js';

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

function StatusPill({ entry, t }) {
  if (!entry) return <span style={{ fontSize: 11, color: t.textMuted }}>Available</span>;
  const isKeeper = entry.status === 'keeper';
  const bg = isKeeper ? 'rgba(107,77,230,0.14)' : 'rgba(76,175,125,0.12)';
  const fg = isKeeper ? '#9d8cf0' : '#6dd4a8';
  const label = isKeeper ? `Keeper · ${entry.teamName}` : entry.teamName;
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, background: bg, color: fg, fontSize: 11, fontWeight: 700, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function fmtSvPct(v) {
  if (!v) return '—';
  return v.toFixed(3).replace(/^0/, '');
}

export function PlayersTab({ league, isDark, accentColor }) {
  const t = makeTheme(isDark);
  const sport = league.sport;

  if (sport !== 'hockey' && sport !== 'nhl') {
    return (
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, padding: '40px 24px', textAlign: 'center', boxShadow: t.cardShadow }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>🚧</div>
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
      return <StatusPill entry={entry} t={t} />;
    }
    if (c.key === 'svPct') return fmtSvPct(p.svPct);
    if (c.key === 'gaa') return p.gaa ? p.gaa.toFixed(2) : '—';
    if (c.key === 'plusMinus') {
      const v = p.plusMinus || 0;
      return <span style={{ color: v > 0 ? '#6dd4a8' : v < 0 ? '#e85252' : t.textBody }}>{v > 0 ? `+${v}` : v}</span>;
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
          <option value="available">Available</option>
          <option value="rostered">Rostered</option>
          <option value="keeper">Keepers</option>
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
              {rows.map((p, i) => (
                <tr key={p.id}
                  style={{ borderBottom: i < rows.length - 1 ? `1px solid ${t.dividerFaint}` : 'none', transition: 'background 0.12s' }}
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
        </div>
      )}
    </div>
  );
}
