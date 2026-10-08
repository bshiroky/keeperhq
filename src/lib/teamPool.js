// Per-team eligible pool — the one place ownership, price, contract year,
// expiry and the keeper deadline are resolved. Every surface that needs to
// know what a team can keep reads this, so none of them can disagree: the
// Set-keepers workbench, the shared league page, and anything built later.
//
// Extracted from SetKeepersTab.jsx, where it was pure logic living in a JSX
// file and therefore untestable without a bundler. Behaviour is unchanged;
// SetKeepersTab re-exports it so existing imports keep working.

import { normalizeName } from './players.js';
import { acquisitionOf } from './acquisition.js';
import { computedPriceOf, isPriceOverridden } from './priceProvenance.js';
import { termOf, isAuctionCost, TERM_FIXED } from './keeperRules.js';
import { priorEnteringYear, anchorFor, isArchivedContract, BASIS_SERVED } from './contractSeason.js';
import { voidingActive, declaredKeeperNames, contractVoided } from './keeperDeadline.js';
import { rosterIndex, draftRecordStands } from './rosterMembership.js';

// Per-team eligible pool, split into the three groups the handoff calls for:
//   onContract        — prior keepers not expired, advanced one contract year
//                       (final when nextYear >= contractLength)
//   rosteredNoContract — roster players with no prior contract → fresh Y1 deal
//   expired           — contracts that ran out → blocked, back to the draft
export function buildTeamPool(league, team) {
  // Two independent dimensions: a term decides whether entries carry contract
  // years, an auction cost model decides whether they carry dollars. Both can
  // be true at once, so these are separate flags rather than one either/or.
  const term = termOf(league);
  const termed = term.model === TERM_FIXED;
  const dollars = isAuctionCost(league);
  const len = term.years || league.contractYears || 3;
  const bump = league.auctionRules?.costIncreasePerYear || 5;
  const base = league.auctionRules?.undraftedStartCost || 5;
  // Records retired by a past rollover are preserved on the league (the
  // preserve-don't-delete rule) but are NOT this season's data — the contract
  // they describe ended before this season began. Filtering them here, at the
  // one place the pool is built, is what makes preserving them invisible:
  // every downstream group behaves exactly as it did when the rollover
  // deleted them outright.
  const priors = (team?.priorKeepers || []).filter(p => !isArchivedContract(p));
  const roster = team?.roster || [];
  const priorByName = new Map(priors.map(p => [normalizeName(p.player), p]));

  // OWNERSHIP COMES FROM THE ROSTER, PRICE COMES FROM THE DRAFT.
  //
  // The imported roster is who finished the season on which team; the draft
  // import only says who paid what. They disagree for every traded or dropped
  // player, and this used to resolve the wrong way: a team's whole
  // priorKeepers list was treated as that team's pool, so a player drafted by
  // A and rostered by B showed as A's to keep — while B saw him as an
  // undrafted pickup at the floor price. Both halves were wrong, and the
  // second one is a real money bug (a $40 player keepable for $5).
  //
  // League-wide indexes make the two sources resolvable: who rosters a player
  // decides whose he is, and his prior record supplies the price no matter
  // which team drafted him.
  const allTeams = league?.teams || [];
  const rosterOwnerByName = new Map();
  const priorAnywhereByName = new Map();
  for (const tm of allTeams) {
    for (const r of tm.roster || []) {
      const k = normalizeName(r.player);
      if (k && !rosterOwnerByName.has(k)) rosterOwnerByName.set(k, tm.id);
    }
    for (const p of tm.priorKeepers || []) {
      if (isArchivedContract(p)) continue;
      const k = normalizeName(p.player);
      if (k && !priorAnywhereByName.has(k)) priorAnywhereByName.set(k, p);
    }
  }
  // Whether a draft record still counts for this team is rosterMembership's
  // call: rostered elsewhere → not ours (we only lend the price); on no roster
  // → ours only while OUR roster hasn't been imported. A league with no rosters
  // imported at all therefore behaves exactly as a draft-only league always did.
  const index = rosterIndex(league);

  // Expiry belongs to the term, not the draft format — a term-less league
  // never expires anyone, and an auction league with a term does.
  // priorEnteringYear prefers the record's own `startSeason` anchor and falls
  // back to the stored counter, so an anchored and an un-anchored record with
  // the same real contract year expire on the same season.
  const isExpired = (p) => !!(p.expired || (termed && priorEnteringYear(league, p) > (p.contractLength || len)));

  // Thread acquisition metadata through pool entries (only fields actually
  // present on the source record) so makeKeeper can stamp it on the keeper.
  const acqCarry = (p) => {
    const out = {};
    if (p.acquisitionRound != null) out.acquisitionRound = p.acquisitionRound;
    if (p.acquisitionMethod) out.acquisitionMethod = p.acquisitionMethod;
    if (p.rookieAtAcquisition) out.rookieAtAcquisition = true;
    return out;
  };

  // A prior draft record → the on-contract entry (price, contract year, etc).
  // `source` is the roster row when we have one, so the roster's position and
  // any acquisition metadata ride along.
  const contractEntry = (prior, source) => {
    const entry = {
      player: source?.player || prior.player,
      pos: source?.pos || prior.pos,
      kind: 'contract',
      ...acqCarry(source || {}), ...acqCarry(prior),
    };
    if (dollars) {
      // prior.keptFor is the drafted price IN FORCE — a commissioner override
      // of a bad paste value flows into the escalation automatically, which is
      // the point of storing the override in the read field.
      entry.nextCost = prior.keptFor != null ? prior.keptFor + bump : base;
      entry.wasCost = prior.keptFor;
      entry.wasCostOverridden = isPriceOverridden(prior);
      entry.wasCostComputed = computedPriceOf(prior);
      entry.yearsKept = (prior.yearsKept || 0) + 1;
    }
    if (termed) {
      entry.nextYear = priorEnteringYear(league, prior);
      entry.length = prior.contractLength || len;
      entry.final = entry.nextYear >= entry.length;
      // The anchor rides into the pool entry so makeKeeper can stamp it on a
      // declared keeper — a keep continues the existing contract, it does not
      // start a new one.
      entry.startSeason = prior.startSeason || anchorFor(league, prior, BASIS_SERVED);
    }
    return entry;
  };

  // An expired entry still names its term so the contract-year control can
  // show where it ran out (and revive it if the import got the year wrong).
  const expiredTerm = (p) => (termed ? { length: p.contractLength || len, year: priorEnteringYear(league, p) } : {});

  const onContract = [];
  const expired = [];
  const rosteredNoContract = [];
  const claimed = new Set();

  // This team's roster is the spine of its pool.
  roster.forEach(r => {
    const key = normalizeName(r.player);
    if (key) claimed.add(key);
    // The prior record may belong to whichever team DRAFTED him — the price
    // follows the player, not the team that paid it.
    const prior = priorAnywhereByName.get(key);
    if (!prior) {
      const entry = { player: r.player, pos: r.pos, kind: 'rostered', ...acqCarry(r) };
      if (dollars) { entry.nextCost = base; entry.yearsKept = 1; }
      if (termed) { entry.nextYear = 1; entry.length = len; entry.final = 1 >= len; entry.startSeason = league?.season || null; }
      rosteredNoContract.push(entry);
      return;
    }
    if (isExpired(prior)) {
      expired.push({ player: r.player, pos: r.pos || prior.pos, kind: 'expired', ...expiredTerm(prior) });
      return;
    }
    onContract.push(contractEntry(prior, r));
  });

  // Draft records with no roster row on THIS team. The player only joins the
  // pool when the record still stands (see draftRecordStands). Expired
  // contracts are the one exception to "no roster, no pool": they carry no
  // price and can't be kept, they only say who is back in the draft, and that
  // stays true whether or not anyone rosters the player now.
  priors.forEach(p => {
    const key = normalizeName(p.player);
    if (claimed.has(key)) return;
    if (isExpired(p)) {
      if (index.owners.has(key) && index.owners.get(key) !== team?.id) return;
      expired.push({ player: p.player, pos: p.pos, kind: 'expired', ...expiredTerm(p) });
      return;
    }
    if (!draftRecordStands(index, team, key)) return;
    onContract.push(contractEntry(p, null));
  });

  // ── Unkept at the deadline voids the contract ──
  // Once the deadline has passed, a contract nobody declared is over: in a
  // fixed-term league not being kept ends the deal and the player goes back
  // into the draft. Entirely DERIVED — no record is touched, so moving the
  // deadline later restores every one of these rows exactly as it was.
  //
  // Only the TERM is voided. The dollar fields ride through untouched: a
  // voided contract is not a repricing, and silently dropping a player to the
  // undrafted floor because a date passed would be a money bug of the same
  // shape as the ownership one this function already exists to prevent.
  if (termed && voidingActive(league)) {
    const declared = declaredKeeperNames(league);
    const stillOnContract = [];
    for (const entry of onContract) {
      if (!contractVoided(entry.player, { active: true, declared })) { stillOnContract.push(entry); continue; }
      const { nextYear, length, final, startSeason, ...rest } = entry;
      rosteredNoContract.push({ ...rest, kind: 'rostered', contractVoided: true });
    }
    return { onContract: stillOnContract, rosteredNoContract, expired };
  }

  return { onContract, rosteredNoContract, expired };
}
