// Gives orders by dragging, as a player does: the pill before release, the order sent and followed, the unit handed
// back when its attack ends, a refusal, Esc, a pan from empty ground, a click that selects, and the clock kept steady.
//   PORT=4651 VERIFY_STATE=/tmp/ww3-verify/state-ui .claude/skills/verify/scripts/launch.sh
//   node tests/ui-drag.e2e.mjs http://localhost:4651/ [run name, default drag]   (evidence in /tmp/ww3-verify/runs/<run>)
import fs from 'node:fs';
import path from 'node:path';
import { open } from '../.claude/skills/verify/scripts/play.mjs';

const [, , url = 'http://localhost:4650/', run = 'drag'] = process.argv;
const s = await open({ url, play: 'ukraine-2026:UKR', role: 'brigade', run });
const { page } = s;
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const facts = {};
const pill = () => page.evaluate(() => {
  const p = document.querySelector('[data-testid="pill"]');
  return p && { text: p.textContent, tone: p.getAttribute('data-tone') };
});
const waitPill = (re, timeout = 20_000) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="pill"]')?.textContent ?? ''), re.source, { timeout }).then(() => true, () => false);
/** Moves the pressed mouse from a to b in steps, as a hand does. */
const sweep = async (a, b, steps = 12) => {
  for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
};
const tracks = () => page.evaluate(() => window.__client.tracks.list().map((t) => ({ formation: t.formation, state: t.state, target: t.target })));
const held = () => page.evaluate(() => window.__client.state.focusNation?.authority.held ?? []);
const sent = () => page.evaluate(() => window.__client.__sent);

try {
  await s.runTo(8);
  // Count every command the page sends from here on.
  await page.evaluate(() => {
    const c = window.__client, send = c.command.bind(c);
    c.__sent = 0;
    c.command = (x) => { c.__sent++; return send(x); };
  });

  // Brigades of ours on the line, each with a defended enemy cell in front of it, weakest first: on a front this locked a
  // weak attack is the one that ends soon (beaten off), and the stamp only clears when the attack ends.
  const pairs = await page.evaluate(async (me) => {
    const c = window.__client, st = c.state, ids = c.meta.nationIds, mine = ids.indexOf(me);
    const enemies = new Set((st.focusNation?.enemies ?? []).map((e) => ids.indexOf(e)));
    const seen = new Set(st.formations.filter((f) => f.contact && f.status === 'active').map((f) => f.node));
    const found = [];
    for (const f of st.formations) {
      if (f.entry.nation !== me || f.entry.kind !== 'maneuver' || f.status !== 'active' || st.control[f.node] !== mine) continue;
      const t = [...c.map.neighbors(f.node)].find((t) => !c.map.isSea(t) && enemies.has(st.control[t]) && seen.has(t));
      if (t !== undefined) found.push({ id: f.entry.id, name: f.entry.name, node: f.node, target: t });
    }
    const power = new Map();
    for (let i = 0; i < found.length; i += 24) for (const u of (await c.dragKit(found.slice(i, i + 24).map((x) => x.id)))?.units ?? []) power.set(u.id, u.power);
    const targets = new Set();
    return found.sort((a, b) => power.get(a.id) - power.get(b.id)).filter((x) => !targets.has(x.target) && targets.add(x.target)).slice(0, 6);
  }, s.nation);
  const front = pairs[0];
  check(!!front, `brigades on the line with defended enemy ground in front of them (${pairs.length})`);
  console.log(pairs.map((x) => `${x.name} ${x.node} -> ${x.target}`).join('\n'));
  await page.click('[data-testid="zoom-front"]');
  await s.settle();
  const frame = (x) => page.evaluate(([a, b]) => {
    const m = window.__map;
    m.flyTo({ lon: (m.map.lon[a] + m.map.lon[b]) / 2, lat: (m.map.lat[a] + m.map.lat[b]) / 2, zoom: m.cam.zoom });
  }, [x.node, x.target]).then(s.settle);
  await frame(front);

  // A plain click on the counter selects; a stack that cannot open further cycles to the brigade.
  const boxOf = (id) => page.evaluate((id) => {
    const hs = window.__map.hits.filter((x) => x.ids.includes(id));
    const h = hs.find((x) => x.ids.length === 1) ?? hs[0];
    const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    return h && { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2, ids: h.ids, opens: h.zoomTo !== null };
  }, id);
  /** Clicks the unit's counter until it is selected: a stack that cannot open further cycles through its units. */
  const select = async (x) => {
    for (let i = 0; i < 24; i++) {
      const b = await boxOf(x.id);
      if (!b) return false;
      await page.mouse.click(b.x, b.y);
      if (b.opens) await s.settle();
      else if (await page.waitForFunction((name) => document.querySelector('[data-testid="formation-name"]')?.textContent === name, x.name, { timeout: 2_000 }).then(() => true, () => false)) return true;
    }
    return false;
  };
  const before = await sent();
  const picked = await select(front);
  check(picked, `a plain click on its counter selects ${front.name}`);
  check((await sent()) === before, 'a click sends no order');
  await s.closeBrief();
  await page.keyboard.press('Escape');

  // Drag the brigade onto the enemy cell: the pill reads the odds before release.
  const a = await boxOf(front.id), b = await s.at(front.target);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await sweep(a, b);
  check(await waitPill(/% to take it/), `the pill gives the odds before release: "${(await pill())?.text}"`);
  facts.attackPill = await pill();
  await s.shot('pill-attack.png');
  const refined = await waitPill(/staff check \d+%/, 30_000);
  check(refined, `resting on the target adds the staff's war-game: "${(await pill())?.text}"`);
  if (refined) await s.shot('pill-attack-refined.png');
  const perf = await page.evaluate(() => window.__drag);
  facts.aim = perf;
  check(perf.lastAimMs < 4 && perf.totalAimMs / perf.aims < 4, `aiming a pointer move takes ${perf.lastAimMs.toFixed(2)} ms, ${(perf.totalAimMs / perf.aims).toFixed(2)} ms on average (worst ${perf.maxAimMs.toFixed(2)} ms) over ${perf.aims} moves`);
  await page.mouse.up();
  check(!(await page.locator('[data-testid="pill"]').count()), 'the pill goes on release');
  const ordered = (await tracks()).filter((t) => t.target === front.target);
  check(ordered.some((t) => t.formation === front.id && t.state === 'sent'), `the order is tracked on ${front.name} as sent`);
  check((await sent()) === before + ordered.length, `release sent one order per unit going (${ordered.length})`);

  // The engine takes the order, the unit is the player's while the attack runs, and goes back once it ends.
  const t0 = await page.evaluate(() => window.__client.state.tick);
  await s.runTo(t0 + 2, 1);
  const answer = (await tracks()).find((t) => t.formation === front.id);
  check(answer?.state === 'accepted' || answer?.state === 'relayed', `the engine accepted the attack (${answer?.state})`);
  check((await held()).includes(front.id), 'the attacking brigade is held by its player order');
  await s.shot('order-answer.png');
  // The other weak brigades attack too, each picked out of its stack and dragged alone.
  for (const x of pairs.slice(1)) {
    await frame(x);
    if (!(await select(x))) continue;
    const from = await boxOf(x.id), to = await s.at(x.target);
    if (!from || !to) continue;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await sweep(from, to);
    await waitPill(/to take it/);
    await page.mouse.up();
  }
  const start = await page.evaluate(() => window.__client.state.tick);
  await s.runTo(start + 2);
  const holding = await held();
  const attacking = pairs.map((x) => x.id).filter((id) => holding.includes(id));
  console.log(`${attacking.length} attacks under way`);
  let ended = null;
  for (let t = start + 4; t <= start + 80 && !ended; t += 4) {
    await s.runTo(t);
    const h = await held();
    ended = attacking.find((id) => !h.includes(id)) ?? null;
  }
  const after = await page.evaluate((id) => {
    const f = window.__client.state.formations.find((x) => x.entry.id === id);
    return f && { name: f.entry.name, posture: f.posture, node: f.node, status: f.status, tick: window.__client.state.tick };
  }, ended ?? front.id);
  check(!!ended && after.posture !== 'attack', `a unit's player stamp clears once its attack ends: ${JSON.stringify(after)}`);

  // A refusal: a brigade of ours on the coast dragged onto the sea says why and sends nothing.
  await s.closeBrief();
  await page.keyboard.press('Escape');
  const coast = await page.evaluate((me) => {
    const c = window.__client, m = c.map;
    let best = null;
    for (const f of c.state.formations) {
      if (f.entry.nation !== me || f.entry.kind !== 'maneuver' || f.status !== 'active') continue;
      const sea = [...m.neighbors(f.node)].find((n) => m.isSea(n));
      if (sea !== undefined && (!best || f.entry.id < best.id)) best = { id: f.entry.id, name: f.entry.name, node: f.node, sea };
    }
    return best;
  }, s.nation);
  check(!!coast, `a brigade of ours on the coast: ${coast?.name}`);
  await s.flyTo(coast.node, -1.5);
  const n0 = await sent();
  const c = await boxOf(coast.id);
  // The nearest point to the brigade, clear of the side panels, where the map is sea.
  const w = c && await page.evaluate(([x, y]) => {
    const r = document.querySelector('[data-testid="map"]').getBoundingClientRect(), m = window.__map;
    let best = null;
    for (let py = 140; py < r.height - 140; py += 8)
      for (let px = 340; px < r.width - 360; px += 8) {
        const n = m.pick(px, py), d = Math.hypot(px - (x - r.left), py - (y - r.top));
        if (n !== null && m.map.isSea(n) && d > 80 && (!best || d < best.d)) best = { x: r.left + px, y: r.top + py, d };
      }
    return best;
  }, [c.x, c.y]);
  if (c && w) {
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await sweep(c, w);
    check(await waitPill(/ground troops cannot go to sea/), `the pill refuses the sea with the reason: "${(await pill())?.text}"`);
    facts.refusedPill = await pill();
    check(facts.refusedPill?.tone === 'refused', 'the refusal reads as refused');
    await s.shot('pill-refused.png');
    await page.mouse.up();
    check((await sent()) === n0, 'a refused release sends nothing');
  } else check(false, `brigade and sea both on screen (${!!c}, ${!!w})`);

  // Hold the front: a stack of ours dragged onto own front cells.
  await s.closeBrief();
  await page.keyboard.press('Escape');
  await page.click('[data-testid="zoom-theatre"]');
  await s.settle();
  await page.evaluate((n) => {
    const m = window.__map;
    m.flyTo({ lon: m.map.lon[n], lat: m.map.lat[n], zoom: m.cam.zoom + 0.4 });
  }, front.node);
  await s.settle();
  const hold = await page.evaluate((me) => {
    const c = window.__client, st = c.state, ids = c.meta.nationIds, mine = ids.indexOf(me), m = c.map;
    const enemies = new Set((st.focusNation?.enemies ?? []).map((e) => ids.indexOf(e)));
    const ground = new Set(st.formations.filter((f) => f.entry.nation === me && f.status === 'active' && (f.entry.kind === 'maneuver' || f.entry.kind === 'logistics')).map((f) => f.entry.id));
    const front = (n) => n < m.landCount && st.control[n] === mine && [...m.neighbors(n)].some((x) => x < m.landCount && enemies.has(st.control[x]));
    const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    const boxes = window.__map.hits.filter((h) => h.ids.every((id) => ground.has(id))).sort((x, y) => y.ids.length - x.ids.length);
    for (const h of boxes) {
      const hx = h.x + h.w / 2, hy = h.y + h.h / 2;
      for (let n = 0; n < m.landCount; n++) {
        if (!front(n) || n === h.node) continue;
        const p = window.__map.screenOf(n);
        if (!p || p[0] < 80 || p[1] < 120 || p[0] > r.width - 340 || p[1] > r.height - 160) continue;
        const d = Math.hypot(p[0] - hx, p[1] - hy);
        if (d > 60 && d < 220 && !window.__map.hits.some((o) => p[0] >= o.x && p[0] <= o.x + o.w && p[1] >= o.y && p[1] <= o.y + o.h)) return { from: { x: r.left + hx, y: r.top + hy }, to: { x: r.left + p[0], y: r.top + p[1] }, units: h.ids.length, node: n };
      }
    }
    return null;
  }, s.nation);
  check(!!hold, `a stack of ours and an own front cell to hold (${hold?.units} units)`);
  if (hold) {
    await page.mouse.move(hold.from.x, hold.from.y);
    await page.mouse.down();
    await sweep(hold.from, hold.to);
    check(await waitPill(/holds|no threat seen/), `the pill gives how long the front holds: "${(await pill())?.text}"`);
    facts.holdPill = await pill();
    await page.waitForTimeout(200);
    await s.shot('pill-hold-front.png');

    // Esc cancels the drag: the pill goes and the release sends nothing.
    const n1 = await sent();
    await s.closeBrief();
    await page.keyboard.press('Escape');
    check(!(await page.locator('[data-testid="pill"]').count()), 'Esc takes the pill away');
    await page.mouse.up();
    check((await sent()) === n1, 'a cancelled drag sends nothing');
    check(!(await tracks()).some((t) => t.target === hold.node), 'and no order is tracked');
  }

  // A drag from empty ground pans the map and orders nothing.
  const empty = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    for (let y = 200; y < 600; y += 23) for (let x = 400; x < 1000; x += 29)
      if (!window.__map.hits.some((h) => x - r.left >= h.x - 10 && x - r.left <= h.x + h.w + 10 && y - r.top >= h.y - 10 && y - r.top <= h.y + h.h + 10)) return { x, y };
    return null;
  });
  const cam0 = await page.evaluate(() => ({ ...window.__map.cam }));
  const n2 = await sent();
  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await sweep(empty, { x: empty.x + 120, y: empty.y + 60 });
  check(!(await page.locator('[data-testid="pill"]').count()), 'no pill on a pan');
  await page.mouse.up();
  const cam1 = await page.evaluate(() => ({ ...window.__map.cam }));
  check(cam1.lon !== cam0.lon || cam1.lat !== cam0.lat, 'a drag from empty ground pans the map');
  check((await sent()) === n2, 'a pan sends nothing');

  // The clock keeps its pace while a drag wiggles over the map for 5 s.
  const own = await page.evaluate((me) => {
    const own = new Set(window.__client.state.formations.filter((f) => f.entry.nation === me && f.status === 'active').map((f) => f.entry.id));
    const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
    const h = window.__map.hits.find((x) => x.ids.every((id) => own.has(id)) && x.x > 200 && x.y > 200 && x.x < r.width - 400 && x.y < r.height - 200);
    return h && { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
  }, s.nation);
  const pace = async (wiggle) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await s.closeBrief();
      await page.evaluate(() => window.__client.setSpeed(5));
      await page.waitForTimeout(800);
      const start = await page.evaluate(() => ({ tick: window.__client.state.tick, at: performance.now() }));
      if (wiggle) {
        await page.mouse.move(own.x, own.y);
        await page.mouse.down();
        const end = Date.now() + 5000;
        for (let i = 0; Date.now() < end; i++) await page.mouse.move(own.x + 140 * Math.cos(i / 6), own.y + 80 * Math.sin(i / 4));
      } else await page.waitForTimeout(5000);
      const stop = await page.evaluate(() => ({ tick: window.__client.state.tick, at: performance.now(), brief: !!document.querySelector('[data-testid="daily-brief"]') }));
      if (wiggle) {
        await page.keyboard.press('Escape');
        await page.mouse.up();
      }
      await page.evaluate(() => window.__client.setSpeed(0));
      if (!stop.brief) return ((stop.tick - start.tick) * 1000) / (stop.at - start.at);
    }
    return NaN;
  };
  // The sim's own pace swings from turn to turn, so idle and drag windows alternate and the medians are compared.
  const n3 = await sent();
  const idle = [], dragging = [];
  for (let k = 0; k < 3; k++) {
    idle.push(await pace(false));
    dragging.push(await pace(true));
  }
  const median = (xs) => [...xs].sort((x, y) => x - y)[1];
  facts.ticksPerSec = { idle, dragging };
  check(median(dragging) >= median(idle) * 0.8, `ticks a second hold steady during 5 s drag wiggles: median ${median(dragging).toFixed(2)} dragging against ${median(idle).toFixed(2)} idle (${dragging.map((x) => x.toFixed(2))} / ${idle.map((x) => x.toFixed(2))})`);
  check((await sent()) === n3, 'the wiggle, cancelled, sent nothing');

  check(s.errors.length === 0, `no page errors${s.errors.length ? `: ${s.errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  await s.shot('failure.png').catch(() => {});
  failures.push(String(e?.message ?? e).split('\n')[0]);
  console.log(`FAIL ${failures.at(-1)}`);
} finally {
  fs.writeFileSync(path.join(s.out, 'summary.json'), JSON.stringify({ ...facts, failures, errors: s.errors }, null, 2));
  await s.close();
}
console.log(failures.length ? `${failures.length} failed` : 'all passed');
process.exit(failures.length ? 1 : 0);
