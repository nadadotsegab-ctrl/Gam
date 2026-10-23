import React, {useMemo,useState} from 'react';
import { calculateSlip } from '../lib/slip.js';
import { americanToDecimal } from '../lib/odds.js';
import { Plus, Trash2, Copy, AlertTriangle } from 'lucide-react';

const emptyLeg = () => ({selection:'',event:'',odds:'',source:'manual'});
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export default function ManualSlip({importedMarkets=[]}) {
  const [legs,setLegs]=useState([emptyLeg(),emptyLeg()]);
  const [stake,setStake]=useState('10');
  const [message,setMessage]=useState('');
  const [importSport,setImportSport]=useState('All');
  const records = useMemo(()=>importedMarkets.filter(m=>m && m.event && m.selection && typeof m.odds==='object' && (!m.startsAt || Date.parse(m.startsAt)>Date.now())).slice(0,500),[importedMarkets]);
  const choices = records.filter(m=>importSport==='All' || m.sport===importSport);
  let calculation=null,validation='';
  try {calculation=calculateSlip(legs,stake.trim()===''?NaN:Number(stake));}catch(error){validation=error.message;}
  function setLeg(i,key,value){setLegs(current=>current.map((l,j)=>i===j?{...l,[key]:value,source:'manual'}:l));setMessage('');}
  function addImported(m) {
    const entries=Object.entries(m.odds).filter(([name,value])=>name && Number.isFinite(value)&&Math.abs(value)>=100);
    if(!entries.length){setMessage('No usable American odds in that imported market.');return;}
    const [book,price]=entries.reduce((a,b)=>americanToDecimal(b[1])>americanToDecimal(a[1])?b:a);
    const next={selection:m.selection,event:m.event,odds:String(price),source:'imported · '+book};
    setLegs(current=>{
      const empty=current.findIndex(l=>!l.selection.trim());
      if(empty>=0)return current.map((l,i)=>i===empty?next:l);
      return current.length<8?[...current,next]:current;
    });
    setMessage('Imported snapshot added. Verify that the price is still available before using it.');
  }
  function copy(){
    if(!calculation)return;
    const text=legs.map((l,i)=>'Leg '+(i+1)+': '+l.selection+' | '+l.event+' | '+l.odds).join('\n')+'\nStake: '+money(calculation.stake)+'\nPotential payout: '+money(calculation.potentialPayout)+'\nUnverified prices / NOT a prediction.';
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>setMessage('Research slip copied.')).catch(()=>setMessage('Clipboard is unavailable.'));
    else setMessage('Clipboard is unavailable in this browser.');
  }
  return <section className="research-panel">
    <div className="research-panel-heading">
      <h2>Build a parlay without an API key</h2>
      <p>This calculator works immediately. Add prices from your sportsbook or a previously imported snapshot. It calculates payouts, not predicted winners.</p>
    </div>
    {choices.length>0 && <div className="research-subpanel">
       <h3>Available imported markets (not live)</h3>
       <div className="research-search"><label>Sport<select value={importSport} onChange={e=>setImportSport(e.target.value)}>{['All','NBA','NFL','MLB','NHL'].map(s=><option key={s}>{s}</option>)}</select></label></div>
       <div className="research-matches">{choices.slice(0,35).map(m=><button type="button" className="research-result" key={m.id} onClick={()=>addImported(m)}><span><strong>{m.selection} · {m.market}</strong><small>{m.event} · Imported snapshot · verify before betting</small></span><Plus size={16}/></button>)}</div>
       <p className="research-muted">For multiple sportsbooks, the best quoted payout is selected from your imported snapshot. Confirm that the offered price is still available at the chosen sportsbook.</p>
    </div>}
    <div className="research-manual-grid">
      {legs.map((leg,i)=><div className="research-subpanel" key={i}>
        <div className="research-manual-heading"><h3>Leg {i+1}</h3><span className="research-muted">{leg.source==='manual'?'User-entered':leg.source}</span><button className="button secondary small" type="button" disabled={legs.length<=2} onClick={()=>setLegs(current=>current.filter((_,j)=>i!==j))}><Trash2 size={14}/> Remove</button></div>
        <div className="research-manual-fields">
          <label>Selection<input aria-label={'Selection for leg '+(i+1)} value={leg.selection} placeholder="Player over 25.5 points" onChange={e=>setLeg(i,'selection',e.target.value)}/></label>
          <label>Event (for correlation check)<input aria-label={'Event for leg '+(i+1)} value={leg.event} placeholder="DEN vs LAL" onChange={e=>setLeg(i,'event',e.target.value)}/></label>
          <label>American odds<input aria-label={'Odds for leg '+(i+1)} type="number" value={leg.odds} onChange={e=>setLeg(i,'odds',e.target.value)}/></label>
        </div>
      </div>)}
    </div>
    <div className="research-manual-actions">
      <button type="button" className="button secondary" disabled={legs.length>=8} onClick={()=>setLegs(a=>[...a,emptyLeg()])}><Plus size={14}/> Add leg</button>
      <label>Stake ($)<input aria-label="Parlay stake" type="number" min=".01" step=".01" value={stake} onChange={e=>setStake(e.target.value)}/></label>
      <button type="button" className="button secondary" disabled={!calculation} onClick={copy}><Copy size={14}/> Copy slip</button>
    </div>
    {validation && <p className="research-warning"><AlertTriangle size={15}/> {validation}</p>}
    {calculation && <>
      <div className="research-stats">
        <div className="stat-card"><div className="stat-label">Combined decimal odds</div><div className="stat-value">{calculation.payoutMultiplier.toFixed(2)}x</div></div>
        <div className="stat-card"><div className="stat-label">Combined American odds</div><div className="stat-value">{calculation.americanOdds>0?'+':''}{Math.round(calculation.americanOdds)}</div></div>
        <div className="stat-card"><div className="stat-label">Potential payout</div><div className="stat-value">{money(calculation.potentialPayout)}</div></div>
        <div className="stat-card"><div className="stat-label">Potential profit</div><div className="stat-value">{money(calculation.potentialProfit)}</div></div>
      </div>
      {calculation.warnings.map((warning,i)=><p className="research-warning" key={i}><AlertTriangle size={15}/> {warning}</p>)}
    </>}
    {message && <p className="research-muted" role="status">{message}</p>}
  </section>;
}
