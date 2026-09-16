import React from 'react';
import { Link } from 'react-router-dom';
import { makeTheme, tokens, SrOnly } from '../components.jsx';
import { pickOwnerId } from '../lib/draftPicks.js';
import { lotteryRangeFor } from '../lib/draftOrder.js';
import { sortTeamsByName } from '../lib/teamOrder.js';

// ── Draft board ──────────────────────────────────────────────────────────────
// Once standings are on file the grid IS the draft: columns are rounds, rows
// are pick slots, so each column reads top to bottom as the order that round
// will be drafted in. Each cell is the team on the clock, with the overall
// pick number above the name. A traded pick is highlighted and shows its
// CURRENT owner (the team that will actually pick); whose pick it was
// originally is on hover. ONE cell per pick per round, always — nothing
// merges.
//
// Before the lottery is drawn, a round's lottery slots (the first N in odd
// rounds, the last N in even — the snake) can't be mapped to a team yet, so
// each is a muted "Lottery pick" placeholder carrying only its overall
// number. When any lottery team's pick in that round has been traded, every
// placeholder in that round carries an asterisk, and hovering one says which
// team will pick somewhere in that range via whom — the trade is real, the
// slot isn't known yet. A line above the board names the lottery teams and
// links to the Lottery page; it disappears with the draw, when the
// placeholders fill with names and the asterisks resolve to specific cells.
const SLOT_W = 44;
const CELL_W = 92;

// A pick's original-owner half of the story is what a click edits: the
// select is always "who now owns {original}'s R{n} pick", whichever cell it
// was opened from.
function PickCell({ number, label, traded, title, ariaLabel, editing, ownerId, teams, onEdit, onPick, onBlur, isDark, accentColor, readOnly = false, origin = null, dim = false }) {
  const t = makeTheme(isDark);
  const inner = (
    <>
      {number != null && (
        <span style={{ display: 'block', ...tokens.typeStatMeta, fontWeight: 700, color: traded ? t.warning : t.textSecondary, marginBottom: 1 }}>
          {number}
        </span>
      )}
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {label}
      </span>
    </>
  );
  const box = {
    width: '100%', boxSizing: 'border-box',
    background: traded ? t.warningBg : 'none',
    border: `1px solid ${traded ? t.warningBorder : 'transparent'}`,
    borderRadius: tokens.radiusSm, padding: '4px 4px',
    fontSize: 11, fontWeight: traded ? 700 : 500,
    color: traded ? t.warning : t.textBody,
    fontFamily: 'inherit', textAlign: 'center',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
    // A highlight filter dims every cell that isn't the chosen team's. Dim is
    // decoration only: the cell's text still names the owner, so nothing is
    // lost when the opacity isn't perceived.
    opacity: dim ? 0.3 : 1,
  };
  // Member-facing: the same cell with nothing to click. The hover sentence
  // stays; a traded pick's origin is DOM text as well (a title on a plain
  // span is hover-only, and aria-label on a span is ignored), so a screen
  // reader hears "5 Delta, originally Alpha's pick" from the cell itself.
  if (readOnly) {
    return (
      <span title={title} style={box}>
        {inner}
        {origin && <SrOnly>{`, originally ${origin}’s pick`}</SrOnly>}
      </span>
    );
  }
  if (editing) {
    return (
      <select autoFocus value={ownerId} onChange={e => onPick(e.target.value)} onBlur={onBlur}
        aria-label={ariaLabel}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: isDark ? '#161a22' : '#f7f9fc', border: `1px solid ${accentColor}`,
          borderRadius: tokens.radiusSm, padding: '4px 2px', fontSize: 11, fontWeight: 600,
          color: t.textPrimary, fontFamily: 'inherit', cursor: 'pointer',
        }}>
        {teams.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    );
  }
  return (
    <button onClick={onEdit} className={traded ? undefined : 'kh-pick-cell'} title={title} aria-label={ariaLabel}
      style={{ ...box, cursor: 'pointer' }}>
      {inner}
    </button>
  );
}

// A lottery slot before the draw: the number is known, the team isn't. Not
// clickable — a placeholder maps to no owner, so a trade on a lottery team's
// pick is recorded from the Add-trade control instead. The asterisk marks a
// round in which a lottery team's pick has been traded; the title says whose.
function LotteryPlaceholder({ overall, trades, isDark, dim = false }) {
  const t = makeTheme(isDark);
  const marked = trades.length > 0;
  const title = marked ? trades.join(' ') : `Pick ${overall} — a lottery slot; the team is set when the lottery is run.`;
  // The asterisk's meaning is in the DOM as read-only text, not just in the
  // hover: a screen reader hears the same sentences a sighted reader gets on
  // hover ("One of picks 25–28 is Corey's, via Pedram.").
  return (
    <span title={title}
      style={{
        display: 'block', width: '100%', boxSizing: 'border-box',
        border: `1px dashed ${t.border}`, borderRadius: tokens.radiusSm, padding: '4px 4px',
        textAlign: 'center', whiteSpace: 'nowrap', cursor: marked ? 'help' : 'default',
        position: 'relative', opacity: dim ? 0.3 : 1,
      }}>
      <span style={{ display: 'block', ...tokens.typeStatMeta, fontWeight: 700, color: t.textMuted, marginBottom: 1 }}>
        {overall}{marked && <span aria-hidden style={{ color: t.warning, marginLeft: 2 }}>*</span>}
      </span>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: t.textMuted, fontStyle: 'italic' }}>Lottery pick</span>
      <SrOnly>{marked ? ` ${trades.join(' ')}` : ' The team is set when the lottery is run.'}</SrOnly>
    </span>
  );
}

// "One of picks 25–28 is Corey's, via Pedram." — one sentence per traded
// lottery-team pick in the round. Exported for the smoke test.
export function lotteryTradeLines(league, board, round, nameOf) {
  const range = lotteryRangeFor(board, round);
  if (!range) return [];
  const span = range[0] === range[1] ? `pick ${range[0]}` : `picks ${range[0]}–${range[1]}`;
  return board.lotteryEligible
    .map(id => ({ original: id, owner: pickOwnerId(league, round, id) }))
    .filter(p => p.owner !== p.original)
    .map(p => `One of ${span} is ${nameOf(p.owner)}'s, via ${nameOf(p.original)}.`);
}

// `readOnly` is the member-facing mode (the shared page): the same board,
// nothing clickable, no reassign path. `highlightTeamId` dims every cell that
// isn't that team's — its own picks and the ones it holds by trade stay at
// full weight, and before the lottery so do the placeholders in any round
// where one of the lottery-team picks it holds could land.
function DraftBoardGrid({ league, board, teams, isDark, accentColor, editing, setEditing, reassign, readOnly = false, highlightTeamId = null }) {
  const t = makeTheme(isDark);
  const nameOf = (id) => teams.find(tm => tm.id === id)?.name || '?';
  const n = board.teams;
  const rounds = board.rounds;
  const roundList = Array.from({ length: rounds }, (_, i) => i + 1);
  const bySlot = new Map(board.picks.map(p => [`${p.round}:${p.slot}`, p]));
  const tradeLinesByRound = new Map(roundList.map(r => [r, lotteryTradeLines(league, board, r, nameOf)]));
  const isEditing = (round, originalTeamId) => !!editing && editing.round === round && editing.originalTeamId === originalTeamId;
  const stickyBg = { backgroundColor: t.cardBg, backgroundImage: `linear-gradient(${t.sectionBg}, ${t.sectionBg})` };
  const roundRule = `1px solid ${t.divider}`;

  // Whether a lottery-team pick this team holds could land on the round's
  // placeholders (its own, or one it acquired by trade).
  const holdsLotteryPickIn = (round) => !!highlightTeamId
    && board.lotteryEligible.some(id => pickOwnerId(league, round, id) === highlightTeamId);

  const cellFor = (round, originalTeamId, number) => {
    const ownerId = pickOwnerId(league, round, originalTeamId);
    const traded = ownerId !== originalTeamId;
    const dim = !!highlightTeamId && ownerId !== highlightTeamId;
    const title = readOnly
      ? (traded
        ? `Pick ${number} — originally ${nameOf(originalTeamId)}'s pick, now ${nameOf(ownerId)}'s.`
        : `Pick ${number} — ${nameOf(originalTeamId)}'s own pick.`)
      : (traded
        ? `Pick ${number} — originally ${nameOf(originalTeamId)}'s pick, now ${nameOf(ownerId)}'s. Click to reassign.`
        : `Pick ${number} — ${nameOf(originalTeamId)}'s own pick. Click to record a trade.`);
    // The accessible name carries everything the hover does — the origin of
    // a traded pick is only on hover visually, and hover doesn't exist for a
    // screen reader.
    return (
      <PickCell number={number} label={nameOf(ownerId)} traded={traded} title={title}
        ariaLabel={`Round ${round}, ${title}`}
        editing={!readOnly && isEditing(round, originalTeamId)} ownerId={ownerId} teams={teams}
        onEdit={readOnly ? undefined : () => setEditing({ round, originalTeamId })}
        onPick={readOnly ? undefined : id => reassign(round, originalTeamId, id)}
        onBlur={readOnly ? undefined : () => setEditing(null)}
        isDark={isDark} accentColor={accentColor}
        readOnly={readOnly} origin={traded ? nameOf(originalTeamId) : null} dim={dim} />
    );
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: SLOT_W + rounds * CELL_W }}>
        <thead>
          <tr>
            {/* Sticky cells layer the translucent sectionBg over the opaque
                cardBg — a bare sectionBg would let scrolled cells ghost through. */}
            <th scope="col" style={{ width: SLOT_W, padding: '10px 4px', ...stickyBg, borderBottom: `1px solid ${t.divider}`, ...tokens.typeLabelEyebrow, color: t.textMuted, textAlign: 'center', position: 'sticky', left: 0, zIndex: 2 }}>Pick</th>
            {/* A rule on every round column's left edge: rounds-as-columns
                is the right layout, but fantasy readers know Yahoo's
                rounds-as-rows, so the columns have to read as distinct at a
                glance rather than as one undifferentiated grid. */}
            {roundList.map(round => (
              <th key={round} scope="col" style={{ width: CELL_W, padding: '10px 6px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, borderLeft: roundRule, ...tokens.typeLabelEyebrow, color: t.textSecondary, textAlign: 'center', whiteSpace: 'nowrap' }}>
                R{round}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: n }, (_, i) => i + 1).map(slot => {
            const rowBorder = slot < n ? `1px solid ${t.dividerFaint}` : 'none';
            return (
              <tr key={slot}>
                <th scope="row" style={{ padding: '6px 4px', ...stickyBg, borderBottom: rowBorder, ...tokens.typeBodyMeta, fontWeight: 700, color: t.textSecondary, textAlign: 'center', position: 'sticky', left: 0, zIndex: 1 }}>
                  {slot}
                </th>
                {roundList.map(round => {
                  const pick = bySlot.get(`${round}:${slot}`);
                  return (
                    <td key={round} style={{ padding: '3px 4px', borderBottom: rowBorder, borderLeft: roundRule, textAlign: 'center' }}>
                      {!pick ? null : pick.pending
                        ? <LotteryPlaceholder overall={pick.overall} trades={tradeLinesByRound.get(round)} isDark={isDark} dim={!!highlightTeamId && !holdsLotteryPickIn(round)} />
                        : cellFor(round, pick.originalTeamId, String(pick.overall))}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The pre-lottery line above the board: who's in the lottery, and the way to
// run it. Gone once the draw is on file.
// `showLink` is off on the shared page — a member has no Lottery page to go to.
function LotteryPendingLine({ league, board, teams, isDark, showLink = true }) {
  const t = makeTheme(isDark);
  const names = sortTeamsByName(teams.filter(tm => board.lotteryEligible.includes(tm.id))).map(tm => tm.name);
  return (
    <div style={{ padding: '10px 20px', background: t.sectionBg, borderBottom: `1px solid ${t.divider}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', ...tokens.typeBodyMeta, color: t.textSecondary }}>
      <span>
        <strong style={{ color: t.textPrimary }}>Lottery not run</strong>
        {names.length > 0 && <> — {names.join(', ')} {names.length === 1 ? 'is' : 'are'} in it.</>}
      </span>
      {showLink && (
        <Link to={`/league/${league.id}/lottery`} style={{ ...tokens.typePill, fontWeight: 700, color: tokens.info, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          Run lottery →
        </Link>
      )}
    </div>
  );
}

export { DraftBoardGrid, PickCell, LotteryPlaceholder, LotteryPendingLine, SLOT_W, CELL_W };
