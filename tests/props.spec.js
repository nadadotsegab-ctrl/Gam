import { test, expect } from '@playwright/test';

const NOW = new Date('2026-10-23T18:00:00.000Z');
const ISO = NOW.toISOString();
const DAY = '2026-10-23';
const soccerLeagues = [{ key: 'soccer_epl', title: 'English Premier League' }];
const pickCards = page => page.getByTestId('prop-card');

function pick(overrides = {}) {
  return {
    id: 'nba-tatum-points-over', sport: 'NBA', eventId: 'nba-game',
    event: 'Boston Celtics vs. New York Knicks', player: 'Jayson Tatum',
    marketKey: 'player_points', marketLabel: 'Points', line: 24.5,
    side: 'Over', selection: 'Jayson Tatum Over 24.5 Points',
    startsAt: '2026-10-23T22:00:00.000Z', book: 'draftkings', odds: 120,
    fairProbability: 0.5, ev: 10, referenceBooks: ['fanduel', 'betmgm'],
    referenceCount: 2, priceUpdatedAt: ISO, referenceUpdatedAt: ISO,
    ...overrides,
  };
}

const fixtures = {
  NBA: [pick(), pick({ id: 'nba-booker-assists-under', eventId: 'nba-second', event: 'Phoenix Suns vs. Denver Nuggets', player: 'Devin Booker', marketKey: 'player_assists', marketLabel: 'Assists', line: 5.5, side: 'Under', selection: 'Devin Booker Under 5.5 Assists', book: 'fanduel', odds: 105, fairProbability: 0.51, ev: 4.55, referenceBooks: ['draftkings', 'betmgm'] })],
  NFL: [pick({ id: 'nfl-mahomes-passing-over', sport: 'NFL', eventId: 'nfl-game', event: 'Kansas City Chiefs vs. Buffalo Bills', player: 'Patrick Mahomes', marketKey: 'player_pass_yds', marketLabel: 'Passing yards', line: 250.5, selection: 'Patrick Mahomes Over 250.5 Passing yards', ev: 8, odds: 116 })],
  SOCCER: [pick({ id: 'soccer-haaland-shots-over', sport: 'SOCCER', eventId: 'soccer-game', event: 'Manchester City vs. Arsenal', player: 'Erling Haaland', marketKey: 'player_shots_on_target', marketLabel: 'Shots on target', line: 2.5, selection: 'Erling Haaland Over 2.5 Shots on target', ev: 6, odds: 112, league: 'English Premier League' })],
};

function snapshot(sport, overrides = {}) {
  return {
    picks: fixtures[sport] || [], sport, day: DAY, timeZone: 'America/Denver',
    source: 'The Odds API', fetchedAt: ISO,
    expiresAt: '2026-10-23T18:05:00.000Z', eventsScanned: 1,
    eventsAvailable: 1, complete: true, warnings: [],
    method: 'Leave-one-book-out no-vig consensus', minReferences: 2,
    ...(sport === 'SOCCER' ? { league: 'soccer_epl' } : {}), ...overrides,
  };
}

async function mockProps(page, { configured = true, responseFor, onRequest } = {}) {
  await page.route('**/api/props/status', route => route.fulfill({
    json: { configured, supportedSports: ['NBA', 'NFL', 'SOCCER'], soccerLeagues },
  }));
  await page.route('**/api/props/leagues*', route => route.fulfill({ json: { configured, soccerLeagues } }));
  await page.route(/\/api\/props\?/, async route => {
    const url = new URL(route.request().url());
    const sport = url.searchParams.get('sport');
    onRequest?.(url);
    if (responseFor) return responseFor(route, sport, url);
    return route.fulfill({ json: snapshot(sport) });
  });
}

async function openProps(page) {
  await page.goto('/#props');
  await expect(page.getByRole('heading', { name: 'Daily props.', exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.__propsErrors = [];
  page.on('pageerror', error => page.__propsErrors.push(error.message));
  await page.clock.install({ time: NOW });
});

test.afterEach(async ({ page }) => {
  expect(page.__propsErrors, 'Daily props has no browser runtime errors').toEqual([]);
});

test('the actual player-props API reports missing data access as JSON', async ({ request }) => {
  const status = await request.get('/api/props/status');
  expect(status.status()).toBe(200);
  expect(status.headers()['content-type']).toContain('application/json');
  const configuration = await status.json();
  expect(configuration.configured).toBe(false);
  expect(configuration.supportedSports).toEqual(['NBA', 'NFL', 'SOCCER']);
  expect(configuration.requiresPlayerPropPlan).toBe(true);
  const scan = await request.get('/api/props?sport=NBA&timeZone=America/Denver');
  expect(scan.status()).toBe(503);
  expect(scan.headers()['content-type']).toContain('application/json');
  const unavailable = await scan.json();
  expect(unavailable.error).toContain('ODDS_API_KEY');
  expect(unavailable.error).toContain('player-prop');
  expect(unavailable).not.toHaveProperty('picks');
});

test('missing player-prop credentials show setup instead of fabricated daily picks', async ({ page }) => {
  let scans = 0;
  await mockProps(page, { configured: false, onRequest: () => scans++ });
  await openProps(page);
  await expect(page.getByText(/data not connected/i).first()).toBeVisible();
  await expect(page.getByText(/ODDS_API_KEY/).first()).toBeVisible();
  await expect(pickCards(page)).toHaveCount(0);
  expect(scans).toBe(0);
  await expect(page.getByRole('button', { name: 'Check connection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Check connection', exact: true }).click();
  await expect(pickCards(page)).toHaveCount(0);
  expect(scans).toBe(0);
});

test('daily board scans NBA, NFL and soccer then filters the real snapshot', async ({ page }) => {
  const requests = [];
  await mockProps(page, { onRequest: url => requests.push(url) });
  await openProps(page);
  await expect(pickCards(page)).toHaveCount(4);
  expect(new Set(requests.map(url => url.searchParams.get('sport')))).toEqual(new Set(['NBA', 'NFL', 'SOCCER']));
  for (const url of requests) expect(url.searchParams.get('timeZone')).toBe('America/Denver');
  await page.screenshot({ path: '/tmp/ultrax-daily-props.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('textbox', { name: 'Search player props', exact: true }).fill('Mahomes');
  await expect(pickCards(page)).toHaveCount(1);
  await expect(pickCards(page).first()).toContainText('Patrick Mahomes');
  await page.getByRole('textbox', { name: 'Search player props', exact: true }).fill('');
  await page.getByRole('combobox', { name: 'Sport', exact: true }).selectOption('NBA');
  await expect(pickCards(page)).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Sportsbook', exact: true }).selectOption('draftkings');
  await expect(pickCards(page)).toHaveCount(1);
  await expect(pickCards(page).first()).toContainText('Jayson Tatum');
  await page.getByRole('combobox', { name: 'Sportsbook', exact: true }).selectOption('all');
  await page.getByRole('combobox', { name: 'Minimum EV', exact: true }).selectOption('5');
  await expect(pickCards(page)).toHaveCount(1);
});

test('a daily prop exposes its reference and can be logged in the existing bet journal', async ({ page }) => {
  await mockProps(page);
  await openProps(page);
  await expect(pickCards(page)).toHaveCount(4);
  const card = pickCards(page).filter({ hasText: 'Jayson Tatum' });
  await card.getByRole('button', { name: /view|details|inspect/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Player prop details', exact: true });
  await expect(dialog).toContainText('Jayson Tatum');
  const reference = dialog.locator('.prop-reference-detail p').first();
  await expect(reference).toContainText('FanDuel, BetMGM');
  await expect(reference).not.toContainText('DraftKings');
  await dialog.getByLabel('Stake ($)', { exact: true }).fill('25');
  await dialog.getByRole('button', { name: 'Add to bet tracker', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Bet tracker', exact: true }).click();
  const row = page.locator('.tracker-table tbody tr').filter({ hasText: 'Jayson Tatum' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('$25.00');
  await expect(row).toContainText(/provider|prop|odds api/i);
  await page.reload();
  await expect(row).toHaveCount(1);
});

test('started and stale props never appear as actionable daily opportunities', async ({ page }) => {
  await mockProps(page, { responseFor: (route, sport) => route.fulfill({ json: snapshot(sport, {
    picks: sport === 'NBA' ? [
      pick(),
      pick({ id: 'already-started', player: 'Started Player', startsAt: '2026-10-23T17:30:00.000Z' }),
      pick({ id: 'stale-price', player: 'Stale Player', priceUpdatedAt: '2026-10-23T17:40:00.000Z' }),
      pick({ id: 'old-reference', player: 'Old Reference Player', referenceUpdatedAt: '2026-10-23T17:40:00.000Z' }),
    ] : [],
  }) }) });
  await openProps(page);
  await expect(pickCards(page)).toHaveCount(1);
  await expect(pickCards(page).first()).toContainText('Jayson Tatum');
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(pickCards(page)).toHaveCount(0);
});

test('partial scans and provider failures are disclosed without invented replacements', async ({ page }) => {
  await mockProps(page, { responseFor: (route, sport) => sport === 'NBA'
    ? route.fulfill({ json: snapshot(sport, { complete: false, warnings: ['Only some NBA events could be scanned.'] }) })
    : route.fulfill({ status: 502, json: { error: 'Provider plan does not include these player props.' } }) });
  await openProps(page);
  await expect(pickCards(page)).toHaveCount(2);
  await expect(page.locator('.props-scan-warning')).toContainText('not a complete view');
  await expect(page.getByText(/Provider plan does not include/).first()).toBeVisible();
  await expect(page.getByText(/Only some NBA events/).first()).toBeVisible();
});

test('refreshing a changed price cannot log an older quote from an open detail dialog', async ({ page }) => {
  let refreshed = false;
  let nbaRequests = 0;
  await mockProps(page, { responseFor: (route, sport) => {
    if (sport === 'NBA') nbaRequests++;
    const fetchedAt = refreshed ? '2026-10-23T18:05:00.000Z' : ISO;
    const expiresAt = refreshed ? '2026-10-23T18:10:00.000Z' : '2026-10-23T18:05:00.000Z';
    const picks = fixtures[sport].map(record => ({ ...record,
      odds: refreshed && record.id === 'nba-tatum-points-over' ? 130 : record.odds,
      ev: refreshed && record.id === 'nba-tatum-points-over' ? 15 : record.ev,
      priceUpdatedAt: fetchedAt, referenceUpdatedAt: fetchedAt,
    }));
    return route.fulfill({ json: snapshot(sport, { picks, fetchedAt, expiresAt }) });
  } });
  await openProps(page);
  await expect(pickCards(page)).toHaveCount(4);
  await page.getByRole('checkbox', { name: /Auto-refresh every 5 minutes/ }).check();
  await pickCards(page).filter({ hasText: 'Jayson Tatum' }).getByRole('button', { name: /view prop/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Player prop details', exact: true });
  await expect(dialog.locator('.prop-detail-price')).toContainText('+120');
  const previousRequests = nbaRequests;
  refreshed = true;
  await page.clock.fastForward(5 * 60 * 1000);
  await expect.poll(() => nbaRequests).toBeGreaterThan(previousRequests);
  await expect(pickCards(page).filter({ hasText: 'Jayson Tatum' }).locator('.prop-price-row')).toContainText('+130');
  // The original quote can stay visible for comparison, but it must not be
  // treated as the freshly fetched quote merely because its pick id matches.
  await expect(dialog.getByRole('button', { name: 'Add to bet tracker', exact: true })).toBeDisabled();
});

test('daily props fit a mobile viewport and let the user inspect a pick', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProps(page);
  await openProps(page);
  await expect(pickCards(page)).toHaveCount(4);
  await page.screenshot({ path: '/tmp/ultrax-daily-props-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await pickCards(page).first().getByRole('button', { name: /view|details|inspect/i }).click();
  await expect(page.getByRole('dialog', { name: 'Player prop details', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
