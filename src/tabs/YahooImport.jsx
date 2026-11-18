// Yahoo import — the Import page's card and the modal it opens.
//
// One modal, steps within (connect → pick league → preview → confirm →
// result), per the overlay rules. Connecting is the one step that leaves the
// page: Yahoo's approval screen is a full redirect, and the browser comes back
// to this Import page with ?yahoo=connected, which reopens the modal.
//
// All league writes go through src/lib/yahooImport.js; this file only gathers
// the choices.
import React from 'react';
import { makeTheme, tokens, Button, ConfirmBody } from '../components.jsx';
import { supabase } from '../lib/supabase.js';
import { sortTeamsByName } from '../lib/teamOrder.js';
import { loadPlayers, normalizeName } from '../lib/players.js';
import { PlayerAutocomplete } from '../PlayerAutocomplete.jsx';
import {
  GAME_CODE_FOR_SPORT, sectionsFor, initialTeamMatch, renamesFor, hasPlaceholderTeams, withOverrides, mappingProblems,
  lateAdditions, resolvedPickOwners, yahooImportImpact, applyYahooImport,
  seasonLabel, isSeasonOver, defaultYahooLeague, directoryResolver, directoryMatchSummary, eligibilityNote,
} from '../lib/yahooImport.js';

async function api(path, init = {}) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(path, {
    ...init, credentials: 'same-origin',
    headers: { ...(init.headers || {}), Authorization: `Bearer ${data?.session?.access_token || ''}` },
  });
  const type = r.headers.get('content-type') || '';
  const body = type.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!type.includes('json')) body.error = 'Yahoo import is only available on the live site (keeperhq.app).';
  return { ok: r.ok, status: r.status, body };
}

const fmtDate = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Attribution({ t }) {
  return (
    <div style={{ ...t.typeBodyMeta, color: t.textMuted }}>
      Fantasy data provided by{' '}
      <a href="https://sports.yahoo.com/fantasy/" target="_blank" rel="noreferrer" style={{ color: t.textSecondary }}>Yahoo Fantasy</a>
    </div>
  );
}

// One player the directory couldn't place: search it, or leave it as is.
function UnmatchedPlayer({ name, ambiguous, picked, onPick, league, isDark }) {
  const t = makeTheme(isDark);
  const [value, setValue] = React.useState('');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, flexWrap: 'wrap', padding: `${tokens.space2xs}px 0` }}>
      <div style={{ ...t.typeBody, flex: '1 1 160px', minWidth: 0 }}>
        <span style={{ color: t.textPrimary, fontWeight: 600 }}>{name}</span>
        {ambiguous && <div style={{ ...t.typeBodyMeta, color: t.textMuted }}>More than one NHL player has this name</div>}
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        {picked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, ...t.typeBody }}>
            <span style={{ color: tokens.success, fontWeight: 700 }} aria-hidden="true">✓</span>
            <span style={{ color: t.textPrimary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.name}</span>
            <span style={{ color: t.textMuted }}>{[picked.team, picked.pos].filter(Boolean).join(' · ')}</span>
            <button type="button" onClick={() => { onPick(null); setValue(''); }} aria-label={`Undo the match for ${name}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 16, lineHeight: 1, padding: tokens.space2xs, marginLeft: 'auto' }}>×</button>
          </div>
        ) : (
          <PlayerAutocomplete value={value} sport="hockey" league={league} isDark={isDark}
            placeholder="Search the NHL directory…"
            inputStyle={{ width: '100%', boxSizing: 'border-box', background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusSm, padding: '6px 8px', ...t.typeBody, color: t.textPrimary, fontFamily: 'inherit' }}
            onChange={(v, rec) => { setValue(v); if (rec) onPick(rec); }} />
        )}
      </div>
    </div>
  );
}

export function YahooImportCard({ league, isDark, accentColor, onUpdateLeague }) {
  const t = makeTheme(isDark);
  const [open, setOpen] = React.useState(false);
  const [returned, setReturned] = React.useState(null); // { status: 'connected'|'error', msg }
  const [signedIn, setSignedIn] = React.useState(null);

  React.useEffect(() => {
    if (!supabase) { setSignedIn(false); return; }
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data?.session));
  }, []);

  // Back from Yahoo: read the outcome off the URL once, then clean the URL so
  // a refresh doesn't replay it.
  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get('yahoo');
    if (!status) return;
    setReturned({ status, msg: q.get('msg') || '' });
    if (status === 'connected') setOpen(true);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const src = league.yahooSource;
  return (
    <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: t.cardShadow, padding: '14px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceSm, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ ...t.typeBody, fontWeight: 700, color: t.textPrimary }}>Import from Yahoo</div>
          <div style={{ ...t.typeBodyMeta, color: t.textMuted, marginTop: 2, lineHeight: 1.45 }}>
            Pull last season's rosters, draft, standings and traded picks straight from your Yahoo league. You review everything before it's saved.
            {src && <> Last imported from <strong style={{ color: t.textSecondary }}>{src.name} ({seasonLabel(src.season, GAME_CODE_FOR_SPORT[league.sport])})</strong>.</>}
          </div>
        </div>
        <Button variant="primary" size="sm" isDark={isDark} accent={accentColor} disabled={!signedIn}
          onClick={() => { setReturned(null); setOpen(true); }} style={{ flexShrink: 0 }}>Import from Yahoo</Button>
      </div>
      {signedIn === false && (
        <div style={{ ...t.typeBodyMeta, color: t.textMuted, marginTop: tokens.spaceXs }}>Sign in to use the Yahoo import. Demo leagues can't connect to Yahoo.</div>
      )}
      {returned?.status === 'error' && (
        <div role="alert" style={{ ...t.typeBodyMeta, color: tokens.danger, marginTop: tokens.spaceXs }}>
          Yahoo sign-in didn't finish. {returned.msg}
        </div>
      )}
      <div style={{ marginTop: tokens.spaceXs }}><Attribution t={t} /></div>
      {open && <YahooImportModal league={league} isDark={isDark} accentColor={accentColor} onUpdateLeague={onUpdateLeague} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function YahooImportModal({ league, isDark, accentColor, onUpdateLeague, onClose, initial = null }) {
  const t = makeTheme(isDark);
  // `initial` is a render-test seam: { step, leagues, bundle }.
  const [step, setStep] = React.useState(initial?.step || 'loading'); // loading | connect | leagues | fetching | preview | guard | result
  const [error, setError] = React.useState(null);
  const [leagues, setLeagues] = React.useState(initial?.leagues || []);
  const [leagueKey, setLeagueKey] = React.useState('');
  const [showAllSports, setShowAllSports] = React.useState(false);
  const [bundle, setBundle] = React.useState(initial?.bundle || null);
  const [mapping, setMapping] = React.useState(() => (initial?.bundle ? initialTeamMatch(league, initial.bundle) : {}));
  // Players matched by hand in the preview (normalized Yahoo name → directory record).
  const [overrides, setOverrides] = React.useState({});
  const [pick, setPick] = React.useState({ rosters: true, draft: true, standings: true, picks: true });
  const [rosterSet, setRosterSet] = React.useState('cutoff');
  const [guard, setGuard] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [customDate, setCustomDate] = React.useState('');
  // Hockey only: the NHL directory the imported players are matched against.
  // `initial.directory` is a render-test seam.
  const usesDirectory = league.sport === 'hockey';
  const [directory, setDirectory] = React.useState(() => (initial?.directory ? { status: 'ready', players: initial.directory } : { status: usesDirectory ? 'idle' : 'off', players: [] }));
  React.useEffect(() => {
    if (directory.status !== 'idle' || step !== 'preview') return;
    setDirectory({ status: 'loading', players: [] });
    loadPlayers('nhl')
      .then(d => { const players = d?.players || []; setDirectory({ status: players.length ? 'ready' : 'empty', players }); })
      .catch(() => setDirectory({ status: 'error', players: [] }));
  }, [directory.status, step]);
  const resolve = React.useMemo(() => directoryResolver(directory.players), [directory.players]);
  const resolveFinal = React.useMemo(() => withOverrides(resolve, overrides), [resolve, overrides]);

  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const gameCode = GAME_CODE_FOR_SPORT[league.sport];
  const loadLeagues = React.useCallback(async () => {
    setStep('loading'); setError(null);
    const r = await api('/api/yahoo/data?resource=leagues');
    if (r.status === 401 && r.body.needsConnect) { setStep('connect'); return; }
    if (!r.ok) { setError(r.body.error || 'Could not load your Yahoo leagues.'); setStep('connect'); return; }
    const list = r.body.leagues || [];
    setLeagues(list);
    const sameSport = list.filter(l => l.gameCode === gameCode);
    const pool = sameSport.length ? sameSport : list;
    // Default to the season most likely wanted: the last one imported from,
    // else the most recent FINISHED league of this sport.
    const preferred = defaultYahooLeague(pool, league.yahooSource?.leagueKey);
    setLeagueKey(preferred?.leagueKey || '');
    if (list.length === 0) setError('Yahoo returned no leagues for this account.');
    setStep('leagues');
  }, [gameCode, league.yahooSource?.leagueKey]);

  // Once, on open. loadLeagues changes identity when the import itself updates
  // the league (yahooSource), and re-running it then would replace the result
  // step with the league picker.
  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (initial || loaded.current) return;
    loaded.current = true;
    loadLeagues();
  }, [initial, loadLeagues]);

  async function connect() {
    setBusy(true); setError(null);
    const r = await api('/api/yahoo/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnTo: window.location.pathname }) });
    if (!r.ok || !r.body.authorizeUrl) { setError(r.body.error || 'Could not start the Yahoo sign-in.'); setBusy(false); return; }
    window.location.assign(r.body.authorizeUrl);
  }

  // `key` lets the preview switch season; `date` re-reads rosters as of a day
  // the commissioner typed.
  async function fetchBundle({ key = leagueKey, date = '' } = {}) {
    setStep('fetching'); setError(null);
    if (key !== leagueKey) setLeagueKey(key);
    const r = await api(`/api/yahoo/data?resource=import&league_key=${encodeURIComponent(key)}${date ? `&date=${date}` : ''}`);
    if (r.status === 401 && r.body.needsConnect) { setStep('connect'); return; }
    if (!r.ok) { setError(r.body.error || 'Could not read that league from Yahoo.'); setStep('leagues'); return; }
    // Re-reading the same league (a new roster date) keeps the team matching.
    const same = bundle?.league?.leagueKey === r.body.league?.leagueKey;
    setBundle(r.body);
    if (!same) { setMapping(initialTeamMatch(league, r.body)); setOverrides({}); }
    setRosterSet(r.body.rosters?.cutoff ? 'cutoff' : 'final');
    setStep('preview');
  }

  const available = bundle ? sectionsFor(league, bundle) : {};
  const chosen = {
    rosters: !!available.rosters && pick.rosters, draft: !!available.draft && pick.draft,
    standings: !!available.standings && pick.standings, picks: !!available.picks && pick.picks, rosterSet, resolve: resolveFinal,
  };
  const placeholder = hasPlaceholderTeams(league);
  const renames = bundle ? renamesFor(league, bundle, mapping) : {};
  const wantsPlayers = chosen.rosters || chosen.draft;
  // Counts include hand matches; the "not found" list is from the directory
  // alone, so a player matched by hand stays listed with his pick.
  const matchInfo = bundle && resolveFinal && wantsPlayers ? directoryMatchSummary(bundle, resolveFinal, chosen) : null;
  const baseInfo = bundle && resolve && wantsPlayers ? directoryMatchSummary(bundle, resolve, chosen) : null;
  const problems = bundle ? mappingProblems(league, bundle, mapping) : { unmapped: [], duplicates: [], mappedCount: 0 };
  const anySection = chosen.rosters || chosen.draft || chosen.standings || chosen.picks;
  const canImport = bundle && anySection && problems.duplicates.length === 0 && problems.mappedCount > 0
    && !(usesDirectory && (directory.status === 'idle' || directory.status === 'loading'));

  function setTeam(teamKey, teamId) {
    // Picking a team already mapped elsewhere STEALS it, so the other row
    // visibly reverts instead of two Yahoo teams landing on one.
    setMapping(m => {
      const next = { ...m };
      if (teamId) for (const k of Object.keys(next)) if (next[k] === teamId) next[k] = null;
      next[teamKey] = teamId || null;
      return next;
    });
  }

  function startImport() {
    const impact = yahooImportImpact(league, bundle, mapping, chosen);
    if (impact.hasImpact) { setGuard(impact); setStep('guard'); return; }
    doImport();
  }
  function doImport() {
    const out = applyYahooImport(league, bundle, mapping, { ...chosen, renames });
    onUpdateLeague(out.league);
    setResult(out.summary);
    setStep('result');
  }

  const label = { ...t.typeLabelEyebrow, color: t.textMuted, margin: `${tokens.spaceMd}px 0 ${tokens.spaceXs}px` };
  const body = { ...t.typeBody, color: t.textBody, lineHeight: 1.5 };
  const field = {
    ...t.typeBody, color: t.textPrimary, background: t.cardBg2, border: `1px solid ${t.border}`,
    borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`, maxWidth: '100%', minHeight: 36,
  };
  const check = { display: 'flex', alignItems: 'flex-start', gap: tokens.spaceXs, padding: `${tokens.space2xs}px 0`, ...body };
  const teams = sortTeamsByName(league.teams || []);
  const late = bundle ? lateAdditions(bundle) : {};
  const lateCount = Object.values(late).reduce((n, l) => n + l.length, 0);
  const visibleLeagues = showAllSports || !leagues.some(l => l.gameCode === gameCode) ? leagues : leagues.filter(l => l.gameCode === gameCode);
  const rosterCount = set => Object.values(bundle?.rosters?.[set] || {}).reduce((n, l) => n + l.length, 0);

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: t.scrim, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: tokens.spaceMd }}>
      <div role="dialog" aria-modal="true" aria-label="Import from Yahoo" style={{
        background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', padding: tokens.spaceXl, boxSizing: 'border-box',
      }}>
        {step === 'guard' ? (
          <ConfirmBody isDark={isDark} accentColor={accentColor} danger
            title="Replace what's on file?"
            intro="This import overwrites data already in this league. There's no undo."
            lines={guard.lines} confirmLabel="Import and replace" cancelLabel="← Back"
            onConfirm={doImport} onCancel={() => setStep('preview')} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: tokens.spaceSm }}>
              <h3 style={{ margin: 0, ...t.typeHeadingCard, color: t.textPrimary }}>Import from Yahoo</h3>
              <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, fontSize: 20, lineHeight: 1, padding: tokens.space2xs }}>×</button>
            </div>
            {error && <p role="alert" style={{ ...body, color: tokens.danger, margin: `${tokens.spaceSm}px 0 0` }}>{error}</p>}

            {(step === 'loading' || step === 'fetching') && (
              <p style={{ ...body, margin: `${tokens.spaceMd}px 0` }}>{step === 'loading' ? 'Checking your Yahoo connection…' : 'Reading the league from Yahoo… this takes a few seconds.'}</p>
            )}

            {step === 'connect' && (
              <>
                <p style={{ ...body, margin: `${tokens.spaceMd}px 0` }}>
                  Connect your Yahoo account to read your leagues. You'll approve read-only access on Yahoo and come straight back here.
                  The connection lasts up to an hour in this browser and isn't saved anywhere else.
                </p>
                <Button variant="primary" isDark={isDark} accent={accentColor} disabled={busy} onClick={connect}>{busy ? 'Opening Yahoo…' : 'Connect Yahoo'}</Button>
              </>
            )}

            {step === 'leagues' && leagues.length > 0 && (
              <>
                <p style={{ ...body, margin: `${tokens.spaceMd}px 0 ${tokens.spaceSm}px` }}>
                  Pick the Yahoo league to import from. Choose <strong>last season's</strong> league: its final rosters, its draft and its standings are what set up this season's keepers.
                </p>
                <select aria-label="Yahoo league" value={leagueKey} onChange={e => setLeagueKey(e.target.value)} style={{ ...field, width: '100%' }}>
                  {visibleLeagues.map(l => (
                    <option key={l.leagueKey} value={l.leagueKey}>
                      {seasonLabel(l.season, l.gameCode)} · {l.name}{l.numTeams ? ` · ${l.numTeams} teams` : ''}{isSeasonOver(l) ? ' · finished' : ' · current season'}{visibleLeagues.some(x => x.gameCode !== l.gameCode) ? ` · ${l.gameCode}` : ''}
                    </option>
                  ))}
                </select>
                {leagues.some(l => l.gameCode !== gameCode) && leagues.some(l => l.gameCode === gameCode) && (
                  <label style={{ ...check, ...t.typeBodyMeta, color: t.textMuted }}>
                    <input type="checkbox" checked={showAllSports} onChange={e => setShowAllSports(e.target.checked)} /> Show leagues from other sports
                  </label>
                )}
                <div style={{ display: 'flex', gap: tokens.spaceXs, marginTop: tokens.spaceMd }}>
                  <Button variant="primary" isDark={isDark} accent={accentColor} disabled={!leagueKey} onClick={fetchBundle}>Continue</Button>
                  <Button variant="secondary" isDark={isDark} onClick={onClose}>Cancel</Button>
                </div>
              </>
            )}

            {step === 'preview' && bundle && (
              <>
                <p style={{ ...body, margin: `${tokens.spaceSm}px 0 0` }}>
                  <strong style={{ color: t.textPrimary }}>{bundle.league.name}</strong> · {seasonLabel(bundle.league.season, bundle.league.gameCode)} season · {bundle.teams.length} teams
                  {isSeasonOver(bundle.league) ? ' · finished' : ' · still in progress'}
                </p>
                {!isSeasonOver(bundle.league) && (
                  <div style={{ ...t.typeBodyMeta, color: t.textBody, background: t.warningBg, border: `1px solid ${t.warningBorder}`, borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`, marginTop: tokens.spaceXs, display: 'flex', gap: tokens.spaceXs, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: '1 1 260px' }}>This is the season being played now. Keepers are normally set from the season before it: that season's final rosters, draft and standings.</span>
                    {bundle.league.previousLeagueKey && (
                      <Button variant="secondary" size="sm" isDark={isDark} onClick={() => fetchBundle({ key: bundle.league.previousLeagueKey })}>Use last season instead</Button>
                    )}
                  </div>
                )}
                {bundle.problems?.length > 0 && (
                  <p style={{ ...t.typeBodyMeta, color: tokens.warning, margin: `${tokens.spaceXs}px 0 0` }}>Yahoo didn't return everything: {bundle.problems.join(' · ')}</p>
                )}

                <div style={label}>Teams</div>
                <div style={{ ...t.typeBodyMeta, color: t.textMuted, marginBottom: tokens.spaceXs, lineHeight: 1.5 }}>
                  {placeholder
                    ? "Your teams still have their default names, so each Yahoo team is paired with one in order and renamed after its manager. Change any row if it's wrong."
                    : 'Each Yahoo team is paired with the KeeperHQ team it belongs to. Change any row if it\'s wrong.'}
                </div>
                <div style={{ display: 'grid', gap: tokens.space2xs }}>
                  {bundle.teams.map(yt => {
                    const id = mapping[yt.teamKey] || '';
                    const takenBy = new Set(Object.entries(mapping).filter(([k, v]) => v && k !== yt.teamKey).map(([, v]) => v));
                    return (
                      <div key={yt.teamKey} style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, flexWrap: 'wrap' }}>
                        <div style={{ ...body, flex: '1 1 220px', minWidth: 0 }}>
                          <span style={{ color: t.textPrimary, fontWeight: 600 }}>{yt.name}</span>
                          {yt.managers?.[0] && <span style={{ color: t.textMuted }}> · {yt.managers.join(', ')}</span>}
                        </div>
                        <select aria-label={`KeeperHQ team for ${yt.name}`} value={id} onChange={e => setTeam(yt.teamKey, e.target.value)}
                          style={{ ...field, flex: '0 0 220px', width: 220, boxSizing: 'border-box', borderColor: id ? t.border : tokens.danger }}>
                          <option value="">Not imported</option>
                          {teams.map(tm => <option key={tm.id} value={tm.id}>{renames[tm.id] && renames[tm.id] !== tm.name ? `${tm.name} → ${renames[tm.id]}` : tm.name}{takenBy.has(tm.id) ? ' ✓ (mapped)' : ''}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...t.typeBodyMeta, color: problems.duplicates.length ? tokens.danger : t.textMuted, marginTop: tokens.spaceXs }}>
                  {problems.mappedCount} of {bundle.teams.length} Yahoo teams matched
                  {problems.unmapped.length > 0 && ` · ${plural(problems.unmapped.length, 'team')} will be skipped`}
                  {problems.duplicates.length > 0 && ` · ${problems.duplicates.join(', ')} matched more than once`}
                </div>

                <div style={label}>What to import</div>
                {available.rosters && (
                  <div>
                    <label style={check}>
                      <input type="checkbox" checked={pick.rosters} onChange={e => setPick(p => ({ ...p, rosters: e.target.checked }))} />
                      <span><strong style={{ color: t.textPrimary }}>Rosters</strong> · who each team can keep</span>
                    </label>
                    {pick.rosters && (
                      <div style={{ paddingLeft: tokens.spaceXl }}>
                        {bundle.rosters.cutoff ? (
                          <>
                            <label style={check}>
                              <input type="radio" name="khq-yahoo-roster-set" checked={rosterSet === 'cutoff'} onChange={() => setRosterSet('cutoff')} />
                              <span>{bundle.rosters.cutoffIsCustom ? `As of ${fmtDate(bundle.rosters.cutoffDate)}` : `As of the end of the regular season (${fmtDate(bundle.rosters.cutoffDate)})`} · {plural(rosterCount('cutoff'), 'player')}{lateCount ? ` · leaves out ${plural(lateCount, 'playoff pickup')}` : ''}</span>
                            </label>
                            <label style={check}>
                              <input type="radio" name="khq-yahoo-roster-set" checked={rosterSet === 'final'} onChange={() => setRosterSet('final')} />
                              <span>{isSeasonOver(bundle.league) ? 'As of the end of the season' : 'As they stand today'} · {plural(rosterCount('final'), 'player')}</span>
                            </label>
                          </>
                        ) : (
                          <div style={{ ...t.typeBodyMeta, color: t.textMuted }}>
                            {bundle.rosters.cutoffInFuture
                              ? `This season's regular season hasn't ended yet, so today's rosters are used (${plural(rosterCount('final'), 'player')}).`
                              : `Rosters as they stand now (${plural(rosterCount('final'), 'player')}).`}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spaceXs, flexWrap: 'wrap', marginTop: tokens.space2xs, ...t.typeBodyMeta, color: t.textMuted }}>
                          <label htmlFor="khq-yahoo-roster-date">Or rosters as of another date</label>
                          <input id="khq-yahoo-roster-date" type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} style={field} />
                          <Button variant="secondary" size="sm" isDark={isDark} disabled={!customDate} onClick={() => fetchBundle({ key: bundle.league.leagueKey, date: customDate })}>Load</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {available.draft && (
                  <label style={check}>
                    <input type="checkbox" checked={pick.draft} onChange={e => setPick(p => ({ ...p, draft: e.target.checked }))} />
                    <span><strong style={{ color: t.textPrimary }}>Last draft</strong> · {plural(bundle.draft.length, 'pick')} with {bundle.league.isAuction ? 'the price paid' : 'the round'} · what each player costs to keep</span>
                  </label>
                )}
                {available.standings && (
                  <label style={check}>
                    <input type="checkbox" checked={pick.standings} onChange={e => setPick(p => ({ ...p, standings: e.target.checked }))} />
                    <span><strong style={{ color: t.textPrimary }}>Standings</strong> · {plural(bundle.standings.length, 'team')} · sets the draft order</span>
                  </label>
                )}
                {available.picks && (
                  <label style={check}>
                    <input type="checkbox" checked={pick.picks} onChange={e => setPick(p => ({ ...p, picks: e.target.checked }))} />
                    <span><strong style={{ color: t.textPrimary }}>Traded picks</strong> · {plural(resolvedPickOwners(bundle, mapping).filter(p => p.originalTeamId !== p.ownerTeamId).length, 'pick')} changed hands in trades during the {seasonLabel(bundle.league.season, bundle.league.gameCode)} season</span>
                  </label>
                )}
                {(chosen.rosters || chosen.draft) && (() => {
                  const e = eligibilityNote(bundle);
                  return (
                    <div style={{ ...t.typeBodyMeta, color: t.textBody, marginTop: tokens.spaceSm, lineHeight: 1.5 }}>
                      <strong style={{ color: t.textPrimary }}>Positions:</strong>{' '}
                      {e.newest && !e.sameAsLeague
                        ? `every position each player is eligible at in ${e.season}, the newest season Yahoo has opened.`
                        : `every position each player was eligible at in ${e.season}.`}
                    </div>
                  );
                })()}
                {usesDirectory && (chosen.rosters || chosen.draft) && (
                  <div style={{ ...t.typeBodyMeta, color: t.textBody, marginTop: tokens.spaceSm, lineHeight: 1.5 }}>
                    {(directory.status === 'idle' || directory.status === 'loading') && 'Matching players to the NHL player directory…'}
                    {(directory.status === 'empty' || directory.status === 'error') && (
                      <span style={{ color: tokens.warning }}>The NHL player directory is unavailable right now, so players will import under their Yahoo names, without headshots or stats. You can import again later to match them.</span>
                    )}
                    {matchInfo && (
                      <>
                        <strong style={{ color: t.textPrimary }}>{matchInfo.matched} of {plural(matchInfo.total, 'player')}</strong> matched to the NHL player directory. They're saved as the NHL's player records, with headshots and stats.
                        {matchInfo.byLastName.length > 0 && (
                          <details style={{ marginTop: tokens.space2xs }}>
                            <summary style={{ cursor: 'pointer' }}>{plural(matchInfo.byLastName.length, 'player')} matched by last name and team. Worth a look</summary>
                            <ul style={{ margin: `${tokens.space2xs}px 0 0`, paddingLeft: tokens.spaceLg }}>
                              {matchInfo.byLastName.map(m => <li key={m.yahoo}>{m.yahoo} → {m.nhl} ({m.team})</li>)}
                            </ul>
                          </details>
                        )}
                        {baseInfo && baseInfo.unmatched.length > 0 && (
                          <div style={{ marginTop: tokens.spaceXs, border: `1px solid ${t.warningBorder}`, background: t.warningBg, borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px` }}>
                            <div style={{ color: t.textPrimary, fontWeight: 600, marginBottom: tokens.space2xs }}>
                              {plural(baseInfo.unmatched.length, 'player')} not found in the NHL directory. Pick each one, or leave it to import under the Yahoo name.
                            </div>
                            {baseInfo.unmatched.map(m => (
                              <UnmatchedPlayer key={m.name} name={m.name} ambiguous={m.ambiguous} league={league} isDark={isDark}
                                picked={overrides[normalizeName(m.name)] || null}
                                onPick={rec => setOverrides(o => {
                                  const next = { ...o };
                                  if (rec) next[normalizeName(m.name)] = rec; else delete next[normalizeName(m.name)];
                                  return next;
                                })} />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {!anySection && <div style={{ ...t.typeBodyMeta, color: t.textMuted }}>Nothing selected.</div>}

                <div style={{ display: 'flex', gap: tokens.spaceXs, marginTop: tokens.spaceLg, flexWrap: 'wrap' }}>
                  <Button variant="primary" isDark={isDark} accent={accentColor} disabled={!canImport} onClick={startImport}>Import</Button>
                  <Button variant="secondary" isDark={isDark} onClick={() => setStep('leagues')}>← Back</Button>
                </div>
              </>
            )}

            {step === 'result' && result && (
              <>
                <p style={{ ...body, margin: `${tokens.spaceMd}px 0 ${tokens.spaceXs}px`, color: t.textPrimary, fontWeight: 600 }}>Imported from Yahoo.</p>
                <ul style={{ ...body, margin: 0, paddingLeft: tokens.spaceLg }}>
                  {result.renamed > 0 && <li>{plural(result.renamed, 'team')} renamed</li>}
                  {result.rosters && <li>{plural(result.rosters.players, 'player')} on {plural(result.rosters.teams, 'roster')}{result.rosters.asOf ? ` as of ${fmtDate(result.rosters.asOf)}` : ''}</li>}
                  {result.draft && <li>{plural(result.draft.players, 'drafted player')} across {plural(result.draft.teams, 'team')}{result.draft.priced ? `, ${result.draft.priced} with a price` : ''}</li>}
                  {result.standings && <li>Standings for {plural(result.standings.teams, 'team')}{result.standings.drawCleared ? ' (lottery draw cleared)' : ''}</li>}
                  {result.directory && <li>{result.directory.matched} of {plural(result.directory.total, 'player')} matched to the NHL player directory</li>}
                  {result.picks && <li>{plural(result.picks.traded, 'traded pick')} recorded</li>}
                </ul>
                <div style={{ marginTop: tokens.spaceLg }}><Button variant="primary" isDark={isDark} accent={accentColor} onClick={onClose}>Done</Button></div>
              </>
            )}
            <div style={{ marginTop: tokens.spaceLg }}><Attribution t={t} /></div>
          </>
        )}
      </div>
    </div>
  );
}
