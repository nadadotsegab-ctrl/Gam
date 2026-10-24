import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createResearchHandler} from '../server/research-feed.js';

test('early-season research identifies and labels prior-season baseline instead of claiming current form',async()=>{
 const YEAR=2026,now=Date.parse('2026-10-23T21:00:00Z');
 const logs=(n,prefix,start)=>{
  const events=Array.from({length:n},(_,i)=>({id:prefix+i,date:new Date(start-i*86400000).toISOString(),stats:[String(20+i%6)]}));
  return {names:['points'],events};
 };
 const mock=async url=>{
   const u=new URL(url);
   if(u.pathname.endsWith('/teams'))return Response.json({sports:[{leagues:[{teams:[{team:{id:'1',displayName:'Denver Nuggets'}}]}]}]});
   if(u.pathname.endsWith('/teams/1/roster'))return Response.json({athletes:[{id:'999011',displayName:'Example Player'}]});
   if(u.pathname.endsWith('/gamelog')){
     const season=u.searchParams.get('season');
     if(season==='2027')return Response.json(logs(5,'current',Date.parse('2026-10-22T20:00:00Z')));
     if(season==='2026')return Response.json(logs(24,'previous',Date.parse('2026-04-10T20:00:00Z')));
     throw Error('unsupported season');
   }
   if(u.pathname.endsWith('/injuries'))return Response.json({injuries:[]});
   if(u.pathname.endsWith('/scoreboard'))return Response.json({events:[]});
   return Response.json({}, {status:404});
 };
 const handler=createResearchHandler({now:()=>now,fetchImpl:mock});
 const server=http.createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(e=>{res.statusCode=500;res.end(e.message)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/research/player?sport=NBA&id=999011&name=Example%20Player';
  const response=await fetch(url);
  assert.equal(response.status,200);
  const report=await response.json();
  assert.deepEqual(report.seasonsUsed,[2027,2026]);
  assert.equal(report.historyCrossesSeasons,true);
  assert.equal(report.currentSeasonGames,5);
  assert.equal(report.games.length,29);
  assert.ok(report.games[0].date.startsWith('2026-10'));
  assert.ok(report.games.at(-1).date.startsWith('2026-03'));
  assert.equal(report.season,2027);
  assert.match(report.sources.previousGamelog,/season=2026/);
  assert.ok(report.warnings.some(s=>s.includes('earlier-season')));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
