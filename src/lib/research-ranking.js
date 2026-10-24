/**
 * Evidence gate for sportsbook prop candidates. NO guessed win percentages:
 * odds consensus and historical frequency are never a model forecast.
 * All conclusions are transparent descriptions of observed data.
 */
import { summarizeGames } from './research.js';

export const PROP_STAT_FIELDS=Object.freeze({
  NBA:Object.freeze({
    player_points:['points','pts'],player_rebounds:['rebounds','reb'],player_assists:['assists','ast'],
    player_threes:['threepointsmade','threepointfieldgoalsmade','3pt','3pm'],
  }),
  NFL:Object.freeze({
    player_pass_yds:['passingyards','passyds'],player_rush_yds:['rushingyards','rushyds'],
    player_reception_yds:['receivingyards','recyds'],player_receptions:['receptions','rec'],
  }),
  SOCCER:Object.freeze({
    player_shots:['shots','totalshots'],player_shots_on_target:['shotsontarget'],
  }),
});
const text = x => typeof x==='string'?x.trim():'';
const slug=x=>text(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const readable=(n)=>Number.isFinite(n)?n.toFixed(1):'—';
const checked=(id,title,status,explanation)=>({id,title,status,explanation});
const fetchStat=(game,keys)=>{for(const k of keys||[])if(Number.isFinite(game?.values?.[k]))return game.values[k];return null;};
function matchTeamName(event,team) {
  const sides=text(event).split(/\s+vs\.?\s+/i);
  if(sides.length!==2 || !text(team))return null;
  return sides.some(s=>slug(s)===slug(team));
}
export function evaluateResearchEvidence(pick,report,now=Date.now()) {
  const checks=[];
  const warnings=[];
  const evidence=[];
  let blocked=false;
  const sport=pick?.sport;
  const keys=PROP_STAT_FIELDS[sport]?.[pick?.marketKey];
  const add=(id,title,status,explanation)=>checks.push(checked(id,title,status,explanation));
  if(!report || !report.player) {
    add('lookup','Verified player roster','missing','No verified player record was returned.');
    blocked=true;
  } else {
    const belongs=matchTeamName(pick.event,report.player.team);
    if(belongs===true) {
      add('roster','Player and game roster','verified',report.player.name+' is listed on '+report.player.team+'.');
      evidence.push(report.player.name+' is listed on '+report.player.team+'.');
    } else if(belongs===false) {
      add('roster','Player and game roster','blocked','Roster lists '+report.player.team+' but sportsbook event is '+pick.event+'.');
      blocked=true;
      warnings.push('PLAYER/EVENT MISMATCH: Do not treat this as a verified matchup.');
    } else {
      add('roster','Player and game roster','missing','Cannot verify this player against the event teams.');
      blocked=true;
    }
  }
  const priceTime=Date.parse(pick?.priceUpdatedAt);
  const oddsFresh=Number.isFinite(priceTime) && Math.abs(now-priceTime)<=15*60_000
    && Number.isFinite(pick?.odds) && Number.isFinite(pick?.fairProbability) && pick.referenceCount>=2;
  add('odds','Fresh cross-book price',oddsFresh?'verified':'missing',oddsFresh?
      'Recent quoted price and two or more independent reference books.':'Price/reference verification incomplete or older than 15 minutes.');
  const next=report?.nextGame;
  const eventTime=Date.parse(pick?.startsAt);
  const scheduled=Number.isFinite(eventTime)&&next&&Number.isFinite(Date.parse(next.startsAt))
    && Math.abs(eventTime-Date.parse(next.startsAt))<=18*60*60_000
    && text(next.opponent) && slug(pick.event).includes(slug(next.opponent));
  if(scheduled) {
    add('schedule','Opponent and schedule','verified','Next identified opponent is '+next.opponent+'.');
    evidence.push('Upcoming opponent: '+next.opponent+'.');
  } else {
    add('schedule','Opponent and schedule','missing','Could not independently match the scheduled fixture to this sportsbook event.');
  }
  const games=Array.isArray(report?.games)?report.games:[];
  const values=games.map(g=>fetchStat(g,keys)).filter(v=>v!==null);
  const seasonCurrent=Number.isInteger(report?.season) && report.season >= new Date(now).getUTCFullYear()-1;
  const sample=values.length;
  const summary=values.length && Number.isFinite(pick?.line) ? summarizeGames(values,pick.line) : null;
  const validHistory=Boolean(keys&&summary&&sample>=5&&seasonCurrent);
  add('form','Recent player performance',validHistory?'verified':'missing',
    validHistory?'Last '+Math.min(10,sample)+' recorded results averaged '+readable(summary.last10.average)+
      ' with '+(pick.side==='Over'?summary.last10.over:summary.last10.under)+' / '+summary.last10.games+
      ' historically '+pick.side.toLowerCase()+' '+pick.line+'.':
      'At least five parseable recent game logs in the appropriate market are required.');
  if(validHistory) {
    const n=summary.last10.games,hit=pick.side==='Over'?summary.last10.over:summary.last10.under;
    evidence.push('Last '+n+' recorded games: '+hit+' finished '+pick.side.toLowerCase()+' '+pick.line+
      '; average '+readable(summary.last10.average)+'. This is historical frequency, NOT a win probability.');
    const sideRate=hit/n;
    if(sideRate < .5) warnings.push('Recent results lean against the quoted selection ('+hit+'/'+n+').');
    if(sideRate >= .7) evidence.push('Recent results lean toward the selected side, but sample sizes are small.');
  }
  const injured=Array.isArray(report?.injuries)?report.injuries:[];
  const risk=injured.find(i=>/\b(out|doubtful|questionable|injured|day.to.day|inactive|suspended)\b/i.test(i.status||''));
  if(risk) {
    add('health','Current player availability','warning','Third-party report lists '+risk.status+'. Confirm official status.');
    warnings.push('PLAYER INJURY FLAG: '+risk.status+' (third-party listing; official confirmation needed).');
  } else add('health','Current player availability','missing','No authoritative game-day injury or active/inactive confirmation.');
  const mates=Array.isArray(report?.teammateInjuries)?report.teammateInjuries:[];
  if(mates.length) {
    add('teammates','Teammate availability','warning',mates.length+' teammate injury listing(s); role impact unknown.');
    warnings.push('Reported teammate changes: '+mates.slice(0,3).map(v=>v.name+' ('+v.status+')').join(', ')+'. Minutes/usage impact is NOT verified.');
  } else add('teammates','Teammate availability','missing','No complete and verified teammate injury/rotation report.');
  const lastDate=games.find(g=>Number.isFinite(Date.parse(g.date)))?.date;
  const restDays=Number.isFinite(Date.parse(lastDate))&&Number.isFinite(eventTime)?Math.floor((eventTime-Date.parse(lastDate))/86_400_000):null;
  if(restDays!==null&&restDays>=0&&restDays<=30) {
    add('rest','Rest and game spacing','verified',restDays+' calendar day(s) since last recorded game (approximate).');
    evidence.push('Approximate rest interval: '+restDays+' day(s).');
    if(restDays<=1) warnings.push('Short rest interval; effect on performance has not been quantified.');
  } else add('rest','Rest and game spacing','missing','Rest could not be verified from dated game logs.');
  add('defense','Opponent defensive matchup','missing','Opponent defensive efficiency/position matchups are not connected yet.');
  const playedMinutes=games.map(g=>Number.isFinite(g?.values?.minutes)?g.values.minutes:
    Number.isFinite(g?.values?.min)?g.values.min:null).filter(n=>n!==null&&n>=0&&n<=65);
  if(playedMinutes.length>=5){
    const mean=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
    const last5=mean(playedMinutes.slice(0,5));
    const ten=mean(playedMinutes.slice(0,Math.min(10,playedMinutes.length)));
    add('minutes','Observed playing-time trend','verified',
      'Last 5 observed minutes: '+readable(last5)+' per game; recent baseline: '+readable(ten)+'. Future minutes NOT verified.');
    evidence.push('Recent playing time: '+readable(last5)+' minutes per game (observed, not projected).');
    if(playedMinutes.length>=10 && last5<ten-3)
      warnings.push('Observed minutes have fallen relative to the 10-game baseline. Check rotations and restrictions.');
  } else add('minutes','Expected playing time and role','missing','Playing-time logs, projected minutes and rotations not available.');
  add('defensiveContext','Opponent defensive tendencies','missing','Opponent points allowed by position and defensive efficiency are not connected.');
  add('gameEnvironment','Game spread and pace','missing','Total, spread, pace, and blowout risk are not connected to this prop.');

  const verified=checks.filter(c=>c.status==='verified').length;
  const missing=checks.filter(c=>c.status==='missing').length;
  const blockers=checks.filter(c=>['blocked','warning'].includes(c.status)).length;
  const status=blocked?'BLOCKED':risk?'WAIT FOR STATUS':!validHistory?'INSUFFICIENT DATA':'RESEARCH INCOMPLETE';
  if(!blocked) warnings.push('No trained/calibrated model probability. Do not interpret odds consensus or game-log hit rate as a predicted win chance.');
  return {
    status,verifiedChecks:verified,totalChecks:checks.length,researchCoverage:Math.round(100*verified/checks.length),
    checks, evidence, warnings, missingChecks:missing, riskChecks:blockers,
    historical:summary, sampleCount:sample, nextOpponent:next?.opponent||null, injuryFlag:risk?.status||null,
    sources:report?.sources||{},lastChecked:report?.fetchedAt||null,
    modelProbability:null, predictedValue:null, recommendation:null,
    // For UI ordering only: number of research checks completed, not confidence.
    sortTier:blocked?0:validHistory?2:1,
  };
}
export function sortByEvidence(picks) {
 return [...picks].sort((a,b)=>
   (b.research?.sortTier??0)-(a.research?.sortTier??0)||
   (b.research?.verifiedChecks??0)-(a.research?.verifiedChecks??0)||
   Date.parse(a.startsAt)-Date.parse(b.startsAt));
}
