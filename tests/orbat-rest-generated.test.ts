import { describe, expect, it } from 'vitest';
import type { NationStats } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { generatedOrbat, generateOrbat, HAND_MODELLED_ELSEWHERE, KIT_CLASS, REST_NATIONS } from '../src/data/orbat/rest';
import type { OrbatEntry } from '../src/data/orbat/types';

const map = loadMap();
const generated = generatedOrbat(map);
const statsOf = (iso: string) => map.data.nations.find((n) => n.iso3 === iso)!.stats as NationStats;
const of = (iso: string) => generated.filter((e) => e.nation === iso);
const sum = (entries: OrbatEntry[], pick: (e: OrbatEntry) => number) => entries.reduce((s, e) => s + pick(e), 0);
const countClass = (entries: OrbatEntry[], classes: string[]) =>
  sum(entries, (e) => Object.entries(e.equipment).reduce((s, [id, n]) => s + (classes.includes(KIT_CLASS[id as keyof typeof KIT_CLASS]) ? n : 0), 0));
const TANK = ['mbt'];
const COMBAT_AIR = ['fighter', 'multirole', 'attack_aircraft'];

describe('generated ORBAT for nations without hand-written entries', () => {
  const remaining = map.data.nations.map((n) => n.iso3).filter((iso) => !REST_NATIONS.has(iso) && !HAND_MODELLED_ELSEWHERE.has(iso));

  it('covers every remaining nation exactly once and no hand-modelled nation', () => {
    expect(new Set(generated.map((e) => e.nation))).toEqual(new Set(remaining));
    for (const iso of remaining) expect(of(iso)).toEqual(generateOrbat(iso, statsOf(iso), map));
    for (const iso of [...REST_NATIONS, ...HAND_MODELLED_ELSEWHERE]) expect(of(iso)).toEqual([]);
  });

  it('generates for exactly the nations the coordinator leaves out of the hand-modelled set', () => {
    const onlyJapan = generatedOrbat(map, new Set(['JPN']));
    const nations = new Set(onlyJapan.map((e) => e.nation));
    expect(nations.has('JPN')).toBe(false);
    expect(nations.has('KOR')).toBe(true);
    expect(nations.has('USA')).toBe(true);
    expect(nations.size).toBe(map.data.nations.length - 1);
  });

  it('matches each nation’s armed forces personnel', () => {
    for (const iso of remaining) {
      const af = statsOf(iso).armedForces ?? 0;
      if (af <= 0) continue;
      expect({ iso, personnel: sum(of(iso), (e) => e.personnel ?? 0) }).toEqual({ iso, personnel: af });
    }
  });

  it('gives a token force to a state with no reported armed forces', () => {
    const vut = of('VUT');
    expect(vut.length).toBeGreaterThan(0);
    expect(countClass(vut, TANK)).toBe(0);
    expect(countClass(vut, COMBAT_AIR)).toBe(0);
  });

  it('scales force size with armed forces and aircraft with spending', () => {
    const base: NationStats = { armedForces: 50_000, milexUsd: 2e9, population: 30e6 };
    const small = generateOrbat('AGO', base, map);
    const large = generateOrbat('AGO', { ...base, armedForces: 200_000 }, map);
    const richer = generateOrbat('AGO', { ...base, milexUsd: 8e9 }, map);
    expect(sum(large, (e) => e.personnel ?? 0)).toBe(4 * sum(small, (e) => e.personnel ?? 0));
    expect(sum(large, (e) => e.equipment.infantry_squad ?? 0)).toBeGreaterThan(3.5 * sum(small, (e) => e.equipment.infantry_squad ?? 0));
    expect(countClass(large, TANK)).toBeGreaterThan(countClass(small, TANK));
    expect(countClass(richer, COMBAT_AIR)).toBeGreaterThan(countClass(small, COMBAT_AIR));
    expect(countClass(generateOrbat('AGO', { ...base, milexUsd: 0.1e9 }, map), COMBAT_AIR)).toBe(0);
  });

  it('equips nations with their main supplier’s kit', () => {
    expect(of('AGO').some((e) => e.equipment.t55 || e.equipment.t72)).toBe(true);
    expect(of('CHL').some((e) => e.equipment.leopard2a4)).toBe(true);
    expect(of('BGD').some((e) => e.equipment.type59 || e.equipment.vt4)).toBe(true);
    expect(of('CHL').some((e) => e.equipment.t55 || e.equipment.type59)).toBe(false);
    expect(countClass(of('BRB'), TANK)).toBe(0);
  });

  it('places infantry brigades at the capital and main cities, with no navy for a landlocked state', () => {
    const angola = of('AGO').filter((e) => e.kind === 'maneuver');
    expect(angola[0].base.name).toBe('Luanda');
    expect(new Set(angola.map((e) => e.base.name)).size).toBeGreaterThan(1);
    expect(of('MNG').some((e) => e.kind === 'surface_group')).toBe(false);
    expect(of('AGO').some((e) => e.kind === 'surface_group')).toBe(true);
  });

  it('puts land and air formations on land the nation holds', () => {
    for (const e of generated.filter((x) => x.kind !== 'surface_group')) {
      const node = map.nodeAt(e.base.lat, e.base.lon);
      expect({ name: `${e.nation} ${e.name}`, land: node < map.landCount, owner: map.owner[node] }).toEqual({ name: `${e.nation} ${e.name}`, land: true, owner: e.nation });
    }
  });

  it('uses only registered ids in positive whole numbers', () => {
    for (const e of generated)
      for (const [id, n] of Object.entries(e.equipment)) {
        expect(KIT_CLASS).toHaveProperty(id);
        expect(Number.isInteger(n) && n > 0, `${e.nation} ${e.name} ${id}=${n}`).toBe(true);
      }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(generatedOrbat(map))).toBe(JSON.stringify(generated));
  });
});
