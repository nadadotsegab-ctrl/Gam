import { americanToDecimal, decimalToAmerican } from './odds.js';

/** Quoted payout math ONLY: no prediction, parlay EV or implied leg independence. */
export function calculateSlip(legs, stake = 10) {
  if (!Array.isArray(legs) || legs.length < 2 || legs.length > 8) throw new Error('A slip must contain 2 to 8 legs.');
  if (!Number.isFinite(stake) || stake <= 0 || stake > 100000) throw new Error('Enter a stake between $0.01 and $100,000.');
  const cleaned = legs.map((leg, index) => {
    const selection = typeof leg.selection === 'string' ? leg.selection.trim() : '';
    const event = typeof leg.event === 'string' ? leg.event.trim() : '';
    const odds = typeof leg.odds === 'string' && leg.odds.trim() === '' ? NaN : Number(leg.odds);
    if (!selection || selection.length > 180) throw new Error('Enter a selection for leg ' + (index + 1) + '.');
    if (!Number.isFinite(odds) || !Number.isInteger(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 100000) throw new Error('Enter valid American odds for leg ' + (index + 1) + ', such as -110 or +150.');
    return {selection, event, odds, decimal: americanToDecimal(odds)};
  });
  const payoutMultiplier = cleaned.reduce((acc, leg) => acc * leg.decimal, 1);
  const signatures = cleaned.map(leg => (leg.event + '|' + leg.selection).toLowerCase());
  const eventCounts = cleaned.filter(leg => leg.event).map(leg => leg.event.toLowerCase());
  const warnings = [];
  if (new Set(signatures).size !== signatures.length) warnings.push('The slip repeats the same selection. Check for duplicates.');
  if (new Set(eventCounts).size !== eventCounts.length) warnings.push('Two or more legs are in the same event. Bookmakers may change or reject correlated parlays.');
  if (eventCounts.length < cleaned.length) warnings.push('Some event names are missing; correlations cannot be screened.');
  warnings.push('Combined winning probability is unknown. Payout odds alone do not establish betting value or likelihood of winning.');
  return {payoutMultiplier, americanOdds:decimalToAmerican(payoutMultiplier), potentialPayout:stake*payoutMultiplier, potentialProfit:stake*(payoutMultiplier-1), stake, warnings};
}
