-- Member-facing league rules on the shared page.
-- Run in the Supabase SQL Editor (project keeperhq) after 003_soft_delete.sql.
--
-- No table changes. This ONLY replaces get_shared_league, because that
-- function is an explicit field-list projection: anything the shared page
-- needs has to be named in it, and the rules modal needs two kinds of field
-- the projection never carried.
--
--   1. The keeper cost/term config the create-league wizard writes
--      (keeperCostModel, termModel, termYears, pickRules, rookieRules,
--      mustFillSlots). The modal derives "what keeping costs" from these, so
--      without them a slot- or pick-cost league would be described by the
--      legacy fallback shim rather than its real rules.
--   2. sharedRulesNote / sharedPayoutsNote — the commissioner's free text for
--      anything the config doesn't model. These live in the `data` blob like
--      every other league field, so they need no column and no migration of
--      their own; they just have to be projected.
--
-- What is still NOT projected, on purpose: owner_id, buy-in, `payouts`,
-- `payoutNote`, payment status, commissioner fields, and the share token.
-- The payout text members can see is the NEW sharedPayoutsNote field, written
-- deliberately for them — the pre-existing private payout data stays private.
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
            'player',         k.value->>'player',
            'pos',            k.value->>'pos',
            'contractYear',   k.value->'contractYear',
            'contractLength', k.value->'contractLength',
            'keptFor',        k.value->'keptFor',
            'tradedTo',       k.value->'tradedTo'
          ) order by k.ordinality)
          from jsonb_array_elements(coalesce(team.value->'keepers', '[]'::jsonb))
            with ordinality as k
        ), '[]'::jsonb),
        'priorKeepers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'player',         pk.value->>'player',
            'pos',            pk.value->>'pos',
            'contractYear',   pk.value->'contractYear',
            'contractLength', pk.value->'contractLength',
            'keptFor',        pk.value->'keptFor',
            'expired',        pk.value->'expired'
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
