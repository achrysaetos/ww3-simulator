// Gives supply priority by dragging, as Russia's player does on its thinly supplied front: the pill over the front before release, the priority given and
// drawn, moved by a second drag, refused on enemy ground, cancelled with Esc, and cleared from the handle.
//   PORT=4690 VERIFY_STATE=/tmp/ww3-verify/state-supply .claude/skills/verify/scripts/launch.sh
//   node tests/ui-supply.e2e.mjs http://localhost:4690/ [run name, default supply]   (evidence in /tmp/ww3-verify/runs/<run>)
import fs from 'node:fs';
import path from 'node:path';
import { open } from '../.claude/skills/verify/scripts/play.mjs';

const [, , url = 'http://localhost:4650/', run = 'supply'] = process.argv;
const s = await open({ url, play: 'ukraine-2026:RUS', role: 'cinc', run });
const { page } = s;
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const facts = {};
const pillText = () => page.evaluate(() => document.querySelector('[data-testid="pill"]')?.textContent ?? null);
const waitPill = (re, timeout = 20_000) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="pill"]')?.textContent ?? ''), re.source, { timeout }).then(() => true, () => false);
const priority = () => page.evaluate(() => window.__client.state.supplyPriority);
const sweep = async (a, b, steps = 12) => {
  for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
};
const grip = async () => {
  const b = await page.locator('[data-testid="supply-grip"]').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** Presses the supply handle and drags it to `node`, leaving the button down. */
const dragTo = async (node) => {
  const a = await grip(), b = await s.at(node);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await sweep(a, b);
};
const advance = async () => {
  const t = await page.evaluate(() => window.__client.state.tick);
  await s.runTo(t + 2);
};

try {
  await s.runTo(16);
  // Front cells of ours with our brigades on them, two far apart, and the enemy cell across from the first.
  const cells = await page.evaluate(async (me) => {
    const c = window.__client, st = c.state, ids = c.meta.nationIds, mine = ids.indexOf(me);
    const enemies = new Set((st.focusNation?.enemies ?? []).map((e) => ids.indexOf(e)));
    const front = [];
    for (const f of st.formations) {
      if (f.entry.nation !== me || f.entry.kind !== 'maneuver' || f.status !== 'active' || st.control[f.node] !== mine) continue;
      const enemy = [...c.map.neighbors(f.node)].find((t) => !c.map.isSea(t) && enemies.has(st.control[t]));
      if (enemy !== undefined && !front.some((x) => x.node === f.node)) front.push({ node: f.node, enemy });
    }
    // The cell where priority saves the most days of refill, by the same preview the pill reads.
    let a, best = -1;
    for (const x of front) {
      const e = await c.supplyEffect(x.node);
      const saved = e && e.after > 0 ? e.short / Math.max(e.before, 1e-9) - e.short / e.after : -1;
      if (saved > best) [a, best] = [{ ...x, saved }, saved];
    }
    const b = front.filter((x) => c.map.distanceKm(x.node, a.node) > 250).sort((x, y) => c.map.distanceKm(x.node, a.node) - c.map.distanceKm(y.node, a.node))[0];
    return { a, b };
  }, s.nation);
  check(!!cells.a && !!cells.b, `two front cells of ours with brigades on them, far apart (${JSON.stringify(cells)})`);
  facts.cells = cells;
  check((await page.locator('[data-testid="supply-priority"]').textContent()) === 'no priority', 'the supply handle starts with no priority');

  await page.click('[data-testid="zoom-theatre"]');
  await s.settle();
  await s.flyTo(cells.a.node, -0.3);

  await dragTo(cells.a.node);
  check(await waitPill(/Refilled in .* not /), `over our front the pill predicts the effect: ${await pillText()}`);
  facts.pillA = await pillText();
  check(/\+[\d.,k]+ t a day to \d+ units? here · \d+% less lift/.test(facts.pillA ?? ''), 'the pill counts the tons a day moved to the units here');
  check(await page.evaluate(() => window.__client.state.supplyPriority === null), 'nothing is sent before release');
  check((await page.locator('.map-tooltip').count()) === 0, 'the map tooltip stays out of the way of the pill');
  await s.shot('supply-pill.png');
  await page.mouse.up();
  await advance();
  check((await priority()) === cells.a.node, 'release gives that cell supply priority');
  check(/^priority /.test((await page.locator('[data-testid="supply-priority"]').textContent()) ?? ''), `the handle names it: ${await page.locator('[data-testid="supply-priority"]').textContent()}`);
  await s.shot('supply-given.png');

  await s.flyTo(cells.b.node, 0);
  await dragTo(cells.b.node);
  check(await waitPill(/Supply priority/), 'a second drag shows the pill again');
  await page.mouse.up();
  await advance();
  check((await priority()) === cells.b.node, 'a second drag moves the priority, one at a time');

  await s.flyTo(cells.a.node, 0);
  await dragTo(cells.a.enemy);
  check(await waitPill(/Only ground you hold/), `over enemy ground the pill refuses: ${await pillText()}`);
  await page.mouse.up();
  await advance();
  check((await priority()) === cells.b.node, 'a refused drop changes nothing');

  await dragTo(cells.a.node);
  await waitPill(/Refilled/);
  await page.keyboard.press('Escape');
  check((await pillText()) === null, 'Esc drops the drag and its pill');
  await page.mouse.up();
  await advance();
  check((await priority()) === cells.b.node, 'the cancelled drag sent nothing');

  await page.click('[data-testid="supply-clear"]');
  await advance();
  check((await priority()) === null, 'the handle clears the priority');
  check((await page.locator('[data-testid="supply-clear"]').count()) === 0, 'and offers no clear button once cleared');

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
