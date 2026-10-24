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
const scheduleCache = new Map();

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
  const eventDetails = payload.events && !Array.isArray(payload.events) ? payload.events : {};
  const rootNames = Array.isArray(payload.names) ? payload.names : payload.labels;
  function visit(node, inherited = [], depth = 0) {
    if (depth > 9 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(v => visit(v, inherited, depth + 1)); return; }
    const labels = Array.isArray(node.names)?node.names:
      Array.isArray(node.labels)?node.labels:inherited;
    if (Array.isArray(node.stats) && (node.id||node.eventId||node.event?.id)) {
      const id=String(node.id||node.eventId||node.event.id);
      if (!seen.has(id)) {
        const meta=eventDetails[id] || {};
        const header=labels.length===node.stats.length ? labels :
          labels.length>node.stats.length ? labels.slice(-node.stats.length) :
          rootNames?.length===node.stats.length ? rootNames :
          rootNames?.length>node.stats.length ? rootNames.slice(-node.stats.length):
          sport==='NBA' && node.stats.length===9 ?
            ['MIN','FG','3PT','FT','REB','AST','STL','BLK','PTS'] : [];
        const values={};
        node.stats.forEach((raw,i)=>{
          const key=String(header[i]||'').toLowerCase().replace(/[^a-z0-9]/g,'');
          const basic=finite(raw);
          const duration=['minutes','min'].includes(key)&&typeof raw==='string'&&/^\d{1,3}:[0-5]\d$/.test(raw)
            ? Number(raw.split(':')[0])+Number(raw.split(':')[1])/60 : null;
          // Some shooting categories use made-attempted text (3-9). Only
          // derive the made number for recognized shooting fields.
          const shooting=['3pt','3pm','threepointsmade','threepointfieldgoalsmade'].includes(key);
          const made=shooting&&typeof raw==='string'&&/^\d+-\d+$/.test(raw)?Number(raw.split('-')[0]):null;
          const number=basic??made??duration;
          if(key && number!==null)values[key]=number;
        });
        const date=node.date||node.gameDate||meta.date||meta.gameDate||node.event?.date||null;
        const opponent=node.opponent?.displayName||node.opponent?.abbreviation||meta.opponent?.displayName||meta.opponent?.abbreviation||'';
        if(Object.keys(values).length) {
          collected.push({id,date,opponent,values});
          seen.add(id);
        }
      }
    }
    for (const k of ['seasonTypes','categories','events','entries','items','groups'])
      if (Array.isArray(node[k]))visit(node[k],labels,depth+1);
  }
  visit(payload,Array.isArray(rootNames)?rootNames:[]);
  return collected.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)).slice(0,82);
}

export function reportedTeammateInjuries(payload,roster,playerId) {
  if(!Array.isArray(roster)||!payload||typeof payload!=='object')return [];
  const lookup=new Map(roster.filter(x=>x?.id&&x.id!==playerId).map(x=>[String(x.id),x]));
  const matches=[],visited=new Set(),added=new Set();
  function walk(node,depth=0){
    if(depth>10||!node||typeof node!=='object'||visited.has(node))return;
    visited.add(node);
    if(Array.isArray(node)){node.forEach(x=>walk(x,depth+1));return;}
    const athlete=node.athlete||node.player;
    const teammate=athlete&&lookup.get(String(athlete.id||''));
    if(teammate&&!added.has(teammate.id)){
      const status=clean(node.status||node.type?.description||node.details?.type||node.details?.status);
      if(status){matches.push({id:teammate.id,name:teammate.name,status});added.add(teammate.id);}
    }
    for(const k of ['injuries','items','teams','athletes','entries'])if(node[k])walk(node[k],depth+1);
  }
  walk(payload);return matches.slice(0,8);
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


export function findUpcomingMatch(payload, player, timestamp) {
 const events=Array.isArray(payload?.events)?payload.events:[];
 for(const event of events.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))) {
   if(!Number.isFinite(Date.parse(event.date)) || Date.parse(event.date)<=timestamp) continue;
   const competitors=event.competitions?.[0]?.competitors;
   if(!Array.isArray(competitors) || competitors.length!==2)continue;
   const ours=competitors.find(c=>String(c.team?.id||'')===String(player.teamId||'') || (player.team&&keyOf(c.team?.displayName)===keyOf(player.team)));
   if(!ours)continue;
   const opponent=competitors.find(c=>c!==ours);
   return {eventId:String(event.id||''),startsAt:event.date,opponent:opponent?.team?.displayName||'Unknown opponent',homeAway:ours.homeAway||'',event:event.name||''};
 }
 return null;
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
  const rosterCache = new Map();
  const teamsCache = new Map();
  async function teamDirectory(sport) {
    const {path}=CONFIG[sport];
    return cached(teamsCache,sport,6*60*60_000,async()=>{
      const data=await getJson('https://site.api.espn.com/apis/site/v2/sports/'+path+'/teams?limit=50');
      const teams=data.sports?.[0]?.leagues?.[0]?.teams || data.teams || [];
      return teams.map(x=>x.team||x).filter(x=>/^\d+$/.test(String(x.id||'')));
    });
  }
  async function teamRoster(sport,team) {
    return cached(rosterCache,sport+':'+team.id,60*60_000,async()=>{
      const {path}=CONFIG[sport];
      const roster=await getJson('https://site.api.espn.com/apis/site/v2/sports/'+path+'/teams/'+team.id+'/roster');
      return athleteRows(roster).map(x=>({...x,team:team.displayName||team.name||'',teamId:String(team.id)}));
    });
  }
  const norm=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  async function assessPicks(picks) {
    if(!Array.isArray(picks))return [];
    const {evaluateResearchEvidence}=await import('../src/lib/research-ranking.js');
    const limited=picks.slice(0,12);
    const results=new Array(limited.length);
    const groupedBySport=new Map();
    for(const pick of limited) {
      if(!groupedBySport.has(pick.sport))groupedBySport.set(pick.sport,[]);
      groupedBySport.get(pick.sport).push(pick);
    }
    const rosterByEvent=new Map();
    for(const [sport,list] of groupedBySport) {
      try {
        const directory=await teamDirectory(sport);
        const targetTeams=new Map();
        for(const pick of list) {
          for(const side of String(pick.event||'').split(/\s+vs\.?\s+/i)) {
            const team=directory.find(t=>norm(t.displayName||t.name)===norm(side));
            if(team)targetTeams.set(String(team.id),team);
          }
        }
        await Promise.all([...targetTeams.values()].slice(0,14).map(async team=>{
          try{rosterByEvent.set(sport+':'+team.id,await teamRoster(sport,team));}
          catch{rosterByEvent.set(sport+':'+team.id,[]);}
        }));
      } catch { /* Explicit missing evidence below; never construct fictitious rosters. */ }
    }
    async function assess(pick) {
      try {
        const directory=await teamDirectory(pick.sport);
        const rosters=[];
        for(const side of String(pick.event||'').split(/\s+vs\.?\s+/i)){
          const team=directory.find(t=>norm(t.displayName||t.name)===norm(side));
          if(team)rosters.push(...(rosterByEvent.get(pick.sport+':'+team.id)||[]));
        }
        const athlete=rosters.find(p=>norm(p.name)===norm(pick.player));
        if(!athlete){
          const result=evaluateResearchEvidence(pick,null,now());
          result.warnings.unshift('Player could not be verified on either event roster; possible mismatched event, trade, or incomplete ESPN roster.');
          return result;
        }
        const reportData=await report(pick.sport,athlete.id,athlete.name,athlete,rosters);
        return evaluateResearchEvidence(pick,reportData,now());
      } catch {
        const result=evaluateResearchEvidence(pick,null,now());
        result.warnings.unshift('Source request unavailable; no player research was assumed.');
        return result;
      }
    }
    // Rate-limit ESPN calls across candidates and reuse report/roster caches.
    let index=0;
    await Promise.all(Array.from({length:Math.min(3,limited.length)},async()=>{
      while(index<limited.length){
        const i=index++;
        results[i]=await assess(limited[i]);
      }
    }));
    return results;
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
            results.push(...athleteRows(roster).map(x=>({...x,team:team.displayName || team.name || '',teamId:String(team.id)})));
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
  async function report(sport,id,name,verifiedPlayer=null,eventRosters=[]) {
    const {path}=CONFIG[sport];
    const known=verifiedPlayer || (await catalog(sport)).find(p=>p.id===id);
    if (!known) throw new Error('Player not found in the currently available roster.');
    return cached(reportCache,[sport,id].join(':'),REPORT_TTL,async()=>{
      const currentYear=new Date(now()).getUTCFullYear();
      const season=sport==='NBA' ? (new Date(now()).getUTCMonth()>=7?currentYear+1:currentYear) : currentYear;
      const gamelogUrl='https://site.web.api.espn.com/apis/common/v3/sports/'+path+'/athletes/'+id+'/gamelog?season='+season;
      const injuriesUrl='https://site.api.espn.com/apis/site/v2/sports/'+path+'/injuries';
      const today=new Date(now());
      const later=new Date(now()+7*86400000);
      const dateKey=d=>d.toISOString().slice(0,10).replace(/-/g,'');
      const scheduleUrl='https://site.api.espn.com/apis/site/v2/sports/'+path+'/scoreboard?dates='+dateKey(today)+'-'+dateKey(later)+'&limit=100';
      const [gamelog,injuryFeed,scheduleFeed]=await Promise.allSettled([getJson(gamelogUrl),getJson(injuriesUrl),cached(scheduleCache,sport+':'+dateKey(today),15*60_000,()=>getJson(scheduleUrl))]);
      const currentGames=gamelog.status==='fulfilled'?normalizeGameLog(gamelog.value,sport):[];
      let games=[...currentGames];
      let previousGames=[];
      const previousUrl=gamelogUrl.replace('season='+season,'season='+(season-1));
      // NBA season is still young in October. Previous-season games can supply
      // a descriptively useful baseline, but we flag offseason/role uncertainty.
      // Never claim those old games are current-season form.
      if(currentGames.length<18){
        try {
          const previous=await getJson(previousUrl);
          previousGames=normalizeGameLog(previous,sport);
          const ids=new Set(games.map(g=>g.id));
          for(const game of previousGames)if(!ids.has(game.id)){games.push(game);ids.add(game.id);}
          games.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
          games=games.slice(0,55);
        } catch { /* Keep explicit limited-history state. */ }
      }
      const usesPrevious=games.length>currentGames.length;
      const seasonsUsed=[...(currentGames.length?[season]:[]),...(usesPrevious?[season-1]:[])];
      const usedSeason=currentGames.length?season:usesPrevious?season-1:season;
      return {
        player:{...known,sport},
        teammateInjuries:injuryFeed.status==='fulfilled'?reportedTeammateInjuries(injuryFeed.value,eventRosters.filter(p=>p.teamId===known.teamId),id):[],
        nextGame:scheduleFeed.status==='fulfilled'?findUpcomingMatch(scheduleFeed.value,known,now()):null,
        scheduleStatus:scheduleFeed.status==='fulfilled'?'checked':'unavailable',
        games, season:usedSeason, seasonsUsed, currentSeasonGames:currentGames.length, historyCrossesSeasons:usesPrevious,
        gamelogStatus:games.length?'available':'unavailable',
        injuries: injuryFeed.status==='fulfilled'?matchInjuries(injuryFeed.value,id,known.name):[],
        injuryStatus:injuryFeed.status==='fulfilled'?'feed-checked':'unavailable',
        // Absence from a third-party feed does not confirm fitness.
        injuriesVerified:false, oddsVerified:false,
        sources:{gamelog:gamelogUrl.replace('season='+season,'season='+usedSeason),...(usesPrevious?{previousGamelog:previousUrl}:{}),injuries:injuriesUrl,schedule:scheduleUrl},
        fetchedAt:new Date(now()).toISOString(), source:SOURCE,
        warnings:[
          ...(gamelog.status==='rejected'?['Current-season game logs are unavailable from ESPN.']:[]),
          ...(usesPrevious?['Rolling history includes earlier-season games; past roles, rosters and minutes may differ from today.']:[]),
          ...(games.length<18?['Fewer than 18 dated games: current walk-forward evaluation may be too thin for a research shortlist.']:[]),
          ...(scheduleFeed.status==='rejected'?['Current fixtures could not be verified.']:[]),
          ...(injuryFeed.status==='rejected'?['Injury feed could not be reached.']:['ESPN injury listings are not an official active/inactive confirmation.']),
          ...(sport==='SOCCER'?['Soccer player game logs have limited support; some prop markets cannot be analyzed.']:[])
        ]
      };
    });
  }
  async function handle(req,res) {
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
  }
  handle.assessPicks=assessPicks;
  return handle;
}
