// Drives the built game in headless Chromium the way a player does: start a scenario from the
// start screen, run the clock, answer the Daily Brief when it opens, open every drawer, and save
// screenshots of the main screen and the brief. Also checks that everything the old panels
// offered is still reachable.
//   npm run build && npx vite preview --port 4173 &
//   node tests/ui-shell.e2e.mjs http://localhost:4173/ <outDir> [ukraine-2026:UKR ww3-2027:USA ...]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { closeBrief, newGame, runTo } from './e2e-start.mjs';

const [, , url, out, ...plays] = process.argv;
fs.mkdirSync(out, { recursive: true });
const TICKS = Number(process.env.TICKS ?? 40);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

for (const play of plays.length ? plays : ['ukraine-2026:UKR', 'ww3-2027:USA', 'ww3-2027:RUS']) {
  const [scenario, nation] = play.split(':');
  const tag = `${scenario}-${nation}`;
  const { page, errors } = await newGame(browser, url, scenario, nation);
  await page.waitForFunction(() => window.__map && window.__client?.state.formations.length > 0, null, { timeout: 120_000 });

  let briefShot = false;
  await runTo(page, TICKS, {
    onBrief: async (tick) => {
      if (briefShot) return;
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, `brief-${tag}.png`) });
      briefShot = true;
      const items = await page.locator('[data-testid="brief-item"]').count();
      console.log(`${tag}: brief opened at tick ${tick} with ${items} decisions`);
    },
  });
  await page.waitForFunction(() => !window.__map.animating, null, { timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `main-${tag}.png`) });
  console.log(`${tag}: main at tick ${await page.evaluate(() => window.__client.state.tick)}`);

  // Everything the old panels offered stays reachable.
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  check(await has('[data-testid="war-room"]') && await has('[data-testid="staff-panel"]') && await has('[data-testid="operations"]') && await has('[data-testid="ticker"]'), `${tag}: shell panels present`);
  check(await has('[data-testid="zoom-world"]') && await has('[data-testid="zoom-front"]'), `${tag}: World / Theatre / Front view switch`);
  await closeBrief(page);
  await page.keyboard.press('f');
  check(await has('[data-testid="drawer-panel-forces"] [data-testid="oob-item"]'), `${tag}: F opens the order of battle`);
  await page.locator('[data-testid="oob-item"]').first().click();
  await page.waitForSelector('[data-testid="formation-name"]', { timeout: 10_000 }).catch(() => {});
  check(await has('[data-testid="formation-name"]') && await has('[data-testid^="posture-"]'), `${tag}: picking a unit shows its orders`);
  await closeBrief(page);
  await page.keyboard.press('n');
  check(await has('[data-testid="nation-panel"]') && !(await has('[data-testid^="delegate-"]')) && await has('[data-testid="staff-land"]'), `${tag}: N opens the nation drawer; delegation lives only on the staff panel`);
  await closeBrief(page);
  await page.keyboard.press('l');
  check(await has('[data-testid="event-log"]'), `${tag}: L opens the event log`);
  await page.keyboard.press('Escape');
  check(!(await has('[data-testid^="drawer-panel-"]')), `${tag}: Esc closes the drawer`);
  await page.click('[data-testid="game-menu"]');
  check(await has('[data-testid="menu-quicksave"]') && await has('[data-testid="menu-quit"]') && await has('[data-testid="menu-briefing"]'), `${tag}: game menu has save, briefing and quit`);
  await page.click('[data-testid="game-menu"]');
  await page.click('[data-testid="layers"]');
  check(await has('.ww-popover input[type="checkbox"]'), `${tag}: map layers toggle`);
  await page.click('[data-testid="layers"]');
  await closeBrief(page);
  await page.keyboard.press('b');
  check(await has('[data-testid="daily-brief"]'), `${tag}: B opens the Daily Brief`);
  if (!briefShot) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `brief-${tag}.png`) });
  }
  await page.keyboard.press('Escape');
  check(!(await has('[data-testid="daily-brief"]')), `${tag}: Esc closes the brief`);

  // A domain toggle answers at once and the engine confirms it on the next tick.
  const before = await page.evaluate(() => window.__client.state.focusNation?.authority.ai.naval);
  await page.click('[data-testid="staff-naval"]');
  await page.click('[data-testid="step"]');
  await page.waitForFunction((b) => window.__client.state.focusNation?.authority.ai.naval === !b, before, { timeout: 60_000 });
  check(true, `${tag}: staff toggle for the navy reached the engine`);
  await page.click('[data-testid="staff-naval"]');
  await page.click('[data-testid="step"]');
  await page.waitForFunction((b) => window.__client.state.focusNation?.authority.ai.naval === b, before, { timeout: 60_000 });

  check(!errors.length, `${tag}: no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.log(`${failures.length} checks failed`);
  process.exit(1);
}
console.log('all checks passed');
