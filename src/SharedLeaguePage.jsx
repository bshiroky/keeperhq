import React from 'react';
import { useParams } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { makeTheme, tokens, SPORT_CONFIG, usePlayerMap } from './components.jsx';
import { normalizeName } from './lib/players.js';
import {
  fetchSharedLeague, buildSharedRows, statCategoriesFor, formatStat, sortRowsDefault,
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
    .kh-share-rail { display: none !important; }
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

// Contract text — typePill scale, bold-800 value, colored per state. Auction
// leagues show the keep cost instead (never both), at stat-line prominence.
function ContractText({ row, league, isDark }) {
  const t = makeTheme(isDark);
  if (league.draftType === 'auction') {
    return (
      <span style={{ ...tokens.typeBody, fontWeight: 800, color: tokens.warning, whiteSpace: 'nowrap' }}>
        Keep for ${row.cost ?? 0}
      </span>
    );
  }
  let label, value, color;
  if (row.kind === 'expired') { label = 'Expired'; value = `Y${row.len}/${row.len}`; color = tokens.danger; }
  else if (row.final) { label = 'Final year'; value = `Y${row.len}/${row.len}`; color = tokens.danger; }
  else if (row.kind === 'rostered') { label = 'No contract'; value = `Y1/${row.len}`; color = t.textMuted; }
  else { label = 'On contract'; value = `Y${row.year}/${row.len}`; color = tokens.info; }
  return (
    <span style={{ ...tokens.typePill, color, whiteSpace: 'nowrap' }}>
      {label} <span style={{ fontWeight: 800 }}>{value}</span>
    </span>
  );
}

// Status pill — StatusPill visual language. Keeper takes the grid accent
// (blue snake / orange auction); Eligible is neutral; "was {team}" is the
// Expired view's danger tint. Team name drops when a team filter is active.
function RowStatusPill({ row, league, hideTeam, isDark }) {
  const t = makeTheme(isDark);
  const auction = league.draftType === 'auction';
  let bg, border, color, label;
  if (row.kind === 'keeper') {
    bg = auction ? tokens.warningBg : tokens.infoBg;
    border = auction ? tokens.warningBorder : tokens.infoBorder;
    color = auction ? tokens.warning : tokens.info;
    label = hideTeam ? 'Keeper' : `Keeper · ${row.teamName}`;
  } else if (row.kind === 'expired') {
    bg = tokens.dangerBg; border = tokens.dangerBorder; color = tokens.danger;
    label = `was ${row.teamName}`;
  } else {
    bg = t.badgeBg; border = 'transparent'; color = t.badgeColor;
    label = hideTeam ? 'Eligible' : `Eligible · ${row.teamName}`;
  }
  return (
    <span style={{
      ...tokens.typePill, background: bg, color, border: `1px solid ${border}`,
      borderRadius: tokens.radiusPill, padding: '2px 9px',
      whiteSpace: 'nowrap', maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis',
      boxSizing: 'border-box',
    }}>{label}</span>
  );
}

// ── Mobile / list row ───────────────────────────────────────────────────────
// The production Eligible Pool row DNA: bordered full-width card, name left,
// status stacked right. One no-stats treatment everywhere — same right
// column, min-height matched to the two-line hockey row.
function PlayerRow({ row, league, rec, isDark, hideTeam, dim }) {
  const t = makeTheme(isDark);
  const isHockey = league.sport === 'hockey';
  const expired = row.kind === 'expired';
  const pos = displayPos(row, rec);
  const statLine = isHockey ? statLineFor(rec) : null;
  return (
    <div className="kh-share-row" style={{
      display: 'flex', alignItems: 'center', gap: tokens.spaceSm,
      background: expired ? t.dangerBg : t.cardBg,
      border: `1px solid ${expired ? t.dangerBorder : t.border}`,
      borderRadius: tokens.radiusLg, padding: `${tokens.spaceSm}px`,
      minHeight: 58, boxSizing: 'border-box',
      opacity: dim ? 0.6 : 1,
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
        <RowStatusPill row={row} league={league} hideTeam={hideTeam} isDark={isDark} />
      </div>
    </div>
  );
}

function RowList({ rows, league, playerMap, isDark, hideTeam, dimEligible }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceXs }}>
      {rows.map(row => (
        <PlayerRow key={`${row.teamId}-${row.player}`} row={row} league={league}
          rec={playerMap?.get(normalizeName(row.player))} isDark={isDark}
          hideTeam={hideTeam} dim={dimEligible && row.kind !== 'keeper'} />
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
const PLAYER_W = 230;
const STAT_W = 64;
const CONTRACT_W = 150;
const STATUS_W = 160;

function StatTable({ title, rows, cats, league, playerMap, isDark, hideTeam, dimEligible, groupKeepers, defaultSortKey }) {
  const t = makeTheme(isDark);
  const [sort, setSort] = React.useState({ key: defaultSortKey, dir: 'desc' });

  const scrollRef = React.useRef(null);
  const [containerW, setContainerW] = React.useState(0);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  const nStats = cats.length;
  const naturalW = PLAYER_W + nStats * STAT_W + CONTRACT_W + STATUS_W;
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
  // last, alphabetical. Team-filter mode partitions keepers above eligible.
  function orderRows(list) {
    const withRec = list.map(row => ({ row, rec: playerMap?.get(normalizeName(row.player)) }));
    const has = withRec.filter(x => x.rec);
    const not = withRec.filter(x => !x.rec).sort((a, b) => a.row.player.localeCompare(b.row.player));
    has.sort((a, b) => {
      const va = Number(a.rec[sort.key] ?? 0);
      const vb = Number(b.rec[sort.key] ?? 0);
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
    return [...has, ...not];
  }

  const partitions = groupKeepers
    ? [
        { rows: orderRows(rows.filter(r => r.kind === 'keeper')) },
        { eyebrow: 'Eligible, not protected', dim: true, rows: orderRows(rows.filter(r => r.kind !== 'keeper')) },
      ].filter(p => p.rows.length > 0)
    : [{ rows: orderRows(rows) }];

  const flatCount = partitions.reduce((n, p) => n + p.rows.length, 0);
  if (flatCount === 0) return null;

  const totalCols = 1 + nStats + 2;
  // Sticky cells need OPAQUE backgrounds — sectionBg/dangerBg are translucent,
  // so stat columns scrolled underneath would ghost through. Layering the
  // translucent tint over cardBg via backgroundImage keeps the exact same
  // visual color while compositing opaque. Applied to every header cell for
  // header-bg parity (the CompactKeeperGrid lesson).
  const headerBg = { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})` };
  const rowBg = (expired) => expired
    ? { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.dangerBg}, ${t.dangerBg})` }
    : { backgroundColor: t.cardBg };
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
      : { right: CONTRACT_W + STATUS_W, background: `linear-gradient(to left, ${fadeShadow}, transparent)` }),
  });

  let renderedSoFar = 0;
  return (
    <div style={{ marginBottom: tokens.spaceLg }}>
      <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.spaceXs }}>{title}</div>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, boxShadow: t.cardShadow, overflow: 'hidden', position: 'relative' }}>
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
                <th style={{ ...headerCell, position: 'sticky', right: STATUS_W, zIndex: 3, width: CONTRACT_W, minWidth: CONTRACT_W }}>Contract</th>
                <th style={{ ...headerCell, position: 'sticky', right: 0, zIndex: 3, padding: '9px 14px 9px 10px', width: STATUS_W, minWidth: STATUS_W }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {partitions.map((part, pi) => (
                <React.Fragment key={pi}>
                  {part.eyebrow && (
                    <tr className="kh-share-tr">
                      <td colSpan={totalCols} style={{ padding: '10px 14px 4px', ...tokens.typeLabelEyebrow, color: t.textMuted, borderBottom: 'none' }}>
                        {part.eyebrow}
                      </td>
                    </tr>
                  )}
                  {part.rows.map(({ row, rec }, i) => {
                    renderedSoFar += 1;
                    const isLast = renderedSoFar === flatCount;
                    const rowBorder = isLast ? 'none' : `1px solid ${t.border}`;
                    const expired = row.kind === 'expired';
                    const dim = (part.dim || (dimEligible && row.kind !== 'keeper')) ? 0.6 : 1;
                    const pos = displayPos(row, rec);
                    return (
                      <tr key={`${row.teamId}-${row.player}`} className="kh-share-tr" style={{ verticalAlign: 'middle' }}>
                        <td style={{ position: 'sticky', left: 0, zIndex: 2, ...rowBg(expired), padding: '9px 14px', width: PLAYER_W, minWidth: PLAYER_W, borderBottom: rowBorder, opacity: dim }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, minWidth: 0 }}>
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
                        </td>
                        {rec ? (
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
                        <td style={{ position: 'sticky', right: STATUS_W, zIndex: 2, ...rowBg(expired), padding: '9px 10px', textAlign: 'right', width: CONTRACT_W, minWidth: CONTRACT_W, borderBottom: rowBorder, whiteSpace: 'nowrap', opacity: dim }}>
                          <ContractText row={row} league={league} isDark={isDark} />
                        </td>
                        <td style={{ position: 'sticky', right: 0, zIndex: 2, ...rowBg(expired), padding: '9px 14px 9px 10px', textAlign: 'right', width: STATUS_W, minWidth: STATUS_W, borderBottom: rowBorder, opacity: dim }}>
                          <RowStatusPill row={row} league={league} hideTeam={hideTeam} isDark={isDark} />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
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

function StatTables({ rows, league, playerMap, isDark, hideTeam, dimEligible, groupKeepers }) {
  const skaters = rows.filter(r => !isGoalieRow(r, playerMap));
  const goalies = rows.filter(r => isGoalieRow(r, playerMap));
  return (
    <>
      {skaters.length > 0 && (
        <StatTable title="Skaters" rows={skaters} cats={statCategoriesFor(league, 'skater')}
          league={league} playerMap={playerMap} isDark={isDark} hideTeam={hideTeam}
          dimEligible={dimEligible} groupKeepers={groupKeepers} defaultSortKey="p" />
      )}
      {goalies.length > 0 && (
        <StatTable title="Goalies" rows={goalies} cats={statCategoriesFor(league, 'goalie')}
          league={league} playerMap={playerMap} isDark={isDark} hideTeam={hideTeam}
          dimEligible={dimEligible} groupKeepers={groupKeepers} defaultSortKey="svPct" />
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
  const isSnake = league.draftType === 'snake';
  const isHockey = league.sport === 'hockey';
  const playerMap = usePlayerMap(league.sport);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const cd = useCountdown(league.keeperDeadline, league.keeperDeadlineTime);
  const locked = !!cd?.locked;

  const allRows = React.useMemo(() => buildSharedRows(league), [league]);
  const hasExpired = isSnake && allRows.some(r => r.kind === 'expired');
  const anyKeepers = allRows.some(r => r.kind === 'keeper');
  const teams = league.teams || [];

  const [filter, setFilter] = React.useState('keepable');
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
  const sortedRows = React.useMemo(
    () => sortRowsDefault(rows, playerMap, isHockey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, filter, locked, playerMap, isHockey]
  );

  const chips = [
    { id: 'keepable', label: locked ? 'Final keepers' : (isSnake ? 'Keepable' : 'All players') },
    { id: 'contracts', label: 'Under contract' },
    ...(hasExpired ? [{ id: 'expired', label: 'Expired', danger: true }] : []),
    ...teams.map(tm => ({ id: `team:${tm.id}`, label: tm.name })),
  ];

  const teamKeeperCount = filterTeam
    ? allRows.filter(r => r.kind === 'keeper' && r.teamId === filterTeam.id).length
    : 0;
  const teamHasExpired = filterTeam
    ? allRows.some(r => r.kind === 'expired' && r.teamId === filterTeam.id)
    : false;

  const useTable = isDesktop && isHockey;
  const listMax = isDesktop && !useTable ? 720 : undefined;

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
      {filter === 'keepable' && !locked && !anyKeepers && <EmptyStateBanner isDark={isDark} />}

      {sortedRows.length === 0 ? (
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, padding: `${tokens.spaceLg}px 0`, textAlign: 'center' }}>
          Nothing here yet.
        </div>
      ) : useTable ? (
        <StatTables rows={sortedRows} league={league} playerMap={playerMap} isDark={isDark}
          hideTeam={!!filterTeam} dimEligible={false} groupKeepers={!!filterTeam && !locked} />
      ) : (
        <div style={{ maxWidth: listMax, margin: listMax ? '0 auto' : undefined }}>
          {filterTeam && !locked ? (
            <>
              <RowList rows={sortedRows.filter(r => r.kind === 'keeper')} league={league} playerMap={playerMap} isDark={isDark} hideTeam />
              {sortedRows.some(r => r.kind !== 'keeper') && (
                <>
                  <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, padding: `${tokens.spaceSm}px 4px 6px` }}>
                    Eligible, not protected
                  </div>
                  <RowList rows={sortedRows.filter(r => r.kind !== 'keeper')} league={league} playerMap={playerMap} isDark={isDark} hideTeam dimEligible />
                </>
              )}
            </>
          ) : (
            <RowList rows={sortedRows} league={league} playerMap={playerMap} isDark={isDark} hideTeam={!!filterTeam} />
          )}
        </div>
      )}

      {filter === 'expired' && (
        <ViewFooter isDark={isDark}>These contracts ended this season. The full draft pool is set once keepers lock.</ViewFooter>
      )}
      {filterTeam && isSnake && teamHasExpired && (
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
                {sport.label} · {league.draftType === 'auction' ? 'Auction' : 'Contract Snake'}
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
