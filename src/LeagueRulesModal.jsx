import React from 'react';
import { X, BookOpen } from 'lucide-react';
import { makeTheme, tokens, SPORT_CONFIG } from './components.jsx';
import { keeperRuleFacts, ruleNotes } from './lib/rulesSummary.js';

// The league's keeper rules, so a member can check them without asking the
// commissioner.
//
// Two halves, one modal:
//   * DERIVED — cards built from the league config (what keeping costs, how it
//     escalates, term, slots, waiver pickups). No commissioner input, and it
//     can't drift from the rules the app actually applies.
//   * WRITTEN — the commissioner's free text for anything the config doesn't
//     model. Omitted entirely when blank.
//
// RulesGrid is exported on its own so the commissioner's Settings card can
// show exactly what members see, rather than a second lookalike.

export function RulesGrid({ league, isDark, accent }) {
  const t = makeTheme(isDark);
  const facts = keeperRuleFacts(league);
  if (facts.length === 0) return null;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      gap: tokens.spaceSm,
    }}>
      {facts.map(fact => (
        <div key={fact.key} style={{
          background: t.sectionBg, border: `1px solid ${t.border}`,
          borderRadius: tokens.radiusMd, padding: `${tokens.spaceSm}px ${tokens.spaceMd}px`,
          minWidth: 0,
        }}>
          <div style={{ ...tokens.typeLabelEyebrow, color: t.textMuted }}>{fact.label}</div>
          <div style={{ ...tokens.typeHeadingCard, color: accent || t.textPrimary, marginTop: 3, overflowWrap: 'anywhere' }}>
            {fact.value}
          </div>
          {fact.detail && (
            <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 3, lineHeight: 1.45 }}>
              {fact.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NoteSection({ note, isDark }) {
  const t = makeTheme(isDark);
  return (
    <div>
      <div style={{ ...tokens.typeHeadingSection, color: t.textSecondary, marginBottom: tokens.spaceXs }}>
        {note.title}
      </div>
      {/* Commissioner-authored text: newlines are meaningful, so preserve them
          rather than collapsing the note into one paragraph. */}
      <div style={{ ...tokens.typeBody, color: t.textBody, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {note.body}
      </div>
    </div>
  );
}

export function LeagueRulesModal({ league, isDark, onClose }) {
  const t = makeTheme(isDark);
  const sport = SPORT_CONFIG[league?.sport] || SPORT_CONFIG.hockey;
  const notes = ruleNotes(league);

  // Escape closes — this is a read-only overlay on a page members will open
  // and dismiss repeatedly.
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog" aria-modal="true" aria-label="League rules"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: t.scrim, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: tokens.spaceMd,
      }}
    >
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg,
        width: '100%', maxWidth: 620, maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        borderTop: `3px solid ${sport.color}`,
      }}>
        <div style={{
          padding: `${tokens.spaceSm}px ${tokens.spaceLg}px`, borderBottom: `1px solid ${t.divider}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spaceSm, flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...tokens.typeHeadingCard, color: t.textPrimary }}>League rules</div>
            <div style={{ ...tokens.typeBodyMeta, color: t.textMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {league?.name}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: 4, display: 'inline-flex', flexShrink: 0, fontFamily: 'inherit' }}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: tokens.spaceLg, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: tokens.spaceLg }}>
          <RulesGrid league={league} isDark={isDark} accent={sport.color} />
          {notes.map(note => <NoteSection key={note.key} note={note} isDark={isDark} />)}
        </div>
      </div>
    </div>
  );
}

// Trigger + modal + open state as ONE component.
//
// They were separate: the button and its useState lived in SharedLeaguePage
// while the modal render landed in InvalidLinkPage (a text replacement hit the
// wrong <FooterMark />). Clicking flipped state in a component that rendered
// no modal, so the button silently did nothing — and nothing threw, because
// the orphaned render sat on a page that only appears for a dead link. Keeping
// the three together makes that class of bug impossible.
//
// `defaultOpen` exists so a server render can exercise the OPEN state; the
// earlier tests rendered the button and the modal separately and both passed
// while the wiring between them was broken.
export function RulesButton({ league, isDark, defaultOpen = false }) {
  const t = makeTheme(isDark);
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <>
      <button className="kh-share-rules-btn" onClick={() => setOpen(true)}
        aria-label="League rules" aria-haspopup="dialog" title="League rules"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          flexShrink: 0, background: 'transparent', border: `1px solid ${t.border}`,
          borderRadius: tokens.radiusPill, cursor: 'pointer', color: t.textSecondary,
          ...tokens.typeBody, fontWeight: 600, fontFamily: 'inherit',
        }}>
        <BookOpen size={14} strokeWidth={2} />
        Rules
      </button>
      {open && <LeagueRulesModal league={league} isDark={isDark} onClose={() => setOpen(false)} />}
    </>
  );
}
