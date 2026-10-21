import type { GameMap } from './map';
import type { Government, Nation, NationId, NationStats, NodeId, World } from './types';

/** Per-nation facts the open-data pipeline cannot supply; filled by src/data/nations. */
export interface NationProfile {
  government?: Government;
  blocs?: string[];
  nuclear?: Nation['nuclear'];
  /** Opinion toward other nations, -100..100. */
  opinions?: Record<string, number>;
  /** Trained reservists outside the active force (IISS "Reserve"); src/data/nations/reserves.ts. */
  reservists?: number;
}

/**
 * Reservists per active serviceman for a nation whose profile gives none: the median of the
 * IISS-sourced rows in src/data/nations/reserves.ts.
 */
const RESERVE_TO_ACTIVE = 0.57;

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
      stats: { ...stats },
      capital: capitals.get(id) as NodeId,
      government: profile.government ?? 'hybrid',
      blocs: [...(profile.blocs ?? [])],
      population,
      mobilization: 0,
      warSupport: 0.6,
      // Nobody starts with men ready to replace losses: reservists must be recalled and retrained first.
      reserves: 0,
      reservists: profile.reservists ?? Math.round((stats.armedForces ?? 0) * RESERVE_TO_ACTIVE),
      stockpile: {},
      bulk: { fuel: 0, ammo: 0, food: 0 },
      treasuryUsdB: 0,
      // Copied: profiles are module-level data shared by every world built in this process.
      nuclear: { ...(profile.nuclear ?? { warheads: 0, deployed: 0, doctrine: 'none' }) },
      controlledBy: 'ai',
      status: 'peace',
    };
  }
  // Relations are symmetric, so a pair's opinion is the mean of both directions given.
  const sums = new Map<string, { total: number; n: number }>();
  for (const [a, p] of Object.entries(opts.profiles ?? {}))
    for (const [b, opinion] of Object.entries(p.opinions ?? {})) {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      const s = sums.get(k) ?? { total: 0, n: 0 };
      s.total += opinion;
      s.n++;
      sums.set(k, s);
    }
  const relations: World['relations'] = {};
  for (const [k, s] of sums) relations[k] = { opinion: Math.round(s.total / s.n), atWar: false, escalation: 'peace', sanctions: false };
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
