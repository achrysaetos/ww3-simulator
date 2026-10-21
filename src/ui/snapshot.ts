/**
 * Worker <-> UI wire format. The worker owns the World; the UI holds a decoded
 * mirror (`ClientState`) built only from snapshots. Facts that never change
 * during a session (names, blocs, the catalog) travel once in `SessionMeta`.
 * Per-tick data is typed arrays: nodes fit in 16 bits, strength in 8, and the
 * control map is sent only when some node changed hands. With the full world
 * (~2,500 formations, 193 nations) a tick costs about 25 KB plus events.
 */
import { enemiesOf } from '../core/engine';
import { platformCount } from '../core/forces';
import type { GameMap } from '../core/map';
import type { Catalog } from '../core/catalog';
import { BMD_SYSTEMS } from '../systems/strategic/tables';
import { supplyFactor } from '../systems/logistics';
import { cellDepthKm } from '../systems/land/state';
import { geography } from '../systems/naval/geography';
import { compose } from '../systems/naval/state';
import { liftShare } from '../systems/naval/amphibious';
import { boardable } from '../systems/naval/orders';
import { isSealift } from '../systems/naval/sealift';
import { airliftTonsPerDay, airPortable, airTons, awaitingLift, deckSlots, liftMode, overseas } from '../systems/land/strategic';
import { authority } from '../systems/orders';
import { deliveryReachKm, isLive } from '../systems/strategic/nuclear';
import type {
  Command, CommandDomain, Echelon, Formation, FormationId, FormationKind, ItemId, MunitionId, MunitionKind, Nation, NationId, NodeId, PlatformId, Posture, SimEvent, World,
} from '../core/types';

export const NO_NATION = 0xffff;
export const NO_NODE = 0xffff;
export const POSTURES: readonly Posture[] = ['reserve', 'defend', 'attack', 'move', 'strike', 'air_superiority', 'patrol', 'blockade', 'escort', 'embark', 'air_assault'];
export const STATUSES: readonly Formation['status'][] = ['active', 'routed', 'destroyed', 'embarked'];
const NATION_STATUSES: readonly Nation['status'][] = ['peace', 'war', 'capitulated', 'collapsed'];
/** Per-nation numbers sent every tick, packed in this order. */
const NATION_FIELDS = ['status', 'human', 'mobilization', 'warSupport', 'reserves', 'population', 'treasuryUsdB', 'warheads', 'deployed'] as const;
/** Above this many changed nodes a full control array is cheaper than pairs. */
const DIFF_LIMIT = 2_000;
const EVENT_LIMIT = 400;

// ---------------------------------------------------------------- messages

export interface ScenarioCard {
  id: string;
  name: string;
  summary: string;
  startDate: string;
  suggestedNation: NationId;
  /** Nations in the opening wars, aggressors first. */
  belligerents: NationId[];
  /** The opening wars as [aggressor, target], in declaration order. */
  wars: [NationId, NationId][];
}

export interface NationCard {
  id: NationId;
  name: string;
  blocs: string[];
  doctrine: Nation['nuclear']['doctrine'];
  gdpUsdB: number;
}

export type ToWorker =
  | { type: 'start'; scenario: string; nation: NationId; seed: number }
  /** Resume a save file's text (the CLI's --save format). */
  | { type: 'load'; text: string }
  | { type: 'save' }
  /** End the session and go back to the start screen. */
  | { type: 'quit' }
  /** Target ticks per second; 0 pauses. The worker never runs ahead of the UI's acks. */
  | { type: 'speed'; ticksPerSec: number }
  | { type: 'step' }
  | { type: 'ack' }
  /** Untrusted until the worker's boundary (commands.ts) has checked it. */
  | { type: 'command'; command: Command }
  | { type: 'play_as'; nation: NationId }
  | { type: 'focus'; nation?: NationId; formation?: FormationId };

export interface RunStats {
  /** Wall time of the latest engine step. */
  stepMs: number;
  /** Ticks actually completed per second over the last few seconds. */
  achievedTps: number;
}

export type FromWorker =
  | { type: 'hello'; scenarios: ScenarioCard[]; nations: NationCard[] }
  | { type: 'ready'; meta: SessionMeta; playing: NationId; snapshot: Snapshot }
  | { type: 'saved'; text: string; scenario: string; tick: number }
  | { type: 'load_failed'; message: string }
  | { type: 'closed' }
  /** A command the boundary rejected, and why. */
  | { type: 'refused'; reason: string }
  | { type: 'snapshot'; snapshot: Snapshot; stats: RunStats }
  | { type: 'error'; message: string };

export interface SessionMeta {
  scenario: ScenarioCard;
  /** Index order used by every nation index in snapshots. */
  nationIds: NationId[];
  platforms: Record<string, { name: string; class: string; domain: string; producers: NationId[]; costUsdM: number }>;
  munitions: Record<string, { name: string; kind: MunitionKind; yieldKt?: number; rangeKm: number; producers: NationId[]; costUsdM: number }>;
  dtHours: number;
}

export interface RosterEntry {
  id: FormationId;
  name: string;
  nation: NationId;
  kind: FormationKind;
  echelon: Echelon;
  /** Operational platforms when first seen; strength is measured against it. */
  platforms: number;
}

export interface NationSummary {
  id: NationId;
  name: string;
  blocs: string[];
  status: Nation['status'];
  controlledBy: Nation['controlledBy'];
  mobilization: number;
  warSupport: number;
  reserves: number;
  population: number;
  treasuryUsdB: number;
  gdpUsdB: number;
  warheads: number;
  deployed: number;
  doctrine: Nation['nuclear']['doctrine'];
}

/** One munition family a dashboard tracks, totalled across warehouses and loaded magazines. */
export interface MunitionStock {
  group: MunitionGroup;
  warehoused: number;
  loaded: number;
  /** Current production capacity of the nation's lines in this group, per month. */
  perMonth: number;
}

export const MUNITION_GROUPS = ['interceptor', 'aam', 'cruise', 'ballistic', 'rocket', 'atgm', 'drone', 'bomb', 'torpedo', 'nuclear'] as const;
export type MunitionGroup = (typeof MUNITION_GROUPS)[number];

export const GROUP_OF_KIND: Record<MunitionKind, MunitionGroup | null> = {
  sam: 'interceptor', abm: 'interceptor', shorad_missile: 'interceptor',
  aam: 'aam',
  cruise: 'cruise', antiship_cruise: 'cruise', arm: 'cruise',
  srbm: 'ballistic', mrbm: 'ballistic', irbm: 'ballistic', icbm: 'ballistic', slbm: 'ballistic', hgv: 'ballistic', antiship_ballistic: 'ballistic',
  rocket: 'rocket', guided_rocket: 'rocket',
  atgm: 'atgm',
  loitering: 'drone', drone_oneway: 'drone',
  glide_bomb: 'bomb', guided_bomb: 'bomb', unguided_bomb: 'bomb',
  torpedo: 'torpedo', mine: 'torpedo',
  shell: null, guided_shell: null, small_arms: null,
};

/** How a nation came to be in a war, read from the war_declared events that brought it in. */
export interface WarEntry {
  nation: NationId;
  /** The war_declared reason; a treaty entry reads like "NATO: defence of POL". */
  reason: string;
  tick: number;
}

export interface WarView {
  id: string;
  aggressor: NationId;
  /** Side 0 is the aggressor's. Each member carries how it got in. */
  sides: [WarEntry[], WarEntry[]];
  startTick: number;
  /** Treaty members whose decision is still pending. */
  pending: { nation: NationId; treaty: string; side: 0 | 1; dueTick: number }[];
}

export interface EconomyView {
  gdpIndex: number;
  deficitPctGdp: number;
  integrity: number;
  tradeLoss: number;
  inTraining: number;
  /** Months of national stock left per strategic resource. */
  buffers: Record<string, number>;
  /** Share of need met this tick per resource. */
  supply: Record<string, number>;
  short: string[];
  /** Production lines with the highest output per month, then any line still ramping toward an order. */
  lines: { item: ItemId; perMonth: number; ordered: number | null; built: number }[];
  /** Every line's output now and the most it can surge to, per month, keyed by item. */
  capacity: Record<string, { perMonth: number; surge: number }>;
}

/** A treaty call waiting on a human nation's answer. */
export interface TreatyCall {
  war: string;
  treaty: string;
  victim: NationId;
  aggressor: NationId;
  dueTick: number;
  /** A second call after an earlier refusal; refusing again ends it. */
  reconsidered: boolean;
}

export interface NationDetail {
  id: NationId;
  /** Which domains the AI delegate runs and which formations the player holds (a human nation). */
  authority: { ai: Record<CommandDomain, boolean>; held: FormationId[] };
  treatyCalls: TreatyCall[];
  /** Open peace offers between this nation and its enemies. */
  peaceOffers: { from: NationId; to: NationId }[];
  /** Nations it has sanctions in force with. */
  sanctions: NationId[];
  /** Mobilisation level ordered and still being reached; null when none is pending. */
  mobilizationTarget: number | null;
  bulk: Nation['bulk'];
  enemies: NationId[];
  /** Land cells currently held, and how many of them were held at start. */
  nodesHeld: number;
  nodesHome: number;
  formations: number;
  personnel: number;
  economy: EconomyView | null;
  munitions: MunitionStock[];
  wars: WarView[];
  nuclear: {
    posture: string | null;
    /** Launchers in strategic formations and their loaded nuclear rounds. */
    launchers: number;
    loadedWarheads: number;
    /** Remaining interceptors per national missile-defence system. */
    bmd: Record<string, number>;
    satellites: number;
    /** Nuclear rounds on launchers, by weapon: where each launching formation stands and how far it reaches. */
    weapons: NuclearWeapon[];
  };
}

export interface NuclearWeapon {
  munition: MunitionId;
  sites: { node: NodeId; reachKm: number; rounds: number }[];
}

export interface FormationDetail {
  formation: Formation;
  /** Share of nominal supply reaching its cell through the national network, 0..1; null if no network. */
  supplyFlow: number | null;
  /** Days cut off from friendly supply. */
  isolatedDays: number;
  /** In a ground engagement this tick. */
  engaged: boolean;
  /** Hostile nations holding a track on it (naval). */
  trackedBy: NationId[];
  /** The sea zone its port opens onto, when it stands in a port cell; lift groups wait there to load. */
  portZone: NodeId | null;
  /** For ground formations: own lift groups, and whether it can board each now. */
  lifts: LiftOption[];
  /** For a surface group: the formations it carries. */
  aboard: { id: FormationId; name: string }[];
  /** For a ground formation: what strategic deployment overseas can use. */
  deploy: DeployView | null;
}

/** Strategic deployment: a 'move' to another land mass, crossing by the nation's airlift or its cargo ships (land/strategic.ts). */
export interface DeployView {
  /** No tracked or heavy vehicles, so it can fly. */
  airPortable: boolean;
  /** Tons it puts on aircraft, and the nation's daily airlift for its land forces. */
  airTons: number;
  airliftTonsPerDay: number;
  /** Deck slots it needs, and the nation's cargo-ship groups and their slots. */
  deckSlots: number;
  sealiftGroups: number;
  sealiftSlots: number;
  /** Cargo ships sail only once the nation is at war. */
  atWar: boolean;
  /** An overseas move under way: how it crosses, and whether it is at its gateway waiting for lift. */
  deploying: { mode: 'air' | 'sea'; target: NodeId; waiting: boolean; flownTons: number } | null;
}

export interface LiftOption {
  id: FormationId;
  name: string;
  node: NodeId;
  /** Share of this formation it can carry in the room it has left, 0..1. */
  share: number;
  /** The lift group is in this formation's port or just offshore of it. */
  boardNow: boolean;
}

export interface Snapshot {
  tick: number;
  date: string;
  control?: Uint16Array;
  /** Flat (node, nationIndex) pairs applied on top of the previous control array. */
  controlDiff?: Uint32Array;
  roster?: RosterEntry[];
  /** Formations new since the last snapshot, appended to the roster (formations are never removed, only added). */
  rosterAdd?: RosterEntry[];
  fNode: Uint16Array;
  /** Operational platforms divided by the count first seen, scaled to 0..255. */
  fStrength: Uint8Array;
  fPosture: Uint8Array;
  fStatus: Uint8Array;
  /** Order target node, NO_NODE for none. */
  fTarget: Uint16Array;
  events: SimEvent[];
  droppedEvents: number;
  /** NATION_FIELDS per nation, in meta.nationIds order. */
  nations: Float32Array;
  wars: [NationId, NationId][];
  /** Flat (node, nationIndex, level) triples. */
  air: Float32Array;
  sea: Float32Array;
  /** Flat (node, value) pairs for nodes with infrastructure < 1. */
  infra: Float32Array;
  fallout: Float32Array;
  /** Flat (node, nationIndex, share) triples: cells an enemy is pushing into, and how far across it has got, 0..1. */
  contest: Float32Array;
  focusNation?: NationDetail;
  focusFormation?: FormationDetail;
}

// ---------------------------------------------------------------- encoder (worker side)

export class SnapshotEncoder {
  private lastControl: Uint16Array | null = null;
  private lastIds: FormationId[] = [];
  private readonly initial = new Map<FormationId, number>();
  private readonly nationIndex: Map<NationId, number>;
  private events: SimEvent[] = [];
  private dropped = 0;
  /** First war_declared that put each nation into each war, keyed `nation|enemy`. */
  private readonly entries = new Map<string, WarEntry>();

  constructor(readonly nationIds: NationId[], private readonly catalog: Catalog, mapSize: number) {
    if (mapSize >= NO_NODE) throw new Error(`map has ${mapSize} nodes; the wire format packs nodes in 16 bits`);
    this.nationIndex = new Map(nationIds.map((n, i) => [n, i]));
  }

  /** Buffer events from ticks that run between two snapshots. */
  collect(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'war_declared') {
        const entry = { reason: e.reason, tick: e.tick };
        if (!this.entries.has(`${e.by}|${e.on}`)) this.entries.set(`${e.by}|${e.on}`, { nation: e.by, ...entry });
        if (!this.entries.has(`${e.on}|${e.by}`)) this.entries.set(`${e.on}|${e.by}`, { nation: e.on, ...entry, reason: `attacked by ${e.by}` });
      }
      if (this.events.length < EVENT_LIMIT) this.events.push(e);
      else this.dropped++;
    }
  }

  encode(world: World, map: GameMap, focus: { nation?: NationId; formation?: FormationId } = {}): Snapshot {
    const control = this.controlArray(world);
    const snap: Snapshot = {
      tick: world.tick,
      date: dateOf(world),
      fNode: new Uint16Array(0),
      fStrength: new Uint8Array(0),
      fPosture: new Uint8Array(0),
      fStatus: new Uint8Array(0),
      fTarget: new Uint16Array(0),
      events: this.events,
      droppedEvents: this.dropped,
      nations: this.nationNumbers(world),
      wars: wars(world),
      air: this.sparseControl(world.theater.airControl),
      sea: this.sparseControl(world.theater.seaControl),
      infra: sparseBelow(world.theater.infrastructure, 1),
      fallout: sparseRecord(world.theater.fallout),
      contest: this.contested(world, map),
    };
    this.events = [];
    this.dropped = 0;

    const prev = this.lastControl;
    if (!prev) snap.control = control;
    else {
      const pairs: number[] = [];
      for (let n = 0; n < control.length && pairs.length <= DIFF_LIMIT * 2; n++)
        if (control[n] !== prev[n]) pairs.push(n, control[n]);
      if (pairs.length > DIFF_LIMIT * 2) snap.control = control;
      else if (pairs.length) snap.controlDiff = Uint32Array.from(pairs);
    }
    this.lastControl = control;

    const fs = Object.values(world.formations);
    for (const f of fs) if (!this.initial.has(f.id)) this.initial.set(f.id, Math.max(1, platformCount(f)));
    const entry = (f: Formation): RosterEntry => ({ id: f.id, name: f.name, nation: f.nation, kind: f.kind, echelon: f.echelon, platforms: this.initial.get(f.id)! });
    const prevIds = this.lastIds;
    const kept = fs.length >= prevIds.length && prevIds.every((id, i) => fs[i].id === id);
    if (!kept) snap.roster = fs.map(entry);
    else if (fs.length > prevIds.length) snap.rosterAdd = fs.slice(prevIds.length).map(entry);
    if (!kept || fs.length > prevIds.length) this.lastIds = fs.map((f) => f.id);
    const n = fs.length;
    snap.fNode = new Uint16Array(n);
    snap.fStrength = new Uint8Array(n);
    snap.fPosture = new Uint8Array(n);
    snap.fStatus = new Uint8Array(n);
    snap.fTarget = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      const f = fs[i];
      snap.fNode[i] = f.node;
      snap.fStrength[i] = Math.round(Math.min(1, platformCount(f) / this.initial.get(f.id)!) * 255);
      snap.fPosture[i] = POSTURES.indexOf(f.order.posture);
      snap.fStatus[i] = STATUSES.indexOf(f.status);
      snap.fTarget[i] = f.order.target ?? NO_NODE;
    }

    if (focus.nation && world.nations[focus.nation]) snap.focusNation = this.nationDetail(world, map, focus.nation);
    if (focus.formation && world.formations[focus.formation]) snap.focusFormation = formationDetail(world, map, this.catalog, world.formations[focus.formation]);
    return snap;
  }

  private nationNumbers(world: World): Float32Array {
    const k = NATION_FIELDS.length;
    const out = new Float32Array(this.nationIds.length * k);
    this.nationIds.forEach((id, i) => {
      const n = world.nations[id];
      if (!n) return;
      const o = i * k;
      out[o] = NATION_STATUSES.indexOf(n.status);
      out[o + 1] = n.controlledBy === 'human' ? 1 : 0;
      out[o + 2] = n.mobilization;
      out[o + 3] = n.warSupport;
      out[o + 4] = n.reserves;
      out[o + 5] = n.population;
      out[o + 6] = n.treasuryUsdB;
      out[o + 7] = n.nuclear.warheads;
      out[o + 8] = n.nuclear.deployed;
    });
    return out;
  }

  private contested(world: World, map: GameMap): Float32Array {
    const rec = world.slices.land?.contest ?? {};
    const keys = Object.keys(rec);
    const out = new Float32Array(keys.length * 3);
    keys.forEach((k, i) => {
      const c = rec[+k];
      out[i * 3] = +k;
      out[i * 3 + 1] = this.nationIndex.get(c.by) ?? NO_NATION;
      out[i * 3 + 2] = Math.min(1, c.km / cellDepthKm(map, +k as NodeId));
    });
    return out;
  }

  private controlArray(world: World): Uint16Array {
    const out = new Uint16Array(world.control.length);
    for (let i = 0; i < out.length; i++) out[i] = this.nationIndex.get(world.control[i]) ?? NO_NATION;
    return out;
  }

  private sparseControl(rec: Record<number, { nation: NationId; level: number }>): Float32Array {
    const keys = Object.keys(rec);
    const out = new Float32Array(keys.length * 3);
    keys.forEach((k, i) => {
      const v = rec[+k];
      out[i * 3] = +k;
      out[i * 3 + 1] = this.nationIndex.get(v.nation) ?? NO_NATION;
      out[i * 3 + 2] = v.level;
    });
    return out;
  }

  private nationDetail(world: World, map: GameMap, id: NationId): NationDetail {
    const n = world.nations[id];
    const { catalog } = this;
    let held = 0, home = 0;
    for (let i = 0; i < map.landCount; i++) {
      if (world.control[i] === id) held++;
      if (map.owner[i] === id) home++;
    }
    const groups = new Map<MunitionGroup, MunitionStock>(MUNITION_GROUPS.map((g) => [g, { group: g, warehoused: 0, loaded: 0, perMonth: 0 }]));
    const groupOf = (item: string): MunitionGroup | null => {
      const m = catalog.munitions.get(item as never);
      if (!m) return null;
      return m.yieldKt ? 'nuclear' : GROUP_OF_KIND[m.kind];
    };
    for (const [item, count] of Object.entries(n.stockpile)) {
      const g = groupOf(item);
      if (g) groups.get(g)!.warehoused += count;
    }
    let formations = 0, personnel = 0, launchers = 0, loadedWarheads = 0;
    const weapons = new Map<MunitionId, NuclearWeapon>();
    for (const f of Object.values(world.formations)) {
      if (f.nation !== id || f.status === 'destroyed') continue;
      formations++;
      personnel += f.personnel;
      if (f.kind === 'strategic') launchers += platformCount(f);
      for (const [mid, count] of Object.entries(f.magazine) as [MunitionId, number][]) {
        const g = groupOf(mid);
        if (!g) continue;
        groups.get(g)!.loaded += count;
        if (g !== 'nuclear') continue;
        loadedWarheads += count;
        if (count <= 0 || !isLive(f)) continue;
        const w = weapons.get(mid) ?? weapons.set(mid, { munition: mid, sites: [] }).get(mid)!;
        w.sites.push({ node: f.node, reachKm: deliveryReachKm(catalog, f, catalog.munitions.get(mid)!), rounds: count });
      }
    }
    const eco = world.slices.economy?.nations[id];
    if (eco) for (const line of Object.values(eco.lines)) {
      const g = groupOf(line.item);
      if (g) groups.get(g)!.perMonth += line.capacityPerMonth;
    }
    const strategic = world.slices.strategic;
    const space = strategic?.space[id];
    const diplomacy = world.slices.diplomacy;
    const auth = authority(world, id);
    const sanctions: NationId[] = [];
    for (const [k, r] of Object.entries(world.relations)) {
      if (!r.sanctions) continue;
      const [a, b] = k.split('|') as [NationId, NationId];
      if (a === id || b === id) sanctions.push(a === id ? b : a);
    }
    return {
      id,
      authority: { ai: { ...auth.ai }, held: Object.keys(auth.held) as FormationId[] },
      treatyCalls: (diplomacy?.joins ?? []).filter((j) => j.nation === id).map((j) => ({
        war: j.war, treaty: j.treaty, victim: j.victim, aggressor: j.aggressor, dueTick: j.dueTick, reconsidered: !!j.reconsidered,
      })),
      peaceOffers: Object.entries(diplomacy?.offers ?? {}).flatMap(([k, from]) => {
        const [a, b] = k.split('|') as [NationId, NationId];
        return a === id || b === id ? [{ from, to: from === a ? b : a }] : [];
      }),
      sanctions,
      mobilizationTarget: eco?.mobilizationTarget ?? null,
      bulk: n.bulk,
      enemies: enemiesOf(world, id),
      nodesHeld: held,
      nodesHome: home,
      formations,
      personnel,
      economy: eco
        ? {
            gdpIndex: eco.gdpIndex, deficitPctGdp: eco.deficitPctGdp, integrity: eco.integrity, tradeLoss: eco.tradeLoss, inTraining: eco.inTraining,
            buffers: Object.fromEntries(Object.entries(eco.buffers).map(([r, tiers]) => [r, tiers.reduce((a, m) => a + m, 0)])), supply: eco.supply, short: eco.short,
            lines: productionLines(Object.values(eco.lines)),
            capacity: Object.fromEntries(Object.values(eco.lines).map((l) => [l.item, { perMonth: l.capacityPerMonth, surge: l.surgePerMonth }])),
          }
        : null,
      munitions: [...groups.values()].filter((g) => g.warehoused || g.loaded || g.perMonth),
      wars: this.warViews(world, id),
      nuclear: {
        posture: strategic?.posture[id] ?? null,
        launchers,
        loadedWarheads,
        bmd: bmdOf(strategic?.interceptors ?? {}, id),
        satellites: space ? Object.values(space).reduce((a, s) => a + s.alive, 0) : 0,
        weapons: [...weapons.values()],
      },
    };
  }

  private warViews(world: World, id: NationId): WarView[] {
    const d = world.slices.diplomacy;
    if (!d) return [];
    return d.wars
      .filter((w) => w.sides[0].includes(id) || w.sides[1].includes(id))
      .map((w) => {
        const entry = (m: NationId, side: 0 | 1): WarEntry => {
          for (const e of w.sides[1 - side]) {
            const found = this.entries.get(`${m}|${e}`);
            if (found) return found;
          }
          return { nation: m, reason: m === w.aggressor ? 'aggressor' : 'scenario start', tick: w.startTick };
        };
        return {
          id: w.id,
          aggressor: w.aggressor,
          startTick: w.startTick,
          sides: [w.sides[0].map((m) => entry(m, 0)), w.sides[1].map((m) => entry(m, 1))],
          pending: d.joins.filter((j) => j.war === w.id).map((j) => ({ nation: j.nation, treaty: j.treaty, side: j.side, dueTick: j.dueTick })),
        };
      });
  }
}

const TOP_LINES = 12;

function productionLines(lines: readonly { item: ItemId; capacityPerMonth: number; orderPerMonth: number | null; built: number }[]): EconomyView['lines'] {
  const view = lines.map((l) => ({ item: l.item, perMonth: l.capacityPerMonth, ordered: l.orderPerMonth, built: l.built })).sort((a, b) => b.perMonth - a.perMonth);
  return [...view.slice(0, TOP_LINES), ...view.slice(TOP_LINES).filter((l) => l.ordered !== null && l.ordered > l.perMonth)];
}

function bmdOf(interceptors: Record<string, number>, id: NationId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sys of BMD_SYSTEMS) if (sys.owner === id) out[sys.id] = interceptors[sys.id] ?? sys.interceptors;
  return out;
}

const GROUND: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'missile', 'logistics']);

/** A ground formation that marches and can be shipped or flown: not an air unit filed under logistics, such as an airlift wing. */
function transportable(catalog: Catalog, f: Formation): boolean {
  if (!GROUND.has(f.kind)) return false;
  return !Object.entries(f.equipment).some(([pid, n]) => n > 0 && catalog.platforms.get(pid as PlatformId)?.domain === 'air');
}

function deployView(world: World, map: GameMap, catalog: Catalog, f: Formation): DeployView {
  let sealiftGroups = 0, sealiftSlots = 0;
  for (const g of Object.values(world.formations)) {
    if (g.nation !== f.nation || g.status !== 'active' || g.kind !== 'surface_group') continue;
    const comp = compose(g, catalog);
    if (!isSealift(comp)) continue;
    sealiftGroups++;
    sealiftSlots += comp.vehicleLift;
  }
  const t = f.order.target;
  return {
    airPortable: airPortable(catalog, f),
    airTons: airTons(catalog, f),
    airliftTonsPerDay: airliftTonsPerDay(world, catalog, f.nation),
    deckSlots: deckSlots(catalog, f),
    sealiftGroups,
    sealiftSlots,
    atWar: enemiesOf(world, f.nation).length > 0,
    deploying: f.status === 'active' && f.order.posture === 'move' && t !== undefined && overseas(map, f.node, t)
      ? { mode: liftMode(world, catalog, f), target: t, waiting: awaitingLift(map, f), flownTons: world.slices.land?.airlifted[f.id] ?? 0 }
      : null,
  };
}

function formationDetail(world: World, map: GameMap, catalog: Catalog, f: Formation): FormationDetail {
  const flow = world.slices.logistics?.networkOf[f.nation] ? supplyFactor(world, map, f.node, f.nation) : undefined;
  const zone = geography(map).portZone.get(f.node);
  const lifts: LiftOption[] = [];
  const aboard: FormationDetail['aboard'] = [];
  const canShip = transportable(catalog, f);
  const loaded = new Map<FormationId, Formation[]>();
  for (const g of Object.values(world.formations)) {
    if (g.status === 'embarked' && g.embarkedOn) (loaded.get(g.embarkedOn) ?? loaded.set(g.embarkedOn, []).get(g.embarkedOn)!).push(g);
  }
  for (const g of Object.values(world.formations)) {
    if (g.embarkedOn === f.id && g.status === 'embarked') aboard.push({ id: g.id, name: g.name });
    if (!canShip || g.nation !== f.nation || g.status !== 'active' || g.kind !== 'surface_group') continue;
    const comp = compose(g, catalog);
    // Amphibious lift only: cargo ships carry strategic deployments on their own (deployView), and carriers carry no troops.
    if (!comp.troopLift || isSealift(comp)) continue;
    const share = liftShare(catalog, f, comp);
    const room = Math.max(0, 1 - (loaded.get(g.id) ?? []).reduce((a, e) => a + liftShare(catalog, e, comp), 0));
    // Below a battalion landing team's worth the engine refuses to embark (naval/orders.ts boardable).
    if (!Number.isFinite(share) || !boardable(room, share)) continue;
    lifts.push({ id: g.id, name: g.name, node: g.node, share: Math.min(1, room / share), boardNow: zone !== undefined && (g.node === f.node || g.node === zone) });
  }
  if (zone !== undefined) lifts.sort((a, b) => Number(b.boardNow) - Number(a.boardNow) || map.distanceKm(f.node, a.node) - map.distanceKm(f.node, b.node));
  else lifts.sort((a, b) => map.distanceKm(f.node, a.node) - map.distanceKm(f.node, b.node));
  return {
    formation: f,
    supplyFlow: flow ?? null,
    isolatedDays: world.slices.land?.isolatedDays[f.id] ?? 0,
    engaged: world.slices.land?.baseline[f.id] !== undefined,
    trackedBy: world.slices.naval?.tracks[f.id] ?? [],
    portZone: zone ?? null,
    lifts,
    aboard,
    deploy: canShip ? deployView(world, map, catalog, f) : null,
  };
}

function dateOf(world: World): string {
  return new Date(Date.parse(world.startDate) + world.tick * world.dtHours * 3_600_000).toISOString();
}

function wars(world: World): [NationId, NationId][] {
  const out: [NationId, NationId][] = [];
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) out.push(k.split('|') as [NationId, NationId]);
  return out;
}

function sparseBelow(values: readonly number[], limit: number): Float32Array {
  const pairs: number[] = [];
  for (let i = 0; i < values.length; i++) if (values[i] < limit) pairs.push(i, values[i]);
  return Float32Array.from(pairs);
}

function sparseRecord(rec: Record<number, number>): Float32Array {
  const pairs: number[] = [];
  for (const [k, v] of Object.entries(rec)) if (v > 0) pairs.push(+k, v);
  return Float32Array.from(pairs);
}

export function nationCards(map: GameMap, profiles: Readonly<Record<string, { blocs?: string[]; nuclear?: Nation['nuclear'] }>>): NationCard[] {
  return map.data.nations.map((raw, i) => {
    const id = map.nationIds[i];
    const p = profiles[id] ?? {};
    return { id, name: raw.name, blocs: p.blocs ?? [], doctrine: p.nuclear?.doctrine ?? 'none', gdpUsdB: ((raw.stats as { gdp?: number }).gdp ?? 0) / 1e9 };
  });
}

export function sessionMeta(scenario: ScenarioCard, world: World, map: GameMap, catalog: Catalog): SessionMeta {
  const platforms: SessionMeta['platforms'] = {};
  for (const p of catalog.platforms.values()) platforms[p.id] = { name: p.name, class: p.class, domain: p.domain, producers: p.producers, costUsdM: p.unitCostUsdM };
  const munitions: SessionMeta['munitions'] = {};
  for (const m of catalog.munitions.values()) munitions[m.id] = { name: m.name, kind: m.kind, yieldKt: m.yieldKt, rangeKm: m.rangeKm, producers: m.producers, costUsdM: m.unitCostUsdM };
  return { scenario, nationIds: map.nationIds, platforms, munitions, dtHours: world.dtHours };
}

// ---------------------------------------------------------------- decoder (UI side)

export interface FormationView {
  entry: RosterEntry;
  node: NodeId;
  strength: number;
  posture: Posture;
  status: Formation['status'];
  target: NodeId | null;
}

export interface ClientState {
  tick: number;
  date: string;
  control: Uint16Array;
  /** Bumped whenever `control` changes, so renderers rebuild cached paths. */
  controlVersion: number;
  formations: FormationView[];
  rosterVersion: number;
  nations: Map<NationId, NationSummary>;
  wars: [NationId, NationId][];
  warsKey: string;
  air: Float32Array;
  sea: Float32Array;
  infra: Float32Array;
  fallout: Float32Array;
  contest: Float32Array;
  focusNation?: NationDetail;
  focusFormation?: FormationDetail;
  /** Events from the latest snapshot only. */
  latestEvents: SimEvent[];
}

export function emptyClientState(size: number): ClientState {
  return {
    tick: 0, date: '', control: new Uint16Array(size).fill(NO_NATION), controlVersion: 0,
    formations: [], rosterVersion: 0, nations: new Map(), wars: [], warsKey: '',
    air: new Float32Array(0), sea: new Float32Array(0), infra: new Float32Array(0), fallout: new Float32Array(0), contest: new Float32Array(0),
    latestEvents: [],
  };
}

export function applySnapshot(state: ClientState, snap: Snapshot, nationIds: readonly NationId[], cards: ReadonlyMap<NationId, NationCard>): void {
  state.tick = snap.tick;
  state.date = snap.date;
  if (snap.control) {
    state.control = snap.control;
    state.controlVersion++;
  } else if (snap.controlDiff) {
    const d = snap.controlDiff;
    for (let i = 0; i < d.length; i += 2) state.control[d[i]] = d[i + 1];
    state.controlVersion++;
  }
  let roster = state.formations.map((f) => f.entry);
  if (snap.roster) {
    roster = snap.roster;
    state.rosterVersion++;
  } else if (snap.rosterAdd) {
    roster = [...roster, ...snap.rosterAdd];
    state.rosterVersion++;
  }
  state.formations = roster.map((entry, i) => ({
    entry,
    node: snap.fNode[i] as NodeId,
    strength: snap.fStrength[i] / 255,
    posture: POSTURES[snap.fPosture[i]],
    status: STATUSES[snap.fStatus[i]],
    target: snap.fTarget[i] === NO_NODE ? null : (snap.fTarget[i] as NodeId),
  }));
  const k = NATION_FIELDS.length, v = snap.nations;
  state.nations = new Map(nationIds.map((id, i) => {
    const card = cards.get(id);
    const o = i * k;
    return [id, {
      id, name: card?.name ?? id, blocs: card?.blocs ?? [], doctrine: card?.doctrine ?? 'none', gdpUsdB: card?.gdpUsdB ?? 0,
      status: NATION_STATUSES[v[o]], controlledBy: v[o + 1] ? 'human' : 'ai',
      mobilization: v[o + 2], warSupport: v[o + 3], reserves: v[o + 4], population: v[o + 5], treasuryUsdB: v[o + 6], warheads: v[o + 7], deployed: v[o + 8],
    }];
  }));
  const warsKey = snap.wars.map((w) => w.join('|')).sort().join(',');
  if (warsKey !== state.warsKey) {
    state.wars = snap.wars;
    state.warsKey = warsKey;
  }
  state.air = snap.air;
  state.sea = snap.sea;
  state.infra = snap.infra;
  state.fallout = snap.fallout;
  state.contest = snap.contest;
  state.focusNation = snap.focusNation;
  state.focusFormation = snap.focusFormation;
  state.latestEvents = snap.events;
}
