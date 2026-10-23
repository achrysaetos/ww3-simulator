import { describe, expect, it } from 'vitest';
import type { FormationId, NationId } from '../src/core/types';
import { Rng } from '../src/core/rng';
import { loadMap } from '../src/data/load';
import { QUICK as TABLES } from '../src/forecast/quick';
import { interceptSalvo, type SalvoDefense, type SalvoThreat } from '../src/systems/air/intercept';
import { axesAt, coverAxes, coveredAt, estimateHold, estimateStrike, estimateTake, pillText, quickAt, type Pill } from '../src/ui/drag/estimate';
import type { Target } from '../src/ui/drag/gesture';
import { FORCE, LAND_TARGETS, type BeliefField, type DragKit, type SubjectUnit } from '../src/ui/drag/kit';

const map = loadMap();
const t = map.nodeAt(48.5, 37.5);
const T = TABLES.open.bare;
const from = [...map.neighbors(t)][0];
const target: Target = { kind: 'enemy_ground', node: t, contact: null };

/** `n` armoured platforms putting out `fire` kills an engaged hour on armour, one each unless asked. */
function force(n: number, fire = n): Float32Array {
  const f = new Float32Array(FORCE);
  f[1] = n;
  f[LAND_TARGETS.length + 1] = fire;
  return f;
}

function unit(platforms: number, extra: Partial<SubjectUnit> = {}): SubjectUnit {
  return { id: `u${platforms}` as FormationId, cls: 'ground', kind: 'maneuver', node: from, power: platforms, force: force(platforms), strength: 1, kmPerDay: 100, strikeKm: 0, patrolKm: 0, ferryKm: 0, salvo: 0, c2DelayHours: 0, ...extra };
}

function believe(field: BeliefField, n: number, platforms: number, conf = 1, ageH = 0, fire = platforms): void {
  field.enemyPower[n] = fire;
  field.enemyForce.set(force(platforms, fire), n * FORCE);
  field.enemyLine.set(force(platforms, fire), n * FORCE);
  field.enemyConf[n] = conf;
  field.enemyAgeH[n] = ageH;
  field.hostile[n] = 1;
}

/** A kit with one believed enemy force at `at` (the target cell unless asked) and nothing else on the map. */
function kit(enemy: { platforms: number; fire?: number; conf?: number; ageH?: number; dig?: number }, units: SubjectUnit[], extra: Partial<DragKit> = {}, at = t): DragKit {
  const size = map.size, land = map.landCount * FORCE;
  const field: BeliefField = {
    tick: 0, enemyPower: new Float32Array(size), enemyForce: new Float32Array(land), enemyGuns: new Float32Array(land), enemyLine: new Float32Array(land), enemyConf: new Float32Array(size), enemyAgeH: new Float32Array(size).fill(Infinity),
    enemyDig: new Float32Array(size), ground: new Float32Array(size).fill(1), supply: new Uint8Array(size).fill(100), hostile: new Uint8Array(size), river: new Uint8Array(size), ownForce: new Float32Array(land), ownGuns: new Float32Array(land),
  };
  believe(field, at, enemy.platforms, enemy.conf, enemy.ageH, enemy.fire);
  field.enemyDig[at] = enemy.dig ?? 0;
  const km = new Float32Array(size).fill(50);
  return { tick: 0, player: 'RUS' as NationId, sides: new Uint8Array(0), units, field, routes: units.map((u) => ({ from: u.node, marchKm: km, assaultKm: km, assaultVia: null, seaKm: null })).slice(0, 1), sites: [], contacts: {}, ...extra };
}

const take = (k: DragKit, at = target) => {
  const p = estimateTake(k, k.units, at, [at.node], map);
  if (p.kind !== 'take') throw new Error(p.kind);
  return p;
};

/**
 * A cell in the steep middle of the open table, where every input visibly moves the odds, with the attacking
 * platforms and the defending platforms and fire that read as it on `at`.
 */
function steep(at = t): { att: number; def: number; fire: number } {
  const p = (i: number, j: number, k: number) => T.cells[i]?.[j]?.[k]?.pTake ?? NaN;
  const ok = (i: number, j: number, k: number) => p(i, j, k) > 0.2 && p(i, j, k) < 0.8 && p(i + 1, j, k) >= p(i, j, k) && p(i, j + 1, k) >= p(i, j, k) && !(p(i, j, k + 1) > p(i, j, k));
  const cells = T.cells.flatMap((row, i) => row.flatMap((ms, j) => ms.map((_, k) => [i, j, k])));
  const [i, j, k] = cells.find(([i, j, k]) => ok(i, j, k))!;
  const unit = axesAt(map, at, force(1), force(1), 0);
  const att = TABLES.shares[j] / unit.s, def = TABLES.manned[k] / unit.m;
  return { att, def, fire: (def * axesAt(map, at, force(att), force(def), 0).r) / TABLES.ratios[i] };
}

describe('the take estimate', () => {
  it('reads the duel table at the fire ratio and front share the engine fights at', () => {
    const { att, def, fire } = steep();
    const k = kit({ platforms: def, fire }, [unit(att)]);
    expect(take(k).p.mid).toBeCloseTo(quickAt(axesAt(map, t, force(att), force(def, fire), 0)).pTake, 6);
  });

  it('rises with more attackers and falls with more defenders, worse terrain or deeper entrenchment', () => {
    const { att, def, fire } = steep();
    const base = take(kit({ platforms: def, fire }, [unit(att)])).p.mid;
    expect(base).toBeGreaterThan(0.1);
    expect(base).toBeLessThan(0.9);
    expect(take(kit({ platforms: def, fire }, [unit(att), unit(0.3 * att)])).p.mid).toBeGreaterThan(base);
    expect(take(kit({ platforms: 1.3 * def, fire: 1.3 * fire }, [unit(att)])).p.mid).toBeLessThan(base);
    expect(take(kit({ platforms: def, fire, dig: 1 }, [unit(att)])).p.mid).toBeLessThan(base);
    const across = kit({ platforms: def, fire }, [unit(att)]);
    across.field.river[t] = 1;
    expect(take(across).p.mid).toBeLessThan(base);
    const forest = map.nodeAt(50.25, 34.75);
    expect(map.terrain[forest]).toBe('forest');
    const into = { kind: 'enemy_ground' as const, node: forest, contact: null };
    const near = [...map.neighbors(forest)][0];
    expect(take(kit({ platforms: def, fire }, [unit(att, { node: near })], {}, forest), into).p.mid).toBeLessThan(base);
  });

  it('needs every enemy cell on the way taken first', () => {
    const { att, def, fire } = steep();
    const k = kit({ platforms: def, fire }, [unit(3 * att)]);
    const mid = [...map.neighbors(t)].find((m) => m !== from && [...map.neighbors(from)].includes(m))!;
    const via = new Int32Array(map.size).fill(-1);
    via[t] = mid;
    via[mid] = from;
    k.routes[0].assaultVia = via;
    expect(take(k).p.mid, 'through a friendly cell').toBe(take(kit({ platforms: def, fire }, [unit(3 * att)])).p.mid);
    believe(k.field, mid, 3 * def, 1, 0, 3 * fire);
    const through = take(k).p.mid;
    k.routes[0].assaultVia = null;
    expect(through).toBeLessThan(take(k).p.mid);
  });

  it('crosses an empty cell at the odds against the line next to it, slower the stronger that line', () => {
    const side = [...map.neighbors(t)].find((m) => m !== from && m < map.landCount)!;
    const odds = (platforms: number) => {
      const k = kit({ platforms: 0 }, [unit(400)]);
      believe(k.field, side, platforms);
      return take(k);
    };
    const weak = odds(20), strong = odds(400);
    expect(weak.p.mid).toBeCloseTo(coveredAt(coverAxes(map, t, force(400), force(20))).pTake, 6);
    expect(weak.caveats).toContain('nothing_seen');
    expect(strong.p.mid).toBeLessThan(weak.p.mid);
  });

  it('widens its band as confidence in the defenders falls or the fix ages', () => {
    const { att, def, fire } = steep();
    const width = (p: { lo: number; hi: number }) => p.hi - p.lo;
    const sure = take(kit({ platforms: def, fire }, [unit(att)])).p;
    expect(width(sure)).toBeCloseTo(0, 6);
    const unsure = take(kit({ platforms: def, fire, conf: 0.4 }, [unit(att)])).p;
    expect(width(unsure)).toBeGreaterThan(0.15);
    expect(width(take(kit({ platforms: def, fire, conf: 0.4, ageH: 72 }, [unit(att)])).p)).toBeGreaterThan(width(unsure));
    expect(unsure.lo).toBeLessThanOrEqual(unsure.mid);
    expect(unsure.mid).toBeLessThanOrEqual(unsure.hi);
  });

  it('reads the unopposed row and says nothing was seen when no defender is believed there', () => {
    const p = take(kit({ platforms: 0 }, [unit(10)]));
    expect(p.caveats).toContain('nothing_seen');
    expect(p.p.mid).toBe(T.unopposed.pTake);
  });

  it('interpolates QUICK in the log of each axis and clamps at its ends', () => {
    const { ratios: R, shares: S, manned: M } = TABLES;
    const [i, j, k] = [R.length - 3, 3, 1];
    const p = (i: number, j: number, k: number) => T.cells[i][j][k].pTake;
    const mid = (a: readonly number[], x: number) => Math.sqrt(a[x] * a[x + 1]);
    expect(quickAt({ r: mid(R, i), s: S[j], m: M[k] }).pTake).toBeCloseTo((p(i, j, k) + p(i + 1, j, k)) / 2, 6);
    expect(quickAt({ r: R[i], s: mid(S, j), m: M[k] }).pTake).toBeCloseTo((p(i, j, k) + p(i, j + 1, k)) / 2, 6);
    expect(quickAt({ r: R[i], s: S[j], m: mid(M, k) }).pTake).toBeCloseTo((p(i, j, k) + p(i, j, k + 1)) / 2, 6);
    expect(quickAt({ r: R[0] / 10, s: S[0] / 10, m: M[0] / 10 }).pTake).toBe(p(0, 0, 0));
    const last = (a: readonly number[]) => a.length - 1;
    expect(quickAt({ r: R[last(R)] * 10, s: S[last(S)] * 10, m: M[last(M)] * 10 }).pTake).toBe(p(last(R), last(S), last(M)));
  });
});

describe('the hold estimate', () => {
  const ring = (platforms: number) => {
    const k = kit({ platforms: 0 }, [unit(100)]);
    k.field.hostile[t] = 0;
    for (const n of map.neighbors(t)) believe(k.field, n, platforms);
    const p = estimateHold(k, k.units, { kind: 'own_ground', node: t, contact: null }, [t], map);
    if (p.kind !== 'hold') throw new Error(p.kind);
    return p.days;
  };

  it('holds longer with less enemy around, and sees no threat when there is none', () => {
    expect(ring(0)).toEqual({ lo: Infinity, mid: Infinity, hi: Infinity });
    const heavy = ring(120), light = ring(40);
    expect(heavy.mid).toBeLessThan(light.mid);
    expect(Number.isFinite(heavy.mid)).toBe(true);
  });
});

describe('the strike estimate', () => {
  const threat: SalvoThreat = { count: 0, speedMach: 0.8, interceptDifficulty: 0.2 };
  const strike = (sites: { defense: SalvoDefense; conf?: number }[], salvo: number) => {
    const u = unit(1, { cls: 'air', kind: 'air_wing', salvo, threat: { ...threat, count: salvo }, strikeKm: 1000 });
    const k = kit({ platforms: 0 }, [u], { sites: sites.map((x) => ({ node: t, defense: x.defense, conf: x.conf ?? 1, ageH: 0 })) });
    const p = estimateStrike(k, k.units, target, [t], map);
    if (p.kind !== 'strike') throw new Error(p.kind);
    return p;
  };
  const mean = (n: number, defs: SalvoDefense[]) => {
    let sum = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = new Rng(seed);
      let left = n;
      for (const d of defs) left = interceptSalvo({ ...threat, count: left }, d, rng).leaked;
      sum += left;
    }
    return sum / 2000;
  };

  it('expects the leak the engine’s salvo math gives on average, through each covering defence in turn', () => {
    const long: SalvoDefense = { channels: 6, interceptors: 16, pk: 0.7, rangeKm: 120 };
    const short: SalvoDefense = { channels: 3, interceptors: 8, pk: 0.6, rangeKm: 30 };
    for (const [n, defs] of [[12, [long]], [24, [long, short]], [60, [long, short]]] as const) {
      const p = strike(defs.map((defense) => ({ defense })), n);
      const want = mean(n, [...defs]);
      expect(p.of).toBe(n);
      expect(Math.abs(p.through.mid - want), `${n} rounds: ${p.through.mid} vs ${want}`).toBeLessThanOrEqual(0.05 * want);
    }
  });

  it('lets more through when the defence is less certain, and all through with none', () => {
    const defense: SalvoDefense = { channels: 6, interceptors: 16, pk: 0.7, rangeKm: 120 };
    const p = strike([{ defense, conf: 0.4 }], 20);
    expect(p.through.hi).toBeGreaterThan(p.through.mid);
    expect(p.through.lo).toBeLessThan(p.through.mid);
    expect(strike([], 20).through).toEqual({ lo: 20, mid: 20, hi: 20 });
  });
});

describe('pill wording', () => {
  const who = { going: 2, staying: 0 };
  const cases: [Pill, ReturnType<typeof pillText>][] = [
    [{ kind: 'take', who, caveats: [], p: { lo: 0.62, mid: 0.64, hi: 0.66 }, loss: 0.26, etaHours: 30 }, { primary: '64% to take it', secondary: 'lose about a quarter · there in ~1 day', tone: 'good' }],
    [{ kind: 'take', who: { going: 2, staying: 1 }, caveats: ['intel_old'], p: { lo: 0.3, mid: 0.4, hi: 0.5 }, loss: 0.02, etaHours: 8 }, { primary: '30-50% to take it', secondary: 'light losses · there in ~8 h · intel is days old · 1 stays', tone: 'even' }],
    [{ kind: 'take', who, caveats: [], p: { lo: 0.5, mid: 0.52, hi: 0.55 }, loss: 0.1, etaHours: 5, refined: { lo: 0.4, mid: 0.58, hi: 0.7 } }, { primary: '52% to take it', secondary: 'lose about a tenth · there in ~5 h · staff check 58%', tone: 'even' }],
    [{ kind: 'hold', who, caveats: [], days: { lo: 14, mid: 21, hi: 28 }, etaHours: 0, cells: 1 }, { primary: 'likely holds 2-4 weeks', secondary: 'goes at once', tone: 'good' }],
    [{ kind: 'hold', who, caveats: [], days: { lo: Infinity, mid: Infinity, hi: Infinity }, etaHours: 50, cells: 1 }, { primary: 'no threat seen nearby', secondary: 'there in ~2 days', tone: 'good' }],
    [{ kind: 'hold', who, caveats: [], days: { lo: 3, mid: 5, hi: 40 }, etaHours: 50, cells: 6 }, { primary: 'holds 6 cells · weakest 3 days to a month or more', secondary: 'there in ~2 days', tone: 'even' }],
    [{ kind: 'hold', who, caveats: [], days: { lo: Infinity, mid: Infinity, hi: Infinity }, etaHours: 50, cells: 2 }, { primary: 'holds 2 cells · no threat seen nearby', secondary: 'there in ~2 days', tone: 'good' }],
    [{ kind: 'strike', who, caveats: ['moving_target_old_fix'], through: { lo: 7, mid: 7, hi: 7.4 }, of: 12 }, { primary: '7 of 12 get through', secondary: 'the target may have moved', tone: 'even' }],
    [{ kind: 'strike', who, caveats: [], through: { lo: 2, mid: 5, hi: 9 }, of: 12 }, { primary: '2-9 of 12 get through', tone: 'even' }],
    [{ kind: 'contest', who, caveats: [], ratio: { lo: 0.4, mid: 0.5, hi: 0.6 }, seen: 3 }, { primary: 'outgunned about 1:2', secondary: '3 enemy groups seen', tone: 'bad' }],
    [{ kind: 'contest', who, caveats: [], ratio: { lo: Infinity, mid: Infinity, hi: Infinity }, seen: 0 }, { primary: 'no enemy air or naval force seen', tone: 'good' }],
    [{ kind: 'arrive', who, caveats: [], etaHours: 0 }, { primary: 'rebases at once', tone: 'good' }],
    [{ kind: 'refused', who: { going: 0, staying: 2 }, caveats: [], code: 'out_of_range', reason: '900 km away, beyond reach of 600 km' }, { primary: '900 km away, beyond reach of 600 km', tone: 'refused' }],
  ];
  it.each(cases.map(([p, want], i) => [i, p, want] as const))('words pill %i', (_i, p, want) => {
    expect(pillText(p)).toEqual(want);
  });
});
