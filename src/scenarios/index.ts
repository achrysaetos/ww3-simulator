import type { Catalog } from '../core/catalog';
import { Engine } from '../core/engine';
import type { GameMap } from '../core/map';
import type { Command, NationId, World } from '../core/types';
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
  /** Mobilization levels nations already stand at when a war under way opens, rather than ramp up to. */
  mobilized?: Record<string, number>;
  /** Opening moves, queued for the first tick so the owning systems resolve them. */
  opening: (Command | { type: 'mobilize'; nations: string[]; level: number })[];
}

const war = (nation: string, target: string, reason: string): Command => ({ type: 'declare_war', nation: nation as NationId, target: target as NationId, reason });
const mobilize = (nations: string[], level: number) => ({ type: 'mobilize' as const, nations, level });

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
    mobilized: { RUS: 0.33, UKR: 0.7 },
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
    opening: [mobilize(['ISR'], 0.7), mobilize(['IRN'], 0.6), war('IRN', 'ISR', 'retaliation')],
  },
  {
    id: 'south-asia-2027',
    name: 'India-Pakistan crisis',
    summary: 'A terror attack escalates into a full war between two nuclear powers.',
    startDate: '2027-02-15T00:00:00Z',
    suggestedNation: 'IND',
    opening: [mobilize(['IND', 'PAK'], 0.5), war('IND', 'PAK', 'cross-border terrorism')],
  },
  {
    id: 'ww3-2027',
    name: 'World War III',
    summary: 'Coordinated offensives: China on Taiwan, Russia on the Baltics and Poland, North Korea on the South, Iran on Israel. Every alliance is tested at once.',
    startDate: '2027-10-01T00:00:00Z',
    suggestedNation: 'USA',
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
