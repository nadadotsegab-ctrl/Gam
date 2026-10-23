import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { markets as sampleMarkets } from '../src/data/markets.js';

const navigation = page => page.getByRole('navigation', { name: 'Main navigation' });
const rows = page => page.locator('.odds-table tbody tr');

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.__ultraxErrors = errors;
  await page.goto('/#ev');
  await expect(page.getByRole('heading', { name: 'Positive EV.', exact: true })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.__ultraxErrors, 'No browser runtime or console errors').toEqual([]);
});

test('browse, paginate, search, and filter sportsbook markets', async ({ page }) => {
  await expect(rows(page)).toHaveCount(7);
  await page.screenshot({ path: '/tmp/ultrax-desktop.png', fullPage: true, animations: 'disabled' });
  const firstSelection = await rows(page).first().locator('.selection-button').innerText();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('Page 2');
  await expect(rows(page).first().locator('.selection-button')).not.toHaveText(firstSelection);
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();

  await page.locator('.sport-tabs').getByRole('button', { name: /NBA/ }).click();
  for (const row of await rows(page).all()) await expect(row.locator('.league-tag')).toHaveText('NBA');
  await page.getByRole('textbox', { name: 'Search markets', exact: true }).fill('Boston');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Boston Celtics');
  await page.getByRole('textbox', { name: 'Search markets', exact: true }).fill('no-such-team-123');
  await expect(page.getByRole('heading', { name: 'No matching opportunities' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(rows(page)).toHaveCount(7);

  await navigation(page).getByRole('button', { name: 'Odds screen', exact: true }).click();
  await expect(page.locator('.comparison-table thead .book-badge')).toHaveCount(5);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Sportsbook', exact: true }).selectOption('fanduel');
  await page.getByRole('combobox', { name: 'Minimum edge', exact: true }).selectOption('5');
  await expect(page.locator('.comparison-table tbody tr')).not.toHaveCount(0);
  for (const edge of await page.locator('.comparison-table tbody .edge-pill').allTextContents()) expect(Number.parseFloat(edge)).toBeGreaterThanOrEqual(5);
});

test('saved picks persist across navigation and reload', async ({ page }) => {
  const firstRow = rows(page).first();
  const selection = await firstRow.locator('.selection-button').innerText();
  await firstRow.getByRole('button', { name: `Save ${selection}`, exact: true }).click();
  await navigation(page).getByRole('button', { name: /^Saved picks/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(selection);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Saved picks.', exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole('button', { name: `Unsave ${selection}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A place for your next opportunity' })).toBeVisible();
});

test('type a stake, log a pick, settle profit, persist it, and export CSV', async ({ page }) => {
  const firstRow = rows(page).first();
  const selection = await firstRow.locator('.selection-button').innerText();
  const price = Number(await firstRow.locator('.best-price > strong').innerText());
  const stakeAmount = 125.5;
  const winProfit = stakeAmount * (price > 0 ? price / 100 : 100 / -price);
  const expectedProfit = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(winProfit);

  await firstRow.getByRole('button', { name: `View ${selection}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Opportunity details' });
  const stake = dialog.getByLabel('Stake ($)', { exact: true });
  await stake.fill('');
  await stake.pressSequentially('125.50');
  await expect(stake).toHaveValue('125.50');
  await expect(stake).toBeFocused();
  await dialog.getByRole('button', { name: 'Add to bet tracker', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigation(page).getByRole('button', { name: 'Bet tracker', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('$125.50');
  await page.getByRole('combobox', { name: `Result for ${selection}`, exact: true }).selectOption('won');
  await expect(page.locator('.stat-card').filter({ hasText: 'Net profit' }).locator('.stat-value')).toHaveText(expectedProfit);
  await expect(rows(page).first().locator('td').nth(5)).toHaveText(expectedProfit);
  await page.reload();
  await expect(page.getByRole('combobox', { name: `Result for ${selection}`, exact: true })).toHaveValue('won');
  await expect(page.locator('.stat-card').filter({ hasText: 'Net profit' }).locator('.stat-value')).toHaveText(expectedProfit);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('ultrax-bets.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Event,Selection,Sportsbook,American odds,Stake USD,Status,Profit USD,Source');
  expect(csv).toContain(selection);
  expect(csv).toContain(',125.5,won,');
});

test('manual journal entries support loss, void, and deletion', async ({ page }) => {
  await navigation(page).getByRole('button', { name: 'Bet tracker', exact: true }).click();
  await page.getByRole('button', { name: 'Add a bet', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add a bet', exact: true });
  await dialog.getByLabel('Event', { exact: true }).fill('Example home vs away');
  await dialog.getByLabel('Selection', { exact: true }).fill('Example home -2.5');
  await dialog.getByLabel('American odds', { exact: true }).fill('-110');
  await dialog.getByLabel('Stake ($)', { exact: true }).fill('50');
  await dialog.getByRole('button', { name: 'Save to bet tracker', exact: true }).click();
  const result = page.getByRole('combobox', { name: 'Result for Example home -2.5', exact: true });
  await result.selectOption('lost');
  await expect(page.locator('.stat-card').filter({ hasText: 'Net profit' }).locator('.stat-value')).toHaveText('-$50.00');
  await result.selectOption('void');
  await expect(page.locator('.stat-card').filter({ hasText: 'Net profit' }).locator('.stat-value')).toHaveText('$0.00');
  await page.getByRole('button', { name: 'Delete Example home -2.5', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep bet', exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Delete Example home -2.5', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove bet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Every edge starts with a first bet' })).toBeVisible();
});

test('arbitrage breakdown and all calculators produce usable results and validation', async ({ page }) => {
  await navigation(page).getByRole('button', { name: 'Arbitrage', exact: true }).click();
  await expect(page.locator('.arb-card')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Calculate', exact: true }).first().click();
  const arbDialog = page.getByRole('dialog', { name: 'Arbitrage breakdown' });
  const totalStake = arbDialog.getByLabel('Total stake ($)', { exact: true });
  await totalStake.fill('');
  await totalStake.pressSequentially('1000');
  await expect(totalStake).toHaveValue('1000');
  await expect(totalStake).toBeFocused();
  await expect(arbDialog.locator('.arb-breakdown > div')).toHaveCount(2);
  await arbDialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await navigation(page).getByRole('button', { name: 'Calculators', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Arbitrage results' })).toContainText('$11.75');
  await page.getByRole('textbox', { name: /^Outcome A odds/ }).fill('0');
  await expect(page.getByRole('region', { name: 'Arbitrage results' })).toContainText('American odds cannot be zero.');

  await page.getByRole('button', { name: 'Expected value', exact: true }).click();
  const evResult = page.getByRole('region', { name: 'Expected value results' });
  await expect(evResult).toContainText('+10.00%');
  await expect(evResult).toContainText('$52.08');
  await page.getByRole('textbox', { name: /^Estimated win probability/ }).fill('101');
  await expect(evResult).toContainText('Win probability must be between 0 and 1.');
  await page.getByRole('textbox', { name: /^Estimated win probability/ }).fill('50');
  await page.getByRole('textbox', { name: /^Offered odds/ }).fill('-200');
  await expect(evResult).toContainText('-25.00%');
  await expect(evResult).toContainText('$0.00');

  await page.getByRole('button', { name: 'Odds converter', exact: true }).click();
  const converterResult = page.getByRole('region', { name: 'Odds conversion results' });
  await expect(converterResult).toContainText('40.00%');
  await expect(converterResult).toContainText('2.500');
  await page.getByRole('button', { name: 'Decimal', exact: true }).click();
  await page.getByRole('textbox', { name: /^Decimal odds/ }).fill('1');
  await expect(converterResult).toContainText('Decimal odds must be greater than 1.');
});

test('workspace preferences and snapshot download/import persist, and invalid JSON is rejected', async ({ page }) => {
  await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
  await page.getByLabel('Workspace name', { exact: true }).fill('UltraX Studio');
  await page.getByLabel('Research bankroll ($)', { exact: false }).fill('5000');
  await page.getByRole('combobox', { name: 'Display odds as', exact: true }).selectOption('decimal');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue('UltraX Studio');
  await expect(page.getByLabel('Research bankroll ($)', { exact: false })).toHaveValue('5000');
  await expect(page.getByRole('combobox', { name: 'Display odds as', exact: true })).toHaveValue('decimal');
  await expect(page.locator('.brand')).toContainText('UltraX Studio');
  await navigation(page).getByRole('button', { name: 'Positive EV', exact: false }).click();
  await expect(rows(page).first().locator('.best-price > strong')).toHaveText(/^\d+\.\d{2}$/);

  await page.getByRole('button', { name: 'Data source', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fetch current odds', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Add ODDS_API_KEY securely');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download example schema', exact: true }).click();
  const example = await downloadEvent;
  const schema = await readFile(await example.path());
  expect(JSON.parse(schema.toString()).markets.length).toBeGreaterThan(0);
  await page.locator('input[type="file"]').setInputFiles({ name: 'markets.json', mimeType: 'application/json', buffer: schema });
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.source-notice')).toContainText('Imported snapshot');
  await page.reload();
  await expect(page.locator('.source-notice')).toContainText('Imported snapshot');
  await page.getByRole('button', { name: 'Data source', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toContainText('Import is not valid JSON.');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('mobile view contains its layout and supports navigation and calculator input', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
  await expect.poll(async () => { const box = await page.locator('.sidebar').boundingBox(); return box ? box.x + box.width : Infinity; }).toBeLessThanOrEqual(0);
  await page.screenshot({ path: '/tmp/ultrax-mobile.png', fullPage: true, animations: 'disabled' });
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.viewport);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await navigation(page).getByRole('button', { name: 'Calculators', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calculators.', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await page.getByRole('textbox', { name: /^Total stake/ }).fill('250');
  await expect(page.getByRole('region', { name: 'Arbitrage results' })).toContainText('$2.94');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('server exposes a JSON status and a safe missing-credentials response', async ({ request }) => {
  const status = await request.get('/api/odds/status');
  expect(status.status()).toBe(200);
  expect(status.headers()['content-type']).toContain('application/json');
  expect(await status.json()).toEqual({ configured: false });

  const response = await request.get('/api/odds?sport=NBA');
  expect(response.status()).toBe(503);
  expect(response.headers()['content-type']).toContain('application/json');
  const payload = await response.json();
  expect(Object.keys(payload)).toEqual(['error']);
  expect(payload.error).toContain('Live odds are not configured.');
  expect(payload.error).not.toMatch(/apiKey=|https?:\/\//);
});

test('a mocked provider snapshot loads and refreshes without relabeling sample arbitrage', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/odds/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/odds?sport=NBA', route => {
    requests += 1;
    return route.fulfill({ json: {
      markets: sampleMarkets.slice(0, 2),
      source: 'The Odds API',
      sport: 'NBA',
      updatedAt: '2026-10-23T22:00:00Z',
    } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Data source', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fetch current odds', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Fetch current odds', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.source-notice')).toContainText('Provider snapshot');
  await expect(page.locator('.source-notice')).toContainText('The Odds API');
  await expect(page.locator('.source-notice')).not.toContainText('Demo workspace');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Refresh odds', exact: true }).click();
  await expect.poll(() => requests).toBe(2);

  await page.reload();
  await expect(page.locator('.source-notice')).toContainText('Provider snapshot');
  await navigation(page).getByRole('button', { name: 'Arbitrage', exact: true }).click();
  await expect(page.locator('.source-notice')).toContainText('Sample arbitrage markets');
  await expect(page.locator('.source-notice')).not.toContainText('Provider snapshot');
  await expect(page.locator('.arb-card')).not.toHaveCount(0);
});
