// Yahoo import — the server flow against a FAKE Yahoo, and the pure import
// logic. Plain node: `npm run test:yahoo`. The fake's JSON follows the shapes
// the discovery spike recorded from two real leagues (collections keyed
// "0","1",…; entity fields as arrays of single-key objects), with made-up names.
import assert from 'node:assert/strict';
import {
  YAHOO, STATE_COOKIE, SESSION_COOKIE, signState, verifyState, sealSession, openSession, parseCookies,
  renewToLeagueKey, parseLeagueList, regularSeasonEnd,
  createStartHandler, createCallbackHandler, createDataHandler,
} from '../server/yahoo.js';
import {
  sectionsFor, initialMapping, mappingInOrder, mappingProblems, lateAdditions, resolvedPickOwners,
  yahooImportImpact, applyYahooImport, seasonLabel, isSeasonOver, defaultYahooLeague,
  directoryResolver, playerFields, directoryMatchSummary, eligibilityNote,
} from '../src/lib/yahooImport.js';
import { sortTeamsByName } from '../src/lib/teamOrder.js';
import { positionsList, formatPositions, leaguePositionIndex } from '../src/lib/players.js';
import { pickOwnerId } from '../src/lib/draftPicks.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS - ${name}`); }
  catch (e) { console.error(`FAIL - ${name}\n  ${e.stack || e.message}`); process.exitCode = 1; }
}

const SECRET = 'super-secret-client-secret-value';
const ACCESS = 'ACCESS-TOKEN-abcdefghijklmnop';
const REFRESH = 'REFRESH-TOKEN-qrstuvwxyz123456';
const env = { YAHOO_CLIENT_ID: 'client-id-123', YAHOO_CLIENT_SECRET: SECRET };
const HOST = 'keeperhq.app';
const LK = '465.l.100';
const verifyUser = async t => (t === 'sess-1' ? { id: 'user-1' } : t === 'sess-2' ? { id: 'user-2' } : null);

function fakeRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

// ── a fake Yahoo in the real shapes ───────────────────────────────────────
const col = list => ({ ...Object.fromEntries(list.map((v, i) => [String(i), v])), count: list.length });
const TEAMS = [['t.1', 'Puck Dynasty', 'Ben'], ['t.2', 'Ice Cold', 'Mack'], ['t.3', 'Slap Shots', 'Corey']];
const player = (id, name, pos = 'C') => ({ player: [[{ player_key: `465.p.${id}` }, { player_id: String(id) }, { name: { full: name } }, { editorial_team_abbr: 'TOR' }, { display_position: pos }, [], { primary_position: pos.split(',')[0] }], { selected_position: [{ coverage_type: 'date' }, { position: 'BN' }] }] });
const teamHead = ([id, name, mgr]) => [{ team_key: `${LK}.${id}` }, { team_id: id.slice(2) }, { name }, [], { managers: [{ manager: { manager_id: '1', nickname: mgr, guid: '--hidden--', email: 'x@example.com' } }] }];
const ROSTERS = {
  cutoff: { 't.1': [[1, 'Alpha One'], [2, 'Alpha Two']], 't.2': [[3, 'Beta One'], [4, 'Beta Two']], 't.3': [[5, 'Gamma One']] },
  final: { 't.1': [[1, 'Alpha One'], [9, 'Playoff Pickup']], 't.2': [[3, 'Beta One'], [4, 'Beta Two']], 't.3': [[5, 'Gamma One']] },
};
const rosterResp = which => ({ fantasy_content: { league: [{ league_key: LK }, { teams: col(TEAMS.map(t => ({ team: [teamHead(t), { roster: { coverage_type: 'date', '0': { players: col(ROSTERS[which][t[0]].map(([id, n]) => player(id, n))) } } }] }))) }] } });
const meta = { league_key: LK, name: 'Test League', season: '2025', game_code: 'nhl', num_teams: 3, renew: '453_200', renewed: '477_300', end_week: '24', end_date: '2026-04-16', is_finished: 1 };

function makeYahoo({ auction = false, tokenStatus = 200, apiStatus = 200, fail = [], newestGame = '465', newestPositions = {} } = {}) {
  const calls = [];
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === YAHOO.tokenUrl) {
      return tokenStatus === 200
        ? json(200, { access_token: ACCESS, refresh_token: REFRESH, token_type: 'bearer', expires_in: 3600 })
        : json(tokenStatus, { error: 'invalid_grant', error_description: 'code expired' });
    }
    assert.equal(init.headers.Authorization, `Bearer ${ACCESS}`);
    if (apiStatus !== 200) return json(apiStatus, { error: { description: 'token_expired' } });
    const path = url.slice(YAHOO.apiBase.length).replace('?format=json', '');
    if (fail.some(f => path.includes(f))) return json(400, { error: { description: 'Invalid resource' } });
    const wrap = extra => json(200, { fantasy_content: { league: [meta, extra] } });
    if (path === '/users;use_login=1/games/leagues') return json(200, { fantasy_content: { users: col([{ user: [{ guid: 'G' }, { games: col([{ game: [{ game_key: '465', code: 'nhl', season: '2025' }, { leagues: col([{ league: [meta] }]) }] }, { game: [{ game_key: '466', code: 'nba', season: '2025' }, { leagues: col([{ league: [{ league_key: '466.l.9', name: 'Hoops', season: '2025', num_teams: 12 }] }]) }] }]) }] }]) } });
    if (path === '/game/nhl') return json(200, { fantasy_content: { game: [{ game_key: newestGame, code: 'nhl', season: newestGame === '465' ? '2025' : '2026' }] } });
    if (path.startsWith(`/game/${newestGame}/players;player_keys=`)) {
      const ids = path.split('player_keys=')[1].split(',').map(k => k.split('.p.')[1]);
      return json(200, { fantasy_content: { game: [{ game_key: newestGame }, { players: col(ids.filter(id => newestPositions[id]).map(id => player(id, `Player ${id}`, newestPositions[id]))) }] } });
    }
    if (path.startsWith('/game/')) return json(200, { fantasy_content: { game: [{ game_key: '465' }, { game_weeks: col([{ game_week: { week: '21', start: '2026-03-16', end: '2026-03-22' } }, { game_week: { week: '22', start: '2026-03-23', end: '2026-03-29' } }]) }] } });
    if (path.endsWith('/metadata')) return json(200, { fantasy_content: { league: [meta] } });
    if (path.endsWith('/settings')) return wrap({ settings: [{ draft_type: 'live', is_auction_draft: auction ? '1' : '0', playoff_start_week: '22' }] });
    if (path.endsWith('/standings')) return wrap({ standings: [{ teams: col(TEAMS.map((t, i) => ({ team: [teamHead(t), { team_stats: {}, team_points: { total: String(300 - i * 10) } }, { team_standings: { rank: i + 1, ...(i < 2 ? { playoff_seed: String(i + 1) } : {}), outcome_totals: { wins: String(100 - i), losses: '50', ties: '4', percentage: '.640' } } }] }))) }] });
    if (path.endsWith('/teams')) return wrap({ teams: col(TEAMS.map(t => ({ team: [teamHead(t)] }))) });
    if (path.endsWith('/teams/roster')) return json(200, rosterResp('final'));
    if (path.includes('/teams/roster;date=')) return json(200, rosterResp('cutoff'));
    if (path.endsWith('/draftresults')) return wrap({ draft_results: col([[1, 1, 't.1', 1, 40], [2, 1, 't.2', 3, 30], [3, 2, 't.2', 77, 5], [4, 2, 't.1', 2, 12]].map(([pick, round, t, id, cost]) => ({ draft_result: { pick, round, ...(auction ? { cost } : {}), team_key: `${LK}.${t}`, player_key: `465.p.${id}` } }))) });
    if (path.includes('/players;player_keys=')) return wrap({ players: col([player(77, 'Dropped Guy', 'LW,RW')]) });
    if (path.includes('/transactions;type=trade')) return wrap({ transactions: col([
      { transaction: [{ transaction_key: 'x.2', type: 'trade', status: 'successful', timestamp: '200', picks: [{ pick: { source_team_key: `${LK}.t.2`, destination_team_key: `${LK}.t.3`, original_team_key: `${LK}.t.1`, round: '1' } }] }, { players: col([player(3, 'Beta One')]) }] },
      { transaction: [{ transaction_key: 'x.1', type: 'trade', status: 'successful', timestamp: '100', picks: [{ pick: { source_team_key: `${LK}.t.1`, destination_team_key: `${LK}.t.2`, original_team_key: `${LK}.t.1`, round: '1' } }, { pick: { source_team_key: `${LK}.t.2`, destination_team_key: `${LK}.t.1`, original_team_key: `${LK}.t.2`, round: '5' } }] }] },
      { transaction: [{ transaction_key: 'x.0', type: 'trade', status: 'successful', timestamp: '50' }, { players: col([player(4, 'Beta Two')]) }] },
    ]) });
    return json(400, { error: { description: `Invalid resource ${path}` } });
  };
  return { fetchImpl, calls };
}

const setCookies = res => [].concat(res.headers['set-cookie'] || []);
const cookieValue = (res, name) => setCookies(res).map(c => c.split(';')[0]).find(c => c.startsWith(`${name}=`));

async function connect({ yahoo = makeYahoo(), session = 'sess-1', query } = {}) {
  const sres = fakeRes();
  await createStartHandler({ verifyUser, env })({ method: 'POST', headers: { host: HOST, authorization: `Bearer ${session}` }, body: { returnTo: '/league/my-league/import' } }, sres);
  assert.equal(sres.statusCode, 200, JSON.stringify(sres.body));
  const state = new URL(sres.body.authorizeUrl).searchParams.get('state');
  const cres = fakeRes();
  await createCallbackHandler({ fetchImpl: yahoo.fetchImpl, env })({ method: 'GET', headers: { host: HOST, cookie: cookieValue(sres, STATE_COOKIE) }, query: query || { code: 'the-code', state } }, cres);
  return { start: sres, callback: cres, yahoo, sessionCookie: cookieValue(cres, SESSION_COOKIE) };
}
async function getData(q, { cookie, session = 'sess-1', yahoo = makeYahoo() } = {}) {
  const res = fakeRes();
  await createDataHandler({ verifyUser, fetchImpl: yahoo.fetchImpl, env })({ method: 'GET', headers: { host: HOST, authorization: `Bearer ${session}`, cookie }, query: q }, res);
  return res;
}
async function bundleFor(opts = {}) {
  const yahoo = makeYahoo(opts);
  const { sessionCookie } = await connect({ yahoo });
  const res = await getData({ resource: 'import', league_key: LK }, { cookie: sessionCookie, yahoo });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return res.body;
}
const leagueFixture = (over = {}) => ({
  id: 'my-league', name: 'Mine', sport: 'hockey', season: '2026-27', draftType: 'snake', keeperSlots: 4,
  keeperCostModel: 'slot', termModel: 'fixed', termYears: 3, contractYears: 3,
  teams: [{ id: 'a', name: 'Ben', keepers: [], roster: [], priorKeepers: [] }, { id: 'b', name: 'Mack', keepers: [], roster: [], priorKeepers: [] }, { id: 'c', name: 'Corey', keepers: [], roster: [], priorKeepers: [] }],
  ...over,
});
const auctionLeague = over => leagueFixture({ sport: 'basketball', draftType: 'auction', keeperCostModel: 'auction', termModel: 'none', termYears: null, contractYears: null, auctionRules: { costIncreasePerYear: 5, undraftedStartCost: 5 }, ...over });
const MAP = { [`${LK}.t.1`]: 'a', [`${LK}.t.2`]: 'b', [`${LK}.t.3`]: 'c' };

// ── server ────────────────────────────────────────────────────────────────

await test('state and session: sealed, bound, tamper-proof, expiring', () => {
  const c = signState({ nonce: 'n', exp: Date.now() + 1000 }, SECRET);
  assert.equal(verifyState({ cookie: c, stateParam: 'n', secret: SECRET }).ok, true);
  assert.equal(verifyState({ cookie: c, stateParam: 'other', secret: SECRET }).ok, false);
  assert.equal(verifyState({ cookie: `${c}x`, stateParam: 'n', secret: SECRET }).ok, false);
  assert.equal(verifyState({ cookie: c, stateParam: 'n', secret: SECRET, now: Date.now() + 5000 }).ok, false);
  assert.equal(verifyState({ cookie: undefined, stateParam: 'n', secret: SECRET }).ok, false);
  const sealed = sealSession({ t: ACCESS, uid: 'u', exp: Date.now() + 1000 }, SECRET);
  assert.ok(!sealed.includes(ACCESS) && !Buffer.from(sealed, 'base64url').toString('latin1').includes(ACCESS), 'token must not be readable in the cookie');
  assert.equal(openSession(sealed, SECRET).t, ACCESS);
  assert.equal(openSession(sealed, 'another-secret'), null);
  assert.equal(openSession(`${sealed.slice(0, -4)}AAAA`, SECRET), null);
  assert.equal(openSession(sealed, SECRET, Date.now() + 5000), null);
  assert.equal(openSession('', SECRET), null);
  assert.equal(renewToLeagueKey('453_200'), '453.l.200');
  assert.equal(parseCookies(`a=1; ${STATE_COOKIE}=x.y`)[STATE_COOKIE], 'x.y');
});

await test('start: needs a KeeperHQ session, the live domain, and an Import-page return', async () => {
  const run = async (headers, body, e = env) => { const r = fakeRes(); await createStartHandler({ verifyUser, env: e })({ method: 'POST', headers, body }, r); return r; };
  const ok = { host: HOST, authorization: 'Bearer sess-1' };
  const good = { returnTo: '/league/my-league/import' };
  assert.equal((await run({ host: HOST }, good)).statusCode, 401);
  assert.equal((await run({ host: HOST, authorization: 'Bearer forged' }, good)).statusCode, 401);
  assert.equal((await run({ ...ok, host: 'preview.vercel.app' }, good)).statusCode, 409);
  assert.equal((await run(ok, good, {})).statusCode, 501);
  for (const bad of ['https://evil.example/league/x/import', '//evil.example', '/league/x/import/../../settings', '/', undefined]) {
    assert.equal((await run(ok, { returnTo: bad })).statusCode, 400, `returnTo ${bad} must be refused`);
  }
  const res = await run(ok, good);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax/);
  const u = new URL(res.body.authorizeUrl);
  assert.deepEqual([u.searchParams.get('scope'), u.searchParams.get('response_type'), u.searchParams.get('redirect_uri')], ['fspt-r', 'code', 'https://keeperhq.app/api/yahoo/callback']);
  assert.ok(!JSON.stringify(res.body).includes(SECRET));
});

await test('callback: stores only an encrypted access token and returns to the Import page', async () => {
  const { callback, yahoo, sessionCookie } = await connect();
  assert.equal(callback.statusCode, 302);
  assert.equal(callback.headers.location, '/league/my-league/import?yahoo=connected');
  const all = setCookies(callback).join('\n');
  assert.ok(!all.includes(ACCESS) && !all.includes(REFRESH), 'no token in clear in any cookie');
  assert.match(all, new RegExp(`${STATE_COOKIE}=; .*Max-Age=0`));
  assert.match(setCookies(callback).find(c => c.startsWith(SESSION_COOKIE)), /HttpOnly; Secure; SameSite=Lax; Max-Age=3300/);
  const session = openSession(sessionCookie.split('=')[1], SECRET);
  assert.deepEqual([session.t, session.uid], [ACCESS, 'user-1']);
  assert.ok(!JSON.stringify(session).includes(REFRESH), 'the refresh token is never kept');
  assert.match(yahoo.calls[0].init.headers.Authorization, /^Basic /);
});

await test('callback: failures land back on the page with a reason, never a session', async () => {
  const denied = await connect({ query: { error: 'access_denied', state: 'whatever' } });
  assert.equal(denied.callback.headers.location, `/?${new URLSearchParams({ yahoo: 'error', msg: 'The response from Yahoo did not match the sign-in this browser started. Start again.' })}`);
  const sres = fakeRes();
  await createStartHandler({ verifyUser, env })({ method: 'POST', headers: { host: HOST, authorization: 'Bearer sess-1' }, body: { returnTo: '/league/my-league/import' } }, sres);
  const state = new URL(sres.body.authorizeUrl).searchParams.get('state');
  const run = async (query, yahoo = makeYahoo()) => { const r = fakeRes(); await createCallbackHandler({ fetchImpl: yahoo.fetchImpl, env })({ method: 'GET', headers: { cookie: cookieValue(sres, STATE_COOKIE) }, query }, r); return { r, yahoo }; };
  const declined = await run({ error: 'access_denied', state });
  assert.match(declined.r.headers.location, /^\/league\/my-league\/import\?yahoo=error&msg=You\+declined/);
  assert.equal(declined.yahoo.calls.length, 0);
  const badCode = await run({ code: 'c', state }, makeYahoo({ tokenStatus: 401 }));
  assert.match(decodeURIComponent(badCode.r.headers.location), /invalid_grant/);
  for (const x of [declined.r, badCode.r]) assert.equal(cookieValue(x, SESSION_COOKIE), undefined);
  const noCookie = fakeRes();
  await createCallbackHandler({ fetchImpl: makeYahoo().fetchImpl, env })({ method: 'GET', headers: {}, query: { code: 'c', state } }, noCookie);
  assert.match(noCookie.headers.location, /^\/\?yahoo=error/);
});

await test('data: refuses without a Yahoo session, or with someone else\'s', async () => {
  const { sessionCookie } = await connect();
  assert.equal((await getData({ resource: 'leagues' }, {})).body.needsConnect, true);
  assert.equal((await getData({ resource: 'leagues' }, { cookie: sessionCookie, session: 'sess-2' })).statusCode, 401);
  assert.equal((await getData({ resource: 'leagues' }, { cookie: sessionCookie, session: 'forged' })).statusCode, 401);
  assert.equal((await getData({ resource: 'import', league_key: 'not-a-key' }, { cookie: sessionCookie })).statusCode, 400);
  const expired = await getData({ resource: 'leagues' }, { cookie: sessionCookie, yahoo: makeYahoo({ apiStatus: 401 }) });
  assert.deepEqual([expired.statusCode, expired.body.needsConnect], [401, true]);
});

await test('data: league list', async () => {
  const { sessionCookie } = await connect();
  const res = await getData({ resource: 'leagues' }, { cookie: sessionCookie });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.leagues.map(l => [l.leagueKey, l.gameCode, l.isFinished, l.previousLeagueKey]), [['466.l.9', 'nba', false, null], [LK, 'nhl', true, '453.l.200']]);
  assert.equal(parseLeagueList(null).length, 0);
});

await test('data: import bundle is normalised and carries no tokens or emails', async () => {
  const b = await bundleFor();
  assert.deepEqual([b.league.name, b.league.season, b.league.isAuction, b.league.regularSeasonEndDate, b.league.nextLeagueKey], ['Test League', '2025', false, '2026-03-22', '477.l.300']);
  assert.deepEqual(b.teams.map(t => [t.name, t.managers[0]]), [['Puck Dynasty', 'Ben'], ['Ice Cold', 'Mack'], ['Slap Shots', 'Corey']]);
  assert.deepEqual(b.standings.map(s => [s.rank, s.playoffSeed, s.wins, s.pct, s.pts]), [[1, 1, 100, 0.64, 300], [2, 2, 99, 0.64, 290], [3, null, 98, 0.64, 280]]);
  assert.equal(b.rosters.cutoffDate, '2026-03-22');
  assert.deepEqual(b.rosters.cutoff[`${LK}.t.1`].map(p => p.name), ['Alpha One', 'Alpha Two']);
  assert.deepEqual(b.rosters.final[`${LK}.t.1`].map(p => p.name), ['Alpha One', 'Playoff Pickup']);
  assert.deepEqual(b.rosters.cutoff[`${LK}.t.1`][0], { yahooPlayerId: '1', name: 'Alpha One', proTeam: 'TOR', positions: ['C'], primaryPosition: 'C' });
  // The drafted player on no roster is resolved by the key lookup.
  assert.deepEqual(b.draft.map(p => [p.round, p.cost, p.name]), [[1, null, 'Alpha One'], [1, null, 'Beta One'], [2, null, 'Dropped Guy'], [2, null, 'Alpha Two']]);
  assert.deepEqual(b.draft[2].positions, ['LW', 'RW']);
  assert.deepEqual(b.pickTrades.map(t => [t.at, t.round]), [[100, 1], [100, 5], [200, 1]]);
  assert.deepEqual(b.problems, []);
  const text = JSON.stringify(b);
  for (const s of [ACCESS, REFRESH, SECRET, '@example.com']) assert.ok(!text.includes(s));
  assert.equal((await bundleFor({ auction: true })).draft[0].cost, 40);
});

await test('data: one failed section is reported and the rest still arrives', async () => {
  const b = await bundleFor({ fail: ['/standings', '/draftresults'] });
  assert.equal(b.standings.length, 0);
  assert.equal(b.draft.length, 0);
  assert.equal(b.teams.length, 3);
  assert.equal(b.problems.length, 2);
  assert.match(b.problems[0], /Standings: Invalid resource/);
});

await test('a league whose regular season has not ended uses today\'s rosters, and says so', async () => {
  const yahoo = makeYahoo();
  const { sessionCookie } = await connect({ yahoo });
  const res = fakeRes();
  const early = () => Date.parse('2026-01-10T00:00:00Z');
  await createDataHandler({ verifyUser, fetchImpl: yahoo.fetchImpl, env, now: early })({ method: 'GET', headers: { authorization: 'Bearer sess-1', cookie: `${SESSION_COOKIE}=${sealSession({ t: ACCESS, uid: 'user-1', exp: early() + 60000 }, SECRET)}` }, query: { resource: 'import', league_key: LK } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.rosters.cutoff, null);
  assert.equal(res.body.rosters.cutoffInFuture, true);
  assert.ok(!yahoo.calls.some(c => c.url.includes('roster;date=')));
  assert.equal(regularSeasonEnd({ metadata: {}, settings: {}, gameWeeks: {} }).date, null);
});

// ── the import itself ─────────────────────────────────────────────────────

await test('mapping: by name, in order with renames, and its problems', async () => {
  const b = await bundleFor();
  const byManager = leagueFixture({ yahooTeamMap: { 'Puck Dynasty': 'a' } });
  assert.equal(initialMapping(byManager, b)[`${LK}.t.1`], 'a');
  const fresh = leagueFixture({ teams: ['Team 1', 'Team 2', 'Team 3'].map((name, i) => ({ id: 'abc'[i], name, keepers: [], roster: [], priorKeepers: [] })) });
  assert.deepEqual(Object.values(initialMapping(fresh, b)), [null, null, null]);
  const ordered = mappingInOrder(fresh, b, 'manager');
  assert.deepEqual(ordered.mapping, MAP);
  assert.deepEqual(ordered.renames, { a: 'Ben', b: 'Mack', c: 'Corey' });
  assert.deepEqual(mappingInOrder(fresh, b, 'team').renames.a, 'Puck Dynasty');
  const dup = mappingProblems(fresh, b, { ...MAP, [`${LK}.t.2`]: 'a' });
  assert.deepEqual([dup.duplicates, dup.mappedCount], [['Team 1'], 2]);
  assert.deepEqual(mappingProblems(fresh, b, { [`${LK}.t.1`]: 'a' }).unmapped, ['Ice Cold', 'Slap Shots']);
});

await test('sections follow the league: no draft values on slot cost, no picks on auction', async () => {
  const b = await bundleFor();
  assert.deepEqual(sectionsFor(leagueFixture(), b), { rosters: true, draft: false, standings: true, picks: true });
  assert.deepEqual(sectionsFor(auctionLeague(), b), { rosters: true, draft: true, standings: true, picks: false });
});

await test('rosters: the cutoff roster leaves out playoff pickups; final keeps them', async () => {
  const b = await bundleFor();
  assert.deepEqual(lateAdditions(b), { [`${LK}.t.1`]: ['Playoff Pickup'] });
  const cut = applyYahooImport(leagueFixture(), b, MAP, { rosters: true, rosterSet: 'cutoff' });
  const a = cut.league.teams[0];
  assert.deepEqual(a.roster, [
    { player: 'Alpha One', pos: 'C', positions: 'C' },
    { player: 'Alpha Two', pos: 'C', positions: 'C' },
  ]);
  assert.ok(a.rosterLoadedAt);
  assert.deepEqual(cut.summary.rosters, { teams: 3, players: 5, asOf: '2026-03-22' });
  const fin = applyYahooImport(leagueFixture(), b, MAP, { rosters: true, rosterSet: 'final' });
  assert.deepEqual(fin.league.teams[0].roster.map(r => r.player), ['Alpha One', 'Playoff Pickup']);
  assert.equal(fin.summary.rosters.asOf, null);
  assert.equal(cut.league.yahooTeamMap['Puck Dynasty'], 'a');
  assert.equal(cut.league.yahooSource.leagueKey, LK);
  assert.equal(cut.league.changeLog[0].field, 'roster');
});

await test('draft: prices land as keptFor, hand-set prices survive, terms carry over', async () => {
  const b = await bundleFor({ auction: true });
  const first = applyYahooImport(auctionLeague(), b, MAP, { draft: true });
  assert.deepEqual(first.league.teams[0].priorKeepers.map(p => [p.player, p.keptFor, p.acquisitionRound]), [['Alpha One', 40, 1], ['Alpha Two', 12, 2]]);
  assert.deepEqual(first.league.teams[1].priorKeepers.map(p => [p.player, p.positions]), [['Beta One', 'C'], ['Dropped Guy', 'LW,RW']]);
  assert.deepEqual(first.summary.draft, { teams: 2, players: 4, priced: 4 });
  const overridden = auctionLeague();
  overridden.teams[0].priorKeepers = [{ player: 'Alpha One', keptFor: 55, keptForComputed: 38, keptForOverridden: true }];
  const again = applyYahooImport(overridden, b, MAP, { draft: true }).league.teams[0].priorKeepers[0];
  assert.deepEqual([again.keptFor, again.keptForComputed, again.keptForOverridden], [55, 40, true]);
  // A termed league: a contract year already on file is not reset by Yahoo.
  const termed = leagueFixture({ keeperCostModel: 'picks' });
  termed.teams[0].priorKeepers = [{ player: 'Alpha One', contractYear: 2, contractLength: 3, startSeason: '2024-25' }];
  const t = applyYahooImport(termed, await bundleFor(), MAP, { draft: true }).league.teams[0].priorKeepers;
  assert.deepEqual([t[0].contractYear, t[0].startSeason, t[0].acquisitionRound], [2, '2024-25', 1]);
  assert.deepEqual([t[1].contractYear, t[1].contractLength], [0, 3]);
});

await test('standings: rows in the app\'s shape; a stale lottery draw is cleared', async () => {
  const b = await bundleFor();
  const out = applyYahooImport(leagueFixture({ draftOrderConfig: { basis: 'points', lotteryTeams: 1, tiebreak: 'chain' } }), b, MAP, { standings: true });
  assert.deepEqual(out.league.standings.rows.map(r => [r.teamId, r.rank, r.pts, r.clinched, r.sourceName]), [['a', 1, 300, true, 'Puck Dynasty'], ['b', 2, 290, true, 'Ice Cold'], ['c', 3, 280, false, 'Slap Shots']]);
  const withDraw = leagueFixture({
    draftOrderConfig: { basis: 'points', lotteryTeams: 1, tiebreak: 'chain' },
    standings: { rows: [{ teamId: 'a', rank: 3, pts: 1 }, { teamId: 'b', rank: 2, pts: 2 }, { teamId: 'c', rank: 1, pts: 3 }], tieResolutions: {} },
    lotteryDraw: { at: 'x', order: ['a'] },
  });
  const impact = yahooImportImpact(withDraw, b, MAP, { standings: true });
  assert.equal(impact.hasImpact, true);
  assert.ok(impact.lines.some(l => /lottery draw on file will be cleared/.test(l.text)));
  assert.equal(applyYahooImport(withDraw, b, MAP, { standings: true }).league.lotteryDraw, null);
});

await test('picks: trades replay in order, idempotently, leaving other picks alone', async () => {
  const b = await bundleFor();
  // R1 of team a went a→b then b→c; R5 of team b went to a.
  assert.deepEqual(resolvedPickOwners(b, MAP), [{ round: 1, originalTeamId: 'a', ownerTeamId: 'c' }, { round: 5, originalTeamId: 'b', ownerTeamId: 'a' }]);
  const handTrade = leagueFixture({ draftPicks: { rounds: 4, ownership: { '3:c': 'a', '1:a': 'b' } } });
  const impact = yahooImportImpact(handTrade, b, MAP, { picks: true });
  assert.ok(impact.lines.some(l => /1 pick trade you recorded by hand will be overwritten/.test(l.text)));
  const once = applyYahooImport(handTrade, b, MAP, { picks: true }).league;
  assert.deepEqual([pickOwnerId(once, 1, 'a'), pickOwnerId(once, 5, 'b'), pickOwnerId(once, 3, 'c'), pickOwnerId(once, 2, 'a')], ['c', 'a', 'a', 'a']);
  assert.equal(once.draftPicks.rounds, 5);   // grew to show the round-5 pick
  const twice = applyYahooImport(once, b, MAP, { picks: true }).league;
  assert.deepEqual(twice.draftPicks.ownership, once.draftPicks.ownership);
  assert.deepEqual(resolvedPickOwners(b, { [`${LK}.t.1`]: 'a' }), []);   // unmapped teams are skipped, never guessed
});

await test('guard: a first import asks nothing; a re-import names what it replaces', async () => {
  const b = await bundleFor({ auction: true });
  const all = { rosters: true, draft: true, standings: true, picks: false, rosterSet: 'cutoff' };
  assert.equal(yahooImportImpact(auctionLeague(), b, MAP, all).hasImpact, false);
  const filled = applyYahooImport(auctionLeague(), b, MAP, all).league;
  filled.teams[0].keepers = [{ player: 'Someone Else', keptFor: 9 }];
  filled.teams[0].priorKeepers[0] = { ...filled.teams[0].priorKeepers[0], keptFor: 60, keptForComputed: 40, keptForOverridden: true };
  const impact = yahooImportImpact(filled, b, MAP, all);
  const text = impact.lines.map(l => l.text).join('\n');
  assert.equal(impact.hasImpact, true);
  assert.match(text, /5 players on 3 rosters will be replaced/);
  assert.match(text, /1 declared keeper is not on the Yahoo roster.*Someone Else \(Ben\)/);
  assert.match(text, /4 draft records on file will be replaced/);
  assert.match(text, /1 price you set by hand stays in force/);
  assert.match(text, /3 standings rows on file will be replaced/);
});

await test('renames and partial mappings', async () => {
  const b = await bundleFor();
  const fresh = leagueFixture({ teams: ['Team 1', 'Team 2', 'Team 3'].map((name, i) => ({ id: 'abc'[i], name, keepers: [], roster: [], priorKeepers: [] })) });
  const { mapping, renames } = mappingInOrder(fresh, b, 'manager');
  const out = applyYahooImport(fresh, b, mapping, { rosters: true, standings: true, renames });
  assert.deepEqual(out.league.teams.map(t => t.name), ['Ben', 'Mack', 'Corey']);
  assert.equal(out.summary.renamed, 3);
  const partial = applyYahooImport(leagueFixture(), b, { [`${LK}.t.1`]: 'a' }, { rosters: true, standings: true });
  assert.deepEqual(partial.league.teams.map(t => t.roster.length), [2, 0, 0]);
  assert.equal(partial.league.standings.rows.length, 1);
  assert.equal(partial.league.teams[1].rosterLoadedAt, undefined);   // an unmapped team is untouched
});

await test('labels and defaults: two-year seasons, last season first, Team 2 before Team 10', async () => {
  assert.deepEqual([seasonLabel('2026', 'nhl'), seasonLabel('2025', 'nba'), seasonLabel('2026', 'nfl'), seasonLabel('1999', 'nhl'), seasonLabel('', 'nhl')], ['2026–27', '2025–26', '2026', '1999–00', '']);
  const now = { leagueKey: 'c', season: '2026', isFinished: false, nextLeagueKey: null, previousLeagueKey: 'b' };
  // The league list may not carry Yahoo's finished flag: a renewed league is over.
  const last = { leagueKey: 'b', season: '2025', isFinished: false, nextLeagueKey: 'c', previousLeagueKey: 'a' };
  const older = { leagueKey: 'a', season: '2024', isFinished: true, nextLeagueKey: 'b' };
  assert.deepEqual([isSeasonOver(now), isSeasonOver(last), isSeasonOver(older)], [false, true, true]);
  assert.equal(defaultYahooLeague([now, last, older]).leagueKey, 'b');
  assert.equal(defaultYahooLeague([now, last, older], 'a').leagueKey, 'a');
  assert.equal(defaultYahooLeague([now]).leagueKey, 'c');
  assert.equal(defaultYahooLeague([]), null);
  assert.deepEqual(sortTeamsByName(['Team 10', 'Team 2', 'Team 1', 'team 11'].map(name => ({ name }))).map(t => t.name), ['Team 1', 'Team 2', 'Team 10', 'team 11']);
  const { sessionCookie } = await connect();
  const list = (await getData({ resource: 'leagues' }, { cookie: sessionCookie })).body.leagues;
  assert.equal(list.find(l => l.leagueKey === LK).nextLeagueKey, '477.l.300');
  // A typed date is fetched and flagged as the commissioner's own.
  const yahoo = makeYahoo();
  const c2 = await connect({ yahoo });
  const custom = (await getData({ resource: 'import', league_key: LK, date: '2026-02-01' }, { cookie: c2.sessionCookie, yahoo })).body;
  assert.deepEqual([custom.rosters.cutoffDate, custom.rosters.cutoffIsCustom], ['2026-02-01', true]);
  assert.ok(yahoo.calls.some(c => c.url.includes('roster;date=2026-02-01')));
  assert.equal((await bundleFor()).rosters.cutoffIsCustom, false);
});

// A slice of the NHL directory in its real record shape.
const DIRECTORY = [
  { id: '8478402', name: 'Alpha One', firstName: 'Alpha', lastName: 'One', pos: 'C', team: 'TOR' },
  { id: '8477000', name: 'Alphonse Two', firstName: 'Alphonse', lastName: 'Two', pos: 'L', team: 'TOR' },   // Yahoo: "Alpha Two"
  { id: '8471111', name: 'Beta One', firstName: 'Beta', lastName: 'One', pos: 'D', team: 'BOS' },
  { id: '8471112', name: 'Beta One', firstName: 'Beta', lastName: 'One', pos: 'G', team: 'BOS' },             // a namesake goalie
  { id: '8470001', name: 'Sam Same', firstName: 'Sam', lastName: 'Same', pos: 'C', team: 'LAK' },
  { id: '8470002', name: 'Sam Same', firstName: 'Sam', lastName: 'Same', pos: 'C', team: 'NJD' },
  { id: '8460000', name: 'Gamma One', firstName: 'Gamma', lastName: 'One', pos: 'R', team: 'EDM' },
];

await test('directory matching: name, namesakes, last name + team, never a guess', () => {
  const resolve = directoryResolver(DIRECTORY);
  const yp = (name, proTeam = 'TOR', positions = ['C']) => ({ name, proTeam, positions });
  assert.equal(resolve(yp('Alpha One')).rec.id, '8478402');
  assert.equal(resolve(yp('A.L.P.H.A. one')).rec.id, '8478402');             // punctuation/case are noise
  assert.equal(resolve(yp('Gamma One', 'TOR')).rec.id, '8460000');           // traded since: a unique name still matches
  assert.equal(resolve(yp('Sam Same', 'LA')).rec.id, '8470001');             // Yahoo's LA is the NHL's LAK
  assert.equal(resolve(yp('Sam Same', 'NJ')).rec.id, '8470002');
  assert.equal(resolve(yp('Sam Same', 'CHI')).status, 'ambiguous');          // can't tell them apart: not guessed
  assert.equal(resolve(yp('Beta One', 'BOS', ['G'])).rec.id, '8471112');     // same team: goalie vs skater decides
  assert.equal(resolve(yp('Beta One', 'BOS', ['D'])).rec.id, '8471111');
  assert.deepEqual([resolve(yp('Alpha Two')).status, resolve(yp('Alpha Two')).rec.id], ['lastname', '8477000']);
  assert.equal(resolve(yp('Alpha Two', 'MTL')).status, 'none');              // last name alone, wrong team: no match
  assert.equal(resolve(yp('Beta Two')).status, 'none');                      // same team + last name, different initial (the Hughes brothers)
  assert.equal(resolve(yp('Nobody Here')).status, 'none');
  assert.equal(directoryResolver([]), null);
  // Identity is the directory's; eligibility is Yahoo's, the directory's single position only when Yahoo gave none.
  assert.deepEqual(playerFields(yp('Alpha Two'), resolve), { name: 'Alphonse Two', pos: 'C', positions: 'C', proTeam: 'TOR', nhlPlayerId: '8477000' });
  assert.deepEqual(playerFields(yp('Alpha Two', 'TOR', []), resolve), { name: 'Alphonse Two', pos: 'LW', positions: 'LW', proTeam: 'TOR', nhlPlayerId: '8477000' });
  assert.deepEqual(playerFields({ name: 'Nobody Here', proTeam: 'TOR', positions: ['C', 'LW'], primaryPosition: 'C' }, resolve), { name: 'Nobody Here', pos: 'C', positions: 'C,LW', proTeam: 'TOR', nhlPlayerId: null });
});

await test('import with the directory: NHL records stored, no Yahoo ids anywhere', async () => {
  const b = await bundleFor({ auction: true });
  const resolve = directoryResolver(DIRECTORY);
  const summary = directoryMatchSummary(b, resolve, { rosterSet: 'cutoff' });
  assert.deepEqual([summary.total, summary.matched], [6, 4]);
  assert.deepEqual(summary.byLastName, [{ yahoo: 'Alpha Two', nhl: 'Alphonse Two', team: 'TOR' }]);
  assert.deepEqual(summary.unmatched, [{ name: 'Beta Two', ambiguous: false }, { name: 'Dropped Guy', ambiguous: false }]);
  const league = auctionLeague({ sport: 'hockey' });
  const out = applyYahooImport(league, b, MAP, { rosters: true, draft: true, rosterSet: 'cutoff', resolve });
  const a = out.league.teams[0];
  assert.deepEqual(a.roster, [{ player: 'Alpha One', pos: 'C', positions: 'C', nhlPlayerId: '8478402' }, { player: 'Alphonse Two', pos: 'C', positions: 'C', nhlPlayerId: '8477000' }]);
  // The draft row carries the SAME name as the roster row, so the pool joins them.
  assert.deepEqual(a.priorKeepers.map(p => [p.player, p.nhlPlayerId, p.keptFor, p.positions]), [['Alpha One', '8478402', 40, 'C'], ['Alphonse Two', '8477000', 12, 'C']]);
  const unmatched = out.league.teams[1].priorKeepers.find(p => p.player === 'Dropped Guy');
  assert.deepEqual([unmatched.nhlPlayerId, unmatched.positions], [undefined, 'LW,RW']);
  assert.deepEqual(out.summary.directory, { matched: 4, total: 6 });
  const text = JSON.stringify(out.league.teams);
  assert.ok(!/yahooPlayerId|sourceName|465\.p\./.test(text), 'no Yahoo player identity is stored');
  // A keeper declared under the NHL name isn't reported missing on a re-import.
  const declared = { ...out.league, teams: out.league.teams.map((t, i) => (i === 0 ? { ...t, keepers: [{ player: 'Alphonse Two', keptFor: 17 }] } : t)) };
  const impact = yahooImportImpact(declared, b, MAP, { rosters: true, rosterSet: 'cutoff', resolve });
  assert.ok(!impact.lines.some(l => /not on the Yahoo roster/.test(l.text)));
  assert.ok(yahooImportImpact(declared, b, MAP, { rosters: true, rosterSet: 'cutoff' }).lines.some(l => /Alphonse Two \(Ben\)/.test(l.text)));
});

await test('positions: newest season\'s eligibility, stored as a list, shown as C/LW/RW', async () => {
  // Yahoo has opened 2026-27 (game 477): Alpha One gained LW, Alpha Two moved to RW,
  // everyone else isn't returned (say, retired) and keeps 2025-26's positions.
  const b = await bundleFor({ newestGame: '477', newestPositions: { 1: 'C,LW', 2: 'RW' } });
  assert.deepEqual([b.eligibility.gameKey, b.eligibility.season, b.eligibility.sameAsLeague], ['477', '2026', false]);
  assert.deepEqual(b.eligibility.byPlayerId, { 1: ['C', 'LW'], 2: ['RW'] });
  assert.deepEqual(eligibilityNote(b), { season: '2026–27', newest: true, sameAsLeague: false });
  const out = applyYahooImport(leagueFixture(), b, MAP, { rosters: true, rosterSet: 'cutoff' }).league;
  assert.deepEqual(out.teams[0].roster.map(r => [r.player, r.pos, r.positions]), [['Alpha One', 'C', 'C,LW'], ['Alpha Two', 'RW', 'RW']]);
  assert.deepEqual(out.teams[1].roster.map(r => r.positions), ['C', 'C']);
  // A league that IS the newest season reads its own eligibility, with no extra requests.
  const same = await bundleFor();
  assert.deepEqual([same.eligibility.sameAsLeague, same.eligibility.byPlayerId['1']], [true, ['C']]);
  assert.deepEqual(eligibilityNote(same), { season: '2025–26', newest: true, sameAsLeague: true });
  assert.deepEqual(eligibilityNote({ league: { season: '2025', gameCode: 'nhl' } }), { season: '2025–26', newest: false, sameAsLeague: true });
  // Display helpers.
  assert.deepEqual(positionsList({ positions: 'C,LW,RW' }), ['C', 'LW', 'RW']);
  assert.deepEqual(positionsList({ positions: ['L', 'R'] }), ['LW', 'RW']);
  assert.deepEqual(positionsList({ pos: 'C/LW' }), ['C', 'LW']);
  assert.deepEqual(positionsList({ positions: 'PG,SG,Util,BN' }), ['PG', 'SG']);
  assert.deepEqual(positionsList({}), []);
  assert.equal(formatPositions(['C', 'LW', 'RW']), 'C/LW/RW');
  const idx = leaguePositionIndex({ teams: [
    { roster: [{ player: 'A', pos: 'C' }, { player: 'B', pos: 'D', positions: 'D' }], priorKeepers: [{ player: 'A', positions: 'C,LW' }] },
  ] });
  assert.deepEqual([idx.get('a'), idx.get('b')], [['C', 'LW'], ['D']]);   // an explicit list beats a bare pos
});

console.log(`\n${passed} passed`);
