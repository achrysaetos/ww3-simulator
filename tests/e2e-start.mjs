// Starts a game the way a returning player does: tour already taken, crises left to the staff's recommendation.
export async function newGame(browser, url, scenario, nation, { role = 'cinc' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('ww3.coach', 'done');
    localStorage.setItem('ww3.crises', 'off');
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g/.test(m.text()) && errors.push(m.text()));
  await page.goto(url);
  await page.click(`[data-testid="scenario-${scenario}"]`, { timeout: 60_000 });
  if (await page.locator(`[data-testid="pick-${nation}"]`).count()) await page.click(`[data-testid="pick-${nation}"]`);
  else {
    await page.click('[data-testid="nation-search-open"]');
    await page.fill('[data-testid="nation-search"]', nation);
    await page.click(`[data-testid="search-${nation}"]`);
  }
  await page.click(`[data-testid="start-role-${role}"]`);
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="shell"]', { timeout: 120_000 });
  await page.click('[data-testid="briefing-close"]', { timeout: 60_000 });
  return { page, errors };
}

/** Runs the clock to `tick` and pauses. */
export async function runTo(page, tick, { speed = 20 } = {}) {
  if ((await page.evaluate(() => window.__client.state.tick)) < tick) {
    await page.evaluate((v) => window.__client.setSpeed(v), speed);
    await page.waitForFunction((t) => window.__client.state.tick >= t, tick, { timeout: 900_000 });
  }
  await page.evaluate(() => window.__client.setSpeed(0));
}
