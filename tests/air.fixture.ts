/**
 * Air-war fixture: the testkit's real map and t_* catalog plus the air platforms
 * the shared testkit does not carry (stealth fighter, AWACS, tanker, bomber,
 * Shahed-type drone, SHORAD, ARM, PAC-3/Arrow-type ABMs).
 */
import { Catalog } from '../src/core/catalog';
import { Engine, relationMut } from '../src/core/engine';
import { addFormation, type FormationSpec } from '../src/core/forces';
import type { Formation, Munition, MunitionId, NationId, NodeId, Platform, PlatformId, SimEvent, World } from '../src/core/types';
import { createWorld } from '../src/core/world';
import { loadMap } from '../src/data/load';
import { airWar } from '../src/systems/air';
import { testMunitions, testPlatforms } from '../src/testkit';

const mid = (s: string) => s as MunitionId;
const M = (m: Omit<Munition, 'id' | 'producers'> & { id: string }): Munition => ({ producers: [], ...m, id: mid(m.id) });
const P = (p: Omit<Platform, 'id' | 'producers' | 'inService' | 'loadout'> & { id: string; loadout?: Platform['loadout'] }): Platform => ({
  producers: [], inService: 2015, loadout: [], ...p, id: p.id as PlatformId,
});

export const airMunitions: Munition[] = [
  // Shahed-136: ~2,000 km, ~185 km/h, 40-50 kg warhead, ~$20-50k (CSIS 2023; Ukrainian AF).
  M({ id: 'x_shahed', name: 'One-way attack drone', kind: 'drone_oneway', rangeKm: 1800, speedMach: 0.15, warheadKg: 50, cepM: 10, pk: { structure: 0.6, soft: 0.4 }, interceptDifficulty: 0.1, unitCostUsdM: 0.05, weightKg: 200 }),
  // Kinzhal: air-launched aeroballistic, Mach ~10 terminal (claimed), ~480 kg warhead.
  // Peak Mach ~10 is claimed; terminal speed is far lower, which is why PAC-3 intercepts it.
  M({ id: 'x_kinzhal', name: 'Aeroballistic missile', kind: 'srbm', rangeKm: 2000, speedMach: 8, warheadKg: 480, cepM: 10, pk: { structure: 0.8, soft: 0.6, hardened: 0.4 }, interceptDifficulty: 0.45, unitCostUsdM: 10, weightKg: 4300 }),
  // Iranian MRBM (Emad/Kheibar Shekan class).
  M({ id: 'x_mrbm', name: 'MRBM', kind: 'mrbm', rangeKm: 1700, speedMach: 7, warheadKg: 600, cepM: 100, pk: { structure: 0.6, soft: 0.5, hardened: 0.2 }, interceptDifficulty: 0.35, unitCostUsdM: 2, weightKg: 17000 }),
  // PAC-3 MSE: hit-to-kill, ~$4M, ~35 km TBM / ~100 km aircraft.
  M({ id: 'x_pac3', name: 'Hit-to-kill interceptor', kind: 'sam', rangeKm: 100, speedMach: 5, warheadKg: 10, cepM: 1, pk: { aircraft: 0.8, missile: 0.85 }, interceptDifficulty: 0, unitCostUsdM: 4, weightKg: 320 }),
  // Arrow 2/3 exo/endo ABM.
  M({ id: 'x_arrow', name: 'Upper-tier ABM', kind: 'abm', rangeKm: 400, speedMach: 9, warheadKg: 0, cepM: 1, pk: { missile: 0.9 }, interceptDifficulty: 0, unitCostUsdM: 3, weightKg: 1300 }),
  // SHORAD missile (NASAMS/IRIS-T SLS class).
  M({ id: 'x_shorad_msl', name: 'Short-range SAM', kind: 'shorad_missile', rangeKm: 30, speedMach: 3, warheadKg: 10, cepM: 2, pk: { aircraft: 0.7, missile: 0.7, helicopter: 0.8 }, interceptDifficulty: 0, unitCostUsdM: 0.5, weightKg: 90 }),
  // JDAM-class guided bomb: small RCS, short time of flight; rarely engaged by SAMs.
  M({ id: 'x_jdam', name: 'Guided bomb', kind: 'guided_bomb', rangeKm: 25, speedMach: 0.9, warheadKg: 450, cepM: 5, pk: { structure: 0.8, soft: 0.6, armor: 0.5, hardened: 0.3 }, interceptDifficulty: 0.7, unitCostUsdM: 0.03, weightKg: 1000 }),
  // R-27R class semi-active AAM.
  M({ id: 'x_r27', name: 'Semi-active AAM', kind: 'aam', rangeKm: 50, speedMach: 3.5, warheadKg: 39, cepM: 10, pk: { aircraft: 0.3 }, interceptDifficulty: 0.2, unitCostUsdM: 0.3, weightKg: 250 }),
  // AGM-88 HARM class.
  M({ id: 'x_arm', name: 'Anti-radiation missile', kind: 'arm', rangeKm: 150, speedMach: 2.9, warheadKg: 66, cepM: 5, pk: { soft: 0.6 }, interceptDifficulty: 0.5, unitCostUsdM: 0.9, weightKg: 360 }),
];

export const airPlatforms: Platform[] = [
  P({ id: 'x_stealth', name: '5th-gen fighter', class: 'fighter', domain: 'air', unitCostUsdM: 110, crew: 1, mobility: { speedKph: 950, rangeKm: 1100, fuelTonsPerHour: 3 }, protection: { armor: 0.1, stealth: 0.9 }, sensors: { detectionKm: 160 }, firepower: { aircraft: 0.35 }, loadout: [{ munition: mid('t_aam'), count: 6 }] }),
  P({ id: 'x_awacs', name: 'AEW&C', class: 'awacs', domain: 'air', unitCostUsdM: 500, crew: 20, mobility: { speedKph: 750, rangeKm: 1600, fuelTonsPerHour: 6 }, protection: { armor: 0.05, stealth: 0 }, sensors: { detectionKm: 450 }, firepower: {} }),
  P({ id: 'x_tanker', name: 'Tanker', class: 'tanker', domain: 'air', unitCostUsdM: 200, crew: 3, mobility: { speedKph: 850, rangeKm: 2500, fuelTonsPerHour: 6 }, protection: { armor: 0.05, stealth: 0 }, sensors: { detectionKm: 0 }, firepower: {} }),
  P({ id: 'x_bomber', name: 'Long-range bomber', class: 'bomber', domain: 'air', unitCostUsdM: 300, crew: 5, mobility: { speedKph: 850, rangeKm: 3500, fuelTonsPerHour: 10 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 100 }, firepower: {}, loadout: [{ munition: mid('t_cruise'), count: 12 }] }),
  P({ id: 'x_weasel', name: 'SEAD fighter', class: 'multirole', domain: 'air', unitCostUsdM: 70, crew: 1, mobility: { speedKph: 900, rangeKm: 900, fuelTonsPerHour: 3 }, protection: { armor: 0.1, stealth: 0.2 }, sensors: { detectionKm: 120 }, firepower: { aircraft: 0.2 }, loadout: [{ munition: mid('x_arm'), count: 4 }, { munition: mid('t_aam'), count: 2 }] }),
  P({ id: 'x_striker', name: '4th-gen strike fighter', class: 'multirole', domain: 'air', unitCostUsdM: 60, crew: 2, mobility: { speedKph: 900, rangeKm: 1000, fuelTonsPerHour: 3 }, protection: { armor: 0.1, stealth: 0.2 }, sensors: { detectionKm: 120 }, firepower: { aircraft: 0.2 }, loadout: [{ munition: mid('x_jdam'), count: 4 }, { munition: mid('t_aam'), count: 2 }] }),
  P({ id: 'x_stealth_striker', name: 'Stealth strike aircraft', class: 'attack_aircraft', domain: 'air', unitCostUsdM: 100, crew: 1, mobility: { speedKph: 900, rangeKm: 1000, fuelTonsPerHour: 3 }, protection: { armor: 0.1, stealth: 0.9 }, sensors: { detectionKm: 60 }, firepower: {}, loadout: [{ munition: mid('x_jdam'), count: 2 }] }),
  P({ id: 'x_mig', name: '3rd-gen fighter', class: 'fighter', domain: 'air', unitCostUsdM: 20, crew: 1, mobility: { speedKph: 900, rangeKm: 700, fuelTonsPerHour: 3 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 80 }, firepower: { aircraft: 0.2 }, loadout: [{ munition: mid('x_r27'), count: 4 }] }),
  P({ id: 'x_drone_rack', name: 'One-way drone launcher', class: 'loitering_munition_launcher', domain: 'land', unitCostUsdM: 1, crew: 3, mobility: { speedKph: 60, rangeKm: 600, fuelTonsPerHour: 0.05 }, protection: { armor: 0.05, stealth: 0.3 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [{ munition: mid('x_shahed'), count: 20 }] }),
  P({ id: 'x_cruise_tel', name: 'Cruise missile launcher', class: 'cruise_launcher', domain: 'land', unitCostUsdM: 8, crew: 3, mobility: { speedKph: 50, rangeKm: 600, fuelTonsPerHour: 0.1 }, protection: { armor: 0.1, stealth: 0.3 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [{ munition: mid('t_cruise'), count: 4 }] }),
  P({ id: 'x_mrbm_tel', name: 'MRBM TEL', class: 'tel_mrbm', domain: 'land', unitCostUsdM: 15, crew: 4, mobility: { speedKph: 40, rangeKm: 600, fuelTonsPerHour: 0.2 }, protection: { armor: 0.1, stealth: 0.3 }, sensors: { detectionKm: 0 }, firepower: {}, loadout: [{ munition: mid('x_mrbm'), count: 2 }] }),
  P({ id: 'x_patriot', name: 'PAC-3 fire unit', class: 'sam_long', domain: 'land', unitCostUsdM: 400, crew: 90, mobility: { speedKph: 40, rangeKm: 500, fuelTonsPerHour: 0.5 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 170 }, firepower: {}, engagementChannels: 9, loadout: [{ munition: mid('x_pac3'), count: 32 }] }),
  P({ id: 'x_arrow_bty', name: 'Upper-tier ABM battery', class: 'abm', domain: 'land', unitCostUsdM: 500, crew: 100, mobility: { speedKph: 30, rangeKm: 300, fuelTonsPerHour: 0.5 }, protection: { armor: 0.1, stealth: 0.1 }, sensors: { detectionKm: 900 }, firepower: {}, engagementChannels: 14, loadout: [{ munition: mid('x_arrow'), count: 24 }] }),
  P({ id: 'x_shorad', name: 'SHORAD fire unit', class: 'shorad', domain: 'land', unitCostUsdM: 50, crew: 20, mobility: { speedKph: 60, rangeKm: 500, fuelTonsPerHour: 0.2 }, protection: { armor: 0.2, stealth: 0.2 }, sensors: { detectionKm: 60 }, firepower: {}, engagementChannels: 6, loadout: [{ munition: mid('x_shorad_msl'), count: 24 }] }),
];

export const nation = (s: string) => s as NationId;
export const pid = (s: string) => s as PlatformId;
export { mid };

export function airWorld(seed = 42) {
  const map = loadMap();
  const catalog = new Catalog([...testPlatforms, ...airPlatforms], [...testMunitions, ...airMunitions]);
  const engine = new Engine(map, catalog, [airWar]);
  const world: World = createWorld(map, { seed });
  engine.init(world);
  const add = (spec: FormationSpec) => addFormation(world, catalog, spec);
  const war = (a: string, b: string) => {
    const r = relationMut(world, nation(a), nation(b));
    r.atWar = true;
    r.escalation = 'conventional';
  };
  const ctx = () => engine.context(world);
  const tick = (n = 1) => {
    const events: SimEvent[] = [];
    for (let i = 0; i < n; i++) events.push(...engine.step(world));
    return events;
  };
  const strikes = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: 'strike' }> => e.type === 'strike');
  return { map, catalog, engine, world, add, war, ctx, tick, strikes, node: (lat: number, lon: number) => map.nodeAt(lat, lon) };
}

export type AirWorld = ReturnType<typeof airWorld>;

export function wing(t: AirWorld, n: string, at: NodeId, equipment: Record<string, number>, order: Partial<Formation['order']> = {}) {
  return t.add({ nation: nation(n), name: `${n} wing`, kind: 'air_wing', echelon: 'wing', node: at, equipment: Object.fromEntries(Object.entries(equipment).map(([k, v]) => [pid(k), v])), order: { posture: 'defend', issuedTick: 0, ...order } });
}
export function battery(t: AirWorld, n: string, at: NodeId, equipment: Record<string, number>) {
  return t.add({ nation: nation(n), name: `${n} AD`, kind: 'air_defense', echelon: 'battalion', node: at, equipment: Object.fromEntries(Object.entries(equipment).map(([k, v]) => [pid(k), v])) });
}
export function launchers(t: AirWorld, n: string, at: NodeId, equipment: Record<string, number>, order: Partial<Formation['order']> = {}) {
  return t.add({ nation: nation(n), name: `${n} missiles`, kind: 'missile', echelon: 'brigade', node: at, equipment: Object.fromEntries(Object.entries(equipment).map(([k, v]) => [pid(k), v])), order: { posture: 'defend', issuedTick: 0, ...order } });
}
