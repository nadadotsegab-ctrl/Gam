import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOddsApiHandler, transformOddsPayload } from '../server/odds-feed.js';
import { createAppServer } from '../server/server.mjs';
import { impliedProbability, removeVig } from '../src/lib/odds.js';

const mockKey = 'test-only-not-a-real-credential';
function book(key, away, home, extra = []) {
  return { key, markets: [{ key: 'h2h', outcomes: [{ name: 'Away Team', price: away }, { name: 'Home Team', price: home }, ...extra] }] };
}
function event(patch = {}) {
  return {
    id: 'event-123', sport_key: 'basketball_nba', away_team: 'Away Team', home_team: 'Home Team',
    commence_time: '2026-10-24T23:30:00Z',
    bookmakers: [book('draftkings', 150, -170), book('fanduel', 140, -160), book('pinnacle', 120, -140)],
    ...patch,
  };
}
function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}
async function request(handler, url = '/api/odds?sport=NBA', method = 'GET') {
  const headers = {};
  let body;
  const res = { statusCode: 200, setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(value) { body = value; } };
  const handled = await handler({ url, method }, res);
  return { handled, status: res.statusCode, headers, body, json: body ? JSON.parse(body) : undefined };
}

test('live transform maps books, uses Pinnacle no-vig probabilities, and preserves both selections', () => {
  const payload = [event({ bookmakers: [book('draftkings', 150, -170), book('williamhill_us', 145, -165), book('pinnacle', 120, -140)] })];
  const transformed = transformOddsPayload(payload, 'NBA');
  assert.equal(transformed.length, 2);
  assert.equal(transformed[0].selection, 'Away Team');
  assert.equal(transformed[1].selection, 'Home Team');
  assert.equal(transformed[0].odds.caesars, 145);
  assert.equal(transformed[0].odds.williamhill_us, undefined);
  assert.equal(transformed[0].event, 'Away Team vs. Home Team');
  assert.deepEqual(transformed[0].trend, []);
  const fair = removeVig(120, -140);
  close(impliedProbability(transformed[0].fairOdds), fair[0]);
  close(impliedProbability(transformed[1].fairOdds), fair[1]);
  assert.equal(transformed[0].startsAt, '2026-10-24T23:30:00.000Z');
});

test('live transform falls back to normalized market consensus and handles even money', () => {
  const transformed = transformOddsPayload([event({ bookmakers: [book('draftkings', 110, -130), book('fanduel', 120, -140)] })], 'NBA');
  const fair = (removeVig(110, -130)[0] + removeVig(120, -140)[0]) / 2;
  close(impliedProbability(transformed[0].fairOdds), fair);
  const even = transformOddsPayload([event({ bookmakers: [book('draftkings', -110, -110)] })], 'NBA');
  assert.equal(even[0].fairOdds, 100);
  assert.equal(even[1].fairOdds, 100);
});

test('live transform rejects malformed events and three-way markets without poisoning valid events', () => {
  const malformed = [
    null,
    event({ id: 'invalid date', commence_time: 'yesterday' }),
    event({ id: 'bad-date', commence_time: '2026-02-30T12:00:00Z' }),
    event({ id: 'wrong-sport', sport_key: 'soccer_epl' }),
    event({ id: 'bad-prices', bookmakers: [book('draftkings', 99, -110)] }),
    event({ id: 'extreme-prices', bookmakers: [book('draftkings', 1_000_001, -110)] }),
    event({ id: 'third-outcome', bookmakers: [book('draftkings', 110, -110, [{ name: 'Draw', price: 300 }])] }),
    event({ id: 'wrong-name', home_team: 'Different Team' }),
    event(), event(),
  ];
  const result = transformOddsPayload(malformed, 'NBA');
  assert.equal(result.length, 2);
  assert.equal(new Set(result.map(row => row.id)).size, 2);
  assert.deepEqual(transformOddsPayload([], 'NBA'), []);
  assert.throws(() => transformOddsPayload({}, 'NBA'), /invalid response/);
  assert.throws(() => transformOddsPayload([], 'SOCCER'), /sport/);
  const many = Array.from({ length: 260 }, (_, index) => event({ id: `event-${index}` }));
  assert.equal(transformOddsPayload(many, 'NBA').length, 500);
});

test('API status, method, sport, and missing-key responses are explicit without upstream calls', async () => {
  let calls = 0;
  const handler = createOddsApiHandler({ apiKey: '', fetchImpl: async () => { calls += 1; } });
  assert.deepEqual((await request(handler, '/api/odds/status')).json, { configured: false });
  assert.equal((await request(handler)).status, 503);
  assert.equal((await request(handler, '/api/odds?sport=SOCCER')).status, 400);
  assert.equal((await request(handler, '/api/odds?sport=toString')).status, 400);
  const post = await request(handler, '/api/odds?sport=NBA', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET');
  assert.equal((await request(handler, '/api/unrelated')).handled, false);
  assert.equal(calls, 0);
});

test('API uses the fixed server-side provider, refuses redirects, and caches per sport for 60 seconds', async () => {
  let clock = Date.parse('2026-10-24T00:00:00Z');
  let calls = 0;
  const handler = createOddsApiHandler({
    apiKey: mockKey,
    now: () => clock,
    fetchImpl: async (input, options) => {
      calls += 1;
      const url = new URL(input);
      assert.equal(url.origin, 'https://api.the-odds-api.com');
      assert.equal(url.searchParams.get('apiKey'), mockKey);
      assert.equal(url.searchParams.get('bookmakers'), 'draftkings,fanduel,betmgm,williamhill_us,pinnacle');
      assert.equal(url.searchParams.get('markets'), 'h2h');
      assert.equal(url.searchParams.get('oddsFormat'), 'american');
      assert.equal(url.searchParams.get('dateFormat'), 'iso');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      return Response.json([event()]);
    },
  });
  const first = await request(handler);
  assert.equal(first.status, 200);
  assert.equal(first.json.source, 'The Odds API');
  assert.equal(first.json.benchmark, 'Pinnacle no-vig or market consensus');
  assert.equal(first.json.markets.length, 2);
  assert.equal(first.json.updatedAt, '2026-10-24T00:00:00.000Z');
  assert.equal(first.body.includes(mockKey), false);
  assert.equal(first.body.includes('api.the-odds-api.com'), false);
  await request(handler);
  assert.equal(calls, 1);
  clock += 59_999;
  await request(handler);
  assert.equal(calls, 1);
  clock += 1;
  await request(handler);
  assert.equal(calls, 2);
  await request(handler, '/api/odds?sport=NFL');
  assert.equal(calls, 3);
});

test('concurrent requests share one provider call', async () => {
  let calls = 0;
  let complete;
  const upstream = new Promise(resolve => { complete = resolve; });
  const handler = createOddsApiHandler({ apiKey: mockKey, fetchImpl: async () => { calls += 1; return upstream; } });
  const requests = [request(handler), request(handler)];
  complete(Response.json([event()]));
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result.status === 200));
});

test('upstream authorization, rate limits, malformed bodies, and timeout failures never expose secrets', async () => {
  const failures = [
    async () => new Response(`secret body ${mockKey}`, { status: 403 }),
    async () => new Response(`secret body ${mockKey}`, { status: 429 }),
    async () => new Response(`secret body ${mockKey}`, { status: 500 }),
    async () => new Response(`secret body ${mockKey}`, { status: 200 }),
    async () => { throw new DOMException(`url https://provider/?apiKey=${mockKey}`, 'TimeoutError'); },
  ];
  for (const fetchImpl of failures) {
    const response = await request(createOddsApiHandler({ apiKey: mockKey, fetchImpl }));
    assert.equal(response.status, 502);
    assert.equal(typeof response.json.error, 'string');
    assert.equal(response.body.includes(mockKey), false);
    assert.equal(response.body.includes('secret body'), false);
    assert.equal(response.body.includes('https://'), false);
  }
});

test('HTTP server serves built assets, SPA pages, and real API status while blocking traversal and missing assets', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ultrax-feed-test-'));
  const dist = path.join(temp, 'dist');
  await mkdir(dist);
  await writeFile(path.join(dist, 'index.html'), '<!doctype html><title>Ultrax</title>');
  await writeFile(path.join(dist, 'app.js'), 'export default 1;');
  await writeFile(path.join(temp, 'secret.txt'), 'private outside file');
  await symlink(path.join(temp, 'secret.txt'), path.join(dist, 'escape.txt'));
  const server = createAppServer({ apiKey: '', distDir: dist });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(`${origin}/api/odds/status`);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { configured: false });
  const html = await fetch(`${origin}/tracker`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /Ultrax/);
  const script = await fetch(`${origin}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  const head = await fetch(`${origin}/app.js`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
  assert.equal((await fetch(`${origin}/api/missing`)).status, 404);
  assert.equal((await fetch(`${origin}/escape.txt`)).status, 404);
  assert.equal((await fetch(`${origin}/%2e%2e%2fsecret.txt`)).status, 400);
  assert.equal((await fetch(`${origin}/%00.txt`)).status, 400);
});
