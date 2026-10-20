import { describe, expect, it } from 'vitest';
import type { PlatformClass } from '../src/core/types';
import { haversineKm } from '../src/core/map';
import { loadMap } from '../src/data/load';
import type { OrbatEntry } from '../src/data/orbat/types';
import { west } from '../src/data/orbat/west';
import { WEST_MUNITIONS, WEST_PLATFORMS, type WestPlatform } from '../src/data/orbat/west/equipment';

type Category = 'mbt' | 'combatAircraft' | 'majorSurface' | 'submarines';
const CATEGORY_CLASSES: Record<Category, readonly PlatformClass[]> = {
  mbt: ['mbt'],
  combatAircraft: ['fighter', 'multirole', 'attack_aircraft', 'bomber', 'stealth_bomber'],
  majorSurface: ['carrier', 'cruiser', 'destroyer', 'frigate'],
  submarines: ['ssn', 'ssk', 'ssgn', 'ssbn'],
};

/**
 * Reference inventories, IISS Military Balance 2025 (data as of late 2024), adjusted
 * for announced 2025-26 deliveries and retirements where noted. Combat aircraft
 * follow IISS "combat capable" fixed-wing types excluding EW and trainers. Major
 * surface combatants are carriers, cruisers, destroyers and frigates (IISS principal
 * surface combatants without amphibious ships). Submarines include SSBNs.
 * Figures marked "est." are estimates where IISS gives none or the force is changing fast.
 */
const IISS: Record<string, Record<Category, number>> = {
  USA: { mbt: 2640, combatAircraft: 2900, majorSurface: 99, submarines: 68 }, // MBT: Army holdings incl. ARNG and APS; aircraft all services
  GBR: { mbt: 213, combatAircraft: 160, majorSurface: 16, submarines: 10 },
  FRA: { mbt: 200, combatAircraft: 230, majorSurface: 22, submarines: 9 },
  DEU: { mbt: 310, combatAircraft: 220, majorSurface: 11, submarines: 6 },
  POL: { mbt: 850, combatAircraft: 90, majorSurface: 2, submarines: 1 }, // est.: K2 and M1A2 SEPv3 deliveries through 2026
  UKR: { mbt: 1100, combatAircraft: 90, majorSurface: 0, submarines: 0 }, // est.: wartime, incl. donated Western types
  CAN: { mbt: 74, combatAircraft: 76, majorSurface: 12, submarines: 4 },
  ITA: { mbt: 200, combatAircraft: 195, majorSurface: 18, submarines: 8 },
  ESP: { mbt: 327, combatAircraft: 155, majorSurface: 9, submarines: 3 },
  NLD: { mbt: 18, combatAircraft: 45, majorSurface: 6, submarines: 3 },
  BEL: { mbt: 0, combatAircraft: 44, majorSurface: 2, submarines: 0 },
  NOR: { mbt: 36, combatAircraft: 40, majorSurface: 4, submarines: 6 },
  DNK: { mbt: 44, combatAircraft: 38, majorSurface: 5, submarines: 0 },
  SWE: { mbt: 110, combatAircraft: 90, majorSurface: 0, submarines: 4 },
  FIN: { mbt: 200, combatAircraft: 60, majorSurface: 0, submarines: 0 },
  GRC: { mbt: 1240, combatAircraft: 210, majorSurface: 13, submarines: 11 },
  TUR: { mbt: 2240, combatAircraft: 290, majorSurface: 16, submarines: 12 },
  ROU: { mbt: 370, combatAircraft: 40, majorSurface: 3, submarines: 0 },
  BGR: { mbt: 90, combatAircraft: 25, majorSurface: 3, submarines: 0 },
  HUN: { mbt: 56, combatAircraft: 14, majorSurface: 0, submarines: 0 },
  CZE: { mbt: 44, combatAircraft: 30, majorSurface: 0, submarines: 0 },
  SVK: { mbt: 45, combatAircraft: 12, majorSurface: 0, submarines: 0 },
  HRV: { mbt: 30, combatAircraft: 12, majorSurface: 0, submarines: 0 },
  PRT: { mbt: 34, combatAircraft: 28, majorSurface: 4, submarines: 2 },
  SVN: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  ALB: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  MKD: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  MNE: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  EST: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  LVA: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  LTU: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
  LUX: { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 },
};

/** Within 10% of the reference, with two platforms of slack for very small forces. */
const close = (actual: number, ref: number) => Math.abs(actual - ref) <= Math.max(0.1 * ref, 2);

const classOf = (id: string): PlatformClass | undefined => WEST_PLATFORMS[id as WestPlatform];
const NAVAL: ReadonlySet<PlatformClass> = new Set([...CATEGORY_CLASSES.majorSurface, ...CATEGORY_CLASSES.submarines, 'corvette', 'amphibious', 'replenishment', 'mine_warfare', 'patrol']);
const isNaval = (e: OrbatEntry) => Object.keys(e.equipment).some((id) => NAVAL.has(classOf(id)!));

function totals(nation: string): Record<Category, number> {
  const out: Record<Category, number> = { mbt: 0, combatAircraft: 0, majorSurface: 0, submarines: 0 };
  for (const e of west)
    if (e.nation === nation)
      for (const [id, n] of Object.entries(e.equipment))
        for (const cat of Object.keys(CATEGORY_CLASSES) as Category[]) if (CATEGORY_CLASSES[cat].includes(classOf(id)!)) out[cat] += n;
  return out;
}

/**
 * Island bases the 1-degree land grid does not resolve: no land cell of the nation or a
 * host lies within LAND_SNAP_KM, so placement by `map.nodeAt` puts the unit in a sea zone
 * or, for the eastern Aegean islands, in a Turkish cell.
 */
const UNRESOLVED_ISLAND_BASES = new Set([
  'Diego Garcia, BIOT',
]);
const LAND_SNAP_KM = 150;

/** Allowed foreign host nations for forward-based and multinational units. */
const HOSTS: Record<string, readonly string[]> = {
  USA: ['DEU', 'POL', 'ITA', 'GBR', 'ESP', 'BEL', 'NLD', 'KOR', 'JPN', 'LTU', 'LVA', 'EST', 'ROU', 'BGR', 'NOR', 'GRC', 'TUR', 'QAT', 'BHR', 'DJI', 'KWT', 'PHL', 'ISL', 'PRT', 'DNK', 'AUS', 'ARE', 'SAU', 'JOR'],
  GBR: ['EST', 'CYP', 'DEU', 'POL', 'USA', 'OMN', 'QAT'],
  FRA: ['DJI', 'ARE', 'EST', 'ROU', 'DEU', 'CIV', 'GAB', 'SEN'],
  DEU: ['LTU', 'USA'],
  CAN: ['LVA'],
  NLD: ['DEU', 'LTU'],
  ESP: ['LVA', 'SVK', 'TUR'],
  ITA: ['LVA', 'BGR', 'HUN'],
  DNK: ['LVA'],
  NOR: ['LTU'],
  SWE: ['LVA'],
  CZE: ['SVK', 'LTU'],
  POL: ['LVA'],
  BEL: ['ROU', 'LTU'],
  PRT: ['ROU'],
  TUR: ['CYP'],
};

describe('western order of battle', () => {
  const map = loadMap();
  const nations = [...new Set(west.map((e) => e.nation))].sort();

  it('covers the US, Canada, every European NATO member with armed forces, and Ukraine', () => {
    expect(nations).toEqual(Object.keys(IISS).sort());
  });

  it.each(Object.keys(IISS))('%s totals match IISS within ten percent for tanks, combat aircraft, major surface combatants and submarines', (nation) => {
    const got = totals(nation);
    const off = (Object.keys(CATEGORY_CLASSES) as Category[]).filter((c) => !close(got[c], IISS[nation][c])).map((c) => `${c}: ${got[c]} vs IISS ${IISS[nation][c]}`);
    expect(off).toEqual([]);
  });

  it('uses only registered platform and munition ids in positive whole counts, and registers no unused id', () => {
    const bad: string[] = [];
    for (const e of west) {
      for (const [id, n] of Object.entries(e.equipment)) if (!classOf(id) || !Number.isInteger(n) || n <= 0) bad.push(`${e.nation} ${e.name}: ${id}=${n}`);
      for (const [id, n] of Object.entries(e.extraMagazine ?? {})) if (!(WEST_MUNITIONS as readonly string[]).includes(id) || !Number.isInteger(n) || n <= 0) bad.push(`${e.nation} ${e.name}: ${id}=${n}`);
      if (!Object.keys(e.equipment).length) bad.push(`${e.nation} ${e.name}: no equipment`);
      if (!e.source) bad.push(`${e.nation} ${e.name}: no source`);
    }
    const used = new Set(west.flatMap((e) => [...Object.keys(e.equipment), ...Object.keys(e.extraMagazine ?? {})]));
    for (const id of [...Object.keys(WEST_PLATFORMS), ...WEST_MUNITIONS]) if (!used.has(id)) bad.push(`registered but unused: ${id}`);
    expect(bad).toEqual([]);
  });

  it('gives every formation a name unique within its nation', () => {
    const seen = new Set<string>(), dup: string[] = [];
    for (const e of west) {
      const k = `${e.nation}|${e.name}`;
      if (seen.has(k)) dup.push(k);
      seen.add(k);
    }
    expect(dup).toEqual([]);
  });

  it('bases every land and air formation near land held by its nation or a known host', () => {
    // Within LAND_SNAP_KM rather than in the exact cell: a 1-degree cell near a border or coast often belongs to a neighbour or the sea.
    const nearOwnLand = (e: OrbatEntry) => {
      const { lat, lon } = e.base;
      for (let i = 0; i < map.landCount; i++) {
        if (Math.abs(map.lat[i] - lat) > 2) continue;
        const owner = map.owner[i];
        if (owner !== e.nation && !(HOSTS[e.nation] ?? []).includes(owner)) continue;
        if (haversineKm(lat, lon, map.lat[i], map.lon[i]) <= LAND_SNAP_KM) return true;
      }
      return false;
    };
    const bad: string[] = [];
    const used = new Set(west.filter((e) => !isNaval(e)).map((e) => e.base.name));
    for (const name of UNRESOLVED_ISLAND_BASES) if (!used.has(name)) bad.push(`${name} is unused; drop it from UNRESOLVED_ISLAND_BASES`);
    for (const e of west) {
      if (isNaval(e)) continue;
      const { name, lat, lon } = e.base;
      const ok = nearOwnLand(e);
      if (UNRESOLVED_ISLAND_BASES.has(name)) {
        if (ok) bad.push(`${name} resolves to land now; drop it from UNRESOLVED_ISLAND_BASES`);
      } else if (!ok) bad.push(`${e.nation} ${e.name} at ${name} (${lat}, ${lon}) has no land of ${e.nation} or a host within ${LAND_SNAP_KM} km`);
    }
    expect(bad).toEqual([]);
  });

  it('fields the US strategic triad at New START levels', () => {
    const us = west.filter((e) => e.nation === 'USA');
    const sum = (id: WestPlatform, kind?: string) => us.filter((e) => !kind || e.kind === kind).reduce((s, e) => s + (e.equipment[id] ?? 0), 0);
    expect(sum('minuteman3_silo')).toBe(400);
    expect(new Set(us.filter((e) => e.equipment.minuteman3_silo).map((e) => e.base.name))).toEqual(new Set(['Malmstrom AFB, MT', 'Minot AFB, ND', 'F.E. Warren AFB, WY']));
    expect(sum('ssbn_ohio')).toBe(14);
    expect(sum('b2a')).toBe(19);
    // B-1B is conventional-only under New START, so it must not sit in a strategic formation.
    expect(sum('b1b', 'strategic')).toBe(0);
    expect(sum('b52h', 'strategic')).toBeGreaterThan(40);
  });

  it('gives France and the UK their sea-based deterrents and France its airborne leg', () => {
    const count = (nation: string, id: WestPlatform) => west.filter((e) => e.nation === nation && e.kind === 'strategic').reduce((s, e) => s + (e.equipment[id] ?? 0), 0);
    expect(count('GBR', 'ssbn_vanguard')).toBe(4);
    expect(count('FRA', 'ssbn_triomphant')).toBe(4);
    expect(count('FRA', 'rafale_b')).toBeGreaterThanOrEqual(20);
    expect(west.some((e) => e.nation === 'FRA' && e.kind === 'strategic' && (e.extraMagazine?.asmp_a ?? 0) > 0)).toBe(true);
  });

  it('keeps the 1st Armored Division at Fort Bliss with three SEPv3 armored brigades', () => {
    const bcts = west.filter((e) => e.nation === 'USA' && /Armored Brigade Combat Team, 1st Armored Division/.test(e.name));
    expect(bcts).toHaveLength(3);
    for (const b of bcts) {
      expect(b.base.name).toBe('Fort Bliss, TX');
      expect(b.equipment.m1a2_sepv3).toBe(87);
    }
  });

  it('models Ukraine as a large, combat-experienced force', () => {
    const ukr = west.filter((e) => e.nation === 'UKR' && e.kind === 'maneuver' && e.echelon === 'brigade');
    expect(ukr.length).toBeGreaterThanOrEqual(100);
    expect(ukr.every((e) => (e.experience ?? 0) >= 0.75)).toBe(true);
  });
});
