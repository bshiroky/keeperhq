import React from 'react';
import { SPORT_CONFIG, SportBadge, SportLogo, DraftBadge, StatusPill, StatBox, Tag, ExpiringDot, formatDate, getLeagueStats } from './components.jsx';

// Home View — Commissioner Dashboard

function LeagueCard({ league, onClick, sportColors, isDark }) {
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const stats = getLeagueStats(league);
  const accentColor = sportColors ? sport.color : '#3b8ae6';
  const totalTeams = league.teamCount || league.teams.length;
  const keeperTotal = totalTeams * league.keeperSlots;

  const cardBg = isDark ? '#161a22' : '#ffffff';
  const cardBgHover = isDark ? '#1c2130' : '#f7f9fc';
  const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const cardShadow = isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.06)';
  const cardShadowHover = isDark ? `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${accentColor}22` : `0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px ${accentColor}22`;
  const sectionBg = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';

  return (
    <div
      onClick={() => onClick(league)}
      style={{
        background: cardBg,
        border: `1px solid ${borderColor}`,
        borderTop: `3px solid ${accentColor}`,
        borderRadius: '0 0 12px 12px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        display: 'flex', flexDirection: 'column', gap: 0,
        position: 'relative', overflow: 'hidden',
        boxShadow: cardShadow,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = cardBgHover;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = cardShadowHover;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = cardBg;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = cardShadow;
      }}
    >
      {/* Subtle sport glow */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 120, height: 120,
        background: `radial-gradient(circle at top right, ${accentColor}0d, transparent 70%)`,
        pointerEvents: 'none',
      }}></div>

      {/* Header section */}
      <div style={{ padding: '0 0 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, width: '100%', overflow: 'hidden' }}>
          <SportLogo sport={league.sport} height={40} />
          <span style={{ fontSize: '18px', fontWeight: 700, color: isDark ? '#e8ecf4' : '#1a1f2e', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
            {league.name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', overflow: 'hidden' }}>
          <SportBadge sport={league.sport} />
          <DraftBadge draftType={league.draftType} />
          <StatusPill status={league.status} />
          <span style={{ fontSize: '12px', color: isDark ? '#6b7489' : '#8892a4', marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>{league.season}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: dividerColor, margin: '0 0 16px' }}></div>

      {/* Stats section */}
      <div style={{ background: sectionBg, borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <StatBox label="Teams" value={totalTeams || '—'} isDark={isDark} />
          <StatBox
            label="Keepers"
            value={league.status === 'setup' ? '—' : `${stats.withKeepers}/${totalTeams}`}
            sub={league.status !== 'setup' ? (stats.withKeepers === totalTeams ? 'all teams started ✓' : 'teams with keepers') : 'not set up'}
            accent={stats.withKeepers === totalTeams && totalTeams > 0 ? '#6dd4a8' : undefined}
            isDark={isDark}
          />
          <StatBox
            label="Payments"
            value={league.status === 'setup' ? '—' : `${stats.paid}/${totalTeams}`}
            sub={league.status !== 'setup' ? `$${stats.collectedPool.toLocaleString()} in` : ''}
            accent={stats.paid === totalTeams && totalTeams > 0 ? '#6dd4a8' : stats.paid < totalTeams ? '#e8832a' : undefined}
            isDark={isDark}
          />
          <StatBox
            label="Prize Pool"
            value={league.totalPool > 0 ? `$${league.totalPool.toLocaleString()}` : '—'}
            sub={`$${league.buyIn} buy-in`}
            isDark={isDark}
          />
        </div>
      </div>

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {league.draftType === 'snake' && stats.expiring > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <ExpiringDot count={stats.expiring} />
              <span style={{ fontSize: '12px', color: isDark ? '#9aa3b5' : '#6b7489' }}>expiring contracts</span>
            </div>
          )}
          {league.draftType === 'auction' && (
            <Tag color={accentColor}>+${league.auctionRules?.costIncreasePerYear}/yr keeper cost</Tag>
          )}
          {league.keeperSlots && (
            <Tag>{league.draftType === 'auction' ? `Up to ${league.keeperSlots}` : `${league.keeperSlots}`} keepers</Tag>
          )}
        </div>
        <div style={{ fontSize: '12px', color: isDark ? '#6b7489' : '#8892a4' }}>
          {league.draftDate ? `Draft ${formatDate(league.draftDate)}` : 'Draft TBD'}
        </div>
      </div>
    </div>
  );
}

function AddLeagueCard({ onClick, isDark }) {
  const bg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
  const bgHover = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
  const borderHover = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
  const color = isDark ? '#6b7489' : '#8892a4';
  const colorHover = isDark ? '#9aa3b5' : '#5a6278';
  return (
    <div
      onClick={onClick}
      style={{
        background: bg, border: `2px dashed ${border}`,
        borderRadius: 12, padding: '20px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, minHeight: 180, transition: 'all 0.18s ease', color,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = bgHover; e.currentTarget.style.borderColor = borderHover; e.currentTarget.style.color = colorHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = border; e.currentTarget.style.color = color; }}
    >
      <div style={{ fontSize: 28, opacity: 0.4 }}>+</div>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>Add League</div>
    </div>
  );
}

function SummaryBar({ leagues, isDark }) {
  const totalLeagues = leagues.filter(l => l.status !== 'setup').length;
  const totalPool = leagues.reduce((a, l) => a + (l.totalPool || 0), 0);
  const totalCollected = leagues.reduce((a, l) => {
    const s = getLeagueStats(l);
    return a + s.collectedPool;
  }, 0);
  const unpaid = leagues.reduce((a, l) => {
    const s = getLeagueStats(l);
    return a + ((l.teamCount || l.teams.length) - s.paid);
  }, 0);
  const outstanding = totalPool - totalCollected;

  const barBg = isDark ? '#161a22' : '#ffffff';
  const barBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  const divBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? '#6b7489' : '#8892a4';
  const valueColor = isDark ? '#e8ecf4' : '#1a1f2e';

  return (
    <div style={{
      display: 'flex', gap: 0,
      background: barBg,
      border: `1px solid ${barBorder}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 32,
    }}>
      {[
        { label: 'Active Leagues', value: totalLeagues },
        { label: 'Collected', value: `$${totalCollected.toLocaleString()}`, sub: `of $${totalPool.toLocaleString()}`, accent: totalCollected >= totalPool ? '#6dd4a8' : undefined },
        { label: 'Outstanding', value: `$${outstanding.toLocaleString()}`, sub: 'still to collect', accent: outstanding > 0 ? '#e8832a' : '#6dd4a8' },
        { label: 'Unpaid Teams', value: unpaid, accent: unpaid > 0 ? '#e8832a' : '#6dd4a8' },
      ].map((s, i, arr) => (
        <React.Fragment key={s.label}>
          <div style={{ flex: 1, padding: '18px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: labelColor, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: s.accent || valueColor }}>{s.value}</div>
            {s.sub && <div style={{ fontSize: '11px', color: labelColor, marginTop: 2 }}>{s.sub}</div>}
          </div>
          {i < arr.length - 1 && <div style={{ width: 1, background: divBg, alignSelf: 'stretch' }}></div>}
        </React.Fragment>
      ))}
    </div>
  );
}

function HomeView({ leagues, onSelectLeague, onAddLeague, sportColors, isDark }) {
  const [filter, setFilter] = React.useState('all');
  const sports = ['all', 'hockey', 'basketball', 'football', 'baseball'];
  const filtered = filter === 'all' ? leagues : leagues.filter(l => l.sport === filter);
  const filterBtnActive = isDark ? {} : { color: '#fff' };
  const filterBtnInactive = isDark ? { background: 'rgba(255,255,255,0.06)', color: '#9aa3b5' } : { background: 'rgba(0,0,0,0.06)', color: '#6b7489' };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>
      <SummaryBar leagues={leagues} isDark={isDark} />

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: isDark ? '#6b7489' : '#8892a4', marginRight: 4, fontWeight: 600 }}>FILTER</span>
        {sports.map(s => {
          const cfg = SPORT_CONFIG[s];
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: '12px', fontWeight: 600,
                background: active ? (cfg ? cfg.color : '#3b8ae6') : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                color: active ? '#fff' : (isDark ? '#9aa3b5' : '#6b7489'),
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {s === 'all' ? 'All Leagues' : cfg.label}
            </button>
          );
        })}
      </div>

      {/* League grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
        {filtered.map(league => (
          <LeagueCard key={league.id} league={league} onClick={onSelectLeague} sportColors={sportColors} isDark={isDark} />
        ))}
        <AddLeagueCard onClick={onAddLeague} isDark={isDark} />
      </div>
    </div>
  );
}

Object.assign(window, { HomeView, LeagueCard, SummaryBar });

export { LeagueCard, AddLeagueCard, SummaryBar, HomeView };
