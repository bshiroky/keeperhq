// League rules, derived from the config the create-league wizard already
// writes. Pure — no React, no network — so it's unit-testable and so the
// member-facing rules modal and the commissioner's preview of it read from
// one place.
//
// Derived, never re-entered: every fact here comes from the same keys the app
// computes keeper costs from, so the rules a member reads cannot drift from
// the rules the app applies. Anything the config does NOT model (trade
// deadlines, payout structure, house rules) belongs in the commissioner's
// free-text notes instead — see sharedRulesNote / sharedPayoutsNote.

import {
  keeperCostModelOf, termOf, draftFormatOf, COST_SLOT, COST_PICKS, COST_AUCTION,
  TERM_FIXED, DRAFT_FORMAT_LABEL,
} from './keeperRules.js';

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// One card per fact: a short label, a headline value, and at most one line of
// detail. Cards, not paragraphs — a member should be able to read the rules at
// a glance rather than parse prose.
export function keeperRuleFacts(league) {
  if (!league) return [];
  const cost = keeperCostModelOf(league);
  const term = termOf(league);
  const facts = [];

  const slots = league.keeperSlots;
  if (slots != null) {
    const mustFill = !!(league.mustFillSlots || league.contractsRequired);
    facts.push({
      key: 'slots',
      label: 'Keeper slots',
      value: String(slots),
      detail: mustFill ? 'every slot must be filled' : 'keep up to this many — fewer is fine',
    });
  }

  if (cost === COST_AUCTION) {
    const bump = league.auctionRules?.costIncreasePerYear ?? 5;
    facts.push({
      key: 'cost',
      label: 'Cost to keep',
      value: 'Auction dollars',
      detail: bump > 0
        ? `last year's price + $${bump} each year you keep them`
        : "last year's price, no escalation",
    });
    const floor = league.auctionRules?.undraftedStartCost ?? 5;
    facts.push({
      key: 'undrafted',
      label: 'Undrafted players',
      value: `$${floor}`,
      detail: 'what a player picked up off waivers costs to keep',
    });
  } else if (cost === COST_PICKS) {
    const rules = league.pickRules || {};
    const topSlots = rules.subModel === 'topSlots';
    facts.push({
      key: 'cost',
      label: 'Cost to keep',
      value: 'A draft pick',
      detail: topSlots
        ? 'keepers cost your top picks, in order'
        : 'keeping a player costs the round he was drafted in',
    });
    const esc = rules.escalationPerYear ?? 0;
    facts.push({
      key: 'escalation',
      label: 'Each year kept',
      value: esc > 0 ? `−${esc} round${esc === 1 ? '' : 's'}` : 'No change',
      detail: esc > 0 ? 'the pick it costs moves up a round per year' : 'the cost stays put',
    });
    if (rules.waiverRound) {
      facts.push({
        key: 'waiver',
        label: 'Waiver pickups',
        value: rules.waiverRound === 'last' ? 'Last round' : `Round ${rules.waiverRound}`,
        detail: 'what a player added mid-season costs to keep',
      });
    }
  } else if (cost === COST_SLOT) {
    facts.push({
      key: 'cost',
      label: 'Cost to keep',
      value: 'A roster slot',
      detail: 'no draft pick, no salary — keeping just uses a slot',
    });
  }

  facts.push(term.model === TERM_FIXED
    ? {
      key: 'term',
      label: 'How long you can keep',
      value: `${term.years} year${term.years === 1 ? '' : 's'}`,
      detail: 'after the final year the player goes back into the draft',
    }
    : {
      key: 'term',
      label: 'How long you can keep',
      value: 'No limit',
      detail: 'keep the same player as many years as you like',
    });

  const rookies = league.rookieRules;
  if (rookies?.enabled) {
    const bits = [];
    if (rookies.extraYears) bits.push(`+${rookies.extraYears} year${rookies.extraYears === 1 ? '' : 's'}`);
    if (rookies.freeFirstYear) bits.push('first year free');
    facts.push({
      key: 'rookies',
      label: 'Rookies',
      value: bits.length ? bits.join(' · ') : 'Special rules',
      detail: 'rookies are kept on different terms',
    });
  }

  const format = draftFormatOf(league);
  if (format) {
    facts.push({
      key: 'format',
      label: 'Draft format',
      value: DRAFT_FORMAT_LABEL[format] || format,
      detail: format === 'auction' ? 'players are bid on' : 'picks run in order',
    });
  }

  return facts;
}

// The commissioner's free-text sections. Empty ones are omitted entirely
// rather than rendering a bare heading — the modal shows only the derived
// facts when nothing has been written.
export function ruleNotes(league) {
  const notes = [];
  const rules = (league?.sharedRulesNote || '').trim();
  const payouts = (league?.sharedPayoutsNote || '').trim();
  if (rules) notes.push({ key: 'rules', title: 'House rules', body: rules });
  if (payouts) notes.push({ key: 'payouts', title: 'Payouts', body: payouts });
  return notes;
}

export function hasRuleNotes(league) {
  return ruleNotes(league).length > 0;
}
