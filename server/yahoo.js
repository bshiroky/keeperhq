// Yahoo Fantasy import — server half (OAuth, the Yahoo session, and the fetch
// that turns Yahoo's responses into the plain bundle the Import page reads).
//
// What is and isn't kept:
//   • The client secret never leaves the server.
//   • The REFRESH token is discarded unread. Nothing about Yahoo is written to
//     the database by this module — the league data the commissioner chooses
//     to import is saved by the app, through the same path as a paste import.
//   • The ACCESS token lives for at most an hour in an encrypted HttpOnly
//     cookie in the commissioner's own browser, so one approval on Yahoo
//     covers "list my leagues" and "fetch this one" instead of two trips. It
//     is bound to the KeeperHQ user who started the flow.
//
// Handlers are factories over their I/O (fetch, user verification, env) so
// scripts/test-yahoo.mjs can run the whole flow against a fake Yahoo — this
// container can't reach the real one. The response SHAPES the parsers read
// were established by the discovery spike (PR #54) against two real leagues.

import crypto from 'node:crypto';

export const YAHOO = {
  authorizeUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
  apiBase: 'https://fantasysports.yahooapis.com/fantasy/v2',
  scope: 'fspt-r',
};
// Must match the Yahoo app's registered Redirect URI exactly, so this only
// works on the production domain (preview URLs change per deploy).
export const DEFAULT_REDIRECT_URI = 'https://keeperhq.app/api/yahoo/callback';
export const STATE_COOKIE = 'khq_yahoo_state';
export const SESSION_COOKIE = 'khq_yahoo_session';

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_MAX_S = 55 * 60;
const FETCH_TIMEOUT_MS = 15000;
const RUN_BUDGET_MS = 45000;
const RETURN_TO = /^\/league\/[A-Za-z0-9_-]+\/import$/;

// ── signing + encryption (both keyed off the client secret) ───────────────

const derive = (label, secret) => crypto.createHash('sha256').update(`${label}:${secret}`).digest();
const hmac = (body, secret) => crypto.createHmac('sha256', derive('khq-yahoo-state', secret)).update(body).digest('base64url');

export function signState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body, secret)}`;
}

export function verifyState({ cookie, stateParam, secret, now = Date.now() }) {
  if (!cookie) return { ok: false, reason: 'The sign-in was started in a different browser or tab, or more than 10 minutes ago. Start again from the Import page.' };
  const [body, sig] = String(cookie).split('.');
  if (!body || !sig) return { ok: false, reason: 'The sign-in state was malformed. Start again.' };
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(body, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'The sign-in state was not issued by KeeperHQ. Start again.' };
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return { ok: false, reason: 'The sign-in state was unreadable. Start again.' }; }
  if (!payload?.exp || payload.exp < now) return { ok: false, reason: 'The sign-in took longer than 10 minutes. Start again.' };
  if (!stateParam || payload.nonce !== stateParam) return { ok: false, reason: 'The response from Yahoo did not match the sign-in this browser started. Start again.' };
  return { ok: true, payload };
}

export function sealSession(session, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', derive('khq-yahoo-session', secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function openSession(value, secret, now = Date.now()) {
  try {
    const raw = Buffer.from(String(value || ''), 'base64url');
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', derive('khq-yahoo-session', secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return session?.t && session.exp > now ? session : null;
  } catch { return null; }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/api/yahoo; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export function buildAuthorizeUrl({ clientId, redirectUri, state }) {
  return `${YAHOO.authorizeUrl}?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', state, scope: YAHOO.scope, language: 'en-us',
  })}`;
}

// ── reading Yahoo's JSON ───────────────────────────────────────────────────
// Collections are objects keyed "0","1",… plus "count"; an entity's own fields
// arrive as an ARRAY of single-key objects (with stray [] entries).

export const items = col => Object.keys(col || {}).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b).map(k => col[k]);
export const flat = arr => Object.assign({}, ...[].concat(arr || []).flat().filter(x => x && typeof x === 'object' && !Array.isArray(x)));
export function collectByKey(root, key, out = []) {
  if (Array.isArray(root)) { for (const v of root) collectByKey(v, key, out); return out; }
  if (root && typeof root === 'object') {
    if (Object.prototype.hasOwnProperty.call(root, key)) out.push(root);
    for (const v of Object.values(root)) collectByKey(v, key, out);
  }
  return out;
}
const num = v => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const leagueNode = data => data?.fantasy_content?.league;
const isLeagueKey = v => /^\d+\.l\.\d+$/.test(String(v || ''));
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

// "453_12345" (how renew/renewed are written) → "453.l.12345".
export function renewToLeagueKey(v) {
  const m = /^(\d+)_(\d+)$/.exec(String(v || '').trim());
  return m ? `${m[1]}.l.${m[2]}` : null;
}

export function parseLeagueList(...roots) {
  const byKey = new Map();
  for (const root of roots) {
    const games = new Map(collectByKey(root, 'game_key').map(g => [String(g.game_key), g]));
    for (const l of collectByKey(root, 'league_key')) {
      if (!isLeagueKey(l.league_key) || byKey.has(l.league_key)) continue;
      const game = games.get(String(l.league_key).split('.')[0]);
      byKey.set(l.league_key, {
        leagueKey: l.league_key, name: l.name ?? null,
        season: String(l.season ?? game?.season ?? ''), gameCode: l.game_code ?? game?.code ?? null,
        numTeams: num(l.num_teams), isFinished: String(l.is_finished ?? '') === '1',
        previousLeagueKey: renewToLeagueKey(l.renew),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => b.season.localeCompare(a.season) || String(a.name).localeCompare(String(b.name)));
}

export function parsePlayer(playerNode) {
  const m = flat(playerNode?.[0]);
  const slot = flat(playerNode?.[1]?.selected_position).position ?? null;
  return {
    playerKey: m.player_key ?? null,
    yahooPlayerId: m.player_id != null ? String(m.player_id) : null,
    name: m.name?.full ?? null,
    proTeam: m.editorial_team_abbr ?? null,
    positions: String(m.display_position || '').split(',').map(s => s.trim()).filter(Boolean),
    primaryPosition: m.primary_position ?? null,
    slot,
  };
}

export function parseTeams(data) {
  return items(leagueNode(data)?.[1]?.teams).map(t => {
    const m = flat(t.team?.[0]);
    return {
      teamKey: m.team_key, name: m.name ?? '',
      managers: [].concat(m.managers || []).map(x => x?.manager?.nickname).filter(Boolean),
    };
  }).filter(t => t.teamKey);
}

export function parseStandings(data) {
  return items(leagueNode(data)?.[1]?.standings?.[0]?.teams).map(t => {
    const m = flat(t.team?.[0]);
    const rest = flat(t.team?.slice(1));
    const st = rest.team_standings || {};
    const o = st.outcome_totals || {};
    return {
      teamKey: m.team_key, name: m.name ?? '',
      rank: num(st.rank), playoffSeed: num(st.playoff_seed),
      wins: num(o.wins), losses: num(o.losses), ties: num(o.ties), pct: num(o.percentage),
      pts: num(rest.team_points?.total),
    };
  }).filter(t => t.teamKey);
}

// league/teams/roster — every team's roster in one response.
export function parseRosters(data) {
  const out = {};
  for (const t of items(leagueNode(data)?.[1]?.teams)) {
    const key = flat(t.team?.[0]).team_key;
    const roster = flat(t.team?.slice(1)).roster;
    if (key) out[key] = items(roster?.['0']?.players).map(p => parsePlayer(p.player)).filter(p => p.name);
  }
  return out;
}

export function parseDraft(data) {
  return items(leagueNode(data)?.[1]?.draft_results).map(x => x.draft_result).filter(Boolean).map(r => ({
    pick: num(r.pick), round: num(r.round), cost: num(r.cost), teamKey: r.team_key, playerKey: r.player_key,
  }));
}

export function parsePlayers(data) {
  return items(leagueNode(data)?.[1]?.players).map(p => parsePlayer(p.player)).filter(p => p.playerKey);
}

// Draft picks only ever move inside trades. Oldest first, so replaying them
// in order gives final ownership.
export function parsePickTrades(data) {
  const out = [];
  for (const t of items(leagueNode(data)?.[1]?.transactions)) {
    const meta = flat(t.transaction?.[0]);
    if (meta.status && meta.status !== 'successful') continue;
    for (const p of [].concat(meta.picks || [])) {
      const k = p?.pick;
      if (!k?.round || !k.destination_team_key) continue;
      out.push({
        at: num(meta.timestamp), round: num(k.round),
        originalTeamKey: k.original_team_key || k.source_team_key,
        fromTeamKey: k.source_team_key, toTeamKey: k.destination_team_key,
      });
    }
  }
  return out.sort((a, b) => (a.at || 0) - (b.at || 0));
}

// The last day of the fantasy regular season: the end of the week before
// playoff_start_week (or of the final week when the league has no playoffs).
export function regularSeasonEnd({ metadata, settings, gameWeeks }) {
  const playoffStartWeek = num(collectByKey(settings, 'playoff_start_week')[0]?.playoff_start_week);
  const endWeek = num(collectByKey(metadata, 'end_week')[0]?.end_week);
  const lastWeek = playoffStartWeek ? playoffStartWeek - 1 : endWeek;
  const week = collectByKey(gameWeeks, 'week').find(w => w.start && w.end && num(w.week) === lastWeek);
  return { playoffStartWeek, lastRegularWeek: lastWeek, date: week?.end || null };
}

// ── Yahoo calls ───────────────────────────────────────────────────────────

export async function exchangeCode({ code, clientId, clientSecret, redirectUri, fetchImpl }) {
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
    if (!r.ok || !json?.access_token) {
      return { ok: false, error: `Yahoo refused the sign-in (${json?.error || `HTTP ${r.status}`}${json?.error_description ? `: ${json.error_description}` : ''}).` };
    }
    // refresh_token is deliberately not read.
    return { ok: true, accessToken: json.access_token, expiresIn: num(json.expires_in) || 3600 };
  } catch (e) {
    return { ok: false, error: `Could not reach Yahoo: ${e?.message || e}` };
  }
}

// One GET; never throws. `log` collects what happened so a failed import can
// say which request failed.
async function yahooGet(ctx, label, path) {
  const rec = { label, ok: false, status: null, data: null, error: null };
  if (ctx.now() > ctx.deadline) rec.error = 'Skipped: the import ran out of time.';
  else {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await ctx.fetchImpl(`${YAHOO.apiBase}${path}?format=json`, {
        headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' }, signal: ac.signal,
      });
      const text = await r.text();
      rec.status = r.status;
      let json = null;
      try { json = JSON.parse(text); } catch { /* handled below */ }
      if (r.ok && json) { rec.ok = true; rec.data = json; }
      else rec.error = json?.error?.description || `HTTP ${r.status}`;
    } catch (e) {
      rec.error = e?.name === 'AbortError' ? 'Timed out' : String(e?.message || e);
    } finally { clearTimeout(timer); }
  }
  ctx.log.push({ label, ok: rec.ok, status: rec.status, error: rec.error });
  return rec;
}

async function mapPool(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

export async function fetchLeagueList(ctx) {
  const all = await yahooGet(ctx, 'Your leagues', '/users;use_login=1/games/leagues');
  let leagues = parseLeagueList(all.data);
  if (leagues.length === 0) {
    // The one-call form can fail on an account with an unsupported game; ask
    // game by game so one bad game can't hide every league.
    const games = await yahooGet(ctx, 'Your games', '/users;use_login=1/games');
    const keys = [...new Set(collectByKey(games.data, 'game_key').map(g => String(g.game_key)))];
    const per = await mapPool(keys, 5, k => yahooGet(ctx, `Leagues in game ${k}`, `/users;use_login=1/games;game_keys=${k}/leagues`));
    leagues = parseLeagueList(games.data, ...per.map(r => r.data));
  }
  return leagues;
}

// Everything one import needs from one Yahoo league, already normalised.
export async function fetchImportBundle(ctx, leagueKey, { date } = {}) {
  const L = `/league/${leagueKey}`;
  const gameKey = leagueKey.split('.')[0];
  const [metadata, settings, standings, teams, draft, trades, gameWeeks, finalRosters] = await Promise.all([
    yahooGet(ctx, 'League details', `${L}/metadata`),
    yahooGet(ctx, 'League settings', `${L}/settings`),
    yahooGet(ctx, 'Standings', `${L}/standings`),
    yahooGet(ctx, 'Teams', `${L}/teams`),
    yahooGet(ctx, 'Draft results', `${L}/draftresults`),
    yahooGet(ctx, 'Trades', `${L}/transactions;type=trade`),
    yahooGet(ctx, 'Season weeks', `/game/${gameKey}/game_weeks`),
    yahooGet(ctx, 'Rosters (end of season)', `${L}/teams/roster`),
  ]);

  const meta = collectByKey(metadata.data, 'league_key')[0] || {};
  const set = collectByKey(settings.data, 'draft_type')[0] || {};
  const season = regularSeasonEnd({ metadata: metadata.data, settings: settings.data, gameWeeks: gameWeeks.data });
  const cutoff = (isDate(date) && date) || season.date;
  const today = new Date(ctx.now()).toISOString().slice(0, 10);
  // A cutoff that hasn't happened yet has no roster of its own — Yahoo answers
  // with today's — so say so rather than label today's roster with a future date.
  const cutoffInFuture = !!cutoff && cutoff > today;
  const cutoffRosters = cutoff && !cutoffInFuture
    ? await yahooGet(ctx, `Rosters (${cutoff})`, `${L}/teams/roster;date=${cutoff}`)
    : null;

  const rostersFinal = parseRosters(finalRosters.data);
  const rostersCutoff = cutoffRosters?.ok ? parseRosters(cutoffRosters.data) : null;
  const picks = parseDraft(draft.data);

  // Draft results carry player KEYS only. Most are on a roster we already
  // hold; look the rest up 25 at a time (Yahoo's cap per call).
  const known = new Map();
  for (const set_ of [rostersFinal, rostersCutoff || {}]) for (const list of Object.values(set_)) for (const p of list) known.set(p.playerKey, p);
  const missing = [...new Set(picks.map(p => p.playerKey).filter(k => k && !known.has(k)))];
  const chunks = [];
  for (let i = 0; i < missing.length; i += 25) chunks.push(missing.slice(i, i + 25));
  const looked = await mapPool(chunks, 4, (c, i) => yahooGet(ctx, `Drafted players (${i + 1}/${chunks.length})`, `${L}/players;player_keys=${c.join(',')}`));
  for (const r of looked) for (const p of parsePlayers(r.data)) known.set(p.playerKey, p);

  const strip = p => ({ yahooPlayerId: p.yahooPlayerId, name: p.name, proTeam: p.proTeam, positions: p.positions, primaryPosition: p.primaryPosition });
  const stripAll = set_ => Object.fromEntries(Object.entries(set_ || {}).map(([k, list]) => [k, list.map(strip)]));

  return {
    league: {
      leagueKey, name: meta.name ?? null, season: String(meta.season ?? ''), gameCode: meta.game_code ?? null,
      numTeams: num(meta.num_teams), isFinished: String(meta.is_finished ?? '') === '1',
      isAuction: String(set.is_auction_draft ?? '') === '1',
      endDate: meta.end_date ?? null, regularSeasonEndDate: season.date, playoffStartWeek: season.playoffStartWeek,
      previousLeagueKey: renewToLeagueKey(meta.renew), nextLeagueKey: renewToLeagueKey(meta.renewed),
    },
    teams: parseTeams(teams.data),
    standings: parseStandings(standings.data),
    rosters: {
      cutoffDate: rostersCutoff ? cutoff : null,
      cutoffInFuture,
      cutoff: rostersCutoff ? stripAll(rostersCutoff) : null,
      final: stripAll(rostersFinal),
    },
    draft: picks.map(p => {
      const pl = known.get(p.playerKey);
      return { pick: p.pick, round: p.round, cost: p.cost, teamKey: p.teamKey, ...(pl ? strip(pl) : { yahooPlayerId: null, name: null, proTeam: null, positions: [], primaryPosition: null }) };
    }),
    pickTrades: parsePickTrades(trades.data),
    problems: ctx.log.filter(f => !f.ok).map(f => `${f.label}: ${f.error}`),
  };
}

// ── handlers ──────────────────────────────────────────────────────────────

const hostOf = req => String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
const hostOfUrl = u => { try { return new URL(u).host.toLowerCase(); } catch { return ''; } };
const readConfig = env => ({
  clientId: env.YAHOO_CLIENT_ID || '', clientSecret: env.YAHOO_CLIENT_SECRET || '',
  redirectUri: env.YAHOO_REDIRECT_URI || DEFAULT_REDIRECT_URI,
});
const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
const queryOf = req => req.query || Object.fromEntries(new URL(req.url, 'https://x').searchParams);

// POST → verify the signed-in commissioner, issue state, return Yahoo's URL.
// DELETE → forget the Yahoo session in this browser.
export function createStartHandler({ verifyUser, env = process.env, now = () => Date.now() }) {
  return async function start(req, res) {
    const cfg = readConfig(env);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!cfg.clientId || !cfg.clientSecret) return res.status(501).json({ error: 'Yahoo import is not set up on this deployment (missing Yahoo credentials).' });

    const user = bearer(req) ? await verifyUser(bearer(req)) : null;
    if (!user?.id) return res.status(401).json({ error: 'Sign in to KeeperHQ first.' });

    const redirectHost = hostOfUrl(cfg.redirectUri);
    if (hostOf(req) !== redirectHost) {
      return res.status(409).json({ error: `Yahoo import only works on ${redirectHost}. Open this league there and try again.` });
    }
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const returnTo = RETURN_TO.test(String(body.returnTo || '')) ? body.returnTo : null;
    if (!returnTo) return res.status(400).json({ error: 'Start the Yahoo import from a league\'s Import page.' });

    const payload = { nonce: crypto.randomBytes(24).toString('base64url'), exp: now() + STATE_TTL_MS, uid: user.id, returnTo };
    res.setHeader('Set-Cookie', cookie(STATE_COOKIE, signState(payload, cfg.clientSecret), Math.floor(STATE_TTL_MS / 1000)));
    return res.status(200).json({ authorizeUrl: buildAuthorizeUrl({ clientId: cfg.clientId, redirectUri: cfg.redirectUri, state: payload.nonce }) });
  };
}

// Yahoo sends the browser here. On success the access token goes into the
// encrypted session cookie and the browser returns to the Import page.
export function createCallbackHandler({ fetchImpl = fetch, env = process.env, now = () => Date.now() }) {
  return async function callback(req, res) {
    const cfg = readConfig(env);
    const query = queryOf(req);
    const cookies = [cookie(STATE_COOKIE, '', 0)];
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const back = (to, params) => {
      res.setHeader('Set-Cookie', cookies);
      res.setHeader('Location', `${to}?${new URLSearchParams(params)}`);
      return res.status(302).end();
    };

    const state = cfg.clientSecret
      ? verifyState({ cookie: parseCookies(req.headers.cookie)[STATE_COOKIE], stateParam: query.state, secret: cfg.clientSecret, now: now() })
      : { ok: false, reason: 'Yahoo import is not set up on this deployment.' };
    // Without a valid state we don't know which page started this, so the
    // only safe place to land is home.
    if (!state.ok) return back('/', { yahoo: 'error', msg: state.reason });
    const { returnTo, uid } = state.payload;

    if (query.error || !query.code) {
      const why = query.error === 'access_denied' ? 'You declined access on Yahoo.' : `Yahoo returned an error (${query.error || 'no code'}${query.error_description ? `: ${query.error_description}` : ''}).`;
      return back(returnTo, { yahoo: 'error', msg: why });
    }
    const tok = await exchangeCode({ code: query.code, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri, fetchImpl });
    if (!tok.ok) return back(returnTo, { yahoo: 'error', msg: tok.error });

    const life = Math.max(60, Math.min(SESSION_MAX_S, tok.expiresIn - 120));
    cookies.push(cookie(SESSION_COOKIE, sealSession({ t: tok.accessToken, uid, exp: now() + life * 1000 }, cfg.clientSecret), life));
    return back(returnTo, { yahoo: 'connected' });
  };
}

// GET ?resource=leagues            → the account's leagues
// GET ?resource=import&league_key= → the import bundle for one league
// One function for both keeps the deployment's function count down.
export function createDataHandler({ verifyUser, fetchImpl = fetch, env = process.env, now = () => Date.now() }) {
  return async function data(req, res) {
    const cfg = readConfig(env);
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    if (!cfg.clientId || !cfg.clientSecret) return res.status(501).json({ error: 'Yahoo import is not set up on this deployment (missing Yahoo credentials).' });

    const user = bearer(req) ? await verifyUser(bearer(req)) : null;
    if (!user?.id) return res.status(401).json({ error: 'Sign in to KeeperHQ first.' });
    const session = openSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], cfg.clientSecret, now());
    // The Yahoo session belongs to the KeeperHQ user who created it.
    if (!session || session.uid !== user.id) return res.status(401).json({ error: 'Connect Yahoo to continue.', needsConnect: true });

    const query = queryOf(req);
    const ctx = { token: session.t, fetchImpl, deadline: now() + RUN_BUDGET_MS, log: [], now };
    const expired = () => ctx.log.some(f => f.status === 401);
    try {
      if (query.resource === 'leagues') {
        const leagues = await fetchLeagueList(ctx);
        if (leagues.length === 0 && expired()) return res.status(401).json({ error: 'Your Yahoo connection expired. Connect again.', needsConnect: true });
        return res.status(200).json({ leagues, problems: ctx.log.filter(f => !f.ok).map(f => `${f.label}: ${f.error}`) });
      }
      if (query.resource === 'import') {
        if (!isLeagueKey(query.league_key)) return res.status(400).json({ error: 'Pick a Yahoo league first.' });
        const bundle = await fetchImportBundle(ctx, String(query.league_key), { date: query.date });
        if (bundle.teams.length === 0) {
          if (expired()) return res.status(401).json({ error: 'Your Yahoo connection expired. Connect again.', needsConnect: true });
          return res.status(502).json({ error: `Yahoo did not return this league's teams. ${bundle.problems.join(' · ')}` });
        }
        return res.status(200).json(bundle);
      }
      return res.status(400).json({ error: 'Unknown request.' });
    } catch (e) {
      return res.status(500).json({ error: `The Yahoo import failed: ${e?.message || e}` });
    }
  };
}
