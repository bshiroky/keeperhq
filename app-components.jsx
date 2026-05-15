// Shared UI components — exported to window

function makeTheme(isDark) {
  return {
    cardBg:       isDark ? '#1c2130' : '#ffffff',
    cardBg2:      isDark ? '#161a22' : '#ffffff',
    cardShadow:   isDark ? 'none' : '0 1px 3px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.06)',
    border:       isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    divider:      isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    dividerFaint: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    sectionBg:    isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
    noteBg:       isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    progressBg:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    textPrimary:  isDark ? '#e8ecf4' : '#1a1f2e',
    textBody:     isDark ? '#c8d0e0' : '#3a4255',
    textSecondary:isDark ? '#9aa3b5' : '#6b7489',
    textMuted:    isDark ? '#6b7489' : '#8892a4',
    badgeBg:      isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
    badgeColor:   isDark ? '#9aa3b5' : '#6b7489',
  };
}

const SPORT_CONFIG = {
  hockey:     { label: 'Hockey',     icon: '🏒', color: '#3b8ae6', colorDim: 'rgba(59,138,230,0.12)' },
  basketball: { label: 'Basketball', icon: '🏀', color: '#e8832a', colorDim: 'rgba(232,131,42,0.12)' },
  football:   { label: 'Football',   icon: '🏈', color: '#4caf7d', colorDim: 'rgba(76,175,125,0.12)' },
  baseball:   { label: 'Baseball',   icon: '⚾', color: '#e85252', colorDim: 'rgba(232,82,82,0.12)' },
};

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
  const fs = size === 'lg' ? '13px' : '11px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.colorDim, color: cfg.color,
      border: `1px solid ${cfg.color}33`,
      borderRadius: 20, padding: pad, fontSize: fs,
      fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function DraftBadge({ draftType }) {
  const label = DRAFT_LABEL[draftType] || draftType;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: 'rgba(255,255,255,0.06)', color: '#9aa3b5',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: '3px 10px', fontSize: '11px',
      fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap',
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
      borderRadius: 20, padding: '3px 10px', fontSize: '11px',
      fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  );
}

function StatBox({ label, value, sub, accent, isDark }) {
  const labelColor = isDark ? '#6b7489' : '#8892a4';
  const valueColor = isDark ? '#e8ecf4' : '#1a1f2e';
  const subColor = isDark ? '#6b7489' : '#8892a4';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: '11px', color: labelColor, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent || valueColor, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: subColor }}>{sub}</div>}
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
      fontSize: '11px', fontWeight: 600, padding: '2px 8px',
      borderRadius: 4, background: color ? `${color}22` : 'rgba(255,255,255,0.08)',
      color: color || '#9aa3b5', border: `1px solid ${color ? color + '33' : 'transparent'}`,
    }}>{children}</span>
  );
}

function ExpiringDot({ count }) {
  if (!count) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: '#e85252', color: '#fff', borderRadius: 20,
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
  const submitted = teams.filter(t => t.keepersSubmitted).length;
  const expiring = league.draftType === 'snake'
    ? teams.flatMap(t => (t.keepers || []).filter(k => k.expiresAfter === '2025-26')).length
    : 0;
  const collectedPool = paid * league.buyIn;
  return { paid, submitted, expiring, collectedPool };
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

Object.assign(window, {
  makeTheme,
  SPORT_CONFIG, DRAFT_LABEL, STATUS_CONFIG,
  SportBadge, DraftBadge, StatusPill, StatBox, Divider, Tag, ExpiringDot,
  formatDate, getLeagueStats,
  HScrollRow,
});
