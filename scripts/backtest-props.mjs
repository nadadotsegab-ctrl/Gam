#!/usr/bin/env node
/**
 * Independently implemented research-only grading for UltraX rolling forecasts.
 * Input CSV must contain legally obtained, historical PRE-GAME line snapshots:
 * event_time,sport,player,market,actual,line,offered_side,american_odds,quoted_at,source_url
 *
 * Missing quote timestamps are excluded from line-based performance; they
 * must never be synthesized from the settled result.
 * 
 * Usage: node scripts/backtest-props.mjs /path/to/historical-snapshots.csv
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { projectValues } from '../src/lib/forecast.js';
import { americanToDecimal } from '../src/lib/odds.js';

export function parseCSV(input) {
 const rows=[];let row=[],value='',inQuotes=false;
 const text=String(input).replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(inQuotes){
   if(ch==='"'&&text[i+1]==='"'){value+='"';i++;}
   else if(ch==='"')inQuotes=false;
   else value+=ch;
  }else if(ch==='"')inQuotes=true;
  else if(ch===','){row.push(value);value='';}
  else if(ch==='\n'){row.push(value);rows.push(row);row=[];value='';}
  else if(ch!=='\r')value+=ch;
 }
 if(inQuotes)throw Error('Unclosed CSV quote.');
 if(value.length||row.length){row.push(value);rows.push(row);}
 const [header,...data]=rows;
 if(!header?.length)throw Error('CSV header missing.');
 const names=header.map(h=>h.trim());
 if(new Set(names).size!==names.length)throw Error('CSV column names must be unique.');
 return data.filter(r=>r.some(v=>v.trim())).map((r,i)=>{
  if(r.length!==names.length)throw Error('Row '+(i+2)+' column count mismatch.');
  return Object.fromEntries(names.map((h,j)=>[h,r[j].trim()]));
 });
}
const REQUIRED=['event_time','sport','player','market','actual','line','offered_side','american_odds','quoted_at','source_url'];
export function backtestRecords(records) {
 if(!Array.isArray(records))throw Error('CSV rows missing.');
 const issues=[];
 const clean=[];
 for(const [index,row] of records.entries()){
  if(REQUIRED.some(k=>!(k in row))){throw Error('Missing required column: '+REQUIRED.find(k=>!(k in row)));}
  const event=Date.parse(row.event_time),quote=Date.parse(row.quoted_at);
  const actual=row.actual!==''?Number(row.actual):NaN;
  const line=row.line!==''?Number(row.line):NaN;
  const odds=row.american_odds!==''?Number(row.american_odds):NaN;
  const market=String(row.market).trim(),player=String(row.player).trim(),sport=String(row.sport).trim();
  if(!Number.isFinite(event)||!Number.isFinite(actual)||actual<0||!player||!market||!sport){
   issues.push('Row '+(index+2)+': missing settled game details; skipped.');continue;
  }
  // Forecast MAE can be measured without odds, but requires valid game timing.
  const validLine=Number.isFinite(quote) && quote<event &&
   Number.isFinite(line)&&line>=0 && Number.isInteger(odds) && Math.abs(odds)>=100 &&
   ['Over','Under'].includes(row.offered_side)&&row.source_url.startsWith('https://');
  if(!validLine)issues.push('Row '+(index+2)+': pregame sportsbook quote not verified; excluded from betting metrics.');
  clean.push({event,player,market,sport,actual,line:validLine?line:null,odds:validLine?odds:null,
    side:validLine?row.offered_side:null,quotedAt:validLine?quote:null,
    source:validLine?row.source_url:null,index});
 }
 clean.sort((a,b)=>a.event-b.event||a.index-b.index);
 const groupHistory=new Map(),scored=[],keys=new Set();
 for(const row of clean){
  const key=[row.sport,row.player.toLowerCase(),row.market].join('|');
  const id=key+'|'+row.event;
  if(keys.has(id)){issues.push('Duplicate '+id+' omitted.');continue;}
  keys.add(id);
  if(!groupHistory.has(key))groupHistory.set(key,[]);
  const history=groupHistory.get(key);
  const forecast=projectValues(history,['value'],{line:row.line,cutoff:row.event});
  if(forecast.ready){
   const result={sport:row.sport,player:row.player,market:row.market,event_time:new Date(row.event).toISOString(),
      projected:forecast.projection,actual:row.actual,absolute_error:Math.abs(forecast.projection-row.actual),
      quote_eligible:false,pick_result:null,profit_per_unit:null};
   const lean=forecast.lean==='OVER_LEAN'?'Over':forecast.lean==='UNDER_LEAN'?'Under':null;
   if(row.side && lean && lean===row.side && row.line!==null) {
    result.quote_eligible=true;
    const outcome=row.actual===row.line?'Push':(row.actual>row.line?'Over':'Under')===row.side?'Win':'Loss';
    result.pick_result=outcome;
    result.profit_per_unit=outcome==='Push'?0:outcome==='Win'?americanToDecimal(row.odds)-1:-1;
   }
   scored.push(result);
  }
  history.push({id,date:new Date(row.event).toISOString(),values:{value:row.actual}});
 }
 const mean=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
 const byKey=new Map();
 for(const row of scored){
  const key=row.sport+' | '+row.market;
  if(!byKey.has(key))byKey.set(key,[]);
  byKey.get(key).push(row);
 }
 const summarize=(items)=>{
  const sorted=[...items].sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time));
  const holdout=sorted.slice(Math.floor(sorted.length*.7));
  const graded=holdout.filter(r=>r.quote_eligible);
  const settled=graded.filter(r=>r.pick_result!=='Push');
  return {n_predictions:items.length,holdout_n:holdout.length,
    holdout_start:holdout[0]?.event_time||null,
    holdout_mae:mean(holdout.map(r=>r.absolute_error)),
    qualifying_historical_quotes:graded.length,
    wins:settled.filter(r=>r.pick_result==='Win').length,
    losses:settled.filter(r=>r.pick_result==='Loss').length,
    pushes:graded.filter(r=>r.pick_result==='Push').length,
    realized_roi_per_unit:graded.length ? mean(graded.map(r=>r.profit_per_unit)) : null,
    probability_calibration:null,
    warning:'Descriptive walk-forward baseline, evaluated on final 30% of time-ordered forecast rows. No calibrated win probabilities. No proof of future profit.'};
 };
 return {generated_at:new Date().toISOString(),rows_imported:records.length,
  settled_valid_rows:clean.length,walkforward_predictions:scored.length,
  overall:summarize(scored),
  by_market:Object.fromEntries([...byKey].map(([k,v])=>[k,summarize(v)])),
  issues:issues.slice(0,100),rows:scored};
}
async function main(){
 const input=process.argv[2];
 if(!input)throw Error('Usage: node scripts/backtest-props.mjs /path/to/authorized-pregame-history.csv');
 const text=await readFile(input,'utf8');
 const result=backtestRecords(parseCSV(text));
 // Safe stdout: no sportsbook keys or environment variables included.
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main().catch(err=>{process.stderr.write('Backtest failed: '+err.message+'\n');process.exitCode=1;});
