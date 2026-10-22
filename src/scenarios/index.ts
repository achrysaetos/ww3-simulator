import type { Catalog } from '../core/catalog';
import { Engine } from '../core/engine';
import type { GameMap } from '../core/map';
import type { Command, DeclaredAim, NationId, World } from '../core/types';
import { createWorld } from '../core/world';
import { loadCatalog } from '../data/catalog';
import { loadMap } from '../data/load';
import { profiles } from '../data/nations';
import { ALIASES } from '../data/orbat/aliases';
import { allOrbat } from '../data/orbat';
import { OCCUPATIONS, pointInRing } from '../data/occupation';
import { SYSTEMS } from '../systems';
import { placeOrbat, stockNations, type PlacementReport } from './build';

export interface Scenario {
  id: string;
  name: string;
  summary: string;
  startDate: string;
  /** The nation a player most likely wants to command. */
  suggestedNation: string;
  /**
   * Mobilization levels nations already stand at when the scenario opens, rather than ramp up to:
   * a war footing kept from an earlier war. The AI never orders less while at war.
   */
  mobilized?: Record<string, number>;
  /**
   * Formations that start at a peacetime garrison instead of their late-2025 sector of the
   * Ukrainian front, by order-of-battle name: a later scenario in which that war has ended.
   */
  garrisons?: Record<string, { name: string; lat: number; lon: number }>;
  /** Opening moves, queued for the first tick so the owning systems resolve them. `mobilize` is an order the economy ramps toward. */
  opening: (Command | { type: 'mobilize'; nations: string[]; level: number })[];
}

const war = (nation: string, target: string, reason: string, aim?: DeclaredAim): Command => ({ type: 'declare_war', nation: nation as NationId, target: target as NationId, reason, ...(aim && { aim }) });
const mobilize = (nations: string[], level: number) => ({ type: 'mobilize' as const, nations, level });
/**
 * Russia at 0.33 (7.2% of GDP; SIPRI 2025: 7.1% in 2024) and Ukraine at 0.8 (34% of GDP in
 * 2024), the frontline and existential tiers of MOBILIZATION in src/systems/ai/strategy.ts.
 */
const WAR_FOOTING_2025 = { RUS: 0.33, UKR: 0.8 };

/**
 * Russia's western army back in garrison after the Ukrainian war, as the 2024 re-creation of the
 * Leningrad and Moscow military districts lays it out: 6th CAA around St Petersburg and Pskov,
 * 44th AC in Karelia, 14th AC on the Kola peninsula, the 76th VDV at Pskov, and the 1st Guards
 * Tank Army around Moscow (IISS Military Balance 2025; ISW and Rochan Consulting on the Leningrad
 * MD, 2024). The southern, central and eastern armies stay on the Ukrainian ceasefire line.
 * Estonian intelligence expects this force to roughly double toward the Baltic over the decade
 * (EFIS, "International Security and Estonia 2025"); the 2027 scenarios open with it in place.
 */
const RUSSIA_WEST_2027: Scenario['garrisons'] = {
  '69th Guards Motor Rifle Division (6th CAA)': { name: 'Kamenka, Leningrad oblast', lat: 60.45, lon: 29.2 },
  '25th Guards Motor Rifle Brigade (6th CAA)': { name: 'Vladimirsky Lager, Pskov oblast', lat: 58.27, lon: 29.1 },
  '9th Guards Artillery Brigade': { name: 'Luga', lat: 58.73, lon: 29.85 },
  '72nd Motor Rifle Division (44th AC)': { name: 'Petrozavodsk, Karelia', lat: 61.8, lon: 34.3 },
  '128th Motor Rifle Brigade (44th AC)': { name: 'Sortavala, Karelia', lat: 61.7, lon: 30.7 },
  '200th Separate Motor Rifle Brigade (14th AC)': { name: 'Pechenga', lat: 69.55, lon: 31.2 },
  '80th Arctic Motor Rifle Brigade (14th AC)': { name: 'Alakurtti', lat: 66.96, lon: 30.35 },
  '61st Naval Infantry Brigade (Northern Fleet)': { name: 'Sputnik, Murmansk oblast', lat: 69.4, lon: 32.4 },
  '336th Guards Naval Infantry Brigade (Baltic Fleet)': { name: 'Baltiysk', lat: 54.65, lon: 19.9 },
  '76th Guards Air Assault Division': { name: 'Pskov', lat: 57.82, lon: 28.35 },
  '98th Guards Airborne Division': { name: 'Ivanovo', lat: 57.0, lon: 41.0 },
  '106th Guards Airborne Division': { name: 'Tula', lat: 54.2, lon: 37.6 },
  '2nd Guards Tamanskaya Motor Rifle Division (1st GTA)': { name: 'Kalininets, Moscow oblast', lat: 55.5, lon: 36.9 },
  '4th Guards Kantemirovskaya Tank Division (1st GTA)': { name: 'Naro-Fominsk', lat: 55.39, lon: 36.73 },
  '47th Guards Tank Division (1st GTA)': { name: 'Mulino, Nizhny Novgorod oblast', lat: 56.3, lon: 42.9 },
  '27th Guards Motor Rifle Brigade (1st GTA)': { name: 'Mosrentgen, Moscow', lat: 55.62, lon: 37.47 },
  '144th Guards Motor Rifle Division (20th CAA)': { name: 'Yelnya, Smolensk oblast', lat: 54.57, lon: 33.17 },
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'peace-2027',
    name: 'Armed peace, 2027',
    summary: 'Every military in the world at its 2025-26 order of battle, at peace. Declare any war you like.',
    startDate: '2027-01-01T00:00:00Z',
    suggestedNation: 'USA',
    opening: [],
  },
  {
    id: 'ukraine-2026',
    name: 'Russo-Ukrainian War continues',
    summary: 'The war of attrition from the late-2025 front line, with no ceasefire. The calibration case for ground combat.',
    startDate: '2026-01-01T00:00:00Z',
    suggestedNation: 'UKR',
    // Both sides have been on a war footing since 2022; see MOBILIZATION in src/systems/ai/strategy.ts.
    mobilized: WAR_FOOTING_2025,
    opening: [war('RUS', 'UKR', 'special military operation')],
  },
  {
    id: 'taiwan-2027',
    name: 'Taiwan Strait, 2027',
    summary: 'China moves to take Taiwan by force in the window US officials have flagged. Whether the US, Japan and Australia intervene is up to their governments.',
    startDate: '2027-04-01T00:00:00Z',
    suggestedNation: 'CHN',
    opening: [mobilize(['CHN'], 0.4), mobilize(['TWN'], 0.9), war('CHN', 'TWN', 'reunification by force')],
  },
  {
    id: 'baltic-2027',
    name: 'Baltic gambit, 2027',
    summary: 'Russia, reconstituted after Ukraine, strikes the Baltic states to test Article 5.',
    startDate: '2027-09-01T00:00:00Z',
    suggestedNation: 'RUS',
    mobilized: { RUS: WAR_FOOTING_2025.RUS },
    garrisons: RUSSIA_WEST_2027,
    opening: [mobilize(['RUS'], 0.5), war('RUS', 'EST', 'protection of compatriots'), war('RUS', 'LVA', 'protection of compatriots'), war('RUS', 'LTU', 'Suwalki corridor')],
  },
  {
    id: 'korea-2027',
    name: 'Second Korean War',
    summary: 'North Korea attacks across the DMZ under its nuclear umbrella.',
    startDate: '2027-03-01T00:00:00Z',
    suggestedNation: 'KOR',
    opening: [mobilize(['PRK'], 0.9), war('PRK', 'KOR', 'pre-emptive war')],
  },
  {
    id: 'gulf-2027',
    name: 'Iran-Israel war',
    summary: 'Open war between Iran and Israel with the Strait of Hormuz in play.',
    startDate: '2027-06-01T00:00:00Z',
    suggestedNation: 'ISR',
    // Israel has fought on several fronts since October 2023 and spent 8.8% of GDP in 2024 (SIPRI 2025): ~0.38 on the defence curve.
    mobilized: { ISR: 0.38 },
    opening: [mobilize(['ISR'], 0.7), mobilize(['IRN'], 0.6), war('IRN', 'ISR', 'retaliation')],
  },
  {
    id: 'south-asia-2027',
    name: 'India-Pakistan crisis',
    summary: 'A terror attack draws Indian punitive strikes on Pakistan. Two nuclear powers decide whether it stays a strike exchange or grows into a full war.',
    startDate: '2027-02-15T00:00:00Z',
    suggestedNation: 'IND',
    // India's stated aim after Pahalgam (2025) and Pulwama (2019): punish cross-border terrorism below Pakistan's nuclear threshold (src/data/nations/strategic.ts).
    opening: [mobilize(['IND', 'PAK'], 0.5), war('IND', 'PAK', 'cross-border terrorism', { kind: 'punitive' })],
  },
  {
    id: 'ww3-2027',
    name: 'World War III',
    summary: 'Coordinated offensives: China on Taiwan, Russia on the Baltics and Poland, North Korea on the South, Iran on Israel. Every alliance is tested at once.',
    startDate: '2027-10-01T00:00:00Z',
    suggestedNation: 'USA',
    // Russia and Ukraine keep the war economies they ran in 2025, whether or not their own war goes on.
    mobilized: WAR_FOOTING_2025,
    garrisons: RUSSIA_WEST_2027,
    opening: [
      mobilize(['CHN', 'RUS', 'PRK', 'IRN'], 0.6),
      war('CHN', 'TWN', 'reunification by force'),
      war('RUS', 'EST', 'NATO aggression'), war('RUS', 'LVA', 'NATO aggression'), war('RUS', 'LTU', 'NATO aggression'), war('RUS', 'POL', 'NATO aggression'),
      war('PRK', 'KOR', 'pre-emptive war'),
      war('IRN', 'ISR', 'axis of resistance'),
    ],
  },
];

export interface Session {
  map: GameMap;
  catalog: Catalog;
  engine: Engine;
  world: World;
  scenario: Scenario;
  placement: PlacementReport;
}

/** Build a ready-to-run world for a scenario: every order of battle placed, stocks issued, opening moves queued. */
export function createSession(scenarioId: string, seed = 1): Session {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`unknown scenario ${scenarioId}; try ${SCENARIOS.map((s) => s.id).join(', ')}`);
  const map = loadMap();
  const catalog = loadCatalog();
  const engine = new Engine(map, catalog, SYSTEMS);
  const world = createWorld(map, { seed, startDate: scenario.startDate, profiles });
  for (let n = 0; n < map.landCount; n++)
    for (const o of OCCUPATIONS)
      if (map.owner[n] === o.owner && pointInRing(map.lon[n], map.lat[n], o.ring)) world.control[n] = o.holder as NationId;
  const placement = placeOrbat(world, map, catalog, allOrbat(map), ALIASES);
  for (const [name, at] of Object.entries(scenario.garrisons ?? {})) {
    const f = Object.values(world.formations).find((x) => x.name === name);
    if (!f) throw new Error(`${scenario.id}: no formation named ${name} to send to ${at.name}`);
    f.node = map.nodeAt(at.lat, at.lon);
  }
  stockNations(world, catalog);
  engine.init(world);
  for (const [n, level] of Object.entries(scenario.mobilized ?? {})) {
    world.nations[n as NationId].mobilization = level;
    world.pending.push({ type: 'set_mobilization', nation: n as NationId, level });
  }
  for (const move of scenario.opening) {
    if (move.type === 'mobilize') for (const n of move.nations) world.pending.push({ type: 'set_mobilization', nation: n as NationId, level: move.level });
    else world.pending.push(move);
  }
  return { map, catalog, engine, world, scenario, placement };
}
