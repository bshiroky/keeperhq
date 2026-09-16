// Season-anchored contracts — the season a contract's Y1 was, instead of a
// relative counter that only stays true if the rollover button was pressed
// exactly once per real season.
//
// THE PROBLEM THIS REPLACES. `contractYear` is a counter advanced by
// startNewSeason. It is correct only when the number of times that button was
// pressed equals the number of seasons that actually elapsed. Press it twice
// by accident and every contract in the league jumps two years, with nothing
// in the data able to detect it and no way back. Press it zero times and every
// contract is silently stale. The counter records an ACTION, not a FACT.
//
// `startSeason` records the fact: the season label of the contract's first
// year. The current year is then arithmetic against the league's own season
// label — (current start year − startSeason start year) + 1 — so a contract is
// self-describing and a wrong rollover is fixed by correcting the season label
// alone, not by hand-editing every record.
//
// TWO STORED CONVENTIONS, DELIBERATELY UNCHANGED. `keepers[].contractYear` is
// the ENTERING year; `priorKeepers[].contractYear` is the years SERVED
// entering this season (so entering year = contractYear + 1). Both predate
// this module and both are still written; the reads below name which basis
// they expect rather than normalizing the storage, because re-keying live
// league data is exactly the kind of migration this design exists to avoid.
//
// NOTHING HERE IS A MIGRATION. A record with no `startSeason` falls back to
// the stored counter, byte for byte as before, so anchored and un-anchored
// records coexist indefinitely and the backfill is optional.
//
// No imports on purpose: this is the bottom of the dependency graph, read by
// keeperRules, season, the pool builder and the shared page alike.

// ── Season labels ───────────────────────────────────────────────────────────
// Two shapes in the wild: a split-year range ("2026-27", "2026-2027") and a
// single year ("2026"). Only the START year carries meaning for contract
// arithmetic — a season is one season however its label is written.
export function seasonStartYear(label) {
  if (typeof label === 'number' && Number.isFinite(label)) return Math.trunc(label);
  if (typeof label !== 'string') return null;
  const m = label.trim().match(/^(\d{4})(?:\s*[-/]\s*\d{2,4})?$/);
  return m ? parseInt(m[1], 10) : null;
}

// Seasons from `from` to `to`. Null when either label can't be read — an
// unreadable label must surface as "can't compute", never as 0.
export function seasonsBetween(from, to) {
  const a = seasonStartYear(from);
  const b = seasonStartYear(to);
  if (a == null || b == null) return null;
  return b - a;
}

// Build a label for `startYear` in the same shape as `template`, so a backfill
// writing "2024-25" into a league that writes "2024-2025" doesn't introduce a
// second format the parser has to keep tolerating.
export function seasonLabelFrom(template, startYear) {
  if (!Number.isFinite(startYear)) return null;
  const start = Math.trunc(startYear);
  const range = typeof template === 'string' && template.trim().match(/^(\d{4})\s*([-/])\s*(\d{2,4})$/);
  if (!range) return String(start);
  const sep = range[2];
  const end = start + 1;
  return range[3].length === 2 ? `${start}${sep}${String(end).slice(-2)}` : `${start}${sep}${end}`;
}

// ── Entering year ───────────────────────────────────────────────────────────
// The year of the contract a player is ENTERING in `season` — what a row
// renders as the Y in "Y2/3". 1-based; clamped at 1 because a contract cannot
// be entering year zero, and a season label that has gone backwards (a
// corrected typo) should read as the contract's first year rather than as a
// negative.
export function enteringYearIn(startSeason, season) {
  const elapsed = seasonsBetween(startSeason, season);
  if (elapsed == null) return null;
  return Math.max(1, elapsed + 1);
}

// Basis names which stored convention a record uses when it has no anchor.
export const BASIS_SERVED = 'served';     // priorKeepers[].contractYear
export const BASIS_ENTERING = 'entering'; // keepers[].contractYear

// The entering year for one record. Anchor wins; the counter is the fallback,
// and the fallback is byte-identical to what each read site computed before
// this module existed.
export function enteringYearOf(league, record, basis) {
  if (!record) return null;
  if (record.startSeason) {
    const anchored = enteringYearIn(record.startSeason, league?.season);
    if (anchored != null) return anchored;
    // An anchor we can't read is not a reason to show nothing — fall through
    // to the counter, and let the backfill's report flag the bad label.
  }
  return counterEnteringYear(record, basis);
}

// The entering year the stored COUNTER alone implies, ignoring any anchor.
// Only the backfill needs this: to tell whether an existing anchor agrees with
// the counter it would have been computed from, the two have to be read
// independently. Every other read site wants enteringYearOf, where the anchor
// is the point.
export function counterEnteringYear(record, basis) {
  const stored = record?.contractYear;
  return basis === BASIS_ENTERING ? (stored || 1) : (stored || 0) + 1;
}

// Convenience readers, so call sites never have to remember which array they
// are holding.
export const priorEnteringYear = (league, record) => enteringYearOf(league, record, BASIS_SERVED);
export const keeperEnteringYear = (league, record) => enteringYearOf(league, record, BASIS_ENTERING);

// The anchor a record WOULD carry, computed from its counter. Used by the
// backfill to propose a value, and by the rollover to stamp one on a contract
// it is writing fresh.
export function anchorFor(league, record, basis) {
  const current = seasonStartYear(league?.season);
  if (current == null) return null;
  const entering = enteringYearOf(league, record, basis);
  if (entering == null) return null;
  return seasonLabelFrom(league?.season, current - (entering - 1));
}

// ── Status ──────────────────────────────────────────────────────────────────
// A contract is in exactly one of these states. Only `expired` is ever stored
// (it is a fact about a season that has ended); `void` is always derived, so
// moving the deadline restores the prior state with no data loss.
export const CONTRACT_ACTIVE = 'active';
export const CONTRACT_EXPIRED = 'expired';
export const CONTRACT_VOID = 'void';

// A record retired by a season rollover. It is kept rather than deleted (the
// preserve-don't-delete rule — there is no undo anywhere in this app), and it
// is NOT this season's data: it describes a contract that ended before the
// current season began. Live derivations skip it, which is why preserving it
// changes nothing a reader sees.
export function isArchivedContract(record) {
  return !!record && record.contractStatus === CONTRACT_EXPIRED;
}

// Mark a record as retired after `season`, without touching its terms — the
// numbers stay exactly as they were on the day it ended.
//
// `expired: true` is set alongside the status ON PURPOSE, and it is not
// redundant. A reader that has never heard of `contractStatus` — chiefly the
// shared page before migration 010 projects it — would otherwise see a
// perfectly ordinary contract record and print a dead deal to the whole league
// as live. With the legacy flag set, that same reader routes it to "expired",
// which is wrong only in being visible, not in what it claims. Readers that DO
// know the status filter the record out before either flag is consulted, so
// the extra field costs nothing once migrated. Failure modes are not
// symmetric; pick the one that degrades safely.
export function archiveContract(record, season) {
  return { ...record, contractStatus: CONTRACT_EXPIRED, expiredAfterSeason: season || null, expired: true };
}
