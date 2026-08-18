import React from 'react';
import { useParams } from 'react-router-dom';
import { Loader, Search, Check } from 'lucide-react';
import { makeTheme, tokens, SPORT_CONFIG, usePlayerMap } from './components.jsx';
import { normalizeName } from './lib/players.js';
import { hasTerm, termOf, termLabel, isAuctionCost, keeperCostModelOf, COST_LABEL } from './lib/keeperRules.js';
import {
  fetchSharedLeague, buildSharedRows, statCategoriesFor, formatStat, sortRowsDefault,
  sharedFilterChips, costColumnLabel, OWNER_COLUMN_LABEL, keepersFirst,
} from './lib/sharedLeague.js';

// ── Shared league page (/l/:token) ─────────────────────────────────────────
// Read-only, public, mobile-first — the member-facing cousin of the
// commissioner app. No login, no accounts, no write path. Renders identically
// for logged-out and logged-in visitors; data arrives through the
// get_shared_league RPC (anon-executable projection), never the leagues table.

// Composed type styles for the two handoff specs without an exact token match.
// Weight-composition on an existing size token is the sanctioned move (the
// handoff itself says "try typeBody at 700 first"); the countdown's 15px has
// no size token — tokenize it if a second surface ever needs 15/800.
const ROW_TITLE = { ...tokens.typeBody, fontWeight: 700 };
const LEAGUE_NAME_TYPE = { ...tokens.typeNumericInline, fontWeight: 800 };
const COUNTDOWN_TYPE = { fontSize: 15, fontWeight: 800 };

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

const SHARE_STYLES = `
  @keyframes kh-spin { to { transform: rotate(360deg); } }
  .kh-spin { animation: kh-spin 1s linear infinite; transform-origin: center; }
  .kh-share-rail-scroll { scrollbar-width: none; -ms-overflow-style: none; }
  .kh-share-rail-scroll::-webkit-scrollbar { display: none; }
  @media print {
    .kh-share-rail, .kh-share-search { display: none !important; }
    .kh-share-row, .kh-share-tr { break-inside: avoid; }
    .kh-share-pill-wrap { position: static !important; height: auto !important; visibility: visible !important; }
  }
`;

function useMediaQuery(query) {
  const [matches, setMatches] = React.useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Live countdown off league.keeperDeadline (date string) + the commissioner-
// set league.keeperDeadlineTime ('HH:MM', local). Date-only deadlines (older
// data) are interpreted as 11:59 PM, so the displayed time is always the real
// deadline moment. Days granularity when far out; inside the final 48h it
// switches to hours/minutes and ticks live. Past the moment it reports locked.
function useCountdown(deadline, time) {
  const hhmm = time || '23:59';
  const target = deadline ? new Date(`${deadline}T${hhmm}:59`).getTime() : null;
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    if (!target) return;
    const msLeft = target - Date.now();
    if (msLeft <= 0) return; // locked — nothing left to tick
    const interval = msLeft < 48 * HOUR_MS ? 30 * 1000 : HOUR_MS;
    const id = setInterval(force, interval);
    return () => clearInterval(id);
  });
  if (!target) return null;
  const msLeft = target - Date.now();
  const locked = msLeft <= 0;
  const d = new Date(deadline + 'T12:00:00');
  const dateShort = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const [th, tm] = hhmm.split(':').map(Number);
  const timeLabel = new Date(2000, 0, 1, th || 0, tm || 0)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  let label = null;
  if (!locked) {
    if (msLeft >= 48 * HOUR_MS) {
      const days = Math.ceil(msLeft / DAY_MS);
      label = `${days} day${days === 1 ? '' : 's'}`;
    } else {
      const h = Math.floor(msLeft / HOUR_MS);
      const m = Math.floor((msLeft % HOUR_MS) / (60 * 1000));
      label = `${h}h ${m}m`;
    }
  }
  return { locked, label, dateShort, dateLabel: `${dateShort} · ${timeLabel}` };
}

// ── Small pieces ────────────────────────────────────────────────────────────

function SharedHeader({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <header style={{ background: t.cardBg2, borderBottom: `1px solid ${t.border}` }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', height: 56, padding: `0 ${tokens.spaceLg}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceMd,
      }}>
        <span style={{ ...tokens.typeHeadingPage, letterSpacing: '0.02em', color: t.textPrimary, lineHeight: 1 }}>
          KEEPER<span style={{ color: tokens.brand, marginLeft: 3 }}>HQ</span>
        </span>
        <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, whiteSpace: 'nowrap' }}>Shared league page</span>
      </div>
    </header>
  );
}

function FooterMark({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: `${tokens.space2xl}px 0 ${tokens.spaceXl}px` }}>
      <img src="/keeper-hq-logo.png" alt="" height={16}
        style={{ height: 16, width: 'auto', opacity: 0.6, imageRendering: 'pixelated', display: 'block' }} />
      <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>Powered by KeeperHQ</span>
    </div>
  );
}

// 34px circle: real NHL headshot when the directory has one, otherwise a
// quiet CSS silhouette (no initials, no text). The silhouette renders under
// the img so a broken headshot URL falls back to it automatically.
function SharedHeadshot({ rec, isDark, size = 34 }) {
  const t = makeTheme(isDark);
  const url = rec?.headshot;
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
      background: t.sectionBg, border: `1px solid ${t.border}`,
      position: 'relative', display: 'block', boxSizing: 'border-box',
    }}>
      <span aria-hidden style={{ position: 'absolute', top: '16%', left: '50%', transform: 'translateX(-50%)', width: '36%', height: '36%', borderRadius: '50%', background: t.badgeBg }} />
      <span aria-hidden style={{ position: 'absolute', bottom: '-24%', left: '50%', transform: 'translateX(-50%)', width: '80%', height: '60%', borderRadius: '50%', background: t.badgeBg }} />
      {url && (
        <img src={url} alt="" width={size} height={size} loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { e.currentTarget.style.display = 'none'; }} />
      )}
    </span>
  );
}

// Primary position only — Yahoo multi-position strings (C/LW) show their
// first segment; bench/utility slot codes aren't positions and are dropped.
function displayPos(row, rec) {
  const raw = rec?.pos || row.pos || '';
  const first = String(raw).split(/[/,]/)[0].trim();
  if (!first || ['BN', 'UTIL', 'IR', 'IR+'].includes(first.toUpperCase())) return null;
  return { L: 'LW', R: 'RW' }[first] || first;
}

function fmtSvPct(v) {
  return Number(v || 0).toFixed(3).replace(/^0\./, '.');
}

function statLineFor(rec) {
  if (!rec) return null;
  if (rec.kind === 'goalie') {
    return `${rec.team} · ${rec.w ?? 0}W · ${Number(rec.gaa || 0).toFixed(2)} GAA · ${fmtSvPct(rec.svPct)} SV%`;
  }
  return `${rec.team} · ${rec.gp ?? 0} GP · ${rec.g ?? 0}G · ${rec.a ?? 0}A · ${rec.p ?? 0} PTS`;
}

// Contract text — compact, value-only (display-only; the underlying kinds are
// unchanged). Contracted players show just "Y1/3"; the final year keeps the
// red treatment with a short "Final yr" label; uncontracted players show a
// muted "—" (no fake year); expired keeps its label so it can't be misread as
// final-year in mixed lists. Auction leagues show the keep cost instead.
function ContractText({ row, league, isDark }) {
  const t = makeTheme(isDark);
  if (isAuctionCost(league)) {
    // "Keep for $X" stays the headline; the drafted price (last year's
    // auction price from the imported draft) rides along as a quiet second
    // line so members see both — same treatment on mobile rows and the
    // desktop Contract column.
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span style={{ ...tokens.typeBody, fontWeight: 800, color: tokens.warning, whiteSpace: 'nowrap' }}>
          Keep for ${row.cost ?? 0}
        </span>
        {/* With a term as well as a price, the term rides the second line. */}
        {hasTerm(league) && row.kind !== 'rostered' && (
          <span style={{ ...tokens.typeStatMeta, color: row.final ? tokens.danger : t.textMuted, whiteSpace: 'nowrap' }}>
            {row.final ? 'Final yr ' : ''}{`Y${row.year}/${row.len}`}
          </span>
        )}
        {row.draftedCost != null && (
          <span style={{ ...tokens.typeStatMeta, color: t.textMuted, whiteSpace: 'nowrap' }}>
            Drafted ${row.draftedCost}
          </span>
        )}
      </span>
    );
  }
  if (row.kind === 'rostered') {
    return <span style={{ ...tokens.typePill, color: t.textMuted }}>—</span>;
  }
  // No dollar cost and no term: the slot itself is the whole cost, so there
  // is no per-player number to show.
  if (!hasTerm(league)) {
    return <span style={{ ...tokens.typePill, color: t.textMuted }}>{row.kind === 'keeper' ? 'Kept' : '—'}</span>;
  }
  let label = null, color = tokens.info;
  if (row.kind === 'expired') { label = 'Expired'; color = tokens.danger; }
  else if (row.final) { label = 'Final yr'; color = tokens.danger; }
  return (
    <span style={{ ...tokens.typePill, color, whiteSpace: 'nowrap' }}>
      {label && <>{label} </>}<span style={{ fontWeight: 800 }}>{`Y${row.year}/${row.len}`}</span>
    </span>
  );
}

// "Kept by" pill — the OWNER NAME only; color carries the state, and a check
// glyph marks a declared keeper in place (the same in-list marking the
// commissioner's Eligible Pool uses for a selected player).
// Keeper-accent tint (blue snake / orange auction) for declared keepers AND
// players under contract; a readable neutral grey for rostered-but-
// uncontracted players; "was {team}" keeps the Expired danger tint. On a
// team-filter view the name drops (it's the team's own page): declared
// keepers show a plain "Keeper" pill, eligible rows show no pill at all —
// the row's highlight already says which is which. A declared keeper's pill
// carries a check, the same in-place marking the commissioner's Eligible Pool
// uses for a selected player.
function RowStatusPill({ row, league, hideTeam, isDark, maxWidth }) {
  const t = makeTheme(isDark);
  const auction = isAuctionCost(league);
  const accent = auction
    ? { bg: tokens.warningBg, border: tokens.warningBorder, color: tokens.warning }
    : { bg: tokens.infoBg, border: tokens.infoBorder, color: tokens.info };
  let bg, border, color, label;
  if (row.kind === 'expired') {
    bg = tokens.dangerBg; border = tokens.dangerBorder; color = tokens.danger;
    label = `was ${row.teamName}`;
  } else if (hideTeam) {
    if (row.kind !== 'keeper') return null;
    ({ bg, border, color } = accent);
    label = 'Keeper';
  } else if (row.kind === 'keeper' || row.kind === 'contract') {
    ({ bg, border, color } = accent);
    label = row.teamName;
  } else {
    bg = t.badgeBg; border = t.border; color = t.textSecondary;
    label = row.teamName;
  }
  const kept = row.kind === 'keeper';
  return (
    <span style={{
      ...tokens.typePill, background: bg, color, border: `1px solid ${border}`,
      borderRadius: tokens.radiusPill, padding: '2px 9px',
      whiteSpace: 'nowrap', maxWidth: maxWidth ?? STATUS_W - 28, overflow: 'hidden', textOverflow: 'ellipsis',
      boxSizing: 'border-box',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {kept && <Check size={11} strokeWidth={3} style={{ flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  );
}

// ── Mobile / list row ───────────────────────────────────────────────────────
// Two deliberate layouts, not one layout minus content:
// - Hockey (directory sport): headshot + two-line card (name over stat line),
//   status stacked right — the original handoff row.
// - Stats-less leagues (no directory): a COMPACT single-line row — name+pos
//   left, price/status inline right, tighter padding, no reserved headshot or
//   stat-line space. "Other sports look intentional, not broken."
function PlayerRow({ row, league, rec, isDark, hideTeam, kept }) {
  const t = makeTheme(isDark);
  const isHockey = league.sport === 'hockey';
  const expired = row.kind === 'expired';
  const pos = displayPos(row, rec);
  const statLine = isHockey ? statLineFor(rec) : null;
  if (!isHockey) {
    return (
      <div className="kh-share-row" style={{
        display: 'flex', alignItems: 'center', gap: tokens.spaceSm,
        background: kept ? t.successBg : expired ? t.dangerBg : t.cardBg,
        border: `1px solid ${kept ? t.successBorder : expired ? t.dangerBorder : t.border}`,
        borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`,
        boxSizing: 'border-box',
      }}>
        <span style={{ ...ROW_TITLE, color: expired ? t.danger : t.textPrimary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.player}
          {pos && <span style={{ ...tokens.typeStatMeta, color: t.textMuted, marginLeft: 6, fontWeight: 500 }}>{pos}</span>}
        </span>
        <ContractText row={row} league={league} isDark={isDark} />
        <RowStatusPill row={row} league={league} hideTeam={hideTeam} isDark={isDark} maxWidth={150} />
      </div>
    );
  }
  return (
    <div className="kh-share-row" style={{
      display: 'flex', alignItems: 'center', gap: tokens.spaceSm,
      background: kept ? t.successBg : expired ? t.dangerBg : t.cardBg,
      border: `1px solid ${kept ? t.successBorder : expired ? t.dangerBorder : t.border}`,
      borderRadius: tokens.radiusLg, padding: `${tokens.spaceSm}px`,
      minHeight: 58, boxSizing: 'border-box',
    }}>
      {isHockey && <SharedHeadshot rec={rec} isDark={isDark} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ ...ROW_TITLE, color: expired ? t.danger : t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.player}
          </span>
          {pos && <span style={{ ...tokens.typeStatMeta, color: t.textMuted, flexShrink: 0 }}>{pos}</span>}
        </div>
        {statLine && (
          <div style={{ ...tokens.typeStatMeta, color: t.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {statLine}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, minWidth: 0 }}>
        <ContractText row={row} league={league} isDark={isDark} />
        <RowStatusPill row={row} league={league} hideTeam={hideTeam} isDark={isDark} maxWidth={190} />
      </div>
    </div>
  );
}

// Search bar for the list it filters. Rendered as the table card's header
// strip (and directly above the mobile list), never as a floating control
// between the chip rail and the table.
function ListSearch({ value, onChange, count, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div className="kh-share-search" style={{
      display: 'flex', alignItems: 'center', gap: tokens.spaceSm,
      padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`,
      background: t.sectionBg, borderBottom: `1px solid ${t.divider}`,
    }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: 320 }}>
        <Search size={14} strokeWidth={2} color={t.textMuted}
          style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="Search players…"
          aria-label="Search players"
          style={{
            width: '100%', boxSizing: 'border-box', background: t.cardBg,
            border: `1px solid ${t.border}`, borderRadius: tokens.radiusPill,
            padding: '6px 12px 6px 29px', ...tokens.typeBody, color: t.textPrimary,
            fontFamily: 'inherit', outline: 'none',
          }} />
      </div>
      <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
        {count} player{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function RowList({ rows, league, playerMap, isDark, hideTeam }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceXs }}>
      {rows.map(row => (
        <PlayerRow key={`${row.teamId}-${row.player}`} row={row} league={league}
          rec={playerMap?.get(normalizeName(row.player))} isDark={isDark}
          hideTeam={hideTeam} kept={row.kind === 'keeper'} />
      ))}
    </div>
  );
}

// ── Desktop stat table (hockey, ≥1024px) ───────────────────────────────────
// The CompactKeeperGrid sticky/scroll/snap mechanics, re-aimed: Player pinned
// left, Contract + Status pinned right, stat columns scroll-snapping between
// them on native horizontal scroll. The scroll affordance is a pair of
// edge-fade gradients (NHL.com stats-table style) that appear on whichever
// side has clipped columns — no floating buttons over row content (the old
// chevrons overlapped rows). Explicit pixel table width in scroll mode
// (tableLayout: fixed truncation), per-td row dividers (a <tr> border
// doesn't paint under borderCollapse: separate).
// Contract/Status are content-fit now that the wordy labels are gone
// ("On contract Y1/3" → "Y1/3", "Keeper · Ben" → "Ben") — the freed width
// goes to the stat group, so rows end flush instead of collecting dead air.
const PLAYER_W = 230;
const STAT_W = 64;
const CONTRACT_W = 100;
const STATUS_W = 116;

function StatTable({ title, rows, cats, league, playerMap, isDark, hideTeam, toolbar, defaultSortKey }) {
  const t = makeTheme(isDark);
  // Stats-less leagues (no directory sport) get this same table with cats=[]
  // — no stat columns, no headshots, single-line player cells. The hockey
  // branches below key off the sport, not off per-row directory hits.
  const isHockey = league.sport === 'hockey';
  const [sort, setSort] = React.useState({ key: defaultSortKey, dir: 'desc' });

  const scrollRef = React.useRef(null);
  const [containerW, setContainerW] = React.useState(0);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  // CONTRACT_W is sized for snake's compact "Y1/3" strings; auction's
  // "Keep for $XX" + "Drafted $XX" pair needs more room or the sticky Status
  // cell paints over the overflow.
  const contractW = isAuctionCost(league) ? 132 : CONTRACT_W;

  const nStats = cats.length;
  const naturalW = PLAYER_W + nStats * STAT_W + contractW + STATUS_W;
  const stretchMode = containerW > 0 && naturalW <= containerW;

  React.useEffect(() => {
    function update() {
      const el = scrollRef.current;
      if (!el) return;
      setContainerW(el.clientWidth);
      setCanLeft(el.scrollLeft > 1);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }
    update();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [nStats, rows.length]);

  function clickSort(cat) {
    setSort(s => s.key === cat.key
      ? { key: cat.key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
      : { key: cat.key, dir: cat.asc ? 'asc' : 'desc' });
  }

  // Players with stats sort by the active column; no-stats players always sit
  // last, alphabetical. Kept players then pin to the top of the result —
  // ONE flat list, marked in place, never a labelled section.
  function orderRows(list) {
    // Stats-less leagues have no sortable stat columns — keep the page-level
    // value sort (cost desc / round asc) instead of re-sorting alphabetical.
    const withRec = list.map(row => ({ row, rec: playerMap?.get(normalizeName(row.player)) }));
    if (!isHockey) return keepersFirst(withRec, x => x.row);
    const has = withRec.filter(x => x.rec);
    const not = withRec.filter(x => !x.rec).sort((a, b) => a.row.player.localeCompare(b.row.player));
    has.sort((a, b) => {
      const va = Number(a.rec[sort.key] ?? 0);
      const vb = Number(b.rec[sort.key] ?? 0);
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
    // Re-pin after the column sort, so clicking a stat header reorders within
    // the kept block and the eligible block rather than mixing them.
    return keepersFirst([...has, ...not], x => x.row);
  }

  const ordered = orderRows(rows);
  const flatCount = ordered.length;
  if (flatCount === 0) return null;

  // Sticky cells need OPAQUE backgrounds — sectionBg/dangerBg are translucent,
  // so stat columns scrolled underneath would ghost through. Layering the
  // translucent tint over cardBg via backgroundImage keeps the exact same
  // visual color while compositing opaque. Applied to every header cell for
  // header-bg parity (the CompactKeeperGrid lesson).
  const headerBg = { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})` };
  // Sticky cells must be OPAQUE (translucent ones let scrolled stat columns
  // ghost through), so a row tint is layered over cardBg rather than set as a
  // transparent background. Kept rows carry the success tint — the highlight
  // that replaced the "Eligible, not protected" section label.
  const rowBg = (row) => {
    const tint = row.kind === 'expired' ? t.dangerBg : row.kind === 'keeper' ? t.successBg : null;
    return tint
      ? { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${tint}, ${tint})` }
      : { backgroundColor: t.cardBg };
  };
  const headerCell = {
    ...headerBg, padding: '9px 10px', textAlign: 'right',
    ...tokens.typeLabelEyebrow, color: t.textMuted,
    borderBottom: `1px solid ${t.divider}`, whiteSpace: 'nowrap',
  };
  // Edge-fade scroll affordance: a soft gradient shadow hugging the inside
  // of each sticky boundary, shown only while columns are clipped on that
  // side. Rendered as overlays (pointer-events: none) so they never block
  // scrolling, sorting, or row content; opacity-toggled so the appear/
  // disappear reads as a fade rather than a pop.
  const fadeShadow = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(26,31,46,0.16)';
  const edgeFade = (side, on) => ({
    position: 'absolute', top: 0, bottom: 0, width: 22, zIndex: 5,
    pointerEvents: 'none', opacity: on ? 1 : 0, transition: 'opacity 0.18s',
    ...(side === 'left'
      ? { left: PLAYER_W, background: `linear-gradient(to right, ${fadeShadow}, transparent)` }
      : { right: contractW + STATUS_W, background: `linear-gradient(to left, ${fadeShadow}, transparent)` }),
  });

  let renderedSoFar = 0;
  return (
    <div style={{ marginBottom: tokens.spaceLg }}>
      {title && <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.spaceXs }}>{title}</div>}
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, overflow: 'hidden', position: 'relative' }}>
        {toolbar}
        {!stretchMode && <div aria-hidden style={edgeFade('left', canLeft)} />}
        {!stretchMode && <div aria-hidden style={edgeFade('right', canRight)} />}
        <div ref={scrollRef} style={{
          overflowX: stretchMode ? 'hidden' : 'auto',
          scrollSnapType: stretchMode ? 'none' : 'x mandatory',
          scrollPaddingLeft: stretchMode ? 0 : PLAYER_W,
        }}>
          <table style={{
            width: stretchMode ? '100%' : `${naturalW}px`,
            tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0,
          }}>
            <thead>
              <tr>
                <th style={{ ...headerCell, position: 'sticky', left: 0, zIndex: 3, textAlign: 'left', padding: '9px 14px', width: PLAYER_W, minWidth: PLAYER_W }}>
                  Player
                </th>
                {cats.map(cat => {
                  const active = sort.key === cat.key;
                  return (
                    <th key={cat.key} style={{
                      ...headerCell, padding: 0,
                      width: stretchMode ? 'auto' : STAT_W,
                      minWidth: stretchMode ? 0 : STAT_W,
                      scrollSnapAlign: stretchMode ? 'none' : 'start',
                    }}>
                      <button onClick={() => clickSort(cat)} style={{
                        width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none',
                        padding: '9px 10px', cursor: 'pointer', fontFamily: 'inherit',
                        ...tokens.typeLabelEyebrow, color: active ? t.textPrimary : t.textMuted,
                        textAlign: 'right', whiteSpace: 'nowrap',
                      }}>
                        {cat.label}{active ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
                      </button>
                    </th>
                  );
                })}
                <th style={{ ...headerCell, position: 'sticky', right: STATUS_W, zIndex: 3, width: contractW, minWidth: contractW }}>{costColumnLabel(league)}</th>
                <th style={{ ...headerCell, position: 'sticky', right: 0, zIndex: 3, padding: '9px 14px 9px 10px', width: STATUS_W, minWidth: STATUS_W }}>{OWNER_COLUMN_LABEL}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(({ row, rec }, i) => {
                    renderedSoFar += 1;
                    const isLast = renderedSoFar === flatCount;
                    const rowBorder = isLast ? 'none' : `1px solid ${t.border}`;
                    const expired = row.kind === 'expired';
                    const kept = row.kind === 'keeper';
                    const dim = 1;
                    const pos = displayPos(row, rec);
                    return (
                      <tr key={`${row.teamId}-${row.player}`} className="kh-share-tr"
                        style={{
                          verticalAlign: 'middle',
                          // Full-width tint: the <tr> paints behind the
                          // non-sticky stat cells, the sticky cells layer the
                          // same tint opaquely over cardBg.
                          background: kept ? t.successBg : expired ? t.dangerBg : undefined,
                        }}>
                        <td style={{ position: 'sticky', left: 0, zIndex: 2, ...rowBg(row), padding: '9px 14px', width: PLAYER_W, minWidth: PLAYER_W, borderBottom: rowBorder }}>
                          {isHockey ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, minWidth: 0, opacity: dim }}>
                              <SharedHeadshot rec={rec} isDark={isDark} size={30} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ ...ROW_TITLE, color: expired ? t.danger : t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row.player}
                                </div>
                                <div style={{ ...tokens.typeStatMeta, color: t.textMuted, marginTop: 1, whiteSpace: 'nowrap' }}>
                                  {[pos, rec?.team].filter(Boolean).join(' · ') || '—'}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, opacity: dim }}>
                              <span style={{ ...ROW_TITLE, color: expired ? t.danger : t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {row.player}
                              </span>
                              {pos && <span style={{ ...tokens.typeStatMeta, color: t.textMuted, flexShrink: 0 }}>{pos}</span>}
                            </div>
                          )}
                        </td>
                        {nStats === 0 ? null : rec ? (
                          cats.map(cat => (
                            <td key={cat.key} style={{ padding: '9px 10px', textAlign: 'right', ...tokens.typeStatMeta, fontSize: '11px', color: sort.key === cat.key ? t.textPrimary : t.textBody, borderBottom: rowBorder, whiteSpace: 'nowrap', opacity: dim }}>
                              {formatStat(cat, rec)}
                            </td>
                          ))
                        ) : (
                          <td colSpan={nStats} style={{ padding: '9px 10px', borderBottom: rowBorder, whiteSpace: 'nowrap', opacity: dim }}>
                            {/* Sticky within the wide colSpan cell so the message
                                stays in view while the stat columns scroll. */}
                            <span style={{ display: 'inline-block', position: 'sticky', left: PLAYER_W + 10, ...tokens.typeBodyMeta, fontStyle: 'italic', color: t.textMuted }}>
                              No stats yet — limited games played
                            </span>
                          </td>
                        )}
                        <td style={{ position: 'sticky', right: STATUS_W, zIndex: 2, ...rowBg(row), padding: '9px 10px', textAlign: 'right', width: contractW, minWidth: contractW, borderBottom: rowBorder, whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-block', opacity: dim }}>
                            <ContractText row={row} league={league} isDark={isDark} />
                          </span>
                        </td>
                        <td style={{ position: 'sticky', right: 0, zIndex: 2, ...rowBg(row), padding: '9px 14px 9px 10px', textAlign: 'right', width: STATUS_W, minWidth: STATUS_W, borderBottom: rowBorder }}>
                          <span style={{ display: 'inline-block', opacity: dim }}>
                            <RowStatusPill row={row} league={league} hideTeam={hideTeam} isDark={isDark} />
                          </span>
                        </td>
                      </tr>
                    );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Skater / goalie split for the desktop table groups. Directory record wins;
// falls back to the row's own position when the player is unmatched.
function isGoalieRow(row, playerMap) {
  const rec = playerMap?.get(normalizeName(row.player));
  if (rec) return rec.kind === 'goalie' || rec.pos === 'G';
  return String(row.pos || '').toUpperCase() === 'G';
}

function StatTables({ rows, league, playerMap, isDark, hideTeam, toolbar }) {
  const skaters = rows.filter(r => !isGoalieRow(r, playerMap));
  const goalies = rows.filter(r => isGoalieRow(r, playerMap));
  return (
    <>
      {skaters.length > 0 && (
        <StatTable title="Skaters" rows={skaters} cats={statCategoriesFor(league, 'skater')}
          league={league} playerMap={playerMap} isDark={isDark} hideTeam={hideTeam}
          toolbar={toolbar} defaultSortKey="p" />
      )}
      {goalies.length > 0 && (
        <StatTable title="Goalies" rows={goalies} cats={statCategoriesFor(league, 'goalie')}
          league={league} playerMap={playerMap} isDark={isDark} hideTeam={hideTeam}
          defaultSortKey="svPct" />
      )}
    </>
  );
}

// ── View-level copy blocks ──────────────────────────────────────────────────

function ViewHeader({ title, subtitle, danger, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ marginBottom: tokens.spaceSm }}>
      <div style={{ ...tokens.typeHeadingSection, color: danger ? tokens.danger : t.textSecondary }}>{title}</div>
      {subtitle && <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 3 }}>{subtitle}</div>}
    </div>
  );
}

function ViewFooter({ children, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: tokens.spaceSm, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// Empty state (no keepers declared league-wide). The one place on this page
// the mascot is allowed to SPEAK — a waiting surface per the mascot-speech
// principle. The list still renders below (all rows Eligible).
function EmptyStateBanner({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ textAlign: 'center', padding: `${tokens.spaceLg}px 0 ${tokens.spaceXl}px` }}>
      <img src="/mascot-empty.png" alt="" height={110}
        style={{ height: 110, width: 'auto', imageRendering: 'pixelated', display: 'block', margin: `0 auto ${tokens.spaceSm}px` }} />
      <div style={{
        display: 'inline-block',
        background: t.sectionBg, border: `1px solid ${t.border}`,
        borderRadius: tokens.radiusLg, padding: `${tokens.spaceSm}px ${tokens.spaceMd}px`,
        ...tokens.typeBody, fontWeight: 600, color: t.textBody,
      }}>
        No keepers declared yet — check back once teams lock theirs in.
      </div>
    </div>
  );
}

function InvalidLinkPage({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{SHARE_STYLES}</style>
      <SharedHeader isDark={isDark} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: tokens.spaceLg }}>
        <div style={{
          maxWidth: 420, width: '100%', textAlign: 'center',
          background: t.cardBg, border: `1px solid ${t.border}`, boxShadow: t.cardShadow,
          borderRadius: tokens.radiusLg, padding: `${tokens.space2xl}px ${tokens.spaceXl}px`,
        }}>
          <img src="/mascot-empty.png" alt="" height={120}
            style={{ height: 120, width: 'auto', imageRendering: 'pixelated', display: 'block', margin: `0 auto ${tokens.spaceMd}px` }} />
          <p style={{ ...tokens.typeBody, color: t.textBody, margin: 0, lineHeight: 1.55 }}>
            This link is no longer valid — ask your commissioner for the current one.
          </p>
        </div>
      </div>
      <FooterMark isDark={isDark} />
    </div>
  );
}

function FilterChip({ label, active, danger, onClick, isDark }) {
  const t = makeTheme(isDark);
  let colors;
  if (danger) {
    colors = active
      ? { background: tokens.danger, color: '#fff', border: `1px solid ${tokens.danger}` }
      : { background: tokens.dangerBg, color: tokens.danger, border: `1px solid ${tokens.dangerBorder}` };
  } else {
    colors = active
      ? { background: t.textPrimary, color: t.cardBg, border: `1px solid ${t.textPrimary}` }
      : { background: t.cardBg, color: t.textSecondary, border: `1px solid ${t.border}` };
  }
  return (
    <button onClick={onClick} style={{
      ...tokens.typePill, fontWeight: 600, borderRadius: tokens.radiusPill,
      padding: '6px 13px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
      fontFamily: 'inherit', ...colors,
    }}>{label}</button>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

function SharedLeaguePage({ league, isDark }) {
  const t = makeTheme(isDark);
  const sport = SPORT_CONFIG[league.sport] || SPORT_CONFIG.hockey;
  const termed = hasTerm(league);
  const isHockey = league.sport === 'hockey';
  const playerMap = usePlayerMap(league.sport);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const cd = useCountdown(league.keeperDeadline, league.keeperDeadlineTime);
  const locked = !!cd?.locked;

  const allRows = React.useMemo(() => buildSharedRows(league), [league]);
  const hasExpired = termed && allRows.some(r => r.kind === 'expired');
  const anyKeepers = allRows.some(r => r.kind === 'keeper');
  const teams = league.teams || [];

  const [filter, setFilter] = React.useState('keepable');
  // Player search — filters the current view's rows as you type, using the
  // same normalized matching the commissioner Eligible Pool search uses
  // (trade-talk use case: "what would it cost to get X?").
  const [search, setSearch] = React.useState('');
  const teamFilterId = filter.startsWith('team:') ? filter.slice(5) : null;
  const filterTeam = teamFilterId ? teams.find(tm => tm.id === teamFilterId) : null;

  // Print always renders the default keepable view (§12) — the rail is hidden
  // in print, so whatever filter was active would otherwise print unlabeled.
  React.useEffect(() => {
    const reset = () => setFilter('keepable');
    window.addEventListener('beforeprint', reset);
    return () => window.removeEventListener('beforeprint', reset);
  }, []);

  // Sticky countdown pill appears only once the header band has scrolled off.
  const bandRef = React.useRef(null);
  const [pillOn, setPillOn] = React.useState(false);
  React.useEffect(() => {
    const el = bandRef.current;
    if (!el || !cd) return;
    const io = new IntersectionObserver(([entry]) => setPillOn(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [cd != null]);

  // Row selection per filter. Expired players never leak into keepable or
  // team views; post-deadline the default view narrows to declared keepers.
  let rows;
  if (filter === 'expired') {
    rows = allRows.filter(r => r.kind === 'expired');
  } else if (filter === 'contracts') {
    rows = allRows.filter(r => r.kind === 'keeper' || r.kind === 'contract');
  } else if (teamFilterId) {
    rows = allRows.filter(r => r.teamId === teamFilterId && r.kind !== 'expired');
    if (locked) rows = rows.filter(r => r.kind === 'keeper');
  } else {
    rows = locked ? allRows.filter(r => r.kind === 'keeper') : allRows.filter(r => r.kind !== 'expired');
  }
  if (search.trim()) {
    const q = normalizeName(search);
    rows = rows.filter(r => normalizeName(r.player).includes(q));
  }
  // Kept players pin to the top of every view — the team tabs (that team's
  // keepers) and "All players" (every declared keeper in the league). The
  // row highlight carries the meaning, so the list stays flat.
  const sortedRows = React.useMemo(
    () => keepersFirst(sortRowsDefault(rows, playerMap, league)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, filter, locked, search, playerMap, league]
  );

  const chips = sharedFilterChips({ league, locked, termed, hasExpired, teams });

  const teamKeeperCount = filterTeam
    ? allRows.filter(r => r.kind === 'keeper' && r.teamId === filterTeam.id).length
    : 0;
  const teamHasExpired = filterTeam
    ? allRows.some(r => r.kind === 'expired' && r.teamId === filterTeam.id)
    : false;

  // Desktop always gets the table treatment — hockey with stat groups,
  // stats-less leagues a compact name/price/status table (no stat columns,
  // no skater/goalie split). Mobile cards are for mobile widths only.
  const useTable = isDesktop;

  // The search filters this list, so it reads as part of it: rendered inside
  // the table's card as a header strip rather than floating between the chip
  // rail and the table, belonging to neither.
  const searchBar = (
    <ListSearch value={search} onChange={setSearch} count={sortedRows.length} isDark={isDark} />
  );

  const body = (
    <>
      {filter === 'expired' && (
        <ViewHeader title="Expired contracts" subtitle="not keepable — re-enter the draft" danger isDark={isDark} />
      )}
      {filterTeam && (
        <ViewHeader
          title={`${filterTeam.name} — keepers declared`}
          subtitle={`${teamKeeperCount} keeper${teamKeeperCount === 1 ? '' : 's'}${league.contractsRequired ? '' : ' · slots optional'}`}
          isDark={isDark}
        />
      )}
      {/* Mascot speech is for WAITING surfaces only — it renders solely when
          there is nothing else to show. A populated list with zero declared
          keepers gets a one-line quiet notice instead. */}
      {filter === 'keepable' && !locked && !anyKeepers && !search.trim() && (
        sortedRows.length === 0
          ? <EmptyStateBanner isDark={isDark} />
          : (
            <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginBottom: tokens.spaceSm }}>
              No keepers declared yet — everyone below is still eligible.
            </div>
          )
      )}

      {sortedRows.length === 0 ? (
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, padding: `${tokens.spaceLg}px 0`, textAlign: 'center' }}>
          {search.trim() ? `No players match “${search.trim()}”.` : 'Nothing here yet.'}
        </div>
      ) : useTable ? (
        isHockey ? (
          <StatTables rows={sortedRows} league={league} playerMap={playerMap} isDark={isDark}
            hideTeam={!!filterTeam} toolbar={searchBar} />
        ) : (
          <StatTable rows={sortedRows} cats={[]} league={league} playerMap={playerMap} isDark={isDark}
            hideTeam={!!filterTeam} toolbar={searchBar} />
        )
      ) : (
        <div>
          <div style={{ marginBottom: tokens.spaceXs }}>{searchBar}</div>
          <RowList rows={sortedRows} league={league} playerMap={playerMap} isDark={isDark} hideTeam={!!filterTeam} />
        </div>
      )}

      {filter === 'expired' && (
        <ViewFooter isDark={isDark}>These contracts ended this season. The full draft pool is set once keepers lock.</ViewFooter>
      )}
      {filterTeam && termed && teamHasExpired && (
        <ViewFooter isDark={isDark}>{filterTeam.name}&rsquo;s expired contracts are under the Expired filter.</ViewFooter>
      )}
      {filter === 'keepable' && locked && (
        <ViewFooter isDark={isDark}>Keepers are final. Everyone else heads to the draft.</ViewFooter>
      )}
    </>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{SHARE_STYLES}</style>
      <SharedHeader isDark={isDark} />

      {/* League header band */}
      <div ref={bandRef} style={{ background: t.cardBg, borderBottom: `1px solid ${t.border}` }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: `${tokens.spaceMd}px ${tokens.spaceLg}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceMd,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceSm, minWidth: 0 }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: sport.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <img src={sport.logo} alt="" height={34} style={{ height: 34, width: 'auto', imageRendering: 'pixelated', display: 'block' }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...LEAGUE_NAME_TYPE, color: t.textPrimary, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {league.name}
              </div>
              <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 1, whiteSpace: 'nowrap' }}>
                {sport.label} · {COST_LABEL[keeperCostModelOf(league)]} · {termLabel(termOf(league))}
              </div>
            </div>
          </div>
          {cd && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {locked ? (
                <span style={{ ...tokens.typeBody, fontWeight: 600, color: t.textSecondary, whiteSpace: 'nowrap' }}>
                  🔒 Keepers locked · {cd.dateShort}
                </span>
              ) : (
                <>
                  <div style={{ ...COUNTDOWN_TYPE, color: sport.color, whiteSpace: 'nowrap' }}>{cd.label}</div>
                  <div style={{ ...tokens.typeStatMeta, fontWeight: 600, color: t.textMuted, marginTop: 1, whiteSpace: 'nowrap' }}>{cd.dateLabel}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky countdown pill — floats in once the band scrolls off */}
      {cd && (
        <div className="kh-share-pill-wrap" style={{
          position: 'sticky', top: tokens.spaceXs, zIndex: 60, height: 0,
          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          visibility: pillOn ? 'visible' : 'hidden',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: tokens.spaceXs, whiteSpace: 'nowrap',
            background: isDark ? 'rgba(28,33,48,0.88)' : 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${t.border}`, borderRadius: tokens.radiusPill,
            padding: `${tokens.spaceXs}px ${tokens.spaceMd}px`,
            boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
          }}>
            {locked ? (
              <span style={{ ...tokens.typeBody, fontWeight: 600, color: t.textSecondary }}>
                🔒 Keepers locked · {cd.dateShort}
              </span>
            ) : (
              <>
                <span style={{ ...COUNTDOWN_TYPE, color: sport.color }}>{cd.label}</span>
                <span style={{ width: 1, height: 14, background: t.border }} />
                <span style={{ ...tokens.typeStatMeta, fontWeight: 600, color: t.textMuted }}>{cd.dateLabel}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter rail + list */}
      <div style={{ flex: 1, width: '100%', maxWidth: 1100, margin: '0 auto', padding: `${tokens.spaceMd}px ${tokens.spaceLg}px 0`, boxSizing: 'border-box' }}>
        <div className="kh-share-rail" style={{ marginBottom: tokens.spaceMd }}>
          <div className="kh-share-rail-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0' }}>
            {chips.map(chip => (
              <FilterChip key={chip.id} label={chip.label} danger={chip.danger}
                active={filter === chip.id} isDark={isDark}
                onClick={() => setFilter(chip.id)} />
            ))}
          </div>
        </div>
        {body}
      </div>

      <FooterMark isDark={isDark} />
    </div>
  );
}

// Route wrapper: token → RPC → page / invalid-link. A fetch failure lands on
// the invalid state too — a member with a dead or unreachable link gets the
// "ask your commissioner" explanation either way, never a redirect to "/".
function SharedLeagueRoute({ isDark }) {
  const { token } = useParams();
  const [state, setState] = React.useState({ status: 'loading', league: null });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', league: null });
    fetchSharedLeague(token)
      .then(league => { if (!cancelled) setState(league ? { status: 'ok', league } : { status: 'invalid' }); })
      .catch(() => { if (!cancelled) setState({ status: 'invalid' }); });
    return () => { cancelled = true; };
  }, [token]);

  if (state.status === 'loading') {
    const t = makeTheme(isDark);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <style>{SHARE_STYLES}</style>
        <SharedHeader isDark={isDark} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader size={28} strokeWidth={1.75} className="kh-spin" color={t.textMuted} />
        </div>
      </div>
    );
  }
  if (state.status === 'invalid') return <InvalidLinkPage isDark={isDark} />;
  return <SharedLeaguePage league={state.league} isDark={isDark} />;
}

export { SharedLeagueRoute, SharedLeaguePage };
