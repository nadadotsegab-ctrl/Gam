import test from 'node:test';
import assert from 'node:assert/strict';
import {projectValues,projectMarket,directionAgreement} from '../src/lib/forecast.js';
import {parseCSV,backtestRecords} from '../scripts/backtest-props.mjs';

const TS=Date.parse('2026-10-22T00:00:00Z');
const days=(n)=>new Date(TS-n*86400000).toISOString();
const records=(n,fn=i=>20+i/3)=>Array.from({length:n},(_,i)=>({
 id:'g'+i,date:days(n-i),values:{points:fn(i),minutes:35+i/10}
}));
test('roll feature projection uses dated history only and provides no invented probability',()=>{
 const data=records(30),out=projectValues(data,['points'],{line:23.5,cutoff:TS});
 assert.equal(out.ready,true);
 assert.equal(out.sampleGames,30);
 assert.equal(out.modelProbability,null);
 assert.ok(out.observed.avg5>out.observed.avg20);
 assert.equal(out.walkForward.testGames,20);
 assert.ok(Number.isFinite(out.walkForward.mae));
 assert.equal(out.walkForward.sportsbookRoi,null);
});
test('single future score does not leak into forecast',()=>{
 const data=records(22);
 const before=projectValues(data,['points'],{line:24.5,cutoff:TS});
 const after=projectValues([...data,{id:'future',date:new Date(TS+3600000).toISOString(),values:{points:2000}}],['points'],{line:24.5,cutoff:TS});
 assert.equal(after.projection,before.projection);
 assert.equal(after.walkForward.mae,before.walkForward.mae);
});
test('missing dated games or small samples produce no forecast',()=>{
 const x=projectValues([{id:'a',date:days(1),values:{points:10}}],['points'],{line:10.5,cutoff:TS});
 assert.equal(x.ready,false);
 assert.equal(x.projection,null);
 assert.equal(x.modelProbability,null);
});
test('trend and market agreement is independent of quoted price',()=>{
 const f=projectValues(records(30,()=>30),['points'],{line:24.5,cutoff:TS});
 assert.equal(f.lean,'OVER_LEAN');
 assert.equal(directionAgreement({side:'Over'},f),'AGREES');
 assert.equal(directionAgreement({side:'Under'},f),'DISAGREES');
 assert.equal(directionAgreement({side:'Over'},null),'NOT_AVAILABLE');
});
test('CSV parser supports quoted commas',()=>{
 const csv='event_time,sport,player,market,actual,line,offered_side,american_odds,quoted_at,source_url\n'+
   '2026-10-01T18:00:00Z,NBA,"Player, Example",points,27,24.5,Over,-110,2026-10-01T17:00:00Z,https://example.com\n';
 const row=parseCSV(csv)[0];
 assert.equal(row.player,'Player, Example');
});
test('walk forward backtester only uses earlier results and excludes invalid quotes',()=>{
 const rows=Array.from({length:38},(_,i)=>({
  event_time:new Date(Date.parse('2026-01-01T20:00:00Z')+i*86400000).toISOString(),
  quoted_at:new Date(Date.parse('2026-01-01T18:00:00Z')+i*86400000).toISOString(),
  sport:'NBA',player:'Example Player',market:'points',actual:String(i<19?20:30),
  line:'24.5',offered_side:'Over',american_odds:'-110',source_url:'https://example.test/quotes',
 }));
 const result=backtestRecords(rows);
 assert.equal(result.walkforward_predictions,28);
 assert.ok(Number.isFinite(result.overall.holdout_mae));
 assert.equal(result.overall.probability_calibration,null);
 const invalid=backtestRecords(rows.map((r,i)=>i===37?{...r,quoted_at:new Date(Date.parse(r.event_time)+1000).toISOString()}:r));
 assert.ok(invalid.issues.some(s=>s.includes('not verified')));
 assert.ok(invalid.overall.qualifying_historical_quotes<result.overall.qualifying_historical_quotes);
});
test('unquoted outcomes cannot be mistaken for observed ROI',()=>{
 const rows=Array.from({length:22},(_,i)=>({
  event_time:new Date(Date.parse('2026-01-01T20:00:00Z')+i*86400000).toISOString(),
  quoted_at:'',sport:'NBA',player:'A',market:'points',actual:'20',line:'24.5',
  offered_side:'Over',american_odds:'-110',source_url:'https://example.test/a',
 }));
 const r=backtestRecords(rows);
 assert.equal(r.overall.qualifying_historical_quotes,0);
 assert.equal(r.overall.realized_roi_per_unit,null);
});
