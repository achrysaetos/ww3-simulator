import type { GameMap } from './map';
import type { Government, Nation, NationId, NationStats, NodeId, World } from './types';

/** Per-nation facts the open-data pipeline cannot supply; filled by src/data/nations. */
export interface NationProfile {
  government?: Government;
  blocs?: string[];
  nuclear?: Nation['nuclear'];
  /** Opinion toward other nations, -100..100. */
  opinions?: Record<string, number>;
}

export interface WorldOptions {
  seed?: number;
  startDate?: string;
  dtHours?: number;
  profiles?: Record<string, NationProfile>;
}

/** A peacetime world: every nation at baseline, no formations. Scenarios and systems fill the rest. */
export function createWorld(map: GameMap, opts: WorldOptions = {}): World {
  const seed = opts.seed ?? 1;
  const nations: Record<NationId, Nation> = {};
  const capitals = new Map(map.data.nations.map((n) => [n.iso3, n.capital?.cell ?? 0]));
  for (const [i, raw] of map.data.nations.entries()) {
    const id = map.nationIds[i];
    const stats = raw.stats as NationStats;
    const profile = opts.profiles?.[id] ?? {};
    const population = stats.population ?? 1e6;
    nations[id] = {
      id,
      name: raw.name,
      stats,
      capital: capitals.get(id) as NodeId,
      government: profile.government ?? 'hybrid',
      blocs: profile.blocs ?? [],
      population,
      mobilization: 0,
      warSupport: 0.6,
      reserves: Math.round(population * 0.01),
      stockpile: {},
      bulk: { fuel: 0, ammo: 0, food: 0 },
      treasuryUsdB: 0,
      nuclear: profile.nuclear ?? { warheads: 0, deployed: 0, doctrine: 'none' },
      controlledBy: 'ai',
      status: 'peace',
    };
  }
  const relations: World['relations'] = {};
  for (const [a, p] of Object.entries(opts.profiles ?? {}))
    for (const [b, opinion] of Object.entries(p.opinions ?? {})) {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      relations[k] = { opinion, atWar: false, escalation: 'peace', sanctions: false };
    }
  return {
    seed,
    rngState: seed,
    tick: 0,
    dtHours: opts.dtHours ?? 6,
    startDate: opts.startDate ?? '2027-01-01T00:00:00Z',
    nations,
    control: [...map.owner],
    formations: {},
    relations,
    pending: [],
    events: [],
    history: [],
    nextId: 1,
    theater: { airControl: {}, seaControl: {}, infrastructure: new Array(map.size).fill(1), tradeBlocked: {}, fallout: {} },
    slices: {} as World['slices'],
  };
}
