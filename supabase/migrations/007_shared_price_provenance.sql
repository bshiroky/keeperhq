-- Hand-set keeper prices, and the draft round the row sort needs.
-- Run in the Supabase SQL Editor (project keeperhq) after 006_shared_league_rules.sql.
--
-- No table changes. This ONLY replaces get_shared_league, because that function
-- is an explicit field-list projection: anything the shared page needs has to
-- be named in it. Two additions, one new and one a long-standing gap.
--
--   1. keepers.keptForOverridden — the commissioner can set a keep cost
--      directly instead of taking the calculated one (drafted price + $N/yr).
--      The PRICE itself already reached members: keptFor holds the value in
--      force by design, precisely so an un-migrated reader shows the right
--      number. What was missing is the MARKER, and the page needs it because
--      the discrepancy is already visible without it — the page prints
--      "Drafted $83" beside "Keep for $95" and the rules modal states the
--      escalation rule, so a member doing the arithmetic sees a number that
--      doesn't add up and has no way to tell a commissioner decision from a
--      bug in the tool.
--
--      Only the boolean is projected. keptForComputed (the pre-edit value) is
--      deliberately NOT — the page says a price was set by hand, it does not
--      show what it was before. That is a diff, and the change log that holds
--      it stays commissioner-only.
--
--      priorKeepers.keptForOverridden is also NOT projected: a corrected
--      DRAFTED price produces no visible inconsistency (the page shows the
--      corrected price and the keep cost that follows from it, and the
--      arithmetic works), so there is nothing for a marker to explain.
--
--   2. priorKeepers.acquisitionRound — a pre-existing gap, not part of the
--      provenance work. buildSharedRows reads it onto every row and
--      sortRowsDefault orders stats-less snake leagues by it, so without the
--      projection that sort has silently been falling back to alphabetical on
--      the shared page since it shipped. Same one-line class of fix, folded in
--      here rather than earning its own migration.
--
-- Still NOT projected, on purpose: owner_id, buy-in, `payouts`, `payoutNote`,
-- payment status, commissioner fields, the share token, keptForComputed, and
-- the change log.
--
-- Same security model as before: SECURITY DEFINER, stable, empty search_path,
-- EXECUTE for anon + authenticated only (grants survive CREATE OR REPLACE).
-- RLS on public.leagues is untouched and still owner-only.

create or replace function public.get_shared_league(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name',               l.data->>'name',
    'sport',              l.data->>'sport',
    'draftType',          l.data->>'draftType',
    'keeperDeadline',     l.data->'keeperDeadline',
    'keeperDeadlineTime', l.data->'keeperDeadlineTime',
    'contractYears',      l.data->'contractYears',
    'keeperSlots',        l.data->'keeperSlots',
    -- Keeper cost/term model (the wizard's keys). Without these the shared
    -- page falls back to the legacy shim and can describe the rules wrongly
    -- for a slot- or pick-cost league.
    'keeperCostModel',    l.data->'keeperCostModel',
    'termModel',          l.data->'termModel',
    'termYears',          l.data->'termYears',
    'mustFillSlots',      l.data->'mustFillSlots',
    'pickRules',          l.data->'pickRules',
    'rookieRules',        l.data->'rookieRules',
    -- Commissioner's free text for the member-facing rules modal. Deliberately
    -- NEW keys: the existing `payouts` / `payoutNote` stay unprojected, so no
    -- money data written for the commissioner's own eyes is exposed by this.
    'sharedRulesNote',    l.data->'sharedRulesNote',
    'sharedPayoutsNote',  l.data->'sharedPayoutsNote',
    'minKeepers',         l.data->'minKeepers',
    'contractsRequired',  l.data->'contractsRequired',
    'auctionRules', jsonb_build_object(
      'costIncreasePerYear', l.data->'auctionRules'->'costIncreasePerYear',
      'undraftedStartCost',  l.data->'auctionRules'->'undraftedStartCost'
    ),
    'statCategories',    l.data->'statCategories',
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',   team.value->>'id',
        'name', team.value->>'name',
        'keepers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'player',            k.value->>'player',
            'pos',               k.value->>'pos',
            'contractYear',      k.value->'contractYear',
            'contractLength',    k.value->'contractLength',
            'keptFor',           k.value->'keptFor',
            -- The marker only. keptForComputed stays private.
            'keptForOverridden', k.value->'keptForOverridden',
            'tradedTo',          k.value->'tradedTo'
          ) order by k.ordinality)
          from jsonb_array_elements(coalesce(team.value->'keepers', '[]'::jsonb))
            with ordinality as k
        ), '[]'::jsonb),
        'priorKeepers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'player',           pk.value->>'player',
            'pos',              pk.value->>'pos',
            'contractYear',     pk.value->'contractYear',
            'contractLength',   pk.value->'contractLength',
            'keptFor',          pk.value->'keptFor',
            -- Read by buildSharedRows and used to sort stats-less snake
            -- leagues; unprojected until now, so that sort never worked here.
            'acquisitionRound', pk.value->'acquisitionRound',
            'expired',          pk.value->'expired'
          ) order by pk.ordinality)
          from jsonb_array_elements(coalesce(team.value->'priorKeepers', '[]'::jsonb))
            with ordinality as pk
        ), '[]'::jsonb),
        'roster', coalesce((
          select jsonb_agg(jsonb_build_object(
            'player', r.value->>'player',
            'pos',    r.value->>'pos'
          ) order by r.ordinality)
          from jsonb_array_elements(coalesce(team.value->'roster', '[]'::jsonb))
            with ordinality as r
        ), '[]'::jsonb)
      ) order by team.ordinality)
      from jsonb_array_elements(coalesce(l.data->'teams', '[]'::jsonb))
        with ordinality as team
    ), '[]'::jsonb)
  )
  from public.leagues l
  where l.share_token = p_token
    and l.deleted_at is null;
$$;
