// Plays one game through the real UI and leaves screenshots plus summary.json in the run directory.
//   node .claude/skills/verify/scripts/play.mjs [--play ukraine-2026:UKR] [--role cinc] [--ticks 8]
//     [--drawers forces,nation,log,cost] [--run <name>] [--url http://localhost:4650/]
// Import it instead to drive a feature of your own: `const s = await open({...}); ...; await s.close()`.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { closeBrief, newGame, runTo } from '../../../../tests/e2e-start.mjs';

export const RUNS = '/tmp/ww3-verify/runs';

export async function open({ url = 'http://localhost:4650/', play = 'ukraine-2026:UKR', role = 'cinc', run = `run-${Date.now()}` } = {}) {
  const out = path.join(RUNS, run);
  fs.mkdirSync(out, { recursive: true });
  const [scenario, nation] = play.split(':');
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  const { page, errors } = await newGame(browser, url, scenario, nation, { role });
  await page.waitForFunction(() => window.__map && window.__client?.state.formations.length > 0, null, { timeout: 120_000 });

  const s = {
    page, errors, out, nation,
    closeBrief: () => closeBrief(page),
    shot: (name) => page.screenshot({ path: path.join(out, name) }),
    settle: async () => {
      await page.waitForFunction(() => !window.__map.animating, null, { timeout: 60_000 });
      await page.waitForTimeout(400);
    },
    /** Runs the clock to `tick` and pauses, closing each Daily Brief on the way. Ticks are 6 game hours. */
    runTo: (tick, speed = 20) => runTo(page, tick, { speed }),
    /** A map node's position on the page, or null when it is off screen. */
    at: (node) => page.evaluate((n) => {
      const p = window.__map.screenOf(n);
      const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
      return p && { x: r.left + p[0], y: r.top + p[1] };
    }, node),
    summary: () => page.evaluate(() => ({
      tick: window.__client.state.tick,
      clock: document.querySelector('[data-testid="clock"]')?.textContent ?? null,
      topbar: document.querySelector('[data-testid="topbar"]')?.textContent ?? null,
      formations: window.__client.state.formations.length,
    })),
    close: () => browser.close(),
  };
  s.flyTo = async (node, zoomBy = 0) => {
    await page.evaluate(([n, dz]) => {
      const m = window.__map;
      m.flyTo({ lon: m.map.lon[n], lat: m.map.lat[n], zoom: m.cam.zoom + dz });
    }, [node, zoomBy]);
    await s.settle();
  };
  return s;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
  const s = await open({ url: args.url, play: args.play, role: args.role, run: args.run });
  try {
    await s.settle();
    await s.shot('start.png');
    await s.runTo(Number(args.ticks ?? 8));
    await s.settle();
    await s.shot('after-ticks.png');
    const drawers = [];
    for (const d of (args.drawers ?? '').split(',').filter(Boolean)) {
      await s.page.click(`[data-testid="drawer-${d}"]`);
      const shown = await s.page.waitForSelector(`[data-testid="drawer-panel-${d}"]`, { timeout: 10_000 }).then(() => true, () => false);
    await s.page.waitForTimeout(400);
      await s.shot(`drawer-${d}.png`);
      drawers.push({ drawer: d, shown });
      await s.page.click(`[data-testid="drawer-${d}"]`);
    }
    const summary = { ...(await s.summary()), drawers, errors: s.errors };
    fs.writeFileSync(path.join(s.out, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ out: s.out, ...summary }, null, 2));
    process.exitCode = summary.errors.length || drawers.some((d) => !d.shown) ? 1 : 0;
  } catch (e) {
    await s.shot('failure.png').catch(() => {});
    fs.writeFileSync(path.join(s.out, 'summary.json'), JSON.stringify({ failure: String(e.message ?? e).split('\n')[0], errors: s.errors }, null, 2));
    throw e;
  } finally {
    await s.close();
  }
}
