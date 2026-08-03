// Keeper-rules resolution — the single read path for "what does keeping cost"
// and "how long does a keep last".
//
// Two independent dimensions, asked separately by the create-league wizard:
//   cost — a slot, a draft pick, or auction dollars   (league.keeperCostModel)
//   term — none, or a fixed length                     (league.termModel/termYears)
//
// Leagues created before the wizard carry only the legacy keys (draftType /
// contractYears / auctionRules), where a single field stood in for both
// dimensions. Every read site goes through this module so both shapes render
// identically. Nothing here writes: resolution happens at read time only, so
// existing leagues need no data migration.

export const COST_SLOT = 'slot';
export const COST_PICKS = 'picks';
export const COST_AUCTION = 'auction';

export const TERM_NONE = 'none';
export const TERM_FIXED = 'fixed';

const COST_MODELS = [COST_SLOT, COST_PICKS, COST_AUCTION];

// What keeping a player costs. Explicit key wins; otherwise fall back to the
// legacy signals, where `auctionRules` (or draftType 'auction') was the only
// way to express an auction league and everything else was contract/snake —
// a league whose cost was the keeper slot itself.
export function keeperCostModelOf(league) {
  if (!league) return COST_SLOT;
  if (COST_MODELS.includes(league.keeperCostModel)) return league.keeperCostModel;
  if (league.auctionRules || league.draftType === 'auction') return COST_AUCTION;
  return COST_SLOT;
}

// Returns { model, years }. years is null when there is no term.
// Legacy leagues encoded a term as `contractYears`.
export function termOf(league) {
  if (!league) return { model: TERM_NONE, years: null };
  if (league.termModel === TERM_FIXED) {
    return { model: TERM_FIXED, years: league.termYears ?? league.contractYears ?? 3 };
  }
  if (league.termModel === TERM_NONE) return { model: TERM_NONE, years: null };
  const legacy = league.contractYears;
  if (legacy) return { model: TERM_FIXED, years: legacy };
  return { model: TERM_NONE, years: null };
}

export function hasTerm(league) {
  return termOf(league).model === TERM_FIXED;
}

// Draft FORMAT — how the draft itself runs. Independent of the cost model:
// a contracts league can run an auction draft. Only ever read from the
// explicit key (legacy leagues already carry a correct draftType).
export function draftFormatOf(league) {
  return league?.draftType === 'auction' ? 'auction' : 'snake';
}

export function isAuctionCost(league) {
  return keeperCostModelOf(league) === COST_AUCTION;
}
export function isPickCost(league) {
  return keeperCostModelOf(league) === COST_PICKS;
}

// Legacy back-compat key. Derived only where a legacy archetype unambiguously
// exists; slot + no term has no legacy equivalent, so it resolves to null
// rather than being forced onto a wrong value. Read sites must handle null —
// nothing in the UI names this key.
export function keeperArchetypeOf(costModel, termModel) {
  if (costModel === COST_AUCTION) return 'auctionPrices';
  if (costModel === COST_PICKS) return 'draftPicks';
  if (costModel === COST_SLOT && termModel === TERM_FIXED) return 'contracts';
  return null;
}

// The value a keeper cell/row shows for a keep. Cost and term are independent,
// so this composes rather than choosing: dollars when the cost model is
// auction, the term position when a term is set, BOTH when both apply (the
// auction + term combination the old either/or branch could not express).
// Slot and pick costs with no term have no per-player number — the slot itself
// is the cost, so say so rather than inventing a year.
export function keeperValueText(league, keeper) {
  const parts = [];
  if (isAuctionCost(league)) parts.push(`$${keeper?.keptFor ?? 0}`);
  const term = termOf(league);
  if (term.model === TERM_FIXED) {
    const len = keeper?.contractLength || term.years || 3;
    parts.push(`Y${keeper?.contractYear || 1}/${len}`);
  }
  return parts.length ? parts.join(' · ') : '1 slot';
}

// A keep is in its final year only when a term exists and it has reached it.
// Previously keyed off draftType === 'snake', which both missed auction leagues
// with a term and claimed a final year on term-less contract leagues.
export function isFinalYear(league, keeper) {
  const term = termOf(league);
  if (term.model !== TERM_FIXED) return false;
  const len = keeper?.contractLength || term.years || 3;
  return (keeper?.contractYear || 0) >= len;
}

export const COST_LABEL = {
  [COST_SLOT]: 'Slot only',
  [COST_PICKS]: 'Draft picks',
  [COST_AUCTION]: 'Auction',
};

export const DRAFT_FORMAT_LABEL = { snake: 'Snake', auction: 'Auction' };

export function termLabel(term) {
  return term.model === TERM_FIXED ? `${term.years}-yr terms` : 'no term';
}

// The live-preview / league-card rule string: "{cost} · {term} · {N} keepers".
// Never names an archetype. `costAnswered`/`termAnswered` let the wizard hold
// each half back until its screen has actually been answered.
export function keeperRuleSummary(league, { costAnswered = true, termAnswered = true } = {}) {
  const slots = league?.keeperSlots;
  const tail = slots ? `${slots} keeper${slots === 1 ? '' : 's'}` : null;
  const parts = [];
  if (costAnswered) parts.push(COST_LABEL[keeperCostModelOf(league)]);
  if (termAnswered) parts.push(termLabel(termOf(league)));
  if (parts.length === 0) parts.push('Keeper league');
  if (tail) parts.push(tail);
  return parts.join(' · ');
}

// True once any keeper data exists on the league — the gate for locking the
// cost model in Settings. Counts declared keepers and imported prior-season
// records, since both carry cost values (dollar prices / draft rounds) that a
// cost-model switch would strand with no honest conversion.
export function hasKeeperData(league) {
  return (league?.teams || []).some(
    tm => (tm.keepers || []).length > 0 || (tm.priorKeepers || []).length > 0
  );
}
