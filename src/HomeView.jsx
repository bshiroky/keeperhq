import React from 'react';
import { SPORT_CONFIG, SportBadge, SportLogo, DraftBadge, StatusPill, StatBox, Tag, ExpiringDot, getLeagueStats } from './components.jsx';

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
        borderRadius: 12,
        padding: '14px 18px 16px',
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
      {/* Sport sprite watermark behind content */}
      <div style={{
        position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)',
        opacity: isDark ? 0.14 : 0.18, pointerEvents: 'none', zIndex: 0,
      }}>
        <SportLogo sport={league.sport} height={110} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header row — title + season inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: isDark ? '#e8ecf4' : '#1a1f2e', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
            {league.name}
          </div>
          <span style={{ fontSize: '12px', color: isDark ? '#6b7489' : '#8892a4', whiteSpace: 'nowrap', flexShrink: 0 }}>{league.season}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <DraftBadge draftType={league.draftType} />
          <StatusPill status={league.status} />
        </div>

        {/* Stats row — flat, no card-within-a-card, no sub-text */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: league.draftType === 'snake' && stats.expiring > 0 ? 12 : 0 }}>
          <StatBox label="Teams" value={totalTeams || '—'} isDark={isDark} />
          <StatBox
            label="Keepers"
            value={league.status === 'setup' ? '—' : `${stats.withKeepers}/${totalTeams}`}
            accent={stats.withKeepers === totalTeams && totalTeams > 0 ? '#6dd4a8' : undefined}
            isDark={isDark}
          />
          <StatBox
            label="Rosters"
            value={league.status === 'setup' ? '—' : `${stats.rostersLoaded}/${totalTeams}`}
            accent={stats.rostersLoaded === totalTeams && totalTeams > 0 ? '#6dd4a8' : undefined}
            isDark={isDark}
          />
        </div>

        {league.draftType === 'snake' && stats.expiring > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ExpiringDot count={stats.expiring} />
            <span style={{ fontSize: '12px', color: isDark ? '#9aa3b5' : '#6b7489' }}>expiring contracts</span>
          </div>
        )}
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

  let totalTeams = 0, totalStarted = 0, totalRosters = 0;
  leagues.forEach(l => {
    const teams = l.teams || [];
    totalTeams += (l.teamCount || teams.length);
    const s = getLeagueStats(l);
    totalStarted += s.withKeepers;
    totalRosters += s.rostersLoaded;
  });

  // Soonest upcoming draft across all leagues
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = leagues
    .map(l => l.draftDate)
    .filter(d => d && d >= todayStr)
    .sort();
  const nextDraft = upcoming[0];
  const nextDraftLabel = nextDraft
    ? new Date(nextDraft + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'TBD';

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
        { label: 'Teams Started', value: `${totalStarted}/${totalTeams}`, sub: 'with keepers', accent: totalStarted === totalTeams && totalTeams > 0 ? '#6dd4a8' : undefined },
        { label: 'Rosters Loaded', value: `${totalRosters}/${totalTeams}`, sub: 'last-season imports', accent: totalRosters === totalTeams && totalTeams > 0 ? '#6dd4a8' : undefined },
        { label: 'Next Draft', value: nextDraftLabel, sub: upcoming.length > 1 ? `+${upcoming.length - 1} more` : undefined },
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
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
