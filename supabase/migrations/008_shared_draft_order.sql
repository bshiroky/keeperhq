-- Draft order inputs for the shared page: standings, draft-order settings,
-- the lottery draw, and pick ownership.
-- Run in the Supabase SQL Editor (project keeperhq) after 007_shared_price_provenance.sql.
--
-- No table changes. This ONLY replaces get_shared_league, the explicit
-- field-list projection every member-facing read goes through.
--
-- What's added, and why it's the INPUTS rather than a stored board:
--
--   The draft board (every pick with round, slot, overall number, original
--   owner, current owner) is DERIVED — from the standings, the draft-order
--   settings, the lottery draw and pick ownership — by lib/draftOrder.js,
--   the same pure function the commissioner's pages use. Projecting the
--   inputs and computing the board on the page (sharedDraftBoard in
--   lib/sharedLeague.js) means the member view can never disagree with the
--   commissioner view, the way the rules modal can't drift from the keeper
--   math. A board stored in the blob would be one more thing to keep in
--   sync, and this app has no version history to catch it drifting.
--
--   standings        rows: teamId, rank, W-L-T, pct, pts, clinched (the
--                    pasted Yahoo name is NOT projected — commissioner-side
--                    provenance only) plus tieResolutions, the hand-set
--                    orders for ties, which the sort needs.
--   draftOrderConfig basis / lotteryTeams / tiebreak (+ the legacy
--                    bottomLotteryTeams fallback).
--   lotteryDraw      the lottery-eligible teams in pick order, with when it
--                    was drawn. lotteryResults is the pre-standings page's
--                    slate (team NAMES); projected so a lottery locked on the
--                    old page still reads as the draw.
--   draftPicks       rounds + the sparse ownership map — who holds which
--                    original pick. Already the Picks page's source of truth.
--
-- No member UI reads any of this yet. It's here so the views can be built
-- against a real projection rather than a mock.
--
-- Still NOT projected, on purpose: owner_id, buy-in, `payouts`,
-- `payoutNote`, payment status, commissioner fields, the share token,
-- keptForComputed, the change log, yahooTeamMap, and standings.sourceName.
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
    'auctionRules', jsonb_build_object(
      'costIncreasePerYear', l.data->'auctionRules'->'costIncreasePerYear',
      'undraftedStartCost',  l.data->'auctionRules'->'undraftedStartCost'
    ),
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
