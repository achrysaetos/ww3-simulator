import type { Catalog } from '../core/catalog';
import { atWar, enemiesOf } from '../core/engine';
import type { GameMap } from '../core/map';
import type { NationId, World } from '../core/types';
import { AID_FLOWS, DEFAULT_SEABORNE_TRADE_SHARE, RESOURCE_SPECS, SEABORNE_TRADE_SHARE } from '../data/industry';
import { hostedBy } from '../systems/civil/state';
import { adaptationEdge } from '../systems/adaptation';
import { exportCapacity, ladderOf } from '../systems/economy';
import { involved, sampleOutputs, type NationSample, type OutputSample } from './sample';
import { RACE_ITEMS, type Edges, type Humanitarian, type ItemRace, type NationOutputs, type Outputs, type RaceItem, type Workaround, type WorkaroundStatus } from './types';

export * from './types';
export { involved, sampleOutputs, type NationSample, type OutputSample } from './sample';
export { outputRanges, outputRows, type OutputRange, type OutputRow } from './rows';

const DAYS_PER_MONTH = 30;
const HOSTS_SHOWN = 5;

const dayOf = (world: World, tick: number) => (tick * world.dtHours) / 24;

const homeCache = new WeakMap<GameMap, Map<NationId, number[]>>();
function homeCells(map: GameMap): Map<NationId, number[]> {
  let out = homeCache.get(map);
  if (!out) {
    out = new Map();
    for (let c = 0; c < map.landCount; c++) {
      const o = map.owner[c];
      if (!o) continue;
      const list = out.get(o) ?? out.set(o, []).get(o)!;
      list.push(c);
    }
    homeCache.set(map, out);
  }
  return out;
}

function humanitarian(world: World, map: GameMap, id: NationId, hosting: number): Humanitarian {
  const c = world.slices.civil?.nations[id];
  const e = world.slices.economy?.nations[id];
  let pop = 0, infra = 0, power = 0;
  for (const cell of homeCells(map).get(id) ?? []) {
    const w = map.popShare[cell];
    pop += w;
    infra += w * (world.theater.infrastructure[cell] ?? 1);
    power += w * (world.theater.power?.[cell] ?? 1);
  }
  return {
    militaryCasualties: c?.military ?? 0,
    civiliansKilled: c?.killed ?? 0,
    civiliansInjured: c?.injured ?? 0,
    idps: c?.idps ?? 0,
    refugees: c?.refugees ?? 0,
    hosting,
    underOccupation: c?.underOccupation ?? 0,
    infrastructure: pop > 0 ? infra / pop : 1,
    power: pop > 0 ? power / pop : 1,
    food: e?.supply.food ?? 1,
    energy: e?.supply.energy ?? 1,
    fuel: e?.oil?.supply ?? 1,
  };
}

const UNIT: Record<RaceItem, ItemRace['unit']> = { shells: 'rounds', ammo: 'tons', interceptors: 'rounds', cruise: 'rounds', ballistic: 'rounds', drones: 'rounds' };
/** A stock below this is spent: one round, or one ton of ammunition. */
const EMPTY = 1;

/** Between two samples of one nation: what was made, shipped in, and used of `item`. */
function flow(a: NationSample, b: NationSample, item: RaceItem) {
  const produced = (b.produced[item] ?? 0) - (a.produced[item] ?? 0);
  const aid = (b.aid[item] ?? 0) - (a.aid[item] ?? 0);
  const used = item === 'shells' ? b.shellsFired - a.shellsFired : (a.stock[item] ?? 0) + produced + aid - (b.stock[item] ?? 0);
  return { produced, aid, used: Math.max(0, used) };
}

function race(world: World, series: { tick: number; s: NationSample }[], item: RaceItem): ItemRace | null {
  const first = series[0], last = series[series.length - 1];
  const stocked = item !== 'shells';
  const stockOf = (s: NationSample) => (stocked ? (s.stock[item] ?? 0) : null);
  const total = flow(first.s, last.s, item);
  if (!(first.s.stock[item] ?? 0) && !total.produced && !total.aid && !total.used) return null;
  const monthTicks = (DAYS_PER_MONTH * 24) / world.dtHours;
  const from = series.find((x) => x.tick >= last.tick - monthTicks) ?? first;
  const days = dayOf(world, last.tick - from.tick);
  const w = flow(from.s, last.s, item);
  const perMonth = (x: number) => (days > 0 ? (x / days) * DAYS_PER_MONTH : 0);
  const stock = stockOf(last.s);
  const net = days > 0 ? (w.produced + w.aid - w.used) / days : 0;
  const zeroDay = stock !== null && stock >= EMPTY && net < 0 ? dayOf(world, last.tick) + stock / -net : null;
  const empty = stocked && (first.s.stock[item] ?? 0) >= EMPTY ? series.find((x) => (x.s.stock[item] ?? 0) < EMPTY) : undefined;
  const monthly: ItemRace['monthly'] = [];
  for (let k = 1, start = first; ; k++) {
    const end = [...series].reverse().find((x) => x.tick <= first.tick + k * monthTicks);
    if (!end || end.tick <= start.tick) break;
    const f = flow(start.s, end.s, item);
    monthly.push({ day: Math.round(dayOf(world, end.tick)), stock: stockOf(end.s), ...f });
    start = end;
    if (end === last) break;
  }
  return {
    item,
    unit: UNIT[item],
    stock,
    producedPerMonth: perMonth(w.produced),
    aidPerMonth: perMonth(w.aid),
    usedPerMonth: perMonth(w.used),
    zeroDay,
    ranOutDay: empty ? dayOf(world, empty.tick) : null,
    monthly,
  };
}

const grade = (level: number, strained: number, failing: number): WorkaroundStatus => (level < failing ? 'failing' : level < strained ? 'strained' : 'holding');
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Sanctions sides are not recorded, so a nation counts as sanctioned when the economies it has
 * sanctions with hold at least this share of its trade partners' GDP: Russia under the Western
 * packages, not Germany for its side of them.
 */
const SANCTIONED_SHARE = 0.1;

/**
 * The workarounds a cut-off war economy leans on, each read from the economy model:
 * - trade_rerouting: goods from sanctioning states arriving through third countries. Russia's
 *   goods imports fell ~15% in 2022 and were near 2021 levels by 2023 (Bank of Russia balance of payments).
 * - dual_use_imports: export-controlled chips through China, Turkey and Central Asia, and stocks.
 *   Western microelectronics were in nearly every recovered Russian missile and drone (KSE 2023-24;
 *   Conflict Armament Research 2022-24).
 * - shadow_fleet: a sanctioned exporter's oil still sailing. KSE estimated that ~70% of Russia's
 *   seaborne crude moved on shadow-fleet tankers in 2024. The model reroutes sanctioned oil in full,
 *   so only blockade and strikes on export sites cut it.
 * - foreign_arms: arms pipelines from partners (North Korean shells for Russia; Western and
 *   Czech-initiative shells for Ukraine; data/industry/aid.ts), against their planned rate.
 */
/** What every nation's workarounds read from the whole world, scanned once per reading. */
interface Trade {
  sanctions: Map<NationId, NationId[]>;
  worldGdp: number;
  exports: Map<NationId, number>;
}

function tradeScan(world: World, map: GameMap): Trade {
  const sanctions = new Map<NationId, NationId[]>();
  for (const [k, r] of Object.entries(world.relations)) {
    if (!r.sanctions || r.atWar) continue;
    const [a, b] = k.split('|') as NationId[];
    (sanctions.get(a) ?? sanctions.set(a, []).get(a)!).push(b);
    (sanctions.get(b) ?? sanctions.set(b, []).get(b)!).push(a);
  }
  let worldGdp = 0;
  for (const n of Object.values(world.nations)) worldGdp += n.stats.gdp ?? 0;
  return { sanctions, worldGdp, exports: exportCapacity(world, map) };
}

function workarounds(world: World, trade: Trade, id: NationId, series: { tick: number; s: NationSample }[]): Workaround[] {
  const e = world.slices.economy?.nations[id];
  if (!e) return [];
  const out: Workaround[] = [];
  const sanctioners = trade.sanctions.get(id) ?? [];
  const gdp = (n: NationId) => world.nations[n]?.stats.gdp ?? 0;
  const sanctioned = sanctioners.reduce((a, p) => a + gdp(p), 0) >= SANCTIONED_SHARE * (trade.worldGdp - gdp(id));
  const blocked = (world.theater.tradeBlocked[id] ?? 0) * (SEABORNE_TRADE_SHARE[id] ?? DEFAULT_SEABORNE_TRADE_SHARE);
  if (sanctioned) {
    const level = 1 - e.tradeLoss;
    out.push({ id: 'trade_rerouting', status: grade(level, 0.8, 0.5), level, detail: `${sanctioners.length} states sanction it; ${pct(level)} of normal foreign trade still arrives` });
  }
  if (sanctioned || blocked > 0) {
    const level = e.supply.semiconductors;
    const months = e.buffers.semiconductors.reduce((a, b) => a + b, 0);
    const status = level < 0.7 ? 'failing' : level < 0.95 || months < 3 ? 'strained' : 'holding';
    out.push({ id: 'dual_use_imports', status, level, detail: `${pct(level)} of chip needs met, ${months.toFixed(1)} months of stock left` });
  }
  if (sanctioned && Object.hasOwn(RESOURCE_SPECS.energy.market, id)) {
    const level = (1 - blocked) * e.integrity * (trade.exports.get(id) ?? 1);
    out.push({ id: 'shadow_fleet', status: grade(level, 0.8, 0.5), level, detail: `${pct(level)} of energy exports still moving despite sanctions` });
  }
  const flows = AID_FLOWS.filter((f) => f.recipient === id && world.nations[f.donor as NationId]);
  const first = series[0], last = series[series.length - 1];
  const monthTicks = (DAYS_PER_MONTH * 24) / world.dtHours;
  const from = series.find((x) => x.tick >= last.tick - monthTicks) ?? first;
  const days = dayOf(world, last.tick - from.tick);
  if (flows.length && world.nations[id].status === 'war' && days >= 1) {
    const planned = flows.reduce((a, f) => a + (f.perYear / 365) * days, 0);
    const level = Math.min(1, (last.s.aidReceived - from.s.aidReceived) / planned);
    const cut = flows.filter((f) => atWar(world, f.donor as NationId, id) || world.slices.politics?.nations[f.donor as NationId]?.aid?.continues === false).length;
    out.push({ id: 'foreign_arms', status: grade(level, 0.8, 0.5), level, detail: `${pct(level)} of planned arms deliveries arrived over the last ${Math.round(days)} days${cut ? `; ${cut} of ${flows.length} pipelines stopped` : ''}` });
  }
  return out;
}

/**
 * The adaptation edge from the duels, and the production edge over the trailing month (or the run so far):
 * the catalog value its lines delivered against what its current enemies' lines delivered together.
 */
function edges(world: World, id: NationId, samples: readonly OutputSample[]): Edges {
  const last = samples[samples.length - 1];
  const monthTicks = (DAYS_PER_MONTH * 24) / world.dtHours;
  const from = samples.find((x) => x.tick >= last.tick - monthTicks) ?? samples[0];
  const made = (n: NationId) => (last.nations[n]?.producedUsdM ?? 0) - (from.nations[n]?.producedUsdM ?? 0);
  const own = made(id);
  const theirs = enemiesOf(world, id).reduce((a, n) => a + made(n), 0);
  return { adaptation: Math.tanh(adaptationEdge(world, id)), production: own + theirs > 0 ? (own - theirs) / (own + theirs) : 0 };
}

/** The Outputs of a run so far, from its samples (oldest first, the latest taken at the World's tick). Pure. */
export function outputsOf(world: World, map: GameMap, samples: readonly OutputSample[]): Outputs {
  const hosted = world.slices.civil ? hostedBy(world.slices.civil) : new Map<NationId, number>();
  const nations: Record<NationId, NationOutputs> = {};
  const trade = tradeScan(world, map);
  for (const id of involved(world)) {
    const series = samples.flatMap((x) => (x.nations[id] ? [{ tick: x.tick, s: x.nations[id] }] : []));
    if (!series.length) continue;
    nations[id] = {
      humanitarian: humanitarian(world, map, id, hosted.get(id) ?? 0),
      race: RACE_ITEMS.flatMap((item) => race(world, series, item) ?? []),
      workarounds: workarounds(world, trade, id, series),
      edges: edges(world, id, samples),
      ladder: ladderOf(world, map, id).map((c) => ({ ...c, cutoff: c.cutoff as NationId | 'sea' })),
    };
  }
  const hosts = [...hosted].filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).slice(0, HOSTS_SHOWN).map(([nation, refugees]) => ({ nation, refugees }));
  return { tick: world.tick, day: dayOf(world, world.tick), nations, hosts };
}

/**
 * Samples a running World on a fixed cadence (daily by default) and turns the samples into
 * Outputs on demand. Reads the World only; it keeps its own samples, never on the World.
 */
export class OutputsRecorder {
  readonly samples: OutputSample[] = [];

  constructor(private readonly catalog: Catalog, private readonly everyHours = 24) {}

  /** Takes a sample if a cadence step has passed since the last one. Call after each tick (or snapshot). */
  observe(world: World): void {
    const last = this.samples[this.samples.length - 1];
    if (last && (world.tick - last.tick) * world.dtHours < this.everyHours) return;
    this.samples.push(sampleOutputs(world, this.catalog));
  }

  outputs(world: World, map: GameMap): Outputs {
    const last = this.samples[this.samples.length - 1];
    const samples = last?.tick === world.tick ? this.samples : [...this.samples, sampleOutputs(world, this.catalog)];
    return outputsOf(world, map, samples);
  }
}
