import { americanToDecimal, impliedProbability } from './odds.js';

export function summarizeGames(values, line) {
  if (!Array.isArray(values) || !values.length || !Number.isFinite(line)) return null;
  const numbers = values.map(Number);
  if (numbers.some(v => !Number.isFinite(v) || v < 0)) return null;
  const recent = n => {
    const sample = numbers.slice(0, n);
    return { games: sample.length, average: sample.reduce((a,b)=>a+b,0)/sample.length, over: sample.filter(v=>v>line).length, under: sample.filter(v=>v<line).length, pushes: sample.filter(v=>v===line).length };
  };
  return { last5:recent(5), last10:recent(10), last20:recent(20), total:numbers.length };
}

// Historical hit rates deliberately NEVER become model-predicted probabilities.
// Only externally validated and calibrated models may supply a model probability.
export function evaluateProp({ values, line, odds, modelProbability, calibrated = false, injuriesVerified = false, oddsVerified = false }) {
  const history = summarizeGames(values,line);
  const breakEven = Number.isFinite(odds) && Math.abs(odds)>=100 ? impliedProbability(odds) : null;
  const probability = calibrated && Number.isFinite(modelProbability) && modelProbability>0 && modelProbability<1 ? modelProbability : null;
  const expectedValue = probability!==null && breakEven!==null ? (probability*americanToDecimal(odds)-1)*100 : null;
  const ready = probability!==null && injuriesVerified && oddsVerified && breakEven!==null;
  return { history, breakEven, modelProbability:probability, expectedValue, verdict: !ready ? 'INSUFFICIENT DATA' : expectedValue > 2 ? 'POSITIVE ESTIMATED VALUE' : 'NO BET', warnings:[
    ...(!history ? ['Game logs are missing or invalid.'] : []),
    ...(probability===null ? ['No validated, calibrated prediction probability is available. Historical hit rates are not forecasts.'] : []),
    ...(!injuriesVerified ? ['Current injuries and lineup impact have not been independently verified.'] : []),
    ...(!oddsVerified ? ['The offered odds have not been verified as current.'] : [])
  ] };
}

export function evaluateParlay(legs) {
  if (!Array.isArray(legs) || legs.length<2 || legs.length>8) throw new Error('Select 2 to 8 legs.');
  if (legs.some(l=>!Number.isFinite(l.odds) || Math.abs(l.odds)<100 || !Number.isFinite(l.probability) || l.probability<=0 || l.probability>=1 || l.calibrated!==true)) throw new Error('Every leg requires valid odds and a calibrated probability.');
  const decimalOdds = legs.reduce((acc,l)=>acc*americanToDecimal(l.odds),1);
  const independenceProbability = legs.reduce((acc,l)=>acc*l.probability,1);
  const sharedEvents = new Set();
  let correlationWarning = false;
  for (const l of legs) { if (!l.eventId) correlationWarning=true; else if(sharedEvents.has(l.eventId)) correlationWarning=true; sharedEvents.add(l.eventId); }
  return { decimalOdds, independenceProbability, breakEvenProbability:1/decimalOdds, estimatedEvIfIndependent:(independenceProbability*decimalOdds-1)*100, correlationWarning, recommendation:'REVIEW ONLY', warning:'Independence calculation is NOT a validated joint probability. Do not treat it as a recommendation without correlation modeling and verified prices.' };
}
