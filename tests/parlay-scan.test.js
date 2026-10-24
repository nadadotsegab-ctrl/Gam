import test from 'node:test';
import assert from 'node:assert/strict';
import {createPropsApiHandler} from '../server/props-feed.js';
import {sameProp,conflictsWithSlip,summarizeEligibility} from '../src/lib/parlay-candidates.js';
const NOW=Date.parse('2026-10-24T16:00:00Z');
const KEY='not-a-real-key';
const makeEvent=(n)=>({
 id:'game-'+n,sport_key:'basketball_nba',
 home_team:'Home '+n,away_team:'Away '+n,
 commence_time:new Date(NOW+(n+4)*3600_000).toISOString(),
 bookmakers:['draftkings','fanduel','betmgm'].map((book,i)=>({
  key:book,last_update:new Date(NOW-60_000).toISOString(),
  markets:[{key:'player_points',last_update:new Date(NOW-60_000).toISOString(),
   outcomes:[
    {name:'Over',description:'Player '+n,point:24.5,price:i===0?140:-110},
    {name:'Under',description:'Player '+n,point:24.5,price:i===0?-160:-110}
   ]}]
 }))
});
async function call(handler,url){
 let result,status=200;
 const res={setHeader(){},end(body){result=JSON.parse(body)},set statusCode(value){status=value},get statusCode(){return status}};
 await handler({method:'GET',url},res);
 return {status,result};
}
test('free-budget scans 1 different game per explicit offset and caches repeated requests',async()=>{
 const events=[makeEvent(0),makeEvent(1),makeEvent(2)];
 const checked=[];
 const handler=createPropsApiHandler({apiKey:KEY,now:()=>NOW,freeBudget:true,fetchImpl:async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/events/'))return Response.json(events);
  const id=decodeURIComponent(u.pathname.match(/\/events\/([^/]+)\/odds\/$/)?.[1]||'');
  checked.push({id,market:u.searchParams.get('markets'),region:u.searchParams.get('regions')});
  return Response.json(events.find(e=>e.id===id));
 }});
 const first=await call(handler,'/api/props?sport=NBA&eventOffset=0');
 const second=await call(handler,'/api/props?sport=NBA&eventOffset=1');
 const third=await call(handler,'/api/props?sport=NBA&eventOffset=2');
 assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(third.status,200);
 assert.deepEqual(checked.map(x=>x.id),['game-0','game-1','game-2']);
 assert.ok(checked.every(x=>x.region==='us'&&x.market==='player_points'));
 assert.deepEqual([first.result.eventOffset,second.result.eventOffset,third.result.eventOffset],[0,1,2]);
 assert.deepEqual([first.result.eventsAvailable,second.result.eventsAvailable],[3,3]);
 assert.deepEqual([first.result.eventsRequested,second.result.eventsRequested],[1,1]);
 assert.ok(first.result.picks.some(p=>p.player==='Player 0'));
 assert.ok(second.result.picks.some(p=>p.player==='Player 1'));
 assert.ok(third.result.picks.some(p=>p.player==='Player 2'));
 await call(handler,'/api/props?sport=NBA&eventOffset=1');
 assert.equal(checked.length,3,'repeat request must be served from cache');
});
test('invalid offsets are rejected without consuming provider calls',async()=>{
 let count=0;
 const free=createPropsApiHandler({apiKey:KEY,now:()=>NOW,freeBudget:true,fetchImpl:async()=>{count++;return Response.json([]);}});
 for(const offset of ['-1','foo','1.5','25','999','1%26sport%3DNFL']){
  const x=await call(free,'/api/props?sport=NBA&eventOffset='+offset);
  assert.equal(x.status,400,offset);
 }
 const full=createPropsApiHandler({apiKey:KEY,now:()=>NOW,freeBudget:false,fetchImpl:async()=>{count++;return Response.json([]);}});
 assert.equal((await call(full,'/api/props?sport=NBA&eventOffset=1')).status,400);
 assert.equal(count,0);
});
test('cannot select contradictory sides of one prop while allowing distinct markets',()=>{
 const over={eventId:'one',player:'Stephon Castle',marketKey:'player_points',line:16.5,side:'Over'};
 const under={...over,side:'Under'};
 const rebounds={...over,marketKey:'player_rebounds',line:5.5};
 assert.equal(sameProp(over,under),true);
 assert.equal(conflictsWithSlip(under,[over]),true);
 assert.equal(conflictsWithSlip(rebounds,[over]),false);
});
test('research shortlist counts only distinct verified events, not opposite outcomes',()=>{
 const fake={eventId:'one',research:{
  status:'RESEARCH INCOMPLETE',agreement:'AGREES',forecast:{walkForward:{testGames:8}},
  checks:['roster','odds','form','schedule'].map(id=>({id,status:'verified'}))
 }};
 const over={...fake,id:'over',side:'Over'},under={...fake,id:'under',side:'Under'};
 const summary=summarizeEligibility([over,under],2);
 assert.equal(summary.distinctEvents,1);
 assert.equal(summary.canSuggest,false);
 assert.equal(summarizeEligibility([over,{...fake,eventId:'two'}],2).canSuggest,true);
});
