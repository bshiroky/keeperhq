import React from 'react';
import { SPORT_CONFIG, tokens, makeTheme, TradingCard, paymentsOf, GRAIN_SVG, CARD_STYLES, Button, GoogleButton, TextLink } from './components.jsx';

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

// ── Pack Stats — page-level KPI numerics (mascot + speech-bubble narration
//    removed; the numbers are the surface) ─────────────────────────────────
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
      {/* KPI numerics — monospace broadcast-readout style */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: tokens.spaceLg }}>
        {[
          { label: 'Leagues',     val: leagues.length,                                color: t.textPrimary },
          { label: 'Collected',   val: `$${totals.collected.toLocaleString()}`,      color: tokens.success },
          { label: 'Outstanding', val: `$${totals.outstanding.toLocaleString()}`,    color: totals.outstanding > 0 ? tokens.warning : t.textMuted },
          { label: 'Unpaid',      val: totals.unpaid,                                 color: totals.unpaid > 0 ? tokens.warning : t.textMuted },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
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

// ── Demo-browsing banner — sits above the grid when a logged-out visitor is
//    browsing the demo leagues (reached via "Explore the demo →"). Frames
//    the real My-Leagues grid, doesn't rebuild it. ──────────────────────────
function DemoBanner({ isDark, onSignIn }) {
  const t = makeTheme(isDark);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: tokens.spaceMd, flexWrap: 'wrap',
      background: tokens.infoBg, border: `1px solid ${tokens.infoBorder}`,
      borderRadius: tokens.radiusLg, padding: `${tokens.spaceMd}px ${tokens.spaceLg}px`,
      marginBottom: tokens.spaceLg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceMd, minWidth: 0 }}>
        <img src="/mascot-empty.png" alt="" height={44}
          style={{ height: 44, width: 'auto', imageRendering: 'pixelated', display: 'block', flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.textPrimary }}>You're browsing demo leagues.</div>
          <div style={{ ...tokens.typeBodyMeta, color: t.textSecondary, marginTop: 2 }}>
            Poke around all you like — sign in with Google to build your own.
          </div>
        </div>
      </div>
      <GoogleButton size="sm" isDark={isDark} onClick={onSignIn} />
    </div>
  );
}

// ── New-user empty state — signed-in account with zero leagues yet. Mascot
//    speech is allowed here (a welcome/help surface), unlike the scanning
//    surfaces this replaces. ──────────────────────────────────────────────
function NewUserEmptyState({ isDark, onCreateLeague, onBrowseDemo }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: `0 ${tokens.spaceXl}px ${tokens.space2xl * 2}px` }}>
      <div style={{ marginBottom: tokens.spaceXl }}>
        <h1 style={{ ...tokens.typeHeadingPage, color: t.textPrimary, margin: 0 }}>My Leagues</h1>
        <p style={{ ...tokens.typeBodyMeta, color: t.textMuted, margin: `${tokens.space2xs}px 0 0` }}>
          Overview of all your keeper leagues
        </p>
      </div>

      <div style={{
        maxWidth: 480, margin: '0 auto', textAlign: 'center',
        background: t.cardBg, border: `1px solid ${t.border}`, boxShadow: t.cardShadow,
        borderRadius: tokens.radiusLg, padding: `${tokens.space2xl + tokens.spaceLg}px ${tokens.space2xl}px`,
      }}>
        <img src="/mascot-celebrate.png" alt="" height={150}
          style={{ height: 150, width: 'auto', imageRendering: 'pixelated', display: 'block', margin: `0 auto ${tokens.spaceLg}px` }} />

        <div style={{
          display: 'inline-block',
          background: t.sectionBg, border: `1px solid ${t.border}`,
          borderRadius: tokens.radiusLg, padding: `${tokens.spaceSm}px ${tokens.spaceMd}px`,
          ...tokens.typeBody, fontWeight: 600, color: t.textBody,
          marginBottom: tokens.spaceLg,
        }}>
          Welcome aboard — let's get your first league set up. 🏆
        </div>

        <h2 style={{ ...tokens.typeHeadingHero, color: t.textPrimary, margin: 0 }}>
          You don't have any leagues yet
        </h2>
        <p style={{ ...tokens.typeBody, color: t.textBody, margin: `${tokens.spaceSm}px 0 ${tokens.space2xl}px`, lineHeight: 1.55 }}>
          Set up your league in about two minutes — sport, draft type, teams, and
          keeper slots — then start tracking contracts and off-season trades.
        </p>

        <Button
          variant="primary" isDark={isDark} accent={tokens.brand} onClick={onCreateLeague}
          style={{ width: '100%', height: 46, fontSize: 14, boxShadow: '0 2px 8px rgba(60,169,107,0.3)' }}
        >
          + Create your first league
        </Button>
        <div style={{ marginTop: tokens.spaceMd }}>
          <TextLink isDark={isDark} onClick={onBrowseDemo}>Browse the demo leagues instead →</TextLink>
        </div>
      </div>
    </div>
  );
}

function HomeView({ leagues, onSelectLeague, onAddLeague, isDark, demo, onSignIn }) {
  const [filter, setFilter] = React.useState('all');
  const shown = filter === 'all' ? leagues : leagues.filter(l => l.sport === filter);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: `0 ${tokens.spaceXl}px ${tokens.space2xl * 2}px` }}>
      <style>{CARD_STYLES}</style>

      {demo && <DemoBanner isDark={isDark} onSignIn={onSignIn} />}

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
            demo={demo}
          />
        ))}
        <AddLeagueSlot onClick={onAddLeague} isDark={isDark} />
      </div>
    </div>
  );
}

export { AddLeagueSlot, PackStats, SportFilter, HomeView, NewUserEmptyState };
