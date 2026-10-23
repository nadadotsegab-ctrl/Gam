import { americanToDecimal } from './odds.js';

const supportedBooks = new Set(['draftkings', 'fanduel', 'betmgm', 'caesars', 'pinnacle']);
const supportedSports = new Set(['NBA', 'NFL', 'MLB', 'NHL']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, label, maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} must be a nonempty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function odds(value, label) {
  try {
    if (typeof value !== 'number' || Math.abs(value) < 100 || Math.abs(value) > 1e6) throw new Error();
    const decimal = americanToDecimal(value);
    if (!Number.isFinite(decimal) || decimal <= 1) throw new Error();
  } catch {
    throw new Error(`${label} must be finite American odds with an absolute value between 100 and 1,000,000.`);
  }
  return value;
}

function timestamp(value, label) {
  const candidate = text(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(candidate);
  if (!match) throw new Error(`${label} must be an ISO timestamp with a timezone.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(candidate))) {
    throw new Error(`${label} must contain a valid calendar date and time.`);
  }
  return new Date(candidate).toISOString();
}

/** Parse an import file into validated, sanitized dashboard market records. */
export function parseMarketImport(jsonString) {
  if (typeof jsonString !== 'string') throw new Error('Import must contain JSON text.');
  let payload;
  try {
    payload = JSON.parse(jsonString);
  } catch {
    throw new Error('Import is not valid JSON. Use an object containing a markets array.');
  }
  if (!object(payload) || !Array.isArray(payload.markets) || payload.markets.length < 1 || payload.markets.length > 500) {
    throw new Error('Import must contain a markets array with 1 to 500 records.');
  }
  const ids = new Set();
  return payload.markets.map((record, index) => {
    const label = `Market ${index + 1}`;
    if (!object(record)) throw new Error(`${label} must be an object.`);
    const id = text(record.id, `${label} id`, 100);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) {
      throw new Error(`${label} id may contain letters, numbers, dots, colons, underscores, and hyphens.`);
    }
    if (ids.has(id)) throw new Error(`${label} duplicates id "${id}". Each id must be unique.`);
    ids.add(id);
    if (!supportedSports.has(record.sport)) throw new Error(`${label} sport must be NBA, NFL, MLB, or NHL.`);
    if (!object(record.odds) || Object.keys(record.odds).length === 0) {
      throw new Error(`${label} odds must contain at least one supported sportsbook price.`);
    }
    const prices = {};
    for (const [book, value] of Object.entries(record.odds)) {
      if (!supportedBooks.has(book)) throw new Error(`${label} has unsupported sportsbook "${book}".`);
      prices[book] = odds(value, `${label} ${book} odds`);
    }
    let trend = [];
    if (record.trend !== undefined) {
      if (!Array.isArray(record.trend) || record.trend.length > 100
        || record.trend.some(point => typeof point !== 'number' || !Number.isFinite(point))) {
        throw new Error(`${label} trend must be an array of at most 100 finite numbers.`);
      }
      trend = record.trend.map((point, pointIndex) => odds(point, `${label} trend point ${pointIndex + 1}`));
    }
    return {
      id,
      sport: record.sport,
      league: text(record.league, `${label} league`),
      event: text(record.event, `${label} event`),
      selection: text(record.selection, `${label} selection`),
      market: text(record.market, `${label} market`),
      startsAt: timestamp(record.startsAt, `${label} startsAt`),
      odds: prices,
      fairOdds: odds(record.fairOdds, `${label} fairOdds`),
      trend,
    };
  });
}

/** Serialize cell arrays as CSV, guarding text against spreadsheet formulas. */
export function csvString(rows) {
  if (!Array.isArray(rows)) throw new TypeError('CSV rows must be an array.');
  const lines = rows.map(row => {
    if (!Array.isArray(row)) throw new TypeError('Each CSV row must be an array of cells.');
    return row.map(cell => {
      let value;
      if (cell === null || cell === undefined) value = '';
      else if (typeof cell === 'number') {
        if (!Number.isFinite(cell)) throw new TypeError('CSV numbers must be finite.');
        value = String(cell);
      } else if (typeof cell === 'string') {
        value = /^[\s\uFEFF]*[=+\-@]/.test(cell) ? `'${cell}` : cell;
      } else if (typeof cell === 'boolean') value = String(cell);
      else throw new TypeError('CSV cells must be strings, finite numbers, booleans, or empty.');
      return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    }).join(',');
  });
  return lines.length ? `${lines.join('\r\n')}\r\n` : '';
}

/** Net settled profit: the original stake is excluded from winning returns. */
export function betProfit(bet) {
  if (!object(bet)) throw new TypeError('Bet must be an object.');
  if (!['pending', 'void', 'won', 'lost'].includes(bet.status)) {
    throw new Error('Bet status must be pending, void, won, or lost.');
  }
  if (typeof bet.stake !== 'number' || !Number.isFinite(bet.stake) || bet.stake < 0 || bet.stake > 1e8) {
    throw new Error('Bet stake must be a finite number between zero and 100,000,000.');
  }
  const decimal = americanToDecimal(odds(bet.odds, 'Bet odds'));
  if (bet.status === 'pending' || bet.status === 'void') return 0;
  return bet.status === 'won' ? bet.stake * (decimal - 1) : -bet.stake;
}
