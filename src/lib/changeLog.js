// Commissioner change log — an append-only record of value edits and imports.
//
// There is no version history in this app (Open item: snapshots/undo), so the
// log's job is narrow and it should stay narrow: answer "what did I change, on
// which player, from what to what, and when" without pretending to be
// something you can roll back to. It records the change; it does not store the
// state before it.
//
// Lives in the league `data` blob as league.changeLog — no table, no column,
// no migration. It rides saveLeague like every other league field.
//
// Bounded on purpose: an unbounded array inside a jsonb blob grows every save
// forever, and the blob is written whole on every edit. CHANGE_LOG_LIMIT keeps
// the newest entries and drops the oldest; the UI says so rather than implying
// the list is complete.
//
// Pure — no React — so scripts/test-provenance.mjs runs it in plain node.

export const CHANGE_LOG_LIMIT = 500;

// Newest first. Stored that way (rather than sorted on read) so the trim is a
// slice and the UI is a straight map.
export function changeLogOf(league) {
  const log = league?.changeLog;
  return Array.isArray(log) ? log : [];
}

// One record. `from`/`to` are the raw values — formatting is describeChange's
// job, so a stored entry never has to be re-parsed to be re-rendered.
export function changeEntry({ kind, field = null, teamId = null, teamName = null, player = null, from = null, to = null, note = null, at = null }) {
  return {
    at: at || new Date().toISOString(),
    kind, field, teamId, teamName, player,
    from: from ?? null,
    to: to ?? null,
    ...(note ? { note } : {}),
  };
}

// Returns a NEW league with the entries prepended. Never mutates, and returns
// the league untouched when there's nothing to record — so callers can pipe
// every update through it without checking first.
export function appendChanges(league, entries) {
  const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
  if (list.length === 0) return league;
  const next = [...list].reverse().concat(changeLogOf(league));
  return { ...league, changeLog: next.slice(0, CHANGE_LOG_LIMIT) };
}

const money = (v) => (v == null ? '—' : `$${v}`);
const plain = (v) => (v == null || v === '' ? '—' : String(v));

// Human-readable form for the log UI. Returns parts rather than one string so
// the card can weight the player name against the rest.
export function describeChange(entry) {
  if (!entry) return { subject: '', action: '', detail: '' };
  const where = entry.teamName ? entry.teamName : '';
  switch (entry.kind) {
    case 'price':
      return {
        subject: entry.player,
        action: 'keep cost set by hand',
        detail: `${money(entry.from)} → ${money(entry.to)}`,
        where,
      };
    case 'priceReset':
      return {
        subject: entry.player,
        action: 'keep cost reset to calculated',
        detail: `${money(entry.from)} → ${money(entry.to)}`,
        where,
      };
    case 'draftPrice':
      return {
        subject: entry.player,
        action: 'drafted price set by hand',
        detail: `${money(entry.from)} → ${money(entry.to)}`,
        where,
      };
    case 'draftPriceReset':
      return {
        subject: entry.player,
        action: 'drafted price reset to imported',
        detail: `${money(entry.from)} → ${money(entry.to)}`,
        where,
      };
    case 'term':
      return {
        subject: entry.player,
        action: entry.field === 'contractLength' ? 'term length changed' : 'term year changed',
        detail: `${plain(entry.from)} → ${plain(entry.to)}`,
        where,
      };
    case 'round':
      return {
        subject: entry.player,
        action: 'draft round changed',
        detail: `${entry.from == null ? '—' : `R${entry.from}`} → ${entry.to == null ? '—' : `R${entry.to}`}`,
        where,
      };
    case 'season':
      return {
        subject: 'Season',
        action: `rolled ${plain(entry.from)} → ${plain(entry.to)}`,
        detail: entry.note || '',
        where: '',
      };
    case 'import':
      return {
        subject: entry.teamName || 'League',
        action: entry.field === 'roster' ? 'roster re-imported' : 'draft re-imported',
        detail: entry.note || '',
        where: '',
      };
    default:
      return { subject: entry.player || entry.teamName || '', action: entry.kind, detail: entry.note || '', where };
  }
}

// "3 minutes ago" / "Aug 20, 2:14 PM" — recent edits read as recent, older
// ones get an actual date. `now` is injectable so the formatting is testable.
export function formatChangeTime(iso, now = Date.now()) {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = now - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
