-- Season-anchored contracts on the shared page.
-- Run in the Supabase SQL Editor (project keeperhq) AFTER
-- 009_shared_auction_rules_projection.sql.
--
-- No table changes. This ONLY replaces get_shared_league, the explicit
-- field-list projection every member-facing read goes through. Because that
-- projection is a whitelist, a new key is invisible to members until it is
-- named here — which is why this file exists and why it must be run.
--
-- Three fields are added, on BOTH `keepers` and `priorKeepers`:
--
--   startSeason        the season label of the contract's first year. The
--                      shared page derives the contract year from it and the
--                      league's own season, instead of trusting a counter that
--                      is only correct if the rollover button was pressed
--                      exactly once per real season. Absent on un-backfilled
--                      records, where the page falls back to the counter
--                      exactly as it does today.
--   contractStatus     'expired' on a contract a season rollover retired.
--                      Those records used to be DELETED at rollover; they are
--                      now preserved, so the page needs to know not to render
--                      one as a live contract. (They also still carry the
--                      legacy `expired` flag, already projected, so a client
--                      that has not been updated degrades to showing them as
--                      expired rather than as live.)
--   expiredAfterSeason which season that contract ran out after.
--
-- Everything else is identical to 009. Still NOT projected, on purpose:
-- owner_id, buy-in, `payouts`, `payoutNote`, payment status, commissioner
-- fields, the share token, keptForComputed, the change log, yahooTeamMap,
-- and standings.sourceName.
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
    'keeperCostModel',    l.data->'keeperCostModel',
    'termModel',          l.data->'termModel',
    'termYears',          l.data->'termYears',
    'mustFillSlots',      l.data->'mustFillSlots',
    'pickRules',          l.data->'pickRules',
    'rookieRules',        l.data->'rookieRules',
    'sharedRulesNote',    l.data->'sharedRulesNote',
    'sharedPayoutsNote',  l.data->'sharedPayoutsNote',
    'minKeepers',         l.data->'minKeepers',
    'contractsRequired',  l.data->'contractsRequired',
    -- Only when the league HAS one. jsonb_build_object over a missing block
    -- used to emit {costIncreasePerYear: null, undraftedStartCost: null} —
    -- a truthy object the read-side shim took as "this is an auction league"
    -- on every pre-wizard slot league (Disney on Ice read as Auction with
    -- every row at the $5 undrafted floor, while Settings said Slot only).
    'auctionRules', case when l.data ? 'auctionRules' then jsonb_build_object(
      'costIncreasePerYear', l.data->'auctionRules'->'costIncreasePerYear',
      'undraftedStartCost',  l.data->'auctionRules'->'undraftedStartCost'
    ) end,
    'statCategories',    l.data->'statCategories',
    -- ── Draft order inputs (008) ──
    'draftOrderConfig',   l.data->'draftOrderConfig',
    'bottomLotteryTeams', l.data->'bottomLotteryTeams',
    'lotteryDraw',        l.data->'lotteryDraw',
    'lotteryResults',     l.data->'lotteryResults',
    'draftPicks', case when l.data ? 'draftPicks' then jsonb_build_object(
      'rounds',    l.data->'draftPicks'->'rounds',
      'ownership', coalesce(l.data->'draftPicks'->'ownership', '{}'::jsonb)
    ) end,
    'standings', case when l.data ? 'standings' then jsonb_build_object(
      'season',     l.data->'standings'->'season',
      'importedAt', l.data->'standings'->'importedAt',
      'tieResolutions', coalesce(l.data->'standings'->'tieResolutions', '{}'::jsonb),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'teamId',   s.value->>'teamId',
          'rank',     s.value->'rank',
          'wins',     s.value->'wins',
          'losses',   s.value->'losses',
          'ties',     s.value->'ties',
          'pct',      s.value->'pct',
          'pts',      s.value->'pts',
          'clinched', s.value->'clinched'
        ) order by s.ordinality)
        from jsonb_array_elements(coalesce(l.data->'standings'->'rows', '[]'::jsonb))
          with ordinality as s
      ), '[]'::jsonb)
    ) end,
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
            'keptForOverridden', k.value->'keptForOverridden',
            'tradedTo',          k.value->'tradedTo',
            'startSeason',        k.value->>'startSeason',
            'contractStatus',     k.value->>'contractStatus',
            'expiredAfterSeason', k.value->>'expiredAfterSeason'
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
            'acquisitionRound', pk.value->'acquisitionRound',
            'expired',          pk.value->'expired',
            'startSeason',        pk.value->>'startSeason',
            'contractStatus',     pk.value->>'contractStatus',
            'expiredAfterSeason', pk.value->>'expiredAfterSeason'
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
