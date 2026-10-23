import test from 'node:test';
import assert from 'node:assert/strict';
import {
  americanToDecimal,
  decimalToAmerican,
  impliedProbability,
  removeVig,
  expectedValue,
  kellyStake,
  arbitrage,
} from '../src/lib/odds.js';

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}

test('American and decimal odds convert favorites, underdogs, and even money', () => {
  close(americanToDecimal(150), 2.5);
  close(americanToDecimal(-200), 1.5);
  close(americanToDecimal(-110), 21 / 11);
  close(americanToDecimal(100), 2);
  close(decimalToAmerican(2.5), 150);
  close(decimalToAmerican(1.5), -200);
  close(decimalToAmerican(2), 100);
  close(decimalToAmerican(americanToDecimal(-115)), -115);
});

test('implied probability and vig removal distinguish price from fair probability', () => {
  close(impliedProbability(150), 0.4);
  close(impliedProbability(-200), 2 / 3);
  assert.deepEqual(removeVig(-110, -110), [0.5, 0.5]);
  const [favorite, underdog] = removeVig(-150, 130);
  close(favorite + underdog, 1);
  close(favorite, 0.6 / (0.6 + 1 / 2.3));
  assert.ok(favorite < impliedProbability(-150));
});

test('expected value returns the expected profit percentage per unit staked', () => {
  close(expectedValue(150, 0.45), 12.5);
  close(expectedValue(-200, 0.6), -10);
  close(expectedValue(100, 0.5), 0);
  close(expectedValue(150, 0), -100);
  close(expectedValue(150, 1), 150);
});

test('fractional Kelly sizes a positive edge and declines negative edges', () => {
  close(kellyStake(100, 0.6, 1000), 50);
  close(kellyStake(100, 0.6, 1000, 1), 200);
  close(kellyStake(150, 0.45, 1200, 0.5), 50);
  close(kellyStake(-200, 0.6, 1000), 0);
  close(kellyStake(100, 0.8, 0), 0);
  close(kellyStake(100, 1, 1000, 1), 1000);
  close(kellyStake(100, 0.8, 1000, 0), 0);
});

test('arbitrage balances both payouts and reports the actual return', () => {
  const result = arbitrage(110, 110, 100);
  assert.equal(result.isArbitrage, true);
  close(result.impliedSum, 20 / 21);
  close(result.stakeA, 50);
  close(result.stakeB, 50);
  close(result.payout, 105);
  close(result.profit, 5);
  close(result.roi, 5);

  const uneven = arbitrage(150, -120, 1000);
  assert.equal(uneven.isArbitrage, true);
  close(uneven.stakeA + uneven.stakeB, 1000);
  close(uneven.stakeA * americanToDecimal(150), uneven.payout);
  close(uneven.stakeB * americanToDecimal(-120), uneven.payout);
  close(uneven.profit, uneven.payout - 1000);
});

test('break-even, losing markets, and zero stake are not misreported as profit', () => {
  const even = arbitrage(100, 100, 100);
  assert.equal(even.isArbitrage, false);
  close(even.profit, 0);
  const losing = arbitrage(-110, -110, 100);
  assert.equal(losing.isArbitrage, false);
  assert.ok(losing.profit < 0);
  const zero = arbitrage(110, 110, 0);
  close(zero.stakeA, 0);
  close(zero.stakeB, 0);
  close(zero.payout, 0);
  close(zero.profit, 0);
  close(zero.roi, 5);
});

test('invalid prices, probabilities, bankrolls, fractions, and stakes are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity, '110', null, undefined]) {
    assert.throws(() => americanToDecimal(value), TypeError);
    assert.throws(() => decimalToAmerican(value), TypeError);
  }
  assert.throws(() => americanToDecimal(0), RangeError);
  assert.throws(() => impliedProbability(0), RangeError);
  for (const value of [1, 0, -2]) assert.throws(() => decimalToAmerican(value), RangeError);
  for (const value of [-0.01, 1.01]) {
    assert.throws(() => expectedValue(100, value), RangeError);
    assert.throws(() => kellyStake(100, value, 1000), RangeError);
    assert.throws(() => kellyStake(100, 0.6, 1000, value), RangeError);
  }
  assert.throws(() => expectedValue(100, NaN), TypeError);
  assert.throws(() => removeVig(-110, 0), RangeError);
  assert.throws(() => kellyStake(100, 0.6, -1), RangeError);
  assert.throws(() => kellyStake(100, 0.6, Infinity), TypeError);
  assert.throws(() => arbitrage(110, 110, -100), RangeError);
  assert.throws(() => arbitrage(110, 110, NaN), TypeError);
});
