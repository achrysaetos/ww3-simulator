import { describe, expect, it } from 'vitest';
import { platformCount } from '../src/core/forces';
import type { Formation, NationId, NodeId, SimEvent } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';

/**
 * Full-scenario probes of the ground war, run as a staff would: both sides' land formations are held from the AI
 * (`freeze`), so the AI neither reinforces nor withdraws and only the combat and movement physics decide.
 */
const SCENARIO_MS = 300_000;

function session(scenario: string, frozen: string[], seed = 1) {
  const s = createSession(scenario, seed);
  const events: SimEvent[] = [];
  for (const n of frozen) {
    s.world.nations[n as NationId].controlledBy = 'human';
    const mine = Object.values(s.world.formations).filter((f) => f.nation === n).map((f) => f.id);
    s.world.pending.push({ type: 'hold', nation: n as NationId, formations: mine, held: true });
  }
  const perDay = Math.round(24 / s.world.dtHours);
  const days = (n: number, onDay?: (day: number) => void) => {
    for (let i = 0; i < n * perDay; i++) {
      events.push(...s.engine.step(s.world));
      if ((i + 1) % perDay === 0) onDay?.(s.world.tick / perDay);
    }
  };
  const attack = (fs: Formation[], target: NodeId) => {
    for (const f of fs) s.world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: { posture: 'attack', target } });
  };
  const contestKm = (node: NodeId) => s.world.slices.land.contest[node]?.km ?? 0;
  return { ...s, events, days, attack, contestKm };
}

const landForces = (s: Session, nation: string, kinds = ['maneuver']) =>
  Object.values(s.world.formations).filter((f) => f.nation === nation && kinds.includes(f.kind) && f.status === 'active' && f.node < s.map.landCount);

/** Moves formations to a cell as if by rail over the preceding weeks, fresh and fully supplied. */
function stage(fs: Formation[], node: NodeId) {
  for (const f of fs) {
    f.node = node;
    f.supply = { ...f.supplyCapacity };
    f.fatigue = 0;
  }
}

describe('ukraine-2026 start line', () => {
  it('the Dnipro left bank down to the Kinburn spit starts Russian-held, across the river from Kherson', () => {
    const { map, world } = createSession('ukraine-2026', 1);
    const kherson = map.nodeAt(46.64, 32.6);
    expect(world.control[kherson]).toBe('UKR');
    for (const lon of [32.25, 32.75, 33.25, 33.75]) expect(world.control[map.nodeAt(46.25, lon)]).toBe('RUS');
    expect(map.riverBetween(kherson, map.nodeAt(46.25, 32.75))).toBe('Dnipro');
    expect(map.riverBetween(kherson, map.nodeAt(46.75, 32.25))).toBeUndefined();
  }, SCENARIO_MS);
});

describe('fortified but empty ground', () => {
  // Kursk, 6-12 August 2024: Ukraine massed brigades in secret near Sumy and went 25-30 km deep in a week through
  // Russia's fortified, thinly held border (ISW). Cell 6239 (51.75N 34.25E, forest) is a fortified Russian border cell
  // with no garrison, covered by one big formation next door; the thrust stages at better than 3:1 against it.
  it('a Kursk-2024-style thrust goes 10+ km in its first 3 days in the cell and takes it within days', () => {
    const s = session('ukraine-2026', ['UKR', 'RUS']);
    const target = s.map.nodeAt(51.75, 34.25);
    expect(s.world.slices.land.fortified[target]).toBe(1);
    expect(landForces(s, 'RUS').some((f) => f.node === target)).toBe(false);
    const from = [...s.map.neighbors(target)].find((n) => s.world.control[n] === 'UKR')!;
    const cover = [...s.map.neighbors(target)].flatMap((n) => landForces(s, 'RUS').filter((f) => f.node === n)).reduce((a, f) => a + platformCount(f), 0);
    const force: Formation[] = [];
    for (const f of landForces(s, 'UKR').filter((g) => !g.territorial).sort((a, b) => platformCount(b) - platformCount(a)))
      if (force.reduce((a, g) => a + platformCount(g), 0) < 3.5 * cover) force.push(f);
    stage(force, from);
    s.attack(force, target);
    let entered = -1, taken = -1;
    const km: number[] = [];
    s.days(10, (d) => {
      if (entered < 0 && force.some((f) => f.node === target)) entered = d;
      km[d] = s.world.control[target] === 'UKR' ? Infinity : s.contestKm(target);
      if (taken < 0 && s.world.control[target] === 'UKR') taken = d;
    });
    console.log(`Kursk probe: ${force.length} formations vs ${cover} platforms of cover; entered day ${entered}, km ${km.map((k, d) => `${d}:${k.toFixed(1)}`).join(' ')}, taken day ${taken}`);
    expect(entered).toBeGreaterThan(0);
    expect(km[entered + 3] - km[entered]).toBeGreaterThanOrEqual(10);
    expect(taken).toBeGreaterThan(0);
    expect(taken - entered).toBeLessThanOrEqual(9);
  }, SCENARIO_MS);
});

describe('concentration of force', () => {
  // Belgorod cell 6502 into the forest cell 6736 north of Kharkiv. Fortified, it is held by two and a half Ukrainian
  // brigades (734 platforms) behind the standing belt; as a hasty line, the belt is gone and more brigades stand in it
  // so the line is manned across the cell. The planning ratios: 3:1 for a deliberate assault (FM 3-90), and several
  // times that on a breakthrough sector (Glantz and House, 1995). Ratios here are of platforms.
  const ladder = (ratio: number, hasty: boolean) => {
    const s = session('ukraine-2026', ['UKR', 'RUS']);
    const from = 6502 as NodeId, target = 6736 as NodeId;
    const held = () => landForces(s, 'UKR').filter((f) => f.node === target);
    if (hasty) {
      delete s.world.slices.land.fortified[target];
      for (const f of landForces(s, 'UKR').filter((g) => g.node !== target).sort((a, b) => platformCount(b) - platformCount(a))) {
        if (held().reduce((a, g) => a + platformCount(g), 0) >= 1400) break;
        f.node = target;
      }
    }
    const def = held().reduce((a, f) => a + platformCount(f), 0);
    const force: Formation[] = [];
    for (const f of landForces(s, 'RUS').filter((g) => !g.territorial).sort((a, b) => platformCount(b) - platformCount(a)))
      if (force.reduce((a, g) => a + platformCount(g), 0) < ratio * def) force.push(f);
    stage(force, from);
    s.attack(force, target);
    s.days(5);
    return { km: s.world.control[target] === 'RUS' ? Infinity : s.contestKm(target), ratio: force.reduce((a, f) => a + platformCount(f), 0) / def };
  };

  // Drone-watched, fortified, no air superiority: the 2024-25 record (Avdiivka took four months at several to one).
  // Against a hasty line the kill zone is not there and mass breaks through at the pace of 1973 or Kharkiv 2022.
  // Contest km is the advance averaged over the cell's width: against the belt only the first echelon fills a
  // sector, so 0.5 km is ~20 km2 of the cell in five days.
  it('9:1 gains clearly more than 3:1, a little against a fortified line and fast against a hasty one', () => {
    const curve = [ladder(3, false), ladder(9, false), ladder(3, true), ladder(9, true)];
    console.log(`ladder (5 days): ${curve.map((c, i) => `${i < 2 ? 'fortified' : 'hasty'} ${c.ratio.toFixed(1)}:1 -> ${c.km.toFixed(1)} km`).join(', ')}`);
    const [fort3, fort9, hasty3, hasty9] = curve;
    expect(fort3.km).toBeLessThan(0.2);
    expect(fort9.km).toBeGreaterThanOrEqual(0.5);
    expect(hasty9.km).toBeGreaterThanOrEqual(30);
    expect(hasty9.km).toBeGreaterThan(1.5 * hasty3.km);
  }, SCENARIO_MS);
});

describe('breaking contact', () => {
  // The 6736 garrison pulls back one cell, once in quiet and once while a 3:1 assault from 6502 is on it. A unit under
  // assault leaves by bounds behind a covering force (FM 3-90); Avdiivka and Debalteve were slow, costly exits.
  const exitTick = (pressed: boolean) => {
    const s = session('ukraine-2026', ['UKR', 'RUS']);
    const from = 6502 as NodeId, target = 6736 as NodeId;
    const garrison = landForces(s, 'UKR').filter((f) => f.node === target);
    const rear = [...s.map.neighbors(target)].find((n) => n < s.map.landCount && s.world.control[n] === 'UKR' && ![...s.map.neighbors(n)].includes(from))!;
    if (pressed) {
      const def = garrison.reduce((a, f) => a + platformCount(f), 0);
      const force: Formation[] = [];
      for (const f of landForces(s, 'RUS').filter((g) => !g.territorial).sort((a, b) => platformCount(b) - platformCount(a)))
        if (force.reduce((a, g) => a + platformCount(g), 0) < 3 * def) force.push(f);
      stage(force, from);
      s.attack(force, target);
    }
    s.days(2);
    expect(s.world.control[target]).toBe('UKR');
    for (const f of garrison) s.world.pending.push({ type: 'order', nation: f.nation, formation: f.id, order: { posture: 'move', target: rear } });
    for (let t = 1; t <= 40; t++) {
      s.engine.step(s.world);
      if (garrison.every((f) => f.node !== target)) return t;
    }
    return Infinity;
  };

  it('a garrison under assault takes far longer to get out than one in quiet', () => {
    const quiet = exitTick(false), pressed = exitTick(true);
    console.log(`break contact: quiet ${quiet} ticks, under assault ${pressed} ticks`);
    expect(quiet).toBeLessThan(Infinity);
    expect(pressed).toBeGreaterThanOrEqual(2 * quiet);
  }, SCENARIO_MS);
});

describe('river lines', () => {
  // Kherson across the Dnipro into the fortified left-bank cell 7483 (Nova Kakhovka-Oleshky), held by a Russian
  // division and a brigade. The same force attacking from a foothold already on the left bank (7698 handed to
  // Ukraine) needs no crossing. Krynky 2023-24 never grew past a few km; FM 3-90.12.
  const assault = (dry: boolean) => {
    const s = session('ukraine-2026', ['UKR', 'RUS']);
    const kherson = s.map.nodeAt(46.64, 32.6), target = s.map.nodeAt(46.75, 33.25), foothold = s.map.nodeAt(46.25, 32.75);
    expect(s.map.riverBetween(kherson, target)).toBe('Dnipro');
    expect(s.map.riverBetween(foothold, target)).toBeUndefined();
    if (dry) s.world.control[foothold] = 'UKR' as NationId;
    const force = landForces(s, 'UKR').sort((a, b) => platformCount(b) - platformCount(a)).slice(0, 20);
    const before = force.reduce((a, f) => a + platformCount(f), 0);
    stage(force, dry ? foothold : kherson);
    s.attack(force, target);
    s.days(8);
    return { km: s.world.control[target] === 'UKR' ? Infinity : s.contestKm(target), lost: before - force.reduce((a, f) => a + platformCount(f), 0) };
  };

  it('crossing the Dnipro against a defended bank gains a fraction of the ground at a far higher price', () => {
    const river = assault(false), dry = assault(true);
    console.log(`Dnipro: across ${river.km.toFixed(1)} km for ${river.lost} platforms; dry ${dry.km.toFixed(1)} km for ${dry.lost}`);
    // The scenario opens in the southern spring thaw, so even the dry assault wades through mud, and against a dug-in
    // division only its first echelon fills a sector of the cell's width.
    expect(dry.km).toBeGreaterThan(0.5);
    expect(river.km).toBeLessThan(0.3 * dry.km);
    expect(river.lost / Math.max(0.5, river.km)).toBeGreaterThan(3 * (dry.lost / dry.km));
  }, SCENARIO_MS);
});

describe('supply and manoeuvre', () => {
  // The Kursk thrust again, with the border belt cleared, then the ring closes behind it: every Ukrainian cell next to
  // the brigades goes Russian.
  // A cut-off force with dry tanks stops (Kampfgruppe Peiper, Ardennes 1944); the same force with fuel still presses.
  const pocket = (dry: boolean) => {
    const s = session('ukraine-2026', ['UKR', 'RUS']);
    const target = s.map.nodeAt(51.75, 34.25), from = s.map.nodeAt(50.75, 34.75);
    const brigades = landForces(s, 'UKR').sort((a, b) => s.map.distanceKm(a.node, from) - s.map.distanceKm(b.node, from)).slice(0, 7);
    delete s.world.slices.land.fortified[target];
    s.attack(brigades, target);
    s.days(2);
    expect(brigades.every((f) => f.node === target)).toBe(true);
    for (const n of s.map.neighbors(target)) if (n < s.map.landCount && s.world.control[n] === 'UKR') s.world.control[n] = 'RUS' as NationId;
    const drain = () => {
      if (dry) for (const f of brigades) f.supply.fuel = 0;
    };
    drain();
    // Encirclement is reckoned once a day, so the pocket is known by the end of the second day.
    s.days(2, drain);
    const start = s.contestKm(target);
    s.days(3, drain);
    return { cut: brigades.every((f) => f.id in s.world.slices.land.isolatedDays), km: s.world.control[target] === 'UKR' ? Infinity : s.contestKm(target) - start };
  };

  it('an encircled formation at fuel 0 does not advance', () => {
    const dry = pocket(true), fuelled = pocket(false);
    console.log(`pocket: dry ${dry.km.toFixed(1)} km, fuelled ${fuelled.km.toFixed(1)} km in 3 days`);
    expect(dry.cut).toBe(true);
    expect(dry.km).toBe(0);
    expect(fuelled.km).toBeGreaterThan(3);
  }, SCENARIO_MS);
});
