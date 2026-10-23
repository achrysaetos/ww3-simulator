import { describe, expect, it } from 'vitest';
import type { FormationId, NationId } from '../src/core/types';
import { Rng } from '../src/core/rng';
import { loadMap } from '../src/data/load';
import { QUICK as TABLES } from '../src/forecast/quick';
import { interceptSalvo, type SalvoDefense, type SalvoThreat } from '../src/systems/air/intercept';
import { estimateHold, estimateStrike, estimateTake, pillText, quickAt, type Pill } from '../src/ui/drag/estimate';
import type { Target } from '../src/ui/drag/gesture';
import type { BeliefField, DragKit, SubjectUnit } from '../src/ui/drag/kit';

const map = loadMap();
const t = map.nodeAt(48.5, 37.5);
const QUICK = TABLES.open.bare.rows;
const from = [...map.neighbors(t)][0];
const target: Target = { kind: 'enemy_ground', node: t, contact: null };

function unit(power: number, extra: Partial<SubjectUnit> = {}): SubjectUnit {
  return { id: `u${power}` as FormationId, cls: 'ground', kind: 'maneuver', node: from, power, strength: 1, kmPerDay: 100, strikeKm: 0, patrolKm: 0, ferryKm: 0, salvo: 0, c2DelayHours: 0, ...extra };
}

/** A kit with one believed enemy force at the target cell and nothing else on the map. */
function kit(enemy: { power: number; conf?: number; ageH?: number; dig?: number; defense?: number }, units: SubjectUnit[], extra: Partial<DragKit> = {}): DragKit {
  const size = map.size;
  const field: BeliefField = {
    tick: 0, enemyPower: new Float32Array(size), enemyConf: new Float32Array(size), enemyAgeH: new Float32Array(size).fill(Infinity), enemyDig: new Float32Array(size),
    defense: new Float32Array(size).fill(1), supply: new Uint8Array(size).fill(100), hostile: new Uint8Array(size), river: new Uint8Array(size), ownPower: new Float32Array(size),
  };
  field.enemyPower[t] = enemy.power;
  field.enemyConf[t] = enemy.conf ?? 1;
  field.enemyAgeH[t] = enemy.ageH ?? 0;
  field.enemyDig[t] = enemy.dig ?? 0;
  field.defense[t] = enemy.defense ?? 1;
  field.hostile[t] = 1;
  const km = new Float32Array(size).fill(50);
  return { tick: 0, player: 'RUS' as NationId, sides: new Uint8Array(0), units, field, routes: [{ from, marchKm: km, assaultKm: km, assaultVia: null, seaKm: null }], sites: [], contacts: {}, ...extra };
}

const take = (k: DragKit) => {
  const p = estimateTake(k, k.units, target, [t], map);
  if (p.kind !== 'take') throw new Error(p.kind);
  return p;
};

/** A ratio in the steep middle of the table, where every input visibly moves the odds. */
const steep = QUICK.find((q) => q.pTake > 0.2 && q.pTake < 0.8)!.r;

describe('the take estimate', () => {
  it('rises with more attackers and falls with more defenders, worse terrain or deeper entrenchment', () => {
    const base = take(kit({ power: 10 }, [unit(10 * steep)])).p.mid;
    expect(base).toBeGreaterThan(0.1);
    expect(base).toBeLessThan(0.9);
    expect(take(kit({ power: 10 }, [unit(10 * steep), unit(3 * steep)])).p.mid).toBeGreaterThan(base);
    expect(take(kit({ power: 13 }, [unit(10 * steep)])).p.mid).toBeLessThan(base);
    expect(take(kit({ power: 10, defense: 1.5 }, [unit(10 * steep)])).p.mid).toBeLessThan(base);
    expect(take(kit({ power: 10, dig: 1 }, [unit(10 * steep)])).p.mid).toBeLessThan(base);
    const across = kit({ power: 10 }, [unit(10 * steep)]);
    across.field.river[t] = 1;
    expect(take(across).p.mid).toBeLessThan(base);
  });

  it('needs every enemy cell on the way taken first', () => {
    const k = kit({ power: 10 }, [unit(30 * steep)]);
    const mid = [...map.neighbors(t)].find((m) => m !== from && [...map.neighbors(from)].includes(m))!;
    const via = new Int32Array(map.size).fill(-1);
    via[t] = mid;
    via[mid] = from;
    k.routes[0].assaultVia = via;
    expect(take(k).p.mid, 'through a friendly cell').toBe(take(kit({ power: 10 }, [unit(30 * steep)])).p.mid);
    k.field.hostile[mid] = 1;
    k.field.enemyPower[mid] = 10;
    k.field.enemyConf[mid] = 1;
    k.field.enemyAgeH[mid] = 0;
    const through = take(k).p.mid;
    k.routes[0].assaultVia = null;
    expect(through).toBeLessThan(take(k).p.mid);
  });

  it('widens its band as confidence in the defenders falls or the fix ages', () => {
    const width = (p: { lo: number; hi: number }) => p.hi - p.lo;
    const sure = take(kit({ power: 10 }, [unit(10 * steep)])).p;
    expect(width(sure)).toBeCloseTo(0, 6);
    const unsure = take(kit({ power: 10, conf: 0.4 }, [unit(10 * steep)])).p;
    expect(width(unsure)).toBeGreaterThan(0.15);
    expect(width(take(kit({ power: 10, conf: 0.4, ageH: 72 }, [unit(10 * steep)])).p)).toBeGreaterThan(width(unsure));
    expect(unsure.lo).toBeLessThanOrEqual(unsure.mid);
    expect(unsure.mid).toBeLessThanOrEqual(unsure.hi);
  });

  it('reads the unopposed row and says nothing was seen when no defender is believed there', () => {
    const p = take(kit({ power: 0 }, [unit(10)]));
    expect(p.caveats).toContain('nothing_seen');
    expect(p.p.mid).toBe(1);
  });

  it('interpolates QUICK in ln r and clamps at its ends', () => {
    const [a, b] = [QUICK[QUICK.length - 3], QUICK[QUICK.length - 2]];
    const mid = quickAt(Math.sqrt(a.r * b.r));
    expect(mid.pTake).toBeCloseTo((a.pTake + b.pTake) / 2, 6);
    expect(quickAt(QUICK[0].r / 10).pTake).toBe(QUICK[0].pTake);
    expect(quickAt(QUICK[QUICK.length - 1].r * 10).pTake).toBe(QUICK[QUICK.length - 1].pTake);
  });
});

describe('the hold estimate', () => {
  const ring = (power: number) => {
    const k = kit({ power: 0 }, [unit(10)]);
    k.field.enemyPower[t] = 0;
    for (const n of map.neighbors(t)) {
      k.field.enemyPower[n] = power;
      k.field.enemyConf[n] = 1;
      k.field.enemyAgeH[n] = 0;
    }
    const p = estimateHold(k, k.units, { kind: 'own_ground', node: t, contact: null }, [t], map);
    if (p.kind !== 'hold') throw new Error(p.kind);
    return p.days;
  };

  it('holds longer with less enemy around, and sees no threat when there is none', () => {
    expect(ring(0)).toEqual({ lo: Infinity, mid: Infinity, hi: Infinity });
    const heavy = ring(40), light = ring(15);
    expect(heavy.mid).toBeLessThan(light.mid);
    expect(Number.isFinite(heavy.mid)).toBe(true);
  });
});

describe('the strike estimate', () => {
  const threat: SalvoThreat = { count: 0, speedMach: 0.8, interceptDifficulty: 0.2 };
  const strike = (sites: { defense: SalvoDefense; conf?: number }[], salvo: number) => {
    const u = unit(1, { cls: 'air', kind: 'air_wing', salvo, threat: { ...threat, count: salvo }, strikeKm: 1000 });
    const k = kit({ power: 0 }, [u], { sites: sites.map((x) => ({ node: t, defense: x.defense, conf: x.conf ?? 1, ageH: 0 })) });
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
