// Drives the map in headless Chromium: screenshots at globe, theatre and front zoom, a frame
// sequence of one continuous flight from the globe to the front, and frame times while panning
// and zooming through the real pointer and wheel handlers.
//   node scripts/map-shots.mjs <url> <outDir> [shots|flight|perf ...]
// <url> is the harness (npm run dev: http://localhost:5173/src/ui/map/harness.html?scenario=ukraine-2026&nation=UKR)
// or the built app for perf.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const [, , url, out, ...modes] = process.argv;
const want = new Set(modes.length ? modes : ['shots', 'flight', 'perf']);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
page.on('pageerror', (e) => console.log('page error:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
await page.goto(url);
if (!url.includes('harness')) {
  // The real app: start the scenario from the start screen like a player.
  const [scenario, nation] = (process.env.PLAY ?? 'ukraine-2026:UKR').split(':');
  await page.click(`[data-testid="scenario-${scenario}"]`);
  await page.selectOption('[data-testid="nation-select"]', nation);
  await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-testid="map"]', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Take command' }).click({ timeout: 30_000 }).catch(() => undefined);
}
await page.waitForFunction(() => window.__map && window.__client?.meta && window.__client.state.formations.length > 0, null, { timeout: 120_000 });
// Run the opening ticks so the wars are declared and the fronts drawn, then pause for stable shots.
const TICKS = Number(process.env.TICKS ?? 12);
await page.evaluate(() => window.__client.setSpeed(20));
await page.waitForFunction((n) => window.__client.state.tick >= n, TICKS, { timeout: 300_000 });
await page.evaluate(() => window.__client.setSpeed(0));
console.log('tick', await page.evaluate(() => window.__client.state.tick));
console.log('webgl:', await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
}));

/** Waits until the camera is still and every wanted tile has landed. */
const settle = async () => {
  await page.waitForFunction(() => !window.__map.animating, null, { timeout: 120_000 });
  await page.waitForTimeout(250);
};
const setCam = (cam) => page.evaluate((c) => window.__map.setCamera?.(c), cam);

const VIEWS = {
  globe: { lon: 22, lat: 38, zoom: Math.log2(0.42 * 900) },
  theatre: { lon: 33.6, lat: 48.3, zoom: Math.log2(80 / (Math.PI / 180)) },
  front: { lon: 35.85, lat: 47.42, zoom: Math.log2(560 / (Math.PI / 180)) },
};

if (want.has('shots')) {
  await settle();
  for (const [name, cam] of Object.entries(VIEWS)) {
    await setCam(cam);
    await settle();
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log('shot', name);
  }
}

if (want.has('flight')) {
  // Step one flight in time so every frame is exact, then screenshot each frame.
  await setCam(VIEWS.globe);
  await settle();
  const frames = 24;
  for (let i = 0; i <= frames; i++) {
    await page.evaluate(({ from, to, t }) => window.__map.setCamera(window.__map.cameraAlong(from, to, t)), { from: VIEWS.globe, to: VIEWS.front, t: i / frames });
    await settle();
    await page.screenshot({ path: path.join(out, `flight-${String(i).padStart(2, '0')}.png`) });
  }
  console.log('flight frames', frames + 1);
}

/** Drag across the screen and back, then wheel in and out, through the real handlers. */
async function motion() {
    await page.mouse.move(720, 450);
    await page.mouse.down();
    for (let i = 0; i < 90; i++) await page.mouse.move(720 + 300 * Math.sin(i / 14), 450 + 120 * Math.sin(i / 23), { steps: 1 });
    await page.mouse.up();
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, i < 20 ? -120 : 120);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(400);
}

if (want.has('perf')) {
  const results = {};
  for (const scenarioView of ['theatre', 'front', 'globe']) {
    await setCam(VIEWS[scenarioView]);
    await settle();
    // One unrecorded pass streams in the tiles the motion visits; the recorded pass measures steady panning.
    if (!process.env.COLD) {
      await motion();
      await setCam(VIEWS[scenarioView]);
      await settle();
    }
    await page.evaluate(() => {
      const m = window.__map;
      window.__cpu = [];
      if (!m.__timed) {
        const render = m.render.bind(m);
        m.render = (...a) => { const t = performance.now(); render(...a); window.__cpu?.push(performance.now() - t); };
        m.__timed = true;
      }
      window.__frames = [];
      let last = performance.now();
      const tick = (now) => {
        window.__frames.push(now - last);
        last = now;
        if (window.__recording) requestAnimationFrame(tick);
      };
      window.__recording = true;
      requestAnimationFrame(tick);
    });
    await motion();
    const [frames, cpu] = await page.evaluate(() => {
      window.__recording = false;
      return [window.__frames.slice(2), window.__cpu];
    });
    const stats = (xs) => {
      const sorted = [...xs].sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
      return { n: xs.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +(sorted[sorted.length - 1] ?? NaN).toFixed(1) };
    };
    // frame: rAF interval, what the player sees. render: main-thread time in MapRenderer.render.
    results[scenarioView] = { frame: stats(frames), render: stats(cpu) };
    console.log('perf', scenarioView, results[scenarioView]);
  }
  fs.writeFileSync(path.join(out, 'perf.json'), JSON.stringify(results, null, 2));
}

await browser.close();
