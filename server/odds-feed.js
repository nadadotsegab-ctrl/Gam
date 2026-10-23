import { decimalToAmerican, removeVig } from '../src/lib/odds.js';
import { parseMarketImport } from '../src/lib/storage.js';

const sportCodes = {
  NBA: 'basketball_nba',
  NFL: 'americanfootball_nfl',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
};
const bookIds = {
  draftkings: 'draftkings', fanduel: 'fanduel', betmgm: 'betmgm',
  williamhill_us: 'caesars', pinnacle: 'pinnacle',
};
const benchmark = 'Pinnacle no-vig or market consensus';
const cacheDuration = 60_000;

function validPrice(value) {
  return typeof value === 'number' && Number.isFinite(value)
    && Math.abs(value) >= 100 && Math.abs(value) <= 1e6;
}

function name(value, max = 90) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
    ? value.trim() : null;
}

function fairAmerican(probability) {
  const value = decimalToAmerican(1 / probability);
  // Avoid a conversion artifact such as +99.99999999999997 at even money.
  return Math.sign(value) * Math.max(100, Math.round(Math.abs(value) * 1e6) / 1e6);
}

/**
 * Adapt two-outcome moneyline markets to the dashboard schema. Fair prices are
 * estimates from no-vig Pinnacle prices, or an equal-weight book consensus.
 * They are not predictions or guarantees of a positive expected return.
 */
export function transformOddsPayload(payload, sport) {
  if (!Object.hasOwn(sportCodes, sport)) throw new Error('Unsupported sport.');
  if (!Array.isArray(payload)) throw new Error('The odds provider returned an invalid response.');
  const output = [];
  const seen = new Set();
  for (const event of payload) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    const eventId = name(event.id, 80);
    const away = name(event.away_team);
    const home = name(event.home_team);
    if (!eventId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(eventId) || seen.has(eventId)
      || !away || !home || away === home || !Array.isArray(event.bookmakers)
      || (event.sport_key !== undefined && event.sport_key !== sportCodes[sport])) continue;
    const pairs = new Map();
    for (const bookmaker of event.bookmakers) {
      if (!bookmaker || !Object.hasOwn(bookIds, bookmaker.key) || !Array.isArray(bookmaker.markets)) continue;
      const market = bookmaker.markets.find(candidate => candidate?.key === 'h2h');
      if (!market || !Array.isArray(market.outcomes) || market.outcomes.length !== 2) continue;
      const awayOutcome = market.outcomes.find(outcome => outcome?.name === away);
      const homeOutcome = market.outcomes.find(outcome => outcome?.name === home);
      if (!awayOutcome || !homeOutcome || !validPrice(awayOutcome.price) || !validPrice(homeOutcome.price)) continue;
      const prices = [awayOutcome.price, homeOutcome.price];
      pairs.set(bookIds[bookmaker.key], { prices, fair: removeVig(...prices) });
    }
    if (!pairs.size) continue;
    const fair = pairs.has('pinnacle') ? pairs.get('pinnacle').fair : [0, 1].map(index => (
      [...pairs.values()].reduce((sum, pair) => sum + pair.fair[index], 0) / pairs.size
    ));
    if (fair.some(value => !Number.isFinite(value) || value <= 0 || value >= 1)) continue;
    const candidates = [away, home].map((selection, index) => ({
      id: `live-${sport.toLowerCase()}-${eventId}-${index}`,
      sport,
      league: sport,
      event: `${away} vs. ${home}`,
      selection,
      market: 'Moneyline',
      startsAt: event.commence_time,
      odds: Object.fromEntries([...pairs].map(([book, pair]) => [book, pair.prices[index]])),
      fairOdds: fairAmerican(fair[index]),
      trend: [],
    }));
    try {
      // Treat upstream data as untrusted, including dates and metadata strings.
      output.push(...parseMarketImport(JSON.stringify({ markets: candidates })));
      seen.add(eventId);
    } catch {
      // An invalid event must not prevent other valid events from being usable.
    }
    if (output.length >= 500) break;
  }
  return output.length ? parseMarketImport(JSON.stringify({ markets: output.slice(0, 500) })) : [];
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

class ProviderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Create a server-only feed handler; keys, provider URLs, and bodies never reach the client. */
export function createOddsApiHandler({ apiKey = process.env.ODDS_API_KEY, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const cache = new Map();
  const pending = new Map();

  async function load(sport) {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportCodes[sport]}/odds/`);
    url.search = new URLSearchParams({
      apiKey: key,
      bookmakers: 'draftkings,fanduel,betmgm,williamhill_us,pinnacle',
      markets: 'h2h',
      oddsFormat: 'american',
      dateFormat: 'iso',
    }).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ProviderError('Could not reach the odds provider. Check connectivity or try again shortly.');
    }
    if (!response?.ok) {
      if ([401, 403].includes(response?.status)) {
        throw new ProviderError('The odds provider rejected the server credentials. Check ODDS_API_KEY and your provider subscription.');
      }
      if (response?.status === 429) {
        throw new ProviderError('The odds provider request limit was reached. Check your provider quota or try again later.');
      }
      throw new ProviderError('The odds provider could not complete this request. Try again shortly.');
    }
    let markets;
    try {
      markets = transformOddsPayload(await response.json(), sport);
    } catch {
      throw new ProviderError('The odds provider returned an invalid response.');
    }
    const timestamp = now();
    const result = { markets, source: 'The Odds API', sport, updatedAt: new Date(timestamp).toISOString(), benchmark };
    cache.set(sport, { expires: timestamp + cacheDuration, result });
    return result;
  }

  return async function oddsApiHandler(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return false;
    }
    if (!['/api/odds', '/api/odds/status'].includes(url.pathname)) return false;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      json(res, 405, { error: 'Use GET for this endpoint.' });
      return true;
    }
    if (url.pathname === '/api/odds/status') {
      json(res, 200, { configured: Boolean(key) });
      return true;
    }
    const sport = url.searchParams.get('sport');
    if (!Object.hasOwn(sportCodes, sport)) {
      json(res, 400, { error: 'Choose sport NBA, NFL, MLB, or NHL.' });
      return true;
    }
    if (!key) {
      json(res, 503, { error: 'Live odds are not configured. Set ODDS_API_KEY on the server to connect your provider account.' });
      return true;
    }
    try {
      const existing = cache.get(sport);
      if (existing && existing.expires > now()) {
        json(res, 200, existing.result);
        return true;
      }
      if (!pending.has(sport)) pending.set(sport, load(sport).finally(() => pending.delete(sport)));
      json(res, 200, await pending.get(sport));
    } catch (error) {
      json(res, 502, { error: error instanceof ProviderError ? error.message : 'Live odds are temporarily unavailable. Try again shortly.' });
    }
    return true;
  };
}
