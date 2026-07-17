-- Shared league page: share_token column + public read function.
-- Run in the Supabase SQL Editor (project keeperhq). Steps are ordered;
-- run the whole file top to bottom.
--
-- Security model:
--   * RLS on public.leagues is UNCHANGED — rows stay readable/writable only
--     by their owner (auth.uid() = owner_id). No anon policy is added.
--   * Anonymous visitors read exclusively through get_shared_league(token),
--     a SECURITY DEFINER function that returns a jsonb PROJECTION of one
--     league: name / sport / draft config / teams / contracts. It never
--     returns owner_id, buy-in, payouts, payment status, payout notes,
--     commissioner fields, or the share_token itself.

-- 1) share_token column: URL-safe random string, unique, auto-minted for
--    new rows (inserts never need to name it), backfilled for existing rows.
alter table public.leagues
  add column if not exists share_token text
  default replace(gen_random_uuid()::text, '-', '');

update public.leagues
  set share_token = replace(gen_random_uuid()::text, '-', '')
  where share_token is null;

alter table public.leagues
  alter column share_token set not null;

create unique index if not exists leagues_share_token_key
  on public.leagues (share_token);

-- 2) Public read function: token -> projected league jsonb (NULL on no match).
create or replace function public.get_shared_league(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name',              l.data->>'name',
    'sport',             l.data->>'sport',
    'draftType',         l.data->>'draftType',
    'keeperDeadline',    l.data->'keeperDeadline',
    'contractYears',     l.data->'contractYears',
    'keeperSlots',       l.data->'keeperSlots',
    'minKeepers',        l.data->'minKeepers',
    'contractsRequired', l.data->'contractsRequired',
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
  where l.share_token = p_token;
$$;

-- 3) Lock execution down to the API roles (functions default to PUBLIC).
revoke execute on function public.get_shared_league(text) from public;
grant execute on function public.get_shared_league(text) to anon, authenticated;
