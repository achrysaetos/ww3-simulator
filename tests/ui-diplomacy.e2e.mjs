// Diplomacy by dragging, as a player does: press your own flag in the top bar, drag it onto an enemy's flag (offer
// peace) and onto an ally's or neutral's (ask for help), read the pill, let go; then the engine's answer and the needle.
//   PORT=4661 VERIFY_STATE=/tmp/ww3-verify/state-decide .claude/skills/verify/scripts/launch.sh
//   node tests/ui-diplomacy.e2e.mjs http://localhost:4661/ [run name, default decide] [scenario:NATION ...]
import fs from 'node:fs';
import path from 'node:path';
import { open } from '../.claude/skills/verify/scripts/play.mjs';

const [, , url = 'http://localhost:4650/', run = 'decide', ...plays] = process.argv;
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};
const summary = {};

for (const play of plays.length ? plays : ['ukraine-2026:UKR', 'ww3-2027:USA']) {
  const tag = play.replace(':', '-');
  const s = await open({ url, play, role: 'cinc', run: `${run}/${tag}` });
  const { page } = s;
  const facts = (summary[play] = {});
  const box = (sel) => page.evaluate((q) => {
    const r = document.querySelector(q)?.getBoundingClientRect();
    return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  const pill = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="pill"]');
    return p && { text: p.textContent, tone: p.getAttribute('data-tone') };
  });
  const sent = () => page.evaluate(() => window.__client.__sent);
  /** Waits out a war flash or crisis card, which hides the top bar. */
  const clear = async () => {
    await page.click('[data-testid="moment"]', { timeout: 1000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[data-testid="moment"]') && !document.querySelector('.ww-shell.hud-off'), null, { timeout: 60_000 });
  };
  /** Presses the own flag, drags it onto `to` in steps, and returns the pill there; `release` lets go, else Esc cancels. */
  const drag = async (to, name, release) => {
    await clear();
    const a = await box('[data-testid="own-flag"]'), b = await box(`[data-testid="flag-${to}"]`);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 10, a.y + ((b.y - a.y) * i) / 10);
    await page.waitForTimeout(150);
    const p = await pill();
    await s.shot(name);
    if (release) await page.mouse.up();
    else {
      await page.keyboard.press('Escape');
      await page.mouse.up();
    }
    return p;
  };
  try {
    await s.runTo(4);
    await page.evaluate(() => {
      const c = window.__client, send = c.command.bind(c);
      c.__sent = [];
      c.command = (x) => { c.__sent.push(x); return send(x); };
    });
    await page.waitForSelector('[data-testid="flag-row"]', { timeout: 30_000 });
    await clear();
    const row = await page.evaluate(() => [...document.querySelectorAll('[data-flag]')].map((e) => ({ nation: e.getAttribute('data-flag'), stance: e.getAttribute('data-stance') })));
    facts.row = row;
    const needle = await page.evaluate(() => {
      const g = document.querySelector('[data-testid="peace-needle"]');
      return g && { text: g.textContent, value: g.getAttribute('data-value'), title: g.getAttribute('title') };
    });
    facts.needle = needle;
    check(!!needle, `${play}: the peace needle is in the top bar (${needle?.text} · ${needle?.title})`);
    await page.screenshot({ path: path.join(s.out, 'topbar.png'), clip: { x: 0, y: 0, width: 1600, height: 130 } });

    const enemy = row.find((r) => r.stance === 'enemy');
    check(!!enemy, `${play}: an enemy flag is in the row`);
    if (enemy) {
      const cancelled = await drag(enemy.nation, 'pill-cancel.png', false);
      check(!!cancelled && (await sent()).length === 0, `${play}: Esc drops the drag and sends nothing`);
      const p = await drag(enemy.nation, 'pill-peace.png', true);
      facts.peacePill = p;
      check(!!p && /Offer peace|Accept peace|Cannot offer peace/.test(p.text), `${play}: the pill over ${enemy.nation} reads "${p?.text}" (${p?.tone})`);
      const after = await sent();
      facts.sentOnPeace = after;
      check(p?.tone === 'refused' ? after.length === 0 : after.length === 1 && after[0].type === 'offer_peace' && after[0].target === enemy.nation, `${play}: release sent ${JSON.stringify(after)}`);
      await page.evaluate(() => window.__client.step());
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__client.step());
      await page.waitForTimeout(1500);
      const answer = await page.evaluate((e) => {
        const c = window.__client, d = c.state.focusNation;
        return {
          stillAtWar: c.state.wars.some(([a, b]) => (a === c.playing && b === e) || (b === c.playing && a === e)),
          offerOnTable: !!d?.peaceOffers.some((o) => o.from === c.playing && o.to === e),
          log: c.feed?.items?.slice?.(-6)?.map((i) => i.text) ?? null,
        };
      }, enemy.nation);
      facts.engineAnswer = answer;
      check(answer.stillAtWar ? answer.offerOnTable || p?.tone === 'refused' : true, `${play}: the engine answered: ${answer.stillAtWar ? (answer.offerOnTable ? 'refused, offer on the table' : 'no offer stands') : 'peace made'}`);
      await page.screenshot({ path: path.join(s.out, 'after-offer.png'), clip: { x: 0, y: 0, width: 1600, height: 130 } });
      if (answer.offerOnTable) {
        const again = await drag(enemy.nation, 'pill-again.png', true);
        check(again?.tone === 'refused' && (await sent()).length === after.length, `${play}: a second drop while the offer stands is refused and sends nothing ("${again?.text}")`);
      }
    }

    const friend = row.find((r) => r.stance === 'ally') ?? row.find((r) => r.stance === 'pending') ?? row.find((r) => r.stance === 'neutral');
    check(!!friend, `${play}: an ally or neutral flag is in the row`);
    if (friend) {
      const before = (await sent()).length;
      const p = await drag(friend.nation, 'pill-ally.png', true);
      facts.allyPill = { nation: friend.nation, stance: friend.stance, ...p };
      check(p?.tone === 'refused' && (await sent()).length === before, `${play}: dropping on ${friend.nation} (${friend.stance}) explains and sends nothing ("${p?.text}")`);
    }
    facts.errors = s.errors;
    check(s.errors.length === 0, `${play}: no page errors${s.errors.length ? `: ${s.errors.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    check(false, `${play}: ${e.message}`);
    await s.shot('error.png').catch(() => {});
  } finally {
    await s.close();
  }
}
const out = path.join('/tmp/ww3-verify/runs', run);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ failures, ...summary }, null, 2));
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log('all passed');
