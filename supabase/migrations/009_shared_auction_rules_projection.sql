-- Shared page: never manufacture an auctionRules block.
-- Run in the Supabase SQL Editor (project keeperhq) after 008_shared_draft_order.sql.
--
-- No table changes. This ONLY replaces get_shared_league, the explicit
-- field-list projection every member-facing read goes through.
--
-- The one change: `auctionRules` is projected only when the league's data
-- carries one. The previous projections built the object unconditionally, so
-- a league with no block came through as {costIncreasePerYear: null,
-- undraftedStartCost: null} — an object, therefore truthy, therefore read by
-- keeperCostModelOf's legacy fallback as an auction league. A pre-wizard
-- slot league (no explicit keeperCostModel key) rendered on the shared page
-- as "Auction" with every row at "Keep for $5" while the commissioner's
-- Settings, reading the raw blob, correctly said "Slot only". The client-side
-- shim now ignores an all-null block too (src/lib/keeperRules.js), so the
-- page is right even before this runs; this makes the projection honest.
--
-- Everything else is identical to 008. Still NOT projected, on purpose:
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
