/**
 * Deterministic demonstration fixtures for the local Gam dashboard.
 * These are illustrative matchups and prices, not a live feed, schedule,
 * prediction, or a representation of prices offered by any sportsbook.
 */
export const dataSource = {
  mode: 'demo',
  label: 'Demo odds',
  description: 'Illustrative fixtures and sample prices. No live sportsbook connection.',
  updatedAt: '2026-10-23T22:00:00Z',
};

export const books = [
  { id: 'draftkings', name: 'DraftKings', short: 'DK', color: '#319e4c' },
  { id: 'fanduel', name: 'FanDuel', short: 'FD', color: '#1688dd' },
  { id: 'betmgm', name: 'BetMGM', short: 'MGM', color: '#b59a59' },
  { id: 'caesars', name: 'Caesars', short: 'CZR', color: '#146d61' },
  { id: 'pinnacle', name: 'Pinnacle', short: 'PIN', color: '#d56938' },
];

export const markets = [
  {
    id: 'nba-bos-lal-bos', sport: 'NBA', league: 'NBA',
    event: 'Boston Celtics vs. Los Angeles Lakers', selection: 'Boston Celtics',
    market: 'Moneyline', startsAt: '2026-10-24T23:30:00Z',
    odds: { draftkings: -102, fanduel: -108, betmgm: -105, caesars: -110, pinnacle: -113 },
    fairOdds: -115, trend: [-120, -118, -115, -112, -110, -105, -102],
  },
  {
    id: 'nba-bos-lal-lal', sport: 'NBA', league: 'NBA',
    event: 'Boston Celtics vs. Los Angeles Lakers', selection: 'Los Angeles Lakers',
    market: 'Moneyline', startsAt: '2026-10-24T23:30:00Z',
    odds: { draftkings: -118, fanduel: 112, betmgm: -115, caesars: -110, pinnacle: 103 },
    fairOdds: 115, trend: [100, 102, 105, 103, 108, 110, 112],
  },
  {
    id: 'nba-nyk-mia-over', sport: 'NBA', league: 'NBA',
    event: 'New York Knicks vs. Miami Heat', selection: 'Over 218.5',
    market: 'Total points', startsAt: '2026-10-25T00:00:00Z',
    odds: { draftkings: 105, fanduel: -110, betmgm: -108, caesars: -105, pinnacle: -112 },
    fairOdds: -104, trend: [-118, -115, -110, -108, -105, 100, 105],
  },
  {
    id: 'nba-nyk-mia-under', sport: 'NBA', league: 'NBA',
    event: 'New York Knicks vs. Miami Heat', selection: 'Under 218.5',
    market: 'Total points', startsAt: '2026-10-25T00:00:00Z',
    odds: { draftkings: -125, fanduel: -110, betmgm: -112, caesars: -115, pinnacle: 102 },
    fairOdds: 104, trend: [-110, -112, -110, -108, -105, 100, 102],
  },
  {
    id: 'nba-gsw-den-gsw', sport: 'NBA', league: 'NBA',
    event: 'Golden State Warriors vs. Denver Nuggets', selection: 'Golden State Warriors +4.5',
    market: 'Point spread', startsAt: '2026-10-25T02:00:00Z',
    odds: { draftkings: -110, fanduel: -105, betmgm: 102, caesars: -108, pinnacle: -109 },
    fairOdds: -102, trend: [-115, -112, -110, -108, -105, 100, 102],
  },
  {
    id: 'nba-gsw-den-den', sport: 'NBA', league: 'NBA',
    event: 'Golden State Warriors vs. Denver Nuggets', selection: 'Denver Nuggets -4.5',
    market: 'Point spread', startsAt: '2026-10-25T02:00:00Z',
    odds: { draftkings: -110, fanduel: -115, betmgm: -122, caesars: -112, pinnacle: -111 },
    fairOdds: 102, trend: [-105, -107, -108, -110, -108, -110, -111],
  },
  {
    id: 'nfl-kc-buf-kc', sport: 'NFL', league: 'NFL',
    event: 'Kansas City Chiefs vs. Buffalo Bills', selection: 'Kansas City Chiefs',
    market: 'Moneyline', startsAt: '2026-10-24T20:25:00Z',
    odds: { draftkings: 135, fanduel: 140, betmgm: 138, caesars: 145, pinnacle: 132 },
    fairOdds: 130, trend: [125, 128, 132, 130, 138, 142, 145],
  },
  {
    id: 'nfl-kc-buf-buf', sport: 'NFL', league: 'NFL',
    event: 'Kansas City Chiefs vs. Buffalo Bills', selection: 'Buffalo Bills',
    market: 'Moneyline', startsAt: '2026-10-24T20:25:00Z',
    odds: { draftkings: -155, fanduel: -160, betmgm: -158, caesars: -165, pinnacle: -142 },
    fairOdds: -130, trend: [-155, -152, -150, -149, -145, -144, -142],
  },
  {
    id: 'nfl-dal-phi-over', sport: 'NFL', league: 'NFL',
    event: 'Dallas Cowboys vs. Philadelphia Eagles', selection: 'Over 47.5',
    market: 'Total points', startsAt: '2026-10-24T17:00:00Z',
    odds: { draftkings: -105, fanduel: 108, betmgm: -110, caesars: -108, pinnacle: -112 },
    fairOdds: -103, trend: [-115, -110, -108, -105, 100, 105, 108],
  },
  {
    id: 'nfl-dal-phi-under', sport: 'NFL', league: 'NFL',
    event: 'Dallas Cowboys vs. Philadelphia Eagles', selection: 'Under 47.5',
    market: 'Total points', startsAt: '2026-10-24T17:00:00Z',
    odds: { draftkings: -115, fanduel: -128, betmgm: -110, caesars: -112, pinnacle: 102 },
    fairOdds: 103, trend: [-110, -110, -108, -105, -102, 100, 102],
  },
  {
    id: 'nfl-sf-sea-sf', sport: 'NFL', league: 'NFL',
    event: 'San Francisco 49ers vs. Seattle Seahawks', selection: 'San Francisco 49ers -3.5',
    market: 'Point spread', startsAt: '2026-10-25T00:20:00Z',
    odds: { draftkings: -110, fanduel: -108, betmgm: -105, caesars: 105, pinnacle: -113 },
    fairOdds: -104, trend: [-115, -112, -110, -108, -105, 100, 105],
  },
  {
    id: 'nfl-sf-sea-sea', sport: 'NFL', league: 'NFL',
    event: 'San Francisco 49ers vs. Seattle Seahawks', selection: 'Seattle Seahawks +3.5',
    market: 'Point spread', startsAt: '2026-10-25T00:20:00Z',
    odds: { draftkings: -110, fanduel: -112, betmgm: -115, caesars: -125, pinnacle: 103 },
    fairOdds: 104, trend: [-110, -108, -105, -102, 100, 101, 103],
  },
  {
    id: 'mlb-nyy-lad-nyy', sport: 'MLB', league: 'MLB',
    event: 'New York Yankees vs. Los Angeles Dodgers', selection: 'New York Yankees',
    market: 'Moneyline', startsAt: '2026-10-24T23:08:00Z',
    odds: { draftkings: 118, fanduel: 120, betmgm: 125, caesars: 115, pinnacle: 110 },
    fairOdds: 112, trend: [110, 112, 115, 113, 118, 122, 125],
  },
  {
    id: 'mlb-nyy-lad-lad', sport: 'MLB', league: 'MLB',
    event: 'New York Yankees vs. Los Angeles Dodgers', selection: 'Los Angeles Dodgers',
    market: 'Moneyline', startsAt: '2026-10-24T23:08:00Z',
    odds: { draftkings: -138, fanduel: -140, betmgm: -145, caesars: -135, pinnacle: -120 },
    fairOdds: -112, trend: [-140, -138, -135, -130, -125, -122, -120],
  },
  {
    id: 'mlb-nyy-lad-over', sport: 'MLB', league: 'MLB',
    event: 'New York Yankees vs. Los Angeles Dodgers', selection: 'Over 8.5',
    market: 'Total runs', startsAt: '2026-10-24T23:08:00Z',
    odds: { draftkings: 110, fanduel: 105, betmgm: 100, caesars: 108, pinnacle: 102 },
    fairOdds: 104, trend: [100, 102, 105, 103, 106, 108, 110],
  },
  {
    id: 'mlb-nyy-lad-under', sport: 'MLB', league: 'MLB',
    event: 'New York Yankees vs. Los Angeles Dodgers', selection: 'Under 8.5',
    market: 'Total runs', startsAt: '2026-10-24T23:08:00Z',
    odds: { draftkings: -130, fanduel: -125, betmgm: -120, caesars: -128, pinnacle: -112 },
    fairOdds: -104, trend: [-120, -122, -120, -118, -116, -115, -112],
  },
  {
    id: 'mlb-hou-phi-hou', sport: 'MLB', league: 'MLB',
    event: 'Houston Astros vs. Philadelphia Phillies', selection: 'Houston Astros +1.5',
    market: 'Run line', startsAt: '2026-10-25T00:08:00Z',
    odds: { draftkings: -142, fanduel: -138, betmgm: -145, caesars: -140, pinnacle: -150 },
    fairOdds: -148, trend: [-155, -152, -149, -145, -142, -140, -138],
  },
  {
    id: 'mlb-hou-phi-phi', sport: 'MLB', league: 'MLB',
    event: 'Houston Astros vs. Philadelphia Phillies', selection: 'Philadelphia Phillies -1.5',
    market: 'Run line', startsAt: '2026-10-25T00:08:00Z',
    odds: { draftkings: 122, fanduel: 118, betmgm: 125, caesars: 120, pinnacle: 138 },
    fairOdds: 148, trend: [125, 128, 130, 128, 132, 135, 138],
  },
  {
    id: 'nhl-nyr-bos-nyr', sport: 'NHL', league: 'NHL',
    event: 'New York Rangers vs. Boston Bruins', selection: 'New York Rangers',
    market: 'Moneyline', startsAt: '2026-10-24T23:00:00Z',
    odds: { draftkings: 115, fanduel: 118, betmgm: 110, caesars: 112, pinnacle: 108 },
    fairOdds: 106, trend: [105, 108, 110, 108, 112, 115, 118],
  },
  {
    id: 'nhl-nyr-bos-bos', sport: 'NHL', league: 'NHL',
    event: 'New York Rangers vs. Boston Bruins', selection: 'Boston Bruins',
    market: 'Moneyline', startsAt: '2026-10-24T23:00:00Z',
    odds: { draftkings: -135, fanduel: -138, betmgm: -130, caesars: -132, pinnacle: -118 },
    fairOdds: -106, trend: [-130, -128, -125, -123, -120, -119, -118],
  },
  {
    id: 'nhl-tor-edm-over', sport: 'NHL', league: 'NHL',
    event: 'Toronto Maple Leafs vs. Edmonton Oilers', selection: 'Over 6.5',
    market: 'Total goals', startsAt: '2026-10-25T01:00:00Z',
    odds: { draftkings: -105, fanduel: -110, betmgm: 102, caesars: -108, pinnacle: -115 },
    fairOdds: -108, trend: [-120, -118, -115, -110, -105, 100, 102],
  },
  {
    id: 'nhl-tor-edm-under', sport: 'NHL', league: 'NHL',
    event: 'Toronto Maple Leafs vs. Edmonton Oilers', selection: 'Under 6.5',
    market: 'Total goals', startsAt: '2026-10-25T01:00:00Z',
    odds: { draftkings: -115, fanduel: -110, betmgm: -122, caesars: -112, pinnacle: 105 },
    fairOdds: 108, trend: [-110, -108, -105, -102, 100, 102, 105],
  },
  {
    id: 'nhl-col-vgk-col', sport: 'NHL', league: 'NHL',
    event: 'Colorado Avalanche vs. Vegas Golden Knights', selection: 'Colorado Avalanche -1.5',
    market: 'Puck line', startsAt: '2026-10-25T02:00:00Z',
    odds: { draftkings: 185, fanduel: 190, betmgm: 180, caesars: 195, pinnacle: 178 },
    fairOdds: 180, trend: [175, 178, 180, 182, 185, 190, 195],
  },
  {
    id: 'nhl-col-vgk-vgk', sport: 'NHL', league: 'NHL',
    event: 'Colorado Avalanche vs. Vegas Golden Knights', selection: 'Vegas Golden Knights +1.5',
    market: 'Puck line', startsAt: '2026-10-25T02:00:00Z',
    odds: { draftkings: -225, fanduel: -230, betmgm: -220, caesars: -235, pinnacle: -198 },
    fairOdds: -180, trend: [-220, -215, -210, -208, -205, -200, -198],
  },
];

// User performance starts empty. The tracker populates from the user's own actions.
export const initialBets = [];

/** Exhaustive two-way sample markets; no draws or integer-line pushes. */
export const arbMarkets = [
  ['arb-nba-bos-lal', 'nba-bos-lal-bos', 'nba-bos-lal-lal'],
  ['arb-nba-nyk-mia-total', 'nba-nyk-mia-over', 'nba-nyk-mia-under'],
  ['arb-nfl-dal-phi-total', 'nfl-dal-phi-over', 'nfl-dal-phi-under'],
  ['arb-mlb-nyy-lad', 'mlb-nyy-lad-nyy', 'mlb-nyy-lad-lad'],
  ['arb-nhl-col-vgk-puck', 'nhl-col-vgk-col', 'nhl-col-vgk-vgk'],
].map(([id, idA, idB]) => {
  const a = markets.find(m => m.id === idA);
  const b = markets.find(m => m.id === idB);
  return {
    id, sport: a.sport, event: a.event, market: a.market,
    selectionA: a.selection, selectionB: b.selection,
    startsAt: a.startsAt, oddsA: { ...a.odds }, oddsB: { ...b.odds },
  };
});
