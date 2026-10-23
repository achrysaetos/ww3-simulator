// The front line moves inside a cell while an attack presses: a brigade dragged onto an empty Russian-held cell pushes
// the line into it, and a Russian push the player watches creeps on day by day. Screenshots at each time, same camera.
//   PORT=4653 VERIFY_STATE=/tmp/ww3-verify/state-front .claude/skills/verify/scripts/launch.sh
//   node tests/ui-front.e2e.mjs http://localhost:4653/ [run name, default front-progress]   (evidence in /tmp/ww3-verify/runs/<run>)
import fs from 'node:fs';
import path from 'node:path';
import { open } from '../.claude/skills/verify/scripts/play.mjs';

const [, , url = 'http://localhost:4650/', run = 'front-progress'] = process.argv;
const s = await open({ url, play: 'ukraine-2026:UKR', role: 'brigade', run });
const { page } = s;
const facts = { drags: [], frames: [] };
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) process.exitCode = 1;
};
const PAIRS = [['35th Separate Marine Brigade', 7697], ['42nd Separate Mechanized Brigade', 6501]];

const unit = (name) => page.evaluate((name) => window.__client.state.formations.find((f) => f.entry.name === name), name);
const contest = (node) => page.evaluate((n) => {
  const v = window.__client.state.contest;
  for (let i = 0; i < v.length; i += 5) if (v[i] === n) return { by: window.__client.meta.nationIds[v[i + 1]], share: v[i + 2], east: v[i + 3], north: v[i + 4] };
  return null;
}, node);
const boxOf = (id) => page.evaluate((id) => {
  const hs = window.__map.hits.filter((x) => x.ids.includes(id));
  const h = hs.find((x) => x.ids.length === 1) ?? hs[0];
  const r = document.querySelector('[data-testid="map"]').getBoundingClientRect();
  return h && { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
}, id);
const frame = (a, b) => page.evaluate(([a, b]) => {
  const m = window.__map;
  m.flyTo({ lon: (m.map.lon[a] + m.map.lon[b]) / 2, lat: (m.map.lat[a] + m.map.lat[b]) / 2, zoom: m.cam.zoom });
}, [a, b]).then(s.settle);

try {
  await s.settle();
  await page.click('[data-testid="zoom-front"]');
  await s.settle();
  for (const [name, target] of PAIRS) {
    const f = await unit(name);
    check(!!f, `${name} is on the map`);
    await frame(f.node, target);
    const a = await boxOf(f.entry.id), b = await s.at(target);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
    await page.waitForSelector('[data-testid="pill"]', { timeout: 10_000 });
    const pill = await page.locator('[data-testid="pill"]').textContent();
    await page.mouse.up();
    const track = await page.evaluate((id) => window.__client.tracks.list().find((t) => t.formation === id)?.state ?? null, f.entry.id);
    facts.drags.push({ name, from: f.node, target, pill, track });
    check(track !== null, `${name} dragged onto ${target}: pill "${pill}", track ${track}`);
  }
  const [mainName, main] = PAIRS[0];
  await page.evaluate((n) => { const m = window.__map; m.flyTo({ lon: m.map.lon[n], lat: m.map.lat[n] + 0.1, zoom: m.cam.zoom + 0.6 }); }, main);
  await s.settle();
  const shoot = async (tick, file) => {
    await s.runTo(tick);
    await s.settle();
    await s.shot(file);
    const f = await unit(mainName);
    const row = { tick, file, unitNode: f.node, contest: await contest(main), crawl: await contest(PAIRS[1][1]), control: await page.evaluate((n) => window.__client.meta.nationIds[window.__client.state.control[n]], main) };
    facts.frames.push(row);
    console.log(JSON.stringify(row));
    return row;
  };
  const rows = [];
  for (const tick of [6, 9, 24]) rows.push(await shoot(tick, `contest-t${tick}.png`));
  // A Russian push the AI keeps up: the contest that grew most over four days, watched for six more.
  const all = () => page.evaluate(() => {
    const v = window.__client.state.contest, out = {};
    for (let i = 0; i < v.length; i += 5) out[v[i]] = { by: window.__client.meta.nationIds[v[i + 1]], share: v[i + 2] };
    return out;
  });
  const t0 = await all();
  await s.runTo(40);
  const t1 = await all();
  const growing = Object.entries(t1).filter(([n, c]) => c.by === 'RUS' && t0[n]?.by === 'RUS').map(([n, c]) => ({ node: Number(n), from: t0[n].share, to: c.share })).sort((a, b) => b.to - b.from - (a.to - a.from));
  facts.growing = growing.slice(0, 5);
  console.log('growing', JSON.stringify(facts.growing));
  const watch = growing[0];
  if (watch) {
    await page.evaluate((n) => { const m = window.__map; m.flyTo({ lon: m.map.lon[n], lat: m.map.lat[n], zoom: m.cam.zoom }); }, watch.node);
    await s.settle();
    const seen = [];
    for (const tick of [40, 52, 64]) {
      await s.runTo(tick);
      await s.settle();
      await s.shot(`rus-push-t${tick}.png`);
      const c = (await all())[watch.node];
      const ctl = await page.evaluate((n) => window.__client.meta.nationIds[window.__client.state.control[n]], watch.node);
      seen.push({ tick, share: c?.share ?? null, control: ctl });
    }
    facts.rusPush = { node: watch.node, seen };
    console.log('rusPush', JSON.stringify(facts.rusPush));
  }
  const first = rows.find((r) => r.contest);
  check(!!first && rows[0].contest === null && first.contest.share > 0.1, `the 35th's drag pushes the line into ${main}: ${rows.map((r) => `t${r.tick} ${r.contest ? r.contest.share.toFixed(2) : '-'}`).join(', ')}`);
  const seen = facts.rusPush?.seen ?? [];
  check(seen.length === 3 && seen[2].share > seen[0].share + 0.1, `a Russian push the player watches creeps on: ${seen.map((r) => `t${r.tick} ${r.share?.toFixed(2)}`).join(', ')}`);
} finally {
  const summary = { ...(await s.summary()), facts, errors: s.errors };
  fs.writeFileSync(path.join(s.out, 'summary.json'), JSON.stringify(summary, null, 2));
  check(s.errors.length === 0, `no page errors (${s.errors.length})`);
  await s.close();
}
