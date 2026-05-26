import React from 'react';
import { createPortal } from 'react-dom';
import { SPORT_CONFIG, tokens, makeTheme, TradingCard, CARD_STYLES } from './components.jsx';
import { SampleKeeperCell } from './tabs/keeper-grid-variants.jsx';

// Create New League — 4-step wizard (Basics / League Format / Teams / Review).
// Three-column card: left rail · form · live TradingCard preview. Writes a
// league in the src/data.js shape to localStorage (via onCreate) and routes
// into it. Per the build scope: no keeper round-cost UI, and the commissioner
// is auto-assigned to team #1 (commissionerTeamId) with no reassignment UI.

const STEPS = ['Basics', 'League Format', 'Teams', 'Review'];
const STEP_TITLES = ['The basics', 'League format', 'Teams', 'Review & create'];

// Picker / preview animation rules. kh-bob + kh-bob-slow keyframes live in the
// shared CARD_STYLES (also rendered here), so these selectors can reference them.
const WIZARD_STYLES = `
  .kh-fighter-card { transition: background 0.2s, border-color 0.2s, box-shadow 0.25s, transform 0.2s; }
  .kh-fighter-card--unselected:hover { background: rgba(0,0,0,0.025); transform: translateY(-1px); }
  .kh-fighter-card--selected .kh-fighter-char { animation: kh-bob 1.4s ease-in-out infinite; }
`;

// Sample keepers shown inside the draft-type tiles (same shape the Overview
// grid feeds SampleKeeperCell).
const SAMPLE_AUCTION = { player: 'Connor McDavid', keptFor: 58 };
const SAMPLE_SNAKE   = { player: 'Connor McDavid', contractYear: 2, contractLength: 3 };

const CROSS_YEAR = sport => sport === 'hockey' || sport === 'basketball' || sport === '';

function seasonOptions(sport) {
  const y = new Date().getFullYear();
  if (CROSS_YEAR(sport)) return [0, 1, 2].map(i => `${y + i}-${String(y + i + 1).slice(2)}`);
  return [0, 1, 2].map(i => `${y + i}`);
}

function slugify(name) {
  return (
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'league'
  );
}
function uniqueId(base, existing) {
  const ids = new Set((existing || []).map(l => l.id));
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Wizard state ───────────────────────────────────────────────────────────
function makeInitial() {
  return {
    step: 0,
    name: '',
    sport: '',
    season: seasonOptions('')[0],
    draftType: '',
    keeperSlots: 5,
    auctionInflation: 5,
    budget: 200,
    contractYears: 3,
    teamCount: 10,
    teamNames: Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`),
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'set':    return { ...s, ...a.patch };
    case 'goto':   return { ...s, step: a.step };
    case 'next':   return { ...s, step: Math.min(3, s.step + 1) };
    case 'back':   return { ...s, step: Math.max(0, s.step - 1) };
    case 'sport':  return { ...s, sport: a.sport, season: seasonOptions(a.sport)[0] };
    // Switching draft type discards the other mode's values (no cross-mode carry).
    case 'draftType': return { ...s, draftType: a.draftType, auctionInflation: 5, budget: 200, contractYears: 3 };
    case 'teamCount': {
      const n = a.count;
      const names = s.teamNames.slice(0, n);
      while (names.length < n) names.push(`Team ${names.length + 1}`);
      return { ...s, teamCount: n, teamNames: names };
    }
    case 'teamName': {
      const names = s.teamNames.slice();
      names[a.i] = a.value;
      return { ...s, teamNames: names };
    }
    default: return s;
  }
}

function stepValid(s, step) {
  if (step === 0) return s.name.trim().length > 0 && s.sport !== '';
  if (step === 1) return s.draftType !== '';
  if (step === 2) return s.teamNames.slice(0, s.teamCount).every(n => n.trim().length > 0);
  return true;
}

// ── Output shapes ────────────────────────────────────────────────────────
// Saved league mirrors the src/data.js shape (auctionRules / contractYears /
// slug id) so the rest of the app reads it correctly, plus commissionerTeamId.
function buildLeague(s, existing) {
  const teams = s.teamNames.slice(0, s.teamCount).map((nm, i) => ({
    id: `t${i + 1}`,
    name: (nm || '').trim() || `Team ${i + 1}`,
    paid: false,
    keepersSubmitted: false,
    keepers: [],
  }));
  const base = {
    id: uniqueId(slugify(s.name || ''), existing),
    name: (s.name || '').trim() || 'Untitled League',
    sport: s.sport,
    draftType: s.draftType,
    season: s.season,
    teamCount: s.teamCount,
    keeperSlots: s.keeperSlots,
    minKeepers: 0,
    buyIn: 0,
    totalPool: 0,
    commishFee: 0,
    status: 'pre-draft',
    draftDate: null,
    playoffTeams: 6,
    payouts: { standings: [], other: [] },
    payoutNote: '',
    commissionerTeamId: teams[0].id,
    createdAt: new Date().toISOString(),
    teams,
  };
  if (s.draftType === 'snake') {
    return { ...base, contractYears: s.contractYears, bottomLotteryTeams: 4, contractsRequired: false };
  }
  return {
    ...base,
    auctionRules: { costIncreasePerYear: s.auctionInflation, budget: s.budget, undraftedStartCost: 5, minBid: 1 },
  };
}

// Lighter object for the live TradingCard preview — keeps auctionRules /
// contractYears so the card's ruleMod produces the right meta pill.
function buildPreview(s) {
  return {
    id: 'preview',
    name: s.name,
    sport: s.sport,
    draftType: s.draftType,
    season: s.season,
    teamCount: s.teamCount,
    keeperSlots: s.keeperSlots,
    contractYears: s.draftType === 'snake' ? s.contractYears : undefined,
    auctionRules: s.draftType === 'auction' ? { costIncreasePerYear: s.auctionInflation } : undefined,
    buyIn: 0,
    totalPool: 0,
    teams: [],
  };
}

// ── Field primitives (modeled on KeeperEditModal inputs) ───────────────────
function FieldLabel({ children, t }) {
  return <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.space2xs }}>{children}</div>;
}
function FieldHelp({ children, t }) {
  return <div style={{ ...tokens.typeBodyMeta, color: t.textSecondary, marginTop: tokens.space2xs }}>{children}</div>;
}

function Input({ value, onChange, onBlur, placeholder, size, prefix, width, isDark, type = 'text', autoFocus, min, max, step }) {
  const t = makeTheme(isDark);
  const sm = size === 'sm';
  const filled = value !== '' && value != null;
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', width, boxSizing: 'border-box',
      background: isDark ? '#161a22' : '#f7f9fc',
      border: `1px solid ${t.border}`, borderRadius: sm ? tokens.radiusSm : tokens.radiusMd,
      overflow: 'hidden',
    }}>
      {prefix != null && (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: sm ? '0 8px' : '0 10px',
          borderRight: `1px solid ${t.border}`,
          background: 'rgba(0,0,0,0.025)', color: t.textMuted,
          fontWeight: 400, fontSize: sm ? 13 : 14,
        }}>{prefix}</span>
      )}
      <input
        type={type} value={value} placeholder={placeholder} onChange={onChange} onBlur={onBlur} autoFocus={autoFocus}
        min={min} max={max} step={step}
        style={{
          flex: 1, minWidth: 0, boxSizing: 'border-box',
          background: 'transparent', border: 'none', outline: 'none',
          padding: sm ? '8px 10px' : '8px 12px',
          fontSize: sm ? 13 : 14, fontWeight: filled ? (sm ? 700 : 600) : 400,
          color: t.textPrimary, fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

// Faux-select: styled button + popover so the closed control can show a muted
// unit suffix ("players", "years") next to the bold value. The menu renders in
// a portal (fixed-positioned from the button's rect) so it escapes the card's
// overflow:hidden clip. Closes on outside-click and on scroll/resize.
function Select({ value, onChange, options, suffix, width, isDark }) {
  const t = makeTheme(isDark);
  const [open, setOpen] = React.useState(false);
  const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0 });
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  function toggle() {
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
      <button ref={btnRef} type="button" onClick={toggle} style={{
        width: '100%', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        background: isDark ? '#1c2130' : '#fff', border: `1px solid ${t.border}`,
        borderRadius: tokens.radiusSm, padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{value}</span>
          {suffix && <span style={{ fontSize: 13, fontWeight: 400, color: t.textMuted }}>{suffix}</span>}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 1L5 5L9 1" stroke={t.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
          maxHeight: 220, overflowY: 'auto', boxSizing: 'border-box',
          background: isDark ? '#1c2130' : '#fff', border: `1px solid ${t.border}`,
          borderRadius: tokens.radiusSm, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          zIndex: 10000, padding: 4,
        }}>
          {options.map(opt => {
            const sel = String(opt) === String(value);
            return (
              <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: sel ? t.sectionBg : 'transparent', border: 'none', borderRadius: 4,
                  padding: '7px 8px', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13, fontWeight: sel ? 700 : 500, color: t.textPrimary,
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = t.sectionBg; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                {opt}{suffix ? ` ${suffix}` : ''}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Sport picker (choose-your-fighter) ─────────────────────────────────────
function SportPicker({ value, onChange, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: tokens.spaceSm }}>
      {Object.entries(SPORT_CONFIG).map(([id, cfg]) => {
        const sel = value === id;
        return (
          <button key={id} type="button" onClick={() => onChange(id)}
            className={`kh-fighter-card kh-fighter-card--${sel ? 'selected' : 'unselected'}`}
            style={{
              position: 'relative', height: 160, borderRadius: tokens.radiusMd,
              padding: '0 0 12px 0', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden',
              cursor: 'pointer', fontFamily: 'inherit',
              border: `${sel ? 2 : 1}px solid ${sel ? cfg.color : t.border}`,
              background: sel ? cfg.tint : (isDark ? '#1c2130' : '#fff'),
              boxShadow: sel ? `0 8px 20px ${cfg.color}33` : 'none',
            }}>
            {sel && (
              <div aria-hidden="true" style={{
                position: 'absolute', bottom: 38, left: '50%', transform: 'translateX(-50%)',
                width: 130, height: 130, borderRadius: '50%',
                background: `radial-gradient(circle, ${cfg.color}44 0%, transparent 65%)`,
                pointerEvents: 'none',
              }} />
            )}
            {sel && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%',
                background: cfg.color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, boxShadow: `0 2px 4px ${cfg.color}66`,
              }}>✓</span>
            )}
            <img className="kh-fighter-char" src={cfg.logo} alt="" height={108}
              style={{
                height: 108, width: 'auto', imageRendering: 'pixelated', display: 'block', position: 'relative',
                filter: sel ? `drop-shadow(0 6px 8px ${cfg.color}77)` : 'grayscale(0.65) opacity(0.55)',
              }} />
            <span style={{
              ...tokens.typeBody, fontSize: 14, fontWeight: 700, position: 'relative',
              color: sel ? cfg.color : t.textSecondary,
            }}>{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Draft-type tile (roomy RadioCard) ──────────────────────────────────────
function DraftTypeCard({ title, tagline, sample, isSnake, accent, active, onSelect, isDark }) {
  const t = makeTheme(isDark);
  return (
    <button type="button" onClick={onSelect} style={{
      position: 'relative', flex: 1, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      border: `${active ? 2 : 1}px solid ${active ? accent : t.border}`,
      background: active ? `${accent}0e` : (isDark ? '#1c2130' : '#fff'),
      borderRadius: tokens.radiusLg, padding: tokens.spaceLg,
      display: 'flex', flexDirection: 'column', gap: tokens.spaceSm,
      boxShadow: active ? `0 4px 14px ${accent}22` : 'none',
      transition: 'border-color 0.15s, background 0.15s, box-shadow 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceXs }}>
        <span style={{ ...tokens.typeHeadingCard, fontSize: 19, color: active ? accent : t.textPrimary }}>{title}</span>
        <span aria-hidden="true" style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${active ? accent : t.border}`,
          background: active ? accent : 'transparent',
          color: '#fff', fontSize: 10, fontWeight: 800,
        }}>{active ? '✓' : ''}</span>
      </div>
      <div style={{ ...tokens.typeBody, fontWeight: 500, color: t.textBody, lineHeight: 1.4 }}>{tagline}</div>
      <div style={{ ...tokens.typeLabelEyebrow, fontSize: 9.5, color: t.textMuted, marginTop: tokens.space2xs }}>Sample keeper</div>
      <div style={{ width: 180 }}>
        <SampleKeeperCell slot={sample} isSnake={isSnake} isDark={isDark} gridAccent={accent} />
      </div>
    </button>
  );
}

function SectionDivider({ label, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceSm, margin: `${tokens.spaceXl}px 0 ${tokens.spaceMd}px 0` }}>
      <span style={{ ...tokens.typeHeadingSection, color: t.textSecondary, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, borderTop: `1px dashed ${t.border}` }} />
    </div>
  );
}

// ── Step 1: Basics ──────────────────────────────────────────────────────────
function StepBasics({ s, dispatch, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceLg, maxWidth: 520 }}>
      <div>
        <FieldLabel t={t}>League name</FieldLabel>
        <Input value={s.name} onChange={e => dispatch({ type: 'set', patch: { name: e.target.value } })}
          placeholder="e.g. Beer League Bandits" width="100%" isDark={isDark} autoFocus />
      </div>
      <div>
        <FieldLabel t={t}>Sport</FieldLabel>
        <SportPicker value={s.sport} onChange={id => dispatch({ type: 'sport', sport: id })} isDark={isDark} />
      </div>
    </div>
  );
}

// ── Step 2: League Format ─────────────────────────────────────────────────
function StepFormat({ s, dispatch, isDark }) {
  const t = makeTheme(isDark);
  const isSnake = s.draftType === 'snake';
  return (
    <div>
      <FieldLabel t={t}>Draft type</FieldLabel>
      <FieldHelp t={t}>How your draft works. Branches the keeper rules below.</FieldHelp>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spaceLg, marginTop: tokens.spaceSm }}>
        <DraftTypeCard title="Auction" isSnake={false} sample={SAMPLE_AUCTION}
          tagline="Keepers cost dollars from your budget."
          accent={tokens.warning} active={s.draftType === 'auction'}
          onSelect={() => dispatch({ type: 'draftType', draftType: 'auction' })} isDark={isDark} />
        <DraftTypeCard title="Snake" isSnake={true} sample={SAMPLE_SNAKE}
          tagline="Keepers serve a fixed contract length."
          accent={tokens.info} active={s.draftType === 'snake'}
          onSelect={() => dispatch({ type: 'draftType', draftType: 'snake' })} isDark={isDark} />
      </div>

      {s.draftType && (
        <>
          <SectionDivider label="Keeper rules" t={t} />
          <div style={{ display: 'flex', gap: tokens.spaceMd, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <FieldLabel t={t}>Keeper slots</FieldLabel>
              <FieldHelp t={t}>Per team.</FieldHelp>
              <div style={{ marginTop: tokens.spaceXs }}>
                <Input size="sm" type="number" width={96} isDark={isDark} min={1} max={10} step={1}
                  value={s.keeperSlots}
                  onChange={e => dispatch({ type: 'set', patch: { keeperSlots: e.target.value === '' ? '' : Number(e.target.value) } })}
                  onBlur={e => dispatch({ type: 'set', patch: { keeperSlots: clamp(Number(e.target.value) || 1, 1, 10) } })} />
              </div>
            </div>

            {isSnake ? (
              <div>
                <FieldLabel t={t}>Contract length</FieldLabel>
                <FieldHelp t={t}>Years before a keeper expires.</FieldHelp>
                <div style={{ marginTop: tokens.spaceXs }}>
                  <Select value={s.contractYears} onChange={v => dispatch({ type: 'set', patch: { contractYears: Number(v) } })}
                    options={[2, 3, 4, 5]} suffix="years" width={120} isDark={isDark} />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <FieldLabel t={t}>Annual increase</FieldLabel>
                  <FieldHelp t={t}>Cost each year held.</FieldHelp>
                  <div style={{ marginTop: tokens.spaceXs }}>
                    <Input size="sm" type="number" prefix="+$" width={120} isDark={isDark} min={0} max={50} step={1}
                      value={s.auctionInflation}
                      onChange={e => dispatch({ type: 'set', patch: { auctionInflation: e.target.value === '' ? '' : Number(e.target.value) } })}
                      onBlur={e => dispatch({ type: 'set', patch: { auctionInflation: clamp(Number(e.target.value) || 0, 0, 50) } })} />
                  </div>
                </div>
                <div>
                  <FieldLabel t={t}>Auction budget</FieldLabel>
                  <FieldHelp t={t}>Per team, total cap.</FieldHelp>
                  <div style={{ marginTop: tokens.spaceXs }}>
                    <Input size="sm" type="number" prefix="$" width={128} isDark={isDark} min={50} max={1000} step={5}
                      value={s.budget}
                      onChange={e => dispatch({ type: 'set', patch: { budget: e.target.value === '' ? '' : Number(e.target.value) } })}
                      onBlur={e => dispatch({ type: 'set', patch: { budget: clamp(Number(e.target.value) || 50, 50, 1000) } })} />
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 3: Teams ──────────────────────────────────────────────────────────
function StepTeams({ s, dispatch, isDark }) {
  const t = makeTheme(isDark);
  const counts = [];
  for (let n = 4; n <= 20; n += 2) counts.push(n);
  const names = s.teamNames.slice(0, s.teamCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceLg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceMd, flexWrap: 'wrap' }}>
        <div>
          <FieldLabel t={t}>Team count</FieldLabel>
          <Select value={s.teamCount} onChange={v => dispatch({ type: 'teamCount', count: Number(v) })}
            options={counts} suffix="teams" width={160} isDark={isDark} />
        </div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, fontStyle: 'italic', flex: 1, minWidth: 200, alignSelf: 'flex-end', paddingBottom: 8 }}>
          Adjust to grow or shrink the list. Names are editable below.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: tokens.spaceMd, flexWrap: 'wrap' }}>
        <span style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>Team names ({s.teamCount})</span>
        <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>You're commissioner of team #1 by default.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: tokens.spaceSm, maxWidth: 640, maxHeight: 300, overflowY: 'auto' }}>
        {names.map((nm, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: tokens.spaceSm, minWidth: 0, boxSizing: 'border-box',
            background: isDark ? '#1c2130' : '#fff', border: `1px solid ${t.border}`,
            borderRadius: tokens.radiusMd, padding: '8px 12px',
          }}>
            <span style={{
              width: 24, height: 24, flexShrink: 0, borderRadius: tokens.radiusSm,
              background: t.sectionBg, color: t.textSecondary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, fontWeight: 800,
            }}>{i + 1}</span>
            <input
              value={nm}
              onChange={e => dispatch({ type: 'teamName', i, value: e.target.value })}
              onBlur={e => { if (!e.target.value.trim()) dispatch({ type: 'teamName', i, value: `Team ${i + 1}` }); }}
              placeholder={`Team ${i + 1}`}
              style={{
                flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 13, fontWeight: 600, color: t.textPrimary, fontFamily: 'inherit',
              }} />
            {i === 0 && (
              <span style={{
                ...tokens.typePillEmphatic, fontSize: 9.5, flexShrink: 0,
                background: `${tokens.info}14`, color: tokens.info, border: `1px solid ${tokens.info}55`,
                borderRadius: tokens.radiusPill, padding: '2px 8px',
              }}>Commish</span>
            )}
          </div>
        ))}
      </div>

      <div style={{
        maxWidth: 640, border: `1px dashed ${t.border}`, borderRadius: tokens.radiusMd,
        padding: '10px 12px', ...tokens.typeBodyMeta, color: t.textMuted, lineHeight: 1.5,
      }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Heads up —</span> Placeholder names for your own tracking — not pulled from Yahoo. Use whatever you actually call each team.
      </div>
    </div>
  );
}

// ── Step 4: Review ───────────────────────────────────────────────────────
function ReviewRow({ label, value, t, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: tokens.spaceMd, padding: `${tokens.spaceXs}px 0`,
      borderBottom: last ? 'none' : `1px dashed ${t.dividerFaint}`,
    }}>
      <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, width: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ ...tokens.typeBody, fontWeight: 600, color: t.textPrimary }}>{value}</span>
    </div>
  );
}

function ReviewSection({ title, accent, onEdit, editLabel, t, isDark, children }) {
  return (
    <div style={{ background: isDark ? '#1c2130' : '#fff', border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, padding: tokens.spaceMd }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceMd, marginBottom: tokens.spaceXs }}>
        <span style={{ ...tokens.typeLabelEyebrow, color: accent }}>{title}</span>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...tokens.typeBodyMeta, fontWeight: 700, color: accent }}>
          {editLabel} →
        </button>
      </div>
      {children}
    </div>
  );
}

function StepReview({ s, dispatch, isDark, accent }) {
  const t = makeTheme(isDark);
  const isSnake = s.draftType === 'snake';
  const names = s.teamNames.slice(0, s.teamCount);
  const teamsLine = names.length <= 4
    ? names.join(', ')
    : <>{names.slice(0, 4).join(', ')}<span style={{ color: t.textMuted }}>{` …and ${names.length - 4} more`}</span></>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceSm, maxWidth: 560 }}>
      <div style={{ ...tokens.typeBody, color: t.textSecondary, marginTop: -tokens.spaceSm, marginBottom: tokens.spaceMd }}>
        Last look before we cut the card. Click <span style={{ color: accent, fontWeight: 700 }}>Edit</span> on any section to jump back.
      </div>

      <ReviewSection title="Basics" accent={accent} editLabel="Edit step 1" onEdit={() => dispatch({ type: 'goto', step: 0 })} t={t} isDark={isDark}>
        <ReviewRow t={t} label="Name" value={s.name.trim() || 'Untitled League'} />
        <ReviewRow t={t} label="Sport" value={SPORT_CONFIG[s.sport]?.label || '—'} last />
      </ReviewSection>

      <ReviewSection title="League format" accent={accent} editLabel="Edit step 2" onEdit={() => dispatch({ type: 'goto', step: 1 })} t={t} isDark={isDark}>
        <ReviewRow t={t} label="Draft type" value={isSnake ? 'Snake' : 'Auction'} />
        {isSnake ? (
          <ReviewRow t={t} label="Contract length" value={`${s.contractYears} years`} />
        ) : (
          <>
            <ReviewRow t={t} label="Budget per team" value={`$${s.budget}`} />
            <ReviewRow t={t} label="Annual increase" value={`+$${s.auctionInflation} per year held`} />
          </>
        )}
        <ReviewRow t={t} label="Keeper slots" value={`${s.keeperSlots} players`} last />
      </ReviewSection>

      <ReviewSection title="Teams" accent={accent} editLabel="Edit step 3" onEdit={() => dispatch({ type: 'goto', step: 2 })} t={t} isDark={isDark}>
        <ReviewRow t={t} label="Count" value={`${s.teamCount} teams`} />
        <div style={{ ...tokens.typeBody, fontWeight: 500, color: t.textPrimary, lineHeight: 1.6, paddingTop: tokens.spaceXs }}>{teamsLine}</div>
      </ReviewSection>

      <div style={{
        background: t.warningBg, border: `1px solid ${tokens.warning}4d`, borderRadius: tokens.radiusMd,
        padding: tokens.spaceMd, display: 'flex', alignItems: 'flex-start', gap: tokens.spaceSm,
      }}>
        <img src="/mascot-empty.png" alt="" height={36} style={{ height: 36, width: 'auto', imageRendering: 'pixelated', flexShrink: 0 }} />
        <div style={{ ...tokens.typeBodyMeta, color: t.textBody, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: tokens.warning }}>Next up — </span>
          once your league is created, set up buy-ins, payouts and player invites from the league overview.
        </div>
      </div>
    </div>
  );
}

// ── Left rail ──────────────────────────────────────────────────────────────
function LeftRail({ step, accent, onGoto, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceXs }}>
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        const clickable = i <= step;
        return (
          <button key={label} type="button" disabled={!clickable} onClick={() => clickable && onGoto(i)} style={{
            display: 'flex', alignItems: 'center', gap: tokens.spaceSm,
            background: active ? `${accent}14` : 'transparent',
            border: active ? `1px solid ${accent}55` : '1px solid transparent',
            borderRadius: tokens.radiusMd, padding: '8px 10px',
            cursor: clickable ? 'pointer' : 'default', fontFamily: 'inherit', textAlign: 'left', width: '100%',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
              background: done ? tokens.success : active ? accent : (isDark ? '#1c2130' : '#fff'),
              color: done ? '#0f2018' : active ? '#fff' : t.textMuted,
              border: done ? 'none' : active ? 'none' : `1px solid ${t.border}`,
            }}>{done ? '✓' : i + 1}</span>
            <span style={{ ...tokens.typeBody, fontWeight: active ? 700 : 500, color: active ? t.textPrimary : t.textSecondary }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Wizard shell ───────────────────────────────────────────────────────────
function CreateLeagueWizard({ isDark, existingLeagues, onCreate, onCancel }) {
  const t = makeTheme(isDark);
  const [s, dispatch] = React.useReducer(reducer, undefined, makeInitial);
  const accent = SPORT_CONFIG[s.sport]?.color || tokens.info;
  const canContinue = stepValid(s, s.step);
  const isReview = s.step === 3;
  const preview = React.useMemo(() => buildPreview(s), [s]);

  function handleCreate() {
    onCreate(buildLeague(s, existingLeagues));
  }

  const backBtn = {
    border: `1px solid ${t.border}`, background: 'transparent', color: t.textSecondary,
    borderRadius: tokens.radiusMd, padding: '9px 18px', ...tokens.typePill, cursor: 'pointer', fontFamily: 'inherit',
  };
  const primaryBtn = {
    border: 'none', background: accent, color: '#fff', borderRadius: tokens.radiusMd,
    padding: isReview ? '11px 24px' : '9px 20px', ...tokens.typePill, fontWeight: 700,
    fontSize: isReview ? 13 : 11,
    boxShadow: `0 2px 0 ${accent}88`, cursor: 'pointer', fontFamily: 'inherit',
  };
  const colMuted = isDark ? 'rgba(255,255,255,0.03)' : '#fafbfc';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: tokens.space2xl }}>
      <style>{CARD_STYLES}</style>
      <style>{WIZARD_STYLES}</style>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: tokens.spaceMd, marginBottom: tokens.spaceLg, flexWrap: 'wrap' }}>
        <h1 style={{ ...tokens.typeHeadingPage, color: t.textPrimary, margin: 0 }}>Create new league</h1>
        <button type="button" onClick={onCancel} style={{ ...tokens.typeBodyMeta, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
      </div>

      {/* Card */}
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg,
        overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr) 320px', alignItems: 'start' }}>
          {/* Rail */}
          <div style={{ background: colMuted, borderRight: `1px solid ${t.divider}`, padding: `${tokens.spaceXl}px ${tokens.spaceSm}px` }}>
            <LeftRail step={s.step} accent={accent} onGoto={i => dispatch({ type: 'goto', step: i })} isDark={isDark} />
          </div>

          {/* Form column */}
          <div style={{ minWidth: 0, padding: `${tokens.spaceXl}px ${tokens.space2xl}px` }}>
            <div style={{ ...tokens.typeLabelEyebrow, color: accent }}>Step {s.step + 1} of 4</div>
            <h2 style={{ ...tokens.typeHeadingCard, fontSize: 20, color: t.textPrimary, margin: `${tokens.space2xs}px 0 ${tokens.spaceLg}px` }}>
              {STEP_TITLES[s.step]}
            </h2>

            {s.step === 0 && <StepBasics s={s} dispatch={dispatch} isDark={isDark} />}
            {s.step === 1 && <StepFormat s={s} dispatch={dispatch} isDark={isDark} />}
            {s.step === 2 && <StepTeams s={s} dispatch={dispatch} isDark={isDark} />}
            {s.step === 3 && <StepReview s={s} dispatch={dispatch} isDark={isDark} accent={accent} />}

            {/* Footer — not pinned; sits below the last field */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.spaceSm, marginTop: tokens.space2xl }}>
              <button type="button" onClick={() => dispatch({ type: 'back' })} disabled={s.step === 0}
                style={{ ...backBtn, opacity: s.step === 0 ? 0.5 : 1, cursor: s.step === 0 ? 'not-allowed' : 'pointer' }}>
                Back
              </button>
              {isReview ? (
                <button type="button" onClick={handleCreate} style={primaryBtn}>Create league ✓</button>
              ) : (
                <button type="button" onClick={() => canContinue && dispatch({ type: 'next' })} disabled={!canContinue}
                  style={{ ...primaryBtn, opacity: canContinue ? 1 : 0.5, cursor: canContinue ? 'pointer' : 'not-allowed' }}>
                  Continue
                </button>
              )}
            </div>
          </div>

          {/* Live preview column */}
          <div style={{ background: colMuted, borderLeft: `1px solid ${t.divider}`, padding: tokens.spaceXl }}>
            <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.spaceSm }}>Live preview</div>
            <TradingCard league={preview} isDark={isDark} state={isReview ? 'ready' : 'building'} />
          </div>
        </div>
      </div>
    </div>
  );
}

export { CreateLeagueWizard, buildLeague };
