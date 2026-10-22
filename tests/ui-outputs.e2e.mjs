// Drives the built game in headless Chromium to the War Cost drawer: start a scenario, run the
// clock for a month, press C, and screenshot each tab at 1440x900.
//   npm run build && npx vite preview --port 4520 &
//   node tests/ui-outputs.e2e.mjs http://localhost:4520/ <outDir> [ukraine-2026:UKR ...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const [, , url, out, ...plays] = process.argv;
fs.mkdirSync(out, { recursive: true });
const TICKS = Number(process.env.TICKS ?? 120);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

for (const play of plays.length ? plays : ['ukraine-2026:UKR']) {
  const [scenario, nation] = play.split(':');
  const tag = `${scenario}-${nation}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.click(`[data-testid="scenario-${scenario}"]`, { timeout: 60_000 });
  await page.selectOption('[data-testid="nation-select"]', nation);
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="shell"]', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Take command' }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.__map && window.__client?.state.formations.length > 0, null, { timeout: 120_000 });

  for (;;) {
    const s = await page.evaluate(() => ({ tick: window.__client.state.tick, brief: !!document.querySelector('[data-testid="daily-brief"]') }));
    if (s.brief) {
      await page.click('[data-testid="brief-close"]');
      continue;
    }
    if (s.tick >= TICKS) break;
    await page.evaluate(() => window.__client.ticksPerSec || window.__client.setSpeed(20));
    await page.waitForFunction(([t]) => window.__client.state.tick >= t || document.querySelector('[data-testid="daily-brief"]'), [TICKS], { timeout: 900_000 });
  }
  await page.evaluate(() => window.__client.setSpeed(0));
  await page.waitForFunction(() => !window.__map.animating, null, { timeout: 120_000 });

  await page.keyboard.press('c');
  await page.waitForSelector('[data-testid="outputs-panel"]', { timeout: 10_000 });
  check(true, `${tag}: C opens the War cost drawer`);
  check((await page.locator('[data-testid="outputs-row"]').count()) === 6, `${tag}: six human-cost rows, your side against the enemy`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, `cost-${tag}.png`) });

  await page.click('[data-testid="outputs-tab-race"]');
  check(await page.locator('[data-testid="race-shells"]').count() === 1, `${tag}: production race shows shells`);
  check(await page.locator('[data-testid="runway"]').count() > 0, `${tag}: own stocks show a runway`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `race-${tag}.png`) });

  await page.click('[data-testid="outputs-tab-lifelines"]');
  check(await page.locator('[data-testid^="workaround-"]').count() > 0, `${tag}: lifelines list each side's workarounds`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `lifelines-${tag}.png`) });

  await page.keyboard.press('c');
  check(await page.locator('[data-testid="outputs-panel"]').count() === 0, `${tag}: C again closes it`);
  check(!errors.length, `${tag}: no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await page.close();
}

await browser.close();
console.log(failures.length ? `${failures.length} checks failed` : 'all checks passed');
process.exit(failures.length ? 1 : 0);
