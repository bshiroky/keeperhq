import React from 'react';
import { Pencil, ArrowLeftRight } from 'lucide-react';
import { makeTheme, Tooltip, tokens } from '../components.jsx';
import { keeperValueText, isFinalYear } from '../lib/keeperRules.js';

// The single keeper-cell renderer shared by the Overview grid (interactive)
// and the Create-League wizard's Step-2 sample (static). Extracted verbatim
// from CompactKeeperGrid so the wizard sample is the real cell, not a
// lookalike. All states — normal / expiring / traded / expiring+traded —
// share one footprint; the cell suite asserts uniform height.
//
// Interactive bits are opt-in props so the static sample can omit them:
//   onReassignClick → renders the hover-fade reassign pencil (grid only)
//   tradedToName    → destination team name for the swap-badge tooltip
//   children        → the move popover (grid only)
function SampleKeeperCell({
  slot,
  league,
  isDark,
  gridAccent,
  onReassignClick = null,
  tradedToName = null,
  children = null,
}) {
  const t = makeTheme(isDark);
  const expiring = isFinalYear(league, slot);
  const valueText = keeperValueText(league, slot);
  const valueColor = slot.isOutgoing ? t.textMuted : expiring ? t.danger : gridAccent;

  return (
    <div className="kh-keeper-cell" style={{
      position: 'relative',
      width: '100%', boxSizing: 'border-box',
      border: `1px solid ${expiring ? t.dangerBorder : t.border}`,
      background: expiring ? t.dangerBg : t.sectionBg,
      borderRadius: tokens.radiusSm,
      padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 2,
      minWidth: 0,
    }}>
      {/* Line 1: name + hover-only reassign pencil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{
          fontSize: '13px',
          fontWeight: slot.isOutgoing ? 500 : 700,
          color: slot.isOutgoing ? t.textMuted : (expiring ? t.danger : t.textPrimary),
          textDecoration: slot.isOutgoing ? 'line-through' : 'none',
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={slot.player}>
          {slot.player}
        </span>
        {onReassignClick && (
          <button
            className="kh-keeper-pencil"
            onClick={onReassignClick}
            title="Reassign to another team (mid-season trade)"
            style={{ background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', color: t.textMuted, lineHeight: 1, fontFamily: 'inherit', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.color = gridAccent; }}
            onMouseLeave={e => { e.currentTarget.style.color = t.textMuted; }}
          ><Pencil size={11} strokeWidth={1.75} /></button>
        )}
      </div>
      {/* Line 2: value + FINAL YR badge — left-grouped so the cell holds the
          standard 2-line height and the data stays bound to the value. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          color: valueColor,
          textDecoration: slot.isOutgoing ? 'line-through' : 'none',
          flexShrink: 0,
        }}>
          {valueText}
        </span>
        {expiring && (
          <Tooltip isDark={isDark} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
            content={`${slot.player} · final year of his term, returns to the draft after this season`}>
            <span style={{ ...tokens.typePillEmphatic, color: t.danger, lineHeight: 1 }}>
              Final yr
            </span>
          </Tooltip>
        )}
      </div>
      {/* Trade indicator: swap badge in the bottom-right corner (absolute, out
          of flow) so it never competes with line 2 for width. */}
      {slot.isOutgoing && tradedToName && (
        <Tooltip isDark={isDark}
          content={`${slot.player} · traded to ${tradedToName}`}
          style={{ position: 'absolute', bottom: 6, right: 8 }}>
          <span aria-label={`traded to ${tradedToName}`}
            style={{ lineHeight: 1, color: gridAccent, cursor: 'default', display: 'inline-flex', alignItems: 'center' }}>
            <ArrowLeftRight size={12} strokeWidth={1.75} />
          </span>
        </Tooltip>
      )}
      {children}
    </div>
  );
}

export { SampleKeeperCell };
