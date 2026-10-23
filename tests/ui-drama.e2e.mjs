// The first five minutes, played in headless Chromium the way a player does: the title screen,
// a role pick, the opening title and situation report, the tour, a treaty-call crisis answered
// with its result shown, and a nuclear moment. Saves a screenshot of each at 1440x900.
//   npm run build && npx vite preview --port 4611 &
//   node tests/ui-drama.e2e.mjs http://localhost:4611/ <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const [, , url, out] = process.argv;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
/** Swiftshader frames take seconds, so timed overlays are held on a paused page clock while they are shot. */
async function holdClock(page) {
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
}

/** A fresh page; `seen` marks the tour as already taken, as for a returning player. */
async function open({ seen = true, crises = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(([s, c]) => {
    if (s) localStorage.setItem('ww3.coach', 'done');
    if (!c) localStorage.setItem('ww3.autoAccept', 'on');
  }, [seen, crises]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g/.test(m.text()) && errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector('[data-testid="start-screen"] [data-testid^="scenario-"]', { timeout: 60_000 });
  return { page, errors, close: () => ctx.close() };
}

async function pick(page, scenario, nation, role) {
  await page.click(`[data-testid="scenario-${scenario}"]`, { timeout: 60_000 });
  if (await page.locator(`[data-testid="pick-${nation}"]`).count()) await page.click(`[data-testid="pick-${nation}"]`);
  else {
    await page.click('[data-testid="nation-search-open"]');
    await page.fill('[data-testid="nation-search"]', nation);
    await page.click(`[data-testid="search-${nation}"]`);
  }
  await page.click(`[data-testid="start-role-${role}"]`);
}

async function begin(page) {
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="shell"]', { timeout: 120_000 });
}

// 1. Title screen, then a role picked, then the opening and the tour, as a first-time player.
{
  const { page, errors, close } = await open({ seen: false });
  await page.waitForTimeout(2500);
  await shot(page, 'start');
  check(await page.locator('[data-testid^="scenario-"]').count() >= 8, 'start: every scenario is listed');
  await pick(page, 'ww3-2027', 'USA', 'marshal');
  await page.click('[data-testid="nation-search-open"]');
  await page.fill('[data-testid="nation-search"]', 'Kor');
  await page.waitForTimeout(1800);
  await shot(page, 'start-role');
  await page.keyboard.press('Escape');
  check(await page.locator('[data-testid="start-role-marshal"][aria-checked="true"]').count() === 1, 'start: Field Marshal is the chosen role');

  await pick(page, 'ukraine-2026', 'UKR', 'cinc');
  await begin(page);
  check(await page.waitForSelector('.op-title.go', { timeout: 30_000 }).then(() => true, () => false), 'opening: the title beat plays');
  await page.waitForSelector('[data-testid="briefing"]', { timeout: 30_000 });
  await page.waitForFunction(() => !window.__map?.animating, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, 'opening-situation');
  const facts = await page.locator('[data-testid="briefing"]').innerText();
  check(/RUSSIA/i.test(facts) && /formations/i.test(facts), 'opening: the report names the enemy and counts our forces');
  check(await page.evaluate(() => window.__client.state.tick) === 1, 'opening: the first turn ran under the title');
  await page.click('[data-testid="briefing-close"]');
  await page.waitForSelector('[data-testid="coach"]', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await shot(page, 'coach-1');
  let steps = 1;
  while (await page.locator('[data-testid="coach-next"]').count()) {
    if (steps === 2) await shot(page, 'coach-2');
    await page.click('[data-testid="coach-next"]');
    await page.waitForTimeout(250);
    steps++;
  }
  check(steps >= 5, `coach: the tour ran ${steps - 1} steps`);
  check(await page.evaluate(() => localStorage.getItem('ww3.coach')) === 'done', 'coach: finishing the tour is remembered');
  check(!errors.length, `first session: no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);

  // The same browser again: the tour does not come back.
  await page.evaluate(() => window.__client.quit());
  await page.waitForSelector('[data-testid="start-screen"]', { timeout: 60_000 });
  await pick(page, 'ukraine-2026', 'UKR', 'brigade');
  await begin(page);
  await page.waitForSelector('[data-testid="briefing"]', { timeout: 30_000 });
  await page.click('[data-testid="briefing-close"]');
  await page.waitForTimeout(1500);
  check(await page.locator('[data-testid="coach"]').count() === 0, 'coach: shown once, not on the next game');
  const ai = await page.evaluate(() => window.__client.state.focusNation.authority.ai);
  check(!ai.land && !ai.air && !ai.naval && !ai.homefront, 'start: Every Brigade took every domain from the staff');
  await close();
}

// The title beat, held on a paused clock for its picture.
{
  const { page, close } = await open();
  await pick(page, 'ukraine-2026', 'UKR', 'cinc');
  await holdClock(page);
  await begin(page);
  await page.waitForSelector('[data-testid="opening-title"]', { timeout: 30_000 });
  await page.clock.runFor(100);
  await page.waitForSelector('.op-title.go', { timeout: 30_000 });
  await page.waitForTimeout(2000);
  await shot(page, 'opening-title');
  check(/RUSSO-UKRAINIAN WAR/i.test(await page.locator('[data-testid="opening-title"]').innerText()), 'opening: the title names the war');
  await page.clock.runFor(5000);
  check(await page.waitForSelector('[data-testid="briefing"]', { timeout: 30_000 }).then(() => true, () => false), 'opening: the situation report follows the title');
  await close();
}

// 2. A crisis: World War III as the United States, the first treaty call.
{
  const { page, errors, close } = await open();
  await pick(page, 'ww3-2027', 'USA', 'cinc');
  await begin(page);
  await page.waitForSelector('[data-testid="briefing"]', { timeout: 30_000 });
  await page.click('[data-testid="briefing-close"]');
  await page.waitForSelector('[data-testid="crisis"]', { timeout: 60_000 });
  await page.waitForFunction(() => !window.__map?.animating, null, { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, 'crisis');
  check(await page.evaluate(() => window.__client.ticksPerSec) === 0, 'crisis: the clock is stopped');
  check(await page.locator('[data-testid="crisis-option"]').count() === 3, 'crisis: three options');
  await page.keyboard.press('1');
  await page.waitForSelector('[data-testid="crisis-result"] .ww-answer:not(.waiting)', { timeout: 60_000 });
  await page.waitForTimeout(400);
  await shot(page, 'crisis-result');
  const answer = await page.locator('[data-testid="crisis-result"]').innerText();
  check(/will honour the treaty/i.test(answer), `crisis: the engine's answer shows (${answer.replace(/\s+/g, ' ').trim()})`);
  check(await page.evaluate(() => window.__client.state.focusNation.enemies.length) > 0, 'crisis: the United States is at war after answering');
  check(!errors.length, `crisis: no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await close();
}

// 3. Crises off: the staff answers the same call with its recommendation and says so.
{
  const { page, errors, close } = await open({ crises: false });
  await pick(page, 'ww3-2027', 'USA', 'cinc');
  await begin(page);
  await page.waitForSelector('[data-testid="briefing"]', { timeout: 30_000 });
  await page.click('[data-testid="briefing-close"]');
  const toast = await page.waitForFunction(() => document.querySelector('[data-testid="toast"]')?.textContent.match(/^Your staff decided\..*/)?.[0], null, { timeout: 60_000 }).then((h) => h.jsonValue(), () => null);
  check(!!toast && /Treaty invoked|Call for help/.test(toast), `setting: with crises off a toast says what the staff chose (${toast})`);
  check(await page.locator('[data-testid="crisis"]').count() === 0, 'setting: with crises off no crisis takes the screen');
  await page.click('[data-testid="step"]');
  const settled = await page.waitForFunction(() => window.__client.desk.answered.some((s) => s.card.key.startsWith('treaty|') && s.answer?.final), null, { timeout: 60_000 }).then(() => true, () => false);
  check(settled, 'setting: the engine took the staff\'s answer to the treaty call');
  check(!errors.length, `setting: no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await close();
}

// 4. A moment: Russia releases a nuclear weapon on the Ukrainian front.
{
  const { page, errors, close } = await open();
  await pick(page, 'ukraine-2026', 'RUS', 'cinc');
  await begin(page);
  await page.waitForSelector('[data-testid="briefing"]', { timeout: 30_000 });
  await page.click('[data-testid="briefing-close"]');
  await holdClock(page);
  const fired = await page.evaluate(() => {
    const c = window.__client;
    const mine = c.meta.nationIds.indexOf('UKR');
    let best = -1, bestKm = Infinity, w = null;
    const sites = c.state.focusNation.nuclear.weapons.flatMap((weapon) => weapon.sites.map((site) => ({ weapon, site })));
    for (const { weapon, site } of sites.sort((a, b) => a.site.reachKm - b.site.reachKm)) {
      if (site.rounds <= 0 || best >= 0) continue;
      for (let n = 0; n < c.map.landCount; n++) {
        if (c.state.control[n] !== mine) continue;
        const off = Math.abs(c.map.distanceKm(site.node, n) - site.reachKm * 0.5);
        if (c.map.distanceKm(site.node, n) < site.reachKm * 0.8 && off < bestKm) { best = n; bestKm = off; w = weapon; }
      }
    }
    if (best < 0) return null;
    c.command({ type: 'nuclear_release', nation: 'RUS', target: best, warheads: 1, munition: w.munition });
    c.step();
    return { munition: w.munition, target: best };
  });
  check(!!fired, `moment: a Russian nuclear weapon was released (${JSON.stringify(fired)})`);
  let seen = false;
  for (let i = 0; i < 8 && !seen; i++) {
    seen = await page.waitForSelector('[data-testid="moment"]', { timeout: 5_000 }).then(() => true, () => false);
    if (!seen) await page.evaluate(() => window.__client.step());
  }
  check(seen, 'moment: the detonation lands as a moment');
  if (seen) {
    await page.waitForTimeout(1200);
    await shot(page, 'moment');
    await page.clock.runFor(5000);
    check(await page.locator('[data-testid="moment"]').count() === 0, 'moment: it clears on its own');
    check(/NUCLEAR/i.test(await page.locator('[data-testid="ticker-moment"]').innerText()), 'moment: the ticker runs the headline');
  }
  check(!errors.length, `moment: no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await close();
}

await browser.close();
console.log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
