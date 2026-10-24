import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server/server.mjs';

const NOW=Date.parse('2026-10-24T16:00:00Z');
const EVENT={id:'pistons-heat',sport_key:'basketball_nba',away_team:'Detroit Pistons',
 home_team:'Miami Heat',commence_time:'2026-10-24T20:00:00Z'};
const books=(player)=>['draftkings','fanduel','betmgm'].map((name,i)=>({
 key:name,last_update:'2026-10-24T15:59:00Z',
 markets:[{key:'player_points',last_update:'2026-10-24T15:59:00Z',
 outcomes:[{name:'Over',description:player,point:24.5,price:i===0?140:-110},
           {name:'Under',description:player,point:24.5,price:i===0?-160:-110}]}]
}));
test('live prop scanner attaches game logs and roster evidence, while not inventing a win prediction',async()=>{
 let callCount=0;
 const source=async url=>{
  callCount++;
  const u=new URL(String(url));
  if(u.host==='api.the-odds-api.com'){
   if(u.pathname.endsWith('/events/'))return Response.json([EVENT]);
   if(u.pathname.includes('/odds/'))return Response.json({...EVENT,bookmakers:books('Example Player')});
  }
  if(u.pathname.endsWith('/teams'))return Response.json({sports:[{leagues:[{teams:[
   {team:{id:'1',displayName:'Detroit Pistons'}},
   {team:{id:'2',displayName:'Miami Heat'}}
  ]}]}]});
  if(u.pathname.endsWith('/teams/1/roster'))return Response.json({athletes:[{id:'123',displayName:'Example Player'}]});
  if(u.pathname.endsWith('/teams/2/roster'))return Response.json({athletes:[{id:'456',displayName:'Other Player'}]});
  if(u.pathname.endsWith('/gamelog'))return Response.json({
   names:['minutes','fieldGoals','threePointsMade','freeThrowsMade','rebounds','assists','steals','blocks','points'],
   events:Object.fromEntries(Array.from({length:6},(_,i)=>['g'+i,{
    id:'g'+i,gameDate:new Date(NOW-(i+2)*86400000).toISOString(),opponent:{abbreviation:'BOS'}
   }])),
   seasonTypes:[{categories:[{events:Array.from({length:6},(_,i)=>({
     eventId:'g'+i,stats:['36','12-24','4-10','4-4','11','8','1','0',String(22+i)]
   }))}]}],
  });
  if(u.pathname.endsWith('/injuries'))return Response.json({injuries:[]});
  if(u.pathname.endsWith('/scoreboard'))return Response.json({events:[{
    id:'schedule-1',date:'2026-10-24T20:00:00Z',
    competitions:[{competitors:[
      {team:{id:'1',displayName:'Detroit Pistons'},homeAway:'away'},
      {team:{id:'2',displayName:'Miami Heat'},homeAway:'home'}
    ]}]
  }]});
  return Response.json({error:'mock endpoint unavailable'}, {status:404});
 };
 const server=createAppServer({apiKey:'fake-test-key',fetchImpl:source,now:()=>NOW});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/props?sport=NBA&timeZone=America%2FDenver');
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.ok(payload.picks.length);
  assert.ok(payload.picks[0].research);
  assert.equal(payload.picks[0].research.status,'RESEARCH INCOMPLETE');
  assert.equal(payload.picks[0].research.checks.find(x=>x.id==='roster').status,'verified');
  assert.equal(payload.picks[0].research.checks.find(x=>x.id==='form').status,'verified');
  assert.equal(payload.picks[0].research.checks.find(x=>x.id==='schedule').status,'verified');
  assert.equal(payload.picks[0].research.historical.last5.games,5);
  assert.equal(payload.picks[0].research.modelProbability,null);
  assert.equal(payload.fullyValidatedRecommendations,0);
  assert.ok(callCount>=7);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
