import React from 'react';
import { Check } from 'lucide-react';
import { makeTheme, tokens, SportBadge } from './components.jsx';

// ───────────────────────────────────────────────────────────────────────────
// TEMPORARY comparison harness for audit X1 (success-green vs football-green).
// Routed at /success-compare. Hardcodes candidate greens so tokens.success is
// untouched until a candidate is signed off. DELETE this file + its route once
// the green is chosen.
// ───────────────────────────────────────────────────────────────────────────

const FOOTBALL = '#4caf7d';          // SPORT_CONFIG.football.color — do not touch
const FOOTBALL_TINT = 'rgba(76,175,125,0.12)';
const FOOTBALL_BORDER = 'rgba(76,175,125,0.20)';

const CANDIDATES = [
  { key: 'current', name: 'Current (baseline)', hex: '#6dd4a8', rgb: '109,212,168',
    note: 'Same hue as football (~150°), just lighter — this is the collision.' },
  { key: 'teal', name: 'A · Mint-teal (cooler)', hex: '#2dd4bf', rgb: '45,212,191',
    note: 'Rotated toward teal (~172°). Reads clearly cooler than football. Recommended.' },
  { key: 'lime', name: 'B · Yellow-green (warmer)', hex: '#8fd14f', rgb: '143,209,79',
    note: 'Rotated toward lime (~88°). Clearly warmer/brighter; more energetic.' },
  { key: 'emerald', name: 'C · Emerald (deeper)', hex: '#10b981', rgb: '16,185,129',
    note: 'Darker & more saturated, same hue family (~160°). Conservative — least differentiated.' },
];

function Swatch({ label, color, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 64, height: 64, borderRadius: 10, background: color, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'inherit' }}>{label}</div>
      <div style={{ fontSize: 10, opacity: 0.7 }}>{sub}</div>
    </div>
  );
}

function CandidateBlock({ c, isDark }) {
  const t = makeTheme(isDark);
  const success = c.hex;
  const successBg = `rgba(${c.rgb},0.14)`;
  const successBorder = `rgba(${c.rgb},0.33)`;
  const bubbleBg = isDark ? '#1c2130' : '#ffffff';

  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: t.cardShadow, overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}` }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary }}>{c.name} <span style={{ fontFamily: 'monospace', fontWeight: 600, color: t.textSecondary }}>{c.hex}</span></div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{c.note}</div>
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18, color: t.textBody }}>
        {/* The money shot: two raw swatches 8px apart */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Swatch label="SUCCESS" color={success} sub={c.hex} />
          <Swatch label="FOOTBALL" color={FOOTBALL} sub="#4caf7d" />
        </div>

        {/* Faux football league header strip: football SportBadge + active tab */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 8 }}>Football league page — tab (football) above paid pill (success)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <SportBadge sport="football" />
            <span style={{ ...tokens.typeHeadingPage, color: t.textPrimary, fontSize: 16 }}>Gridiron Keepers</span>
          </div>
          {/* TabBar with football-green active state */}
          <div style={{ borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 0, marginBottom: 12 }}>
            {['Overview', 'Players', 'Payouts & Pay', 'Settings'].map((tab, i) => {
              const active = tab === 'Payouts & Pay';
              return (
                <span key={tab} style={{
                  padding: '9px 14px', fontSize: 12, fontWeight: 600,
                  color: active ? FOOTBALL : t.textMuted,
                  borderBottom: active ? `2px solid ${FOOTBALL}` : '2px solid transparent',
                  marginBottom: -1,
                }}>{tab}</span>
              );
            })}
          </div>
          {/* Payments rows with success-green paid pills */}
          {['Sourdough Sluggers', 'Blitz Brigade'].map((team, i) => (
            <div key={team} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: i === 0 ? `1px solid ${t.dividerFaint}` : 'none' }}>
              <span style={{ fontSize: 14, color: t.textBody }}>{team}</span>
              <button style={{
                background: successBg, border: `1px solid ${successBorder}`, borderRadius: 6,
                padding: '4px 10px', fontSize: 12, fontWeight: 700, color: success,
                display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
              }}>
                <Check size={14} strokeWidth={1.5} /> $50
              </button>
            </div>
          ))}
        </div>

        {/* Voice bubble in success state (HeaderAnchor recipe) */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 8 }}>Commish brief — success state</div>
          <div style={{ background: bubbleBg, border: `1.5px solid ${success}`, color: t.textBody, borderRadius: tokens.radiusLg, padding: '9px 13px', boxShadow: `0 2px 0 ${success}22` }}>
            <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: 2 }}>Commish brief</div>
            <div style={{ ...tokens.typeBody, fontWeight: 600, color: t.textPrimary }}>All teams paid up. You're ready for the draft.</div>
          </div>
        </div>

        {/* Save toast pill + completed/keeper chips */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: isDark ? '#2a3142' : '#1a1f2e', color: '#fff', padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
            <Check size={15} strokeWidth={2.5} color={success} /> Saved
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: success, background: successBg, borderRadius: 20, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Check size={12} strokeWidth={2} /> Keepers set
          </span>
          {/* football-green dot adjacent for reference */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: t.textMuted }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: FOOTBALL }} /> football dot
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: success, marginLeft: 4 }} /> success dot
          </span>
        </div>
      </div>
    </div>
  );
}

export function SuccessGreenCompare({ isDark }) {
  const t = makeTheme(isDark);
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px', color: t.textBody }}>
      <div style={{ padding: '16px 0' }}>
        <h1 style={{ ...tokens.typeHeadingPage, color: t.textPrimary, margin: 0 }}>X1 — Success-green candidates</h1>
        <p style={{ fontSize: 13, color: t.textMuted, marginTop: 6, maxWidth: 640, lineHeight: 1.5 }}>
          Each block puts the candidate success-green next to football-green (#4caf7d) on the real recipes:
          the Payouts tab (football-green active tab over success-green paid pills), the commish voice bubble,
          the save toast, and status chips. Toggle light/dark from the account menu. Temporary page — will be
          removed once a green is picked.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {CANDIDATES.map(c => <CandidateBlock key={c.key} c={c} isDark={isDark} />)}
      </div>
    </div>
  );
}
