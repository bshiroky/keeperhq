import React from 'react';
import { createPortal } from 'react-dom';

// Shared UI components — exported to window

// Design tokens. Two namespaces, two concerns:
//   text* = color values for text  (textPrimary, textMuted, etc.) — theme-dependent
//   type* = typography style objects  (font-size, weight, letter-spacing, transform) — theme-invariant
// Do NOT merge these — textBody is a color, typeBody is a size+weight spec.
//
// Theme-invariant tokens (type, space, radius, semantic color) live in the
// module-scope `tokens` constant. Components that don't have isDark in
// scope can use `tokens.typePill` directly. `makeTheme(isDark)` spreads
// the same values back in, so existing call sites of `t.typePill` etc.
// continue to work.
//
// New surfaces consume tokens; they do not introduce values. If a new role
// is genuinely needed, add a token here first.
const tokens = {
  // ── typography (style objects; spread into inline styles) ─
  //   <h1 style={{ ...tokens.typeHeadingPage, color: t.textPrimary }}>
  typeHeadingPage:    { fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em' },
  typeHeadingHero:    { fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em' },
  typeHeadingCard:    { fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em' },
  typeHeadingSection: { fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
  typeLabelEyebrow:   { fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
  typePill:           { fontSize: '11px', fontWeight: 600, letterSpacing: '0.03em' },
  typePillEmphatic:   { fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' },
  typeBody:           { fontSize: '13px', fontWeight: 400 },
  typeBodyMeta:       { fontSize: '12px', fontWeight: 400 },
  typeNumericHero:    { fontSize: '26px', fontWeight: 700 },
  typeNumericCard:    { fontSize: '22px', fontWeight: 700 },
  typeNumericCompact: { fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em' },
  typeNumericInline:  { fontSize: '17px', fontWeight: 700 },

  // ── spacing (numbers; inline styles auto-px) ──────────────
  //   padding: `${tokens.spaceSm}px ${tokens.spaceMd}px`   gap: tokens.spaceMd
  space2xs: 4,
  spaceXs:  8,
  spaceSm:  12,
  spaceMd:  16,
  spaceLg:  20,
  spaceXl:  24,
  space2xl: 32,

  // ── radius ────────────────────────────────────────────────
  radiusSm:   6,    // chips, small badges
  radiusMd:   8,    // buttons, inputs
  radiusLg:   12,   // cards, modals, nested stat blocks
  radiusPill: 999,  // true pills (StatusPill, DraftBadge, filter chips)

  // ── semantic color ────────────────────────────────────────
  success:       '#6dd4a8',
  successBg:     'rgba(109,212,168,0.14)',
  successBorder: 'rgba(109,212,168,0.33)',
  warning:       '#e8832a',
  warningBg:     'rgba(232,131,42,0.12)',
  warningBorder: 'rgba(232,131,42,0.33)',
  danger:        '#e85252',
  dangerBg:      'rgba(232,82,82,0.12)',
  dangerBorder:  'rgba(232,82,82,0.33)',
  info:          '#3b8ae6',
  infoBg:        'rgba(59,138,230,0.12)',
  infoBorder:    'rgba(59,138,230,0.33)',
  brand:         '#3ca96b',
};

function makeTheme(isDark) {
  return {
    // ── surface ───────────────────────────────────────────────
    cardBg:       isDark ? '#1c2130' : '#ffffff',
    cardBg2:      isDark ? '#161a22' : '#ffffff',
    cardShadow:   isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.06)',
    border:       isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    divider:      isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    dividerFaint: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    sectionBg:    isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
    noteBg:       isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    progressBg:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',

    // ── text color ────────────────────────────────────────────
    textPrimary:  isDark ? '#e8ecf4' : '#1a1f2e',
    textBody:     isDark ? '#c8d0e0' : '#3a4255',
    textSecondary:isDark ? '#9aa3b5' : '#6b7489',
    textMuted:    isDark ? '#6b7489' : '#8892a4',
    badgeBg:      isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
    badgeColor:   isDark ? '#9aa3b5' : '#6b7489',

    // theme-invariants (also available via the `tokens` constant)
    ...tokens,
  };
}

// Each sport carries pre-baked tint (≈12% alpha) and border (≈33% alpha)
// variants alongside its base color. Use these instead of inlining
// `${color}1f` or similar. For surfaces that have a raw accent hex but not
// the sport object, use the sportTint / sportBorder helpers exported below.
// `bgPosition` (optional) tunes each sport's background-position when the
// 5:2 hero panel crops a 3:2 source image. Hockey and baseball read fine
// at the default 'center' (their characters' feet sit near the vertical
// middle of the image). Basketball and football have characters with feet
// closer to the bottom edge of the source, so they need the visible band
// shifted downward to keep the character grounded on the court/field.
const SPORT_CONFIG = {
  hockey:     { label: 'Hockey',     icon: '🏒', color: '#3b8ae6', tint: 'rgba(59,138,230,0.12)', border: 'rgba(59,138,230,0.20)', logo: '/sport-hockey.png',     bgImage: '/hockey-bg.png' },
  basketball: { label: 'Basketball', icon: '🏀', color: '#e8832a', tint: 'rgba(232,131,42,0.12)', border: 'rgba(232,131,42,0.20)', logo: '/sport-basketball.png', bgImage: '/basketball-bg.png', bgPosition: 'center 80%' },
  football:   { label: 'Football',   icon: '🏈', color: '#4caf7d', tint: 'rgba(76,175,125,0.12)', border: 'rgba(76,175,125,0.20)', logo: '/sport-football.png',   bgImage: '/football-bg.png',   bgPosition: 'center 75%' },
  baseball:   { label: 'Baseball',   icon: '⚾', color: '#e85252', tint: 'rgba(232,82,82,0.12)',  border: 'rgba(232,82,82,0.20)',  logo: '/sport-baseball.png',   bgImage: '/baseball-bg.png' },
};

function sportTint(color)   { return color + '1f'; }  // ≈ 12% alpha
function sportBorder(color) { return color + '33'; }  // ≈ 20% alpha

// Renders the sport's badge logo if available, falling back to the emoji.
// Height controls vertical size; width auto-scales to preserve the shield
// aspect ratio.
function SportLogo({ sport, height = 32 }) {
  const cfg = SPORT_CONFIG[sport];
  if (cfg?.logo) {
    return <img src={cfg.logo} alt={cfg.label} height={height}
      style={{ height, width: 'auto', display: 'block', flexShrink: 0, imageRendering: 'pixelated' }} />;
  }
  return <span style={{ fontSize: height * 0.7, flexShrink: 0 }}>{cfg?.icon || '🏆'}</span>;
}

const DRAFT_LABEL = { snake: 'Contract Snake', auction: 'Auction' };
const STATUS_CONFIG = {
  'pre-draft': { label: 'Pre-Draft',  bg: 'rgba(59,138,230,0.15)',  color: '#6ab0f5' },
  'active':    { label: 'Active',     bg: 'rgba(76,175,125,0.15)',  color: '#6dd4a8' },
  'completed': { label: 'Completed',  bg: 'rgba(150,150,170,0.15)', color: '#9999bb' },
  'setup':     { label: 'Setup',      bg: 'rgba(232,131,42,0.15)',  color: '#f0a868' },
};

function SportBadge({ sport, size = 'sm' }) {
  const cfg = SPORT_CONFIG[sport] || SPORT_CONFIG.hockey;
  const pad = size === 'lg' ? '5px 14px' : '3px 10px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.tint, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: pad,
      ...tokens.typePill,
      ...(size === 'lg' ? { fontSize: '13px' } : null),
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function DraftBadge({ draftType }) {
  const label = DRAFT_LABEL[draftType] || draftType;
  // NOTE: bg/border/color are theme-blind hardcodes from the original
  // primitive — left inline by design until the LeagueView pass, when
  // we'll revisit them in context against the surrounding chrome.
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: 'rgba(255,255,255,0.06)', color: '#9aa3b5',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: '3px 10px',
      ...tokens.typePill,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['setup'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: cfg.bg, color: cfg.color,
      borderRadius: 20, padding: '3px 10px',
      ...tokens.typePillEmphatic,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function StatBox({ label, value, sub, accent, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>{label}</div>
      <div style={{ ...tokens.typeNumericCard, color: accent || t.textPrimary, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>{sub}</div>}
    </div>
  );
}

function Divider({ vertical }) {
  if (vertical) return <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }}></div>;
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0' }}></div>;
}

function Tag({ children, color }) {
  return (
    <span style={{
      ...tokens.typePill,
      padding: '2px 8px',
      borderRadius: 4, background: color ? `${color}22` : 'rgba(255,255,255,0.08)',
      color: color || '#9aa3b5', border: `1px solid ${color ? color + '33' : 'transparent'}`,
    }}>{children}</span>
  );
}

// Leaf primitive: 10px / 700 doesn't fit the type-token system. Counter
// dots are a distinct atomic role; tokenizing it now would be premature.
function ExpiringDot({ count }) {
  if (!count) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: tokens.danger, color: '#fff', borderRadius: 20,
      fontSize: '10px', fontWeight: 700, padding: '1px 6px', minWidth: 18,
    }}>{count}</span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLeagueStats(league) {
  const teams = league.teams || [];
  const paid = teams.filter(t => t.paid).length;
  const withKeepers = teams.filter(t => (t.keepers || []).length > 0).length;
  const rostersLoaded = teams.filter(t => (t.roster || []).length > 0).length;
  const expiring = league.draftType === 'snake'
    ? teams.flatMap(t => (t.keepers || []).filter(k => k.expiresAfter === '2025-26')).length
    : 0;
  const collectedPool = paid * league.buyIn;
  return { paid, withKeepers, rostersLoaded, expiring, collectedPool };
}

// Horizontal-scrolling row with chevron arrows that appear when overflow exists.
// Used for team tabs and other "category strip" UI when wrapping isn't desired.
function HScrollRow({ children, isDark, t: theme, gap = 5 }) {
  const t = theme || makeTheme(isDark);
  const scrollerRef = React.useRef(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  function update() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }
  React.useEffect(() => {
    update();
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => update();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', update); };
  }, [children]);

  function nudge(dir) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.7), behavior: 'smooth' });
  }

  const arrowStyle = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: 26, height: 26, borderRadius: '50%',
    background: isDark ? 'rgba(28,33,48,0.96)' : 'rgba(255,255,255,0.98)',
    border: `1px solid ${t.border}`,
    color: t.textSecondary, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: isDark ? '0 2px 10px rgba(0,0,0,0.4)' : '0 2px 10px rgba(0,0,0,0.12)',
    fontFamily: 'inherit', zIndex: 2, padding: 0,
    transition: 'transform 0.12s, border-color 0.12s',
  };

  const Chevron = ({ dir }) => (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
      <path d={dir === 'left' ? 'M10 3L5 8L10 13' : 'M6 3L11 8L6 13'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div style={{ position: 'relative' }}>
      {canLeft && (
        <button onClick={() => nudge(-1)} aria-label="Scroll left"
          onMouseEnter={e => { e.currentTarget.style.borderColor = t.textSecondary; e.currentTarget.style.transform = 'translateY(-50%) scale(1.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = 'translateY(-50%) scale(1)'; }}
          style={{ ...arrowStyle, left: -12 }}><Chevron dir="left" /></button>
      )}
      {canRight && (
        <button onClick={() => nudge(1)} aria-label="Scroll right"
          onMouseEnter={e => { e.currentTarget.style.borderColor = t.textSecondary; e.currentTarget.style.transform = 'translateY(-50%) scale(1.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.transform = 'translateY(-50%) scale(1)'; }}
          style={{ ...arrowStyle, right: -12 }}><Chevron dir="right" /></button>
      )}
      {/* Edge fades — wider so chevrons don't sit on top of names */}
      {canLeft && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 48, pointerEvents: 'none', background: `linear-gradient(to right, ${t.cardBg} 30%, transparent)`, zIndex: 1 }} />
      )}
      {canRight && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 48, pointerEvents: 'none', background: `linear-gradient(to left, ${t.cardBg} 30%, transparent)`, zIndex: 1 }} />
      )}
      <div ref={scrollerRef} className="__hsr"
        style={{
          display: 'flex', gap, overflowX: 'auto', overflowY: 'hidden',
          scrollbarWidth: 'none', msOverflowStyle: 'none',
          padding: '1px 0',
          paddingLeft: canLeft ? 24 : 0,
          paddingRight: canRight ? 24 : 0,
          transition: 'padding 0.15s',
        }}>
        <style>{`.__hsr::-webkit-scrollbar { display: none; }`}</style>
        {children}
      </div>
    </div>
  );
}

// Hover tooltip. Wraps any element, attaches mouseenter/leave listeners, and
// renders the bubble via a portal so it isn't clipped by overflow:hidden
// parents. Triggers immediately (no browser-default 1s delay), positions
// above the trigger by default. Pass `null` content to disable.
function Tooltip({ children, content, isDark, position = 'top', style = {} }) {
  const [shown, setShown] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });
  const triggerRef = React.useRef(null);

  if (!content) return children;

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        top: position === 'top' ? rect.top : rect.bottom,
        left: rect.left + rect.width / 2,
      });
    }
    setShown(true);
  }

  return (
    <>
      <span ref={triggerRef} style={{ display: 'inline-block', ...style }}
        onMouseEnter={show}
        onMouseLeave={() => setShown(false)}>
        {children}
      </span>
      {shown && createPortal(
        <div style={{
          position: 'fixed',
          top: coords.top, left: coords.left,
          transform: position === 'top' ? 'translate(-50%, calc(-100% - 8px))' : 'translate(-50%, 8px)',
          background: isDark ? '#252a36' : '#2d3340',
          color: '#fff',
          padding: '7px 10px',
          fontSize: 11, fontWeight: 500,
          borderRadius: 6,
          width: 'max-content', maxWidth: 260,
          whiteSpace: 'normal', lineHeight: 1.45,
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          zIndex: 10000,
          pointerEvents: 'none',
          fontFamily: 'inherit',
        }}>
          {content}
        </div>,
        document.body
      )}
    </>
  );
}

Object.assign(window, {
  makeTheme, tokens,
  SPORT_CONFIG, DRAFT_LABEL, STATUS_CONFIG,
  SportBadge, SportLogo, DraftBadge, StatusPill, StatBox, Divider, Tag, ExpiringDot,
  formatDate, getLeagueStats,
  HScrollRow, Tooltip,
  sportTint, sportBorder,
});

export {
  makeTheme, tokens,
  SPORT_CONFIG, DRAFT_LABEL, STATUS_CONFIG,
  SportBadge, SportLogo, DraftBadge, StatusPill, StatBox, Divider, Tag, ExpiringDot,
  formatDate, getLeagueStats,
  HScrollRow, Tooltip,
  sportTint, sportBorder,
};
