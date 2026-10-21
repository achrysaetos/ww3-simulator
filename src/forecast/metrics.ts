import type { GameMap } from '../core/map';
import type { NationId, NodeId, SimEvent, World } from '../core/types';
import { cellDepthKm } from '../systems/land/state';

/** What one run leaves behind for its metrics to read: the front at the start, the World at the end, and tallies of its events. */
export interface RunTrace {
  readonly map: GameMap;
  readonly start: FrontSnapshot;
  readonly end: World;
  /** Personnel casualties in land battles, by nation. */
  readonly casualties: Readonly<Record<NationId, number>>;
  readonly days: number;
}

export interface FrontSnapshot {
  readonly control: readonly NationId[];
  readonly contest: Readonly<Record<number, { by: NationId; km: number }>>;
}

export const snapshotFront = (world: World): FrontSnapshot => ({
  control: [...world.control],
  contest: structuredClone(world.slices.land?.contest ?? {}),
});

/**
 * One number a run is scored on. A goal metric has a threshold: the outcome is met when the value
 * is above it. A metric without one measures a cost. Report flips and top-3 lists keep the two apart
 * (issue #2 section 2: who meets their goals versus what it costs).
 */
export interface MetricFn {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly threshold?: number;
  measure(trace: RunTrace): number;
}

/** Area of a land cell in km2. */
const areaKm2 = (map: GameMap, n: number) => (2 * map.halfDeg[n] * 111.32) ** 2 * Math.cos((map.lat[n] * Math.PI) / 180);

/** Share of a cell `nation` holds or has pushed across, 0..1. */
function progress(map: GameMap, control: readonly NationId[], contest: FrontSnapshot['contest'], nation: NationId, n: NodeId): number {
  if (control[n] === nation) return 1;
  const c = contest[n];
  return c?.by === nation ? Math.min(1, c.km / cellDepthKm(map, n)) : 0;
}

/** Per land cell, the change in `nation`'s hold on it from start to end, as a share of the cell. */
function gains(t: RunTrace, nation: NationId, f: (n: NodeId, gain: number) => void): void {
  const endContest = t.end.slices.land?.contest ?? {};
  for (let i = 0; i < t.map.landCount; i++) {
    const n = i as NodeId;
    const before = progress(t.map, t.start.control, t.start.contest, nation, n);
    const after = progress(t.map, t.end.control, endContest, nation, n);
    if (before !== after) f(n, after - before);
  }
}

type Kind = (nation: NationId) => Omit<MetricFn, 'id' | 'threshold'>;

const KINDS: Record<string, Kind | Omit<MetricFn, 'id' | 'threshold'>> = {
  territory_changed: {
    label: 'territory that changed hands',
    unit: '1-degree cells',
    measure: (t) => {
      let cells = 0;
      for (let n = 0; n < t.map.landCount; n++) if (t.start.control[n] !== t.end.control[n]) cells += (2 * t.map.halfDeg[n]) ** 2;
      return cells;
    },
  },
  net_cells: (nation) => ({
    label: `cells ${nation} took, net`,
    unit: '1-degree cells',
    measure: (t) => {
      let cells = 0;
      for (let n = 0; n < t.map.landCount; n++) {
        const was = t.start.control[n] === nation, is = t.end.control[n] === nation;
        if (was !== is) cells += (is ? 1 : -1) * (2 * t.map.halfDeg[n]) ** 2;
      }
      return cells;
    },
  }),
  ground_km2: (nation) => ({
    label: `ground ${nation} gained, net, counting partial advances`,
    unit: 'km2',
    measure: (t) => {
      let km2 = 0;
      gains(t, nation, (n, g) => (km2 += g * areaKm2(t.map, n)));
      return km2;
    },
  }),
  advance_km: (nation) => ({
    label: `${nation} mean advance on the axes it pushed`,
    unit: 'km',
    measure: (t) => {
      let km = 0, axes = 0;
      gains(t, nation, (n, g) => {
        if (g <= 0) return;
        km += g * cellDepthKm(t.map, n);
        axes++;
      });
      return axes ? km / axes : 0;
    },
  }),
  casualties: (nation) => ({
    label: `${nation} personnel casualties in land battles`,
    unit: 'people',
    measure: (t) => t.casualties[nation] ?? 0,
  }),
};

/**
 * Resolves a metric spec, `<kind>[:<NATION>][><threshold>]`, e.g. `casualties:RUS` or
 * `net_cells:RUS>0`. Specs are strings so a worker thread can resolve the same metric.
 */
export function metric(spec: string): MetricFn {
  const m = /^([a-z_0-9]+)(?::([A-Z]{3}))?(?:>(-?\d+(?:\.\d+)?))?$/.exec(spec);
  if (!m) throw new Error(`bad metric "${spec}"; write <kind>[:<NATION>][><threshold>], kinds ${Object.keys(KINDS).join(', ')}`);
  const [, kind, nation, threshold] = m;
  const k = KINDS[kind];
  if (!k) throw new Error(`unknown metric kind "${kind}"; try ${Object.keys(KINDS).join(', ')}`);
  if ((typeof k === 'function') !== (nation !== undefined)) throw new Error(`metric ${kind} ${typeof k === 'function' ? 'needs a nation, as in ' + kind + ':RUS' : 'takes no nation'}`);
  const base = typeof k === 'function' ? k(nation as NationId) : k;
  return { ...base, id: spec, threshold: threshold === undefined ? undefined : Number(threshold) };
}

/** Pairs at war in `world`, or about to be by a queued declaration, attacker first. */
export function belligerentPairs(world: World): [NationId, NationId][] {
  const pairs: [NationId, NationId][] = [];
  for (const c of world.pending) if (c.type === 'declare_war') pairs.push([c.nation, c.target]);
  for (const [k, r] of Object.entries(world.relations)) {
    const [a, b] = k.split('|') as NationId[];
    if (r.atWar && !pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) pairs.push([a, b]);
  }
  return pairs;
}

/** Default metrics for a world: ground that changed hands, then for each war the attacker's gains and both sides' casualties. */
export function defaultMetrics(world: World): string[] {
  const out = new Set(['territory_changed']);
  for (const [a, b] of belligerentPairs(world)) {
    out.add(`net_cells:${a}>0`);
    out.add(`ground_km2:${a}`);
    out.add(`advance_km:${a}`);
    out.add(`casualties:${a}`);
    out.add(`casualties:${b}`);
  }
  return [...out];
}

/** Tallies a run's events into what `RunTrace` needs. */
export function eventTally(map: GameMap) {
  const casualties: Record<NationId, number> = {};
  return {
    casualties,
    add(events: readonly SimEvent[]) {
      for (const e of events) {
        if (e.type !== 'battle' || e.node >= map.landCount) continue;
        for (const [n, c] of Object.entries(e.casualties)) casualties[n as NationId] = (casualties[n as NationId] ?? 0) + c;
      }
    },
  };
}
