import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { normalizeGameLog, createResearchHandler, findUpcomingMatch } from '../server/research-feed.js';

test('ESPN gamelog extracts stats using response schema and sorts by date',()=>{
 const data={names:['minutes','rebounds','assists','points'],events:[
  {id:'a',date:'2026-10-20T00:00:00Z',opponent:{displayName:'Boston Celtics'},stats:['34','12','8','27']},
  {id:'b',date:'2026-10-22T00:00:00Z',opponent:{displayName:'Utah Jazz'},stats:['35','11','9','31']}
 ]};
 const rows=normalizeGameLog(data,'NBA');
 assert.equal(rows.length,2);
 assert.equal(rows[0].id,'b');
 assert.equal(rows[0].values.points,31);
 assert.equal(rows[1].values.assists,8);
});
test('ESPN gamelog refuses invented stats on missing columns',()=>{
 const rows=normalizeGameLog({events:[{id:'a',stats:['bad','-']}]},'NBA');
 assert.equal(rows.length,0);
});
test('automated player lookup and injury report retain provenance',async()=>{
 const calls=[];
 const mockFetch=async input=>{
  const url=String(input);calls.push(url);
  let data;
  if(url.includes('/teams?'))data={sports:[{leagues:[{teams:[{team:{id:'7',displayName:'Denver Nuggets'}}]}]}]};
  else if(url.includes('/teams/7/roster'))data={athletes:[{id:'111',displayName:'Nikola Jokic',position:{abbreviation:'C'}}]};
  else if(url.includes('/gamelog'))data={names:['minutes','rebounds','assists','points'],events:[{id:'a',date:'2026-10-20T00:00Z',stats:['35','9','8','28']}]};
  else if(url.includes('/injuries'))data={injuries:[{athlete:{id:'111',displayName:'Nikola Jokic'},status:'Questionable',details:{detail:'Reported issue'}}]};
  else return {ok:false,status:404};
  return {ok:true,json:async()=>data};
 };
 const handler=createResearchHandler({fetchImpl:mockFetch,now:()=>Date.parse('2026-10-23T12:00:00Z')});
 const server=http.createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(e=>{res.statusCode=500;res.end(e.message)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
   const origin='http://127.0.0.1:'+server.address().port;
   const search=await(await fetch(origin+'/api/research/search?sport=NBA&q=jokic')).json();
   assert.equal(search.players[0].name,'Nikola Jokic');
   const response=await fetch(origin+'/api/research/player?sport=NBA&id=111&name=Nikola%20Jokic');
   assert.equal(response.status,200);
   const report=await response.json();
   assert.equal(report.games[0].values.points,28);
   assert.equal(report.injuries[0].status,'Questionable');
   assert.equal(report.injuriesVerified,false);
   assert.ok(report.sources.gamelog.startsWith('https://'));
   assert.ok(calls.length>=4);
   const denied=await fetch(origin+'/api/research/player?sport=NBA&id=not-an-id&name=test');
   assert.equal(denied.status,400);
 } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('upcoming fixture identifies opponent using team identity and ignores past games',()=>{
 const next=findUpcomingMatch({events:[
  {id:'past',date:'2026-10-20T12:00Z',competitions:[{competitors:[{team:{id:'7',displayName:'Denver Nuggets'},homeAway:'home'},{team:{id:'2',displayName:'Boston Celtics'},homeAway:'away'}]}]},
  {id:'future',date:'2026-10-24T12:00Z',competitions:[{competitors:[{team:{id:'7',displayName:'Denver Nuggets'},homeAway:'away'},{team:{id:'3',displayName:'Utah Jazz'},homeAway:'home'}]}]}
 ]},{teamId:'7',team:'Denver Nuggets'},Date.parse('2026-10-23T12:00Z'));
 assert.equal(next.opponent,'Utah Jazz');
 assert.equal(next.homeAway,'away');
});
