import React from 'react';
import { tokens, makeTheme, GoogleButton, TextLink } from './components.jsx';

// Logged-out front door — Variation A (centered, sport-agnostic). The
// existing <header> (rendered by App.jsx on every route) sits above this;
// everything here is just the centered column beneath it.
function LandingPage({ isDark, onSignIn, onExploreDemo }) {
  const t = makeTheme(isDark);
  return (
    <div style={{
      minHeight: 'calc(100vh - 168px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: `${tokens.space2xl}px ${tokens.spaceLg}px`,
      boxSizing: 'border-box',
    }}>
      {/* 200/150px are asset-role values (this mascot's size on this one
          hero surface), not reusable scale steps — same precedent as the
          celebration mascot in components.jsx. */}
      <img
        src="/commissioner.png"
        alt=""
        className="kh-landing-art"
        style={{
          height: 200, width: 'auto', display: 'block', marginBottom: tokens.spaceXl,
          filter: isDark
            ? 'drop-shadow(0 12px 28px rgba(0,0,0,0.5))'
            : 'drop-shadow(0 12px 24px rgba(0,0,0,0.12))',
        }}
      />

      <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted, marginBottom: tokens.spaceMd }}>
        Off-season HQ for keeper leagues
      </div>

      <h1 className="kh-landing-headline" style={{ ...tokens.typeHeadingDisplay, color: t.textPrimary, maxWidth: 620, margin: 0 }}>
        The off-season home for your keeper league.
      </h1>

      <p style={{ ...tokens.typeBody, color: t.textBody, maxWidth: 560, marginTop: tokens.spaceMd, lineHeight: 1.55 }}>
        Track keepers, contracts, and off-season trades between seasons — then
        export clean to Yahoo, Sleeper, or ESPN.
      </p>

      <div className="kh-landing-actions" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: tokens.spaceMd, marginTop: tokens.space2xl,
      }}>
        <GoogleButton size="lg" isDark={isDark} onClick={onSignIn} className="kh-landing-google" />
        <TextLink isDark={isDark} onClick={onExploreDemo}>Explore the demo →</TextLink>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .kh-landing-art { height: 150px !important; }
          .kh-landing-headline { font-size: 26px !important; }
          .kh-landing-actions { width: 100%; max-width: 320px; }
          .kh-landing-google { width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

export { LandingPage };
