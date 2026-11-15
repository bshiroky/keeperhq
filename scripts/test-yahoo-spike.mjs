// Yahoo discovery spike — runs the whole OAuth + dump flow against a FAKE
// Yahoo (this container can't reach the real one). Plain node: `npm run
// test:yahoo-spike`. The fake's JSON only approximates Yahoo's shape — these
// tests prove the flow's own guarantees (state checked, secrets never in the
// output, one failed resource doesn't sink the run), not Yahoo's behaviour.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  YAHOO, STATE_COOKIE, signState, verifyState, parseCookies, buildAuthorizeUrl, renewToLeagueKey,
  leagueIndexFrom, redactEmails, createStartHandler, createCallbackHandler,
} from '../server/yahooSpike.js';
import { digestDump, digestValue } from '../src/lib/yahooSpikeDigest.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.stack || e.message}`); process.exitCode = 1; }
}

const SECRET = 'super-secret-client-secret-value';
const ACCESS = 'ACCESS-TOKEN-abcdefghijklmnop';
const REFRESH = 'REFRESH-TOKEN-qrstuvwxyz123456';
const CODE = 'auth-code-9f8e7d6c5b';
const env = { YAHOO_CLIENT_ID: 'client-id-123', YAHOO_CLIENT_SECRET: SECRET };
const HOST = 'keeperhq.app';

function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; return res; };
  res.send = b => { res.body = b; return res; };
  return res;
}
const decode = html => JSON.parse(zlib.gunzipSync(Buffer.from(/<script id="payload" type="text\/plain">([^<]+)</.exec(html)[1], 'base64')).toString('utf8'));

// ── a fake Yahoo ──────────────────────────────────────────────────────────
const col = items => ({ ...Object.fromEntries(items.map((v, i) => [String(i), v])), count: items.length });
const leagueMeta = (key, name, season, renew) => ({ league_key: key, league_id: key.split('.')[2], name, season, game_code: 'nhl', num_teams: 2, renew, renewed: '', end_week: '25', is_finished: 1 });
const LEAGUES = {
  '465.l.100': leagueMeta('465.l.100', 'Disney on Ice', '2026', '453_200'),
  '453.l.200': leagueMeta('453.l.200', 'Disney on Ice', '2025', '427_300'),
  '427.l.300': leagueMeta('427.l.300', 'Disney on Ice', '2024', ''),
};
const player = (id, name) => ({ player: [[{ player_key: `465.p.${id}` }, { player_id: String(id) }, { name: { full: name } }, { editorial_team_abbr: 'TOR' }, { display_position: 'C' }], { selected_position: [{ coverage_type: 'date', date: '2026-03-01' }, { position: 'C' }] }] });
const rosterOf = ids => ({ fantasy_content: { team: [[{ team_key: 'x' }], { roster: { coverage_type: 'date', date: '2026-03-01', '0': { players: col(ids.map(i => player(i, `Player ${i}`))) } } }] } });

function makeYahoo({ tokenStatus = 200, failPaths = [] } = {}) {
  const calls = [];
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === YAHOO.tokenUrl) {
      if (tokenStatus !== 200) return json(tokenStatus, { error: 'invalid_grant', error_description: 'OAuth authorization code expired or invalid' });
      return json(200, { access_token: ACCESS, refresh_token: REFRESH, token_type: 'bearer', expires_in: 3600, xoauth_yahoo_guid: 'GUID' });
    }
    assert.ok(url.startsWith(YAHOO.apiBase), `unexpected host: ${url}`);
    assert.equal(init.headers.Authorization, `Bearer ${ACCESS}`);
    const path = url.slice(YAHOO.apiBase.length).replace('?format=json', '');
    if (failPaths.some(f => path.includes(f))) return json(400, { error: { description: `Invalid collection resource requested: ${path}` } });
    const lk = /^\/league\/([\d.l]+)/.exec(path)?.[1];
    const meta = LEAGUES[lk];
    if (path === '/users;use_login=1/games') return json(200, { fantasy_content: { users: col([{ user: [{ guid: 'GUID' }, { games: col([{ game: [{ game_key: '465', code: 'nhl', season: '2026' }] }]) }] }]) } });
    if (path === '/users;use_login=1/games/leagues') return json(200, { fantasy_content: { users: col([{ user: [{ guid: 'GUID' }, { games: col([{ game: [{ game_key: '465', code: 'nhl', season: '2026' }, { leagues: col(Object.values(LEAGUES).map(l => ({ league: [l] }))) }] }]) }] }]) } });
    if (path.startsWith('/game/')) return json(200, { fantasy_content: { game: [{ game_key: '465' }, { game_weeks: col([{ game_week: { week: '22', start: '2026-03-09', end: '2026-03-15' } }, { game_week: { week: '23', start: '2026-03-16', end: '2026-03-22' } }]) }] } });
    if (path.includes('/roster')) return json(200, rosterOf(path.includes(';') ? [1, 2, 3] : [1, 2, 4]));
    if (path.includes('/matchups')) return json(200, { fantasy_content: { team: [[], { matchups: col([{ matchup: { week: '22', week_end: '2026-03-15', is_playoffs: '0' } }, { matchup: { week: '23', week_end: '2026-03-22', is_playoffs: '1' } }]) }] } });
    if (!meta) return json(404, { error: { description: 'League not found' } });
    const wrap = extra => json(200, { fantasy_content: { league: [meta, extra] } });
    if (path.endsWith('/metadata')) return json(200, { fantasy_content: { league: [meta] } });
    if (path.endsWith('/settings')) return wrap({ settings: [{ draft_type: 'live', is_auction_draft: '0', playoff_start_week: '23' }] });
    if (path.endsWith('/standings')) return wrap({ standings: [{ teams: col([{ team: [[{ team_key: `${lk}.t.1` }], { team_standings: { rank: 1 } }] }]) }] });
    if (path.endsWith('/teams')) return wrap({ teams: col([1, 2].map(n => ({ team: [[{ team_key: `${lk}.t.${n}` }, { name: `Team ${n}` }, { managers: [{ manager: { manager_id: String(n), nickname: `GM${n}`, guid: `G${n}`, email: `gm${n}@example.com` } }] }]] }))) });
    if (path.includes('/transactions')) return wrap({ transactions: col([
      { transaction: [{ transaction_key: `${lk}.tr.1`, type: 'add/drop', timestamp: '1773500000' }, { players: col([player(1, 'A')]) }] },
      { transaction: [{ transaction_key: `${lk}.tr.2`, type: 'trade', timestamp: '1770000000', picks: [{ pick: { source_team_key: `${lk}.t.1`, destination_team_key: `${lk}.t.2`, round: '2' } }] }] },
      { transaction: [{ transaction_key: `${lk}.tr.3`, type: 'add', timestamp: '1760000000' }] },
    ]) });
    if (path.endsWith('/draftresults')) return wrap({ draft_results: col([1, 2, 3, 4].map(n => ({ draft_result: { pick: n, round: Math.ceil(n / 2), team_key: `${lk}.t.${2 - (n % 2)}`, player_key: `465.p.${n}` } }))) });
    if (path.includes('/players')) return wrap({ players: col([player(1, 'A'), player(2, 'B'), player(3, 'C')]) });
    return json(400, { error: { description: `Invalid collection resource requested: ${path}` } });
  };
  return { fetchImpl, calls };
}

// Runs start → callback like a browser would, carrying the state cookie over.
async function runFlow({ body = {}, yahoo = makeYahoo(), query, tamperState } = {}) {
  const start = createStartHandler({ verifyUser: async t => (t === 'good-session' ? { id: 'user-1' } : null), env });
  const sres = fakeRes();
  await start({ method: 'POST', headers: { host: HOST, authorization: 'Bearer good-session' }, body }, sres);
  assert.equal(sres.statusCode, 200, JSON.stringify(sres.body));
  const state = new URL(sres.body.authorizeUrl).searchParams.get('state');
  const cookie = sres.headers['set-cookie'].split(';')[0];
  const callback = createCallbackHandler({ fetchImpl: yahoo.fetchImpl, env });
  const cres = fakeRes();
  await callback({ method: 'GET', headers: { host: HOST, cookie }, query: query || { code: CODE, state: tamperState || state } }, cres);
  return { start: sres, res: cres, dump: decode(cres.body), html: cres.body, yahoo };
}
const noSecrets = text => { for (const s of [SECRET, ACCESS, REFRESH, CODE]) assert.ok(!text.includes(s), `output leaked ${s.slice(0, 8)}…`); };
const failedStep = dump => dump.steps.find(s => !s.ok);

await test('state: round trip, tamper, expiry, mismatch, missing cookie', () => {
  const payload = { nonce: 'n1', exp: Date.now() + 1000 };
  const cookie = signState(payload, SECRET);
  assert.equal(verifyState({ cookie, stateParam: 'n1', secret: SECRET }).ok, true);
  assert.match(verifyState({ cookie, stateParam: 'other', secret: SECRET }).reason, /mismatch/i);
  assert.match(verifyState({ cookie: `${cookie}x`, stateParam: 'n1', secret: SECRET }).reason, /signature/i);
  assert.match(verifyState({ cookie, stateParam: 'n1', secret: 'different-secret' }).reason, /signature/i);
  assert.match(verifyState({ cookie, stateParam: 'n1', secret: SECRET, now: Date.now() + 5000 }).reason, /expired/i);
  assert.match(verifyState({ cookie: undefined, stateParam: 'n1', secret: SECRET }).reason, /No state cookie/);
  assert.match(verifyState({ cookie, stateParam: undefined, secret: SECRET }).reason, /did not send a state/);
  // A forged payload re-signed without the secret is rejected.
  const forged = `${Buffer.from(JSON.stringify({ nonce: 'n1', exp: Date.now() + 9e9 })).toString('base64url')}.${cookie.split('.')[1]}`;
  assert.equal(verifyState({ cookie: forged, stateParam: 'n1', secret: SECRET }).ok, false);
});

await test('helpers: authorize URL, renew key, cookies, email redaction', () => {
  const u = new URL(buildAuthorizeUrl({ clientId: 'cid', redirectUri: 'https://keeperhq.app/api/yahoo/callback', state: 's' }));
  assert.equal(`${u.origin}${u.pathname}`, YAHOO.authorizeUrl);
  assert.deepEqual([u.searchParams.get('response_type'), u.searchParams.get('scope'), u.searchParams.get('state')], ['code', 'fspt-r', 's']);
  assert.equal(new URL(buildAuthorizeUrl({ clientId: 'c', redirectUri: 'r', state: 's', sendScope: false })).searchParams.has('scope'), false);
  assert.equal(renewToLeagueKey('453_200'), '453.l.200');
  assert.equal(renewToLeagueKey(''), null);
  assert.equal(parseCookies(`a=1; ${STATE_COOKIE}=abc.def`)[STATE_COOKIE], 'abc.def');
  assert.match(redactEmails({ a: [{ manager: { email: 'x@y.com', nickname: 'N' } }] }).a[0].manager.email, /redacted/);
  assert.equal(leagueIndexFrom({ x: [{ league_key: '465.l.100', name: 'A', renew: '453_200' }] })[0].previous_league_key, '453.l.200');
});

await test('start: GET reports config as booleans only', async () => {
  const start = createStartHandler({ verifyUser: async () => null, env });
  const res = fakeRes();
  await start({ method: 'GET', headers: { host: HOST } }, res);
  assert.deepEqual(res.body.configured, { YAHOO_CLIENT_ID: true, YAHOO_CLIENT_SECRET: true });
  assert.equal(res.body.hostMatchesRedirect, true);
  noSecrets(JSON.stringify(res.body));
  assert.ok(!JSON.stringify(res.body).includes(env.YAHOO_CLIENT_ID));
});

await test('start: refuses without a session, off-domain, or unconfigured', async () => {
  const verifyUser = async t => (t === 'good-session' ? { id: 'u' } : null);
  const run = async (headers, e = env) => { const r = fakeRes(); await createStartHandler({ verifyUser, env: e })({ method: 'POST', headers, body: {} }, r); return r; };
  const anon = await run({ host: HOST });
  assert.equal(anon.statusCode, 401);
  assert.equal(anon.headers['set-cookie'], undefined);
  assert.equal((await run({ host: HOST, authorization: 'Bearer forged' })).statusCode, 401);
  const preview = await run({ host: 'keeperhq-git-x.vercel.app', authorization: 'Bearer good-session' });
  assert.equal(preview.statusCode, 409);
  assert.match(preview.body.steps.at(-1).detail, /keeperhq\.app/);
  assert.equal((await run({ host: HOST, authorization: 'Bearer good-session' }, {})).statusCode, 501);
});

await test('start: issues an HttpOnly state cookie and never exposes the secret', async () => {
  const { start } = await runFlow();
  assert.match(start.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
  const u = new URL(start.body.authorizeUrl);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://keeperhq.app/api/yahoo/callback');
  assert.equal(u.searchParams.get('client_id'), env.YAHOO_CLIENT_ID);
  noSecrets(JSON.stringify(start.body) + start.headers['set-cookie']);
  assert.ok(start.body.steps.every(s => s.ok));
});

await test('pass 1: lists leagues with the renew link, leaks nothing', async () => {
  const { dump, html, yahoo, res } = await runFlow();
  assert.equal(dump.mode, 'leagues');
  assert.equal(dump.account.leagueIndex.length, 3);
  assert.equal(dump.account.leagueIndex[0].previous_league_key, '453.l.200');
  assert.ok(dump.steps.every(s => s.ok), JSON.stringify(failedStep(dump)));
  noSecrets(html); noSecrets(JSON.stringify(dump));
  assert.deepEqual(dump.token, { token_type: 'bearer', expires_in_seconds: 3600, access_token_received: true, refresh_token_received: true, refresh_token_kept: false, other_fields_present: ['xoauth_yahoo_guid'] });
  // Token request: Basic auth, form body, the registered redirect URI.
  const tok = yahoo.calls[0];
  assert.equal(tok.init.headers.Authorization, `Basic ${Buffer.from(`${env.YAHOO_CLIENT_ID}:${SECRET}`).toString('base64')}`);
  assert.match(tok.init.body, /grant_type=authorization_code/);
  assert.match(tok.init.body, /redirect_uri=https%3A%2F%2Fkeeperhq\.app%2Fapi%2Fyahoo%2Fcallback/);
  assert.match(res.headers['set-cookie'], /Max-Age=0/);   // state is single-use
  assert.equal(res.headers['cache-control'], 'no-store');
});

await test('pass 2: full league dump, renew chain, previous season', async () => {
  const { dump, html } = await runFlow({ body: { leagueKey: '465.l.100' } });
  assert.equal(dump.mode, 'league');
  const d = dump.league.derived;
  assert.equal(d.regular_season_end.last_regular_season_week, 22);
  assert.equal(d.regular_season_end.date_used, '2026-03-15');
  assert.equal(d.regular_season_end.date_from_matchups, '2026-03-15');
  assert.deepEqual(d.team_keys, ['465.l.100.t.1', '465.l.100.t.2']);
  assert.equal(Object.keys(dump.league.rosters.asOfDate).length, 2);
  assert.equal(Object.keys(dump.league.rosters.asOfWeek).length, 2);
  assert.match(dump.fetchLog.find(f => f.label.includes('asOfDate')).path, /roster;date=2026-03-15$/);
  // The as-of roster differs from current — the tell that the date was honoured.
  assert.deepEqual([d.rosters[0].team_name, d.rosters[0].asOfDate.on_this_roster_not_current, d.rosters[0].asOfDate.on_current_not_this_roster], ['Team 1', 1, 1]);
  assert.deepEqual(d.transactions.by_type, { 'add/drop': 1, trade: 1, add: 1 });
  assert.equal(d.transactions.including_draft_picks, 1);
  assert.ok(d.transactions.samples.trade_with_picks);
  assert.deepEqual([d.draft.picks, d.draft.with_round, d.draft.with_cost], [4, 4, 0]);
  assert.deepEqual(dump.renewChain.map(c => c.league_key), ['453.l.200', '427.l.300']);
  assert.equal(dump.previousLeague.leagueKey, '453.l.200');
  assert.ok(html.includes('sessionStorage.setItem'));
  assert.ok(!JSON.stringify(dump).includes('@example.com'), 'manager emails must be redacted');
  noSecrets(html);
});

await test('pass 2: a failing resource is recorded and the run carries on', async () => {
  const yahoo = makeYahoo({ failPaths: ['/draft_picks', '/standings', '.t.2/roster;date'] });
  const { dump } = await runFlow({ body: { leagueKey: '465.l.100', includePrev: false }, yahoo });
  assert.equal(dump.ok, true);
  assert.equal(dump.previousLeague, null);
  const r = dump.league.resources;
  assert.equal(r.standings.ok, false);
  assert.match(r.standings.error.message, /Invalid collection resource/);
  assert.equal(r.probeLeagueDraftPicks.ok, false);
  assert.equal(r.transactions.ok, true);
  assert.match(dump.league.derived.traded_pick_probes['league/draft_picks'], /Invalid collection/);
  assert.equal(dump.league.rosters.asOfDate['465.l.100.t.2'].ok, false);
  assert.equal(dump.league.rosters.asOfDate['465.l.100.t.1'].ok, true);
  assert.ok(dump.league.derived.rosters[1].asOfDate.error);
  assert.ok(dump.fetchLog.filter(f => !f.ok).length >= 4);
});

await test('pass 2: an as-of date from the page overrides the derived one', async () => {
  const { dump } = await runFlow({ body: { leagueKey: '465.l.100', includePrev: false, asOf: '2026-02-01' } });
  assert.equal(dump.league.derived.regular_season_end.date_source, 'page override');
  assert.ok(dump.fetchLog.some(f => f.path.endsWith('roster;date=2026-02-01')));
});

await test('callback: a state mismatch stops before any Yahoo call', async () => {
  const { dump, yahoo } = await runFlow({ tamperState: 'attacker-state' });
  assert.equal(yahoo.calls.length, 0);
  assert.equal(dump.mode, 'error');
  assert.match(failedStep(dump).detail, /mismatch/i);
});

await test('callback: no cookie at all (started elsewhere) is explained', async () => {
  const yahoo = makeYahoo();
  const res = fakeRes();
  await createCallbackHandler({ fetchImpl: yahoo.fetchImpl, env })({ method: 'GET', headers: { host: HOST }, query: { code: CODE, state: 'x' } }, res);
  assert.equal(yahoo.calls.length, 0);
  assert.match(failedStep(decode(res.body)).detail, /same domain/);
  noSecrets(res.body);
});

await test('callback: Yahoo-side errors are shown, in Yahoo\'s words', async () => {
  const denied = await runFlow({ query: { error: 'access_denied', error_description: 'User denied access' } });
  assert.match(denied.dump.steps[0].detail, /access_denied — User denied access/);
  assert.equal(denied.yahoo.calls.length, 0);
  const bad = await runFlow({ yahoo: makeYahoo({ tokenStatus: 401 }) });
  assert.match(failedStep(bad.dump).detail, /HTTP 401.*invalid_grant.*expired or invalid/);
  assert.equal(bad.yahoo.calls.length, 1);
  noSecrets(bad.html);
});

await test('digest: trims collections, keeps shapes and summaries whole', async () => {
  assert.deepEqual(digestValue({ 0: 'a', 1: 'b', 2: 'c', 3: 'd', count: 4 }), { 0: 'a', 1: 'b', count: 4, __digest: '2 more of 4 omitted' });
  assert.equal(digestValue([1, 2, 3, 4, 5]).length, 3);
  assert.deepEqual(digestValue({ 0: 'only', name: 'x', other: 1 }), { 0: 'only', name: 'x', other: 1 });
  const { dump } = await runFlow({ body: { leagueKey: '465.l.100' } });
  const dg = digestDump(dump);
  assert.deepEqual(dg.steps, dump.steps);
  assert.deepEqual(dg.league.derived, dump.league.derived);
  assert.deepEqual(dg.fetchLog, dump.fetchLog);
  assert.ok(JSON.stringify(dg).length < JSON.stringify(dump).length);
  assert.match(JSON.stringify(dg.league.resources.transactions.data), /1 more of 3 omitted/);
});

console.log(`\n${passed} passed`);
