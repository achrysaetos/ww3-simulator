import { describe, expect, it } from 'vitest';
import { Engine, type System } from '../src/core/engine';
import type { NationId, SimEvent } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { createDiplomacy } from '../src/systems/diplomacy';
import type { Assessment } from '../src/systems/diplomacy';
import { economy } from '../src/systems/economy';
import { politics } from '../src/systems/politics';
import { id, testCatalog } from '../src/testkit';

const USA = id.nation('USA'), RUS = id.nation('RUS'), CHN = id.nation('CHN'), UKR = id.nation('UKR');
const DAY = 4;

function world(systems: System[], startDate: string, seed = 1) {
  const map = loadMap();
  const engine = new Engine(map, testCatalog(), systems);
  const w = createWorld(map, { seed, startDate });
  w.nations[USA].government = 'flawed_democracy';
  w.nations[RUS].government = 'authoritarian';
  engine.init(w);
  const fight = (a: NationId, b: NationId) => {
    const r = (w.relations[a < b ? `${a}|${b}` : `${b}|${a}`] ??= { opinion: 0, atWar: false, escalation: 'peace', sanctions: false });
    r.atWar = true;
    w.nations[a].status = 'war';
    w.nations[b].status = 'war';
  };
  const assess = (n: NationId, a: Partial<Assessment>) => {
    const d = ((w.slices as { diplomacy?: { assessment: Record<string, Assessment> } }).diplomacy ??= { assessment: {} });
    d.assessment[n] = { areaLost: 0, popLost: 0, capitalLost: false, capitalThreatened: false, ...a };
  };
  return { map, engine, world: w, fight, assess };
}

const battle = (tick: number, casualties: Record<string, number>): SimEvent => ({ type: 'battle', tick, node: id.node(0), attacker: USA, defender: CHN, losses: {}, casualties, domain: 'sea' });

describe('domestic politics', () => {
  it('holds the US presidential election on 7 November 2028, and a government that has lost the war loses office', () => {
    let lost = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const t = world([politics], '2028-11-06T00:00:00Z', seed);
      t.fight(USA, CHN);
      t.world.nations[USA].warSupport = 0.2;
      t.engine.run(t.world, 3);
      expect(t.world.slices.politics.nations[USA].elections).toEqual([]);
      t.engine.run(t.world, 2);
      const [e] = t.world.slices.politics.nations[USA].elections;
      expect(e).toMatchObject({ date: '2028-11-07T00:00:00Z', kind: 'presidential', approval: 0.2 });
      if (!e.incumbentWon) {
        lost++;
        expect(t.world.slices.politics.nations[USA].drivers.election).toBeCloseTo(-0.12);
      }
    }
    expect(lost).toBeGreaterThanOrEqual(9);
  });

  it('re-elects a government whose war is popular, and holds no vote in an autocracy', () => {
    let won = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const t = world([politics], '2028-11-06T00:00:00Z', seed);
      t.fight(USA, CHN);
      t.fight(RUS, UKR);
      t.world.nations[USA].warSupport = 0.75;
      t.engine.run(t.world, 2 * DAY);
      if (t.world.slices.politics.nations[USA].elections[0].incumbentWon) won++;
      expect(t.world.slices.politics.nations[RUS].elections).toEqual([]);
    }
    expect(won).toBeGreaterThanOrEqual(8);
  });

  it('lets a US aid package lapse at the fiscal year when support has fallen, which stops the arms pipeline', () => {
    const t = world([economy, politics], '2026-09-20T00:00:00Z');
    t.fight(RUS, UKR);
    t.world.nations[USA].stockpile[id.platform('pac3_mse')] = 1e4;
    const delivered = () => t.world.slices.economy.aid['USA>UKR:pac3_mse']?.delivered ?? 0;
    t.engine.run(t.world, 5 * DAY);
    const before = delivered();
    expect(before).toBeGreaterThan(0);
    expect(t.world.slices.politics.nations[USA].aid?.continues).toBe(true);

    t.world.slices.politics.nations[USA].mandate = -0.2;
    t.engine.run(t.world, 7 * DAY);
    const aid = t.world.slices.politics.nations[USA].aid!;
    expect(aid.continues).toBe(false);
    const atLapse = delivered();
    t.engine.run(t.world, 20 * DAY);
    expect(delivered()).toBe(atLapse);

    t.world.slices.politics.nations[USA].mandate = 0.1;
    t.engine.run(t.world, 31 * DAY);
    expect(aid.continues).toBe(true);
    expect(delivered()).toBeGreaterThan(atLapse);
  });

  it('charges war support for mobilisation beyond what the public bears, unless the homeland is invaded', () => {
    const t = world([politics], '2027-01-01T00:00:00Z');
    t.fight(USA, CHN);
    t.world.nations[USA].mobilization = 0.8;
    t.engine.step(t.world);
    const p = t.world.slices.politics.nations[USA];
    expect(p.mobilizationTolerance).toBeLessThan(0.5);
    expect(p.drivers.mobilization).toBeLessThan(-0.1);

    t.assess(USA, { popLost: 0.1 });
    t.engine.step(t.world);
    expect(p.mobilizationTolerance).toBeGreaterThan(0.85);
    expect(p.drivers.mobilization).toBe(0);
  });

  it('erodes support with the recent casualty rate, which fades once the dying stops', () => {
    const t = world([politics], '2027-04-01T00:00:00Z');
    t.fight(USA, CHN);
    for (let i = 0; i < 30 * DAY; i++) {
      t.world.events = [battle(t.world.tick, { USA: 300 / DAY, CHN: 300 / DAY })];
      politics.step(t.world, t.engine.context(t.world));
      t.world.tick++;
    }
    const usa = t.world.slices.politics.nations[USA], chn = t.world.slices.politics.nations[CHN];
    // ~9k a month on 340M people, a Vietnam-1968 rate: several points of support.
    expect(usa.drivers.losses).toBeLessThan(-0.03);
    // The same toll on 1.4bn people under an authoritarian state barely registers.
    expect(chn.drivers.losses).toBeGreaterThan(usa.drivers.losses / 4);
    const peak = usa.drivers.losses;
    t.world.events = [];
    t.engine.run(t.world, 90 * DAY);
    expect(usa.drivers.losses).toBeGreaterThan(peak / 10);
  });

  it('brings protests and elite defection to an autocracy losing badly', () => {
    const t = world([politics], '2027-01-01T00:00:00Z');
    t.fight(RUS, UKR);
    t.assess(RUS, { popLost: 0.4, capitalThreatened: true });
    for (let i = 0; i < 10 * DAY; i++) {
      t.world.events = [battle(t.world.tick, { RUS: 20_000 / DAY })];
      politics.step(t.world, t.engine.context(t.world));
      t.world.tick++;
    }
    const p = t.world.slices.politics.nations[RUS];
    expect(p.stability).toBeLessThan(0.5);
    expect(p.protesting).toBe(true);
    expect(p.drivers.unrest).toBeLessThan(0);
  });

  it('feeds its shift into the war support diplomacy computes', () => {
    const run = (systems: System[]) => {
      const t = world(systems, '2027-01-01T00:00:00Z');
      t.world.pending.push({ type: 'declare_war', nation: USA, target: CHN });
      t.engine.run(t.world, 2);
      t.world.nations[USA].mobilization = 0.9;
      t.engine.run(t.world, DAY);
      return t.world.nations[USA].warSupport;
    };
    const alone = run([createDiplomacy()]);
    const withPolitics = run([politics, createDiplomacy()]);
    expect(withPolitics).toBeLessThan(alone - 0.1);
  });
});
