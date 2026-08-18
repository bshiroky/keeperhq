import React from 'react';
import { Users, Loader } from 'lucide-react';
import { makeTheme, tokens, Button } from '../components.jsx';
import { supabase } from '../lib/supabase.js';
import { pct, refreshRunState } from '../lib/nflDirectory.js';
import { fetchDirectoryStatus, refreshNflDirectory, directoryConfigured } from '../lib/nflDirectoryStore.js';

// The NFL player directory's status + override control, on the Import page for
// football leagues (where a stale directory actually bites — the roster paste
// resolves names against it).
//
// The directory refreshes itself daily via a Vercel cron; this card exists to
// (a) say when it last ran and whether that run was scheduled or manual,
// (b) surface a scheduled run that failed or never finished — a silently
// broken cron is worse than no cron — and (c) force a run now, which is the
// case that matters before a draft.

// Past this, the directory reads as stale. With a daily schedule running, this
// should never trigger — if it does, the schedule is broken, which is the
// point.
const STALE_DAYS = 3;

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const days = daysSince(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  const stamp = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${stamp} · ${days} days ago`;
}

export function NflDirectoryCard({ isDark, accentColor }) {
  const t = makeTheme(isDark);
  const [status, setStatus] = React.useState(null);   // see fetchDirectoryStatus
  const [loading, setLoading] = React.useState(true);
  const [signedIn, setSignedIn] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null);

  const load = React.useCallback(() => {
    if (!directoryConfigured()) { setLoading(false); return; }
    setLoading(true);
    fetchDirectoryStatus()
      .then(s => { setStatus(s); setError(null); })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
    supabase?.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, [load]);

  async function doRefresh() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress({ phase: 'server', done: 0, total: 0 });
    try {
      const out = await refreshNflDirectory({ onProgress: setProgress });
      setResult(out);
      load();
    } catch (e) {
      setError(String(e?.message || e));
      load(); // a partial run still moved the numbers — show where it got to
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const configured = directoryConfigured();
  const count = status?.count || 0;
  const lastOk = status?.lastOk || null;        // newest run that finished cleanly
  const lastRun = status?.lastRun || null;      // newest run of any kind
  // When the directory was last WRITTEN, straight from the player rows. This
  // is the honest answer even when a run failed to log itself.
  const lastWriteAt = status?.lastWriteAt || null;
  const fill = status?.fill || null;
  const stale = !lastWriteAt || (daysSince(lastWriteAt) ?? 999) > STALE_DAYS;

  // Banner rules live in refreshRunState (pure, unit-tested): a failure must
  // not outlive the failure, and players-with-no-log-row must read honestly.
  const { failed: runFailed, stalled: runStalled, unlogged: unloggedWrite } =
    refreshRunState({ count, lastWriteAt, lastRun, lastOk });

  const statusLine = () => {
    if (loading) return 'Checking…';
    if (!configured) return 'Not available in this build (no database configured).';
    if (count === 0) return 'Empty — no players loaded yet. Refresh before importing rosters.';
    const when = formatWhen(lastWriteAt);
    // Provenance only when a completed run actually accounts for this write.
    const matchesRun = lastOk && lastWriteAt
      && Math.abs(new Date(lastWriteAt) - new Date(lastOk.refreshed_at)) < 6 * 3600 * 1000;
    const how = matchesRun && (lastOk.trigger === 'scheduled' || lastOk.trigger === 'manual')
      ? ` (${lastOk.trigger})` : '';
    return `${count.toLocaleString()} players${when ? ` · last written ${when}${how}` : ''}`;
  };

  const progressLine = () => {
    if (!progress) return 'Starting…';
    if (progress.phase === 'server') return 'Refreshing on the server…';
    if (progress.phase === 'fetching') return 'Downloading from Sleeper…';
    const done = progress.done || 0;
    const total = progress.total || 0;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const retries = progress.retries ? ` · ${progress.retries} retried` : '';
    return `Saving ${done.toLocaleString()} of ${total.toLocaleString()} players (${percent}%)${retries}`;
  };

  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10,
      boxShadow: t.cardShadow, padding: '14px 20px',
      display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
    }}>
      <Users size={18} strokeWidth={1.5} color={t.textSecondary} style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: t.textPrimary }}>NFL player directory</div>
        <div style={{ fontSize: '12px', color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
          Refreshes automatically every day. Pasted names resolve against it, so every imported row stores a
          real player ID, not just a name.
        </div>
        <div style={{
          fontSize: '12px', marginTop: 6, fontWeight: 600,
          color: loading ? t.textMuted : (stale || count === 0 ? tokens.warning : t.textSecondary),
        }}>
          {statusLine()}
        </div>

        {/* A broken schedule has to be loud: the stored player count can look
            perfectly healthy while nothing has updated for days. */}
        {(runFailed || runStalled) && (
          <div style={{
            fontSize: '11px', marginTop: 6, lineHeight: 1.45, color: tokens.warning,
            background: tokens.warningBg, border: `1px solid ${tokens.warningBorder}`,
            borderRadius: tokens.radiusSm, padding: '6px 8px',
          }}>
            <strong>
              {lastRun.trigger === 'scheduled' ? 'The scheduled refresh' : 'The most recent refresh'}
              {runStalled ? ' never finished' : ' failed'}
            </strong>
            {formatWhen(lastRun.refreshed_at) ? ` (${formatWhen(lastRun.refreshed_at)})` : ''}
            {lastRun.error ? `: ${lastRun.error}` : '.'}
            {lastRun.upserted_count
              ? ` ${lastRun.upserted_count.toLocaleString()} players were written before it stopped — re-running is safe and picks up from there.`
              : ' Re-running is safe.'}
          </div>
        )}

        {/* No completed run on record, but the players are here. Say so —
            "unknown" next to a healthy count reads as a broken directory. */}
        {unloggedWrite && !loading && (
          <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>
            The player data is here, but no completed refresh is recorded in the log — the run that wrote it
            didn't save a record. The counts above come from the directory itself; the next refresh will log
            properly.
          </div>
        )}

        {/* Cross-platform ID coverage, counted from the directory rather than
            read out of a run record — so it's right even when a run failed to
            log. Unused by the app today: it's the number that says how much of
            a future Yahoo reconciliation is a straight join. */}
        {fill && fill.active > 0 && (
          <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 4 }}>
            Cross-platform IDs on active players: Yahoo {pct(fill.yahoo, fill.active)}%
            {' · '}ESPN {pct(fill.espn, fill.active)}%
            {' · '}{fill.active.toLocaleString()} active of {count.toLocaleString()} stored
          </div>
        )}

        {running && (
          <div style={{ fontSize: '11px', color: t.textSecondary, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader size={12} strokeWidth={2} className="kh-spin" />
            {progressLine()}
          </div>
        )}
        {result && !running && (
          <div style={{ fontSize: '11px', color: tokens.success, marginTop: 6, lineHeight: 1.45 }}>
            Refreshed {(result.upserted || 0).toLocaleString()} players
            {result.ranOn === 'browser' ? ' (in this browser — the scheduled endpoint isn\'t configured yet)' : ''}.
            {result.notes ? ` ${result.notes}` : ''}
          </div>
        )}
        {error && (
          <div style={{
            fontSize: '11px', color: tokens.danger, marginTop: 6, lineHeight: 1.45,
            background: tokens.dangerBg, border: `1px solid ${tokens.dangerBorder}`,
            borderRadius: tokens.radiusSm, padding: '6px 8px',
          }}>
            {error}
          </div>
        )}
        {configured && !signedIn && (
          <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 6 }}>
            Sign in to refresh manually. Reading the directory works signed out, and the daily
            refresh runs on its own.
          </div>
        )}
      </div>
      <Button variant={count === 0 ? 'primary' : 'secondary'} size="sm" accent={accentColor} isDark={isDark}
        disabled={running || !configured || !signedIn}
        onClick={doRefresh} style={{ flexShrink: 0 }}>
        {running ? 'Refreshing…' : (count === 0 ? 'Load directory' : 'Refresh now')}
      </Button>
    </div>
  );
}
