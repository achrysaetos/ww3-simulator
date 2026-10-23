// Starts a game the way a returning player does: tour already taken, crises left to the Daily Brief.
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
  // The Daily Brief opens whenever an urgent decision arrives, even with the clock stopped, and would swallow the next click.
  await page.addLocatorHandler(page.locator('[data-testid="daily-brief"]'), () => closeBrief(page));
  return { page, errors };
}

/** Closes the Daily Brief if it is open. Keyboard shortcuts are ignored under it, so call this before pressing one. */
export async function closeBrief(page) {
  const brief = page.locator('[data-testid="daily-brief"]');
  if (!(await brief.count())) return;
  // Esc rather than a click: a click on the brief would re-enter the locator handler that newGame installs.
  await page.keyboard.press('Escape');
  await brief.waitFor({ state: 'detached', timeout: 10_000 });
}

/** Runs the clock to `tick` and pauses with no brief open. `onBrief` sees each Daily Brief before it is closed. */
export async function runTo(page, tick, { speed = 20, onBrief = async () => {} } = {}) {
  for (;;) {
    if (await page.locator('[data-testid="daily-brief"]').count()) {
      await onBrief(await page.evaluate(() => window.__client.state.tick));
      await closeBrief(page);
      continue;
    }
    if ((await page.evaluate(() => window.__client.state.tick)) >= tick) break;
    await page.evaluate((v) => window.__client.ticksPerSec || window.__client.setSpeed(v), speed);
    await page.waitForFunction((t) => window.__client.state.tick >= t || document.querySelector('[data-testid="daily-brief"]'), tick, { timeout: 900_000 });
  }
  await page.evaluate(() => window.__client.setSpeed(0));
  await closeBrief(page);
}
