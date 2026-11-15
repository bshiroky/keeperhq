// Yahoo Fantasy API DISCOVERY SPIKE — the page. Throwaway by design; not in
// the nav, reachable only at /yahoo-spike. See server/yahooSpike.js.
//
// Two trips through Yahoo, on purpose: the first lists the account's leagues,
// the second dumps the one picked. Nothing is kept between them — no token
// survives a request — so picking a league means consenting again.
import React from 'react';
import { makeTheme, tokens } from './components.jsx';
import { supabase } from './lib/supabase.js';
import { digestDump } from './lib/yahooSpikeDigest.js';

const RESULT_KEY = 'khq_yahoo_spike_result';   // written by the callback
const START_KEY = 'khq_yahoo_spike_start';     // steps taken before leaving for Yahoo
const modeKey = mode => `khq_yahoo_spike_${mode}`;

async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
const ss = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); return true; } catch { return false; } },
  del: k => { try { sessionStorage.removeItem(k); } catch { /* nothing to clear */ } },
};
const kb = n => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function Card({ t, title, children }) {
  return (
    <section style={{
      background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: tokens.radiusLg,
      boxShadow: t.cardShadow, padding: `${tokens.spaceMd}px ${tokens.spaceLg}px`, marginBottom: tokens.spaceMd,
    }}>
      {title && <h2 style={{ ...t.typeHeadingSection, color: t.textSecondary, margin: `0 0 ${tokens.spaceSm}px` }}>{title}</h2>}
      {children}
    </section>
  );
}

function Btn({ t, primary, ...rest }) {
  return (
    <button type="button" {...rest} style={{
      ...t.typeBody, fontWeight: 600, cursor: rest.disabled ? 'not-allowed' : 'pointer',
      opacity: rest.disabled ? 0.5 : 1, minHeight: 36, padding: `0 ${tokens.spaceMd}px`,
      borderRadius: tokens.radiusMd, border: `1px solid ${primary ? tokens.info : t.border}`,
      background: primary ? tokens.info : t.sectionBg, color: primary ? '#fff' : t.textPrimary,
    }} />
  );
}

function Steps({ t, steps }) {
  if (!steps?.length) return null;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((s, i) => (
        <li key={i} style={{ display: 'flex', gap: tokens.spaceXs, padding: `${tokens.space2xs}px 0`, ...t.typeBody }}>
          <span aria-hidden="true" style={{ color: s.ok ? tokens.success : tokens.danger, fontWeight: 700, flexShrink: 0 }}>{s.ok ? '✓' : '✗'}</span>
          <span style={{ color: t.textBody }}>
            <strong style={{ color: s.ok ? t.textPrimary : tokens.danger }}>{s.step}{s.ok ? '' : ' — failed'}.</strong> {s.detail}
          </span>
        </li>
      ))}
    </ol>
  );
}

function FetchLog({ t, log }) {
  if (!log?.length) return null;
  const failed = log.filter(f => !f.ok);
  const cell = { padding: `${tokens.space2xs}px ${tokens.spaceXs}px`, textAlign: 'left', verticalAlign: 'top' };
  return (
    <details style={{ marginTop: tokens.spaceSm }} open={failed.length > 0}>
      <summary style={{ ...t.typeBody, color: t.textSecondary, cursor: 'pointer' }}>
        Every fetch: {log.length - failed.length} ok, {failed.length} failed or skipped
      </summary>
      <div style={{ overflowX: 'auto', marginTop: tokens.spaceXs }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', ...t.typeBodyMeta, color: t.textBody }}>
          <thead>
            <tr style={{ color: t.textMuted }}>
              <th scope="col" style={cell}>Result</th><th scope="col" style={cell}>What</th>
              <th scope="col" style={cell}>Path</th><th scope="col" style={cell}>Time</th><th scope="col" style={cell}>Size</th>
            </tr>
          </thead>
          <tbody>
            {log.map((f, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${t.dividerFaint}` }}>
                <td style={{ ...cell, color: f.ok ? tokens.success : tokens.danger, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {f.ok ? `OK ${f.status}` : f.skipped ? 'Skipped' : `Failed ${f.status ?? ''}`}
                </td>
                <td style={cell}>{f.label}{f.error && <div style={{ color: tokens.danger }}>{f.error}</div>}</td>
                <td style={{ ...cell, fontFamily: 'monospace', wordBreak: 'break-all' }}>{f.path}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{f.ms != null ? `${f.ms}ms` : '—'}</td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>{f.bytes != null ? kb(f.bytes) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Result({ t, dump, label }) {
  const full = React.useMemo(() => JSON.stringify(dump).length, [dump]);
  const digest = React.useMemo(() => digestDump(dump), [dump]);
  const digestSize = React.useMemo(() => JSON.stringify(digest).length, [digest]);
  const stamp = String(dump.generatedAt || '').replace(/[:.]/g, '-');
  const name = `yahoo-spike-${label}-${stamp}`;
  return (
    <div>
      {dump.startSteps?.length > 0 && <Steps t={t} steps={dump.startSteps} />}
      <Steps t={t} steps={dump.steps} />
      <FetchLog t={t} log={dump.fetchLog} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.spaceXs, alignItems: 'center', marginTop: tokens.spaceSm }}>
        <Btn t={t} primary onClick={() => download(`${name}-digest.json`, digest)}>Download digest JSON ({kb(digestSize)})</Btn>
        <Btn t={t} onClick={() => download(`${name}-full.json`, dump)}>Download full JSON ({kb(full)})</Btn>
      </div>
      <p style={{ ...t.typeBodyMeta, color: t.textMuted, margin: `${tokens.spaceXs}px 0 0` }}>
        Send Claude the <strong>digest</strong>. It keeps every step, every fetch result and two examples of each kind of
        record. Keep the full file in case a specific record is needed later. Leaguemates' email addresses are already removed from both.
      </p>
    </div>
  );
}

export function YahooSpikePage({ isDark, session, authReady }) {
  const t = makeTheme(isDark);
  const [info, setInfo] = React.useState(null);
  const [infoError, setInfoError] = React.useState(null);
  const [leagues, setLeagues] = React.useState(null);   // pass-1 dump
  const [league, setLeague] = React.useState(null);     // pass-2 dump
  const [failed, setFailed] = React.useState(null);     // a run that never got as far as a mode
  const [busy, setBusy] = React.useState(false);
  const [startError, setStartError] = React.useState(null);
  const [leagueKey, setLeagueKey] = React.useState('');
  const [includePrev, setIncludePrev] = React.useState(true);
  const [asOf, setAsOf] = React.useState('');
  const [sendScope, setSendScope] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/yahoo/start')
      .then(async r => {
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !type.includes('json')) throw new Error(`The start endpoint answered HTTP ${r.status} (${type || 'no content type'}). It only exists on a Vercel deployment.`);
        setInfo(await r.json());
      })
      .catch(e => setInfoError(String(e?.message || e)));
  }, []);

  // Pick up a result the callback just handed over, then load what this tab
  // holds. Results stay COMPRESSED in sessionStorage (a full league dump can
  // pass the ~5MB quota uncompressed), and a result that can't be stored is
  // still shown from memory rather than lost.
  React.useEffect(() => {
    (async () => {
      const read = async k => {
        const b64 = ss.get(modeKey(k));
        if (!b64) return null;
        try {
          const dump = await inflate(b64);
          return { ...dump, startSteps: JSON.parse(ss.get(`${modeKey(k)}_start`) || '[]') };
        } catch { return null; }
      };
      const held = { leagues: await read('leagues'), league: await read('league') };
      const fresh = ss.get(RESULT_KEY);
      if (fresh) {
        ss.del(RESULT_KEY);
        try {
          const dump = await inflate(fresh);
          const startJson = ss.get(START_KEY) || '[]';
          ss.del(START_KEY);
          const merged = { ...dump, startSteps: JSON.parse(startJson) };
          if (dump.mode === 'leagues' || dump.mode === 'league') {
            ss.set(modeKey(dump.mode), fresh);
            ss.set(`${modeKey(dump.mode)}_start`, startJson);
            held[dump.mode] = merged;
          } else setFailed(merged);
        } catch (e) {
          setFailed({ steps: [{ step: 'Reading the result', ok: false, detail: `The result came back but could not be read in this browser: ${e?.message || e}` }], fetchLog: [] });
        }
      }
      setLeagues(held.leagues);
      setLeague(held.league);
    })();
  }, []);

  const index = leagues?.account?.leagueIndex || [];
  React.useEffect(() => { if (!leagueKey && index.length) setLeagueKey(index[0].league_key); }, [index, leagueKey]);

  async function connect(withLeague) {
    setBusy(true); setStartError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/yahoo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data?.session?.access_token || ''}` },
        body: JSON.stringify(withLeague ? { leagueKey, includePrev, asOf: asOf || null, sendScope } : { sendScope }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.authorizeUrl) {
        setStartError({ message: body.error || `The start endpoint answered HTTP ${r.status}.`, steps: body.steps || [] });
        setBusy(false);
        return;
      }
      ss.set(START_KEY, JSON.stringify(body.steps || []));
      window.location.assign(body.authorizeUrl);
    } catch (e) {
      setStartError({ message: String(e?.message || e), steps: [] });
      setBusy(false);
    }
  }

  function clearAll() {
    ['leagues', 'league'].forEach(k => { ss.del(modeKey(k)); ss.del(`${modeKey(k)}_start`); });
    setLeagues(null); setLeague(null); setFailed(null);
  }

  const body = { ...t.typeBody, color: t.textBody, margin: `0 0 ${tokens.spaceSm}px` };
  const label = { ...t.typeBody, color: t.textBody, display: 'flex', alignItems: 'center', gap: tokens.spaceXs, minHeight: 32 };
  const field = {
    ...t.typeBody, color: t.textPrimary, background: t.cardBg2, border: `1px solid ${t.border}`,
    borderRadius: tokens.radiusMd, padding: `${tokens.spaceXs}px ${tokens.spaceSm}px`, maxWidth: '100%',
  };

  let gate = null;
  if (!supabase) gate = 'Sign-in is not configured on this deployment, so the flow cannot be started here.';
  else if (!authReady) gate = 'Checking your sign-in…';
  else if (!session) gate = 'Sign in to KeeperHQ first (top right). Only a signed-in commissioner can start this.';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: `0 ${tokens.spaceMd}px` }}>
      <h1 style={{ ...t.typeHeadingPage, color: t.textPrimary, margin: `${tokens.spaceMd}px 0 ${tokens.space2xs}px` }}>Yahoo API discovery spike</h1>
      <p style={{ ...body, color: t.textSecondary }}>
        Temporary. Reads what Yahoo returns for your leagues and shows it here. Nothing from Yahoo is saved, no token is
        kept, and no league in KeeperHQ is touched.
      </p>

      <Card t={t} title="This deployment">
        {infoError && <p style={{ ...body, color: tokens.danger }}>{infoError}</p>}
        {info && (
          <ul style={{ ...body, paddingLeft: tokens.spaceLg, margin: 0 }}>
            <li>YAHOO_CLIENT_ID: <strong>{info.configured.YAHOO_CLIENT_ID ? 'set' : 'NOT set'}</strong> · YAHOO_CLIENT_SECRET: <strong>{info.configured.YAHOO_CLIENT_SECRET ? 'set' : 'NOT set'}</strong></li>
            <li>Redirect URI sent to Yahoo: <code>{info.redirectUri}</code></li>
            <li style={{ color: info.hostMatchesRedirect ? t.textBody : tokens.danger }}>
              You are on <code>{info.requestHost}</code>. {info.hostMatchesRedirect
                ? 'That matches the redirect URI, so the flow can complete here.'
                : 'That does NOT match the redirect URI — the flow can only complete on the redirect URI\'s domain.'}
            </li>
          </ul>
        )}
        {!info && !infoError && <p style={body}>Checking…</p>}
      </Card>

      {gate ? <Card t={t}><p style={{ ...body, margin: 0 }}>{gate}</p></Card> : (
        <>
          <Card t={t} title="Step 1 · Find your leagues">
            <p style={body}>Sends you to Yahoo to approve read access, then lists every game and league on your account.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.spaceSm, alignItems: 'center' }}>
              <Btn t={t} primary disabled={busy} onClick={() => connect(false)}>{leagues ? 'Connect Yahoo again' : 'Connect Yahoo'}</Btn>
              <label style={label}>
                <input type="checkbox" checked={sendScope} onChange={e => setSendScope(e.target.checked)} />
                Send <code>scope=fspt-r</code> (untick only if Yahoo answers “invalid scope”)
              </label>
            </div>
            {leagues && <div style={{ marginTop: tokens.spaceMd }}><Result t={t} dump={leagues} label="leagues" /></div>}
          </Card>

          <Card t={t} title="Step 2 · Dump one league">
            {index.length === 0 ? <p style={{ ...body, margin: 0 }}>Finish step 1 first — the league list appears here.</p> : (
              <>
                <div style={{ display: 'grid', gap: tokens.spaceXs, marginBottom: tokens.spaceSm }}>
                  <label style={{ ...label, flexWrap: 'wrap' }}>
                    League
                    <select value={leagueKey} onChange={e => setLeagueKey(e.target.value)} style={field}>
                      {index.map(l => (
                        <option key={l.league_key} value={l.league_key}>
                          {l.season} · {l.game_code} · {l.name} ({l.league_key}){l.previous_league_key ? '' : ' · no previous season linked'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={label}>
                    <input type="checkbox" checked={includePrev} onChange={e => setIncludePrev(e.target.checked)} />
                    Also dump the season before it (found through Yahoo’s renew link)
                  </label>
                  <label style={{ ...label, flexWrap: 'wrap' }}>
                    Roster “as of” date (optional)
                    <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={field} />
                    <span style={{ ...t.typeBodyMeta, color: t.textMuted }}>Leave blank: the spike works out the last day of the fantasy regular season itself.</span>
                  </label>
                </div>
                <Btn t={t} primary disabled={busy || !leagueKey} onClick={() => connect(true)}>Dump this league</Btn>
                <p style={{ ...t.typeBodyMeta, color: t.textMuted, margin: `${tokens.spaceXs}px 0 0` }}>
                  Yahoo will ask you to approve again. That is expected: no token is kept between steps.
                </p>
              </>
            )}
            {league && <div style={{ marginTop: tokens.spaceMd }}><Result t={t} dump={league} label={`league-${league.request?.leagueKey || ''}`} /></div>}
          </Card>
        </>
      )}

      {startError && (
        <Card t={t} title="Could not start">
          <p style={{ ...body, color: tokens.danger }}>{startError.message}</p>
          <Steps t={t} steps={startError.steps} />
        </Card>
      )}
      {failed && (
        <Card t={t} title="Last run did not complete">
          <Steps t={t} steps={[...(failed.startSteps || []), ...(failed.steps || [])]} />
          <div style={{ marginTop: tokens.spaceSm }}><Btn t={t} onClick={() => download('yahoo-spike-failed-run.json', failed)}>Download this log</Btn></div>
        </Card>
      )}
      {(leagues || league || failed) && <Btn t={t} onClick={clearAll}>Clear results from this tab</Btn>}
    </div>
  );
}
