import { americanToDecimal, expectedValue, removeVig } from './odds.js';

/** The soccer code is a default; rankPlayerProps accepts any soccer_* league. */
export const PROP_SPORTS = Object.freeze({
  NBA: 'basketball_nba',
  NFL: 'americanfootball_nfl',
  SOCCER: 'soccer_epl',
});

export const PROP_MARKETS = Object.freeze({
  NBA: Object.freeze({
    player_points: 'Points',
    player_rebounds: 'Rebounds',
    player_assists: 'Assists',
    player_threes: '3-pointers made',
  }),
  NFL: Object.freeze({
    player_pass_yds: 'Passing yards',
    player_rush_yds: 'Rushing yards',
    player_reception_yds: 'Receiving yards',
    player_receptions: 'Receptions',
  }),
  SOCCER: Object.freeze({
    player_shots: 'Shots',
    player_shots_on_target: 'Shots on target',
  }),
});

const BOOKS = Object.freeze({
  draftkings: 'draftkings',
  fanduel: 'fanduel',
  betmgm: 'betmgm',
  williamhill_us: 'caesars',
  pinnacle: 'pinnacle',
});
const supportedBookIds = new Set(Object.values(BOOKS));
const futureClockAllowance = 2 * 60_000;
const isoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/;

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function label(value, maxLength = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
    ? value.trim() : null;
}

function timestamp(value) {
  if (typeof value !== 'string') return null;
  const match = isoDate.exec(value);
  if (!match) return null;
  const [, yr, mo, dy, hr, mi, se, , , offsetHr = '0', offsetMi = '0'] = match;
  const [year, month, day, hour, minute, second] = [yr, mo, dy, hr, mi, se].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || hour > 23 || minute > 59 || second > 59 || Number(offsetHr) > 23 || Number(offsetMi) > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A calendar date in the user's timezone, not the server's local calendar. */
export function localDateKey(date, timeZone = 'America/Denver') {
  if (typeof timeZone !== 'string' || !timeZone) throw new TypeError('Choose a valid IANA timezone.');
  const input = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(input.getTime())) throw new RangeError('Date must be valid.');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(input);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function optionsContext({ sport = 'NBA', now = Date.now(), timeZone = 'America/Denver', minEdge = 0, maxAgeMinutes = 15 } = {}) {
  if (!Object.hasOwn(PROP_SPORTS, sport)) throw new RangeError('Choose sport NBA, NFL, or SOCCER.');
  if (typeof now !== 'number' || !Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError('Now must be a valid timestamp.');
  if (typeof minEdge !== 'number' || !Number.isFinite(minEdge) || minEdge < 0) throw new RangeError('Minimum edge must be a nonnegative finite percentage.');
  if (typeof maxAgeMinutes !== 'number' || !Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0 || maxAgeMinutes > 1440) throw new RangeError('Maximum price age must be between zero and 1,440 minutes.');
  return { sport, now, timeZone, minEdge, maxAgeMs: maxAgeMinutes * 60_000, dateKey: localDateKey(now, timeZone) };
}

function fresh(value, context) {
  const parsed = timestamp(value);
  return parsed !== null && parsed >= context.now - context.maxAgeMs && parsed <= context.now + futureClockAllowance;
}

function upcomingToday(startsAt, context) {
  const parsed = timestamp(startsAt);
  return parsed !== null && parsed > context.now && localDateKey(parsed, context.timeZone) === context.dateKey;
}

function validPrice(price) {
  return typeof price === 'number' && Number.isFinite(price) && Math.abs(price) >= 100 && Math.abs(price) <= 1e6;
}

function halfPoint(point) {
  return typeof point === 'number' && Number.isFinite(point) && point >= 0 && point <= 1e6
    && Number.isInteger(point * 2) && !Number.isInteger(point);
}

function matchesSport(event, sport) {
  return sport === 'SOCCER' ? typeof event.sport_key === 'string' && /^soccer_[A-Za-z0-9_]+$/.test(event.sport_key)
    : event.sport_key === PROP_SPORTS[sport];
}

/** Reject previously fetched props after their event starts, day changes, or any source price ages out. */
export function isPropCurrent(record, options = {}) {
  const recordSport = object(record) && Object.hasOwn(PROP_SPORTS, record.sport) ? record.sport : 'NBA';
  const context = optionsContext({ ...options, sport: options.sport ?? recordSport });
  if (!object(record) || record.sport !== context.sport || !label(record.id, 1200) || !label(record.eventId, 100)
    || !label(record.event, 205) || !label(record.player, 100) || !Object.hasOwn(PROP_MARKETS[context.sport], record.marketKey)
    || !['Over', 'Under'].includes(record.side) || !halfPoint(record.line) || !supportedBookIds.has(record.book)
    || !validPrice(record.odds) || typeof record.fairProbability !== 'number' || !Number.isFinite(record.fairProbability)
    || record.fairProbability <= 0 || record.fairProbability >= 1 || typeof record.ev !== 'number' || !Number.isFinite(record.ev)
    || record.ev <= 1e-9 || record.ev + 1e-9 < context.minEdge || !Array.isArray(record.referenceBooks)
    || record.referenceBooks.length < 2 || record.referenceBooks.length > 4
    || record.referenceCount !== record.referenceBooks.length
    || new Set(record.referenceBooks).size !== record.referenceBooks.length
    || record.referenceBooks.some(book => !supportedBookIds.has(book) || book === record.book)) return false;
  if (Math.abs(expectedValue(record.odds, record.fairProbability) - record.ev) > 1e-6) return false;
  if (record.prices !== undefined) {
    if (!Array.isArray(record.prices) || record.prices.length < 3 || record.prices.length > 5
      || new Set(record.prices.map(quote => quote?.book)).size !== record.prices.length
      || record.prices.some(quote => !object(quote) || !supportedBookIds.has(quote.book) || !validPrice(quote.odds) || !fresh(quote.updatedAt, context))
      || !record.prices.some(quote => quote.book === record.book && quote.odds === record.odds)) return false;
  }
  return upcomingToday(record.startsAt, context)
    && fresh(record.priceUpdatedAt, context) && fresh(record.referenceUpdatedAt, context);
}

/**
 * Rank market-price discrepancies, not forecasts of player performance.
 * Each target quote is excluded from its own fair-probability estimate. Two
 * other fresh books must offer both opposite outcomes at the identical player
 * and half-point line. Integer lines are excluded because pushes require a
 * separate probability model. Outcomes without exhaustive Over/Under pairs,
 * stale prices, started events, and other calendar days cannot become picks.
 * Each pick includes prices:[{book,odds,updatedAt}] for comparing all fresh
 * supported books at that exact event/player/market/line/side.
 */
export function rankPlayerProps(events, options = {}) {
  const context = optionsContext(options);
  if (!Array.isArray(events)) return [];
  const best = new Map();
  const seenEvents = new Set();
  for (const event of events) {
    if (!object(event) || !matchesSport(event, context.sport)) continue;
    const eventId = label(event.id, 100), away = label(event.away_team, 100), home = label(event.home_team, 100);
    if (!eventId || !away || !home || away === home || seenEvents.has(eventId)
      || !upcomingToday(event.commence_time, context) || !Array.isArray(event.bookmakers)) continue;
    seenEvents.add(eventId);
    const groups = new Map();
    for (const book of event.bookmakers) {
      if (!object(book) || !Object.hasOwn(BOOKS, book.key) || !Array.isArray(book.markets)) continue;
      const bookId = BOOKS[book.key];
      for (const market of book.markets) {
        if (!object(market) || !Object.hasOwn(PROP_MARKETS[context.sport], market.key) || !Array.isArray(market.outcomes)) continue;
        const updatedAt = market.last_update ?? book.last_update;
        if (!fresh(updatedAt, context)) continue;
        for (const outcome of market.outcomes) {
          if (!object(outcome)) continue;
          const player = label(outcome.description, 100);
          if (!player || !halfPoint(outcome.point)) continue;
          const groupId = JSON.stringify([market.key, player, outcome.point]);
          if (!groups.has(groupId)) groups.set(groupId, { marketKey: market.key, player, line: outcome.point, books: new Map() });
          const group = groups.get(groupId);
          if (!group.books.has(bookId)) group.books.set(bookId, { book: bookId, rows: [], updatedAt });
          const pair = group.books.get(bookId);
          // Multiple sets from the same bookmaker never count as independent
          // references. Duplicated/conflicting outcomes make that pair unusable.
          pair.rows.push(outcome);
          if (Date.parse(updatedAt) < Date.parse(pair.updatedAt)) pair.updatedAt = updatedAt;
        }
      }
    }
    for (const group of groups.values()) {
      const pairs = [...group.books.values()].flatMap(pair => {
        if (pair.rows.length !== 2) return [];
        const over = pair.rows.find(outcome => outcome.name === 'Over');
        const under = pair.rows.find(outcome => outcome.name === 'Under');
        if (!over || !under || !validPrice(over.price) || !validPrice(under.price)) return [];
        return [{ ...pair, over: over.price, under: under.price, probability: removeVig(over.price, under.price) }];
      });
      if (pairs.length < 3) continue;
      for (const target of pairs) {
        const references = pairs.filter(pair => pair.book !== target.book);
        if (references.length < 2) continue;
        for (const [index, side] of ['Over', 'Under'].entries()) {
          const fairProbability = references.reduce((sum, pair) => sum + pair.probability[index], 0) / references.length;
          const odds = index === 0 ? target.over : target.under;
          const ev = expectedValue(odds, fairProbability);
          if (!Number.isFinite(ev) || ev <= 1e-9 || ev + 1e-9 < context.minEdge) continue;
          const id = [eventId, group.marketKey, group.player, group.line, side].map(value => encodeURIComponent(String(value))).join('|');
          const existing = best.get(id);
          // The per-side record is the best independently assessed offer, not
          // simply the largest raw American price before estimating fairness.
          if (existing && (existing.ev > ev || (existing.ev === ev && existing.book.localeCompare(target.book) <= 0))) continue;
          const earliestReference = Math.min(...references.map(pair => Date.parse(pair.updatedAt)));
          best.set(id, {
            id,
            sport: context.sport,
            league: label(event.sport_title, 100) || event.sport_key,
            eventId,
            event: `${away} vs. ${home}`,
            player: group.player,
            marketKey: group.marketKey,
            marketLabel: PROP_MARKETS[context.sport][group.marketKey],
            line: group.line,
            side,
            selection: `${group.player} ${side.toLowerCase()} ${group.line} ${PROP_MARKETS[context.sport][group.marketKey].toLowerCase()}`,
            startsAt: new Date(event.commence_time).toISOString(),
            book: target.book,
            odds,
            fairProbability,
            ev,
            referenceBooks: references.map(pair => pair.book).sort(),
            referenceCount: references.length,
            priceUpdatedAt: new Date(target.updatedAt).toISOString(),
            referenceUpdatedAt: new Date(earliestReference).toISOString(),
            prices: pairs.map(pair => ({
              book: pair.book,
              odds: index === 0 ? pair.over : pair.under,
              updatedAt: new Date(pair.updatedAt).toISOString(),
            })).sort((a, b) => americanToDecimal(b.odds) - americanToDecimal(a.odds) || a.book.localeCompare(b.book)),
          });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.ev - a.ev || a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}
