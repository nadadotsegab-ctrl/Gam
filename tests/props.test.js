import test from 'node:test';
import assert from 'node:assert/strict';
import { PROP_MARKETS, PROP_SPORTS, isPropCurrent, localDateKey, rankPlayerProps } from '../src/lib/props.js';
import { expectedValue, removeVig } from '../src/lib/odds.js';

const NOW = Date.parse('2026-10-23T18:00:00Z');
const UPDATED = '2026-10-23T17:58:00Z';
const options = { now: NOW, timeZone: 'America/Denver' };
const clone = value => structuredClone(value);

function book(key, over = -110, under = -110, { line = 24.5, player = 'Example Player', market = 'player_points', updated = UPDATED } = {}) {
  return { key, last_update: updated, markets: [{ key: market, last_update: updated, outcomes: [
    { name: 'Over', description: player, point: line, price: over },
    { name: 'Under', description: player, point: line, price: under },
  ] }] };
}

function fixture(extra = {}) {
  return {
    id: 'event-1', sport_key: 'basketball_nba', sport_title: 'NBA', home_team: 'Home Team', away_team: 'Away Team',
    commence_time: '2026-10-24T01:00:00Z',
    bookmakers: [book('draftkings', 120, -140), book('fanduel'), book('betmgm')],
    ...extra,
  };
}

test('ranks only positive independently estimated edges and excludes the target from its reference', () => {
  const picks = rankPlayerProps([fixture()], options);
  const pick = picks.find(p => p.side === 'Over');
  assert.equal(pick.book, 'draftkings');
  assert.equal(pick.odds, 120);
  assert.equal(pick.fairProbability, .5);
  assert.ok(Math.abs(pick.ev - 10) < 1e-10);
  assert.deepEqual(pick.referenceBooks, ['betmgm', 'fanduel']);
  assert.equal(pick.referenceCount, 2);
  assert.equal(pick.referenceBooks.includes(pick.book), false);
  assert.equal(pick.player, 'Example Player');
  assert.equal(pick.marketKey, 'player_points');
  assert.equal(pick.marketLabel, 'Points');
  assert.equal(pick.line, 24.5);
  assert.equal(pick.priceUpdatedAt, new Date(UPDATED).toISOString());
  assert.equal(pick.referenceUpdatedAt, new Date(UPDATED).toISOString());
  assert.deepEqual(pick.prices, [
    { book: 'draftkings', odds: 120, updatedAt: new Date(UPDATED).toISOString() },
    { book: 'betmgm', odds: -110, updatedAt: new Date(UPDATED).toISOString() },
    { book: 'fanduel', odds: -110, updatedAt: new Date(UPDATED).toISOString() },
  ]);
  assert.ok(picks.every(p => p.ev > 0 && p.fairProbability > 0 && p.fairProbability < 1));
  assert.equal(new Set(picks.map(p => p.id)).size, picks.length);
  assert.deepEqual(rankPlayerProps([fixture()], { ...options, minEdge: 11 }), []);
});

test('fair probability averages other books’ normalized two-way pairs and preserves earliest source age', () => {
  const event = fixture();
  event.bookmakers = [book('draftkings', 150, -160), book('fanduel', -125, 105), book('betmgm', -115, -105, { updated: '2026-10-23T17:50:00Z' })];
  const pick = rankPlayerProps([event], options).find(p => p.book === 'draftkings' && p.side === 'Over');
  const expectedProbability = (removeVig(-125, 105)[0] + removeVig(-115, -105)[0]) / 2;
  assert.ok(Math.abs(pick.fairProbability - expectedProbability) < 1e-12);
  assert.ok(Math.abs(pick.ev - expectedValue(150, expectedProbability)) < 1e-10);
  assert.equal(pick.referenceUpdatedAt, '2026-10-23T17:50:00.000Z');
});

test('keeps the best assessed offer per side and produces deterministic, encoded identities', () => {
  const event = fixture();
  event.bookmakers.push(book('pinnacle', 115, -135), book('williamhill_us', -110, -110));
  event.bookmakers.forEach(b => b.markets[0].outcomes.forEach(o => { o.description = 'A|B / Example'; }));
  const picks = rankPlayerProps([event, clone(event)], options);
  const over = picks.filter(p => p.side === 'Over');
  assert.equal(over.length, 1);
  assert.equal(over[0].book, 'draftkings');
  assert.equal(over[0].referenceCount, 4);
  assert.ok(over[0].referenceBooks.includes('caesars'));
  assert.equal(over[0].prices.length, 5);
  assert.equal(over[0].prices.find(p => p.book === 'pinnacle').odds, 115);
  for (const pick of picks.filter(p => p.side === 'Under')) assert.equal(pick.prices.find(p => p.book === 'pinnacle').odds, -135);
  assert.match(over[0].id, /A%7CB%20%2F%20Example/);
  assert.deepEqual(rankPlayerProps([event], options), picks);
  assert.ok(picks.every((p, index) => index === 0 || picks[index - 1].ev >= p.ev));
});

test('requires two genuinely different reference books with fresh opposite sides at exactly the same line', () => {
  assert.deepEqual(rankPlayerProps([fixture({ bookmakers: [book('draftkings', 120, -140), book('fanduel')] })], options), []);
  const changedLine = fixture();
  changedLine.bookmakers[2] = book('betmgm', -110, -110, { line: 25.5 });
  assert.deepEqual(rankPlayerProps([changedLine], options), []);
  const changedPlayer = fixture();
  changedPlayer.bookmakers[2] = book('betmgm', -110, -110, { player: 'Different Player' });
  assert.deepEqual(rankPlayerProps([changedPlayer], options), []);
  const singleSide = fixture();
  singleSide.bookmakers[2].markets[0].outcomes.pop();
  assert.deepEqual(rankPlayerProps([singleSide], options), []);
  const duplicateReference = fixture({ bookmakers: [book('draftkings', 120, -140), book('fanduel'), book('fanduel')] });
  assert.deepEqual(rankPlayerProps([duplicateReference], options), []);
  const duplicatedOutcome = fixture();
  duplicatedOutcome.bookmakers[2].markets[0].outcomes.push(clone(duplicatedOutcome.bookmakers[2].markets[0].outcomes[0]));
  assert.deepEqual(rankPlayerProps([duplicatedOutcome], options), []);
});

test('does not treat integer push lines, malformed prices, or non-exhaustive outcomes as EV picks', () => {
  for (const line of [24, 24.25, -1.5, NaN, '24.5']) {
    const event = fixture({ bookmakers: [book('draftkings', 120, -140, { line }), book('fanduel', -110, -110, { line }), book('betmgm', -110, -110, { line })] });
    assert.deepEqual(rankPlayerProps([event], options), []);
  }
  for (const price of [0, 50, -50, Infinity, '110', 1e8]) {
    const event = fixture();
    event.bookmakers[2].markets[0].outcomes[0].price = price;
    assert.deepEqual(rankPlayerProps([event], options), []);
  }
  const draw = fixture();
  draw.bookmakers[2].markets[0].outcomes.push({ name: 'Draw', description: 'Example Player', point: 24.5, price: 900 });
  assert.deepEqual(rankPlayerProps([draw], options), []);
  const unknownSide = fixture();
  unknownSide.bookmakers[2].markets[0].outcomes[1].name = 'Yes';
  assert.deepEqual(rankPlayerProps([unknownSide], options), []);
});

test('filters started events, next local calendar days, invalid dates, stale sources, and future source clocks', () => {
  for (const start of ['2026-10-23T18:00:00Z', '2026-10-23T17:00:00Z', '2026-10-24T07:00:00Z', 'bad-date', '2026-02-31T22:00:00Z']) {
    assert.deepEqual(rankPlayerProps([fixture({ commence_time: start })], options), []);
  }
  for (const updated of ['2026-10-23T17:44:59Z', '2026-10-23T18:02:01Z', 'not-a-time', '2026-02-31T18:00:00Z']) {
    const event = fixture();
    event.bookmakers[2].markets[0].last_update = updated;
    assert.deepEqual(rankPlayerProps([event], options), []);
  }
  const boundary = fixture();
  boundary.bookmakers[2].markets[0].last_update = '2026-10-23T17:45:00Z';
  assert.ok(rankPlayerProps([boundary], options).length > 0);
  const fallback = fixture();
  delete fallback.bookmakers[2].markets[0].last_update;
  assert.ok(rankPlayerProps([fallback], options).length > 0);
});

test('uses timezone calendar boundaries and independently expires stored target/reference prices', () => {
  assert.equal(localDateKey('2026-10-24T01:00:00Z', 'America/Denver'), '2026-10-23');
  assert.equal(localDateKey('2026-10-24T01:00:00Z', 'UTC'), '2026-10-24');
  assert.equal(localDateKey(NOW, 'America/Denver'), '2026-10-23');
  assert.deepEqual(rankPlayerProps([fixture()], { ...options, timeZone: 'UTC' }), []);
  const pick = rankPlayerProps([fixture()], options)[0];
  assert.equal(isPropCurrent(pick, options), true);
  assert.equal(isPropCurrent(pick, { ...options, now: NOW + 14 * 60_000 }), false);
  assert.equal(isPropCurrent({ ...pick, referenceUpdatedAt: '2026-10-23T17:44:59Z' }, options), false);
  assert.equal(isPropCurrent({ ...pick, startsAt: '2026-10-23T18:00:00Z' }, options), false);
  assert.equal(isPropCurrent(null, options), false);
});

test('supports NFL and Soccer paired player props while excluding unsupported scorer-only markets', () => {
  const nfl = fixture({ sport_key: PROP_SPORTS.NFL, sport_title: 'NFL', bookmakers: [book('draftkings', 120, -140, { market: 'player_pass_yds', line: 250.5 }), book('fanduel', -110, -110, { market: 'player_pass_yds', line: 250.5 }), book('betmgm', -110, -110, { market: 'player_pass_yds', line: 250.5 })] });
  const nflPicks = rankPlayerProps([nfl], { ...options, sport: 'NFL' });
  assert.equal(nflPicks[0].sport, 'NFL');
  assert.equal(nflPicks[0].marketLabel, 'Passing yards');
  const soccer = fixture({ sport_key: 'soccer_spain_la_liga', sport_title: 'La Liga', bookmakers: [book('draftkings', 120, -140, { market: 'player_shots_on_target', line: .5 }), book('fanduel', -110, -110, { market: 'player_shots_on_target', line: .5 }), book('betmgm', -110, -110, { market: 'player_shots_on_target', line: .5 })] });
  const soccerPicks = rankPlayerProps([soccer], { ...options, sport: 'SOCCER' });
  assert.equal(soccerPicks[0].sport, 'SOCCER');
  assert.equal(soccerPicks[0].league, 'La Liga');
  assert.equal(soccerPicks[0].marketLabel, 'Shots on target');
  soccer.bookmakers.forEach(b => { b.markets[0].key = 'player_anytime_goalscorer'; });
  assert.deepEqual(rankPlayerProps([soccer], { ...options, sport: 'SOCCER' }), []);
  assert.deepEqual(rankPlayerProps([nfl], options), []);
  assert.ok(Object.hasOwn(PROP_MARKETS.SOCCER, 'player_shots'));
});

test('malformed untrusted events do not throw and invalid calculation options are rejected', () => {
  assert.deepEqual(rankPlayerProps(null, options), []);
  assert.deepEqual(rankPlayerProps([null, [], 'event', 42, {}, { ...fixture(), bookmakers: null }], options), []);
  for (const changed of [{ sport: 'INVALID' }, { now: NaN }, { timeZone: 'not-a-zone' }, { minEdge: -1 }, { minEdge: Infinity }, { maxAgeMinutes: 0 }, { maxAgeMinutes: Infinity }]) {
    assert.throws(() => rankPlayerProps([], { ...options, ...changed }));
  }
  assert.throws(() => localDateKey('bad-date'));
  assert.throws(() => localDateKey(NOW, 'bad-zone'));
});

test('stored picks must retain finite consistent prices, positive EV, and independent reference identity', () => {
  const pick = rankPlayerProps([fixture()], options)[0];
  for (const changed of [
    { sport: 'BAD' }, { odds: Infinity }, { odds: 50 }, { fairProbability: 0 }, { fairProbability: 1 },
    { fairProbability: NaN }, { ev: Infinity }, { ev: 0 }, { ev: -1 }, { ev: pick.ev + 1 },
    { referenceCount: 1 }, { referenceCount: 3 }, { referenceBooks: ['fanduel', 'fanduel'] },
    { referenceBooks: ['fanduel', 'draftkings'] }, { referenceBooks: ['fanduel', 'unknown'] },
    { prices: 'bad' }, { prices: [] }, { prices: [{ book: 'draftkings', odds: 120, updatedAt: UPDATED }] },
    { prices: pick.prices.map(p => ({ ...p, updatedAt: '2026-10-23T17:44:59Z' })) },
    { line: 24 }, { side: 'Yes' }, { event: '' }, { startsAt: 'invalid-date' }, { referenceUpdatedAt: 'invalid-date' },
  ]) assert.equal(isPropCurrent({ ...pick, ...changed }, options), false, JSON.stringify(changed));
  assert.equal(isPropCurrent({ ...pick, sport: 'BAD' }, { now: NOW }), false);
});
