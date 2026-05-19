import React from 'react';
import { SPORT_CONFIG, tokens, makeTheme } from './components.jsx';

// Home View — Trading-Card pack.
//
// Each league is a collectible: sport-tinted hero panel + mascot, action
// sticker top-left, dashed-divider stat block at the bottom (back-of-card),
// holofoil shine on hover, mascot bobs while hovered. Above the grid, a
// "Pack Stats" announcement strip with a mascot + speech bubble + KPI
// numerics. AddLeagueSlot lives at the tail of the grid as a binder-empty-
// slot card (dashed outline, faded silhouette).

// ── Action engine: surfaces the single next thing the commissioner ────────
// should do for each league. Drives the action sticker copy + color.
function nextAction(league) {
  const teams = league.teams || [];
  const teamCount = league.teamCount || teams.length;
  const teamsWithKeepers = teams.filter(tm => (tm.keepers || []).length > 0).length;

  if (league.status === 'completed') return { kind: 'action', label: 'Start new season', cta: true };
  if (league.status === 'active')    return { kind: 'ready',  label: 'In season',        cta: false };
  if (league.status === 'setup')     return { kind: 'action', label: 'Set up league',    cta: true };

  if (league.draftType === 'snake') {
    const rostersLoaded = teams.filter(tm => (tm.roster || []).length > 0).length;
    if (rostersLoaded === 0)       return { kind: 'action', label: 'Upload rosters', cta: true };
    if (rostersLoaded < teamCount) return { kind: 'action', label: `Upload rosters · ${rostersLoaded}/${teamCount}`, cta: true };
  }
  if (league.draftType === 'auction') {
    const hasAnyPriors = teams.some(tm => (tm.priorKeepers || []).length > 0);
    if (!hasAnyPriors) return { kind: 'action', label: "Import last year's draft", cta: true };
  }

  if (teamsWithKeepers < teamCount) {
    return { kind: 'waiting', label: `${teamsWithKeepers}/${teamCount} keepers in`, cta: false };
  }
  if (!league.draftDate) return { kind: 'action', label: 'Set draft date', cta: true };
  return { kind: 'ready', label: 'Ready for draft', cta: false };
}

// Voice line under the meta — same state as `nextAction` would say it in chat.
function flavorLine(league, action) {
  const teams = league.teams || [];
  const teamCount = league.teamCount || teams.length;
  const teamsWithKeepers = teams.filter(tm => (tm.keepers || []).length > 0).length;

  if (action.kind === 'action') {
    if (action.label.startsWith('Upload rosters'))   return "Rosters first — can't verify keepers without 'em.";
    if (action.label.startsWith("Import last year")) return "Need last year's draft to seed keeper costs.";
    if (action.label === 'Set draft date')           return "Everything's in. Just pick a date.";
    if (action.label === 'Start new season')         return "Season's done. Roll it forward.";
    if (action.label === 'Set up league')            return "Fresh league. Let's wire it up.";
    return action.label;
  }
  if (action.kind === 'waiting') {
    return `${teamsWithKeepers} of ${teamCount} have picked keepers. Patience.`;
  }
  return "Locked and loaded. Bring on draft day.";
}

function paymentsOf(league) {
  const teams = league.teams || [];
  const teamCount = league.teamCount || teams.length;
  const paid = teams.filter(tm => tm.paid).length;
  const buyIn = league.buyIn || 0;
  return {
    paid, teamCount, buyIn,
    collected:   paid * buyIn,
    potential:   teamCount * buyIn,
    outstanding: (teamCount - paid) * buyIn,
    behind:      paid < teamCount,
    complete:    paid === teamCount && teamCount > 0,
  };
}

function ruleMod(league) {
  if (league.draftType === 'snake' && league.contractYears) {
    return `${league.contractYears}-yr max contract`;
  }
  if (league.draftType === 'auction' && league.auctionRules?.costIncreasePerYear) {
    return `+$${league.auctionRules.costIncreasePerYear}/yr keeper cost`;
  }
  return null;
}

// Trading-card grain: tiny SVG noise, applied as a low-opacity background
// image. Gives the print bed a cardstock material feel instead of flat pixel.
const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Animation hooks. Lives in a single <style> tag rendered inside HomeView —
// keyframes and :hover descendants can't be inlined.
const CARD_STYLES = `
  @keyframes kh-shine { 0% { transform: translateX(-150%) skewX(-22deg); } 100% { transform: translateX(420%) skewX(-22deg); } }
  @keyframes kh-bob   { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
  @keyframes kh-pop   { 0% { transform: scale(0.85) rotate(-3deg); } 60% { transform: scale(1.06) rotate(-3deg); } 100% { transform: scale(1) rotate(-3deg); } }

  .kh-tcard {
    transition:
      transform 0.28s cubic-bezier(.2,.8,.2,1),
      box-shadow 0.28s,
      border-color 0.28s;
    will-change: transform;
  }
  .kh-tcard:hover { transform: translateY(-6px) rotate(-0.5deg); }

  .kh-tcard-shine {
    position: absolute; top: 0; left: 0; bottom: 0; width: 32%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent);
    transform: translateX(-150%) skewX(-22deg);
    pointer-events: none; mix-blend-mode: overlay;
  }
  .kh-tcard:hover .kh-tcard-shine { animation: kh-shine 1.15s ease-out; }

  .kh-tcard:hover .kh-tcard-mascot { animation: kh-bob 1.1s ease-in-out infinite; }

  .kh-tcard-sticker { animation: kh-pop 0.28s cubic-bezier(.2,.8,.2,1); }

  .kh-add-slot { transition: border-color 0.18s, color 0.18s; }
`;

// ── Trading card ─────────────────────────────────────────────────────────
function TradingCard({ league, onClick, isDark }) {
  const sport  = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const t      = makeTheme(isDark);
  const action = nextAction(league);
  const pay    = paymentsOf(league);
  const mod    = ruleMod(league);
  const flavor = flavorLine(league, action);
  const totalPool = (league.totalPool || pay.potential).toLocaleString();

  const stickerColors = {
    action:  { bg: tokens.warning, fg: '#fff' },
    waiting: { bg: isDark ? '#2a3142' : '#dfe4ee', fg: isDark ? '#c8d0e0' : '#3a4255' },
    ready:   { bg: tokens.success, fg: '#0f2018' },
  }[action.kind];

  const moodColor = action.kind === 'action' ? tokens.warning
                  : action.kind === 'ready'  ? tokens.success
                  :                            sport.color;

  return (
    <div
      onClick={() => onClick && onClick(league)}
      className="kh-tcard"
      style={{
        position: 'relative', overflow: 'hidden',
        background: t.cardBg,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: isDark
          ? `0 1px 0 rgba(255,255,255,0.05) inset,
             0 0 0 1px ${sport.color}11,
             0 14px 32px rgba(0,0,0,0.5)`
          : `0 1px 0 rgba(255,255,255,1) inset,
             0 0 0 1px ${sport.color}22,
             0 1px 3px rgba(0,0,0,0.08),
             0 14px 32px rgba(0,0,0,0.10)`,
      }}
    >
      {/* HERO PANEL — sport scene bg + sticker + mascot + grain + shine.
          Panel takes the scene image's native 3:2 aspect ratio so the
          whole scene shows without cropping (scoreboards top-center,
          action down-low, etc. all stay visible). Mascot below is
          bottom-anchored so it stays grounded as the panel grows. Sport
          color is the brief fallback during image load. */}
      <div style={{
        position: 'relative',
        backgroundColor: sport.color,
        backgroundImage: `url(${sport.bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        aspectRatio: '3 / 2',
        overflow: 'hidden',
      }}>
        {/* Print band: sport · season */}
        <div style={{
          position: 'absolute', top: tokens.spaceSm, left: tokens.spaceSm, right: tokens.spaceSm,
          color: 'rgba(255,255,255,0.92)',
          ...tokens.typeLabelEyebrow,
          textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          zIndex: 3,
        }}>
          {sport.label.toUpperCase()} · {league.season}
        </div>

        {/* Action sticker — tilted, drop-shadowed, animates on label change */}
        <div className="kh-tcard-sticker" key={action.label} style={{
          position: 'absolute', top: 38, left: tokens.spaceSm,
          background: stickerColors.bg, color: stickerColors.fg,
          padding: '6px 12px', borderRadius: tokens.radiusSm,
          ...tokens.typePillEmphatic, fontWeight: 800,
          transform: 'rotate(-3deg)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.4) inset',
          zIndex: 3, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          {action.label.toUpperCase()}
        </div>

        {/* Hero mascot — bottom-right, bobs on parent hover */}
        <div style={{
          position: 'absolute', right: -8, bottom: -16,
          width: 160, height: 170,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 2,
        }}>
          <img className="kh-tcard-mascot" src={sport.logo} alt=""
            style={{
              height: 152, width: 'auto', imageRendering: 'pixelated', display: 'block',
              filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.25))',
            }} />
        </div>

        {/* Film grain over the hero */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: GRAIN_SVG,
          opacity: 0.18, mixBlendMode: 'overlay',
          pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Foil shine sweep */}
        <div className="kh-tcard-shine" style={{ zIndex: 4 }} />
      </div>

      {/* CARD FACE — name, meta, flavor, stat block */}
      <div style={{ padding: `${tokens.spaceMd}px`, position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: GRAIN_SVG,
          opacity: isDark ? 0.05 : 0.04, mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative' }}>
          <div style={{ ...tokens.typeHeadingHero, color: t.textPrimary, lineHeight: 1.1 }}>
            {league.name}
          </div>
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 3 }}>
            {mod || 'Keeper league'} · Up to {league.keeperSlots || 0} keepers
          </div>

          {/* Flavor — voice line. Mood-colored rule on the left. */}
          <div style={{
            marginTop: tokens.spaceSm, marginBottom: tokens.space2xs,
            paddingLeft: tokens.spaceSm - 2,
            borderLeft: `2px solid ${moodColor}`,
            color: t.textBody,
            ...tokens.typeBodyMeta, fontStyle: 'italic', lineHeight: 1.45,
          }}>
            {flavor}
          </div>

          {/* Back-of-card stat block. Dashed top divider, tabular numerics. */}
          <div style={{
            marginTop: tokens.spaceSm,
            paddingTop: tokens.spaceSm,
            borderTop: `1px dashed ${t.border}`,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            fontFeatureSettings: '"tnum"',
          }}>
            {[
              { label: 'Teams', val: pay.teamCount, color: t.textPrimary },
              { label: 'Paid',  val: `${pay.paid}/${pay.teamCount}`,
                color: pay.complete ? tokens.success : pay.behind ? tokens.warning : t.textPrimary },
              { label: 'Pool',  val: `$${totalPool}`, color: t.textPrimary },
            ].map(s => (
              <div key={s.label}>
                <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>{s.label}</div>
                <div style={{ ...tokens.typeNumericCompact, color: s.color, lineHeight: 1.15, marginTop: 1 }}>
                  {s.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
    { id: 'all',        label: 'All Leagues', color: tokens.info },
    { id: 'hockey',     label: 'Hockey',      color: SPORT_CONFIG.hockey.color },
    { id: 'basketball', label: 'Basketball',  color: SPORT_CONFIG.basketball.color },
    { id: 'football',   label: 'Football',    color: SPORT_CONFIG.football.color },
    { id: 'baseball',   label: 'Baseball',    color: SPORT_CONFIG.baseball.color },
  ];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      marginTop: tokens.spaceXl, marginBottom: tokens.spaceMd,
    }}>
      <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginRight: 6 }}>Filter</span>
      {opts.map(s => {
        const active = value === s.id;
        return (
          <button key={s.id} onClick={() => onChange(s.id)} style={{
            padding: '5px 14px', borderRadius: tokens.radiusPill, border: 'none', cursor: 'pointer',
            background: active ? s.color : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
            color:      active ? '#fff'  : (isDark ? '#9aa3b5'                 : '#6b7489'),
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

export { TradingCard, AddLeagueSlot, PackStats, SportFilter, HomeView };
