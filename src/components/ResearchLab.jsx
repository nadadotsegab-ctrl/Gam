import React, { useMemo, useRef, useState } from 'react';
import { Search, Activity, AlertTriangle, ArrowRight, RefreshCw, ShieldCheck, Layers3, ExternalLink } from 'lucide-react';
import { summarizeGames, evaluateProp } from '../lib/research.js';
import { americanToDecimal, decimalToAmerican } from '../lib/odds.js';

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
 const [market,setMarket]=useState(MARKETS[initialSearch?.sport]?.[0]?.[0]||'Points'),[line,setLine]=useState('25.5'),[odds,setOdds]=useState('-110');
 const [loading,setLoading]=useState(false),[loadingReport,setLoadingReport]=useState(false),[error,setError]=useState('');
 const request=useRef(null);
 const options=MARKETS[sport];
 const keys=options.find(m=>m[0]===market)?.[1]||options[0][1];
 const logs=(report?.games||[]).map(g=>({ ...g, metric:marketValue(g,keys) })).filter(g=>g.metric!==null);
 const validLine=line.trim()!=='' && Number.isFinite(Number(line)) && Number(line)>=0;
 const values=logs.map(g=>g.metric);
 const analysis=useMemo(()=>evaluateProp({values,line:validLine?Number(line):NaN,odds:Number(odds)}),[report,market,line,odds]);
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
      <label>American odds (user-entered)<input aria-label="User entered odds" value={odds} type="number" onChange={e=>setOdds(e.target.value)}/></label>
    </div>
    <div className="research-stats">
      <Summary title="Last 5 average" value={history?fmt(history.last5.average):'—'} subtitle={history?history.last5.games+' recorded games':'No matching stats'}/>
      <Summary title="Last 10 average" value={history?fmt(history.last10.average):'—'} subtitle={history?history.last10.games+' recorded games':'No matching stats'}/>
      <Summary title="Last 10 over line" value={last?last.over+'/'+last.games:'—'} subtitle={last?'Historical rate '+percent(last.over/last.games):'No matching stats'}/>
      <Summary title="Odds break-even rate" value={percent(analysis.breakEven)} subtitle="From user-entered odds, not model confidence"/>
    </div>
    <section className="research-subpanel"><h3>Game-by-game results</h3><p>Season {report.season}. Latest available games first. These are historical results, not a forecast.</p>
      {logs.length?<div className="research-table-wrap"><table className="research-table"><thead><tr><th>Date</th><th>Opponent</th><th>{market}</th><th>Line result</th></tr></thead><tbody>{logs.slice(0,20).map(g=><tr key={g.id}><td>{g.date?new Date(g.date).toLocaleDateString():'Date unknown'}</td><td>{g.opponent||'—'}</td><td>{g.metric}</td><td>{!validLine?'—':g.metric>Number(line)?'Over':g.metric<Number(line)?'Under':'Push'}</td></tr>)}</tbody></table></div>:<p className="research-warning">No parseable {market.toLowerCase()} game logs were returned. This market cannot be analyzed from the current source.</p>}
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
      <div className="research-sources">Sources: <a href={report.sources.gamelog} target="_blank" rel="noreferrer">Game log <ExternalLink size={12}/></a><a href={report.sources.injuries} target="_blank" rel="noreferrer">Injury feed <ExternalLink size={12}/></a></div>
      {(report.warnings||[]).map((w,i)=><p className="research-muted" key={i}>⚠ {w}</p>)}
    </section>
   </>}
  </section>}
 </div>;
}
function ParlayBuilder(){
 const [sport,setSport]=useState('NBA'),[target,setTarget]=useState(3),[available,setAvailable]=useState([]),[selected,setSelected]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[fetched,setFetched]=useState('');
 const chosen=available.filter(p=>selected.includes(p.id));
 const differentEvents=chosen.every((p,i)=>chosen.findIndex(v=>v.eventId===p.eventId)===i);
 const decimal=chosen.reduce((x,p)=>x*americanToDecimal(p.odds),1);
 const american=chosen.length ? decimalToAmerican(decimal) : null;
 async function scan(){
  setBusy(true);setError('');setAvailable([]);setSelected([]);setFetched('');
  try{
   const r=await fetch('/api/props?'+new URLSearchParams({sport,timeZone:'America/Denver',...(sport==='SOCCER'?{league:'soccer_epl'}:{})}));
   const result=await r.json();
   if(!r.ok)throw new Error(result.error||'No current prop provider available.');
   setAvailable((result.picks||[]).filter(p=>p && Number.isFinite(p.ev) && Number.isFinite(p.odds) && p.eventId).slice(0,80));
   setFetched(result.fetchedAt||new Date().toISOString());
   if(!(result.picks||[]).length)setError('No qualified live player props are available. No selections have been invented.');
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 function suggest(){
   const result=[],events=new Set();
   for(const p of [...available].sort((a,b)=>b.ev-a.ev)) {
     if(events.has(p.eventId))continue;
     events.add(p.eventId);result.push(p.id);
     if(result.length===target)break;
   }
   setSelected(result);
   if(result.length<2)setError('Not enough distinct-game candidates to build a research shortlist.');
   else setError('Shortlist generated by market-price discrepancy only—not injury analysis or a calibrated model.');
 }
 return <div className="research-shell">
  <section className="research-hero"><div><div className="eyebrow">PARLAY RESEARCH</div><h2>Compare real prices.<br/><span>Understand combined risk.</span></h2><p>Build a tentative shortlist from available sportsbook feeds. We will not label it a likely winner without validated joint probabilities.</p></div><Layers3 size={34}/></section>
  <section className="research-panel">
   <div className="research-panel-heading"><h2>Build from available live prop candidates</h2><p>Requires ODDS_API_KEY and a plan with prop-market access. A scan can consume your free API credits.</p></div>
   <div className="research-search">
    <select aria-label="Parlay sport" value={sport} onChange={e=>{setSport(e.target.value);setAvailable([]);setSelected([]);}}>{Object.keys(MARKETS).map(s=><option key={s}>{s}</option>)}</select>
    <label className="research-leg-label">Target legs <select value={target} onChange={e=>setTarget(Number(e.target.value))}>{[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
    <button className="button primary" disabled={busy} onClick={scan}>{busy?'Loading candidates…':'Load live candidates'}</button>
    <button className="button secondary" disabled={busy||available.length<2} onClick={suggest}>Suggest shortlist</button>
   </div>
   {error && <p className="research-warning"><AlertTriangle size={15}/> {error}</p>}
   {fetched && <p className="research-muted">Source: The Odds API · fetched {new Date(fetched).toLocaleString()} · sportsbook consensus is NOT a player-performance forecast.</p>}
   {available.length>0 && <div className="research-candidates">
     {available.slice(0,32).map(p=><label key={p.id} className="research-candidate">
       <input type="checkbox" checked={selected.includes(p.id)} disabled={!selected.includes(p.id)&&selected.length>=8} onChange={e=>setSelected(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/>
       <span><strong>{p.player} — {p.side} {p.line} {p.marketLabel||p.marketKey}</strong><small>{p.event} · {p.book} · {p.odds>0?'+':''}{p.odds} · market price discrepancy {p.ev.toFixed(1)}%</small></span>
     </label>)}
   </div>}
  </section>
  <section className="research-panel">
    <div className="research-panel-heading"><h2>Parlay research slip</h2><p>{chosen.length} selected legs · no wager placed</p></div>
    {chosen.length?<>
       <div className="research-stats">
         <Summary title="Combined decimal payout" value={decimal.toFixed(2)+'x'} subtitle="Quoted odds multiplication; not expected profit"/>
         <Summary title="Combined American odds" value={(american>0?'+':'')+Math.round(american)} subtitle="Subject to bookmaker acceptance"/>
         <Summary title="Legs" value={String(chosen.length)} subtitle={differentEvents?'Different events only':'Shared event — high correlation risk'}/>
       </div>
       <p className="research-warning"><AlertTriangle size={16}/> {differentEvents?'Even distinct-game legs can share risks.':'This slip contains multiple legs in one event; independent probabilities are invalid.'} Combined win probability and expected value are intentionally unavailable without calibrated models and correlation testing.</p>
       {chosen.map(p=><p key={p.id} className="research-slip-line">{p.player} — {p.side} {p.line} {p.marketLabel||p.marketKey} <span>{p.odds>0?'+':''}{p.odds}</span></p>)}
    </>:<p className="research-muted">Load live props and choose picks, or use Suggest shortlist to pick non-overlapping games from available market discrepancies. If no feed is connected, UltraX won't generate fake picks.</p>}
  </section>
 </div>;
}
export default function ResearchLab({mode='research',initialSearch=null}){return mode==='research'?<PlayerResearch initialSearch={initialSearch}/>:<ParlayBuilder/>;}
