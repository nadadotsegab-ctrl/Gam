import test from 'node:test';
import assert from 'node:assert/strict';
import { createPropsApiHandler, SOCCER_LEAGUES } from '../server/props-feed.js';

const KEY = 'props-test-only-not-a-real-credential';
const START = Date.parse('2026-10-24T16:00:00Z');
const ROUTE = '/api/props?sport=NBA&timeZone=America%2FDenver';

function book(key, over = -110, under = -110, patch = {}) {
  return {
    key,
    last_update: '2026-10-24T15:59:00Z',
    markets: [{
      key: 'player_points',
      last_update: '2026-10-24T15:59:00Z',
      outcomes: [
        { name: 'Over', description: 'Example Player', point: 24.5, price: over },
        { name: 'Under', description: 'Example Player', point: 24.5, price: under },
      ],
    }],
    ...patch,
  };
}

function event(patch = {}) {
  return {
    id: 'event-123',
    sport_key: 'basketball_nba',
    home_team: 'Home Team',
    away_team: 'Away Team',
    commence_time: '2026-10-24T20:00:00Z',
    bookmakers: [book('draftkings', 140, -160), book('fanduel'), book('betmgm')],
    ...patch,
  };
}

async function request(handler, url = ROUTE, method = 'GET') {
  const headers = {};
  let body;
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(value) { body = value; },
  };
  const handled = await handler({ url, method }, res);
  return { handled, status: res.statusCode, headers, body, json: body ? JSON.parse(body) : undefined };
}

function provider(events = [event()], callback) {
  return async (input, options) => {
    const url = new URL(input);
    if (callback) await callback(url, options);
    if (url.pathname.endsWith('/events/')) return Response.json(events);
    const id = decodeURIComponent(url.pathname.match(/\/events\/([^/]+)\/odds\/$/)?.[1] || '');
    return Response.json(events.find(candidate => candidate?.id === id) || {});
  };
}

test('props status, catalog, missing key, method, sport, timezone, and league validation do not call upstream', async () => {
  let calls = 0;
  const handler = createPropsApiHandler({ apiKey: '', fetchImpl: async () => { calls += 1; }, now: () => START });
  const status = await request(handler, '/api/props/status');
  assert.equal(status.status, 200);
  assert.equal(status.json.configured, false);
  assert.deepEqual(status.json.supportedSports, ['NBA', 'NFL', 'SOCCER']);
  assert.equal(status.json.minReferences, 2);
  assert.equal(status.json.maxEvents, 12);
  assert.deepEqual((await request(handler, '/api/props/leagues')).json.leagues, SOCCER_LEAGUES);
  const missing = await request(handler);
  assert.equal(missing.status, 503);
  assert.match(missing.json.error, /ODDS_API_KEY.*player-prop access/);
  for (const route of [
    '/api/props?sport=toString', '/api/props?sport=MLB', '/api/props?sport=NBA&timeZone=not-a-timezone',
    '/api/props?sport=NBA&timeZone=' + 'A'.repeat(65),
    '/api/props?sport=NBA&league=soccer_epl', '/api/props?sport=SOCCER&league=soccer_not_supported',
  ]) assert.equal((await request(handler, route)).status, 400, route);
  const post = await request(handler, ROUTE, 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET');
  assert.equal((await request(handler, '/api/other')).handled, false);
  assert.equal(calls, 0);
});

test('props calls fixed event endpoints only for today’s future events and returns real ranked fixture prices', async () => {
  const calls = [];
  const events = [
    event(),
    event({ id: 'started', commence_time: '2026-10-24T15:59:00Z' }),
    event({ id: 'tomorrow', commence_time: '2026-10-25T16:00:00Z' }),
    event({ id: 'malformed', commence_time: '2026-02-30T20:00:00Z' }),
    event({ id: '../path', commence_time: '2026-10-24T21:00:00Z' }),
    event({ id: 'wrong-sport', sport_key: 'soccer_epl' }),
    event(),
    null,
  ];
  const handler = createPropsApiHandler({
    apiKey: KEY,
    now: () => START,
    fetchImpl: provider(events, (url, options) => {
      calls.push(url.pathname);
      assert.equal(url.origin, 'https://api.the-odds-api.com');
      assert.equal(url.searchParams.get('apiKey'), KEY);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      if (url.pathname.endsWith('/odds/')) {
        assert.equal(url.searchParams.get('bookmakers'), 'draftkings,fanduel,betmgm,williamhill_us,pinnacle');
        assert.equal(url.searchParams.get('oddsFormat'), 'american');
        assert.equal(url.searchParams.get('dateFormat'), 'iso');
        assert.equal(url.searchParams.get('markets'), 'player_points,player_rebounds,player_assists,player_threes');
      }
    }),
  });
  const result = await request(handler);
  assert.equal(result.status, 200);
  assert.deepEqual(calls, ['/v4/sports/basketball_nba/events/', '/v4/sports/basketball_nba/events/event-123/odds/']);
  assert.equal(result.json.day, '2026-10-24');
  assert.equal(result.json.eventsAvailable, 1);
  assert.equal(result.json.eventsScanned, 1);
  assert.equal(result.json.complete, true);
  assert.deepEqual(result.json.warnings, []);
  assert.equal(result.json.fetchedAt, '2026-10-24T16:00:00.000Z');
  assert.equal(result.json.expiresAt, '2026-10-24T16:05:00.000Z');
  assert.equal(result.json.source, 'The Odds API');
  const pick = result.json.picks.find(row => row.side === 'Over');
  assert.equal(pick.book, 'draftkings');
  assert.equal(pick.odds, 140);
  assert.equal(pick.referenceCount, 2);
  assert.ok(Math.abs(pick.ev - 20) < 1e-8);
  assert.equal(result.body.includes(KEY), false);
  assert.equal(result.body.includes('api.the-odds-api.com'), false);
  assert.match(result.headers['content-type'], /application\/json/);
});

test('props scans at most twelve events with two concurrent event requests and declares incomplete coverage', async () => {
  const events = Array.from({ length: 14 }, (_, i) => event({ id: `event-${i}` }));
  let active = 0, peak = 0, eventCalls = 0;
  const handler = createPropsApiHandler({
    apiKey: KEY, now: () => START,
    fetchImpl: provider(events, async url => {
      if (!url.pathname.endsWith('/odds/')) return;
      eventCalls += 1;
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active -= 1;
    }),
  });
  const result = await request(handler);
  assert.equal(result.status, 200);
  assert.equal(eventCalls, 12);
  assert.equal(peak, 2);
  assert.equal(result.json.eventsAvailable, 14);
  assert.equal(result.json.eventsRequested, 12);
  assert.equal(result.json.eventsScanned, 12);
  assert.equal(result.json.complete, false);
  assert.match(result.json.warnings.join(' '), /first 12.*14/);
});

test('validated event details with an omitted sport key retain the sport established by the fixed request path', async () => {
  const detail = event();
  delete detail.sport_key;
  const handler = createPropsApiHandler({
    apiKey: KEY, now: () => START,
    fetchImpl: async input => {
      const url = new URL(input);
      return Response.json(url.pathname.endsWith('/events/') ? [event()] : detail);
    },
  });
  const result = await request(handler);
  assert.equal(result.status, 200);
  assert.equal(result.json.eventsScanned, 1);
  assert.equal(result.json.picks.length > 0, true);
  assert.ok(result.json.picks.every(pick => pick.sport === 'NBA'));
});

test('partial event failures retain valid picks with an explicit warning; all failed events do not cache success', async () => {
  const events = [event(), event({ id: 'failed' })];
  const handler = createPropsApiHandler({
    apiKey: KEY, now: () => START,
    fetchImpl: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('/events/')) return Response.json(events);
      if (url.pathname.includes('/failed/')) return new Response('upstream detail must stay private', { status: 500 });
      return Response.json(event());
    },
  });
  const result = await request(handler);
  assert.equal(result.status, 200);
  assert.equal(result.json.eventsScanned, 1);
  assert.equal(result.json.complete, false);
  assert.match(result.json.warnings.join(' '), /1 event scan failed/);
  assert.equal(result.json.picks.length > 0, true);
  assert.equal(result.body.includes('upstream detail'), false);

  let listCalls = 0;
  const failing = createPropsApiHandler({
    apiKey: KEY, now: () => START,
    fetchImpl: async input => {
      if (new URL(input).pathname.endsWith('/events/')) { listCalls += 1; return Response.json(events); }
      return Response.json({});
    },
  });
  assert.equal((await request(failing)).status, 502);
  assert.equal((await request(failing)).status, 502);
  assert.equal(listCalls, 2);
});

test('credential, quota, invalid body, timeout, and network errors never leak keys or provider response bodies', async () => {
  for (const status of [401, 403, 429]) {
    let listCalls = 0;
    const handler = createPropsApiHandler({
      apiKey: KEY, now: () => START,
      fetchImpl: async input => {
        if (new URL(input).pathname.endsWith('/events/')) { listCalls += 1; return Response.json([event()]); }
        return new Response(`provider private content ${KEY}`, { status });
      },
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await request(handler);
      assert.equal(result.status, 502);
      assert.match(result.json.error, status === 429 ? /quota/ : /player-prop access/);
      assert.equal(result.body.includes(KEY), false);
      assert.equal(result.body.includes('provider private content'), false);
    }
    assert.equal(listCalls, 2, 'fatal failures are not cached as empty successes');
  }
  const failures = [
    async () => new Response(`private body ${KEY}`, { status: 500 }),
    async () => new Response(`invalid JSON ${KEY}`),
    async () => Response.json({ private: KEY }),
    async () => { throw new DOMException(`https://provider/?apiKey=${KEY}`, 'TimeoutError'); },
    async () => { throw new Error(`https://provider/?apiKey=${KEY}`); },
  ];
  for (const fetchImpl of failures) {
    const result = await request(createPropsApiHandler({ apiKey: KEY, now: () => START, fetchImpl }));
    assert.equal(result.status, 502);
    assert.equal(result.body.includes(KEY), false);
    assert.equal(result.body.includes('https://'), false);
    assert.equal(result.body.includes('private body'), false);
  }
});

test('cache is per sport, timezone, soccer league, and day, with five-minute expiry and in-flight deduplication', async () => {
  let clock = START;
  let calls = 0;
  const handler = createPropsApiHandler({
    apiKey: KEY, now: () => clock,
    fetchImpl: provider([event()], async () => { calls += 1; await new Promise(resolve => setImmediate(resolve)); }),
  });
  const results = await Promise.all([request(handler), request(handler), request(handler)]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(calls, 2);
  await request(handler);
  assert.equal(calls, 2);
  clock += 299_999;
  await request(handler);
  assert.equal(calls, 2);
  clock += 1;
  await request(handler);
  assert.equal(calls, 4);
  await request(handler, '/api/props?sport=NBA&timeZone=America%2FNew_York');
  assert.equal(calls, 6);
  await request(handler, '/api/props?sport=NFL');
  assert.equal(calls, 7, 'wrong-sport listing does not produce event calls');
  clock = Date.parse('2026-10-25T06:00:00Z');
  await request(handler);
  assert.equal(calls, 8, 'local midnight changes the cache key');
});

test('cached results are re-ranked and exclude prices that have started or become stale', async () => {
  let clock = START;
  let calls = 0;
  const soon = event({ commence_time: '2026-10-24T16:01:00Z' });
  const handler = createPropsApiHandler({
    apiKey: KEY, now: () => clock,
    fetchImpl: provider([soon], () => { calls += 1; }),
  });
  assert.equal((await request(handler)).json.picks.length > 0, true);
  clock += 60_001;
  const started = await request(handler);
  assert.deepEqual(started.json.picks, []);
  assert.equal(calls, 2, 'started picks are removed without another upstream call');

  clock = START;
  const aging = event({ bookmakers: [
    book('draftkings', 140, -160, { markets: [{ ...book('draftkings').markets[0], last_update: '2026-10-24T15:46:00Z', outcomes: book('draftkings', 140, -160).markets[0].outcomes }] }),
    book('fanduel', -110, -110, { markets: [{ ...book('fanduel').markets[0], last_update: '2026-10-24T15:46:00Z' }] }),
    book('betmgm', -110, -110, { markets: [{ ...book('betmgm').markets[0], last_update: '2026-10-24T15:46:00Z' }] }),
  ] });
  const staleHandler = createPropsApiHandler({ apiKey: KEY, now: () => clock, fetchImpl: provider([aging]) });
  assert.equal((await request(staleHandler)).json.picks.length > 0, true);
  clock += 120_000;
  assert.deepEqual((await request(staleHandler)).json.picks, []);
});

test('soccer league selection changes provider paths and requested markets without claiming live availability', async () => {
  const paths = [];
  const handler = createPropsApiHandler({
    apiKey: KEY, now: () => START,
    fetchImpl: async input => {
      const url = new URL(input);
      paths.push(url.pathname);
      const league = url.pathname.split('/')[3];
      const soccerEvent = event({ sport_key: league, bookmakers: [] });
      if (url.pathname.endsWith('/events/')) return Response.json([soccerEvent]);
      assert.equal(url.searchParams.get('markets'), 'player_shots,player_shots_on_target');
      return Response.json(soccerEvent);
    },
  });
  for (const league of ['soccer_epl', 'soccer_uefa_champs_league']) {
    const result = await request(handler, `/api/props?sport=SOCCER&league=${league}`);
    assert.equal(result.status, 200);
    assert.equal(result.json.league, league);
    assert.deepEqual(result.json.picks, []);
  }
  assert.equal(paths.length, 4);
  assert.equal(paths[0], '/v4/sports/soccer_epl/events/');
  assert.equal(paths[2], '/v4/sports/soccer_uefa_champs_league/events/');
});

test('empty schedules and valid events without comparable prices produce honest empty results', async () => {
  const empty = createPropsApiHandler({ apiKey: KEY, now: () => START, fetchImpl: provider([]) });
  const schedule = await request(empty);
  assert.equal(schedule.status, 200);
  assert.equal(schedule.json.eventsAvailable, 0);
  assert.equal(schedule.json.eventsScanned, 0);
  assert.equal(schedule.json.complete, true);
  assert.deepEqual(schedule.json.picks, []);
  const incomparable = createPropsApiHandler({ apiKey: KEY, now: () => START, fetchImpl: provider([event({ bookmakers: [book('draftkings', 140, -160)] })]) });
  const prices = await request(incomparable);
  assert.equal(prices.status, 200);
  assert.equal(prices.json.eventsScanned, 1);
  assert.deepEqual(prices.json.picks, []);
});
