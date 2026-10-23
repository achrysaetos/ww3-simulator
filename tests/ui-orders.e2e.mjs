// Orders the nation panel gives: passage for a friendly neighbour's troops. Drag orders on the map are in ui-drag.e2e.mjs.
//   npm run build && npx vite preview --port 4650 &
//   node tests/ui-orders.e2e.mjs http://localhost:4650/ <outDir> [scenario:NATION]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { newGame, runTo } from './e2e-start.mjs';

const [, , url, out, play = 'ukraine-2026:UKR'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const [scenario, nation] = play.split(':');
const TICKS = Number(process.env.TICKS ?? 8);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const { page, errors } = await newGame(browser, url, scenario, nation, { role: 'brigade' });
await page.waitForFunction(() => window.__map && window.__client?.state.formations.length > 0, null, { timeout: 120_000 });
await runTo(page, TICKS);

await page.click('[data-testid="drawer-nation"]');
const other = await page.evaluate(() => [...document.querySelectorAll('[data-testid="diplo-target"] option')].map((o) => o.value).find((v) => v === 'POL') ?? '');
await page.selectOption('[data-testid="diplo-target"]', other);
check(await page.isEnabled('[data-testid="grant-access"]'), 'Grant passage can be given to a friendly neighbour');
await page.click('[data-testid="grant-access"]');
await page.click('[data-testid="step"]');
await page.waitForFunction(() => document.querySelector('[data-testid="access-status"]'), null, { timeout: 30_000 }).catch(() => {});
check((await page.textContent('[data-testid="grant-access"]')) === 'Close borders', 'the engine applied the passage');
await page.screenshot({ path: path.join(out, 'grant-access.png') });

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('all passed');
