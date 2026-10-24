import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, ChevronDown, CircleHelp, Clock3, Filter, Flame, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, TrendingUp, X, Zap } from 'lucide-react';
import { books } from '../data/markets.js';
import { csvString } from '../lib/storage.js';
import { americanToDecimal, kellyStake } from '../lib/odds.js';
import { isPropCurrent, localDateKey } from '../lib/props.js';
import Modal from './Modal.jsx';

const DEFAULT_LEAGUES = [
  { key: 'soccer_epl', title: 'English Premier League' },
  { key: 'soccer_uefa_champs_league', title: 'UEFA Champions League' },
  { key: 'soccer_spain_la_liga', title: 'La Liga' },
  { key: 'soccer_usa_mls', title: 'MLS' },
  { key: 'soccer_germany_bundesliga', title: 'Bundesliga' },
  { key: 'soccer_italy_serie_a', title: 'Serie A' },
  { key: 'soccer_france_ligue_one', title: 'Ligue 1' },
];
const TIME_ZONES = [
  ['America/Denver', 'Mountain time'], ['America/New_York', 'Eastern time'],
  ['America/Chicago', 'Central time'], ['America/Los_Angeles', 'Pacific time'],
  ['Europe/London', 'London time'], ['UTC', 'UTC'],
];
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const sportLabel = sport => sport === 'SOCCER' ? 'Soccer' : sport;
const bookName = id => books.find(book => book.id === id)?.name || id;

function savedSettings() {
  try {
    const data = JSON.parse(localStorage.getItem('ultrax-props-settings'));
    if (!data || !['ALL', 'NBA', 'NFL', 'SOCCER'].includes(data.sport)
      || !DEFAULT_LEAGUES.some(league => league.key === data.league)
      || !TIME_ZONES.some(([zone]) => zone === data.timeZone)) return null;
    return data;
  } catch { return null; }
}

function Book({ id }) {
  const book = books.find(candidate => candidate.id === id);
  return book ? <span className="book-label prop-book"><span className="book-badge" style={{ '--book-color': book.color }}>{book.short}</span><span>{book.name}</span></span> : <span>{id}</span>;
}

function isSnapshotCurrent(snapshot, now, day) {
  const fetched = Date.parse(snapshot?.fetchedAt);
  const expires = Date.parse(snapshot?.expiresAt);
  return snapshot?.source === 'The Odds API' && snapshot.day === day
    && Number.isFinite(fetched) && fetched <= now + 120000
    && Number.isFinite(expires) && expires > now && expires <= fetched + 300000;
}

function sameQuote(a, b) {
  return a?.id === b?.id && a.book === b.book && a.odds === b.odds
    && a.priceUpdatedAt === b.priceUpdatedAt && a.referenceUpdatedAt === b.referenceUpdatedAt
    && a.fairProbability === b.fairProbability && a.startsAt === b.startsAt
    && JSON.stringify(a.referenceBooks) === JSON.stringify(b.referenceBooks);
}

export default function DailyProps({ bankroll, oddsFormat, onTrack, onAnalyze, onOpenParlay, onOpenResearch }) {
  const initial = useRef(savedSettings());
  const [sport, setSport] = useState(initial.current?.sport || 'ALL');
  const [league, setLeague] = useState(initial.current?.league || 'soccer_epl');
  const [timeZone, setTimeZone] = useState(initial.current?.timeZone || 'America/Denver');
  const [book, setBook] = useState('all');
  const [minEv, setMinEv] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('checking');
  const [statusError, setStatusError] = useState('');
  const [keyDiagnostic, setKeyDiagnostic] = useState(null);
  const [checkingKey, setCheckingKey] = useState(false);
  const [soccerLeagues, setSoccerLeagues] = useState(DEFAULT_LEAGUES);
  const [snapshots, setSnapshots] = useState({});
  const [loading, setLoading] = useState(false);
  const [scanErrors, setScanErrors] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [freeMode, setFreeMode] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null);
  const [stake, setStake] = useState('');
  const [stakeError, setStakeError] = useState('');
  const [showMethod, setShowMethod] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [sort, setSort] = useState('research');
  const activeScan = useRef(null);
  const connectionRequest = useRef(null);
  const requestId = useRef(0);
  const day = localDateKey(now, timeZone);
  const requestedSports = sport === 'ALL' ? ['NBA', 'NFL', 'SOCCER'] : [sport];
  const keyFor = useCallback(value => `${value}:${value === 'SOCCER' ? league : ''}:${timeZone}:${day}`, [league, timeZone, day]);
  const fmt = odds => oddsFormat === 'decimal' ? americanToDecimal(odds).toFixed(2) : `${odds > 0 ? '+' : ''}${Number(odds.toFixed(2))}`;
  const time = value => new Date(value).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });

  useEffect(() => {
    try { localStorage.setItem('ultrax-props-settings', JSON.stringify({ sport, league, timeZone })); } catch { /* Preferences are optional when storage is full. */ }
  }, [sport, league, timeZone]);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, []);

  async function verifyApiKey() {
    setCheckingKey(true);setKeyDiagnostic(null);
    try {
      const response=await fetch('/api/props/check');
      const data=await response.json();
      setKeyDiagnostic(data);
    } catch {
      setKeyDiagnostic({valid:false,error:'Could not check the key. Restart the UltraX server and retry.'});
    } finally {setCheckingKey(false);}
  }

  const checkConnection = useCallback(async () => {
    connectionRequest.current?.abort();
    const controller = new AbortController();
    connectionRequest.current = controller;
    setStatus('checking'); setStatusError('');
    try {
      const response = await fetch('/api/props/status', { signal: controller.signal });
      if (!response.ok) throw new Error('The player-props service is unavailable. Restart the UltraX server and try again.');
      const data = await response.json();
      if (typeof data.configured !== 'boolean') throw new Error('The server needs the updated player-props connector. Restart UltraX and try again.');
      if (controller.signal.aborted) return;
      const validLeagues = Array.isArray(data.soccerLeagues) ? data.soccerLeagues.filter(item => item && DEFAULT_LEAGUES.some(candidate => candidate.key === item.key) && typeof item.title === 'string') : [];
      if (validLeagues.length) setSoccerLeagues(validLeagues);
      setFreeMode(Boolean(data.freeMode));
      if (data.freeMode) { setAutoRefresh(false); setSport(current => current === 'ALL' ? 'NBA' : current); }
      setStatus(data.configured ? 'configured' : 'unconfigured');
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatusError(error.message || 'Could not check the player-props service.'); setStatus('error');
    }
  }, []);

  useEffect(() => {
    checkConnection();
    return () => { connectionRequest.current?.abort(); activeScan.current?.abort(); };
  }, [checkConnection]);

  const refresh = useCallback(async () => {
    if (status !== 'configured') return;
    activeScan.current?.abort();
    const controller = new AbortController();
    activeScan.current = controller;
    const sequence = ++requestId.current;
    const requested = sport === 'ALL' ? (freeMode ? ['NBA'] : ['NBA', 'NFL', 'SOCCER']) : [sport];
    setLoading(true); setScanErrors([]);
    const errors = [];
    try {
      // Keep scans sequential so a broad board does not burst the provider quota.
      for (const selectedSport of requested) {
        const params = new URLSearchParams({ sport: selectedSport, timeZone });
        if (selectedSport === 'SOCCER') params.set('league', league);
        try {
          const response = await fetch(`/api/props?${params}`, { signal: controller.signal });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `Could not scan ${sportLabel(selectedSport)} props.`);
          if (controller.signal.aborted || sequence !== requestId.current) return;
          if (!Array.isArray(result.picks) || result.sport !== selectedSport || result.day !== day || result.timeZone !== timeZone || result.source !== 'The Odds API'
            || !Number.isFinite(Date.parse(result.fetchedAt)) || !Number.isFinite(Date.parse(result.expiresAt))) {
            throw new Error('The provider scan returned an invalid snapshot. Existing prices have not been refreshed.');
          }
          setSnapshots(current => ({ ...current, [keyFor(selectedSport)]: result }));
        } catch (error) {
          if (controller.signal.aborted) return;
          errors.push(`${sportLabel(selectedSport)}: ${error.message || 'The provider could not complete this scan.'}`);
        }
      }
      if (sequence === requestId.current) { setScanErrors(errors); setNow(Date.now()); }
    } finally { if (sequence === requestId.current) setLoading(false); }
  }, [status, sport, league, timeZone, day, keyFor, freeMode]);

  useEffect(() => {
    if (status === 'configured' && !freeMode) refresh();
    return () => { activeScan.current?.abort(); };
  }, [refresh, status, freeMode]);

  useEffect(() => {
    if (!autoRefresh || status !== 'configured' || freeMode) return;
    const interval = setInterval(() => { if (!document.hidden) refresh(); }, 300000);
    return () => clearInterval(interval);
  }, [autoRefresh, refresh, status, freeMode]);

  const selectedSnapshots = requestedSports.map(value => snapshots[keyFor(value)]).filter(Boolean);
  const currentSnapshots = selectedSnapshots.filter(snapshot => isSnapshotCurrent(snapshot, now, day));
  const rawPicks = currentSnapshots.flatMap(snapshot => snapshot.picks).filter(pick => isPropCurrent(pick, { now, timeZone }));
  const allPicks = Array.from(new Map(rawPicks.map(pick => [pick.id, pick])).values());
  const filtered = allPicks.filter(pick => (book === 'all' || pick.book === book) && pick.ev >= minEv
    && `${pick.player} ${pick.event} ${pick.marketLabel || pick.marketKey}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>sort==='time'? Date.parse(a.startsAt)-Date.parse(b.startsAt) :
  sort==='ev'?b.ev-a.ev :
  (b.research?.sortTier??0)-(a.research?.sortTier??0) ||
  (b.research?.verifiedChecks??0)-(a.research?.verifiedChecks??0) || b.ev-a.ev);
  const warnings = selectedSnapshots.flatMap(snapshot => Array.isArray(snapshot.warnings) ? snapshot.warnings.filter(item => typeof item === 'string').map(item => `${sportLabel(snapshot.sport)}: ${item}`) : []);
  const incomplete = selectedSnapshots.some(snapshot => snapshot.complete === false);
  const expired = selectedSnapshots.length > 0 && currentSnapshots.length < selectedSnapshots.length;
  const scanned = currentSnapshots.reduce((sum, snapshot) => sum + (Number.isFinite(snapshot.eventsScanned) ? snapshot.eventsScanned : 0), 0);
  const available = currentSnapshots.reduce((sum, snapshot) => sum + (Number.isFinite(snapshot.eventsAvailable) ? snapshot.eventsAvailable : 0), 0);
  const newest = currentSnapshots.map(snapshot => Date.parse(snapshot.fetchedAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const hasCurrentSelection = selected && isPropCurrent(selected, { now, timeZone }) && currentSnapshots.some(snapshot => snapshot.picks.some(pick => sameQuote(pick, selected)));

  function openPick(pick) {
    setSelected(pick); setStakeError('');
    setStake(''); // Market consensus is not a calibrated model; never auto-suggest a stake.
  }

  function track(e) {
    e.preventDefault();
    const amount = Number(stake);
    const timestamp = Date.now();
    const stillFresh = selected && isPropCurrent(selected, { now: timestamp, timeZone })
      && selectedSnapshots.some(snapshot => isSnapshotCurrent(snapshot, timestamp, localDateKey(timestamp, timeZone)) && snapshot.picks.some(pick => sameQuote(pick, selected)));
    if (!stillFresh) { setStakeError('This price changed, expired, or the event started. Select a current price from the board before logging a new bet.'); return; }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) { setStakeError('Enter a stake from $0.01 to $100,000,000.'); return; }
    onTrack({ event: selected.event, sport: selected.sport, selection: `${selected.player} ${selected.side} ${selected.line} ${selected.marketLabel || selected.marketKey}`,
      market: selected.marketLabel || selected.marketKey, book: selected.book, odds: selected.odds, stake: amount,
      propId: selected.id, referenceProbability: selected.fairProbability, quotedAt: selected.priceUpdatedAt });
    setSelected(null);
  }

  function exportPicks() {
    const data = csvString([['Sport', 'Event', 'Player', 'Market', 'Side', 'Line', 'Sportsbook', 'American odds', 'Estimated EV %', 'Reference books', 'Price timestamp', 'Event start'],
      ...filtered.map(pick => [pick.sport, pick.event, pick.player, pick.marketLabel || pick.marketKey, pick.side, pick.line, bookName(pick.book), pick.odds, Number(pick.ev.toFixed(2)), pick.referenceBooks.map(bookName).join('; '), pick.priceUpdatedAt, pick.startsAt])]);
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `ultrax-props-${day}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="daily-props">
    <section className="props-intro">
      <div><span className="hero-kicker"><span/>YOUR DAILY RESEARCH BOARD</span><h2>Find a better price.<br/><span>Let the numbers lead.</span></h2><p>Compare the same player, market, and line across books.<br/>See estimated value based on independent market prices.</p></div>
      <div className="props-intro-right"><span className="props-sport-stack"><span>NBA</span><span>NFL</span><span>⚽</span></span><strong>{new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(now)}</strong><span>{TIME_ZONES.find(([zone]) => zone === timeZone)?.[1] || timeZone}</span><small>Upcoming events today · one soccer league per scan</small></div>
    </section>

    <div className="props-status-bar"><span className={`props-status-dot ${status === 'configured' ? 'configured' : ''}`}/><strong>{status === 'checking' ? 'Checking data connection…' : status === 'configured' ? 'API key found (not validated)' : 'Player-prop data not connected'}</strong><span>{status === 'configured' ? 'Check whether your key is accepted before scanning player props.' : 'Real props require your own data-provider account.'}</span><button className="text-button" onClick={() => setShowSetup(true)}>Connection guide <ArrowUpRight size={13}/></button></div>

    {status === 'configured' && <div className="research-key-check" role="region" aria-label="API key diagnostics">
      <button type="button" className="button secondary" onClick={verifyApiKey} disabled={checkingKey}>{checkingKey?'Checking API key…':'Verify API key (no credits)'}</button>
      {keyDiagnostic && <div className={keyDiagnostic.valid?'research-muted':'research-warning'} role="status">
        {keyDiagnostic.valid ? 'Key accepted by The Odds API. ' : 'Key verification failed. '}
        {keyDiagnostic.message||keyDiagnostic.error||''}
        {Number.isInteger(keyDiagnostic.remainingCredits) ? ' Remaining credits: '+keyDiagnostic.remainingCredits+'.' : ''}
      </div>}
    </div>}

    <div className="props-research-banner"><strong>Research-first screening</strong><span>Prop candidates are checked against available player rosters, game logs, opponent, rest and injury listings. Unverified injuries, playing time and defensive matchup data are flagged; no model win probabilities or guaranteed picks are shown.</span></div><div className="props-controls panel"><div className="props-scan-filters"><label className="field">Sport<select value={sport} onChange={e => setSport(e.target.value)}><option value="ALL" disabled={freeMode}>NBA + NFL + Soccer</option><option value="NBA">NBA</option><option value="NFL">NFL</option><option value="SOCCER">Soccer</option></select></label><label className="field">Soccer league<select value={league} disabled={sport !== 'ALL' && sport !== 'SOCCER'} onChange={e => setLeague(e.target.value)}>{soccerLeagues.map(value => <option key={value.key} value={value.key}>{value.title}</option>)}</select></label><label className="field">Day timezone<select value={timeZone} onChange={e => setTimeZone(e.target.value)}>{TIME_ZONES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><button className="button primary" aria-label="Refresh props" disabled={status !== 'configured' || loading} onClick={refresh}><RefreshCw size={15} className={loading ? 'spinning' : ''}/>{loading ? 'Scanning props…' : 'Refresh props'}</button></div><div className="props-refresh-row"><label className="auto-refresh"><input type="checkbox" checked={autoRefresh} disabled={status !== 'configured' || freeMode} onChange={e => setAutoRefresh(e.target.checked)}/>Auto-refresh every 5 minutes while this page is open</label><span><Clock3 size={12}/>{freeMode ? 'Free-budget mode · manual scan only · 1 event / market' : 'Daily scan on opening · cached for 5 minutes'}</span></div></div>

    {(status === 'unconfigured' || status === 'error') && <section className="props-connect-card"><div className="connect-icon"><Activity size={26}/></div><div><span className="eyebrow">THE NEXT STEP</span><h2>Connect data to get real daily props.</h2><p>UltraX needs current player-prop prices before it can identify an estimated edge. No picks are generated from the demo dashboard.</p><ol><li>Create a data-provider account with NBA, NFL, and soccer player-prop access.</li><li>Add <code>ODDS_API_KEY</code> to your local <code>.env</code> file or secure environment settings.</li><li>Restart UltraX, then check the connection here.</li></ol><div className="props-connect-actions"><button className="button primary" onClick={checkConnection}><RefreshCw size={15}/>Check connection</button><button className="button secondary" onClick={() => setShowSetup(true)}>Show setup steps <ArrowRight size={15}/></button></div><p className="connect-note">Free API access is limited and real player props require a key. You can still research player statistics and use the manual parlay calculator without one.</p><p className="connect-note">Get your own API key at <a href="https://the-odds-api.com/" target="_blank" rel="noopener noreferrer">The Odds API</a>, then configure ODDS_API_KEY on your server. Never paste the key into this page or a public repository.</p>{onOpenResearch && <button className="button secondary" type="button" onClick={onOpenResearch}>Research player statistics without odds <Search size={14}/></button>}{onOpenParlay && <button className="button secondary" type="button" onClick={onOpenParlay}>Build a parlay without an API key <ArrowRight size={14}/></button>}{statusError && <p className="form-error" role="alert">{statusError}</p>}</div></section>}

    {status === 'configured' && <>
      <div className="stats-grid props-stats"><article className="stat-card accent"><div className="stat-label">Price-discrepancy candidates <Flame size={16}/></div><div className="stat-value">{allPicks.length}</div><div className="stat-foot">Fresh prices · future events today</div></article><article className="stat-card"><div className="stat-label">Highest market EV <TrendingUp size={16}/></div><div className="stat-value">{allPicks.length ? `+${Math.max(...allPicks.map(pick => pick.ev)).toFixed(2)}%` : '—'}</div><div className="stat-foot">Market-based estimate, not a prediction</div></article><article className="stat-card"><div className="stat-label">Events scanned <Target size={16}/></div><div className="stat-value">{scanned}<small> / {available}</small></div><div className="stat-foot">Scan is limited by your plan and free-budget settings</div></article><article className="stat-card"><div className="stat-label">Last successful fetch <Clock3 size={16}/></div><div className="stat-value props-time-value">{newest ? time(newest) : '—'}</div><div className="stat-foot">Prices expire after five minutes</div></article></div>
      {(scanErrors.length > 0 || warnings.length > 0 || incomplete || expired) && <div className="props-scan-warning" role="alert"><CircleHelp size={17}/><div><strong>{scanErrors.length ? 'Some prices could not be refreshed' : expired ? 'A price snapshot has expired' : 'This scan has limited coverage'}</strong>{scanErrors.map((message, index) => <p key={`error-${index}`}>{message}</p>)}{warnings.map((message, index) => <p key={`warning-${index}`}>{message}</p>)}{expired && <p>Expired snapshots are hidden. Refresh to see current eligible prices.</p>}{incomplete && <p>Results cover only successfully scanned events. This is not a complete view of today’s market.</p>}</div></div>}
      <section className="market-panel props-market-panel"><div className="market-panel-heading"><div><h2>Today’s player props <span className="count-pill">{filtered.length}</span></h2><p>Ordered by research evidence first. Every item is a candidate, NOT an AI-approved bet.</p></div><button className="button secondary small" disabled={!filtered.length} onClick={exportPicks}><ArrowDownToLine size={14}/>Export picks</button></div><div className="props-result-filters"><label className="search-field"><Search size={16}/><input aria-label="Search player props" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players, teams, markets…"/>{search && <button onClick={() => setSearch('')} aria-label="Clear prop search"><X size={13}/></button>}</label><label className="compact-select">Sportsbook<select aria-label="Sportsbook" value={book} onChange={e => setBook(e.target.value)}><option value="all">All books</option>{books.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label><label className="compact-select">Minimum EV<select aria-label="Minimum EV" value={minEv} onChange={e => setMinEv(Number(e.target.value))}><option value={0}>Above 0%</option><option value={2}>2% or more</option><option value={5}>5% or more</option><option value={10}>10% or more</option></select></label><label className="compact-select">Sort by<select aria-label="Sort props" value={sort} onChange={e => setSort(e.target.value)}><option value="research">Research coverage first</option><option value="ev">Highest market-estimated EV</option><option value="time">Event start</option></select></label></div>
        {loading && !currentSnapshots.length ? <div className="props-loading" role="status"><RefreshCw className="spinning" size={24}/><h3>Comparing today’s player props…</h3><p>Matching both sides of each line and checking independent reference prices.</p></div> : !filtered.length ? <div className="empty-state"><span className="empty-icon"><Filter size={24}/></span><h3>{allPicks.length ? 'No props match your filters' : scanErrors.length && !currentSnapshots.length ? 'Could not load daily props' : expired ? 'Refresh to get current props' : 'No qualifying props right now'}</h3><p>{allPicks.length ? 'Try another book, a lower minimum EV, or a different search.' : 'Eligible picks need fresh prices for the same half-point line from a target book and at least two other books. Nothing is filled in with sample picks.'}</p>{allPicks.length ? <button className="button secondary" onClick={() => { setBook('all'); setMinEv(0); setSearch(''); }}>Clear prop filters</button> : <button className="button secondary" disabled={loading} onClick={refresh}><RefreshCw size={14}/>Refresh props</button>}</div> : <div className="prop-grid">{filtered.map(pick => <article className="prop-card" data-testid="prop-card" key={pick.id}><div className="prop-card-top"><span className={`prop-sport ${pick.sport.toLowerCase()}`}>{sportLabel(pick.sport)}</span><span className="edge-pill">+{pick.ev.toFixed(2)}% market EV</span></div><h3>{pick.player}</h3><div className="prop-selection"><strong>{pick.side} {pick.line}</strong><span>{pick.marketLabel || pick.marketKey}</span></div><p className="prop-event">{pick.event}</p><div className={`research-bet-status ${pick.research?.status==='BLOCKED'?'blocked':''}`}><strong>{pick.research?.status||'RESEARCH NOT CHECKED'}</strong><small>{pick.research ? pick.research.verifiedChecks+'/'+pick.research.totalChecks+' data checks completed · Not a win probability' : 'Research unavailable · Odds only'}</small></div><div className="prop-schedule"><Clock3 size={12}/>{time(pick.startsAt)} · Today{pick.sport === 'SOCCER' && <span> · {soccerLeagues.find(value => value.key === league)?.title || 'Soccer'}</span>}</div><div className="prop-price-row"><Book id={pick.book}/><strong>{fmt(pick.odds)}</strong></div><div className="prop-reference"><ShieldCheck size={12}/>{pick.referenceCount} other books · no-vig consensus</div><button className="button secondary full-width" aria-label={`View prop ${pick.player} ${pick.side} ${pick.line}`} onClick={() => openPick(pick)}>View prop <ArrowUpRight size={15}/></button></article>)}</div>}
      </section>
    </>}

    <div className="props-method-row"><span><ShieldCheck size={15}/>Every displayed pick must pass the same freshness and market-matching checks.</span><button className="text-button" onClick={() => setShowMethod(true)}>How picks are ranked <CircleHelp size={14}/></button></div>

    {selected && <Modal title="Player prop details" onClose={() => setSelected(null)}><div className="modal-content prop-details"><div className="prop-card-top"><span className={`prop-sport ${selected.sport.toLowerCase()}`}>{sportLabel(selected.sport)}</span><span className="edge-pill">+{selected.ev.toFixed(2)}% estimated EV</span></div><h3>{selected.player}</h3><div className="prop-selection"><strong>{selected.side} {selected.line}</strong><span>{selected.marketLabel || selected.marketKey}</span></div><p className="prop-event">{selected.event} · {time(selected.startsAt)}</p>
      <div className="research-report">
        <h4>Player research: {selected.research?.status || 'NOT CHECKED'}</h4>
        <p>Bookmaker price discrepancy is not a player-performance prediction. UltraX does not have a calibrated win probability for this prop.</p>
        {(selected.research?.checks || []).map(item=><div className="research-report-check" key={item.id}>
          <strong>{item.status==='verified'?'✓ ':item.status==='blocked'?'✕ ':'! '}{item.title}</strong>
          <span>{item.explanation}</span>
        </div>)}
        {(selected.research?.warnings||[]).map((warning,i)=><p className="research-warning" key={i}>{warning}</p>)}
        {selected.research?.sources?.gamelog && <p className="research-sources">
          <a target="_blank" rel="noreferrer" href={selected.research.sources.gamelog}>Game logs</a>
          {selected.research.sources.injuries && <a target="_blank" rel="noreferrer" href={selected.research.sources.injuries}>Injury listings</a>}
          {selected.research.sources.schedule && <a target="_blank" rel="noreferrer" href={selected.research.sources.schedule}>Upcoming games</a>}
        </p>}
      </div><div className="prop-detail-price"><Book id={selected.book}/><strong>{fmt(selected.odds)}</strong></div><div className="pick-metrics"><div><span>Bookmaker consensus (NOT forecast)</span><strong>{(selected.fairProbability * 100).toFixed(2)}%</strong></div><div><span>Model win probability</span><strong>Not validated</strong></div></div>
      {Array.isArray(selected.prices) && selected.prices.length > 0 && <><h4 className="prop-section-heading">SAME PLAYER · SAME LINE</h4><div className="prop-price-comparison">{selected.prices.filter(price => price && books.some(value => value.id === price.book) && Number.isFinite(price.odds) && Math.abs(price.odds) >= 100).map(price => <div key={price.book} className={price.book === selected.book ? 'best' : ''}><Book id={price.book}/><strong>{fmt(price.odds)}</strong></div>)}</div></>}
      <div className="prop-reference-detail"><h4><ShieldCheck size={15}/>Independent price reference</h4><p>Reference books: <strong>{selected.referenceBooks.map(bookName).join(', ')}</strong>. The offered sportsbook is excluded from its own reference.</p><p>For each reference book, both Over and Under prices are normalized to remove the margin, then averaged. That probability is an estimate, not a player-performance forecast.</p><small>Offered price updated {time(selected.priceUpdatedAt)} · Oldest reference {time(selected.referenceUpdatedAt)}</small></div>
      {onAnalyze && <button type="button" className="button secondary full-width" onClick={() => { onAnalyze(selected); setSelected(null); }}><Search size={15}/>Research this player</button>}
      {!hasCurrentSelection && <p className="form-error" role="alert">This price changed, expired, or the event started. Close this detail and select the current price from the board.</p>}<form onSubmit={track}><label className="field">Stake ($)<input type="number" min="0.01" max="100000000" step="0.01" required value={stake} onChange={e => setStake(e.target.value)}/></label><p className="fine-print">No stake is suggested. Market consensus alone cannot establish a reliable betting edge. Tracking a bet is optional and never places a wager.</p>{stakeError && <p className="form-error" role="alert">{stakeError}</p>}<button type="submit" className="button primary full-width" disabled={!hasCurrentSelection}><BookOpen size={15}/>Add to bet tracker</button><p className="modal-footnote">Records your bet in the journal. Does not place a wager.</p></form></div></Modal>}

    {showSetup && <Modal title="Connect player-prop data" onClose={() => setShowSetup(false)}><div className="modal-content props-setup"><span className="sample-tag">REAL PRICES REQUIRE A DATA ACCOUNT</span><h3>Connect your own provider account.</h3><p>The built-in connector supports The Odds API’s event player-prop endpoint. Confirm that your plan covers the sports, leagues, sportsbooks, and prop markets you want before subscribing.</p><a className="button secondary" href="https://the-odds-api.com/" target="_blank" rel="noopener noreferrer">Visit The Odds API <ArrowUpRight size={14}/></a><ol><li>Get an API key from your provider account. Do not paste it into this chat or an imported JSON file.</li><li>On your own computer, copy <code>.env.example</code> to <code>.env</code> inside the UltraX folder. Add your key after <code>ODDS_API_KEY=</code> and save as plain text.</li><li>Stop the running server with Control + C, then run <code>npm start</code> again.</li><li>Open Daily props and choose Check connection.</li></ol><p>In the cloud environment, enter the key securely in environment settings and allow <code>api.the-odds-api.com</code>, then restart the server.</p><div className="feed-note"><CircleHelp size={17}/><p>A detected key does not confirm plan access. The scan will report credentials, quota, coverage, and network errors explicitly. Multiple markets are requested per event; provider usage is billed according to its own rules.</p></div><button className="button primary" onClick={() => { setShowSetup(false); checkConnection(); }}><RefreshCw size={15}/>Check connection</button></div></Modal>}
    {showMethod && <Modal title="How daily props are ranked" onClose={() => setShowMethod(false)}><div className="modal-content props-method"><span className="sample-tag">MARKET COMPARISON · NOT A PRIVATE ODDSJAM MODEL</span><h3>Same player. Same market. Same line.</h3><p>UltraX matches two-way Over/Under markets on a half-point line. It only uses future events occurring today in your selected timezone.</p><ol><li>Find a fresh offered price at a supported sportsbook.</li><li>Find at least two other books quoting both sides of that exact line.</li><li>Remove each reference book’s margin, then average those probabilities. The offered sportsbook never supplies its own reference.</li><li>Estimate EV as <code>(fair probability × decimal odds − 1) × 100</code> and rank positive results.</li></ol><p>Quotes older than 15 minutes are excluded. The displayed scan expires after five minutes. Started events, integer lines with push risk, unmatched lines, and insufficient references are excluded.</p><div className="feed-note"><CircleHelp size={17}/><p>This method measures price differences. It does not model injuries, projected minutes, starting lineups, or player performance, and it cannot guarantee profit. Verify book rules and the current price before any wager.</p></div><p>NBA: points, rebounds, assists, and threes. NFL: passing, rushing, receiving yards, and receptions. Soccer: shots and shots on target in the selected supported league. Coverage depends on the provider.</p><p>The scanner requests up to 12 events per selected sport or soccer league. Partial scans and errors are labeled. It refreshes on opening; optional five-minute refresh works only while this page is open.</p></div></Modal>}
  </div>;
}
