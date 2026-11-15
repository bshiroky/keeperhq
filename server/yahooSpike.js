// Yahoo Fantasy API DISCOVERY SPIKE — server half. Throwaway by design.
//
// This is not the Yahoo integration. Its one job is to show what Yahoo
// actually returns for a real account so the integration is designed against
// facts. To delete the spike, remove: this file, api/yahoo/, the
// src/YahooSpikePage.jsx route, src/lib/yahooSpikeDigest.js and
// scripts/test-yahoo-spike.mjs.
//
// HARD RULES this file enforces:
//   • Nothing from Yahoo is stored. No Supabase client is created here for
//     writing; the only Supabase call anywhere in the spike verifies who is
//     starting the flow.
//   • Tokens never leave this module's memory. The access token lives for one
//     function invocation; the refresh token is discarded unread. Picking a
//     league therefore means a SECOND trip through Yahoo's consent redirect
//     rather than a token kept between requests — slower, and deliberate.
//   • The client secret, the tokens and the auth code are scrubbed from the
//     output as a last step, on top of never being put there in the first
//     place.
//
// Handlers are built by factories taking their I/O (fetch, user verification,
// env) so scripts/test-yahoo-spike.mjs can run the whole flow against a fake
// Yahoo — this container can't reach the real one.

import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const YAHOO = {
  authorizeUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
  apiBase: 'https://fantasysports.yahooapis.com/fantasy/v2',
  scope: 'fspt-r',
};
// Must match the Yahoo app's registered Redirect URI exactly. Production only:
// preview URLs change per deploy, so they can't be registered.
export const DEFAULT_REDIRECT_URI = 'https://keeperhq.app/api/yahoo/callback';
export const STATE_COOKIE = 'khq_yahoo_state';
export const SPIKE_PAGE = '/yahoo-spike';
export const RESULT_KEY = 'khq_yahoo_spike_result';

const STATE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
// Leaves headroom under the function's 60s limit so a slow run still returns
// a dump (with the unreached fetches marked skipped) instead of a platform
// timeout page that says nothing.
const RUN_BUDGET_MS = 48000;
const RENEW_CHAIN_MAX = 12;

// ── state parameter ───────────────────────────────────────────────────────

const stateKey = secret => crypto.createHash('sha256').update(`khq-yahoo-state:${secret}`).digest();
const hmac = (body, secret) => crypto.createHmac('sha256', stateKey(secret)).update(body).digest('base64url');

// The cookie carries the signed payload; Yahoo only ever sees the nonce.
export function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body, secret)}`;
}

export function verifyState({ cookie, stateParam, secret, now = Date.now() }) {
  if (!cookie) {
    return {
      ok: false,
      reason: 'No state cookie came back with the callback. The flow must be started and finished on the same domain (keeperhq.app) in the same browser, within 10 minutes.',
    };
  }
  const [body, sig] = String(cookie).split('.');
  if (!body || !sig) return { ok: false, reason: 'State cookie is malformed.' };
  const expected = hmac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'State cookie signature is invalid — it was not issued by this app.' };
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return { ok: false, reason: 'State cookie payload is unreadable.' }; }
  if (!payload?.exp || payload.exp < now) return { ok: false, reason: 'State expired (10 minute limit). Start again.' };
  if (!stateParam) return { ok: false, reason: 'Yahoo did not send a state parameter back.' };
  if (payload.nonce !== stateParam) return { ok: false, reason: 'State mismatch — the callback does not belong to the flow this browser started.' };
  return { ok: true, payload };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const stateCookie = (value, maxAge) =>
  `${STATE_COOKIE}=${value}; Path=/api/yahoo; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export function buildAuthorizeUrl({ clientId, redirectUri, state, sendScope = true }) {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state, language: 'en-us',
  });
  if (sendScope) p.set('scope', YAHOO.scope);
  return `${YAHOO.authorizeUrl}?${p.toString()}`;
}

// ── small helpers ─────────────────────────────────────────────────────────

const hostOf = req => String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
const hostOfUrl = u => { try { return new URL(u).host.toLowerCase(); } catch { return ''; } };
const isLeagueKey = v => /^\d+\.l\.\d+$/.test(String(v || ''));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function readConfig(env) {
  return {
    clientId: env.YAHOO_CLIENT_ID || '',
    clientSecret: env.YAHOO_CLIENT_SECRET || '',
    redirectUri: env.YAHOO_REDIRECT_URI || DEFAULT_REDIRECT_URI,
  };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// Yahoo's JSON is deeply nested with numeric-string keys, and its exact shape
// is one of the things this spike exists to find out — so nothing here indexes
// into it by position. Everything is located by walking for a key.
export function collectByKey(root, key, out = []) {
  if (Array.isArray(root)) { for (const v of root) collectByKey(v, key, out); return out; }
  if (root && typeof root === 'object') {
    if (Object.prototype.hasOwnProperty.call(root, key)) out.push(root);
    for (const v of Object.values(root)) collectByKey(v, key, out);
  }
  return out;
}
// Values stored under `key` anywhere — Yahoo wraps each entity as
// { transaction: [...] }, { team: [...] }, { player: [...] }.
export function collectValues(root, key) { return collectByKey(root, key).map(o => o[key]); }
export function findFirst(root, key) {
  const hit = collectByKey(root, key)[0];
  return hit ? hit[key] : undefined;
}
const uniq = arr => [...new Set(arr.filter(v => v !== undefined && v !== null && v !== ''))];
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj && obj[k] !== undefined).map(k => [k, obj[k]]));
function safe(fn) { try { return fn(); } catch (e) { return { derivationError: String(e?.message || e) }; } }

// Leaguemates' email addresses can come back on manager records. Whether they
// do is a finding; the addresses themselves have no business in a file that
// gets passed around.
export function redactEmails(root) {
  if (Array.isArray(root)) { root.forEach(redactEmails); return root; }
  if (root && typeof root === 'object') {
    for (const [k, v] of Object.entries(root)) {
      if (k === 'email' && typeof v === 'string' && v) root[k] = '[redacted by the spike — an email address was present]';
      else redactEmails(v);
    }
  }
  return root;
}

export function scrub(text, secrets) {
  let out = text;
  for (const s of secrets) if (s && String(s).length >= 6) out = out.split(String(s)).join('[scrubbed]');
  return out;
}

// "453_12345" (how renew/renewed are written) → "453.l.12345".
export function renewToLeagueKey(v) {
  const m = /^(\d+)_(\d+)$/.exec(String(v || '').trim());
  return m ? `${m[1]}.l.${m[2]}` : null;
}

const LEAGUE_FIELDS = [
  'league_key', 'league_id', 'name', 'season', 'game_code', 'url', 'num_teams', 'league_type',
  'scoring_type', 'draft_status', 'renew', 'renewed', 'start_date', 'end_date', 'start_week',
  'end_week', 'current_week', 'is_finished', 'weekly_deadline', 'felo_tier',
];
export function leagueIndexFrom(...roots) {
  const byKey = new Map();
  for (const root of roots) {
    const games = new Map(collectByKey(root, 'game_key').map(g => [String(g.game_key), g]));
    for (const l of collectByKey(root, 'league_key')) {
      if (!isLeagueKey(l.league_key) || byKey.has(l.league_key)) continue;
      const game = games.get(String(l.league_key).split('.')[0]);
      byKey.set(l.league_key, {
        ...pick(l, LEAGUE_FIELDS),
        game_code: l.game_code ?? game?.code,
        season: l.season ?? game?.season,
        previous_league_key: renewToLeagueKey(l.renew),
        next_league_key: renewToLeagueKey(l.renewed),
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    String(b.season || '').localeCompare(String(a.season || '')) || String(a.name || '').localeCompare(String(b.name || '')));
}

// ── Yahoo calls ───────────────────────────────────────────────────────────

export async function exchangeCode({ code, clientId, clientSecret, redirectUri, fetchImpl }) {
  const started = Date.now();
  try {
    const r = await fetchImpl(YAHOO.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* reported below */ }
    const ms = Date.now() - started;
    if (!r.ok || !json?.access_token) {
      return {
        ok: false, status: r.status, ms,
        error: json?.error || `HTTP ${r.status}`,
        errorDescription: json?.error_description || (json ? 'No access_token in the response.' : `Non-JSON response: ${text.slice(0, 300)}`),
      };
    }
    return {
      ok: true, status: r.status, ms,
      accessToken: json.access_token,
      // Returned ONLY so the final scrub can remove it if Yahoo ever echoes it
      // somewhere. It is never used and never stored.
      refreshTokenForScrubOnly: json.refresh_token || '',
      // What the page is allowed to know about the tokens: shape, not value.
      summary: {
        token_type: json.token_type ?? null,
        expires_in_seconds: json.expires_in ?? null,
        access_token_received: true,
        refresh_token_received: !!json.refresh_token,
        refresh_token_kept: false,
        other_fields_present: Object.keys(json).filter(k => !['access_token', 'refresh_token', 'token_type', 'expires_in'].includes(k)),
      },
    };
  } catch (e) {
    return { ok: false, status: null, ms: Date.now() - started, error: 'network', errorDescription: String(e?.message || e) };
  }
}

// One GET. Never throws: a failed resource becomes a record with `error`.
async function yahooGet(ctx, label, path) {
  const rec = { label, path };
  if (Date.now() > ctx.deadline) {
    rec.ok = false; rec.skipped = true;
    rec.error = { message: 'Skipped — the run reached its time budget before this fetch.' };
  } else {
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await ctx.fetchImpl(`${YAHOO.apiBase}${path}?format=json`, {
        headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' },
        signal: ac.signal,
      });
      const text = await r.text();
      rec.status = r.status; rec.ok = r.ok; rec.bytes = text.length;
      let json = null;
      try { json = JSON.parse(text); } catch { rec.nonJson = true; }
      if (r.ok && json) rec.data = redactEmails(json);
      else {
        rec.ok = false;
        rec.error = {
          message: json?.error?.description || (r.ok ? 'Response was not JSON.' : `HTTP ${r.status}`),
          body: text.slice(0, 1500),
        };
      }
    } catch (e) {
      rec.ok = false;
      rec.error = { message: e?.name === 'AbortError' ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s` : String(e?.message || e) };
    } finally {
      clearTimeout(timer);
      rec.ms = Date.now() - started;
    }
  }
  ctx.fetchLog.push({
    label: rec.label, path: rec.path, ok: rec.ok, status: rec.status ?? null,
    ms: rec.ms ?? null, bytes: rec.bytes ?? null, skipped: !!rec.skipped,
    error: rec.error?.message || null,
  });
  return rec;
}

// Pass 1 — every game and league on the account.
export async function dumpAccount(ctx) {
  const games = await yahooGet(ctx, 'account: games', '/users;use_login=1/games');
  const allLeagues = await yahooGet(ctx, 'account: all leagues (one call)', '/users;use_login=1/games/leagues');
  let leagueIndex = leagueIndexFrom(allLeagues.data, games.data);
  const perGame = [];
  // If the one-call form fails or comes back empty, ask game by game so a
  // single unsupported game can't hide every league.
  if (leagueIndex.length === 0) {
    const gameKeys = uniq(collectByKey(games.data, 'game_key').map(g => String(g.game_key)));
    perGame.push(...await mapPool(gameKeys, 5, k =>
      yahooGet(ctx, `account: leagues in game ${k}`, `/users;use_login=1/games;game_keys=${k}/leagues`)));
    leagueIndex = leagueIndexFrom(games.data, ...perGame.map(r => r.data));
  }
  return { resources: { games, allLeagues, perGame }, leagueIndex };
}

// Which day does the fantasy regular season end? Derived three ways, each
// recorded, because whether this is derivable at all is one of the questions.
function regularSeasonEnd({ metadata, settings, gameWeeks, matchups, asOf }) {
  const num = v => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  const playoffStartWeek = num(findFirst(settings.data, 'playoff_start_week'));
  const endWeek = num(findFirst(metadata.data, 'end_week'));
  const lastRegularWeek = playoffStartWeek ? playoffStartWeek - 1 : endWeek;
  const weeks = collectByKey(gameWeeks.data, 'week').filter(w => w.start && w.end);
  const fromGameWeeks = weeks.find(w => num(w.week) === lastRegularWeek)?.end || null;
  const regularMatchups = collectByKey(matchups?.data, 'week_end').filter(m => String(m.is_playoffs) === '0');
  const fromMatchups = regularMatchups.map(m => m.week_end).sort().pop() || null;
  const date = (isDate(asOf) && asOf) || fromGameWeeks || fromMatchups || null;
  return {
    playoff_start_week: playoffStartWeek,
    league_end_week: endWeek,
    last_regular_season_week: lastRegularWeek,
    date_from_game_weeks: fromGameWeeks,
    date_from_matchups: fromMatchups,
    date_override_from_page: isDate(asOf) ? asOf : null,
    date_used: date,
    date_source: isDate(asOf) ? 'page override' : fromGameWeeks ? 'game_weeks' : fromMatchups ? 'matchups' : 'none — could not derive',
    week_used: lastRegularWeek,
  };
}

const playerKeysIn = data => uniq(collectByKey(data, 'player_key').map(p => p.player_key));

// Pass 2 — everything asked for, for one league.
export async function dumpLeague(ctx, leagueKey, { asOf } = {}) {
  const L = `/league/${leagueKey}`;
  const gameKey = leagueKey.split('.')[0];
  const tag = s => `${leagueKey} ${s}`;

  const [metadata, settings, standings, teams, transactions, draftresults, playersSample, gameWeeks,
    probeLeagueDraftPicks, probeTeamsDraftPicks, probeTradesOnly] = await Promise.all([
    yahooGet(ctx, tag('metadata'), `${L}/metadata`),
    yahooGet(ctx, tag('settings'), `${L}/settings`),
    yahooGet(ctx, tag('standings'), `${L}/standings`),
    yahooGet(ctx, tag('teams + managers'), `${L}/teams`),
    yahooGet(ctx, tag('transactions'), `${L}/transactions`),
    yahooGet(ctx, tag('draft results'), `${L}/draftresults`),
    yahooGet(ctx, tag('players (first 25)'), `${L}/players;start=0;count=25`),
    yahooGet(ctx, tag('game weeks'), `/game/${gameKey}/game_weeks`),
    // PROBES: guesses at where traded draft picks might live. An error here is
    // an answer, not a failure.
    yahooGet(ctx, tag('PROBE league/draft_picks'), `${L}/draft_picks`),
    yahooGet(ctx, tag('PROBE league/teams/draft_picks'), `${L}/teams/draft_picks`),
    yahooGet(ctx, tag('PROBE transactions;type=trade'), `${L}/transactions;type=trade`),
  ]);

  const teamKeys = uniq(collectByKey(teams.data, 'team_key').map(t => t.team_key));
  const matchups = teamKeys[0]
    ? await yahooGet(ctx, tag(`matchups for ${teamKeys[0]}`), `/team/${teamKeys[0]}/matchups`)
    : null;

  const seasonEnd = safe(() => regularSeasonEnd({ metadata, settings, gameWeeks, matchups, asOf }));
  const date = seasonEnd.date_used || null;
  const week = seasonEnd.week_used || null;

  // Can one call return every team's roster as of a date? If so the real
  // build is 1 request instead of one per team.
  const allRostersOneCall = date
    ? await yahooGet(ctx, tag(`all rosters in one call, date=${date}`), `${L}/teams/roster;date=${date}`)
    : null;

  const jobs = [];
  for (const t of teamKeys) {
    jobs.push({ t, kind: 'current', path: `/team/${t}/roster` });
    if (date) jobs.push({ t, kind: 'asOfDate', path: `/team/${t}/roster;date=${date}` });
    if (week) jobs.push({ t, kind: 'asOfWeek', path: `/team/${t}/roster;week=${week}` });
  }
  const rosters = { current: {}, asOfDate: {}, asOfWeek: {} };
  await mapPool(jobs, 6, async j => {
    rosters[j.kind][j.t] = await yahooGet(ctx, `${j.t} roster (${j.kind})`, j.path);
  });

  // Draft results are expected to carry player KEYS only — test whether a
  // batch of keys resolves to names in one call.
  const draftKeys = playerKeysIn(draftresults.data).slice(0, 25);
  const playerLookup = draftKeys.length
    ? await yahooGet(ctx, tag('players by key (first 25 drafted)'), `${L}/players;player_keys=${draftKeys.join(',')}`)
    : null;

  const derived = {
    league: safe(() => pick(collectByKey(metadata.data, 'league_key')[0] || {}, LEAGUE_FIELDS)),
    team_keys: teamKeys,
    regular_season_end: seasonEnd,
    rosters: safe(() => teamKeys.map(t => {
      const cur = playerKeysIn(rosters.current[t]?.data);
      const row = { team_key: t, team_name: findFirst(collectValues(teams.data, 'team').find(x => findFirst(x, 'team_key') === t), 'name') ?? null, current_players: cur.length };
      for (const kind of ['asOfDate', 'asOfWeek']) {
        const rec = rosters[kind][t];
        if (!rec) continue;
        const keys = playerKeysIn(rec.data);
        row[kind] = rec.ok ? {
          players: keys.length,
          // If Yahoo silently ignored the date these would both be 0 for every
          // team — the tell that "as of" isn't really being honoured.
          on_this_roster_not_current: keys.filter(k => !cur.includes(k)).length,
          on_current_not_this_roster: cur.filter(k => !keys.includes(k)).length,
          yahoo_echoed: pick(collectByKey(rec.data, 'coverage_type')[0] || {}, ['coverage_type', 'date', 'week']),
        } : { error: rec.error?.message };
      }
      return row;
    })),
    transactions: safe(() => {
      const all = collectValues(transactions.data, 'transaction');
      const byType = {}; const samples = {}; let withPicks = 0; const stamps = [];
      for (const tx of all) {
        const type = String(findFirst(tx, 'type') ?? 'unknown');
        byType[type] = (byType[type] || 0) + 1;
        const ts = Number(findFirst(tx, 'timestamp'));
        if (ts) stamps.push(ts);
        const hasPicks = collectByKey(tx, 'picks').length > 0;
        if (hasPicks) withPicks++;
        // One raw example per type (and one trade that moves picks), kept so
        // the digest still shows every shape after collections are trimmed.
        if (!samples[type]) samples[type] = tx;
        if (hasPicks && !samples.trade_with_picks) samples.trade_with_picks = tx;
      }
      const iso = n => (n ? new Date(n * 1000).toISOString() : null);
      return {
        count: all.length, by_type: byType, including_draft_picks: withPicks,
        earliest: stamps.length ? iso(Math.min(...stamps)) : null,
        latest: stamps.length ? iso(Math.max(...stamps)) : null,
        timestamps_present: stamps.length, samples,
      };
    }),
    draft: safe(() => {
      const picks = collectByKey(draftresults.data, 'player_key').filter(p => p.pick !== undefined || p.round !== undefined);
      return {
        picks: picks.length,
        with_round: picks.filter(p => p.round !== undefined).length,
        with_cost: picks.filter(p => p.cost !== undefined && p.cost !== '').length,
        fields_seen: uniq(picks.flatMap(p => Object.keys(p))),
        first_three: picks.slice(0, 3), last_one: picks.slice(-1),
      };
    }),
    standings: safe(() => ({ teams_with_rank: collectByKey(standings.data, 'rank').length })),
    managers: safe(() => {
      const managers = collectValues(teams.data, 'manager');
      return { count: managers.length, fields_seen: uniq(managers.flatMap(m => (m && typeof m === 'object' ? Object.keys(m) : []))) };
    }),
    player_record_sample: safe(() => collectValues(rosters.current[teamKeys[0]]?.data, 'player')[0] ?? null),
    traded_pick_probes: safe(() => ({
      'league/draft_picks': probeLeagueDraftPicks.ok ? 'returned data' : probeLeagueDraftPicks.error?.message,
      'league/teams/draft_picks': probeTeamsDraftPicks.ok ? 'returned data' : probeTeamsDraftPicks.error?.message,
      'transactions;type=trade': probeTradesOnly.ok ? 'returned data' : probeTradesOnly.error?.message,
    })),
  };

  return {
    leagueKey,
    resources: {
      metadata, settings, standings, teams, transactions, draftresults, playersSample, playerLookup,
      gameWeeks, matchups, allRostersOneCall, probeLeagueDraftPicks, probeTeamsDraftPicks, probeTradesOnly,
    },
    rosters,
    derived,
  };
}

// Follow `renew` backwards one league at a time: this IS the answer to "how is
// last season's league reached from this season's".
export async function walkRenewChain(ctx, startMetadata) {
  const chain = [];
  const seen = new Set();
  let prev = renewToLeagueKey(findFirst(startMetadata?.data, 'renew'));
  while (prev && !seen.has(prev) && chain.length < RENEW_CHAIN_MAX) {
    seen.add(prev);
    const rec = await yahooGet(ctx, `renew chain: ${prev} metadata`, `/league/${prev}/metadata`);
    const meta = collectByKey(rec.data, 'league_key')[0] || {};
    chain.push({ league_key: prev, ok: rec.ok, error: rec.error?.message || null, ...pick(meta, ['name', 'season', 'renew', 'renewed', 'num_teams', 'is_finished']) });
    prev = rec.ok ? renewToLeagueKey(meta.renew) : null;
  }
  return chain;
}

// ── hand-off back to the page ─────────────────────────────────────────────

// The callback is a top-level navigation from Yahoo, so its response has to be
// a document. It carries the dump (gzipped — Vercel caps a function response
// at 4.5MB) into THIS TAB's sessionStorage and returns to the spike page.
// sessionStorage is the tab's working memory, gone when the tab closes; it is
// how the result gets on screen, not a store.
export function handOffHtml(dump, secrets = []) {
  const json = scrub(JSON.stringify(dump), secrets);
  const b64 = zlib.gzipSync(Buffer.from(json, 'utf8')).toString('base64');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>KeeperHQ · Yahoo spike</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;line-height:1.5">
<p id="msg">Finishing up — returning to the spike page…</p>
<script id="payload" type="text/plain">${b64}</script>
<script>
(function () {
  var b64 = document.getElementById('payload').textContent;
  var msg = document.getElementById('msg');
  try {
    sessionStorage.setItem(${JSON.stringify(RESULT_KEY)}, b64);
    location.replace(${JSON.stringify(SPIKE_PAGE)});
  } catch (e) {
    msg.textContent = 'The result was too large to hand back to the spike page (' + Math.round(b64.length / 1024) + ' KB compressed). Download it here instead: ';
    var a = document.createElement('button');
    a.textContent = 'Download JSON';
    a.onclick = function () {
      var bin = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).blob().then(function (blob) {
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'yahoo-spike-full.json';
        link.click();
      });
    };
    msg.appendChild(a);
  }
})();
</script></body></html>`;
}

// ── handlers ──────────────────────────────────────────────────────────────

// GET  → what this deployment is configured with (booleans only, no values).
// POST → verify the signed-in user, issue state, return Yahoo's authorize URL.
export function createStartHandler({ verifyUser, env = process.env, now = () => Date.now() }) {
  return async function start(req, res) {
    const cfg = readConfig(env);
    const requestHost = hostOf(req);
    const redirectHost = hostOfUrl(cfg.redirectUri);
    const info = {
      configured: { YAHOO_CLIENT_ID: !!cfg.clientId, YAHOO_CLIENT_SECRET: !!cfg.clientSecret },
      redirectUri: cfg.redirectUri,
      requestHost,
      hostMatchesRedirect: requestHost === redirectHost,
      endpoints: YAHOO,
    };
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET') return res.status(200).json(info);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const steps = [];
    const step = (name, ok, detail) => steps.push({ step: name, ok, detail, at: new Date(now()).toISOString() });
    const fail = (status, error) => res.status(status).json({ error, steps, info });

    if (!cfg.clientId || !cfg.clientSecret) {
      step('Server configuration', false, 'YAHOO_CLIENT_ID and/or YAHOO_CLIENT_SECRET is not set for this deployment.');
      return fail(501, 'Yahoo credentials are not configured on this deployment.');
    }
    step('Server configuration', true, 'YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET are set (values not shown).');

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const user = token ? await verifyUser(token) : null;
    if (!user?.id) {
      step('Commissioner sign-in', false, 'No valid KeeperHQ session came with the request.');
      return fail(401, 'Sign in to KeeperHQ first — only a signed-in commissioner can start this.');
    }
    step('Commissioner sign-in', true, 'KeeperHQ session verified.');

    if (requestHost !== redirectHost) {
      step('Domain check', false, `This page is on ${requestHost || '(unknown)'} but Yahoo will send the callback to ${redirectHost}. The state cookie would not be there, so the flow would fail on return. Open the spike page on ${redirectHost}.`);
      return fail(409, `Run this from ${redirectHost}.`);
    }
    step('Domain check', true, `Started on ${requestHost}, which is where the callback lands.`);

    const body = typeof req.body === 'string' ? safe(() => JSON.parse(req.body)) : (req.body || {});
    const leagueKey = isLeagueKey(body.leagueKey) ? String(body.leagueKey) : null;
    if (body.leagueKey && !leagueKey) return fail(400, 'That league key is not in the expected form (e.g. 453.l.12345).');
    const payload = {
      nonce: crypto.randomBytes(24).toString('base64url'),
      exp: now() + STATE_TTL_MS,
      uid: user.id,
      leagueKey,
      includePrev: leagueKey ? body.includePrev !== false : false,
      asOf: isDate(body.asOf) ? body.asOf : null,
    };
    const sendScope = body.sendScope !== false;
    res.setHeader('Set-Cookie', stateCookie(signState(payload, cfg.clientSecret), Math.floor(STATE_TTL_MS / 1000)));
    step('State issued', true, 'Random state generated and held in an HttpOnly cookie for 10 minutes.');
    step('Redirect to Yahoo', true, `Sending the browser to ${YAHOO.authorizeUrl} with redirect_uri=${cfg.redirectUri}${sendScope ? ` and scope=${YAHOO.scope}` : ' and NO scope parameter'}.`);
    return res.status(200).json({
      authorizeUrl: buildAuthorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state: payload.nonce, sendScope }),
      steps, info,
    });
  };
}

export function createCallbackHandler({ fetchImpl = fetch, env = process.env, now = () => Date.now() }) {
  return async function callback(req, res) {
    const cfg = readConfig(env);
    const started = now();
    const query = req.query || Object.fromEntries(new URL(req.url, 'https://x').searchParams);
    const steps = [];
    const step = (name, ok, detail) => steps.push({ step: name, ok, detail, at: new Date(now()).toISOString() });
    const dump = {
      spike: 'yahoo-fantasy-discovery', version: 1, generatedAt: new Date(started).toISOString(),
      mode: 'error', ok: false, endpoints: YAHOO, redirectUri: cfg.redirectUri, steps, fetchLog: [],
      notes: [
        'Raw Yahoo responses are under `resources` / `rosters`, exactly as returned (email addresses redacted).',
        '`derived` is best-effort summarising by this spike and may be wrong where the raw shape surprised it — trust the raw data over it.',
        'No token, secret or auth code appears in this file. Nothing was stored server-side.',
      ],
    };
    const secrets = [cfg.clientSecret, query.code];

    try {
      if (query.error) {
        step('Callback from Yahoo', false, `Yahoo returned an error instead of a code: ${query.error}${query.error_description ? ` — ${query.error_description}` : ''}`);
      } else if (!query.code) {
        step('Callback from Yahoo', false, 'The callback arrived with no authorization code.');
      } else {
        step('Callback from Yahoo', true, 'Authorization code received (value not shown).');
      }

      if (!cfg.clientId || !cfg.clientSecret) {
        step('Server configuration', false, 'YAHOO_CLIENT_ID and/or YAHOO_CLIENT_SECRET is not set for this deployment.');
        throw new Error('stop');
      }

      const state = verifyState({
        cookie: parseCookies(req.headers.cookie)[STATE_COOKIE], stateParam: query.state, secret: cfg.clientSecret, now: now(),
      });
      step('State verification', state.ok, state.ok ? 'The state Yahoo returned matches the one this browser was issued.' : state.reason);
      if (!state.ok || !query.code) throw new Error('stop');
      const { leagueKey, includePrev, asOf } = state.payload;
      dump.request = { leagueKey, includePrev, asOf };

      const tok = await exchangeCode({ code: query.code, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri, fetchImpl });
      secrets.push(tok.accessToken, tok.refreshTokenForScrubOnly);
      if (!tok.ok) {
        step('Token exchange', false, `Yahoo refused the code (HTTP ${tok.status ?? 'no response'}): ${tok.error} — ${tok.errorDescription}`);
        throw new Error('stop');
      }
      dump.token = tok.summary;
      step('Token exchange', true, `HTTP ${tok.status} in ${tok.ms}ms. token_type=${tok.summary.token_type}, expires in ${tok.summary.expires_in_seconds}s, refresh token ${tok.summary.refresh_token_received ? 'offered and discarded' : 'not offered'}.`);

      const ctx = { token: tok.accessToken, fetchImpl, deadline: started + RUN_BUDGET_MS, fetchLog: dump.fetchLog };
      if (!leagueKey) {
        dump.mode = 'leagues';
        dump.account = await dumpAccount(ctx);
        step('Games and leagues', dump.account.leagueIndex.length > 0, `${dump.account.leagueIndex.length} league(s) found across the account.`);
      } else {
        dump.mode = 'league';
        dump.league = await dumpLeague(ctx, leagueKey, { asOf });
        dump.renewChain = await walkRenewChain(ctx, dump.league.resources.metadata);
        step('Renew chain', true, dump.renewChain.length ? `Walked back ${dump.renewChain.length} season(s): ${dump.renewChain.map(c => c.season || c.league_key).join(' ← ')}.` : 'This league has no `renew` value pointing at a previous season.');
        const prev = dump.renewChain[0]?.ok ? dump.renewChain[0].league_key : null;
        if (includePrev && prev) dump.previousLeague = await dumpLeague(ctx, prev, { asOf });
        else dump.previousLeague = null;
      }
      const okCount = dump.fetchLog.filter(f => f.ok).length;
      step('Yahoo fetches', okCount > 0, `${okCount} of ${dump.fetchLog.length} fetches succeeded; ${dump.fetchLog.filter(f => f.skipped).length} skipped for time. Failures are listed individually below.`);
      dump.ok = okCount > 0;
      step('Token discarded', true, 'The access token existed only inside this one request and is gone.');
    } catch (e) {
      if (e?.message !== 'stop') step('Unexpected error', false, String(e?.message || e));
    }

    dump.seconds = Math.round((now() - started) / 100) / 10;
    res.setHeader('Set-Cookie', stateCookie('', 0));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(handOffHtml(dump, secrets));
  };
}
