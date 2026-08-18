import React from 'react';
import { Users, Loader } from 'lucide-react';
import { makeTheme, tokens, Button } from '../components.jsx';
import { supabase } from '../lib/supabase.js';
import { pct } from '../lib/nflDirectory.js';
import { fetchDirectoryStatus, refreshNflDirectory, directoryConfigured } from '../lib/nflDirectoryStore.js';

// The NFL player directory's one control surface: how many players are stored,
// when it was last refreshed, and the button that refreshes it. Lives on the
// Import page (football leagues only) because that is where a stale directory
// actually bites — the roster paste resolves names against it.
//
// Refresh is MANUAL by design: no cron, no build-time fetch. The commissioner
// refreshes before the draft and again mid-season, which is also what
// Sleeper's docs ask for (store it yourself, fetch at most once a day).

// A directory older than this reads as stale — long enough that a pre-draft
// refresh isn't nagged about a week later, short enough to catch a directory
// left over from last season.
const STALE_DAYS = 21;

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const days = daysSince(iso);
  const stamp = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  return `${stamp} · ${days} days ago`;
}

export function NflDirectoryCard({ isDark, accentColor }) {
  const t = makeTheme(isDark);
  const [status, setStatus] = React.useState(null);   // {count, lastRefresh}
  const [loading, setLoading] = React.useState(true);
  const [signedIn, setSignedIn] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(null); // {phase, done, total}
  const [error, setError] = React.useState(null);

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
    setProgress({ phase: 'fetching', done: 0, total: 0 });
    try {
      await refreshNflDirectory({ onProgress: setProgress });
      load();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const last = status?.lastRefresh;
  const count = status?.count || 0;
  const stale = !last || (daysSince(last.refreshed_at) ?? 999) > STALE_DAYS;
  const configured = directoryConfigured();

  const statusLine = () => {
    if (loading) return 'Checking…';
    if (!configured) return 'Not available in this build (no database configured).';
    if (count === 0) return 'Empty — no players loaded yet. Refresh before importing rosters.';
    const when = formatWhen(last?.refreshed_at);
    return `${count.toLocaleString()} players${when ? ` · refreshed ${when}` : ' · refresh time unknown'}`;
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
          Pasted names are resolved against this directory (from Sleeper) so every imported row stores a
          real player ID, not just a name.
        </div>
        <div style={{
          fontSize: '12px', marginTop: 6, fontWeight: 600,
          color: loading ? t.textMuted : (stale || count === 0 ? tokens.warning : t.textSecondary),
        }}>
          {statusLine()}
        </div>
        {/* Cross-platform id coverage from the last run. Unused by the app
            today — it's the number that says how much of a future Yahoo
            reconciliation is a straight join. */}
        {last && last.active_count > 0 && (
          <div style={{ fontSize: '11px', color: t.textMuted, marginTop: 4 }}>
            Cross-platform IDs on active players: Yahoo {pct(last.yahoo_id_count, last.active_count)}%
            {' · '}ESPN {pct(last.espn_id_count, last.active_count)}%
            {' · '}{last.active_count.toLocaleString()} active of {(last.payload_count || 0).toLocaleString()} stored
          </div>
        )}
        {last?.status === 'error' && (
          <div style={{ fontSize: '11px', color: tokens.danger, marginTop: 4 }}>
            Last refresh didn't finish: {last.error || 'unknown error'}
          </div>
        )}
        {running && (
          <div style={{ fontSize: '11px', color: t.textSecondary, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader size={12} strokeWidth={2} className="kh-spin" />
            {progress?.phase === 'fetching'
              ? 'Downloading from Sleeper…'
              : `Saving ${(progress?.done || 0).toLocaleString()} of ${(progress?.total || 0).toLocaleString()} players…`}
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
            Sign in to refresh the directory. Reading it works signed out.
          </div>
        )}
      </div>
      <Button variant={count === 0 ? 'primary' : 'secondary'} size="sm" accent={accentColor} isDark={isDark}
        disabled={running || !configured || !signedIn}
        onClick={doRefresh} style={{ flexShrink: 0 }}>
        {running ? 'Refreshing…' : (count === 0 ? 'Load directory' : 'Refresh from Sleeper')}
      </Button>
    </div>
  );
}
