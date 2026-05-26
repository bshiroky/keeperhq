import React from 'react';
import { SPORT_CONFIG, tokens, makeTheme, TradingCard, paymentsOf, GRAIN_SVG, CARD_STYLES } from './components.jsx';

// Home View — Trading-Card pack.
//
// Each league is a collectible card (TradingCard, now in components.jsx so the
// create-league wizard shares it). Above the grid, a "Pack Stats" announcement
// strip with a mascot + speech bubble + KPI numerics. AddLeagueSlot lives at
// the tail of the grid as a binder-empty-slot card.

// ── Empty binder slot — visual rhythm holder + entry point for new leagues
function AddLeagueSlot({ onClick, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div
      onClick={onClick}
      className="kh-add-slot"
      style={{
        position: 'relative', overflow: 'hidden',
        background: 'transparent',
        border: `2px dashed ${t.border}`,
        borderRadius: 16,
        cursor: 'pointer',
        minHeight: 360,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: tokens.spaceSm,
        color: t.textMuted,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = t.textMuted; e.currentTarget.style.color = t.textSecondary; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = t.border;    e.currentTarget.style.color = t.textMuted; }}
    >
      <img src="/mascot-empty.png" alt="" height={120}
        style={{
          height: 120, width: 'auto', imageRendering: 'pixelated', display: 'block',
          opacity: 0.12, filter: 'grayscale(1)', marginBottom: tokens.spaceXs,
        }} />
      <div style={{ ...tokens.typeLabelEyebrow, color: 'inherit' }}>Empty slot</div>
      <div style={{ ...tokens.typeBody, fontWeight: 600, color: 'inherit' }}>+ Add League</div>
    </div>
  );
}

// ── Pack Stats — page-level mascot + speech bubble + KPI numerics ────────
function PackStats({ leagues, isDark }) {
  const t = makeTheme(isDark);
  const totals = leagues.reduce((a, l) => {
    const p = paymentsOf(l);
    return {
      collected:   a.collected   + p.collected,
      outstanding: a.outstanding + p.outstanding,
      unpaid:      a.unpaid      + (p.teamCount - p.paid),
    };
  }, { collected: 0, outstanding: 0, unpaid: 0 });

  let voice, accent;
  if (totals.outstanding === 0) { voice = `All ${leagues.length} leagues paid up. Beautiful.`; accent = tokens.success; }
  else if (totals.unpaid === 1) { voice = `One team still owes. Quick nudge and you're done.`; accent = tokens.warning; }
  else if (totals.unpaid <= 3)  { voice = `${totals.unpaid} teams still owe — gentle nudge time.`; accent = tokens.warning; }
  else                          { voice = `${totals.unpaid} unpaid teams across ${leagues.length} leagues — start chasing.`; accent = tokens.warning; }

  const MONO = 'ui-monospace, "SF Mono", Menlo, Monaco, monospace';

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14,
      padding: `${tokens.spaceMd}px ${tokens.spaceLg}px`,
      boxShadow: isDark
        ? '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)'
        : '0 1px 0 rgba(255,255,255,1) inset, 0 4px 16px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: GRAIN_SVG,
        opacity: isDark ? 0.06 : 0.04, mixBlendMode: isDark ? 'overlay' : 'multiply',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: tokens.spaceLg, flexWrap: 'wrap' }}>
        {/* Mascot + speech bubble. commissioner.png is the target asset
            once dropped into /public/ — falls back to mascot-empty.png. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceSm, flex: '0 0 auto' }}>
          <img src="/commissioner.png" alt="" height={72}
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/mascot-empty.png'; }}
            style={{
              height: 72, width: 'auto', imageRendering: 'pixelated', display: 'block', flexShrink: 0,
              filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.15))',
            }} />
          <div style={{ position: 'relative', maxWidth: 280 }}>
            <div style={{
              background: isDark ? '#1c2130' : '#ffffff',
              border: `1.5px solid ${accent}`,
              color: t.textBody,
              borderRadius: tokens.radiusLg,
              padding: '9px 13px',
              boxShadow: `0 2px 0 ${accent}22`,
            }}>
              <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: 2 }}>Pack stats</div>
              <div style={{ ...tokens.typeBody, fontWeight: 600, color: t.textPrimary, lineHeight: 1.35 }}>{voice}</div>
            </div>
            <div style={{
              position: 'absolute', left: -7, top: 22,
              width: 12, height: 12,
              background: isDark ? '#1c2130' : '#ffffff',
              borderLeft: `1.5px solid ${accent}`,
              borderBottom: `1.5px solid ${accent}`,
              transform: 'rotate(45deg)',
            }} />
          </div>
        </div>
        {/* KPI numerics — monospace broadcast-readout style */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: tokens.spaceLg, minWidth: 360 }}>
          {[
            { label: 'Leagues',     val: leagues.length,                                color: t.textPrimary },
            { label: 'Collected',   val: `$${totals.collected.toLocaleString()}`,      color: tokens.success },
            { label: 'Outstanding', val: `$${totals.outstanding.toLocaleString()}`,    color: totals.outstanding > 0 ? tokens.warning : t.textMuted },
            { label: 'Unpaid',      val: totals.unpaid,                                 color: totals.unpaid > 0 ? tokens.warning : t.textMuted },
          ].map(s => (
            <div key={s.label}>
              <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>{s.label}</div>
              <div style={{
                fontFamily: MONO,
                ...tokens.typeNumericCard, color: s.color,
                letterSpacing: '-0.01em', marginTop: 2, fontFeatureSettings: '"tnum"',
              }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sport filter pills ───────────────────────────────────────────────────
function SportFilter({ value, onChange, isDark }) {
  const t = makeTheme(isDark);
  const opts = [
    { id: 'all',        label: 'All Leagues', cfg: null },
    { id: 'hockey',     label: 'Hockey',      cfg: SPORT_CONFIG.hockey },
    { id: 'basketball', label: 'Basketball',  cfg: SPORT_CONFIG.basketball },
    { id: 'football',   label: 'Football',    cfg: SPORT_CONFIG.football },
    { id: 'baseball',   label: 'Baseball',    cfg: SPORT_CONFIG.baseball },
  ];
  const neutralBg   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const neutralText = isDark ? '#9aa3b5' : '#6b7489';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      marginTop: tokens.spaceXl, marginBottom: tokens.spaceMd,
    }}>
      <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginRight: 6 }}>Filter</span>
      {opts.map(s => {
        const active = value === s.id;
        let bg, color, border;
        if (s.cfg) {
          bg     = active ? s.cfg.color : s.cfg.tint;
          color  = active ? '#fff'      : s.cfg.color;
          border = `1px solid ${active ? s.cfg.color : s.cfg.border}`;
        } else {
          bg     = active ? tokens.info : neutralBg;
          color  = active ? '#fff'      : neutralText;
          border = `1px solid ${active ? tokens.info : 'transparent'}`;
        }
        return (
          <button key={s.id} onClick={() => onChange(s.id)} style={{
            padding: '4px 13px', borderRadius: tokens.radiusPill, border, cursor: 'pointer',
            background: bg, color,
            ...tokens.typePill, fontWeight: 600,
            transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function HomeView({ leagues, onSelectLeague, onAddLeague, isDark }) {
  const [filter, setFilter] = React.useState('all');
  const shown = filter === 'all' ? leagues : leagues.filter(l => l.sport === filter);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: `0 ${tokens.spaceXl}px ${tokens.space2xl * 2}px` }}>
      <style>{CARD_STYLES}</style>

      {/* KPI strip — totals across the whole pack, not the current filter */}
      <PackStats leagues={leagues} isDark={isDark} />

      <SportFilter value={filter} onChange={setFilter} isDark={isDark} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
        gap: tokens.spaceLg,
      }}>
        {shown.map(league => (
          <TradingCard
            key={league.id}
            league={league}
            onClick={onSelectLeague}
            isDark={isDark}
          />
        ))}
        <AddLeagueSlot onClick={onAddLeague} isDark={isDark} />
      </div>
    </div>
  );
}

export { AddLeagueSlot, PackStats, SportFilter, HomeView };
