import React, { useState } from 'react';
import { ArrowLeftRight, Calculator, CircleHelp, Percent, TrendingUp } from 'lucide-react';
import { americanToDecimal, decimalToAmerican, impliedProbability, expectedValue, kellyStake, arbitrage } from '../lib/odds.js';

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const percentage = value => `${value.toFixed(2)}%`;
const american = value => `${value > 0 ? '+' : ''}${Math.round(value)}`;

function readNumber(value, label) {
  if (!String(value).trim()) throw new Error(`Enter ${label.toLowerCase()} to see your results.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  return number;
}

function Result({ label, value, className = '' }) {
  return <div className="result-item"><span className="result-label">{label}</span><strong className={`result-value ${className}`}>{value}</strong></div>;
}

function Field({ label, value, setValue, hint, ...props }) {
  return <label className="field"><span>{label}</span><input inputMode="decimal" type="text" value={value} onChange={event => setValue(event.target.value)} {...props} />{hint && <small className="muted">{hint}</small>}</label>;
}

function Explanation({ title, children }) {
  return <div className="explanation"><CircleHelp size={18} aria-hidden="true" /><div><strong>{title}</strong><p>{children}</p></div></div>;
}

function ArbitrageCalculator() {
  const [oddsA, setOddsA] = useState('+110');
  const [oddsB, setOddsB] = useState('-105');
  const [stake, setStake] = useState('1000');
  let result, error;
  try {
    result = arbitrage(readNumber(oddsA, 'Outcome A odds'), readNumber(oddsB, 'Outcome B odds'), readNumber(stake, 'Total stake'));
    if (!Object.values(result).every(value => typeof value === 'boolean' || Number.isFinite(value))) throw new Error('These values are too large to calculate. Use smaller numbers.');
  } catch (problem) { error = problem.message; }

  return <div className="calculator-layout">
    <section className="panel calculator-inputs">
      <div className="panel-heading"><div><span className="eyebrow">TWO-WAY MARKET</span><h2>Balance both sides.</h2></div><ArrowLeftRight size={22} aria-hidden="true" /></div>
      <p className="muted">Enter the best price for each outcome to calculate an equal-return stake split.</p>
      <div className="form-grid">
        <Field label="Outcome A odds" value={oddsA} setValue={setOddsA} hint="American odds, e.g. +110" />
        <Field label="Outcome B odds" value={oddsB} setValue={setOddsB} hint="American odds, e.g. -105" />
        <Field label="Total stake ($)" value={stake} setValue={setStake} hint="Combined stake across both bets" />
      </div>
      <Explanation title="Use matching markets">Both bets must cover every possible outcome of the same market. Draws, different settlement rules, odds changes, fees, and limits can change the result.</Explanation>
    </section>
    <section className="panel calculation-result" aria-label="Arbitrage results" aria-live="polite">
      <span className="eyebrow">YOUR STAKE SPLIT</span>
      {error ? <p className="negative" role="status">{error}</p> : <>
        <div className="calculator-total"><span className="result-label">{result.isArbitrage ? 'Theoretical profit' : 'Expected shortfall with an equal payout'}</span><strong className={`result-value ${result.isArbitrage ? 'positive' : 'negative'}`}>{money(result.profit)}</strong><span className={result.isArbitrage ? 'positive' : 'negative'}>{percentage(result.roi)} return on total stake</span></div>
        <div className="result-grid"><Result label="Stake on outcome A" value={money(result.stakeA)} /><Result label="Stake on outcome B" value={money(result.stakeB)} /><Result label="Payout either way" value={money(result.payout)} /><Result label="Combined probability" value={percentage(result.impliedSum * 100)} /></div>
        <p className="muted">{result.isArbitrage ? 'The combined implied probability is below 100%, creating a theoretical arbitrage before fees and settlement differences.' : 'These odds do not create an arbitrage. A balanced split would return less than or equal to the amount staked.'}</p>
        <p className="muted">Calculations use unrounded stakes. Two-decimal stake amounts can create small payout differences.</p>
      </>}
    </section>
  </div>;
}

function ExpectedValueCalculator({ bankroll }) {
  const [odds, setOdds] = useState('+120');
  const [winProbability, setWinProbability] = useState('50');
  const [currentBankroll, setCurrentBankroll] = useState(String(bankroll ?? 2500));
  const [kellyFraction, setKellyFraction] = useState('0.25');
  let result, error;
  try {
    const price = readNumber(odds, 'Offered odds');
    const chance = readNumber(winProbability, 'Estimated win probability') / 100;
    const balance = readNumber(currentBankroll, 'Bankroll');
    result = {
      ev: expectedValue(price, chance),
      implied: impliedProbability(price),
      stake: kellyStake(price, chance, balance, Number(kellyFraction)),
      decimal: americanToDecimal(price),
    };
    if (!Object.values(result).every(Number.isFinite)) throw new Error('These values are too large to calculate. Use smaller numbers.');
  } catch (problem) { error = problem.message; }

  return <div className="calculator-layout">
    <section className="panel calculator-inputs">
      <div className="panel-heading"><div><span className="eyebrow">EXPECTED VALUE</span><h2>Put a number on your edge.</h2></div><TrendingUp size={22} aria-hidden="true" /></div>
      <p className="muted">Compare your estimated chance of winning with the price being offered.</p>
      <div className="form-grid">
        <Field label="Offered odds" value={odds} setValue={setOdds} hint="American odds" />
        <Field label="Estimated win probability (%)" value={winProbability} setValue={setWinProbability} hint="Your probability estimate, from 0 to 100" />
        <Field label="Bankroll ($)" value={currentBankroll} setValue={setCurrentBankroll} />
        <label className="field"><span>Kelly fraction</span><select value={kellyFraction} onChange={event => setKellyFraction(event.target.value)}><option value="0.125">Eighth Kelly · 12.5%</option><option value="0.25">Quarter Kelly · 25%</option><option value="0.5">Half Kelly · 50%</option><option value="1">Full Kelly · 100%</option></select></label>
      </div>
      <Explanation title="The probability estimate matters">Expected value is (win probability × decimal odds − 1) × 100. Kelly staking depends on that estimate and does not guarantee a profit.</Explanation>
    </section>
    <section className="panel calculation-result" aria-label="Expected value results" aria-live="polite">
      <span className="eyebrow">THE NUMBERS BEHIND YOUR BET</span>
      {error ? <p className="negative" role="status">{error}</p> : <>
        <div className="calculator-total"><span className="result-label">Expected return on stake</span><strong className={`result-value ${result.ev > 0 ? 'positive' : result.ev < 0 ? 'negative' : ''}`}>{result.ev > 0 ? '+' : ''}{percentage(result.ev)}</strong><span className="muted">{money(result.ev)} expected profit per $100 staked</span></div>
        <div className="result-grid"><Result label="Suggested Kelly stake" value={money(result.stake)} /><Result label="Break-even probability" value={percentage(result.implied * 100)} /><Result label="Decimal odds" value={result.decimal.toFixed(3)} /><Result label="Kelly fraction" value={percentage(Number(kellyFraction) * 100)} /></div>
        <p className="muted">{result.ev > 0 ? 'The offered price has positive expected value under your probability estimate.' : 'This price has no positive edge under your probability estimate. The Kelly stake is zero.'}</p>
      </>}
    </section>
  </div>;
}

function OddsConverter() {
  const [format, setFormat] = useState('American');
  const [value, setValue] = useState('+150');
  let result, error;
  try {
    const input = readNumber(value, `${format} odds`);
    const price = format === 'American' ? input : decimalToAmerican(input);
    const decimal = americanToDecimal(price);
    result = { american: price, decimal, probability: impliedProbability(price), profit: (decimal - 1) * 100 };
    if (!Object.values(result).every(Number.isFinite)) throw new Error('These values are too large to calculate. Use smaller numbers.');
  } catch (problem) { error = problem.message; }

  function changeFormat(next) {
    setFormat(next);
    if (result) setValue(next === 'American' ? american(result.american) : String(Number(result.decimal.toFixed(4))));
    else setValue(next === 'American' ? '+150' : '2.5');
  }

  return <div className="calculator-layout">
    <section className="panel calculator-inputs">
      <div className="panel-heading"><div><span className="eyebrow">ODDS CONVERTER</span><h2>A clearer view of the price.</h2></div><Percent size={22} aria-hidden="true" /></div>
      <p className="muted">Convert American or decimal odds into a payout and a break-even probability.</p>
      <div className="segmented" aria-label="Input odds format">{['American', 'Decimal'].map(option => <button key={option} className={format === option ? 'active' : ''} aria-pressed={format === option} onClick={() => changeFormat(option)}>{option}</button>)}</div>
      <div className="form-grid"><Field label={`${format} odds`} value={value} setValue={setValue} hint={format === 'American' ? 'Positive for underdogs, negative for favorites. Zero is invalid.' : 'Enter a decimal payout multiple greater than 1.'} /></div>
      <Explanation title="Reading implied probability">Implied probability is 1 ÷ decimal odds. It includes the bookmaker’s margin, so it is a break-even price rather than an estimate of the true chance of winning.</Explanation>
    </section>
    <section className="panel calculation-result" aria-label="Odds conversion results" aria-live="polite">
      <span className="eyebrow">ONE PRICE, DIFFERENT VIEWS</span>
      {error ? <p className="negative" role="status">{error}</p> : <>
        <div className="calculator-total"><span className="result-label">Implied probability</span><strong className="result-value">{percentage(result.probability * 100)}</strong><span className="muted">The win rate needed to break even at this price</span></div>
        <div className="result-grid"><Result label="American odds" value={american(result.american)} /><Result label="Decimal odds" value={result.decimal.toFixed(3)} /><Result label="Profit on a $100 win" value={money(result.profit)} /><Result label="Total payout on a $100 win" value={money(result.profit + 100)} /></div>
        <p className="muted">Total payout includes the original $100 stake. These values describe a winning bet; losing bets return zero.</p>
      </>}
    </section>
  </div>;
}

export default function Calculators({ bankroll }) {
  const [active, setActive] = useState('arbitrage');
  const tools = [
    { id: 'arbitrage', label: 'Arbitrage calculator', icon: ArrowLeftRight },
    { id: 'ev', label: 'Expected value', icon: TrendingUp },
    { id: 'converter', label: 'Odds converter', icon: Calculator },
  ];
  return <div className="calculators">
    <div className="segmented calculator-tabs" aria-label="Calculator tools">{tools.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} aria-pressed={active === id} onClick={() => setActive(id)}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>
    {active === 'arbitrage' && <ArbitrageCalculator />}
    {active === 'ev' && <ExpectedValueCalculator bankroll={bankroll} />}
    {active === 'converter' && <OddsConverter />}
  </div>;
}
