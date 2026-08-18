-- Directory refresh runs: scheduled vs manual, and runs that never finished.
-- Run in the Supabase SQL Editor after 004_nfl_player_directory.sql.
--
-- What changes, and why:
--   * `trigger` — 'scheduled' (the daily Vercel cron) or 'manual' (the button
--     on the Import page). The card shows which one produced the state you're
--     looking at; without it, a dead cron is invisible as long as someone
--     keeps pressing the button.
--   * `finished_at` + status 'running' — a run row is now opened BEFORE the
--     write and patched when it ends, so a run that dies mid-flight (function
--     timeout, killed instance, closed tab) leaves a 'running' row instead of
--     leaving no trace. A silently failing schedule is worse than no
--     schedule; this is what makes it visible.
--   * `notes` — what the write learned about its own failures (e.g. "3
--     chunk(s) only succeeded after being split"), so a recurring cause is
--     diagnosable from the run log rather than from a screenshot.
--   * an UPDATE policy for authenticated, because closing a run row is an
--     update. The scheduled job uses the service_role key, which bypasses RLS.
--
-- public.nfl_players is untouched here: still upsert-only, still no delete
-- policy on it, so nothing in this migration can orphan a stored player_id.

alter table public.nfl_directory_refreshes
  add column if not exists trigger     text not null default 'manual',
  add column if not exists finished_at timestamptz,
  add column if not exists notes       text;

-- Rows written before this migration were all manual browser runs that
-- completed, which is exactly what the defaults describe.
update public.nfl_directory_refreshes
  set finished_at = refreshed_at
  where finished_at is null and status <> 'running';

create index if not exists nfl_directory_refreshes_status_idx
  on public.nfl_directory_refreshes (status, refreshed_at desc);

drop policy if exists nfl_refreshes_update on public.nfl_directory_refreshes;
create policy nfl_refreshes_update on public.nfl_directory_refreshes
  for update to authenticated using (true) with check (true);
