import React, {useMemo,useState} from 'react';
import {evaluateProp,evaluateParlay} from '../lib/research.js';

const panel = {background:'var(--panel-bg, rgba(127,127,127,.06))',border:'1px solid rgba(128,128,128,.25)',borderRadius:14,padding:22,marginBottom:16};
export default function ResearchLab({mode='research'}) {
 const [name,setName]=useState(''),[sport,setSport]=useState('NBA'),[market,setMarket]=useState('Points'),[line,setLine]=useState('25.5'),[odds,setOdds]=useState('-110'),[logs,setLogs]=useState(''),[injuryNotes,setInjuryNotes]=useState(''),[opponentNotes,setOpponentNotes]=useState('');
 const [legs,setLegs]=useState([{name:'',odds:'-110',probability:'',eventId:''},{name:'',odds:'-110',probability:'',eventId:''}]);
 const values=useMemo(()=>logs.trim() ? logs.split(/[\s,;]+/).map(Number) : [],[logs]);
 const result=useMemo(()=>evaluateProp({values,line:Number(line),odds:Number(odds)}),[values,line,odds]);
 let parlayResult,parlayError='';
 try { parlayResult=evaluateParlay(legs.map(l=>({...l,odds:Number(l.odds),probability:Number(l.probability)/100,calibrated:false}))); }catch(e){parlayError=e.message}
 const inputStyle={width:'100%',padding:'11px',borderRadius:8,background:'transparent',border:'1px solid #888',color:'inherit'};
 const field=(label,value,setter,type='text')=><label style={{display:'block',marginBottom:12}}><div style={{marginBottom:6}}>{label}</div><input style={inputStyle} type={type} value={value} onChange={e=>setter(e.target.value)}/></label>;
 return <div style={{maxWidth:1100}}>
  {mode==='research' ? <>
   <section style={panel}><h2>Player research workspace</h2><p>Enter known player stats and contextual notes. This version does not invent injuries or claim unverified daily picks. Live player lookup is the next data integration.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:15}}>
      {field('Player name',name,setName)}
      <label>Sport<select style={inputStyle} value={sport} onChange={e=>setSport(e.target.value)}>{['NBA','NFL','SOCCER'].map(s=><option key={s}>{s}</option>)}</select></label>
      {field('Market',market,setMarket)}
      {field('Prop line',line,setLine,'number')}
      {field('Offered American odds',odds,setOdds,'number')}
    </div>
    <label>Most recent game results first (comma-separated)<textarea style={{...inputStyle,minHeight:85}} placeholder="28, 24, 31, 20, 27" value={logs} onChange={e=>setLogs(e.target.value)}/></label>
   </section>
   <section style={panel}><h2>Historical performance</h2>{result.history ? <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Window</th><th>Average</th><th>Over</th><th>Under</th><th>Push</th></tr></thead><tbody>{['last5','last10','last20'].map(k=><tr key={k}><td>{k}</td><td>{result.history[k].average.toFixed(1)}</td><td>{result.history[k].over}/{result.history[k].games}</td><td>{result.history[k].under}/{result.history[k].games}</td><td>{result.history[k].pushes}</td></tr>)}</tbody></table></div>:<p>Enter player game results to see historical hit rates.</p>}</section>
   <section style={panel}><h2>Injuries and matchup research</h2><p>Record sourced findings here. Manually entered notes are not independently verified by UltraX.</p>
    <label>Injury / lineup notes<textarea style={{...inputStyle,minHeight:80}} value={injuryNotes} onChange={e=>setInjuryNotes(e.target.value)} placeholder="Status, source URL, and time checked"/></label>
    <label>Opponent / minutes / rest notes<textarea style={{...inputStyle,minHeight:80}} value={opponentNotes} onChange={e=>setOpponentNotes(e.target.value)} placeholder="Defensive matchup, expected minutes, rest, sources"/></label>
   </section>
   <section style={panel}><h2>Verdict: {result.verdict}</h2><p>Break-even probability at entered odds: {result.breakEven===null?'Unknown':(result.breakEven*100).toFixed(1)+'%'}. Model probability: unavailable until validated. Entered results cannot establish today's winning probability.</p>{result.warnings.map(w=><p key={w}>⚠ {w}</p>)}</section>
  </> : <>
   <section style={panel}><h2>AI Parlay Builder — research foundation</h2><p>Build a slip and inspect its inputs. UltraX will not manufacture win probabilities or call parlays safe. Calibrated per-leg predictions, current odds, and correlation modeling must be connected before automatic ranked recommendations are enabled.</p>
    {legs.map((leg,i)=><div key={i} style={{...panel,marginBottom:12}}><strong>Leg {i+1}</strong><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12}}>{[['Selection','name'],['American odds','odds'],['Model probability % (requires validation)','probability'],['Event ID','eventId']].map(([label,key])=><label key={key}>{label}<input style={inputStyle} value={leg[key]} onChange={e=>setLegs(old=>old.map((l,j)=>i===j?{...l,[key]:e.target.value}:l))}/></label>)}</div></div>)}
    <button className="button secondary" disabled={legs.length>=8} onClick={()=>setLegs(ls=>[...ls,{name:'',odds:'-110',probability:'',eventId:''}])}>Add leg</button> <button className="button secondary" disabled={legs.length<=2} onClick={()=>setLegs(ls=>ls.slice(0,-1))}>Remove leg</button>
    <p style={{marginTop:18}}>Status: <strong>RESEARCH ONLY</strong>. {parlayError || parlayResult?.warning} No wagers are placed by this tool.</p>
   </section>
  </>}
 </div>;
}
