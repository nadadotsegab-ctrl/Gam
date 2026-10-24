import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Search, Activity, AlertTriangle, ArrowRight, RefreshCw, ShieldCheck, Layers3, ExternalLink } from 'lucide-react';
import { summarizeGames, evaluateProp } from '../lib/research.js';
import { projectValues } from '../lib/forecast.js';
import { americanToDecimal, decimalToAmerican } from '../lib/odds.js';
import ManualSlip from './ManualSlip.jsx';
import { conflictsWithSlip, summarizeEligibility } from '../lib/parlay-candidates.js';

const MARKETS = {
  NBA: [['Points',['points','pts']], ['Rebounds',['rebounds','reb']], ['Assists',['assists','ast']], ['3-pointers',['threepointfieldgoalsmade','threepointersmade','3pt','3pm']]],
  NFL: [['Passing yards',['passingyards','passyds','yds']], ['Rushing yards',['rushingyards','rushyds']], ['Receiving yards',['receivingyards','recyds']], ['Receptions',['receptions','rec']]],
  SOCCER: [['Shots',['shots','totalshots']], ['Shots on target',['shotsontarget']], ['Goals',['goals']]],
};
const percent = value => Number.isFinite(value) ? (value * 100).toFixed(1)+'%' : '—';
const fmt = value => Number.isFinite(value) ? value.toFixed(1) : '—';
function marketValue(game, keys) {
  for (const key of keys) if (Number.isFinite(game?.values?.[key])) return game.values[key];
  return null;
}
function Summary({ title, value, subtitle }) {
  return <div className="stat-card"><div className="stat-label">{title}</div><div className="stat-value">{value}</div><div className="stat-foot">{subtitle}</div></div>;
}
function PlayerResearch({initialSearch}) {
 const [sport,setSport]=useState(initialSearch?.sport||'NBA'),[query,setQuery]=useState(initialSearch?.name||''),[matches,setMatches]=useState([]),[selected,setSelected]=useState(null),[report,setReport]=useState(null);
 const [market,setMarket]=useState(MARKETS[initialSearch?.sport]?.find(m=>m[0].toLowerCase()===(initialSearch?.market||'').toLowerCase())?.[0]||MARKETS[initialSearch?.sport]?.[0]?.[0]||'Points'),[line,setLine]=useState(String(initialSearch?.line??25.5)),[odds,setOdds]=useState(String(initialSearch?.odds??-110));
 const [loading,setLoading]=useState(false),[loadingReport,setLoadingReport]=useState(false),[error,setError]=useState('');
 const request=useRef(null);
 const options=MARKETS[sport];
 const keys=options.find(m=>m[0]===market)?.[1]||options[0][1];
 const logs=(report?.games||[]).map(g=>({ ...g, metric:marketValue(g,keys) })).filter(g=>g.metric!==null);
 const validLine=line.trim()!=='' && Number.isFinite(Number(line)) && Number(line)>=0;
 const values=logs.map(g=>g.metric);
 const analysis=useMemo(()=>evaluateProp({values,line:validLine?Number(line):NaN,odds:Number(odds)}),[report,market,line,odds]);
 const forecast=useMemo(()=>projectValues(logs.map(g=>({id:g.id,date:g.date,values:{stat:g.metric,minutes:g.values?.minutes}})),['stat'],{line:validLine?Number(line):null}),[report,market,line]);
 const history=validLine ? analysis.history : null;
 const last=history?.last10;
 const sampleCount=logs.length;
 const invalidSeason=report && report.season < new Date().getFullYear();
 function reset(nextSport) { request.current?.abort();setSport(nextSport);setMatches([]);setSelected(null);setReport(null);setError('');setMarket(MARKETS[nextSport][0][0]); }
 async function search(e) {
  e?.preventDefault();
  request.current?.abort();
  const c=new AbortController();request.current=c;
  setLoading(true);setError('');setMatches([]);setSelected(null);setReport(null);
  try {
   const r=await fetch('/api/research/search?'+new URLSearchParams({sport,q:query.trim()}),{signal:c.signal});
   const data=await r.json();if(!r.ok) throw new Error(data.error||'Player lookup failed.');
   if(!c.signal.aborted) {setMatches(data.players||[]);if(!data.players?.length)setError('No matching player in the accessible roster. Try a full or partial name.');}
  }catch(e){if(!c.signal.aborted)setError(e.message);}finally{if(!c.signal.aborted)setLoading(false);}
 }
 async function choose(player) {
  request.current?.abort();const c=new AbortController();request.current=c;
  setSelected(player);setMatches([]);setError('');setReport(null);setLoadingReport(true);
  try {
   const r=await fetch('/api/research/player?'+new URLSearchParams({sport,id:player.id,name:player.name}),{signal:c.signal});
   const data=await r.json();if(!r.ok)throw new Error(data.error||'Research unavailable');
   if(!c.signal.aborted)setReport(data);
  }catch(e){if(!c.signal.aborted)setError(e.message);}finally{if(!c.signal.aborted)setLoadingReport(false);}
 }
 return <div className="research-shell">
  <section className="research-hero">
    <div><div className="eyebrow">AUTOMATIC PLAYER LOOKUP</div><h2>Research the player.<br/><span>Before the betting line.</span></h2><p>Real game logs, recorded injury-feed information, historical hit rates and clearly labeled research gaps. No manufactured AI percentages.</p></div>
    <Search size={35}/>
  </section>
  <section className="research-panel">
   <div className="research-panel-heading"><h2>Search NBA, NFL or soccer players</h2><p>Public ESPN sources; coverage can be incomplete or unavailable. Search once and choose a matching result.</p></div>
   <form className="research-search" onSubmit={search}>
     <select aria-label="Sport" value={sport} onChange={e=>reset(e.target.value)}>{Object.keys(MARKETS).map(s=><option key={s}>{s}</option>)}</select>
     <input aria-label="Player name" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a player, e.g. Nikola Jokic" required minLength={2}/>
     <button className="button primary" disabled={loading||query.trim().length<2}>{loading?<><RefreshCw size={15}/> Searching…</>:<><Search size={15}/> Search player</>}</button>
   </form>
   {error && <p className="research-warning" role="alert"><AlertTriangle size={16}/> {error}</p>}
   {matches.length>0 && <div className="research-matches">{matches.map(p=><button className="research-result" key={p.id} onClick={()=>choose(p)}><span><strong>{p.name}</strong><small>{p.team} {p.position?'· '+p.position:''}</small></span><ArrowRight size={16}/></button>)}</div>}
  </section>
  {selected && <section className="research-panel">
   <div className="research-panel-heading"><h2>{selected.name}</h2><p>{selected.team || sport} {selected.position?'· '+selected.position:''} {report?'· Data checked '+new Date(report.fetchedAt).toLocaleString():''}</p></div>
   {loadingReport?<p className="research-loading"><RefreshCw size={16}/> Loading player game logs and reported injuries…</p> : report && <>
    <div className="research-inputs">
      <label>Analyze market<select aria-label="Research market" value={market} onChange={e=>setMarket(e.target.value)}>{options.map(([label])=><option key={label}>{label}</option>)}</select></label>
      <label>Bookmaker line<input aria-label="Bookmaker line" value={line} type="number" step="0.5" min="0" onChange={e=>setLine(e.target.value)}/></label>
      <label>American odds (verify current price)<input aria-label="User entered odds" value={odds} type="number" onChange={e=>setOdds(e.target.value)}/></label>
    </div>
    <div className="research-stats">
      <Summary title="Last 5 average" value={history?fmt(history.last5.average):'—'} subtitle={history?history.last5.games+' recorded games':'No matching stats'}/>
      <Summary title="Last 10 average" value={history?fmt(history.last10.average):'—'} subtitle={history?history.last10.games+' recorded games':'No matching stats'}/>
      <Summary title="Last 10 over line" value={last?last.over+'/'+last.games:'—'} subtitle={last?'Historical rate '+percent(last.over/last.games):'No matching stats'}/>
      <Summary title="Odds break-even rate" value={percent(analysis.breakEven)} subtitle="From user-entered odds, not model confidence"/>
    </div>
    
    <section className="research-subpanel">
      <h3>Independent rolling forecast (exploratory)</h3>
      {forecast.ready ? <>
        <div className="forecast-preview">
          <div><span>Rolling estimate</span><strong>{fmt(forecast.projection)}</strong></div>
          <div><span>Line comparison</span><strong>{forecast.lean.replaceAll('_',' ')}</strong></div>
          <div><span>L5 / L20 average</span><strong>{fmt(forecast.observed.avg5)} / {fmt(forecast.observed.avg20)}</strong></div>
          <div><span>Walk-forward absolute error</span><strong>{forecast.walkForward.mae===null?'Not enough games':fmt(forecast.walkForward.mae)}</strong></div>
        </div>
        <p>Projection uses recent averages, a robust median, and recency-weighting. Walk-forward scoring uses only earlier games to predict later games. Neither is a calibrated probability or a bet recommendation.</p>
        <p>Recent median: {fmt(forecast.observed.median10)} · Historical game-to-game volatility: {fmt(forecast.observed.volatility)} · Trend versus L20: {fmt(forecast.observed.streak)}</p>
        {forecast.observed.minutes && <p>Observed minutes, last 5: {fmt(forecast.observed.minutes.last5)}, baseline: {fmt(forecast.observed.minutes.last20)}. Future minutes remain unverified.</p>}
        {forecast.notes.map((note,i)=><p key={i} className="research-muted">• {note}</p>)}
      </>:<p className="research-warning">{forecast.reason}</p>}
    </section>
    <section className="research-subpanel"><h3>Game-by-game results</h3><p>Seasons {report.seasonsUsed?.join(" + ")||report.season}. Latest available games first. These are historical results, not a forecast.</p>{report.historyCrossesSeasons && <p className="research-warning">Some games come from an earlier season. Current-season games: {report.currentSeasonGames}. Do not assume the player has the same minutes, role or teammates as last season.</p>}
      {logs.length?<div className="research-table-wrap"><table className="research-table"><thead><tr><th>Date</th><th>Opponent</th><th>{market}</th><th>Line result</th></tr></thead><tbody>{logs.slice(0,20).map(g=><tr key={g.id}><td>{g.date?new Date(g.date).toLocaleDateString():'Date unknown'}</td><td>{g.opponent||'—'}</td><td>{g.metric}</td><td>{!validLine?'—':g.metric>Number(line)?'Over':g.metric<Number(line)?'Under':'Push'}</td></tr>)}</tbody></table></div>:<p className="research-warning">No parseable {market.toLowerCase()} game logs were returned. This market cannot be analyzed from the current source.</p>}
    </section>
    <section className="research-subpanel"><h3>Upcoming opponent and rest</h3>
      {report.nextGame?<><p><strong>{selected.team}</strong> {report.nextGame.homeAway==='away'?'at':'vs'} <strong>{report.nextGame.opponent}</strong> · {new Date(report.nextGame.startsAt).toLocaleString()}</p>
        <p>Time since most recent recorded game: {logs[0]?.date && Number.isFinite(Date.parse(logs[0].date)) ? Math.max(0,Math.floor((Date.parse(report.nextGame.startsAt)-Date.parse(logs[0].date))/86400000))+' days (approximate)' : 'Unavailable'}.</p>
        <p className="research-muted">The opponent and rest gap are schedule facts. Defensive matchup quality, projected starters, travel burden, pace and expected minutes have not been modeled.</p>
      </>:<p>{report.scheduleStatus==='unavailable'?'The game schedule could not be retrieved.':'No upcoming game for this player was identified in the available 7-day fixture window.'}</p>}
      <div className="research-sources"><a href={report.sources.schedule} target="_blank" rel="noreferrer">Fixture source <ExternalLink size={12}/></a></div>
    </section>
    <section className="research-subpanel"><h3>Reported injuries and lineup uncertainty</h3>
      <p>{report.injuryStatus==='unavailable'?'Injury feed unavailable.':report.injuries.length?'These listings appeared in the source feed. Verify with official team reports before using them.':'No matching listing in the third-party feed. This does not confirm the player is healthy or starting.'}</p>
      {report.injuries.map((x,i)=><p key={i} className="research-warning"><AlertTriangle size={14}/> {x.status} {x.details}</p>)}
      <p className="research-muted">Teammate absences, probable minutes, and opponent defense have NOT been verified by this integration. The website must not make claims about those factors without another data source.</p>
    </section>
    <section className="research-subpanel">
      <h3>Research verdict: {analysis.verdict}</h3>
      <p>{sampleCount ? 'Recent historical average: '+fmt(logs.slice(0,10).reduce((a,g)=>a+g.metric,0)/Math.min(10,logs.length))+' '+market.toLowerCase()+'. ':'No usable history. '}
      {last ? 'In the last '+last.games+' recorded games, '+last.over+' finished above '+line+'. ' : ''}
      This is NOT a prediction of today's result. A calibrated model plus verified current odds, injuries, rotations and matchup data are required before recommending a bet.</p>
      {invalidSeason && <p className="research-warning">Only an older season was available. Do not use it as today's form.</p>}
      <div className="research-sources">Sources: <a href={report.sources.gamelog} target="_blank" rel="noreferrer">Game log <ExternalLink size={12}/></a><a href={report.sources.injuries} target="_blank" rel="noreferrer">Injury feed <ExternalLink size={12}/></a>{report.sources.previousGamelog && <a href={report.sources.previousGamelog} target="_blank" rel="noreferrer">Previous season <ExternalLink size={12}/></a>}</div>
      {(report.warnings||[]).map((w,i)=><p className="research-muted" key={i}>⚠ {w}</p>)}
    </section>
   </>}
  </section>}
 </div>;
}

function ParlayBuilder({importedMarkets=[]}) {
 const [sport,setSport]=useState('NBA'),[target,setTarget]=useState(3);
 const [snapshots,setSnapshots]=useState([]),[selected,setSelected]=useState([]),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[fetched,setFetched]=useState(''),[now,setNow]=useState(Date.now());
 const [provider,setProvider]=useState({checking:true,configured:false,freeMode:false});
 const [nextOffset,setNextOffset]=useState(0),[totalEvents,setTotalEvents]=useState(null);
 useEffect(()=>{const controller=new AbortController();
   fetch('/api/props/status',{signal:controller.signal})
    .then(r=>r.ok?r.json():Promise.reject(new Error('Odds service unavailable')))
    .then(data=>setProvider({checking:false,configured:Boolean(data.configured),freeMode:Boolean(data.freeMode)}))
    .catch(()=>{if(!controller.signal.aborted)setProvider({checking:false,configured:false,freeMode:false});});
   return()=>controller.abort();
 },[]);
 useEffect(()=>{const tick=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(tick);},[]);
 const currentSnapshots=snapshots.filter(s=>Number.isFinite(Date.parse(s.expiresAt))&&Date.parse(s.expiresAt)>now);
 const available=Array.from(new Map(currentSnapshots.flatMap(s=>s.picks||[])
   .filter(p=>Number.isFinite(p.ev)&&Number.isFinite(p.odds)&&p.eventId
      && Number.isFinite(Date.parse(p.startsAt))&&Date.parse(p.startsAt)>now)
   .map(p=>[p.id,p])).values());
 const readyCandidates=available.filter(p=>summarizeEligibility([p],1).canSuggest);
 const selectedPicks=available.filter(p=>selected.includes(p.id));
 const differentEvents=selectedPicks.every((p,i)=>selectedPicks.findIndex(v=>v.eventId===p.eventId)===i);
 const decimal=selectedPicks.reduce((x,p)=>x*americanToDecimal(p.odds),1);
 const american=selectedPicks.length?decimalToAmerican(decimal):null;
 const distinctEvents=new Set(available.map(p=>p.eventId)).size;
 const canScanNext=provider.freeMode&&provider.configured&&totalEvents!==null&&nextOffset<totalEvents&&nextOffset<=24;
 const readyEvents=new Set(readyCandidates.map(p=>p.eventId)).size;
 async function scan(next=false) {
   if(next&&!canScanNext)return;
   setBusy(true);setError('');
   if(!next){setSnapshots([]);setSelected([]);setTotalEvents(null);setNextOffset(0);setFetched('');}
   const offset=next?nextOffset:0;
   try{
     const params=new URLSearchParams({sport,timeZone:'America/Denver',
       ...(sport==='SOCCER'?{league:'soccer_epl'}:{}),
       ...(provider.freeMode?{eventOffset:String(offset)}:{})});
     const response=await fetch('/api/props?'+params);
     const data=await response.json();
     if(!response.ok)throw new Error(data.error||'No current prop provider available.');
     if(!Array.isArray(data.picks)||!Number.isInteger(data.eventsAvailable)||!Number.isInteger(data.eventsRequested))
       throw new Error('The sportsbook feed did not return a valid scan.');
     const snapshot={picks:data.picks,expiresAt:data.expiresAt};
     setSnapshots(previous=>next?
       [...previous.filter(s=>Date.parse(s.expiresAt)>Date.now()),snapshot]:[snapshot]);
     setNow(Date.now());setFetched(data.fetchedAt||new Date().toISOString());
     setTotalEvents(data.eventsAvailable);
     setNextOffset(offset+Math.max(data.eventsRequested,1));
     if(!data.picks.length)setError('This game had no qualifying price candidates. '+(provider.freeMode?'You can scan the next game, but it may use more API credits.':'No selections were fabricated.'));
     else if(provider.freeMode)setError('Scanned '+(offset+1)+' of '+data.eventsAvailable+' upcoming games. More games may have different candidates; each manual scan may spend API credits.');
   }catch(e){setError(e.message);}
   finally{setBusy(false);}
 }
 function suggest(){
   const ordered=[...readyCandidates].sort((a,b)=>(b.research?.verifiedChecks||0)-(a.research?.verifiedChecks||0)||b.ev-a.ev);
   const picks=[],events=new Set();
   for(const p of ordered){
     if(events.has(p.eventId))continue;
     events.add(p.eventId);picks.push(p.id);
     if(picks.length===target)break;
   }
   setSelected(picks);
   setError(picks.length<2?
    'No research shortlist: fewer than two different games have verified player/fixture data, enough game logs, and agreeing trend and market signals.':
    'Research-only shortlist: '+picks.length+' of '+target+' target legs. Official injury clearance, projected minutes, opponent defense and calibrated probabilities remain missing.');
 }
 function toggle(p,checked){
   if(!checked){setSelected(xs=>xs.filter(id=>id!==p.id));return;}
   if(conflictsWithSlip(p,selectedPicks)){
     setError('Cannot select both sides of the same player prop. Choose only one side after reviewing the evidence.');return;
   }
   setSelected(xs=>xs.length>=8?xs:[...xs,p.id]);setError('');
 }
 function changeSport(value){
   setSport(value);setSnapshots([]);setSelected([]);setError('');setNextOffset(0);setTotalEvents(null);setFetched('');
 }
 return <div className="research-shell">
   <section className="research-hero"><div><div className="eyebrow">PARLAY RESEARCH</div><h2>Compare real prices.<br/><span>Understand combined risk.</span></h2><p>Build a research shortlist from separate events when actual player history and prices agree. Unverified injuries, rotations, and uncalibrated probabilities remain visible.</p></div><Layers3 size={34}/></section>
   <section className="research-panel">
     <div className="research-panel-heading"><h2>Live sportsbook candidate research</h2><p>Requires server-side Odds API access. With free-budget mode, every explicit scan examines only ONE additional event/market, conserving credits.</p></div>
     {!provider.checking&&!provider.configured&&<p className="research-warning">No sportsbook feed connected. Configure ODDS_API_KEY privately, or use the manual calculator below.</p>}
     {provider.checking&&<p className="research-muted">Checking sportsbook connection…</p>}
     <div className="research-search">
       <select aria-label="Parlay sport" value={sport} onChange={e=>changeSport(e.target.value)}>{Object.keys(MARKETS).map(s=><option key={s}>{s}</option>)}</select>
       <label className="research-leg-label">Target legs <select value={target} onChange={e=>setTarget(Number(e.target.value))}>{[2,3,4,5,6,7,8].map(n=><option key={n}>{n}</option>)}</select></label>
       <button type="button" className="button primary" disabled={busy||provider.checking||!provider.configured} onClick={()=>scan(false)}>{busy?'Scanning…':'Scan first game'}</button>
       {provider.freeMode&&<button type="button" className="button secondary" disabled={busy||!canScanNext} onClick={()=>scan(true)}>Scan next game (uses credits)</button>}
       <button type="button" className="button secondary" disabled={busy||readyEvents<2} onClick={suggest}>Suggest research shortlist</button>
     </div>
     <p className="research-muted">Games with price candidates: {distinctEvents}. Distinct games meeting historical research requirements: {readyEvents}. Target: {target}. {totalEvents!==null?'Available upcoming games: '+totalEvents+'. '+(nextOffset<totalEvents?'Next game: '+(nextOffset+1)+'.':'No further games in this window.') : 'Scan games individually to expand coverage.'}</p>
     {provider.freeMode&&<p className="research-muted">Each new game can consume API credits. Previously scanned results are cached briefly; prices older than five minutes automatically disappear. Scanning more games never guarantees more props or a validated parlay.</p>}
     {error&&<p className="research-warning" role="status"><AlertTriangle size={15}/> {error}</p>}
     {fetched&&<p className="research-muted">Latest sportsbook fetch: {new Date(fetched).toLocaleString()} · price consensus is not a player-performance forecast.</p>}
     {available.length>0&&<div className="research-candidates">{available.slice(0,40).map(p=>
       <label key={p.id} className="research-candidate">
        <input type="checkbox" checked={selected.includes(p.id)}
         disabled={p.research?.status==='BLOCKED'||(!selected.includes(p.id)&&(selected.length>=8||conflictsWithSlip(p,selectedPicks)))}
         onChange={e=>toggle(p,e.target.checked)}/>
        <span><strong>{p.player} — {p.side} {p.line} {p.marketLabel||p.marketKey}</strong>
         <small>{p.event} · {p.book} · {p.odds>0?'+':''}{p.odds} · market price discrepancy {p.ev.toFixed(1)}%</small>
         <small><strong>Research: {p.research?.status||'NOT CHECKED'}</strong> · {p.research?.verifiedChecks??0}/{p.research?.totalChecks??9} verified checks
          {p.research?.historical?.last10?.games?' · '+p.research.historical.last10.games+' recorded games':' · missing usable game history'}</small>
         {p.research?.forecast?.ready?
           <small>Rolling projection {p.research.forecast.projection} · {p.research.agreement==='AGREES'?'Trend agrees':p.research.agreement==='DISAGREES'?'Trend disagrees':'Trend inconclusive'}</small>:
           <small>Rolling projection requires at least 10 dated games; independent walk-forward checking requires more history.</small>}
         {(p.research?.warnings||[]).slice(0,2).map((w,i)=><small key={i} className="research-candidate-warning">{w}</small>)}
        </span>
       </label>)}</div>}
   </section>
   <section className="research-panel">
     <div className="research-panel-heading"><h2>Parlay research slip</h2><p>{selectedPicks.length} selected legs · no wager placed</p></div>
     {selectedPicks.length?<>
       <div className="research-stats">
         <Summary title="Combined decimal payout" value={decimal.toFixed(2)+'x'} subtitle="Quoted odds multiplication; not predicted value"/>
         <Summary title="Combined American odds" value={(american>0?'+':'')+Math.round(american)} subtitle="Prices subject to bookmaker acceptance"/>
         <Summary title="Legs" value={String(selectedPicks.length)} subtitle={differentEvents?'Different events':'Shared event — correlation risk'}/>
       </div>
       <p className="research-warning"><AlertTriangle size={16}/> {differentEvents?'Different events can still share risks.':'Same-event legs can be correlated and may be rejected.'} Probability and expected value of this combination are unknown without calibrated forecasts and a correlation model.</p>
       {selectedPicks.map(p=><p className="research-slip-line" key={p.id}>{p.player} — {p.side} {p.line} {p.marketLabel||p.marketKey} <span>{p.odds>0?'+':''}{p.odds}</span></p>)}
     </>:<p className="research-muted">Two opposite bets for the same player in one game are alternatives, not two parlay legs. A 5-leg research shortlist requires at least five eligible, distinct game selections.</p>}
   </section>
   <ManualSlip importedMarkets={importedMarkets}/>
 </div>;
}
export default function ResearchLab({mode='research',initialSearch=null,importedMarkets=[]}){return mode==='research'?<PlayerResearch initialSearch={initialSearch}/>:<ParlayBuilder importedMarkets={importedMarkets}/>;}
