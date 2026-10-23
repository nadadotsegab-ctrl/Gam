import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarketImport, csvString, betProfit } from '../src/lib/storage.js';
import { markets } from '../src/data/markets.js';

const valid = {
  id: 'test-bos-lal', sport: 'NBA', league: 'NBA',
  event: 'Boston vs. Los Angeles', selection: 'Boston', market: 'Moneyline',
  startsAt: '2026-10-24T23:30:00Z',
  odds: { draftkings: -110, fanduel: 105 }, fairOdds: -105,
};
const importRecord = patch => parseMarketImport(JSON.stringify({ markets: [{ ...valid, ...patch }] }));

test('imports the current fixtures and sanitizes records with optional trends', () => {
  assert.equal(parseMarketImport(JSON.stringify({ markets })).length, markets.length);
  const [record] = importRecord({ event: '  Boston vs. Los Angeles  ', unexpected: 'discard me' });
  assert.equal(record.event, 'Boston vs. Los Angeles');
  assert.deepEqual(record.trend, []);
  assert.equal(record.startsAt, '2026-10-24T23:30:00.000Z');
  assert.equal(Object.hasOwn(record, 'unexpected'), false);
  assert.deepEqual(importRecord({ trend: [100, 105, -110] })[0].trend, [100, 105, -110]);
});

test('rejects malformed imports, missing arrays, empty arrays, oversized arrays, duplicate ids', () => {
  assert.throws(() => parseMarketImport('{'), /valid JSON/);
  assert.throws(() => parseMarketImport(null), /JSON text/);
  for (const payload of [null, [], {}, { markets: [] }, { markets: Array(501).fill(valid) }]) {
    assert.throws(() => parseMarketImport(JSON.stringify(payload)), /1 to 500/);
  }
  assert.throws(() => parseMarketImport(JSON.stringify({ markets: [null] })), /must be an object/);
  assert.throws(() => parseMarketImport(JSON.stringify({ markets: [valid, valid] })), /duplicates id/);
});

test('validates market text, sports, dates, book ids, and numeric odds', () => {
  for (const field of ['id', 'league', 'event', 'selection', 'market']) {
    assert.throws(() => importRecord({ [field]: '' }), new RegExp(field));
    assert.throws(() => importRecord({ [field]: 'x'.repeat(201) }), new RegExp(field));
  }
  assert.throws(() => importRecord({ id: 'x'.repeat(101) }), /id/);
  assert.throws(() => importRecord({ id: 'has spaces' }), /id may contain/);
  assert.throws(() => importRecord({ sport: 'SOCCER' }), /sport/);
  for (const startsAt of ['yesterday', '2026-10-24', '2026-02-30T12:00:00Z', '2026-10-24T24:00:00Z']) {
    assert.throws(() => importRecord({ startsAt }), /startsAt/);
  }
  assert.equal(importRecord({ startsAt: '2028-02-29T12:00:00-06:00' })[0].startsAt, '2028-02-29T18:00:00.000Z');
  assert.throws(() => importRecord({ odds: {} }), /at least one/);
  assert.throws(() => importRecord({ odds: { unknown: 110 } }), /unsupported sportsbook/);
  assert.throws(() => importRecord({ odds: { draftkings: '110' } }), /American odds/);
  assert.throws(() => importRecord({ odds: { draftkings: 0 } }), /American odds/);
  assert.throws(() => importRecord({ fairOdds: 0 }), /fairOdds/);
  assert.throws(() => importRecord({ fairOdds: null }), /fairOdds/);
  assert.throws(() => importRecord({ trend: [100, '110'] }), /trend/);
  assert.throws(() => importRecord({ trend: Array(101).fill(100) }), /trend/);
});

test('imported prices, fair odds, and trends enforce canonical bounded American odds', () => {
  for (const value of [-99, 99, -1, 1, -1_000_001, 1_000_001, Number.MAX_VALUE]) {
    assert.throws(() => importRecord({ odds: { draftkings: value } }), /American odds/);
    assert.throws(() => importRecord({ fairOdds: value }), /fairOdds/);
    assert.throws(() => importRecord({ trend: [100, value] }), /trend point 2/);
  }
  for (const value of [-100, 100, -1_000_000, 1_000_000]) {
    const [record] = importRecord({ odds: { draftkings: value }, fairOdds: value, trend: [value] });
    assert.equal(record.odds.draftkings, value);
    assert.equal(record.fairOdds, value);
    assert.deepEqual(record.trend, [value]);
  }
});

test('CSV serialization escapes commas, quotes, newlines, and empty values', () => {
  assert.equal(csvString([
    ['event', 'notes', 'stake', 'status'],
    ['Boston, MA', 'a "quoted"\nnote', 25.5, null],
  ]), 'event,notes,stake,status\r\n"Boston, MA","a ""quoted""\nnote",25.5,\r\n');
  assert.equal(csvString([]), '');
  assert.throws(() => csvString([{}]), /row must be an array/);
  assert.throws(() => csvString([[Infinity]]), /finite/);
});

test('CSV neutralizes formula text while retaining negative numeric data', () => {
  assert.equal(csvString([['=1+1', '+SUM(A1)', '-50', '@SUM(A1)', '\t=1+1', '  =1+1', -50, 105]]),
    "'=1+1,'+SUM(A1),'-50,'@SUM(A1),'\t=1+1,'  =1+1,-50,105\r\n");
});

test('bet profit distinguishes gross payout from profit and handles all statuses', () => {
  assert.equal(betProfit({ status: 'won', odds: 150, stake: 20 }), 30);
  assert.equal(betProfit({ status: 'won', odds: -200, stake: 20 }), 10);
  assert.equal(betProfit({ status: 'lost', odds: 150, stake: 20 }), -20);
  assert.equal(betProfit({ status: 'pending', odds: 150, stake: 20 }), 0);
  assert.equal(betProfit({ status: 'void', odds: 150, stake: 20 }), 0);
  assert.equal(betProfit({ status: 'won', odds: 150, stake: 0 }), 0);
});

test('bet profit rejects invalid status, odds, and stake', () => {
  assert.throws(() => betProfit(null), /object/);
  assert.throws(() => betProfit({ status: 'win', odds: 150, stake: 20 }), /status/);
  assert.throws(() => betProfit({ status: 'won', odds: 0, stake: 20 }), /odds/);
  assert.throws(() => betProfit({ status: 'won', odds: 150, stake: -20 }), /stake/);
  assert.throws(() => betProfit({ status: 'won', odds: 150, stake: '20' }), /stake/);
  assert.throws(() => betProfit({ status: 'won', odds: 150, stake: NaN }), /stake/);
  assert.throws(() => betProfit({ status: 'won', odds: 150, stake: 100_000_001 }), /stake/);
  assert.throws(() => betProfit({ status: 'won', odds: 99, stake: 20 }), /American odds/);
  assert.throws(() => betProfit({ status: 'won', odds: 1_000_001, stake: 20 }), /American odds/);
  assert.equal(betProfit({ status: 'won', odds: 1_000_000, stake: 100_000_000 }), 1_000_000_000_000);
});
