import React from 'react';
import { Check, Repeat, Gavel, Square, Ticket, DollarSign, Infinity as InfinityIcon, CalendarClock, ArrowUp, ArrowDown } from 'lucide-react';
import { SPORT_CONFIG, tokens, makeTheme, TradingCard, CARD_STYLES, Input, Select, NumberInput, Button } from './components.jsx';
import { COST_SLOT, COST_PICKS, COST_AUCTION, TERM_NONE, TERM_FIXED, keeperArchetypeOf } from './lib/keeperRules.js';

// Create New League.
//
// Five FIXED rail phases — Basics · League type · Keeper rules · Teams ·
// Review — identical on every path. The rail never grows, shrinks or reorders
// based on answers; sub-screens share their phase's rail row and keep it
// highlighted. There is deliberately no "Step N of M" anywhere: the screen
// count varies by cost model, so a counter would be a moving target.
//
// The keeper rules are two INDEPENDENT dimensions asked one question per
// screen — what keeping costs (a slot / a pick / dollars) and whether the keep
// has a term. The old three-way archetype fork could not express "auction
// dollars with three-year terms"; this can.
//
// Out of scope for this arc and unchanged: StepBasics, SportPicker, StepTeams.

const PHASES = ['Basics', 'League type', 'Keeper rules', 'Teams', 'Review'];
const PHASE_TITLES = {
  basics: 'The basics',
  format: 'How does your draft run?',
  count: 'How many keepers can each team have?',
  cost: 'What does keeping a player cost?',
  picksWhich: 'Which pick does a keeper cost you?',
  picksDials: 'How does that cost change?',
  auction: 'How do keeper prices move?',
  term: 'Do keepers have term?',
  teams: 'Teams',
  review: 'Review & create',
};

// Mobile breakpoint for the wizard — matches where the three-column card
// collapses to a single column.
const MOBILE_Q = '(max-width: 760px)';

// Description-block reserves (spec §2), MEASURED in Chromium at both
// breakpoints rather than estimated — see the derivation rule below.
//
// Reserve = tallest measured state (which already includes the control slot)
// rounded up to a multiple of 4, plus one body line (20px) of headroom.
// Measured tallest state, all three screens: 83px desktop / 111px mobile
// (the mobile 111 is any two-line body; the term screen's revealed Select
// fits inside the reserved control slot, which is why it doesn't measure
// taller than a no-control state — that is the unconditional slot working).
//   desktop  84 + 20 = 104
//   mobile  112 + 20 = 132
// All three screens currently measure the same, so all three reserves are
// equal; they keep separate classes so a future copy change can diverge per
// screen. If a copy edit pushes a state past its reserve, RE-MEASURE and
// raise the reserve — never trim it toward the shortest state.
//
// The control slot is reserved UNCONDITIONALLY — states revealing no control
// render an empty slot — because a min-height alone pads short states but
// still lets a tall one push past.
const WIZARD_STYLES = `
  .kh-fighter-card { transition: background 0.2s, border-color 0.2s, box-shadow 0.25s, transform 0.2s; }
  .kh-fighter-card--unselected:hover { background: rgba(0,0,0,0.025); transform: translateY(-1px); }
  .kh-fighter-card--selected .kh-fighter-char { animation: kh-bob 1.4s ease-in-out infinite; }

  .kh-wz-desc--format, .kh-wz-desc--cost, .kh-wz-desc--term { min-height: 104px; }
  .kh-wz-slot { min-height: 34px; display: flex; align-items: center; }

  /* Option strip: a GRID, never inline flow. Desktop is equal-width columns
     on one row — every option the same width regardless of label length, so
     the row can't wrap and the pills can't read as ragged. Mobile is one
     full-width option per row. Grid rows stretch, so a pill whose label wraps
     lifts all of them to the same height rather than staggering. */
  .kh-wz-strip {
    display: grid; gap: 8px;
    grid-auto-flow: column; grid-auto-columns: 1fr;
    align-items: stretch;
  }

  /* Between-group gap, visibly larger than the label-to-control gap — that
     contrast is what separates the decisions. */
  .kh-wz-groups { display: flex; flex-direction: column; gap: 30px; }

  .kh-wz-grid { display: grid; grid-template-columns: 200px minmax(0, 1fr) 320px; align-items: start; }
  .kh-wz-mobile-only { display: none; }

  @media (max-width: 760px) {
    .kh-wz-desc--format, .kh-wz-desc--cost, .kh-wz-desc--term { min-height: 132px; }
    .kh-wz-slot { min-height: 44px; }
    .kh-wz-groups { gap: 24px; }
    .kh-wz-grid { grid-template-columns: minmax(0, 1fr); }
    .kh-wz-strip { grid-auto-flow: row; grid-auto-columns: auto; grid-template-columns: minmax(0, 1fr); }
    .kh-wz-rail, .kh-wz-preview { display: none; }
    .kh-wz-mobile-only { display: block; }
  }
`;

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

function useMediaQuery(query) {
  const [matches, setMatches] = React.useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = e => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// ── Wizard state ───────────────────────────────────────────────────────────
// Every cost model's values live side by side and are NEVER cleared when the
// cost model changes. Switching to picks and back to auction returns you to
// the numbers you typed. (The saved league still writes only the active
// model's rule block — see buildLeague.)
function makeInitial() {
  return {
    step: 0,
    name: '',
    sport: '',
    season: seasonOptions('')[0],

    draftType: 'snake',            // ASKED on League type; never derived

    keeperSlots: 4,
    minKeepers: 0,
    mustFillSlots: false,

    keeperCostModel: COST_PICKS,   // default per spec §4

    pickSubModel: 'draftedRound',
    pickEscalation: 1,
    pickCollision: 'earlier',

    auctionInflation: 5,
    undraftedStartCost: 5,
    budget: 200,                   // not asked; carried at its existing default

    termModel: TERM_NONE,
    termYears: 3,

    // The preview pill holds each half back until its screen is answered.
    costAnswered: false,
    termAnswered: false,

    teamCount: 10,
    teamNames: Array.from({ length: 10 }, (_, i) => `Team ${i + 1}`),
  };
}

// The screen list is derived from the answers. Slot-only skips specifics
// entirely; auction gets one specifics screen; draft picks splits its
// specifics across two (3a which pick, 3b the dials).
function screensOf(s) {
  const list = [
    { id: 'basics', phase: 0 },
    { id: 'format', phase: 1 },
    { id: 'count', phase: 2 },
    { id: 'cost', phase: 2 },
  ];
  if (s.keeperCostModel === COST_PICKS) {
    list.push({ id: 'picksWhich', phase: 2 }, { id: 'picksDials', phase: 2 });
  } else if (s.keeperCostModel === COST_AUCTION) {
    list.push({ id: 'auction', phase: 2 });
  }
  list.push({ id: 'term', phase: 2 }, { id: 'teams', phase: 3 }, { id: 'review', phase: 4 });
  return list;
}

function reducer(s, a) {
  switch (a.type) {
    case 'set': return { ...s, ...a.patch };
    case 'goto': return { ...s, step: clamp(a.step, 0, screensOf(s).length - 1) };
    case 'next': {
      const screens = screensOf(s);
      const cur = screens[s.step];
      // Answering is what reveals each half of the preview pill.
      const patch = {};
      if (cur?.id === 'cost') patch.costAnswered = true;
      if (cur?.id === 'term') patch.termAnswered = true;
      return { ...s, ...patch, step: Math.min(screens.length - 1, s.step + 1) };
    }
    case 'back': return { ...s, step: Math.max(0, s.step - 1) };
    case 'sport': return { ...s, sport: a.sport, season: seasonOptions(a.sport)[0] };
    // Cost-model switches PRESERVE every other model's values. Nothing is
    // cleared: there is no version history here, so a rule change must never
    // be the reason a number becomes unrecoverable.
    case 'costModel': return { ...s, keeperCostModel: a.value };
    case 'keeperSlots': {
      const max = clamp(a.value, 1, 10);
      return { ...s, keeperSlots: max, minKeepers: s.mustFillSlots ? max : Math.min(s.minKeepers, max) };
    }
    case 'mustFillSlots':
      return { ...s, mustFillSlots: a.value, minKeepers: a.value ? s.keeperSlots : 0 };
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

// Every screen is pre-filled, so only the two free-text screens can be invalid.
function screenValid(s, id) {
  if (id === 'basics') return s.name.trim().length > 0 && s.sport !== '';
  if (id === 'teams') return s.teamNames.slice(0, s.teamCount).every(n => n.trim().length > 0);
  return true;
}

// ── Output shapes ────────────────────────────────────────────────────────
function buildLeague(s, existing) {
  const teams = s.teamNames.slice(0, s.teamCount).map((nm, i) => ({
    id: `t${i + 1}`,
    name: (nm || '').trim() || `Team ${i + 1}`,
    paid: false,
    keepersSubmitted: false,
    keepers: [],
    ...(i === 0 ? { isCommissioner: true } : {}),
  }));

  const termed = s.termModel === TERM_FIXED;
  const termYears = termed ? s.termYears : null;

  const league = {
    id: uniqueId(slugify(s.name || ''), existing),
    name: (s.name || '').trim() || 'Untitled League',
    sport: s.sport,
    season: s.season,
    teamCount: s.teamCount,

    // Draft FORMAT — asked directly, never inferred from the keeper rules.
    draftType: s.draftType,

    keeperSlots: s.keeperSlots,
    minKeepers: s.mustFillSlots ? s.keeperSlots : s.minKeepers,
    mustFillSlots: s.mustFillSlots,
    // Legacy mirror of mustFillSlots — the keeper grid's "X/Y required"
    // warning still reads this key.
    contractsRequired: s.mustFillSlots,

    keeperCostModel: s.keeperCostModel,

    termModel: s.termModel,
    termYears,
    termMinYears: null,   // RESERVED — "owners choose, within limits" not shipped
    termMaxYears: null,   // RESERVED

    // Never asked; written disabled so the rules engine has a shape to read.
    // Surfaced in the Review callout and Settings-editable later.
    rookieRules: { enabled: false, extraYears: 1, escalationPerYear: 0, freeFirstYear: false },

    // Legacy writes that keep existing surfaces working. keeperTimeCap is now
    // just a mirror of the term — there is no separate consecutive-years
    // ceiling, because an expiring term sends the player back to the draft.
    contractYears: termYears,
    keeperTimeCap: termYears,
    // Derived only where a legacy archetype unambiguously exists. Slot + no
    // term has none, so it is null rather than forced onto a wrong value.
    keeperArchetype: keeperArchetypeOf(s.keeperCostModel, s.termModel),

    buyIn: 0,
    totalPool: 0,
    commishFee: 0,
    status: 'pre-draft',
    draftDate: null,
    playoffTeams: 6,
    bottomLotteryTeams: 4,
    payouts: { standings: [], other: [] },
    payoutNote: '',
    commissionerTeamId: teams[0].id,
    createdAt: new Date().toISOString(),
    teams,
  };

  // Only the selected cost model's rule block is written at creation. A brand
  // new league has no prior values to preserve, and an unused auctionRules
  // block on a slot league would be a misleading legacy signal (it is exactly
  // what the read shim treats as "this is an auction league" for pre-wizard
  // rows). Preservation applies from here on — see Settings' saveRules.
  if (s.keeperCostModel === COST_AUCTION) {
    league.auctionRules = {
      costIncreasePerYear: s.auctionInflation,
      undraftedStartCost: s.undraftedStartCost,
      budget: s.budget,
      minBid: 1,
    };
  }
  if (s.keeperCostModel === COST_PICKS) {
    league.pickRules = {
      subModel: s.pickSubModel,
      escalationPerYear: s.pickEscalation,
      // Never asked — the pick-cost engine needs a round for undrafted
      // players and the answer is the last round in essentially every league.
      waiverRound: 'last',
      // Collisions can't happen when slots are assigned in order.
      ...(s.pickSubModel === 'topSlots' ? {} : { collision: s.pickCollision }),
    };
  }
  return league;
}

// Lighter object for the live TradingCard preview. `keeperRulesAnswered` holds
// each half of the rule pill back until its screen has been answered.
function buildPreview(s) {
  return {
    id: 'preview',
    name: s.name,
    sport: s.sport,
    season: s.season,
    draftType: s.draftType,
    teamCount: s.teamCount,
    keeperSlots: s.keeperSlots,
    keeperCostModel: s.keeperCostModel,
    termModel: s.termModel,
    termYears: s.termModel === TERM_FIXED ? s.termYears : null,
    keeperRulesAnswered: { cost: s.costAnswered, term: s.termAnswered },
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

// The screen title IS the question — no eyebrow above it, no section label
// repeating it beneath. A subtitle only where it earns its place.
function ScreenIntro({ subtitle, t }) {
  if (!subtitle) return null;
  return <div style={{ ...tokens.typeBody, color: t.textSecondary, marginBottom: tokens.spaceLg, maxWidth: 520, lineHeight: 1.5 }}>{subtitle}</div>;
}

// ── Option strip (the one new primitive) ──────────────────────────────────
// A compact horizontal strip of pills — label + small glyph — with one
// selected by default and selection shown by fill color. Real radiogroup
// semantics with a roving tabindex, so arrow keys move the selection; that is
// exactly the interaction the reserved description height exists to protect.
function OptionStrip({ label, options, value, onChange, accent, isDark }) {
  const t = makeTheme(isDark);
  const refs = React.useRef([]);
  const idx = Math.max(0, options.findIndex(o => o.value === value));

  function onKeyDown(e) {
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = options.length - 1;
    if (next == null) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="kh-wz-strip" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}
      style={{ maxWidth: 520 }}>
      {options.map((o, i) => {
        const sel = o.value === value;
        const Icon = o.Icon;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={sel}
            ref={el => { refs.current[i] = el; }}
            tabIndex={i === idx ? 0 : -1}
            onClick={() => onChange(o.value)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: tokens.spaceXs,
              minHeight: 44, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`,
              textAlign: 'center', boxSizing: 'border-box',
              borderRadius: tokens.radiusPill, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${sel ? accent : t.border}`,
              background: sel ? accent : (isDark ? '#1c2130' : '#fff'),
              color: sel ? '#fff' : t.textSecondary,
              ...tokens.typeBody, fontWeight: sel ? 700 : 500,
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}>
            {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// The single description block that sits below a strip at a fixed position.
// It swaps content on selection change and never changes height: `variant`
// picks the reserve, and the control slot is always rendered even when the
// selected state reveals no control.
function OptionDescription({ variant, title, body, control }) {
  return (
    <div className={`kh-wz-desc kh-wz-desc--${variant}`} aria-live="polite"
      style={{ marginTop: tokens.spaceMd, maxWidth: 520 }}>
      <OptionDescriptionBody title={title} body={body} control={control} />
    </div>
  );
}

function OptionDescriptionBody({ title, body, control }) {
  const t = makeTheme(useIsDark());
  return (
    <>
      <div style={{ ...tokens.typeBody, fontWeight: 700, color: t.textPrimary }}>{title}</div>
      <div style={{ ...tokens.typeBodyMeta, color: t.textSecondary, marginTop: tokens.space2xs, lineHeight: 1.5 }}>{body}</div>
      <div className="kh-wz-slot" style={{ marginTop: tokens.spaceSm }}>{control || null}</div>
    </>
  );
}

// Small context so the description body can theme itself without every screen
// threading isDark through two more layers.
const DarkContext = React.createContext(false);
function useIsDark() { return React.useContext(DarkContext); }

// ── CostPath — what a keep costs over successive years ────────────────────
function CostPath({ s, isDark }) {
  const t = makeTheme(isDark);
  const termed = s.termModel === TERM_FIXED;
  let beats = [];
  let note = null;

  if (s.keeperCostModel === COST_AUCTION) {
    const base = 58;
    const bump = Number(s.auctionInflation) || 0;
    // Four beats: year-over-year compounding is what commissioners misjudge,
    // and three hides it.
    beats = [
      `Drafted $${base}`,
      `Keep for $${base + bump}`,
      `Then $${base + bump * 2}`,
      `Then $${base + bump * 3}`,
    ];
    note = termed
      ? 'His term ends before the price runs away.'
      : `…by year four he costs $${bump * 3} over draft price, and it keeps climbing.`;
  } else if (s.keeperCostModel === COST_PICKS) {
    const step = Number(s.pickEscalation) || 0;
    const start = s.pickSubModel === 'topSlots' ? 1 : 3;
    const seq = [start];
    for (let i = 0; i < 2; i++) seq.push(Math.max(1, seq[seq.length - 1] - step));
    beats = seq.map(r => `Round ${r}`);
    note = step > 0 ? 'He can’t get pricier than round 1.' : 'A flat cost — the round never moves.';
  } else if (termed) {
    const n = Number(s.termYears) || 3;
    beats = [...Array.from({ length: Math.min(n, 3) }, (_, i) => `Yr ${i + 1} of ${n}`), 'Back to draft'];
  } else {
    // A no-term league shows the cost repeating flat — a countdown would be a
    // lie when nothing counts down.
    beats = ['1 slot', '1 slot', '1 slot', 'and on'];
  }

  return (
    <div>
      <FieldLabel t={t}>What it costs you</FieldLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, flexWrap: 'wrap', marginTop: tokens.space2xs }}>
        {beats.map((b, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span aria-hidden="true" style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>→</span>}
            <span style={{
              ...tokens.typeBodyMeta, fontWeight: 700, color: t.textSecondary,
              background: t.sectionBg, border: `1px solid ${t.border}`,
              borderRadius: tokens.radiusSm, padding: '4px 9px', whiteSpace: 'nowrap',
            }}>{b}</span>
          </React.Fragment>
        ))}
      </div>
      {note && <FieldHelp t={t}>{note}</FieldHelp>}
    </div>
  );
}

// ── Round grid (screen 3a) ────────────────────────────────────────────────
// A compressed R1–R3 grid plus a "⋯ R4, R5 …" cue, stacked under the copy.
function RoundGrid({ highlight, accent, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: tokens.spaceSm }}>
      {[1, 2, 3].map(r => {
        const on = highlight.includes(r);
        return (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ ...tokens.typeStatMeta, color: t.textMuted, width: 20, flexShrink: 0 }}>R{r}</span>
            {Array.from({ length: 6 }, (_, c) => (
              <span key={c} style={{
                width: 16, height: 8, borderRadius: 2,
                background: on && c === 0 ? accent : t.sectionBg,
                border: `1px solid ${on && c === 0 ? accent : t.border}`,
              }} />
            ))}
          </div>
        );
      })}
      <div style={{ ...tokens.typeStatMeta, color: t.textMuted, marginTop: 2 }}>⋯ R4, R5 …</div>
    </div>
  );
}

function PickCard({ title, body, highlight, accent, active, onSelect, isDark }) {
  const t = makeTheme(isDark);
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onSelect} style={{
      flex: 1, minWidth: 210, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      border: `${active ? 2 : 1}px solid ${active ? accent : t.border}`,
      background: active ? `${accent}0e` : (isDark ? '#1c2130' : '#fff'),
      borderRadius: tokens.radiusLg, padding: tokens.spaceMd,
      display: 'flex', flexDirection: 'column', gap: tokens.space2xs,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceXs }}>
        <span style={{ ...tokens.typeBody, fontWeight: 700, color: active ? accent : t.textPrimary }}>{title}</span>
        <span aria-hidden="true" style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${active ? accent : t.border}`,
          background: active ? accent : 'transparent', color: '#fff',
        }}>{active && <Check size={11} strokeWidth={2.5} />}</span>
      </div>
      <div style={{ ...tokens.typeBodyMeta, color: t.textSecondary, lineHeight: 1.5 }}>{body}</div>
      <RoundGrid highlight={highlight} accent={accent} isDark={isDark} />
    </button>
  );
}

// ── Sport picker (choose-your-fighter) — OUT OF SCOPE, unchanged ──────────
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
                boxShadow: `0 2px 4px ${cfg.color}66`,
              }}><Check size={12} strokeWidth={2.25} /></span>
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

// ── Basics — OUT OF SCOPE, unchanged ──────────────────────────────────────
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

// ── League type — draft format ────────────────────────────────────────────
const FORMAT_OPTIONS = [
  { value: 'snake', label: 'Snake', Icon: Repeat },
  { value: 'auction', label: 'Auction', Icon: Gavel },
];
const FORMAT_COPY = {
  snake: { title: 'Picks go round by round', body: 'Draft order snakes back and forth each round.' },
  auction: { title: 'Everyone bids on every player', body: 'Each team spends from a budget instead of drafting in order.' },
};

function ScreenFormat({ s, dispatch, isDark, accent }) {
  const t = makeTheme(isDark);
  const copy = FORMAT_COPY[s.draftType] || FORMAT_COPY.snake;
  return (
    <div>
      <ScreenIntro t={t} subtitle="This sets how the draft itself runs — it doesn’t decide what keeping costs." />
      <OptionStrip label="Draft format" options={FORMAT_OPTIONS} value={s.draftType} accent={accent} isDark={isDark}
        onChange={v => dispatch({ type: 'set', patch: { draftType: v } })} />
      <OptionDescription variant="format" title={copy.title} body={copy.body} />
    </div>
  );
}

// ── Keeper rules · 1 — count ──────────────────────────────────────────────
function ScreenCount({ s, dispatch, isDark }) {
  const t = makeTheme(isDark);
  const maxOpts = Array.from({ length: 10 }, (_, i) => i + 1);
  const minOpts = Array.from({ length: s.keeperSlots + 1 }, (_, i) => i);
  return (
    <div>
      <ScreenIntro t={t} subtitle="Everything here has a sensible default — change what matters to your league and skip the rest." />
      <div className="kh-wz-groups">
        <div style={{ display: 'flex', gap: tokens.spaceXl, flexWrap: 'wrap' }}>
          <div>
            <FieldLabel t={t}>Most</FieldLabel>
            <Select value={s.keeperSlots} onChange={v => dispatch({ type: 'keeperSlots', value: Number(v) })}
              options={maxOpts} suffix="keepers" width={150} isDark={isDark} />
          </div>
          <div>
            <FieldLabel t={t}>Fewest</FieldLabel>
            <Select value={s.minKeepers} onChange={v => dispatch({ type: 'set', patch: { minKeepers: Number(v) } })}
              options={minOpts} suffix="keepers" width={150} isDark={isDark} disabled={s.mustFillSlots} />
          </div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spaceXs, cursor: 'pointer', ...tokens.typeBody, color: t.textBody }}>
          <input type="checkbox" checked={s.mustFillSlots}
            onChange={e => dispatch({ type: 'mustFillSlots', value: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: tokens.info, cursor: 'pointer' }} />
          Every team must fill all {s.keeperSlots} slots
        </label>
      </div>
    </div>
  );
}

// ── Keeper rules · 2 — what keeping costs ─────────────────────────────────
const COST_OPTIONS = [
  { value: COST_SLOT, label: 'A keeper slot only', Icon: Square },
  { value: COST_PICKS, label: 'A draft pick', Icon: Ticket },
  { value: COST_AUCTION, label: 'Auction dollars', Icon: DollarSign },
];
const COST_COPY = {
  [COST_SLOT]: { title: 'The slot is the whole cost', body: 'No pick changes hands and no price follows him around.' },
  [COST_PICKS]: { title: 'Keeping costs you a draft pick', body: 'Every keeper eats one of your picks in the next draft.' },
  [COST_AUCTION]: { title: 'Keeping costs what he was paid for', body: 'His auction price travels with him, usually climbing each year.' },
};

function ScreenCost({ s, dispatch, isDark, accent }) {
  const t = makeTheme(isDark);
  const copy = COST_COPY[s.keeperCostModel];
  return (
    <div>
      <ScreenIntro t={t} subtitle="This sets whether the rest talks in dollars or rounds." />
      <OptionStrip label="What keeping costs" options={COST_OPTIONS} value={s.keeperCostModel} accent={accent} isDark={isDark}
        onChange={v => dispatch({ type: 'costModel', value: v })} />
      <OptionDescription variant="cost" title={copy.title} body={copy.body} />
    </div>
  );
}

// ── Keeper rules · 3a — which pick ────────────────────────────────────────
function ScreenPicksWhich({ s, dispatch, isDark, accent }) {
  return (
    <div role="radiogroup" aria-label="Which pick a keeper costs"
      style={{ display: 'flex', gap: tokens.spaceMd, flexWrap: 'wrap', maxWidth: 560 }}>
      <PickCard title="The round he was drafted in"
        body="A guy you took in round 3 costs your round-3 pick to keep."
        highlight={[3]} accent={accent} isDark={isDark}
        active={s.pickSubModel === 'draftedRound'}
        onSelect={() => dispatch({ type: 'set', patch: { pickSubModel: 'draftedRound' } })} />
      <PickCard title="Your top picks, in order"
        body="First keeper costs round 1, second costs round 2."
        highlight={[1, 2]} accent={accent} isDark={isDark}
        active={s.pickSubModel === 'topSlots'}
        onSelect={() => dispatch({ type: 'set', patch: { pickSubModel: 'topSlots' } })} />
    </div>
  );
}

// ── Keeper rules · 3b — the dials ─────────────────────────────────────────
const COLLISION_OPTIONS = [
  { value: 'earlier', label: 'Move one earlier', Icon: ArrowUp },
  { value: 'later', label: 'Move one later', Icon: ArrowDown },
];

function ScreenPicksDials({ s, dispatch, isDark, accent }) {
  const t = makeTheme(isDark);
  return (
    <div className="kh-wz-groups">
      <div>
        <FieldLabel t={t}>Climbs each year</FieldLabel>
        <Select value={s.pickEscalation} onChange={v => dispatch({ type: 'set', patch: { pickEscalation: Number(v) } })}
          options={[0, 1, 2, 3]} suffix="rounds / yr" width={180} isDark={isDark} />
      </div>
      {/* Hidden entirely on the top-picks sub-model, where slots are assigned
          in order and cannot collide. This is the one place a sub-label is
          warranted — it's a distinct decision, not a labelled field. */}
      {s.pickSubModel !== 'topSlots' && (
        <div>
          <FieldLabel t={t}>If two keepers land on the same round</FieldLabel>
          <OptionStrip label="Same-round tie-breaker" options={COLLISION_OPTIONS} value={s.pickCollision}
            accent={accent} isDark={isDark}
            onChange={v => dispatch({ type: 'set', patch: { pickCollision: v } })} />
        </div>
      )}
      <CostPath s={s} isDark={isDark} />
    </div>
  );
}

// ── Keeper rules · 3 — auction specifics ──────────────────────────────────
function ScreenAuction({ s, dispatch, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div className="kh-wz-groups">
      <div style={{ display: 'flex', gap: tokens.spaceXl, flexWrap: 'wrap' }}>
        <div>
          <FieldLabel t={t}>Yearly increase</FieldLabel>
          <NumberInput size="sm" prefix="+$" suffix="/ yr" width={150} isDark={isDark} min={0} max={50} step={1}
            value={s.auctionInflation}
            onChange={e => dispatch({ type: 'set', patch: { auctionInflation: e.target.value === '' ? '' : Number(e.target.value) } })}
            onBlur={e => dispatch({ type: 'set', patch: { auctionInflation: clamp(Number(e.target.value) || 0, 0, 50) } })} />
        </div>
        <div>
          <FieldLabel t={t}>Undrafted players cost</FieldLabel>
          <NumberInput size="sm" prefix="$" width={130} isDark={isDark} min={0} max={200} step={1}
            value={s.undraftedStartCost}
            onChange={e => dispatch({ type: 'set', patch: { undraftedStartCost: e.target.value === '' ? '' : Number(e.target.value) } })}
            onBlur={e => dispatch({ type: 'set', patch: { undraftedStartCost: clamp(Number(e.target.value) || 0, 0, 200) } })} />
        </div>
      </div>
      <CostPath s={s} isDark={isDark} />
    </div>
  );
}

// ── Keeper rules · 4 — term ───────────────────────────────────────────────
const TERM_OPTIONS = [
  { value: TERM_NONE, label: 'No term', Icon: InfinityIcon },
  { value: TERM_FIXED, label: 'Fixed term', Icon: CalendarClock },
];
const NO_TERM_BODY = {
  [COST_AUCTION]: 'A keeper stays yours until his price prices him out.',
  [COST_PICKS]: 'A keeper stays yours until the pick gets too pricey.',
  [COST_SLOT]: 'A keeper stays yours until you let him go.',
};

function ScreenTerm({ s, dispatch, isDark, accent }) {
  const fixed = s.termModel === TERM_FIXED;
  return (
    <div>
      <OptionStrip label="Keeper term" options={TERM_OPTIONS} value={s.termModel} accent={accent} isDark={isDark}
        onChange={v => dispatch({ type: 'set', patch: { termModel: v } })} />
      <OptionDescription
        variant="term"
        title={fixed ? 'Every keep runs the same length' : 'No term'}
        body={fixed ? 'When the term is up, he goes back into the draft.' : NO_TERM_BODY[s.keeperCostModel]}
        control={fixed ? (
          <Select value={s.termYears} onChange={v => dispatch({ type: 'set', patch: { termYears: Number(v) } })}
            options={[2, 3, 4, 5]} suffix="years" width={140} isDark={isDark} />
        ) : null}
      />
    </div>
  );
}

// ── Teams — OUT OF SCOPE, unchanged ───────────────────────────────────────
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

// ── Review ────────────────────────────────────────────────────────────────
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

function ReviewSection({ title, accent, onEdit, t, isDark, children }) {
  return (
    <div style={{ background: isDark ? '#1c2130' : '#fff', border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd, padding: tokens.spaceMd }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceMd, marginBottom: tokens.spaceXs }}>
        <span style={{ ...tokens.typeLabelEyebrow, color: accent }}>{title}</span>
        <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...tokens.typeBodyMeta, fontWeight: 700, color: accent }}>
          Edit →
        </button>
      </div>
      {children}
    </div>
  );
}

const COST_REVIEW_LABEL = {
  [COST_SLOT]: 'A keeper slot only',
  [COST_PICKS]: 'A draft pick',
  [COST_AUCTION]: 'Auction dollars',
};

function StepReview({ s, dispatch, isDark, accent, gotoPhase }) {
  const t = makeTheme(isDark);
  const names = s.teamNames.slice(0, s.teamCount);
  const teamsLine = names.length <= 4
    ? names.join(', ')
    : <>{names.slice(0, 4).join(', ')}<span style={{ color: t.textMuted }}>{` …and ${names.length - 4} more`}</span></>;
  const termed = s.termModel === TERM_FIXED;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceSm, maxWidth: 560 }}>
      <div style={{ ...tokens.typeBody, color: t.textSecondary, marginBottom: tokens.spaceMd }}>
        Last look before we cut the card. Click <span style={{ color: accent, fontWeight: 700 }}>Edit</span> on any section to jump back.
      </div>

      <ReviewSection title="Basics" accent={accent} onEdit={() => gotoPhase(0)} t={t} isDark={isDark}>
        <ReviewRow t={t} label="Name" value={s.name.trim() || 'Untitled League'} />
        <ReviewRow t={t} label="Sport" value={SPORT_CONFIG[s.sport]?.label || '—'} last />
      </ReviewSection>

      <ReviewSection title="League type" accent={accent} onEdit={() => gotoPhase(1)} t={t} isDark={isDark}>
        <ReviewRow t={t} label="Draft format" value={s.draftType === 'auction' ? 'Auction' : 'Snake'} last />
      </ReviewSection>

      <ReviewSection title="Keeper rules" accent={accent} onEdit={() => gotoPhase(2)} t={t} isDark={isDark}>
        <ReviewRow t={t} label="How many" value={
          s.mustFillSlots
            ? `Exactly ${s.keeperSlots} per team`
            : `${s.minKeepers}–${s.keeperSlots} per team`} />
        <ReviewRow t={t} label="Keeping costs" value={COST_REVIEW_LABEL[s.keeperCostModel]} />
        {s.keeperCostModel === COST_PICKS && (
          <>
            <ReviewRow t={t} label="Which pick" value={s.pickSubModel === 'topSlots' ? 'Your top picks, in order' : 'The round he was drafted in'} />
            <ReviewRow t={t} label="Climbs each year" value={`${s.pickEscalation} round${s.pickEscalation === 1 ? '' : 's'} / yr`} />
            {s.pickSubModel !== 'topSlots' && (
              <ReviewRow t={t} label="Same-round tie-break" value={s.pickCollision === 'later' ? 'Move one later' : 'Move one earlier'} />
            )}
          </>
        )}
        {s.keeperCostModel === COST_AUCTION && (
          <>
            <ReviewRow t={t} label="Yearly increase" value={`+$${s.auctionInflation} / yr`} />
            <ReviewRow t={t} label="Undrafted players cost" value={`$${s.undraftedStartCost}`} />
          </>
        )}
        <ReviewRow t={t} label="Term" value={termed ? `${s.termYears} years` : 'No term'} last />
      </ReviewSection>

      <ReviewSection title="Teams" accent={accent} onEdit={() => gotoPhase(3)} t={t} isDark={isDark}>
        <ReviewRow t={t} label="Count" value={`${s.teamCount} teams`} />
        <div style={{ ...tokens.typeBody, fontWeight: 500, color: t.textPrimary, lineHeight: 1.6, paddingTop: tokens.spaceXs }}>{teamsLine}</div>
      </ReviewSection>

      {/* The two never-asked settings. This is the ONLY signal a commissioner
          with a rookie rule gets before the league exists, so it is a full
          callout rather than fine print. */}
      <div style={{
        background: t.infoBg, border: `1px solid ${tokens.info}4d`, borderRadius: tokens.radiusMd,
        padding: tokens.spaceMd, marginTop: tokens.spaceXs,
      }}>
        <div style={{ ...tokens.typeBody, fontWeight: 700, color: tokens.info, marginBottom: tokens.space2xs }}>
          We set two things for you.
        </div>
        <div style={{ ...tokens.typeBodyMeta, color: t.textBody, lineHeight: 1.5 }}>
          Waiver pickups cost your last-round pick, and rookies get no special treatment.
          Both are changeable in Settings.
        </div>
      </div>
    </div>
  );
}

// Renders the screen for an id. Split out of the shell so the screen list and
// the renderer can't drift, and so tests can render every screen directly.
function WizardScreen({ id, s, dispatch, isDark, accent, gotoPhase }) {
  switch (id) {
    case 'basics': return <StepBasics s={s} dispatch={dispatch} isDark={isDark} />;
    case 'format': return <ScreenFormat s={s} dispatch={dispatch} isDark={isDark} accent={accent} />;
    case 'count': return <ScreenCount s={s} dispatch={dispatch} isDark={isDark} />;
    case 'cost': return <ScreenCost s={s} dispatch={dispatch} isDark={isDark} accent={accent} />;
    case 'picksWhich': return <ScreenPicksWhich s={s} dispatch={dispatch} isDark={isDark} accent={accent} />;
    case 'picksDials': return <ScreenPicksDials s={s} dispatch={dispatch} isDark={isDark} accent={accent} />;
    case 'auction': return <ScreenAuction s={s} dispatch={dispatch} isDark={isDark} />;
    case 'term': return <ScreenTerm s={s} dispatch={dispatch} isDark={isDark} accent={accent} />;
    case 'teams': return <StepTeams s={s} dispatch={dispatch} isDark={isDark} />;
    case 'review': return <StepReview s={s} dispatch={dispatch} isDark={isDark} accent={accent} gotoPhase={gotoPhase} />;
    default: return null;
  }
}

// ── Left rail — five FIXED phases on every path ───────────────────────────
function PhaseRail({ phase, maxPhase, accent, onGoto, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceXs }}>
      {PHASES.map((label, i) => {
        const active = i === phase;
        const done = i < maxPhase;
        const clickable = i <= maxPhase;
        return (
          <button key={label} type="button" disabled={!clickable} onClick={() => clickable && onGoto(i)}
            aria-current={active ? 'step' : undefined}
            style={{
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
              border: done || active ? 'none' : `1px solid ${t.border}`,
            }}>{done ? <Check size={12} strokeWidth={2.5} /> : i + 1}</span>
            <span style={{ ...tokens.typeBody, fontWeight: active ? 700 : 500, color: active ? t.textPrimary : t.textSecondary }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Mobile: a 5-segment progress bar plus the phase label alone — no counter.
function MobileProgress({ phase, isDark, accent }) {
  const t = makeTheme(isDark);
  return (
    <div className="kh-wz-mobile-only" style={{ marginBottom: tokens.spaceMd }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {PHASES.map((label, i) => (
          <span key={label} style={{
            flex: 1, height: 4, borderRadius: tokens.radiusPill,
            background: i <= phase ? accent : t.progressBg,
          }} />
        ))}
      </div>
      <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginTop: tokens.spaceXs }}>{PHASES[phase]}</div>
    </div>
  );
}

// Mobile: the 320px preview column collapses to a sticky footer summary bar
// that expands the full card upward as a bottom sheet. State persists across
// screens.
function MobilePreviewBar({ preview, isDark, ruleLine }) {
  const t = makeTheme(isDark);
  const [open, setOpen] = React.useState(false);
  const sport = SPORT_CONFIG[preview.sport];
  return (
    <div className="kh-wz-mobile-only" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 900 }}>
      {open && (
        <div style={{
          background: t.cardBg, borderTop: `1px solid ${t.border}`,
          padding: tokens.spaceMd, maxHeight: '60vh', overflowY: 'auto',
          boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
        }}>
          <TradingCard league={preview} isDark={isDark} state="building" />
        </div>
      )}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{
          width: '100%', minHeight: 44, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: tokens.spaceXs,
          background: t.cardBg, border: 'none', borderTop: `1px solid ${t.border}`,
          padding: `0 ${tokens.spaceMd}px`, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: open ? 'none' : '0 -4px 16px rgba(0,0,0,0.12)',
        }}>
        {sport && <img src={sport.logo} alt="" height={32} style={{ height: 32, width: 'auto', imageRendering: 'pixelated', flexShrink: 0 }} />}
        <span style={{ ...tokens.typeBody, fontWeight: 700, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
          {preview.name || 'New league'}
        </span>
        <span style={{ ...tokens.typeBodyMeta, color: t.textMuted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ruleLine}
        </span>
        <span style={{ ...tokens.typeBodyMeta, fontWeight: 700, color: t.textSecondary, flexShrink: 0 }}>
          Card {open ? '▾' : '▴'}
        </span>
      </button>
    </div>
  );
}

// ── Wizard shell ───────────────────────────────────────────────────────────
function CreateLeagueWizard({ isDark, existingLeagues, onCreate, onCancel }) {
  const t = makeTheme(isDark);
  const [s, dispatch] = React.useReducer(reducer, undefined, makeInitial);
  const accent = SPORT_CONFIG[s.sport]?.color || tokens.info;
  const isMobile = useMediaQuery(MOBILE_Q);

  const screens = screensOf(s);
  const step = Math.min(s.step, screens.length - 1);
  const current = screens[step];
  const phase = current.phase;
  const maxPhase = Math.max(...screens.slice(0, step + 1).map(sc => sc.phase));
  const canContinue = screenValid(s, current.id);
  const isReview = current.id === 'review';
  const preview = React.useMemo(() => buildPreview(s), [s]);

  // Jumping via the rail lands on the phase's FIRST screen.
  function gotoPhase(p) {
    const target = screens.findIndex(sc => sc.phase === p);
    if (target >= 0) dispatch({ type: 'goto', step: target });
  }

  // The same composed string the card's rule pill shows.
  const ruleLine = [
    s.costAnswered ? COST_REVIEW_LABEL[s.keeperCostModel] : null,
    s.termAnswered ? (s.termModel === TERM_FIXED ? `${s.termYears}-yr terms` : 'no term') : null,
    `${s.keeperSlots} keepers`,
  ].filter(Boolean).join(' · ');

  function handleCreate() {
    onCreate(buildLeague(s, existingLeagues));
  }

  const colMuted = isDark ? 'rgba(255,255,255,0.03)' : '#fafbfc';

  return (
    <DarkContext.Provider value={isDark}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: tokens.space2xl, paddingBottom: isMobile ? 56 : tokens.space2xl }}>
        <style>{CARD_STYLES}</style>
        <style>{WIZARD_STYLES}</style>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: tokens.spaceMd, marginBottom: tokens.spaceLg, flexWrap: 'wrap' }}>
          <h1 style={{ ...tokens.typeHeadingPage, color: t.textPrimary, margin: 0 }}>Create new league</h1>
          <button type="button" onClick={onCancel} style={{ ...tokens.typeBodyMeta, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>

        <div style={{
          background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg,
          overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}>
          <div className="kh-wz-grid">
            <div className="kh-wz-rail" style={{ background: colMuted, borderRight: `1px solid ${t.divider}`, padding: `${tokens.spaceXl}px ${tokens.spaceSm}px` }}>
              <PhaseRail phase={phase} maxPhase={maxPhase} accent={accent} onGoto={gotoPhase} isDark={isDark} />
            </div>

            <div style={{ minWidth: 0, padding: `${tokens.spaceXl}px ${tokens.space2xl}px` }}>
              <MobileProgress phase={phase} isDark={isDark} accent={accent} />

              {/* The screen title IS the question. No "Step N of M" anywhere. */}
              <h2 style={{ ...tokens.typeHeadingCard, fontSize: 20, color: t.textPrimary, margin: `0 0 ${tokens.spaceMd}px`, lineHeight: 1.3 }}>
                {PHASE_TITLES[current.id]}
              </h2>

              <WizardScreen id={current.id} s={s} dispatch={dispatch} isDark={isDark} accent={accent} gotoPhase={gotoPhase} />

              {/* Extra height comes out of the whitespace below the last group,
                  never by pushing the primary button down. */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.spaceSm, marginTop: tokens.spaceXl }}>
                <Button variant="secondary" size="md" isDark={isDark} onClick={() => dispatch({ type: 'back' })} disabled={step === 0}>
                  Back
                </Button>
                {isReview ? (
                  <Button variant="primary" size="md" accent={accent} isDark={isDark} onClick={handleCreate}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Create league <Check size={16} strokeWidth={2} />
                    </span>
                  </Button>
                ) : (
                  <Button variant="primary" size="md" accent={accent} isDark={isDark} onClick={() => canContinue && dispatch({ type: 'next' })} disabled={!canContinue}>
                    Continue
                  </Button>
                )}
              </div>
            </div>

            <div className="kh-wz-preview" style={{ background: colMuted, borderLeft: `1px solid ${t.divider}`, padding: tokens.spaceXl }}>
              <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.spaceSm }}>Live preview</div>
              <TradingCard league={preview} isDark={isDark} state={isReview ? 'ready' : 'building'} />
            </div>
          </div>
        </div>

        {isMobile && <MobilePreviewBar preview={preview} isDark={isDark} ruleLine={ruleLine} />}
      </div>
    </DarkContext.Provider>
  );
}

export { CreateLeagueWizard, buildLeague, screensOf, reducer, makeInitial, WizardScreen, PHASES, PHASE_TITLES, DarkContext };
