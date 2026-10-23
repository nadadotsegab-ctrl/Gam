/** Betting calculations use decimal probabilities (0–1) and return money unrounded. */

function finiteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  return value;
}

function probability(value, name = 'Win probability') {
  finiteNumber(value, name);
  if (value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1.`);
  }
  return value;
}

function nonnegative(value, name) {
  finiteNumber(value, name);
  if (value < 0) throw new RangeError(`${name} must be zero or greater.`);
  return value;
}

/** Convert American odds such as +150 or -110 to their decimal payout multiple. */
export function americanToDecimal(americanOdds) {
  finiteNumber(americanOdds, 'American odds');
  if (americanOdds === 0) throw new RangeError('American odds cannot be zero.');
  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / -americanOdds;
}

/** Convert decimal odds to American odds; display code can round the result. */
export function decimalToAmerican(decimalOdds) {
  finiteNumber(decimalOdds, 'Decimal odds');
  if (decimalOdds <= 1) throw new RangeError('Decimal odds must be greater than 1.');
  return decimalOdds >= 2 ? (decimalOdds - 1) * 100 : -100 / (decimalOdds - 1);
}

/** The break-even probability at the quoted American odds, including bookmaker vig. */
export function impliedProbability(americanOdds) {
  return 1 / americanToDecimal(americanOdds);
}

/** Normalize a two-outcome market into [probabilityA, probabilityB] without vig. */
export function removeVig(oddsA, oddsB) {
  const probabilityA = impliedProbability(oddsA);
  const probabilityB = impliedProbability(oddsB);
  const total = probabilityA + probabilityB;
  return [probabilityA / total, probabilityB / total];
}

/** Expected return on stake in percent, based on the supplied true win probability. */
export function expectedValue(americanOdds, winProbability) {
  const decimal = americanToDecimal(americanOdds);
  probability(winProbability);
  return (winProbability * decimal - 1) * 100;
}

/** Fractional Kelly stake; negative-edge wagers receive a zero stake. */
export function kellyStake(americanOdds, winProbability, bankroll, fraction = 0.25) {
  const netPayout = americanToDecimal(americanOdds) - 1;
  probability(winProbability);
  nonnegative(bankroll, 'Bankroll');
  probability(fraction, 'Kelly fraction');
  const fullKelly = (netPayout * winProbability - (1 - winProbability)) / netPayout;
  return bankroll * fraction * Math.max(0, Math.min(1, fullKelly));
}

/**
 * Allocate a total stake across mutually exclusive, exhaustive outcomes so that
 * either outcome pays the same amount. Fees, limits, void rules, and odds changes
 * are not included. ROI is a percentage and is defined even for a zero stake.
 */
export function arbitrage(oddsA, oddsB, totalStake) {
  const decimalA = americanToDecimal(oddsA);
  const decimalB = americanToDecimal(oddsB);
  nonnegative(totalStake, 'Total stake');
  const impliedA = 1 / decimalA;
  const impliedB = 1 / decimalB;
  const impliedSum = impliedA + impliedB;
  const stakeA = totalStake * impliedA / impliedSum;
  const stakeB = totalStake * impliedB / impliedSum;
  const payout = totalStake / impliedSum;
  return {
    impliedSum,
    isArbitrage: impliedSum < 1 - Number.EPSILON * 8,
    stakeA,
    stakeB,
    payout,
    profit: payout - totalStake,
    roi: (1 / impliedSum - 1) * 100,
  };
}
