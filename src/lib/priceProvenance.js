// Price provenance — telling a value the app COMPUTED from a value a human SET.
//
// Every dollar figure in this app starts life computed: a prior-draft price
// comes from the draft paste, a keep cost comes from buildTeamPool's
// escalation math (drafted price + $N/yr, or the undrafted floor). The
// commissioner can overwrite either one by typing in its input, and until now
// the typed value was stored in the same field as the derived one — so nothing
// could tell them apart, nothing could mark them, and a re-import silently
// destroyed the typed one with no way back.
//
// Storage keeps BOTH values on the record that already holds the price:
//
//   keptFor            the value IN FORCE — what every reader shows and every
//                      cost calculation uses. Unchanged meaning, so nothing
//                      that reads a price had to change.
//   keptForComputed    the computed/imported value, preserved under an
//                      override. May legitimately be null (the import supplied
//                      no price for this row at all).
//   keptForOverridden  true when a human set keptFor directly.
//
// The boolean is NOT redundant with comparing the two numbers: a human can set
// a price on a row the import gave no price for, where the computed value is
// legitimately null and "differs from keptFor" isn't a usable test.
//
// WHY keptFor holds the value in force rather than the computed value.
// The brief said "store the override separately, read the override when
// present", which describes either arrangement — the difference is what an
// un-updated reader shows. The public shared page reads through
// get_shared_league, a field-list SQL projection that names `keptFor` and
// nothing else, so putting the override in a NEW field would have shown
// leaguemates the pre-edit price until that function was migrated. Both values
// are still stored and the override is still what's read; this way a reader
// this module doesn't know about shows the RIGHT number and merely misses the
// "edited" marker, instead of confidently showing a stale one.
//
// Pure — no React, no Supabase — so scripts/test-provenance.mjs can run it in
// plain node.

// The price in force: what to charge, display, and calculate from.
export function priceOf(entry) {
  return entry?.keptFor ?? null;
}

// What the app would have computed on its own. Under an override that's the
// preserved value; with no override the value in force IS the computed one.
export function computedPriceOf(entry) {
  if (!entry) return null;
  if (entry.keptForOverridden) return entry.keptForComputed ?? null;
  return entry.keptFor ?? null;
}

export function isPriceOverridden(entry) {
  return entry?.keptForOverridden === true;
}

// The patch for a human typing a price. Typing the computed value back is a
// reset, not an override — otherwise a commissioner who retypes $88 over $88
// leaves a permanent "edited" badge on a row nobody actually changed.
export function setPrice(entry, next) {
  const value = next == null ? null : next;
  const computed = computedPriceOf(entry);
  if (value === computed) return resetPrice(entry);
  return { keptFor: value, keptForComputed: computed, keptForOverridden: true };
}

// Back to what the app computes. Clears the provenance fields rather than
// leaving them set-but-equal, so a later re-import refreshes this row freely.
export function resetPrice(entry) {
  return { keptFor: computedPriceOf(entry), keptForComputed: null, keptForOverridden: false };
}

// The fields a re-imported row should carry, given whatever row was already on
// file for that player. This is the whole point of storing both values: the
// import refreshes the COMPUTED price while the commissioner's override stays
// in force. Nothing else about the row is merged — the rest is replaced, as it
// always was.
export function refreshComputedPrice(existing, computedNext) {
  const value = computedNext == null ? null : computedNext;
  if (!isPriceOverridden(existing)) return { keptFor: value };
  return {
    keptFor: existing.keptFor ?? null,
    keptForComputed: value,
    keptForOverridden: true,
  };
}

export function countOverriddenPrices(list) {
  return (list || []).filter(isPriceOverridden).length;
}

// Every hand-set price on a league, flattened for a summary count. Covers both
// record types because both carry prices the commissioner can type over:
// declared keepers (the keep cost) and prior-draft rows (the drafted price).
export function overriddenPricesIn(league) {
  const out = [];
  for (const team of league?.teams || []) {
    for (const k of team.keepers || []) {
      if (isPriceOverridden(k)) out.push({ teamId: team.id, teamName: team.name, player: k.player, kind: 'keeper' });
    }
    for (const p of team.priorKeepers || []) {
      if (isPriceOverridden(p)) out.push({ teamId: team.id, teamName: team.name, player: p.player, kind: 'draft' });
    }
  }
  return out;
}
