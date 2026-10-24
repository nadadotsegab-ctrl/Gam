/**
 * UltraX independent rolling-forecast workbench.
 *
 * This is a descriptive baseline, NOT a trained model, calibrated probability
 * or money-making recommendation. Only game results *before* the event may be
 * used to build a projection; walk-forward grading never sees the target game.
 */
export const MIN_HISTORY = 10;
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const median = a => {const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const sampleStd = a => a.length < 2 ? 0 : Math.sqrt(a.reduce((s,v)=>s+(v-mean(a))**2,0)/(a.length-1));
const round = (x,places=2) => Number(x.toFixed(places));

function normalizeGames(games, keys, cutoff=Infinity) {
  if(!Array.isArray(games) || !Array.isArray(keys)) return [];
  const matches=[];
  const dates=new Set();
  for(const game of games) {
    if(!game || typeof game !== 'object')continue;
    const t=Date.parse(game.date);
    if(!Number.isFinite(t) || t>=cutoff)continue;
    const value=keys.map(k=>game?.values?.[k]).find(n=>Number.isFinite(n)&&n>=0);
    if(!Number.isFinite(value))continue;
    // one row per actual game; repeated ESPN dates can exist, so prefer ID.
    const id=game.id ? String(game.id) : game.date;
    if(dates.has(id))continue;
    dates.add(id);
    const minute=Number.isFinite(game.values?.minutes)?game.values.minutes:
                 Number.isFinite(game.values?.min)?game.values.min:null;
    matches.push({date:game.date,value,minutes:minute,id});
  }
  return matches.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}

function metrics(history) {
  if(history.length<MIN_HISTORY)return null;
  const recent=history.slice(-20),last10=recent.slice(-10),last5=recent.slice(-5);
  const weighted=recent.reduce((sum,item,i)=>sum+item.value*Math.exp((i-recent.length+1)/7),0)/
    recent.reduce((sum,item,i)=>sum+Math.exp((i-recent.length+1)/7),0);
  const values20=recent.map(x=>x.value),values10=last10.map(x=>x.value),values5=last5.map(x=>x.value);
  const season=mean(history.map(x=>x.value));
  const avg5=mean(values5),avg10=mean(values10),avg20=mean(values20);
  const median10=median(values10);
  // Robust blend of rolling evidence, intentionally simple and auditable.
  // Weights are heuristic and MUST be validated for each market.
  const projection=0.40*weighted + 0.30*avg20 + 0.20*median10 + 0.10*season;
  const minuteValues5=last5.map(x=>x.minutes).filter(Number.isFinite);
  const minuteValues20=recent.map(x=>x.minutes).filter(Number.isFinite);
  const minutes=minuteValues5.length>=4 && minuteValues20.length>=8 ? {
    last5:round(mean(minuteValues5)),last20:round(mean(minuteValues20)),
    delta:round(mean(minuteValues5)-mean(minuteValues20)),
  } : null;
  return {
    projected:round(Math.max(0,projection)),
    seasonMean:round(season),avg5:round(avg5),avg10:round(avg10),avg20:round(avg20),
    median10:round(median10),
    streak:round(avg5-avg20),
    volatility:round(sampleStd(values20)),
    consistency:round(median10/(season||1)),
    minutes,
  };
}

export function projectValues(games, statKeys, {line=null,cutoff=Infinity}={}) {
  const rows=normalizeGames(games,statKeys,cutoff),n=rows.length;
  if(n<MIN_HISTORY) return {
    ready:false,sampleGames:n,projection:null,observed:null,walkForward:null,
    lean:null,delta:null,modelProbability:null,reason:'Need at least 10 dated previous games in the matching statistic.',
  };
  const observed=metrics(rows);
  const walk=walkForwardHistory(rows);
  const numericLine=typeof line==='number'&&Number.isFinite(line)&&line>=0?line:null;
  const delta=numericLine!==null?round(observed.projected-numericLine):null;
  // A close projection is too ambiguous to call a trend lean. This is not a
  // mathematically learned threshold and cannot be treated as a win chance.
  const ambiguous=Math.max(0.5,observed.volatility*0.20);
  const lean=delta===null?'NO_LINE':Math.abs(delta)<ambiguous?'MIXED':delta>0?'OVER_LEAN':'UNDER_LEAN';
  const notes=[
    'Rolling L5/L10/L20 and median features include only games with dates before the analyzed event.',
    'Projection is a heuristic baseline, not XGBoost/LightGBM and not a validated win probability.',
  ];
  if(observed.streak>observed.volatility*.25)notes.push('Recent scoring/trend is above the 20-game baseline.');
  if(observed.streak< -observed.volatility*.25)notes.push('Recent form is below the 20-game baseline.');
  if(observed.minutes?.delta < -3) notes.push('Recorded minutes declined by more than three per game; do not assume normal minutes.');
  if(walk?.testGames<8) notes.push('Not enough independent walk-forward games to report meaningful baseline error.');
  return {ready:true,sampleGames:n,projection:observed.projected,observed,walkForward:walk,
    lean,delta,modelProbability:null,notes};
}

function walkForwardHistory(rows) {
  let errors=[],naiveErrors=[];
  for(let i=MIN_HISTORY;i<rows.length;i++){
    const past=rows.slice(0,i);
    const features=metrics(past);
    if(!features)continue;
    const actual=rows[i].value;
    errors.push(Math.abs(actual-features.projected));
    const naive=mean(past.slice(-10).map(x=>x.value));
    naiveErrors.push(Math.abs(actual-naive));
  }
  const n=errors.length;
  return {testGames:n,mae:n>=8?round(mean(errors)):null,
    naiveL10Mae:n>=8?round(mean(naiveErrors)):null,
    // No true win% without historical PRE-GAME sportsbook lines/odds.
    sportsbookRoi:null,accuracyAgainstHistoricalLines:null,
    description:'Expanding-window one-game-ahead grading with no current-game leakage; historical line performance not tested.'};
}

export function projectMarket(games, keys, line, startsAt=null) {
  const time=Date.parse(startsAt);
  return projectValues(games,keys,{line,cutoff:Number.isFinite(time)?time:Infinity});
}

export function directionAgreement(pick,forecast) {
  if(!forecast?.ready || !['Over','Under'].includes(pick?.side)) return 'NOT_AVAILABLE';
  if(!['OVER_LEAN','UNDER_LEAN'].includes(forecast.lean)) return 'MIXED_OR_UNCERTAIN';
  return (forecast.lean.startsWith(pick.side.toUpperCase()))?'AGREES':'DISAGREES';
}
