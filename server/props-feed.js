import { PROP_MARKETS, PROP_SPORTS, localDateKey, rankPlayerProps } from '../src/lib/props.js';
import { parseProviderError } from './provider-errors.js';

export const SOCCER_LEAGUES = Object.freeze([
  { key: 'soccer_epl', title: 'English Premier League' },
  { key: 'soccer_uefa_champs_league', title: 'UEFA Champions League' },
  { key: 'soccer_spain_la_liga', title: 'Spanish La Liga' },
  { key: 'soccer_usa_mls', title: 'MLS' },
  { key: 'soccer_germany_bundesliga', title: 'German Bundesliga' },
  { key: 'soccer_italy_serie_a', title: 'Italian Serie A' },
  { key: 'soccer_france_ligue_one', title: 'French Ligue 1' },
]);

const CACHE_MS = 5 * 60_000;
const CACHE_LIMIT = 24;
const MAX_EVENTS = 12;
const MAX_CONCURRENT_EVENTS = 2;
const BOOKMAKERS = 'draftkings,fanduel,betmgm,williamhill_us,pinnacle';
const METHOD = 'Leave-one-book-out no-vig consensus';

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

class ProviderError extends Error {
  constructor(message, { fatal = false, status = 502 } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.fatal = fatal;
    this.status = status;
  }
}

function validTimeZone(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function calendarTime(value) {
  if (typeof value !== 'string' || value.length > 40) return NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return NaN;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || hour > 23 || minute > 59 || second > 59) return NaN;
  return Date.parse(value);
}

function eventCandidates(payload, { providerSport, day, timeZone, timestamp }) {
  if (!Array.isArray(payload)) throw new ProviderError('The player-prop provider returned an invalid event list.');
  const seen = new Set();
  return payload.filter(event => {
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || typeof event.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(event.id)
        || seen.has(event.id) || (event.sport_key !== undefined && event.sport_key !== providerSport)
        || typeof event.home_team !== 'string' || !event.home_team.trim() || event.home_team.length > 200
        || typeof event.away_team !== 'string' || !event.away_team.trim() || event.away_team.length > 200
        || event.home_team === event.away_team) return false;
    const startsAt = calendarTime(event.commence_time);
    if (!Number.isFinite(startsAt) || startsAt <= timestamp || localDateKey(startsAt, timeZone) !== day) return false;
    seen.add(event.id);
    return true;
  }).sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
}

/**
 * Fetch player props through a server-held key. Only current-day, future events
 * are queried. The returned rankings are market estimates, not model forecasts.
 */
export function createPropsApiHandler({ apiKey = process.env.ODDS_API_KEY, fetchImpl = globalThis.fetch, now = () => Date.now(), researchAssess = null } = {}) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  const freeMode = process.env.ODDS_API_FREE_MODE === '1';
  const maxEvents = freeMode ? 1 : MAX_EVENTS;
  const cache = new Map();
  const pending = new Map();

  async function upstream(pathname, search = {}) {
    const url = new URL(pathname, 'https://api.the-odds-api.com');
    url.search = new URLSearchParams({ apiKey: key, ...search }).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new ProviderError('Could not reach the player-prop provider. Check connectivity or try again shortly.');
    }
    if (!response?.ok) {
      const upstreamError = await parseProviderError(response);
      throw new ProviderError(upstreamError.message, { fatal: [401, 403, 429].includes(response.status) });
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderError('The player-prop provider returned an invalid response.');
    }
  }

  function retain(cacheKey, entry) {
    cache.delete(cacheKey);
    cache.set(cacheKey, entry);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }

  async function load({ sport, providerSport, league, timeZone, day }) {
    const listed = await upstream(`/v4/sports/${providerSport}/events/`);
    const candidates = eventCandidates(listed, { providerSport, day, timeZone, timestamp: now() });
    const requested = candidates.slice(0, maxEvents);
    const responses = [];
    let cursor = 0;
    let failures = 0;
    let fatal;
    async function worker() {
      while (!fatal) {
        const index = cursor++;
        if (index >= requested.length) break;
        const event = requested[index];
        try {
          const detail = await upstream(`/v4/sports/${providerSport}/events/${encodeURIComponent(event.id)}/odds/`, {
            ...(freeMode ? { regions: 'us' } : { bookmakers: BOOKMAKERS }),
            markets: Object.keys(PROP_MARKETS[sport]).slice(0, freeMode ? 1 : undefined).join(','),
            oddsFormat: 'american',
            dateFormat: 'iso',
          });
          if (!detail || typeof detail !== 'object' || Array.isArray(detail)
              || detail.id !== event.id || !Array.isArray(detail.bookmakers)
              || (detail.sport_key !== undefined && detail.sport_key !== providerSport)
              || detail.home_team !== event.home_team || detail.away_team !== event.away_team
              || calendarTime(detail.commence_time) !== calendarTime(event.commence_time)) {
            throw new ProviderError('The player-prop provider returned an invalid event response.');
          }
          // The fixed request path and matching event identity establish this
          // sport when an otherwise valid provider detail omits sport_key.
          responses.push({ ...detail, sport_key: detail.sport_key ?? providerSport });
        } catch (error) {
          if (error instanceof ProviderError && error.fatal) fatal = error;
          else failures += 1;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_EVENTS, requested.length) }, worker));
    if (fatal) throw fatal;
    if (requested.length && !responses.length) {
      throw new ProviderError('No event scan completed. The player-prop provider is unavailable or returned invalid data. Try again shortly.');
    }
    const timestamp = now();
    const warnings = [];
    if (candidates.length > maxEvents) warnings.push(`Only the first ${maxEvents} upcoming events were scanned out of ${candidates.length} to limit provider quota use.`);
    if (failures) warnings.push(`${failures} event scan${failures === 1 ? '' : 's'} failed. Picks cover only the events scanned successfully.`);
    return {
      events: responses,
      sport,
      ...(league ? { league } : {}),
      day,
      timeZone,
      source: 'The Odds API',
      fetchedAt: new Date(timestamp).toISOString(),
      expiresAt: new Date(timestamp + CACHE_MS).toISOString(),
      expires: timestamp + CACHE_MS,
      eventsScanned: responses.length,
      eventsRequested: requested.length,
      eventsAvailable: candidates.length,
      complete: failures === 0 && requested.length === candidates.length,
      warnings,
      method: METHOD,
      minReferences: 2,
    };
  }

  async function entryFor(options) {
    const cacheKey = [options.sport, options.league || '', options.timeZone, options.day].join('|');
    const existing = cache.get(cacheKey);
    if (existing && existing.expires > now()) {
      retain(cacheKey, existing);
      return existing;
    }
    if (!pending.has(cacheKey)) {
      if (pending.size >= CACHE_LIMIT) throw new ProviderError('The player-prop scanner is busy. Try again shortly.', { status: 503 });
      pending.set(cacheKey, load(options).then(entry => {
        retain(cacheKey, entry);
        return entry;
      }).finally(() => pending.delete(cacheKey)));
    }
    return pending.get(cacheKey);
  }

  return async function propsApiHandler(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return false;
    }
    if (!['/api/props', '/api/props/status', '/api/props/leagues', '/api/props/check'].includes(url.pathname)) return false;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      json(res, 405, { error: 'Use GET for this endpoint.' });
      return true;
    }
    if (url.pathname === '/api/props/status') {
      json(res, 200, {
        configured: Boolean(key),
        supportedSports: Object.keys(PROP_SPORTS),
        soccerLeagues: SOCCER_LEAGUES,
        requiresPlayerPropPlan: true,
        cacheSeconds: CACHE_MS / 1000,
        maxEvents,
        freeMode,
        method: METHOD,
        minReferences: 2,
      });
      return true;
    }
    if (url.pathname === '/api/props/check') {
      if (!key) {
        json(res, 503, { configured:false, valid:false, error:'Add your new API key to a server-side .env file and restart UltraX.' });
        return true;
      }
      // The /v4/sports/ endpoint costs no credits. Only a user-triggered click calls it.
      const endpoint = new URL('https://api.the-odds-api.com/v4/sports/');
      endpoint.searchParams.set('apiKey', key);
      let response;
      try {
        response = await fetchImpl(endpoint, {
          redirect:'error', signal:AbortSignal.timeout(12_000), headers:{ Accept:'application/json' },
        });
      } catch {
        json(res, 503, {configured:true,valid:false,error:'Could not contact The Odds API. Check internet access and retry.'});
        return true;
      }
      if (!response.ok) {
        const diagnostic = await parseProviderError(response);
        json(res, 200, {configured:true,valid:false,error:diagnostic.message,code:diagnostic.code,httpStatus:diagnostic.httpStatus});
        return true;
      }
      let sports;
      try {sports=await response.json();} catch {sports=null;}
      if (!Array.isArray(sports)) {
        json(res, 502, {configured:true,valid:false,error:'The provider returned an unexpected sports catalog.'});
        return true;
      }
      const h=response.headers?.get?.('x-requests-remaining');
      const remaining=h && /^[0-9]+$/.test(h) ? Number(h) : null;
      json(res, 200, {
        configured:true,valid:true,checkedAt:new Date(now()).toISOString(),
        message:'The API key is accepted for the sports catalog. This does not guarantee player-prop market coverage.',
        remainingCredits:Number.isSafeInteger(remaining)?remaining:null,
      });
      return true;
    }
    if (url.pathname === '/api/props/leagues') {
      json(res, 200, { configured: Boolean(key), leagues: SOCCER_LEAGUES, catalog: 'Supported leagues; availability depends on the provider and your plan.' });
      return true;
    }
    const sport = url.searchParams.get('sport');
    if (!Object.hasOwn(PROP_SPORTS, sport)) {
      json(res, 400, { error: 'Choose sport NBA, NFL, or SOCCER.' });
      return true;
    }
    const timeZone = validTimeZone(url.searchParams.get('timeZone') || 'America/Denver');
    if (!timeZone) {
      json(res, 400, { error: 'Choose a valid IANA timezone, such as America/Denver.' });
      return true;
    }
    const requestedLeague = url.searchParams.get('league');
    const league = sport === 'SOCCER' ? (requestedLeague || 'soccer_epl') : null;
    if ((league && !SOCCER_LEAGUES.some(item => item.key === league)) || (sport !== 'SOCCER' && requestedLeague)) {
      json(res, 400, { error: 'Choose a supported soccer league; league is only used with sport SOCCER.' });
      return true;
    }
    if (!key) {
      json(res, 503, { error: 'Player props need ODDS_API_KEY and a provider plan with event/player-prop access.' });
      return true;
    }
    const providerSport = league || PROP_SPORTS[sport];
    try {
      let entry;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const day = localDateKey(now(), timeZone);
        entry = await entryFor({ sport, providerSport, league, timeZone, day });
        if (entry.day === localDateKey(now(), timeZone)) break;
        entry = undefined;
      }
      if (!entry) throw new ProviderError('The local date changed during the scan. Refresh to scan the new day.', { status: 503 });
      const { events, expires, ...metadata } = entry;
      const rawPicks = rankPlayerProps(events, { sport, now: now(), timeZone, minEdge: 0, maxAgeMinutes: 15 });
      let picks = rawPicks;
      let researchNote='No calibrated player model is installed. Price discrepancies are not bets.';
      if(typeof researchAssess==='function' && rawPicks.length) {
        try {
          const inspected=await researchAssess(rawPicks);
          picks=rawPicks.map((pick,i)=>({...pick,research:inspected?.[i]||{
            status:'NOT CHECKED',verifiedChecks:0,totalChecks:9,sortTier:0,warnings:['Research coverage limit reached.']
          }}));
          researchNote='These are research candidates, not predictions. Missing injuries, role, defensive metrics or calibrated probabilities prevent automatic betting recommendations.';
        } catch {
          picks=rawPicks.map(pick=>({...pick,research:{status:'RESEARCH UNAVAILABLE',sortTier:0,verifiedChecks:0,totalChecks:9,warnings:['Could not verify player statistics or rosters.']}}));
          researchNote='Research sources are temporarily unavailable. No selections are approved.';
        }
      }
      picks=[...picks].sort((a,b)=>(b.research?.sortTier??0)-(a.research?.sortTier??0)||
        (b.research?.verifiedChecks??0)-(a.research?.verifiedChecks??0)||b.ev-a.ev);
      json(res, 200, { ...metadata, picks, researchNote, researchEvaluated:picks.filter(p=>p.research).length,
        fullyValidatedRecommendations:0 });
    } catch (error) {
      json(res, error instanceof ProviderError ? error.status : 502, {
        error: error instanceof ProviderError ? error.message : 'Daily player props are temporarily unavailable. Try again shortly.',
      });
    }
    return true;
  };
}
