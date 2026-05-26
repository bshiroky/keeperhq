import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SPORT_CONFIG, tokens, makeTheme } from './components.jsx';
import { TradingCard } from './HomeView.jsx';
import { SampleKeeperCell } from './tabs/keeper-grid-variants.jsx';

// Create New League — 4-step wizard (Basics / Format / Teams / Review).
// Left progress rail, center step content, right live preview that IS the
// real HomeView TradingCard fed a half-built league object. Writes a league
// with the exact mock-data shape (src/data.js) into localStorage via the
// onCreate callback, then navigates into it.

const STEPS = ['Basics', 'League Format', 'Teams', 'Review'];
const CROSS_YEAR = new Set(['hockey', 'basketball']);

const SPORT_PICKER_STYLES = `
  @keyframes kh-sportbob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  .kh-sport-bob { animation: kh-sportbob 1.8s ease-in-out infinite; }
`;

function seasonOptions(sport) {
  return CROSS_YEAR.has(sport)
    ? ['2025-26', '2026-27', '2027-28']
    : ['2026', '2027', '2028'];
}
function defaultSeason(sport) {
  return CROSS_YEAR.has(sport) ? '2026-27' : '2026';
}

function slugify(name) {
  return (
    name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') ||
    'league'
  );
}
function uniqueId(base, existing) {
  const ids = new Set((existing || []).map(l => l.id));
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// Builds the saved league object. Shape is identical to the mock leagues in
// src/data.js; the only additive fields beyond that shape are team[0]
// isCommissioner and (auction) auctionRules.budget, both intentional.
function buildLeague(form, existing) {
  const teams = Array.from({ length: form.teamCount }, (_, i) => ({
    id: `t${i + 1}`,
    name: (form.teamNames[i] || '').trim() || `Team ${i + 1}`,
    paid: false,
    keepersSubmitted: false,
    keepers: [],
    ...(i === 0 ? { isCommissioner: true } : {}),
  }));
  const buyIn = 0;
  const base = {
    id: uniqueId(slugify(form.name || ''), existing),
    name: (form.name || '').trim() || 'Untitled League',
    sport: form.sport,
    draftType: form.draftType,
    season: form.season,
    teamCount: form.teamCount,
    keeperSlots: form.keeperSlots,
    minKeepers: 0,
    buyIn,
    totalPool: form.teamCount * buyIn,
    status: 'pre-draft',
    draftDate: null,
    playoffTeams: 6,
    noPlayoffPickupKeepers: true,
    payouts: { standings: [], other: [] },
    payoutNote: '',
    teams,
  };
  if (form.draftType === 'snake') {
    return { ...base, contractYears: form.contractYears, bottomLotteryTeams: 4, contractsRequired: false };
  }
  return {
    ...base,
    auctionRules: {
      costIncreasePerYear: form.costIncreasePerYear,
      budget: form.budget,
      undraftedStartCost: 5,
      minBid: 1,
    },
  };
}

// ── Shared field styling — mirrors the Manage-Player (KeeperEditModal)
//    input/select styling exactly so the wizard reads as the same surface.
function textInputStyle(t, isDark) {
  return {
    width: '100%', boxSizing: 'border-box',
    background: isDark ? '#161a22' : '#f7f9fc',
    border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '8px 12px', fontSize: '14px', color: t.textPrimary,
    outline: 'none', fontFamily: 'inherit',
  };
}
function selectStyle(t, isDark) {
  return {
    background: isDark ? '#161a22' : '#f7f9fc',
    border: `1px solid ${t.border}`, borderRadius: 6,
    padding: '7px 8px', color: t.textPrimary, fontSize: '13px',
    fontFamily: 'inherit', cursor: 'pointer',
  };
}

// Bold numeric value with gray prefix/suffix (the value-bold / unit-gray rule).
function NumberField({ value, onChange, min, max, step = 1, prefix, suffix, isDark, valueColor, width = 60 }) {
  const t = makeTheme(isDark);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {prefix && <span style={{ ...tokens.typeBody, color: t.textMuted }}>{prefix}</span>}
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={e => {
          let v = Number(e.target.value);
          if (Number.isNaN(v)) v = min;
          v = Math.max(min, Math.min(max ?? Infinity, v));
          onChange(v);
        }}
        style={{
          width, textAlign: 'center',
          background: isDark ? '#161a22' : '#f7f9fc',
          border: `1px solid ${t.border}`, borderRadius: 6,
          padding: '7px 8px', color: valueColor || t.textPrimary,
          fontSize: '13px', fontWeight: 700, fontFamily: 'inherit', outline: 'none',
        }}
      />
      {suffix && <span style={{ ...tokens.typeBody, color: t.textMuted }}>{suffix}</span>}
    </span>
  );
}

function FieldLabel({ children, t }) {
  return <div style={{ ...tokens.typeLabelEyebrow, color: t.textSecondary, marginBottom: tokens.spaceXs }}>{children}</div>;
}

// ── Step 1: Basics ─────────────────────────────────────────────────────────
function StepBasics({ form, set, isDark }) {
  const t = makeTheme(isDark);
  const seasons = seasonOptions(form.sport);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceLg }}>
      <div>
        <FieldLabel t={t}>League name</FieldLabel>
        <input
          value={form.name}
          onChange={e => set({ name: e.target.value })}
          placeholder="e.g. The Pond"
          autoFocus
          style={textInputStyle(t, isDark)}
        />
      </div>

      <div>
        <FieldLabel t={t}>Sport</FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: tokens.spaceSm }}>
          {Object.entries(SPORT_CONFIG).map(([id, cfg]) => {
            const active = form.sport === id;
            return (
              <button key={id} type="button"
                onClick={() => set({ sport: id, season: defaultSeason(id) })}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: tokens.spaceSm,
                  padding: `${tokens.spaceLg}px ${tokens.spaceXs}px`,
                  border: `2px solid ${active ? cfg.color : t.border}`,
                  background: active ? cfg.tint : t.cardBg,
                  borderRadius: tokens.radiusLg, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: active ? `0 0 0 4px ${cfg.tint}, 0 8px 20px ${cfg.border}` : 'none',
                  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                }}>
                <img src={cfg.logo} alt="" height={76}
                  className={active ? 'kh-sport-bob' : undefined}
                  style={{ height: 76, width: 'auto', maxWidth: '100%', imageRendering: 'pixelated', display: 'block',
                    filter: active ? 'none' : 'grayscale(1)', opacity: active ? 1 : 0.5,
                    transition: 'filter 0.15s, opacity 0.15s' }} />
                <span style={{ ...tokens.typeBody, fontWeight: active ? 700 : 600, color: active ? cfg.color : t.textMuted }}>
                  {cfg.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel t={t}>Season</FieldLabel>
        <select value={form.season} onChange={e => set({ season: e.target.value })} style={selectStyle(t, isDark)}>
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: tokens.spaceXs }}>
          The off-season you're setting up keepers for.
        </div>
      </div>
    </div>
  );
}

// ── Step 2: League Format ──────────────────────────────────────────────────
const SAMPLE_AUCTION = { player: 'Nikola Jokić', keptFor: 42 };
const SAMPLE_SNAKE = { player: 'Connor McDavid', contractYear: 2, contractLength: 3 };

function DraftTypeCard({ type, title, tagline, sample, isSnake, accent, active, onSelect, isDark }) {
  const t = makeTheme(isDark);
  return (
    <button type="button" onClick={onSelect} style={{
      flex: 1, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      border: `2px solid ${active ? accent : t.border}`,
      background: active ? `${accent}10` : t.cardBg,
      borderRadius: tokens.radiusLg, padding: tokens.spaceMd,
      display: 'flex', flexDirection: 'column', gap: tokens.spaceXs,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceXs }}>
        <span style={{ ...tokens.typeHeadingCard, color: active ? accent : t.textPrimary }}>{title}</span>
        <span aria-hidden="true" style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${active ? accent : t.border}`,
          background: active ? accent : 'transparent',
          boxShadow: active ? `inset 0 0 0 2px ${t.cardBg}` : 'none',
        }} />
      </div>
      <div style={{ ...tokens.typeBodyMeta, color: t.textSecondary, lineHeight: 1.4, minHeight: 32 }}>{tagline}</div>
      <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginTop: tokens.space2xs }}>Sample keeper</div>
      <div style={{ width: 156 }}>
        <SampleKeeperCell slot={sample} isSnake={isSnake} isDark={isDark} gridAccent={accent} />
      </div>
    </button>
  );
}

function StepFormat({ form, set, isDark }) {
  const t = makeTheme(isDark);
  const isSnake = form.draftType === 'snake';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceLg }}>
      <div>
        <FieldLabel t={t}>Draft type</FieldLabel>
        <div style={{ display: 'flex', gap: tokens.spaceSm, alignItems: 'stretch' }}>
          <DraftTypeCard
            type="auction" title="Auction" isSnake={false} sample={SAMPLE_AUCTION}
            tagline="Bid real dollars on players; keepers cost more each year you hold them."
            accent={tokens.warning} active={form.draftType === 'auction'}
            onSelect={() => set({ draftType: 'auction' })} isDark={isDark}
          />
          <DraftTypeCard
            type="snake" title="Snake" isSnake={true} sample={SAMPLE_SNAKE}
            tagline="Draft in order; keepers run on multi-year contracts and then expire."
            accent={tokens.info} active={form.draftType === 'snake'}
            onSelect={() => set({ draftType: 'snake' })} isDark={isDark}
          />
        </div>
      </div>

      <div>
        <FieldLabel t={t}>Keeper slots</FieldLabel>
        <NumberField value={form.keeperSlots} onChange={v => set({ keeperSlots: v })}
          min={1} max={20} suffix="players per team" isDark={isDark} />
      </div>

      {isSnake ? (
        <div>
          <FieldLabel t={t}>Contract length</FieldLabel>
          <NumberField value={form.contractYears} onChange={v => set({ contractYears: v })}
            min={1} max={10} suffix="years" isDark={isDark} />
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: tokens.spaceXs }}>
            How many seasons a player can be kept before returning to the draft.
          </div>
        </div>
      ) : (
        <>
          <div>
            <FieldLabel t={t}>Annual cost increase</FieldLabel>
            <NumberField value={form.costIncreasePerYear} onChange={v => set({ costIncreasePerYear: v })}
              min={0} max={100} step={1} prefix="+$" suffix="per year kept"
              valueColor={tokens.warning} isDark={isDark} />
          </div>
          <div>
            <FieldLabel t={t}>Auction budget</FieldLabel>
            <NumberField value={form.budget} onChange={v => set({ budget: v })}
              min={1} max={1000} step={5} prefix="$" suffix="per team"
              valueColor={tokens.warning} width={72} isDark={isDark} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 3: Teams ──────────────────────────────────────────────────────────
function StepTeams({ form, set, isDark }) {
  const t = makeTheme(isDark);
  function setTeamCount(n) {
    const names = [...form.teamNames];
    while (names.length < n) names.push(`Team ${names.length + 1}`);
    names.length = n;
    set({ teamCount: n, teamNames: names });
  }
  function setName(i, value) {
    const names = [...form.teamNames];
    names[i] = value;
    set({ teamNames: names });
  }
  const counts = [];
  for (let n = 4; n <= 20; n++) counts.push(n);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceLg }}>
      <div>
        <FieldLabel t={t}>Number of teams</FieldLabel>
        <select value={form.teamCount} onChange={e => setTeamCount(Number(e.target.value))} style={selectStyle(t, isDark)}>
          {counts.map(n => <option key={n} value={n}>{n} teams</option>)}
        </select>
      </div>

      <div style={{
        ...tokens.typeBodyMeta, color: t.textSecondary, lineHeight: 1.45,
        background: t.noteBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusMd,
        padding: `${tokens.spaceSm}px ${tokens.spaceMd}px`,
      }}>
        Placeholder names for your own tracking — not pulled from Yahoo. Use whatever you actually call each team.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: tokens.spaceSm }}>
        {form.teamNames.map((nm, i) => (
          <div key={i}>
            <div style={{ ...tokens.typeLabelEyebrow, color: i === 0 ? tokens.info : t.textMuted, marginBottom: tokens.space2xs, display: 'flex', alignItems: 'center', gap: 6 }}>
              Team {i + 1}
              {i === 0 && (
                <span style={{
                  ...tokens.typePill, fontSize: '9px', color: tokens.info,
                  background: tokens.infoBg, border: `1px solid ${tokens.infoBorder}`,
                  borderRadius: tokens.radiusPill, padding: '1px 6px', letterSpacing: '0.04em',
                }}>Commissioner</span>
              )}
            </div>
            <input
              value={nm}
              onChange={e => setName(i, e.target.value)}
              placeholder={`Team ${i + 1}`}
              style={textInputStyle(t, isDark)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 4: Review ─────────────────────────────────────────────────────────
function ReviewRow({ label, value, t }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: tokens.spaceMd, padding: `${tokens.spaceXs}px 0`, borderBottom: `1px solid ${t.dividerFaint}` }}>
      <span style={{ ...tokens.typeBodyMeta, color: t.textMuted }}>{label}</span>
      <span style={{ ...tokens.typeBody, fontWeight: 600, color: t.textPrimary, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function StepReview({ form, isDark }) {
  const t = makeTheme(isDark);
  const isSnake = form.draftType === 'snake';
  const commish = (form.teamNames[0] || '').trim() || 'Team 1';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceMd }}>
      <div style={{ ...tokens.typeBodyMeta, color: t.textSecondary, lineHeight: 1.45 }}>
        Everything here is editable later in Settings — this is a fast first pass.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <ReviewRow t={t} label="League name" value={(form.name || '').trim() || 'Untitled League'} />
        <ReviewRow t={t} label="Sport" value={SPORT_CONFIG[form.sport]?.label || form.sport} />
        <ReviewRow t={t} label="Season" value={form.season} />
        <ReviewRow t={t} label="Draft type" value={isSnake ? 'Snake' : 'Auction'} />
        <ReviewRow t={t} label="Keeper slots" value={`${form.keeperSlots} per team`} />
        {isSnake
          ? <ReviewRow t={t} label="Contract length" value={`${form.contractYears} years`} />
          : <>
              <ReviewRow t={t} label="Annual cost increase" value={`+$${form.costIncreasePerYear}/yr`} />
              <ReviewRow t={t} label="Auction budget" value={`$${form.budget} per team`} />
            </>
        }
        <ReviewRow t={t} label="Teams" value={`${form.teamCount}`} />
        <ReviewRow t={t} label="Commissioner" value={commish} />
      </div>
    </div>
  );
}

// ── Progress rail ──────────────────────────────────────────────────────────
function ProgressRail({ step, setStep, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spaceXs }}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <button key={label} type="button" onClick={() => setStep(n)} style={{
            display: 'flex', alignItems: 'center', gap: tokens.spaceSm,
            background: active ? tokens.infoBg : 'transparent',
            border: 'none', borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%',
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 700,
              background: active ? tokens.info : done ? tokens.successBg : t.sectionBg,
              color: active ? '#fff' : done ? tokens.success : t.textMuted,
              border: done ? `1px solid ${tokens.successBorder}` : 'none',
            }}>{done ? '✓' : n}</span>
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
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState(() => ({
    name: '',
    sport: 'hockey',
    season: defaultSeason('hockey'),
    draftType: 'snake',
    keeperSlots: 4,
    contractYears: 3,
    costIncreasePerYear: 5,
    budget: 200,
    teamCount: 12,
    teamNames: Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`),
  }));
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const preview = React.useMemo(
    () => buildLeague({ ...form, name: (form.name || '').trim() || 'Your League' }, existingLeagues),
    [form, existingLeagues]
  );

  function handleCreate() {
    onCreate(buildLeague(form, existingLeagues));
  }

  const primary = tokens.info;
  const btnBase = {
    border: 'none', borderRadius: tokens.radiusMd, padding: '10px 20px',
    fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  };
  const ghostBtn = {
    ...btnBase, background: 'transparent', border: `1px solid ${t.border}`, color: t.textSecondary,
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: `0 ${tokens.spaceXl}px ${tokens.space2xl * 2}px` }}>
      <style>{SPORT_PICKER_STYLES}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: tokens.spaceMd, marginBottom: tokens.spaceLg, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...tokens.typeHeadingPage, color: t.textPrimary, margin: 0 }}>Create a league</h1>
          <p style={{ ...tokens.typeBodyMeta, color: t.textSecondary, margin: `${tokens.space2xs}px 0 0` }}>
            Set the basics now — everything is editable later in Settings.
          </p>
        </div>
        <button type="button" onClick={onCancel} style={{ ...ghostBtn, padding: '6px 14px' }}>Cancel</button>
      </div>

      {/* Columns: rail · content · live preview. align-items:flex-start so the
          content column sizes to its own content and the Continue button sits
          just below the fields — not stretched to the preview's height. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.spaceXl, flexWrap: 'wrap' }}>
        {/* Rail */}
        <div style={{ flex: '0 0 200px', minWidth: 180 }}>
          <ProgressRail step={step} setStep={setStep} isDark={isDark} />
        </div>

        {/* Content */}
        <div style={{ flex: '1 1 420px', minWidth: 320, maxWidth: 560 }}>
          <div style={{
            background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg,
            boxShadow: t.cardShadow, padding: `${tokens.spaceLg}px ${tokens.spaceXl}px`,
          }}>
            <div style={{ ...tokens.typeHeadingCard, color: t.textPrimary, marginBottom: tokens.spaceLg }}>
              {step}. {STEPS[step - 1]}
            </div>
            {step === 1 && <StepBasics form={form} set={set} isDark={isDark} />}
            {step === 2 && <StepFormat form={form} set={set} isDark={isDark} />}
            {step === 3 && <StepTeams form={form} set={set} isDark={isDark} />}
            {step === 4 && <StepReview form={form} isDark={isDark} />}

            {/* Nav — sits a comfortable gap below the last field, in flow. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: tokens.spaceSm, marginTop: tokens.spaceXl }}>
              <button type="button" onClick={() => (step === 1 ? onCancel() : setStep(step - 1))} style={ghostBtn}>
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              {step < 4 ? (
                <button type="button" onClick={() => setStep(step + 1)} style={{ ...btnBase, background: primary, color: '#fff' }}>
                  Continue
                </button>
              ) : (
                <button type="button" onClick={handleCreate} style={{ ...btnBase, background: primary, color: '#fff' }}>
                  Create league
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live preview — the real TradingCard, non-interactive */}
        <div style={{ flex: '0 0 380px', minWidth: 320, maxWidth: 400, position: 'sticky', top: 88 }}>
          <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.spaceXs }}>Live preview</div>
          <TradingCard league={preview} isDark={isDark} building />
          <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: tokens.spaceSm, lineHeight: 1.4 }}>
            Card fills in as you go.
          </div>
        </div>
      </div>
    </div>
  );
}

export { CreateLeagueWizard, buildLeague };
