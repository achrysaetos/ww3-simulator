/**
 * Fixtures for subsystem tests: the real map plus a tiny, hand-checked catalog,
 * so system tests do not depend on the full catalog's numbers.
 */
import { Catalog } from '../core/catalog';
import { Engine, relationMut, type System } from '../core/engine';
import { addFormation, type FormationSpec } from '../core/forces';
import type { Munition, MunitionId, NationId, NodeId, Platform, PlatformId, World } from '../core/types';
import { createWorld } from '../core/world';
import { loadMap } from '../data/load';

const P = (p: Omit<Platform, 'id' | 'producers' | 'inService' | 'loadout'> & { id: string; loadout?: Platform['loadout'] }): Platform => ({
  producers: [], inService: 2010, loadout: [], ...p, id: p.id as PlatformId,
});
const M = (m: Omit<Munition, 'id' | 'producers'> & { id: string }): Munition => ({ producers: [], ...m, id: m.id as MunitionId });

export const testMunitions: Munition[] = [
  M({ id: 't_cruise', name: 'Test cruise missile', kind: 'cruise', rangeKm: 1600, speedMach: 0.75, warheadKg: 450, cepM: 10, pk: { structure: 0.8, hardened: 0.3, soft: 0.6, ship: 0.5 }, interceptDifficulty: 0.4, unitCostUsdM: 2, weightKg: 1500 }),
  M({ id: 't_srbm', name: 'Test SRBM', kind: 'srbm', rangeKm: 500, speedMach: 6, warheadKg: 480, cepM: 30, pk: { structure: 0.7, soft: 0.5, hardened: 0.2 }, interceptDifficulty: 0.7, unitCostUsdM: 3, weightKg: 3800 }),
  M({ id: 't_sam', name: 'Test SAM', kind: 'sam', rangeKm: 150, speedMach: 4, warheadKg: 90, cepM: 5, pk: { aircraft: 0.6, missile: 0.5, helicopter: 0.7 }, interceptDifficulty: 0, unitCostUsdM: 2, weightKg: 900 }),
  M({ id: 't_aam', name: 'Test AAM', kind: 'aam', rangeKm: 120, speedMach: 4, warheadKg: 20, cepM: 5, pk: { aircraft: 0.5, helicopter: 0.6 }, interceptDifficulty: 0.2, unitCostUsdM: 1, weightKg: 150 }),
  M({ id: 't_asm', name: 'Test anti-ship missile', kind: 'antiship_cruise', rangeKm: 250, speedMach: 0.9, warheadKg: 220, cepM: 5, pk: { ship: 0.6 }, interceptDifficulty: 0.4, unitCostUsdM: 1.5, weightKg: 700 }),
  M({ id: 't_torpedo', name: 'Test torpedo', kind: 'torpedo', rangeKm: 50, speedMach: 0.07, warheadKg: 290, cepM: 5, pk: { ship: 0.7, submarine: 0.5 }, interceptDifficulty: 0.8, unitCostUsdM: 4, weightKg: 1700 }),
  M({ id: 't_nuke', name: 'Test ICBM warhead', kind: 'icbm', rangeKm: 12000, speedMach: 23, warheadKg: 300, yieldKt: 300, cepM: 120, pk: { structure: 1, hardened: 0.9, soft: 1, infantry: 1, armor: 0.95 }, interceptDifficulty: 0.95, unitCostUsdM: 30, weightKg: 36000 }),
];

const zero = { fuelTonsPerHour: 0 };
export const testPlatforms: Platform[] = [
  P({ id: 't_inf', name: 'Rifle squad', class: 'infantry', domain: 'land', unitCostUsdM: 0.1, crew: 9, mobility: { speedKph: 4, rangeKm: 40, ...zero }, protection: { armor: 0.05, stealth: 0.5 }, sensors: { detectionKm: 2 }, firepower: { infantry: 0.02, soft: 0.01, armor: 0.003 } }),
  P({ id: 't_mbt', name: 'Main battle tank', class: 'mbt', domain: 'land', unitCostUsdM: 6, crew: 4, mobility: { speedKph: 40, rangeKm: 450, fuelTonsPerHour: 0.2 }, protection: { armor: 0.7, stealth: 0.1 }, sensors: { detectionKm: 4 }, firepower: { armor: 0.05, soft: 0.06, infantry: 0.05 } }),
  P({ id: 't_ifv', name: 'IFV', class: 'ifv', domain: 'land', unitCostUsdM: 3, crew: 3 + 6, mobility: { speedKph: 40, rangeKm: 500, fuelTonsPerHour: 0.12 }, protection: { armor: 0.35, stealth: 0.1 }, sensors: { detectionKm: 4 }, firepower: { armor: 0.02, soft: 0.05, infantry: 0.05 } }),
  P({ id: 't_spg', name: 'SP howitzer', class: 'sp_artillery', domain: 'land', unitCostUsdM: 5, crew: 5, mobility: { speedKph: 35, rangeKm: 400, fuelTonsPerHour: 0.15 }, protection: { armor: 0.2, stealth: 0.1 }, sensors: { detectionKm: 30 }, firepower: { infantry: 0.12, soft: 0.1, armor: 0.02, structure: 0.03 } }),
  P({ id: 't_sam_bn', name: 'Long-range SAM launcher', class: 'sam_long', domain: 'land', unitCostUsdM: 100, crew: 10, mobility: { speedKph: 30, rangeKm: 500, fuelTonsPerHour: 0.2 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 300 }, firepower: {}, engagementChannels: 9, loadout: [{ munition: 't_sam' as MunitionId, count: 16 }] }),
  P({ id: 't_tel', name: 'SRBM TEL', class: 'tel_srbm', domain: 'land', unitCostUsdM: 10, crew: 4, mobility: { speedKph: 40, rangeKm: 500, fuelTonsPerHour: 0.15 }, protection: { armor: 0.1, stealth: 0.4 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [{ munition: 't_srbm' as MunitionId, count: 2 }] }),
  P({ id: 't_fighter', name: '4.5-gen fighter', class: 'multirole', domain: 'air', unitCostUsdM: 80, crew: 1, mobility: { speedKph: 900, rangeKm: 1000, fuelTonsPerHour: 3 }, protection: { armor: 0.1, stealth: 0.2 }, sensors: { detectionKm: 150 }, firepower: { aircraft: 0.3, armor: 0.2, soft: 0.2 }, loadout: [{ munition: 't_aam' as MunitionId, count: 6 }, { munition: 't_cruise' as MunitionId, count: 2 }] }),
  P({ id: 't_destroyer', name: 'Guided-missile destroyer', class: 'destroyer', domain: 'sea', unitCostUsdM: 2000, crew: 300, mobility: { speedKph: 37, rangeKm: 8000, fuelTonsPerHour: 2.5 }, protection: { armor: 0.3, stealth: 0.2 }, sensors: { detectionKm: 300 }, firepower: { ship: 0.2, aircraft: 0.3, missile: 0.3 }, engagementChannels: 12, loadout: [{ munition: 't_sam' as MunitionId, count: 64 }, { munition: 't_cruise' as MunitionId, count: 24 }, { munition: 't_asm' as MunitionId, count: 8 }] }),
  P({ id: 't_ssn', name: 'Attack submarine', class: 'ssn', domain: 'subsurface', unitCostUsdM: 3000, crew: 130, mobility: { speedKph: 37, rangeKm: 1e6, fuelTonsPerHour: 0 }, protection: { armor: 0.2, stealth: 0.85 }, sensors: { detectionKm: 60 }, firepower: { ship: 0.3, submarine: 0.2 }, loadout: [{ munition: 't_torpedo' as MunitionId, count: 26 }, { munition: 't_cruise' as MunitionId, count: 12 }] }),
  P({ id: 't_icbm', name: 'ICBM silo', class: 'icbm_silo', domain: 'land', unitCostUsdM: 70, crew: 2, mobility: { speedKph: 0, rangeKm: 0, fuelTonsPerHour: 0 }, protection: { armor: 0.9, stealth: 0 }, sensors: { detectionKm: 0 }, firepower: {}, nuclearCapable: true, loadout: [{ munition: 't_nuke' as MunitionId, count: 1 }] }),
];

export function testCatalog(): Catalog {
  return new Catalog(testPlatforms, testMunitions);
}

export const id = {
  nation: (s: string) => s as NationId,
  platform: (s: string) => s as PlatformId,
  munition: (s: string) => s as MunitionId,
  node: (n: number) => n as NodeId,
};

/** A world on the real map with the test catalog; `systems` are initialised. */
export function testWorld(systems: System[] = [], seed = 42) {
  const map = loadMap();
  const catalog = testCatalog();
  const engine = new Engine(map, catalog, systems);
  const world = createWorld(map, { seed });
  engine.init(world);
  const nodeAt = (lat: number, lon: number) => map.nodeAt(lat, lon);
  const add = (spec: FormationSpec) => addFormation(world, catalog, spec);
  const war = (a: string, b: string) => {
    const r = relationMut(world, a as NationId, b as NationId);
    r.atWar = true;
    r.escalation = 'conventional';
    r.warSince = world.tick;
    world.nations[a as NationId].status = 'war';
    world.nations[b as NationId].status = 'war';
  };
  return { map, catalog, engine, world, nodeAt, add, war };
}

export type TestWorld = ReturnType<typeof testWorld> & { world: World };
