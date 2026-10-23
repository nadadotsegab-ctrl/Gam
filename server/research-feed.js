// Best-effort public ESPN lookup. ESPN endpoints are undocumented and may change,
// throttle requests, or disallow some uses. No claim of complete injury coverage.
const CONFIG = {
  NBA: { path: 'basketball/nba', label: 'NBA' },
  NFL: { path: 'football/nfl', label: 'NFL' },
  SOCCER: { path: 'soccer/eng.1', label: 'Premier League' },
};
const SOURCE = 'ESPN public endpoints (unofficial integration)';
const CATALOG_TTL = 6 * 60 * 60_000;
const REPORT_TTL = 20 * 60_000;
const catalogCache = new Map();
const reportCache = new Map();

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
const validSport = sport => Object.hasOwn(CONFIG, sport);
const clean = value => typeof value === 'string' ? value.trim() : '';
const keyOf = value => clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const finite = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;

function athleteRows(payload) {
  const out = [];
  const seen = new Set();
  function visit(node, depth = 0) {
    if (depth > 7 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child, depth + 1); return; }
    const a = node.athlete && typeof node.athlete === 'object' ? node.athlete : node;
    const name = clean(a.displayName || a.fullName || a.name);
    if (/^\d{1,12}$/.test(String(a.id || '')) && name && !seen.has(String(a.id))) {
      seen.add(String(a.id));
      out.push({ id: String(a.id), name, position: a.position?.abbreviation || a.position?.displayName || '', headshot: a.headshot?.href || '', team: '' });
    }
    for (const k of ['athletes', 'items', 'groups', 'entries', 'roster']) if (node[k]) visit(node[k], depth + 1);
  }
  visit(payload.athletes ?? payload);
  return out;
}

export function normalizeGameLog(payload, sport) {
  if (!payload || typeof payload !== 'object') return [];
  const collected = [];
  const seen = new Set();
  function visit(node, names = [], depth = 0) {
    if (depth > 9 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(v => visit(v, names, depth + 1)); return; }
    const labels = Array.isArray(node.labels) ? node.labels : names;
    const fields = Array.isArray(node.names) ? node.names : labels;
    if (Array.isArray(node.stats) && (node.id || node.eventId || node.event?.id)) {
      const gameId = String(node.id || node.eventId || node.event?.id);
      if (!seen.has(gameId)) {
        const values = {};
        const fallback = sport === 'NBA' && node.stats.length === 9
          ? ['MIN','FG','3PT','FT','REB','AST','STL','BLK','PTS'] : [];
        node.stats.forEach((v,i) => {
          const key = String(fields[i] || labels[i] || fallback[i] || '').toLowerCase().replace(/[^a-z0-9]/g,'');
          const value = finite(v);
          if (key && value !== null) values[key] = value;
        });
        const date = node.date || node.event?.date || null;
        seen.add(gameId);
        collected.push({ id:gameId, date, opponent:node.opponent?.displayName || node.opponent?.abbreviation || '', values });
      }
    }
    for (const k of ['seasonTypes','categories','events','entries','items','groups']) if (node[k]) visit(node[k], fields, depth + 1);
  }
  visit(payload);
  // We never invent missing dates or treat unparseable columns as real stats.
  return collected.filter(g=>Object.keys(g.values).length).sort((a,b)=>Date.parse(b.date||0)-Date.parse(a.date||0)).slice(0,82);
}

function matchInjuries(payload, playerId, name) {
  const matches = [], visited = new Set();
  function visit(node, depth=0) {
    if (depth>8 || !node || typeof node!=='object' || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) { node.forEach(x=>visit(x,depth+1)); return; }
    const athlete = node.athlete || node.player;
    if (athlete && (String(athlete.id || '') === playerId || (clean(athlete.displayName) && keyOf(athlete.displayName)===keyOf(name)))) {
      const status = clean(node.status || node.type?.description || node.details?.type || node.details?.status || '');
      if (status || node.details) matches.push({ status: status||'Listed on injury feed', details: clean(node.details?.detail || node.details?.description || node.longComment || ''), date:node.date || node.details?.returnDate || null });
    }
    for (const k of ['injuries','items','teams','athletes','entries']) if (node[k]) visit(node[k],depth+1);
  }
  visit(payload);
  return matches.slice(0,5);
}

export function createResearchHandler({fetchImpl=globalThis.fetch, now=()=>Date.now()}={}) {
  async function getJson(url) {
    let r;
    try { r=await fetchImpl(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(9000)}); }
    catch { throw new Error('Sports data source unreachable. Please retry.'); }
    if (!r?.ok) throw new Error('Sports data source unavailable ('+(r?.status||'network')+').');
    try { return await r.json(); } catch { throw new Error('Sports data source returned invalid JSON.'); }
  }
  async function cached(cache, key, ttl, load) {
    const old=cache.get(key);
    if (old && now()-old.at < ttl) return old.data instanceof Promise ? await old.data : old.data;
    const promise=load();
    cache.set(key,{at:now(),data:promise});
    try { const data=await promise; cache.set(key,{at:now(),data}); return data; }
    catch(e) { cache.delete(key); throw e; }
  }
  async function catalog(sport) {
    const {path}=CONFIG[sport];
    return cached(catalogCache,sport,CATALOG_TTL,async()=>{
      const url='https://site.api.espn.com/apis/site/v2/sports/'+path+'/teams?limit=50';
      const payload=await getJson(url);
      const teams=payload.sports?.[0]?.leagues?.[0]?.teams || payload.teams || [];
      const selections=teams.map(item=>item.team || item).filter(t=>/^\d+$/.test(String(t.id||''))).slice(0,40);
      const results=[];
      let index=0;
      async function worker() {
        while(index<selections.length) {
          const team=selections[index++];
          try {
            const roster=await getJson('https://site.api.espn.com/apis/site/v2/sports/'+path+'/teams/'+team.id+'/roster');
            results.push(...athleteRows(roster).map(x=>({...x,team:team.displayName || team.name || ''})));
          } catch { /* Partial coverage: never invent missing player profiles. */ }
        }
      }
      await Promise.all(Array.from({length:Math.min(6,selections.length)},worker));
      return [...new Map(results.map(x=>[x.id,x])).values()];
    });
  }
  async function search(sport,query) {
    // Roster cache avoids reliance on brittle global search response formats.
    const players=await catalog(sport);
    const normalized=keyOf(query);
    return {players:players.filter(p=>keyOf(p.name).includes(normalized)).slice(0,20), totalCatalog:players.length, partialCoverage: players.length < (sport==='NBA'?250:sport==='NFL'?900:200), source:SOURCE, fetchedAt:new Date(now()).toISOString()};
  }
  async function report(sport,id,name) {
    const {path}=CONFIG[sport];
    return cached(reportCache,[sport,id].join(':'),REPORT_TTL,async()=>{
      const currentYear=new Date(now()).getUTCFullYear();
      const season=sport==='NBA' ? (new Date(now()).getUTCMonth()>=7?currentYear+1:currentYear) : currentYear;
      const gamelogUrl='https://site.web.api.espn.com/apis/common/v3/sports/'+path+'/athletes/'+id+'/gamelog?season='+season;
      const injuriesUrl='https://site.api.espn.com/apis/site/v2/sports/'+path+'/injuries';
      const [gamelog,injuryFeed]=await Promise.allSettled([getJson(gamelogUrl),getJson(injuriesUrl)]);
      let games=gamelog.status==='fulfilled'?normalizeGameLog(gamelog.value,sport):[];
      let usedSeason=season;
      // Early-season research may need last season for a descriptive baseline.
      if (!games.length && gamelog.status==='fulfilled') {
        try {
          const previous=await getJson(gamelogUrl.replace('season='+season,'season='+(season-1)));
          games=normalizeGameLog(previous,sport);
          usedSeason=season-1;
        } catch { /* Keep honest empty state. */ }
      }
      return {
        player:{id,name,sport},
        games, season:usedSeason,
        gamelogStatus:gamelog.status==='fulfilled'?'available':'unavailable',
        injuries: injuryFeed.status==='fulfilled'?matchInjuries(injuryFeed.value,id,name):[],
        injuryStatus:injuryFeed.status==='fulfilled'?'feed-checked':'unavailable',
        // Absence from a third-party feed does not confirm fitness.
        injuriesVerified:false, oddsVerified:false,
        sources:{gamelog:gamelogUrl.replace('season='+season,'season='+usedSeason),injuries:injuriesUrl},
        fetchedAt:new Date(now()).toISOString(), source:SOURCE,
        warnings:[
          ...(gamelog.status==='rejected'?['Player game logs are unavailable from ESPN.']:[]),
          ...(injuryFeed.status==='rejected'?['Injury feed could not be reached.']:['ESPN injury listings are not an official active/inactive confirmation.']),
          ...(sport==='SOCCER'?['Soccer player game logs have limited support; some prop markets cannot be analyzed.']:[])
        ]
      };
    });
  }
  return async function handle(req,res) {
    const url=new URL(req.url,'http://localhost');
    if (!url.pathname.startsWith('/api/research/')) return false;
    if (req.method!=='GET') { respond(res,405,{error:'GET only'});return true; }
    const sport=(url.searchParams.get('sport')||'NBA').toUpperCase();
    if (!validSport(sport)) {respond(res,400,{error:'Unsupported sport'});return true;}
    if (url.pathname==='/api/research/search') {
      const q=clean(url.searchParams.get('q'));
      if (q.length<2 || q.length>65) {respond(res,400,{error:'Enter a player name (2–65 characters).'});return true;}
      try {respond(res,200,await search(sport,q));}catch(e){respond(res,503,{error:e.message});}return true;
    }
    if (url.pathname==='/api/research/player') {
      const id=url.searchParams.get('id') || '';
      const name=clean(url.searchParams.get('name'));
      if (!/^\d{1,12}$/.test(id)||name.length<2||name.length>100) {respond(res,400,{error:'Choose a valid player from search.'});return true;}
      try {respond(res,200,await report(sport,id,name));}catch(e){respond(res,503,{error:e.message});}return true;
    }
    respond(res,404,{error:'Unknown research endpoint'});return true;
  };
}
