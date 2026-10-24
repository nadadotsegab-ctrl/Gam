import test from 'node:test';
import assert from 'node:assert/strict';
import {createPropsApiHandler} from '../server/props-feed.js';
import {rankPlayerProps} from '../src/lib/props.js';
const NOW=Date.parse('2026-10-24T16:00:00Z');
const event=(i,market='player_points')=>({
 id:'slate'+i,sport_key:'basketball_nba',
 home_team:'Home '+i,away_team:'Away '+i,
 commence_time:new Date(NOW+(i+1)*3600_000).toISOString(),
 bookmakers:['draftkings','fanduel','betmgm'].map(book=>({
  key:book,last_update:'2026-10-24T15:59:00Z',
  markets:[{key:market,last_update:'2026-10-24T15:59:00Z',
   outcomes:[{name:'Over',description:'Player '+i,point:24.5,price:-110},
             {name:'Under',description:'Player '+i,point:24.5,price:-110}]}]
 }))
});
async function request(handler,uri){
 let status=200,body;
 await handler({url:uri,method:'GET'},{
  setHeader(){},
  get statusCode(){return status},
  set statusCode(v){status=v},
  end(x){body=JSON.parse(x)}
 });
 return {status,body};
}
test('research slate returns research-only no-edge lines while value-only remains empty', async()=>{
 const fixtures=Array.from({length:6},(_,i)=>event(i));
 let count=0;
 const fetchImpl=async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/events/'))return Response.json(fixtures);
  count++;
  return Response.json(fixtures.find(f=>u.pathname.includes('/'+f.id+'/')));
 };
 const assessment=async picks=>picks.map(p=>({status:'RESEARCH INCOMPLETE',verifiedChecks:6,totalChecks:13,modelProbability:null}));
 const handler=createPropsApiHandler({apiKey:'fake-nonsecret',freeBudget:true,now:()=>NOW,fetchImpl,researchAssess:assessment});
 const base='/api/props?sport=NBA&timeZone=America%2FDenver&eventCount=5&market=player_points';
 const research=await request(handler,base+'&mode=research');
 assert.equal(research.status,200);
 assert.equal(research.body.eventsScanned,5);
 assert.equal(research.body.eventsRequested,5);
 assert.equal(research.body.eventsAvailable,6);
 assert.equal(research.body.mode,'research');
 assert.equal(research.body.marketScanned,'player_points');
 assert.equal(count,5);
 assert.equal(research.body.picks.length,10);
 assert.ok(research.body.picks.every(p=>p.ev<0));
 assert.ok(research.body.picks.every(p=>p.research?.modelProbability===null));
 assert.ok(research.body.picks.some(p=>p.side==='Over')&&research.body.picks.some(p=>p.side==='Under'));
 const value=await request(handler,base+'&mode=value');
 assert.equal(value.status,200);
 assert.deepEqual(value.body.picks,[]);
 assert.equal(count,5,'same odds snapshots reused without additional charge');
});
test('selected one market per free scan and no more than 5 games per explicit request',async()=>{
 const fixtures=Array.from({length:6},(_,i)=>event(i,'player_assists'));
 const seen=[];
 const fetchImpl=async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/events/'))return Response.json(fixtures);
  seen.push(u.searchParams.get('markets'));
  return Response.json(fixtures.find(f=>u.pathname.includes('/'+f.id+'/')));
 };
 const handler=createPropsApiHandler({apiKey:'fake',freeBudget:true,now:()=>NOW,fetchImpl});
 let response=await request(handler,'/api/props?sport=NBA&eventCount=5&eventOffset=1&market=player_assists&mode=research');
 assert.equal(response.status,200);
 assert.equal(response.body.eventsScanned,5);
 assert.equal(response.body.eventOffset,1);
 assert.deepEqual(seen,['player_assists','player_assists','player_assists','player_assists','player_assists']);
 assert.equal((await request(handler,'/api/props?sport=NBA&eventCount=6')).status,400);
 assert.equal((await request(handler,'/api/props?sport=NBA&market=arbitrary')).status,400);
 assert.equal((await request(handler,'/api/props?sport=NBA&mode=fiction')).status,400);
});
test('default value-only filtering and caller API remains backward compatible',()=>{
 const e=event(1);
 const options={sport:'NBA',timeZone:'America/Denver',now:NOW};
 assert.deepEqual(rankPlayerProps([e],options),[]);
 const raw=rankPlayerProps([e],{...options,includeNonPositive:true});
 assert.equal(raw.length,2);
 assert.equal(raw[0].ev<0,true);
});
