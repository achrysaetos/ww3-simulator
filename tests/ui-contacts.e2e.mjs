// Picks an enemy intel contact on the map the way a player does and screenshots its error ring,
// fix age and contact panel.
//   npm run build && npx vite preview --port 4517 &
//   node tests/ui-contacts.e2e.mjs http://localhost:4517/ <outDir> [scenario:NATION]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const [, , url, out, play = 'ukraine-2026:UKR'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const [scenario, nation] = play.split(':');
const tag = `${scenario}-${nation}`;
const TICKS = Number(process.env.TICKS ?? 16);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
  await page.waitForFunction(([t]) => window.__client.state.tick >= t || document.querySelector('[data-testid="daily-brief"]'), [TICKS], { timeout: 600_000 });
}
await page.evaluate(() => window.__client.setSpeed(0));
if (await page.locator('[data-testid="brief-close"]').count()) await page.click('[data-testid="brief-close"]');

// The contact to pick: a current enemy manoeuvre contact a few hours old, its ring tens of km across.
const target = await page.evaluate((me) => {
  const st = window.__client.state;
  const cs = st.formations.filter((f) => f.contact && f.entry.nation !== me && f.entry.kind === 'maneuver' && f.contact.confidence >= 0.25 && f.contact.errorKm >= 15 && f.contact.errorKm <= 80);
  cs.sort((a, b) => b.contact.ageHours - a.contact.ageHours || b.contact.errorKm - a.contact.errorKm);
  const f = cs[0];
  return f && { id: f.entry.id, node: f.node, name: f.entry.name, ...f.contact };
}, nation);
check(!!target, `${tag}: an enemy contact to pick`);
console.log(`${tag}: picking ${target.name}, fix ${Math.round(target.ageHours)}h old, ±${Math.round(target.errorKm)} km`);
await page.click('[data-testid="zoom-front"]');
await page.waitForFunction(() => !window.__map.animating, null, { timeout: 60_000 });
await page.evaluate((n) => {
  const m = window.__map;
  m.flyTo({ lon: m.map.lon[n], lat: m.map.lat[n], zoom: m.cam.zoom - 1 });
}, target.node);
await page.waitForFunction(() => !window.__map.animating, null, { timeout: 60_000 });
await page.waitForTimeout(800);
const box = await page.evaluate((id) => {
  const h = window.__map.hits.find((x) => x.ids.includes(id));
  return h && { x: h.x + h.w / 2, y: h.y + h.h / 2, n: h.ids.length };
}, target.id);
check(!!box, `${tag}: the contact has a counter on screen`);
const canvas = await page.locator('[data-testid="map"]').boundingBox();
for (let i = 0; i < (box?.n ?? 1); i++) {
  await page.mouse.click(canvas.x + box.x, canvas.y + box.y);
  await page.waitForTimeout(300);
  if (await page.locator('[data-testid="contact-panel"]').count()) {
    const shown = await page.locator('[data-testid="formation-name"]').innerText();
    if (shown === target.name) break;
  }
}
await page.waitForSelector('[data-testid="contact-panel"]', { timeout: 30_000 });
await page.mouse.move(canvas.x + canvas.width - 20, canvas.y + canvas.height - 60);
await page.waitForTimeout(600);
const fix = await page.locator('[data-testid="contact-fix"]').innerText();
check(/Last fixed \d+[hd] ago/.test(fix) && /km of that fix/.test(fix), `${tag}: the panel gives the fix age and error: ${fix}`);
check(!(await page.locator('[data-testid^="posture-"]').count()), `${tag}: no orders offered for an enemy contact`);
await page.screenshot({ path: path.join(out, `contact-${tag}.png`) });
check(errors.length === 0, `${tag}: no page errors ${errors.join(' | ')}`);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
