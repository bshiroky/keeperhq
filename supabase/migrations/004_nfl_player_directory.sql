-- NFL player directory (Sleeper) — stored identities for roster/draft imports.
-- Run in the Supabase SQL Editor (project keeperhq), top to bottom. Independent
-- of 002/003 (it touches no existing table).
--
-- Why this exists: imported rows used to store a free-text player name, so
-- "A.J. Brown" and "AJ Brown" were different players and any later
-- reconciliation against another platform (Yahoo) meant fuzzy name matching
-- across hundreds of rows. Resolving to a stable player_id at import time
-- turns that into a join.
--
-- Shape notes:
--   * One row per Sleeper player, keyed by their player_id (TEXT — team
--     defenses have ids like 'CAR', not numbers).
--   * search_key is OUR normalization of the name (lowercase, punctuation and
--     spacing stripped — src/lib/players.js normalizeName) and is what the
--     import matcher joins on, so both sides of every comparison are keyed the
--     same way. Sleeper's own search_full_name is stored alongside it for
--     reference / debugging.
--   * The cross-platform id columns (yahoo_id, espn_id, …) are populated now
--     even though nothing reads them yet — they are the reason for doing this
--     before the Yahoo work, not after.
--   * data holds the FULL unfiltered Sleeper player object, so a field we
--     didn't promote to a column is never lost to a refresh.
--
-- Preserve-don't-delete (same rule as the keeper data):
--   * Refresh is UPSERT-ONLY. There is no delete policy on this table at all,
--     so a stored player_id can never be orphaned by a later fetch — a player
--     who retires and drops out of Sleeper's payload keeps their row (with a
--     stale last_seen_at) and still resolves.
--   * The upsert COALESCEs every column: a refresh that returns null for a
--     field leaves the last known value in place instead of blanking it.

-- 1) The directory itself.
create table if not exists public.nfl_players (
  player_id        text primary key,
  search_key       text,          -- our normalizeName() key — the join column
  search_full_name text,          -- Sleeper's own normalized name
  full_name        text,
  first_name       text,
  last_name        text,
  team             text,
  pos              text,          -- Sleeper's `position` ("position" is a
                                  -- keyword in SQL; the column is `pos`)
  fantasy_positions text[],
  status           text,
  jersey_number    int,
  years_exp        int,
  -- Cross-platform ids. Unused today; the whole point of capturing them now.
  yahoo_id         text,
  espn_id          text,
  sportradar_id    text,
  rotowire_id      text,
  stats_id         text,
  fantasy_data_id  text,
  data             jsonb,         -- full unfiltered Sleeper object
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists nfl_players_search_key_idx on public.nfl_players (search_key);
create index if not exists nfl_players_last_name_idx  on public.nfl_players (lower(last_name));
create index if not exists nfl_players_yahoo_id_idx   on public.nfl_players (yahoo_id) where yahoo_id is not null;

-- 2) Refresh log — one row per completed refresh. Drives the "last refreshed /
--    N players" status line, and records the cross-platform id fill rates that
--    decide how much of the later Yahoo work is a straight join.
create table if not exists public.nfl_directory_refreshes (
  id              bigint generated always as identity primary key,
  refreshed_at    timestamptz not null default now(),
  refreshed_by    uuid default auth.uid(),
  source          text not null default 'sleeper',
  payload_count   int,   -- players in Sleeper's payload
  upserted_count  int,   -- rows written
  active_count    int,   -- status = 'Active'
  yahoo_id_count  int,   -- active players carrying a yahoo_id
  espn_id_count   int,   -- active players carrying an espn_id
  status          text not null default 'ok',
  error           text
);

create index if not exists nfl_directory_refreshes_at_idx
  on public.nfl_directory_refreshes (refreshed_at desc);

-- 3) RLS. This is public reference data, not user data: anyone may read it
--    (so demo / logged-out leagues resolve names too), only a signed-in user
--    may refresh it. NO delete policy is defined on either table — deletes are
--    impossible through the API by construction, which is what enforces
--    "a refresh must never orphan existing data" at the database layer rather
--    than in app code.
alter table public.nfl_players enable row level security;
alter table public.nfl_directory_refreshes enable row level security;

drop policy if exists nfl_players_read on public.nfl_players;
create policy nfl_players_read on public.nfl_players
  for select to anon, authenticated using (true);

drop policy if exists nfl_players_insert on public.nfl_players;
create policy nfl_players_insert on public.nfl_players
  for insert to authenticated with check (true);

drop policy if exists nfl_players_update on public.nfl_players;
create policy nfl_players_update on public.nfl_players
  for update to authenticated using (true) with check (true);

drop policy if exists nfl_refreshes_read on public.nfl_directory_refreshes;
create policy nfl_refreshes_read on public.nfl_directory_refreshes
  for select to anon, authenticated using (true);

drop policy if exists nfl_refreshes_insert on public.nfl_directory_refreshes;
create policy nfl_refreshes_insert on public.nfl_directory_refreshes
  for insert to authenticated with check (true);

-- 4) Chunked upsert. The client fetches Sleeper's payload, maps it to these
--    columns and calls this once per chunk. SECURITY INVOKER on purpose — the
--    caller's RLS still applies, so this is a convenience (and the place the
--    COALESCE preserve rule lives), not a privilege escalation.
create or replace function public.upsert_nfl_players(p_players jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.nfl_players as np (
    player_id, search_key, search_full_name, full_name, first_name, last_name,
    team, pos, fantasy_positions, status, jersey_number, years_exp,
    yahoo_id, espn_id, sportradar_id, rotowire_id, stats_id, fantasy_data_id,
    data, last_seen_at, updated_at
  )
  select
    p->>'player_id',
    nullif(p->>'search_key', ''),
    nullif(p->>'search_full_name', ''),
    nullif(p->>'full_name', ''),
    nullif(p->>'first_name', ''),
    nullif(p->>'last_name', ''),
    nullif(p->>'team', ''),
    nullif(p->>'pos', ''),
    case when jsonb_typeof(p->'fantasy_positions') = 'array'
      then array(select jsonb_array_elements_text(p->'fantasy_positions'))
      else null end,
    nullif(p->>'status', ''),
    nullif(p->>'jersey_number', '')::int,
    nullif(p->>'years_exp', '')::int,
    nullif(p->>'yahoo_id', ''),
    nullif(p->>'espn_id', ''),
    nullif(p->>'sportradar_id', ''),
    nullif(p->>'rotowire_id', ''),
    nullif(p->>'stats_id', ''),
    nullif(p->>'fantasy_data_id', ''),
    p->'data',
    now(),
    now()
  from jsonb_array_elements(p_players) as p
  where coalesce(p->>'player_id', '') <> ''
  on conflict (player_id) do update set
    -- COALESCE everywhere: a null from a later fetch never erases a value we
    -- already have. Real changes (a trade, a position change) still land,
    -- because a real change arrives as a non-null value.
    search_key        = coalesce(excluded.search_key,        np.search_key),
    search_full_name  = coalesce(excluded.search_full_name,  np.search_full_name),
    full_name         = coalesce(excluded.full_name,         np.full_name),
    first_name        = coalesce(excluded.first_name,        np.first_name),
    last_name         = coalesce(excluded.last_name,         np.last_name),
    team              = coalesce(excluded.team,              np.team),
    pos               = coalesce(excluded.pos,               np.pos),
    fantasy_positions = coalesce(excluded.fantasy_positions, np.fantasy_positions),
    status            = coalesce(excluded.status,            np.status),
    jersey_number     = coalesce(excluded.jersey_number,     np.jersey_number),
    years_exp         = coalesce(excluded.years_exp,         np.years_exp),
    yahoo_id          = coalesce(excluded.yahoo_id,          np.yahoo_id),
    espn_id           = coalesce(excluded.espn_id,           np.espn_id),
    sportradar_id     = coalesce(excluded.sportradar_id,     np.sportradar_id),
    rotowire_id       = coalesce(excluded.rotowire_id,       np.rotowire_id),
    stats_id          = coalesce(excluded.stats_id,          np.stats_id),
    fantasy_data_id   = coalesce(excluded.fantasy_data_id,   np.fantasy_data_id),
    data              = coalesce(excluded.data,              np.data),
    last_seen_at      = excluded.last_seen_at,
    updated_at        = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.upsert_nfl_players(jsonb) from public;
grant execute on function public.upsert_nfl_players(jsonb) to authenticated;
