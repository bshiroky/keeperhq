import React from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

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
  success:       '#2dd4bf',
  successBg:     'rgba(45,212,191,0.14)',
  successBorder: 'rgba(45,212,191,0.33)',
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

    // ── interaction ───────────────────────────────────────────
    // Focus ring for form controls. Spread onto a focused field/control;
    // theme-invariant (built on tokens.info) but lives here so makeTheme is
    // the single place a surface reaches for it.
    focusRing:    { outline: `2px solid ${tokens.info}`, outlineOffset: '2px' },

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
function sportFill(color)   { return color + '3d'; }  // ≈ 24% alpha — selected-card fill

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
  'active':    { label: 'Active',     bg: tokens.successBg,         color: tokens.success },
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

// ── Trading card (extracted from HomeView so both My-Leagues and the
//    create-league wizard import one source) ───────────────────────────────
// The action engine + flavor + payments helpers drive the card's sticker,
// voice line, and stat block. `state` ('building' | 'ready') is the wizard
// live-preview mode; when undefined (My-Leagues) the original behavior holds.

const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const CARD_STYLES = `
  @keyframes kh-shine { 0% { transform: translateX(-150%) skewX(-22deg); } 100% { transform: translateX(420%) skewX(-22deg); } }
  @keyframes kh-bob   { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes kh-bob-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
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
  .kh-tcard-mascot--bob { animation: kh-bob-slow 2.4s ease-in-out infinite; }

  .kh-tcard-sticker { animation: kh-pop 0.28s cubic-bezier(.2,.8,.2,1); }

  .kh-add-slot { transition: border-color 0.18s, color 0.18s; }
`;

// ── Save-acknowledgement motion (audit X6) ─────────────────────────────────
// Ambient feedback for state changes — smooth 180ms fades on red↔green / on↔off
// toggles (Fix 1), and a "Saved" toast on deliberate card saves (SaveToast,
// below). All motion is behind a prefers-reduced-motion guard: toggles fall
// back to instant swaps; the toast appears/dismisses instantly with no slide.
// Inject MOTION_STYLES once on any surface that uses these classes.
const MOTION_STYLES = `
  .kh-toast { opacity: 0; }
  .kh-toast.kh-toast--in { opacity: 1; }
  @media (prefers-reduced-motion: no-preference) {
    .kh-state-fade { transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease; }
    .kh-toggle-knob { transition: left 180ms ease; }
    .kh-toast { transform: translateY(8px); transition: opacity 220ms ease, transform 220ms ease; }
    .kh-toast.kh-toast--in { transform: translateY(0); }
  }
`;

// "Saved" toast — fires only on deliberate EditableCard/Prize-Structure saves.
// `trigger` is a monotonically-changing value (e.g. Date.now()) bumped by the
// parent on save; each bump shows the pill for ~2s then unmounts. Fade/slide
// live in MOTION_STYLES under the reduced-motion guard; opacity 0↔1 is set
// outside it so reduced-motion users get an instant appear/dismiss.
function SaveToast({ trigger, isDark, message = 'Saved' }) {
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!trigger) return;
    setMounted(true);
    const raf = requestAnimationFrame(() => setVisible(true)); // fade in from opacity 0
    const startHide = setTimeout(() => setVisible(false), 2000);
    const unmount = setTimeout(() => setMounted(false), 2350);
    return () => { cancelAnimationFrame(raf); clearTimeout(startHide); clearTimeout(unmount); };
  }, [trigger]);

  if (!mounted) return null;

  return createPortal(
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: tokens.spaceXl, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 2000 }}>
      <div className={`kh-toast${visible ? ' kh-toast--in' : ''}`} role="status" style={{
        display: 'inline-flex', alignItems: 'center', gap: tokens.spaceXs,
        background: isDark ? '#2a3142' : '#1a1f2e', color: '#fff',
        padding: '10px 16px', borderRadius: tokens.radiusPill,
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        ...tokens.typeBody, fontWeight: 600,
      }}>
        <Check size={15} strokeWidth={2.5} color={tokens.success} />
        {message}
      </div>
    </div>,
    document.body
  );
}

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
    return `${league.contractYears}-yr contracts`;
  }
  if (league.draftType === 'auction' && league.auctionRules?.costIncreasePerYear) {
    return `+$${league.auctionRules.costIncreasePerYear}/yr keeper cost`;
  }
  return null;
}

// Commissioner-voice copy for the LeagueView HeaderAnchor bubble.
// Narrower-scope cousin of flavorLine — the home page says "4 unpaid across
// 3 leagues"; the league page says "3 of 12 paid — Linus is your laggard".
// Pure function over `league` + the result of nextAction(league).
function leagueFlavor(league, action) {
  const teams = league.teams || [];
  const teamCount = league.teamCount || teams.length;
  const teamsWithKeepers = teams.filter(tm => (tm.keepers || []).length > 0).length;
  const paid = teams.filter(tm => tm.paid).length;
  const expiring = getLeagueStats(league).expiring || 0;

  if (teamCount === 0) return "Fresh league. Add some teams in Settings.";
  if (league.status === 'setup')     return "Fresh league. Open Settings and wire it up.";
  if (league.status === 'active')    return "Season's running. Most of the action's on Yahoo now.";
  if (league.status === 'completed') return "Season's done. Time to roll it forward.";

  if (action.kind === 'action') {
    if (action.label && action.label.startsWith('Upload rosters')) {
      const rostersLoaded = teams.filter(tm => (tm.roster || []).length > 0).length;
      if (rostersLoaded === 0) return "Rosters first — can't verify keepers without 'em.";
      return `${rostersLoaded} of ${teamCount} rosters loaded — finish the import and keepers come next.`;
    }
    if (action.label === "Import last year's draft") return "Last year's draft isn't in yet — need it for keeper costs.";
    if (action.label === 'Set draft date')           return "Everything's in. Just pick a draft date.";
  }

  if (action.kind === 'waiting') {
    if (teamsWithKeepers === 0) return "Pre-draft. Nobody's declared yet — nudge the league.";
    const laggard = laggardName(league) || 'someone';
    if (teamsWithKeepers === teamCount - 1) return `One more — ${laggard} hasn't declared.`;
    return `${teamsWithKeepers} of ${teamCount} keepers in — ${laggard} is your laggard.`;
  }

  // action.kind === 'ready' — keepers in, draft date set
  if (paid < teamCount) {
    if (paid === 0)              return "Keepers locked. Dues haven't started — Venmo time.";
    if (paid === teamCount - 1)  return `One team to go — ${soleUnpaidName(league) || 'one team'} owes.`;
    return `Keepers locked. ${paid} of ${teamCount} paid — collect dues before draft day.`;
  }
  if (league.draftType === 'snake' && expiring > 0) {
    return `Ready for draft. ${expiring} contracts head back to the pool.`;
  }
  return "Locked and loaded. Bring on draft day.";
}

function leagueVoiceColor(league, action) {
  if (league.status === 'active' || league.status === 'completed') return tokens.info;
  const teams = league.teams || [];
  const teamCount = league.teamCount || teams.length;
  const paid = teams.filter(tm => tm.paid).length;
  if (action.kind === 'ready' && paid === teamCount && league.draftDate) return tokens.success;
  return tokens.warning;
}

// Alphabetically-first team without keepers — the "laggard" the bubble names.
function laggardName(league) {
  const teams = (league.teams || []).filter(tm => !(tm.keepers || []).length);
  if (!teams.length) return null;
  const sorted = [...teams].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return sorted[0].name || null;
}

// Only meaningful when exactly one team is unpaid — names them in the bubble.
function soleUnpaidName(league) {
  const unpaid = (league.teams || []).filter(tm => !tm.paid);
  if (unpaid.length !== 1) return null;
  return unpaid[0].name || null;
}

function TradingCard({ league, onClick, isDark, state }) {
  const sport  = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const t      = makeTheme(isDark);
  const wizard = state === 'building' || state === 'ready';
  const action = state === 'building' ? { kind: 'action', label: 'Building…' }
               : state === 'ready'    ? { kind: 'ready',  label: 'Ready for draft' }
               :                        nextAction(league);
  const pay    = paymentsOf(league);
  const mod    = ruleMod(league);
  const flavor = state === 'building' ? "Fresh league. Let's wire it up."
               : state === 'ready'    ? "Locked and loaded. Bring on draft day."
               :                        flavorLine(league, action);
  const totalPool = (league.totalPool || pay.potential).toLocaleString();

  const stickerColors = {
    action:  { bg: tokens.warning, fg: '#fff' },
    waiting: { bg: isDark ? '#2a3142' : '#dfe4ee', fg: isDark ? '#c8d0e0' : '#3a4255' },
    ready:   { bg: tokens.success, fg: '#0f2018' },
  }[action.kind];

  const moodColor = action.kind === 'action' ? tokens.warning
                  : action.kind === 'ready'  ? tokens.success
                  :                            sport.color;

  const hasName  = !!(league.name && String(league.name).trim());
  const hasSport = !!league.sport;
  const metaPill = wizard
    ? (mod ? `${mod} · ${league.keeperSlots || 0} keepers` : 'Keeper league · 0 keepers')
    : `${mod || 'Keeper league'} · ${league.keeperSlots || 0} keepers`;
  const stats = wizard
    ? [
        { label: 'Teams', val: league.teamCount || '—', color: t.textPrimary },
        { label: 'Paid',  val: `0/${league.teamCount || 0}`, color: t.textPrimary },
        { label: 'Pool',  val: '—', color: t.textMuted },
      ]
    : [
        { label: 'Teams', val: pay.teamCount, color: t.textPrimary },
        { label: 'Paid',  val: `${pay.paid}/${pay.teamCount}`,
          color: pay.complete ? tokens.success : pay.behind ? tokens.warning : t.textPrimary },
        { label: 'Pool',  val: `$${totalPool}`, color: t.textPrimary },
      ];

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
      <div style={{
        position: 'relative',
        backgroundColor: sport.color,
        backgroundImage: `url(${sport.bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: sport.bgPosition || 'center',
        backgroundRepeat: 'no-repeat',
        aspectRatio: '5 / 2',
        overflow: 'hidden',
      }}>
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

        <div style={{
          position: 'absolute', right: wizard ? -6 : -8, bottom: wizard ? -12 : -16,
          width: wizard ? 116 : 160, height: wizard ? 122 : 170,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 2,
        }}>
          <img className={`kh-tcard-mascot${wizard ? ' kh-tcard-mascot--bob' : ''}`} src={sport.logo} alt=""
            style={{
              height: wizard ? 108 : 152, width: 'auto', imageRendering: 'pixelated', display: 'block',
              filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.25))',
            }} />
        </div>

        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: GRAIN_SVG,
          opacity: 0.18, mixBlendMode: 'overlay',
          pointerEvents: 'none', zIndex: 1,
        }} />

        <div className="kh-tcard-shine" style={{ zIndex: 4 }} />
      </div>

      <div style={{ padding: `${tokens.spaceMd}px`, position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: GRAIN_SVG,
          opacity: isDark ? 0.05 : 0.04, mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative' }}>
          <div style={{
            ...tokens.typeHeadingHero, lineHeight: 1.1,
            color: hasName ? t.textPrimary : t.textMuted,
            fontStyle: hasName ? 'normal' : 'italic',
          }}>
            {hasName ? league.name : 'league name'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, marginTop: tokens.space2xs + 2, flexWrap: 'wrap' }}>
            {hasSport ? (
              <SportBadge sport={league.sport} />
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                border: `1px dashed ${t.border}`, color: t.textMuted,
                borderRadius: 20, padding: '3px 10px',
                ...tokens.typePill, fontStyle: 'italic', whiteSpace: 'nowrap',
              }}>sport</span>
            )}
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              background: t.badgeBg, color: t.textSecondary,
              border: `1px solid ${t.border}`,
              borderRadius: 20, padding: '3px 10px',
              ...tokens.typePill,
              whiteSpace: 'nowrap',
            }}>
              {metaPill}
            </span>
          </div>

          <div style={{
            marginTop: tokens.spaceSm, marginBottom: tokens.space2xs,
            paddingLeft: tokens.spaceSm - 2,
            borderLeft: `2px solid ${moodColor}`,
            color: t.textBody,
            ...tokens.typeBodyMeta, fontStyle: 'italic', lineHeight: 1.45,
          }}>
            {flavor}
          </div>

          <div style={{
            marginTop: tokens.spaceSm,
            paddingTop: tokens.spaceSm,
            borderTop: `1px dashed ${t.border}`,
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
            fontFeatureSettings: '"tnum"',
          }}>
            {stats.map(s => (
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

// ── Form primitives — one recipe per gesture ──────────────────────────────
// Canonical input recipe, extracted from KeeperEditModal (the canonical field
// per CLAUDE.md) folded with the create-league wizard's local Input/Select.
// A bordered wrapper carries the field background / border / radius / focus
// ring; the inner control is transparent. `size="sm"` is the denser 13px
// form used inside tabs (PayoutsTab); the default 14px form matches the modal
// and wizard. The field background (#f7f9fc / #161a22) is the established
// input color across all four old recipes; it lives in one place now (here).
function fieldBg(isDark) { return isDark ? '#161a22' : '#f7f9fc'; }

function fieldWrapStyle(t, isDark, sm, focused, extra) {
  return {
    display: 'flex', alignItems: 'stretch', boxSizing: 'border-box',
    background: fieldBg(isDark),
    border: `1px solid ${t.border}`,
    borderRadius: sm ? tokens.radiusSm : tokens.radiusMd,
    overflow: 'hidden',
    ...(focused ? t.focusRing : null),
    ...extra,
  };
}

function fieldInputStyle(t, sm, extra) {
  return {
    flex: 1, minWidth: 0, boxSizing: 'border-box',
    background: 'transparent', border: 'none', outline: 'none',
    padding: sm ? '8px 10px' : '8px 12px',
    fontSize: sm ? 13 : 14,
    color: t.textPrimary, fontFamily: 'inherit',
    ...extra,
  };
}

function fieldAffix(t, sm, side) {
  return {
    display: 'inline-flex', alignItems: 'center', alignSelf: 'stretch',
    padding: sm ? '0 8px' : '0 10px',
    [side === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${t.border}`,
    background: t.sectionBg, color: t.textMuted,
    fontWeight: 400, fontSize: sm ? 13 : 14, whiteSpace: 'nowrap',
  };
}

// Text field. Standard <input> props (placeholder, autoFocus, maxLength, …)
// pass through via ...rest. onChange is event-based: onChange(e).
function Input({ value, onChange, onBlur, onFocus, size, width, isDark, style, ...rest }) {
  const t = makeTheme(isDark);
  const sm = size === 'sm';
  const [focused, setFocused] = React.useState(false);
  const filled = value !== '' && value != null;
  return (
    <div style={fieldWrapStyle(t, isDark, sm, focused, { width })}>
      <input
        type="text" value={value} onChange={onChange}
        onFocus={e => { setFocused(true); onFocus && onFocus(e); }}
        onBlur={e => { setFocused(false); onBlur && onBlur(e); }}
        {...rest}
        style={fieldInputStyle(t, sm, { fontWeight: filled ? (sm ? 700 : 600) : 400, ...style })}
      />
    </div>
  );
}

// Numeric field. Supports an optional bordered `prefix` slot (e.g. "$", "+$")
// and a trailing gray `suffix` (e.g. "keepers") — the "bold value, muted unit"
// pattern. `step` (and min/max) pass straight through to the native input.
// onChange is event-based: onChange(e).
function NumberInput({ value, onChange, onBlur, onFocus, prefix, suffix, size, width, isDark, min, max, step, align, style, ...rest }) {
  const t = makeTheme(isDark);
  const sm = size === 'sm';
  const [focused, setFocused] = React.useState(false);
  const filled = value !== '' && value != null;
  return (
    <div style={fieldWrapStyle(t, isDark, sm, focused, { width })}>
      {prefix != null && <span style={fieldAffix(t, sm, 'left')}>{prefix}</span>}
      <input
        type="number" value={value} min={min} max={max} step={step} onChange={onChange}
        onFocus={e => { setFocused(true); onFocus && onFocus(e); }}
        onBlur={e => { setFocused(false); onBlur && onBlur(e); }}
        {...rest}
        style={fieldInputStyle(t, sm, { textAlign: align || 'left', fontWeight: filled ? (sm ? 700 : 600) : 400, ...style })}
      />
      {suffix != null && (
        <span style={{ alignSelf: 'center', padding: sm ? '0 10px 0 2px' : '0 12px 0 2px', color: t.textMuted, fontWeight: 400, fontSize: sm ? 13 : 14, whiteSpace: 'nowrap' }}>{suffix}</span>
      )}
    </div>
  );
}

// Styled select. A button + portal popover (so the menu escapes any
// overflow:hidden ancestor — e.g. the wizard card) showing a bold value with
// an optional muted `suffix` ("years", "players"). `options` accepts plain
// values or {value, label} objects; onChange is value-based: onChange(value).
// `placeholder` shows (muted) when value matches no option — used for the
// "+ Add place…" action picker that resets to "".
function Select({ value, onChange, options, suffix, placeholder, width, isDark, disabled }) {
  const t = makeTheme(isDark);
  const [open, setOpen] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  const opts = (options || []).map(o => (o != null && typeof o === 'object') ? o : { value: o, label: String(o) });
  const selected = opts.find(o => String(o.value) === String(value));

  function toggle() {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
    setOpen(true);
  }

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onMove() { setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative', width, boxSizing: 'border-box' }}>
      <button ref={btnRef} type="button" onClick={toggle} disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: '100%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          background: t.cardBg, border: `1px solid ${t.border}`,
          borderRadius: tokens.radiusSm, padding: '8px 10px',
          cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
          ...(focused ? t.focusRing : null),
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: selected ? 700 : 400, color: selected ? t.textPrimary : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.label : (placeholder ?? '')}
          </span>
          {suffix && selected && <span style={{ fontSize: 13, fontWeight: 400, color: t.textMuted }}>{suffix}</span>}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 1L5 5L9 1" stroke={t.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
          maxHeight: 220, overflowY: 'auto', boxSizing: 'border-box',
          background: t.cardBg, border: `1px solid ${t.border}`,
          borderRadius: tokens.radiusSm, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          zIndex: 10000, padding: 4,
        }}>
          {opts.map(o => {
            const sel = String(o.value) === String(value);
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: sel ? t.sectionBg : 'transparent', border: 'none', borderRadius: 4,
                  padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: sel ? 700 : 500, color: t.textPrimary,
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = t.sectionBg; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                {o.label}{suffix ? ` ${suffix}` : ''}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// Darken a #rrggbb hex toward black by `amt` (0–1). Used for Button's
// hover/active fill darkening (a darker shade of the accent on press).
function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// The button. One recipe, three variants, two sizes.
//   primary     — flat solid fill CTA. Fill defaults to tokens.info; pass
//                 `accent` for a sport color. Presence comes from fill + weight.
//   secondary   — neutral outline (Cancel, Edit, dismiss).
//   destructive — flat solid fill in tokens.danger (Reset, delete confirm).
// Filled variants darken the fill on interaction — shade(fill, 0.08) on hover,
// shade(fill, 0.15) on active — with no movement or shadow. Focus uses the
// shared focusRing token. Standard <button> props pass through.
function Button({ variant = 'primary', size = 'md', isDark, accent, disabled, children, style, type = 'button',
  onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, onFocus, onBlur, ...rest }) {
  const t = makeTheme(isDark);
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const sm = size === 'sm';
  const filled = variant === 'primary' || variant === 'destructive';
  const fill = variant === 'destructive' ? tokens.danger : (accent || tokens.info);

  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxSizing: 'border-box', whiteSpace: 'nowrap', fontFamily: 'inherit',
    borderRadius: tokens.radiusMd,
    padding: sm ? '7px 14px' : '10px 20px',
    fontSize: sm ? 12 : 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'background 0.12s ease, border-color 0.12s ease',
    ...(focus ? t.focusRing : null),
  };

  let variantStyle;
  if (filled) {
    const bg = disabled ? fill : (active ? shade(fill, 0.15) : (hover ? shade(fill, 0.08) : fill));
    variantStyle = {
      background: bg, color: '#fff', border: 'none', fontWeight: 700,
    };
  } else {
    variantStyle = {
      background: hover && !disabled ? t.sectionBg : 'transparent',
      color: t.textSecondary, fontWeight: 600,
      border: `1px solid ${hover && !disabled ? t.textMuted : t.border}`,
    };
  }

  return (
    <button type={type} disabled={disabled}
      onMouseEnter={e => { setHover(true); onMouseEnter && onMouseEnter(e); }}
      onMouseLeave={e => { setHover(false); setActive(false); onMouseLeave && onMouseLeave(e); }}
      onMouseDown={e => { setActive(true); onMouseDown && onMouseDown(e); }}
      onMouseUp={e => { setActive(false); onMouseUp && onMouseUp(e); }}
      onFocus={e => { setFocus(true); onFocus && onFocus(e); }}
      onBlur={e => { setFocus(false); onBlur && onBlur(e); }}
      {...rest}
      style={{ ...base, ...variantStyle, ...style }}>
      {children}
    </button>
  );
}

Object.assign(window, {
  makeTheme, tokens,
  Input, Select, NumberInput, Button,
  SPORT_CONFIG, DRAFT_LABEL, STATUS_CONFIG,
  SportBadge, SportLogo, DraftBadge, StatusPill, StatBox, Divider, Tag, ExpiringDot,
  formatDate, getLeagueStats,
  HScrollRow, Tooltip,
  sportTint, sportBorder, sportFill,
  TradingCard, paymentsOf, GRAIN_SVG, CARD_STYLES,
  nextAction, leagueFlavor, leagueVoiceColor,
});

export {
  makeTheme, tokens,
  Input, Select, NumberInput, Button,
  SPORT_CONFIG, DRAFT_LABEL, STATUS_CONFIG,
  SportBadge, SportLogo, DraftBadge, StatusPill, StatBox, Divider, Tag, ExpiringDot,
  formatDate, getLeagueStats,
  HScrollRow, Tooltip,
  sportTint, sportBorder, sportFill,
  TradingCard, paymentsOf, GRAIN_SVG, CARD_STYLES,
  MOTION_STYLES, SaveToast,
  nextAction, leagueFlavor, leagueVoiceColor,
};
