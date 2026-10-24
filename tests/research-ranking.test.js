import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateResearchEvidence,sortByEvidence} from '../src/lib/research-ranking.js';
import {normalizeGameLog} from '../server/research-feed.js';

const NOW=Date.parse('2026-10-23T18:00:00Z');
const pick={
 id:'demo-1', sport:'NBA',player:'Example Player',event:'Detroit Pistons vs. Miami Heat',
 marketKey:'player_points',line:24.5,side:'Over',odds:110,fairProbability:.5,referenceCount:3,
 startsAt:'2026-10-23T23:00:00Z',priceUpdatedAt:'2026-10-23T17:58:00Z',
};
const report={
 player:{id:'123',name:'Example Player',team:'Detroit Pistons'},
 nextGame:{opponent:'Miami Heat',startsAt:'2026-10-23T23:00:00Z'},
 season:2027,injuries:[],teammateInjuries:[],fetchedAt:'2026-10-23T17:57:00Z',
 games:[26,27,25,22,28,24,29,30,23,21].map((points,i)=>({
  id:String(i),date:new Date(NOW-(i+2)*86400000).toISOString(),values:{points},
 })),
 sources:{gamelog:'https://example.test/gamelog',injuries:'https://example.test/injuries'}
};
test('research checks cover lineup, historical form, schedule and known evidence gaps',()=>{
 const result=evaluateResearchEvidence(pick,report,NOW);
 assert.equal(result.status,'RESEARCH INCOMPLETE');
 assert.equal(result.modelProbability,null);
 assert.equal(result.recommendation,null);
 assert.equal(result.historical.last10.over,6);
 assert.equal(result.checks.find(x=>x.id==='roster').status,'verified');
 assert.equal(result.checks.find(x=>x.id==='schedule').status,'verified');
 assert.equal(result.checks.find(x=>x.id==='defense').status,'missing');
 assert.equal(result.checks.find(x=>x.id==='minutes').status,'missing');
 assert.ok(result.warnings.some(w=>w.includes('calibrated')));
});
test('rejects a mismatched player team even when sportsbook price appears attractive',()=>{
 const result=evaluateResearchEvidence(pick,{...report,player:{...report.player,team:'Utah Jazz'}},NOW);
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.checks.find(x=>x.id==='roster').status,'blocked');
 assert.equal(result.sortTier,0);
});
test('a listed questionable player must wait and cannot have claimed model probability',()=>{
 const result=evaluateResearchEvidence(pick,{...report,injuries:[{status:'Questionable'}]},NOW);
 assert.equal(result.status,'WAIT FOR STATUS');
 assert.equal(result.injuryFlag,'Questionable');
 assert.equal(result.modelProbability,null);
});
test('no history is never converted into a probability or a recommendation',()=>{
 const result=evaluateResearchEvidence(pick,{...report,games:[]},NOW);
 assert.equal(result.status,'INSUFFICIENT DATA');
 assert.equal(result.historical,null);
 assert.equal(result.modelProbability,null);
});
test('research sort prioritizes evidence over higher market EV',()=>{
 const well={...pick,ev:.5,research:{sortTier:2,verifiedChecks:5}};
 const unverified={...pick,id:'2',ev:25,research:{sortTier:0,verifiedChecks:0}};
 assert.equal(sortByEvidence([unverified,well])[0],well);
});
test('ESPN gamelog extracts metadata from event map and aligns nine stats with header names',()=>{
 const data={
  labels:['MIN','FG','3PT','FT','REB','AST','STL','BLK','PTS'],
  names:['minutes','fieldGoals','threePointsMade','freeThrowsMade','rebounds','assists','steals','blocks','points'],
  events:{'123':{id:'123',gameDate:'2026-10-21T00:00:00Z',opponent:{abbreviation:'BOS'}}},
  seasonTypes:[{categories:[{events:[{eventId:'123',stats:['36','12-24','4-10','4-4','11','8','1','0','32']}]}]}],
 };
 const rows=normalizeGameLog(data,'NBA');
 assert.equal(rows.length,1);
 assert.equal(rows[0].date,'2026-10-21T00:00:00Z');
 assert.equal(rows[0].opponent,'BOS');
 assert.equal(rows[0].values.points,32);
 assert.equal(rows[0].values.rebounds,11);
 assert.equal(rows[0].values.threepointsmade,4);
});
test('ESPN gamelog aligns historical names when metadata adds three nonstat fields',()=>{
 const data={
  names:['date','opponent','gameResult','minutes','fieldGoals','threePointsMade','freeThrowsMade','rebounds','assists','steals','blocks','points'],
  events:[{id:'234',date:'2026-10-22T00:00:00Z',stats:['36','12-24','4-10','4-4','11','8','1','0','32']}],
 };
 const rows=normalizeGameLog(data,'NBA');
 assert.equal(rows.length,1);
 assert.equal(rows[0].values.points,32);
 assert.equal(rows[0].values.rebounds,11);
});
