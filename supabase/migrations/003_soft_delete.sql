-- Soft delete + deadline time for the shared league page.
-- Run in the Supabase SQL Editor (project keeperhq), top to bottom. Assumes
-- 002_share_token.sql has already been run (this file REPLACES the
-- get_shared_league function it created).
--
-- What changes:
--   * public.leagues grows a nullable deleted_at timestamptz column. Set =
--     the league is soft-deleted: hidden from My Leagues in the app and,
--     via the function change below, invisible to shared-page visitors (a
--     member link to a deleted league renders the invalid-link state).
--     Cleared = fully restored. RLS is UNCHANGED — rows stay readable and
--     writable only by their owner (auth.uid() = owner_id), and the
--     soft-delete/restore updates ride the same owner-only policy.
--   * get_shared_league(p_token) is recreated with the same signature and
--     security model (SECURITY DEFINER, empty search_path, EXECUTE for
--     anon + authenticated only — grants survive CREATE OR REPLACE):
--       - excludes soft-deleted leagues (deleted_at is null)
--       - projects the new keeperDeadlineTime field ('HH:MM'), so the
--         shared page's countdown can show the commissioner-set time of
--         day instead of assuming 11:59 PM. Date-only deadlines are still
--         read as 11:59 PM by the client.

-- 1) Soft-delete column. A real column, not part of the data blob, so app
--    saves (which write the blob) can never accidentally flip it.
alter table public.leagues
  add column if not exists deleted_at timestamptz;

-- 2) Public read function: token -> projected league jsonb (NULL on no match
--    OR when the league is soft-deleted).
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
