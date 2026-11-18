-- Position eligibility on the shared page.
-- Run in the Supabase SQL Editor (project keeperhq) AFTER
-- 010_season_anchored_contracts.sql.
--
-- No table changes. This ONLY replaces get_shared_league, the explicit
-- field-list projection every member-facing read goes through; a key is
-- invisible to members until it is named here.
--
-- One field is added, on `roster` and `priorKeepers`:
--
--   positions   every position a player is eligible at, as a comma string
--               ("C,LW,RW"), written by the Yahoo import from the newest
--               season Yahoo has opened. `pos` (the primary position) stays.
--               Declared keepers store none; the page looks theirs up by name.
--
-- Without this the shared page keeps showing ONE position per player (the
-- old behaviour): it degrades to less information, never to wrong
-- information. Everything else in the function is unchanged from 010.

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
            'positions',        pk.value->>'positions',
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
            'pos',       r.value->>'pos',
            'positions', r.value->>'positions'
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
