// Gives orders the way a player does: the radial menu on a unit and on a bare cell, a refused order
// with the engine's reason, a battle plan with its staff forecast, and the operation running on the map.
//   npm run build && npx vite preview --port 4650 &
//   node tests/ui-orders.e2e.mjs http://localhost:4650/ <outDir> [scenario:NATION]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { newGame } from './e2e-start.mjs';

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
// Every brigade under the player's own command, so no staff operation has taken the brigades a plan needs.
const { page, errors } = await newGame(browser, url, scenario, nation, { role: 'brigade' });
await page.waitForFunction(() => window.__map && window.__client?.state.formations.length > 0, null, { timeout: 120_000 });

const closeBrief = async () => {
  if (await page.locator('[data-testid="brief-close"]').count()) await page.click('[data-testid="brief-close"]');
};
const runTo = async (tick, speed = 20) => {
  for (;;) {
    const s = await page.evaluate(() => ({ tick: window.__client.state.tick, brief: !!document.querySelector('[data-testid="daily-brief"]') }));
    if (s.brief) { await closeBrief(); continue; }
    if (s.tick >= tick) break;
    await page.evaluate((v) => window.__client.ticksPerSec || window.__client.setSpeed(v), speed);
    await page.waitForFunction(([t]) => window.__client.state.tick >= t || document.querySelector('[data-testid="daily-brief"]'), [tick], { timeout: 600_000 });
  }
  await page.evaluate(() => window.__client.setSpeed(0));
  await closeBrief();
};
const settle = async () => {
  await page.waitForFunction(() => !window.__map.animating, null, { timeout: 60_000 });
  await page.waitForTimeout(400);
};
const flyTo = async (node, zoomBy = 0) => {
  await page.evaluate(([n, dz]) => {
    const m = window.__map;
    m.flyTo({ lon: m.map.lon[n], lat: m.map.lat[n], zoom: m.cam.zoom + dz });
  }, [node, zoomBy]);
  await settle();
};
/** A node's position on the page. */
const at = async (node) => page.evaluate((n) => {
  const p = window.__map.screenOf(n);
  const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
  return p && { x: r.left + p[0], y: r.top + p[1] };
}, node);
const shot = (name) => page.screenshot({ path: path.join(out, name) });
/** Frames cells about `px` pixels across, centred above the middle of the screen so a panel at the foot leaves them clear. */
const frame = async (nodes, px = 300) => {
  await page.evaluate(([ns, px]) => {
    const m = window.__map;
    const pts = ns.map((n) => m.screenOf(n)).filter(Boolean);
    const span = Math.max(40, ...pts.flatMap((a) => pts.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1]))));
    const lon = ns.map((n) => m.map.lon[n]), lat = ns.map((n) => m.map.lat[n]);
    const zoom = m.cam.zoom + Math.log2(px / span);
    // Degrees of latitude per pixel now, from a cell and its neighbour to the north or south, scaled to the new zoom.
    const a = ns[0], b = [...m.map.neighbors(a)].sort((x, y) => Math.abs(m.map.lat[y] - m.map.lat[a]) - Math.abs(m.map.lat[x] - m.map.lat[a]))[0];
    const degPerPx = Math.abs(m.map.lat[b] - m.map.lat[a]) / Math.max(1, Math.abs(m.screenOf(b)[1] - m.screenOf(a)[1])) / 2 ** (zoom - m.cam.zoom);
    m.flyTo({ lon: (Math.min(...lon) + Math.max(...lon)) / 2, lat: (Math.min(...lat) + Math.max(...lat)) / 2 - 150 * degPerPx, zoom });
  }, [nodes, px]);
  await settle();
};

await runTo(TICKS);

// A brigade of ours on the line, and the enemy-held cell in front of it.
const front = await page.evaluate((me) => {
  const c = window.__client, st = c.state, ids = c.meta.nationIds, mine = ids.indexOf(me);
  const enemies = new Set((st.focusNation?.enemies ?? []).map((e) => ids.indexOf(e)));
  for (const f of st.formations) {
    if (f.entry.nation !== me || f.entry.kind !== 'maneuver' || f.status !== 'active' || st.control[f.node] !== mine) continue;
    const t = [...c.map.neighbors(f.node)].find((n) => enemies.has(st.control[n]) && !c.map.isSea(n));
    if (t !== undefined) return { id: f.entry.id, name: f.entry.name, node: f.node, target: t };
  }
  return null;
}, nation);
check(!!front, 'a brigade on the line with enemy ground in front of it');
console.log(`brigade ${front.name} at ${front.node}, target ${front.target}`);

await page.click('[data-testid="zoom-front"]');
await settle();
// Frame the brigade and its target together, clear of the side panels.
await page.evaluate(([a, b]) => {
  const m = window.__map;
  m.flyTo({ lon: (m.map.lon[a] + m.map.lon[b]) / 2, lat: (m.map.lat[a] + m.map.lat[b]) / 2, zoom: m.cam.zoom - 0.6 });
}, [front.node, front.target]);
await settle();

// Select the brigade, then right-click the enemy cell: the wheel offers what it can do there.
// A stack opens up on a click until the brigade has a counter of its own; a counter that cannot open further cycles through its units.
const boxOf = () => page.evaluate((id) => {
  const hs = window.__map.hits.filter((x) => x.ids.includes(id));
  const h = hs.find((x) => x.ids.length === 1) ?? hs[0];
  const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
  return h && { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2, ids: h.ids.length, opens: h.zoomTo !== null };
}, front.id);
const selected = () => page.evaluate((name) => (document.querySelector('[data-testid="drawer-panel-forces"]')?.textContent ?? '').includes(name), front.name);
let picked = false;
for (let i = 0; i < 24 && !picked; i++) {
  const b = await boxOf();
  if (!b) break;
  await page.mouse.click(b.x, b.y);
  if (b.opens) await settle();
  else picked = await page.waitForFunction((name) => (document.querySelector('[data-testid="drawer-panel-forces"]')?.textContent ?? '').includes(name), front.name, { timeout: 2_000 }).then(() => true, () => false);
}
if (!picked) await shot('debug-select.png');
check(picked && (await selected()), `${front.name} selected from the map`);
await page.keyboard.press('Escape');
await flyTo(front.target, 0);
const tgt = await at(front.target);
await page.mouse.click(tgt.x, tgt.y, { button: 'right' });
await page.waitForSelector('[data-testid="radial-attack"]', { timeout: 30_000 });
const wheel = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="radial-"]')].map((e) => ({ id: e.getAttribute('data-testid'), off: e.getAttribute('aria-disabled') === 'true' })).filter((x) => x.id !== 'radial-detail'));
console.log('wheel:', wheel.map((w) => `${w.id}${w.off ? ' (greyed)' : ''}`).join(', '));
const legal = await page.evaluate(([id, node]) => window.__client.options([id], node), [front.id, front.target]);
const engineKeys = legal.options.map((o) => `radial-${o.key}`);
check(JSON.stringify(wheel.map((w) => w.id)) === JSON.stringify(engineKeys), 'the wheel shows exactly the options the engine worked out, in order');
check(wheel.every((w, i) => w.off === (legal.options[i].ok.length === 0)), 'greyed slots are the ones the engine refuses');
await page.hover('[data-testid="radial-attack"]');
await page.waitForTimeout(250);
const attackCard = await page.textContent('[data-testid="radial-detail"]');
check(/Order arrives|arrives next turn/.test(attackCard), `the attack card says when the order arrives: "${attackCard}"`);
await shot('radial-unit.png');

// A refused order: hover a greyed slot, or ask for one across the map where the engine refuses it.
let refusedShot = false;
const greyed = wheel.find((w) => w.off);
if (greyed) {
  await page.hover(`[data-testid="${greyed.id}"]`);
  await page.waitForTimeout(250);
  const card = await page.textContent('[data-testid="radial-detail"]');
  const why = legal.options.find((o) => `radial-${o.key}` === greyed.id).refused[0].reason;
  // The card words the reason for the player: the engine's text up to any node number it names.
  const words = why.replace(/\bnode \d+.*/, '').trim();
  const tone = await page.getAttribute('[data-testid="radial-detail"]', 'class');
  check(tone.includes('refused') && card.includes(words),`the greyed ${greyed.id} card gives the engine reason "${why}" in words: "${card}"`);
  await shot('refused-order.png');
  refusedShot = true;
}
await page.keyboard.press('Escape');
check(!(await page.locator('[data-testid="radial"]').count()), 'Esc closes the wheel');

if (!refusedShot) {
  const far = await page.evaluate(() => window.__client.map.nodeAt(39.9, 32.85));
  await flyTo(far, 0);
  const p = await at(far);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.waitForSelector('[data-testid="radial-attack"]', { timeout: 30_000 });
  const off = await page.evaluate(() => document.querySelector('[data-testid^="radial-"][aria-disabled="true"]')?.getAttribute('data-testid'));
  check(!!off, 'an order the engine refuses far from the front');
  if (off) {
    await page.hover(`[data-testid="${off}"]`);
    await page.waitForTimeout(250);
    console.log('refused card:', await page.textContent('[data-testid="radial-detail"]'));
    await shot('refused-order.png');
  }
  await page.keyboard.press('Escape');
  await flyTo(front.target, 0);
}

// Order the attack from the wheel: the unit shows the order in transit, then its answer.
await page.mouse.click(tgt.x, tgt.y, { button: 'right' });
await page.waitForSelector('[data-testid="radial-attack"]:not([aria-disabled="true"])', { timeout: 30_000 });
await page.click('[data-testid="radial-attack"]');
const sent = await page.evaluate((id) => window.__client.tracks.get(id)?.state, front.id);
check(sent === 'sent', `the order is tracked on the unit as sent (${sent})`);
const t0 = await page.evaluate(() => window.__client.state.tick);
for (let i = 0; i < 6; i++) {
  await page.click('[data-testid="step"]');
  await page.waitForFunction((t) => window.__client.state.tick > t, t0 + i, { timeout: 60_000 });
  const s = await page.evaluate((id) => window.__client.tracks.get(id)?.state, front.id);
  if (s === 'accepted' || s === 'refused') break;
}
await closeBrief();
const answer = await page.evaluate((id) => window.__client.tracks.get(id), front.id);
check(answer && (answer.state === 'accepted' || answer.state === 'refused' || answer.state === 'relayed'), `the engine's answer shows on the unit: ${answer?.state} ${answer?.reason ?? ''}`);
await page.waitForTimeout(300);
await shot('order-answer.png');

// A battle plan from a bare enemy cell: the staff offers its nearest brigades and forecasts the push.
const empty = await page.evaluate(() => {
  const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
  for (let y = 160; y < 640; y += 23) for (let x = 360; x < 1080; x += 29)
    if (!window.__map.hits.some((h) => x - r.left >= h.x - 8 && x - r.left <= h.x + h.w + 8 && y - r.top >= h.y - 8 && y - r.top <= h.y + h.h + 8)) return { x, y };
  return null;
});
await page.keyboard.press('Escape');
await page.mouse.click(empty.x, empty.y);
// The enemy cell with the most of our brigades next to it and the fewest enemy units known on it, other than the one already
// ordered: a plan the staff can mount at once.
const objective = await page.evaluate(([me, skip]) => {
  const c = window.__client, st = c.state, ids = c.meta.nationIds, mine = ids.indexOf(me);
  const enemies = new Set((st.focusNation?.enemies ?? []).map((e) => ids.indexOf(e)));
  const brigades = new Map(), ours = new Set(), contacts = new Map();
  for (const f of st.formations) {
    if (f.contact) contacts.set(f.node, (contacts.get(f.node) ?? 0) + 1);
    if (f.entry.nation === me && f.status !== 'destroyed') ours.add(f.node);
    if (f.entry.nation === me && f.entry.kind === 'maneuver' && f.status === 'active' && st.control[f.node] === mine) brigades.set(f.node, (brigades.get(f.node) ?? 0) + 1);
  }
  let best = skip, most = -Infinity;
  for (let n = 0; n < c.map.landCount; n++) {
    if (n === skip || ours.has(n) || !enemies.has(st.control[n])) continue;
    let k = -4 * (contacts.get(n) ?? 0), near = 0;
    for (const m of c.map.neighbors(n)) near += brigades.get(m) ?? 0;
    k += near;
    if (near >= 3 && k > most) { most = k; best = n; }
  }
  return best;
}, [nation, front.target]);
await flyTo(objective, 0);
const op = await at(objective);
await page.mouse.click(op.x, op.y, { button: 'right' });
await page.waitForSelector('[data-testid="radial-plan"]', { timeout: 30_000 });
await page.hover('[data-testid="radial-plan"]');
await page.click('[data-testid="radial-plan"]');
await page.waitForSelector('[data-testid="plan-panel"]', { timeout: 10_000 });
await page.waitForSelector('[data-testid="forecast-odds"], [data-testid="forecast-failed"]', { timeout: 180_000 });
check(!(await page.locator('[data-testid="forecast-failed"]').count()), 'the staff forecasts the plan');
const odds = await page.textContent('[data-testid="forecast-odds"]');
const losses = await page.textContent('[data-testid="forecast-losses"]');
console.log(`forecast: ${odds}; ${losses}`);
const units = await page.locator('[data-testid="plan-units"] .ww-plan-unit').count();
check(units >= 2, `the staff gives the plan its nearest brigades (${units})`);
const near = await page.evaluate((obj) => {
  const c = window.__client, me = c.playing;
  return c.state.formations.filter((f) => f.entry.nation === me && f.entry.kind === 'maneuver' && f.status === 'active')
    .map((f) => [c.map.distanceKm(f.node, obj), f.node]).sort((x, y) => x[0] - y[0]).slice(0, 3).map(([, n]) => n);
}, objective);
await frame([objective, ...near], 300);
await shot('battle-plan.png');

// Launch it: the engine files the operation, and the map draws it with its phase and progress.
await page.click('[data-testid="plan-launch"]');
check(!(await page.locator('[data-testid="plan-panel"]').count()), 'Launch closes the planner');
const before = await page.evaluate(() => window.__client.state.tick);
await runTo(before + 2, 1);
const ops = await page.evaluate(() => window.__client.state.ops.map((o) => ({ id: o.id, name: o.name, phase: o.phase, axis: o.axis.length, advance: o.progress.advance, note: o.progress.note })));
console.log('operations:', JSON.stringify(ops));
const mineOp = ops.find((o) => o.phase === 'launched' || o.phase === 'stalled' || o.phase === 'succeeded');
check(!!mineOp, 'the engine runs the launched operation');
const result = await page.evaluate(() => window.__client.feed.newest(new Set(), window.__client.playing, 80).find((r) => r.event.type === 'command_result' && r.event.command === 'plan_operation'));
check(!!result, `the plan's answer is in the feed: ${result?.text}`);
check((await page.locator('[data-testid="planned-operation"]').count()) > 0, 'the operation is listed under Operations');
await runTo(before + 10, 5);
const axis = await page.evaluate(() => window.__client.state.ops.find((o) => o.phase !== 'cancelled')?.axis ?? []);
await frame(axis, 260);
await page.waitForTimeout(400);
await shot('operation-running.png');
await page.click('[data-testid="planned-operation"]');
await page.waitForSelector('[data-testid="plan-panel"]');
await page.waitForTimeout(300);
await shot('operation-panel.png');
const phase = await page.textContent('[data-testid="plan-panel"] .ww-label');
check(/Under way|Stalled|Succeeded|Failed/.test(phase), `the planner shows the running phase: ${phase}`);
await page.keyboard.press('Escape');

// The nation panel offers passage and aid.
await page.click('[data-testid="drawer-nation"]');
const other = await page.evaluate(() => [...document.querySelectorAll('[data-testid="diplo-target"] option')].map((o) => o.value).find((v) => v === 'POL') ?? '');
await page.selectOption('[data-testid="diplo-target"]', other);
check(await page.isEnabled('[data-testid="grant-access"]'), 'Grant passage can be given to a friendly neighbour');
await page.click('[data-testid="grant-access"]');
await page.click('[data-testid="step"]');
await page.waitForFunction(() => document.querySelector('[data-testid="access-status"]'), null, { timeout: 30_000 }).catch(() => {});
check((await page.textContent('[data-testid="grant-access"]')) === 'Close borders', 'the engine applied the passage');

check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
await browser.close();
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('all passed');
