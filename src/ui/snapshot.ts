/**
 * Worker <-> UI wire format. The worker owns the World; the UI holds a decoded
 * mirror (`ClientState`) built only from snapshots. Facts that never change
 * during a session (names, blocs, the catalog) travel once in `SessionMeta`.
 * Per-tick data is typed arrays: nodes fit in 16 bits, strength in 8, and the
 * control map is sent only when some node changed hands. With the full world
 * (~2,500 formations, 193 nations) a tick costs about 25 KB plus events.
 */
import { currentDate, enemiesOf } from '../core/engine';
import { platformCount } from '../core/forces';
import type { GameMap } from '../core/map';
import type { Catalog } from '../core/catalog';
import { greenfieldCeilingPerMonth } from '../systems/economy';
import { NUCLEAR_ALERT } from '../data/nations';
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
import { members, sideOf } from '../systems/diplomacy/wars';
import { deliveryReachKm, isLive } from '../systems/strategic/nuclear';
import { hostedBy } from '../systems/civil/state';
import type { ElectionResult, OpinionDrivers } from '../systems/politics/state';
import { ELECTIONS } from '../data/politics/elections';
import { conditionsAt, type Conditions, packWeather } from '../systems/weather/effects';
import type { IntelSource } from '../systems/intel';
import { believedWorld, viewOf, type View } from '../systems/intel/view';
import { OutputsRecorder } from '../outputs';
import { outputsView, type OutputsView } from './outputs/view';
import type { OperationForecastInput, OperationPlan } from '../forecast/operation';
import type { OptionsResult } from './orders/options';
import type {
  Command, CommandDomain, Echelon, Formation, FormationId, FormationKind, ItemId, MunitionId, MunitionKind, Nation, NationId, NodeId, Operation, PlatformId, Posture, SimEvent, World,
} from '../core/types';

export const NO_NATION = 0xffff;
export const NO_NODE = 0xffff;
/** fPosture of a formation known only from intelligence: enemy orders are never sent. */
export const NO_POSTURE = 0xff;
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
  /** role: the command role picked on the start screen; its delegation is queued before the first tick. */
  | { type: 'start'; scenario: string; nation: NationId; seed: number; role?: string }
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
  | { type: 'focus'; nation?: NationId; formation?: FormationId }
  /** Which orders the selection (or, with none, the staff's nearest units) can be given at `node`; answered with 'options'. */
  | { type: 'options'; seq: number; formations: FormationId[]; node: NodeId }
  /** Build the staff forecast's input for a battle plan, from the player's picture of the war; answered with 'forecast_input'. */
  | { type: 'forecast'; seq: number; plan: OperationPlan; days: number };

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
  | { type: 'options'; seq: number; tick: number; result: OptionsResult }
  /** The input to run the forecast on, or why the plan cannot be forecast. */
  | { type: 'forecast_input'; seq: number; input: OperationForecastInput | null; reason?: string }
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
  /** Most a new line can reach per month, for each item the nation can build but has no line for. */
  greenfield: Record<string, number>;
}

/** Civilians and domestic politics. */
export interface HomeFrontView {
  /** Its people displaced inside the country and sheltering abroad. */
  idps: number;
  refugees: number;
  /** Refugees from other nations it shelters. */
  sheltering: number;
  civiliansKilled: number;
  civiliansInjured: number;
  /** Its people living under enemy occupation. */
  underOccupation: number;
  /** Partisan sabotage acts against it as an occupier. */
  sabotage: number;
  /** Shift domestic politics adds to war support, and its parts. */
  supportShift: number;
  drivers: OpinionDrivers | null;
  mobilizationTolerance: number | null;
  stability: number | null;
  protesting: boolean;
  /** Arms aid it gives: whether a package is funded, and the backing for it. */
  aid: { support: number; continues: boolean } | null;
  nextElection: { date: string; kind: string } | null;
  lastElection: ElectionResult | null;
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
  /** Nations whose troops it lets cross its land, nations whose land its troops may cross, and belligerents its air defence covers. */
  access: NationId[];
  accessFrom: NationId[];
  aid: NationId[];
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
  homeFront: HomeFrontView;
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
    alert: NuclearAlertView;
  };
}

/** Stored warheads are not on launchers until the leadership orders an alert; mating then follows the state's timeline. */
export interface NuclearAlertView {
  /** The nation has an alert timeline and warheads still in storage, and has not ordered one. */
  canOrder: boolean;
  /** Warheads in storage, not mated to launchers. */
  stored: number;
  /** Warheads mated to launchers (the ceiling on release). */
  mated: number;
  /** The standing alert: when ordered, how many of its stored warheads are mated so far. */
  ordered: { tick: number; of: number; mated: number; reason: string } | null;
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
  /** Today's weather where it stands; null in a world without weather. */
  weather: Conditions | null;
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

/** Typed arrays sent per tick; a tick where few entries moved sends only those (`PackedDiff`). */
export const PACKED = ['fNode', 'fStrength', 'fPosture', 'fStatus', 'fTarget', 'cConfidence', 'cAgeHours', 'cErrorKm', 'nations'] as const;
export type Packed = (typeof PACKED)[number];
type PackedArray = Uint8Array | Uint16Array | Float32Array;
/** Entries that changed: their indices, and their new values in the field's own array type. */
export interface PackedDiff { i: Uint32Array; v: PackedArray }

export interface Snapshot {
  tick: number;
  date: string;
  control?: Uint16Array;
  /** Flat (node, nationIndex) pairs applied on top of the previous control array. */
  controlDiff?: Uint32Array;
  roster?: RosterEntry[];
  /** Formations new since the last snapshot, appended to the roster (formations are never removed, only added). */
  rosterAdd?: RosterEntry[];
  /**
   * The per-formation and per-nation arrays (`Packed`). Each comes whole, or as `diff` against the
   * one the client holds when the roster kept its order and only a few entries changed.
   */
  fNode?: Uint16Array;
  /** Operational platforms divided by the count first seen, scaled to 0..255. */
  fStrength?: Uint8Array;
  fPosture?: Uint8Array;
  fStatus?: Uint8Array;
  /** Order target node, NO_NODE for none. */
  fTarget?: Uint16Array;
  /**
   * Intelligence on each contact, in roster order of the formations whose fPosture is NO_POSTURE
   * (the viewer's friends carry none, so a spectator's snapshot sends nothing): confidence 0..1 as
   * 0..255, hours since the last fix, and the radius in km within which the formation probably is.
   */
  cConfidence?: Uint8Array;
  cAgeHours?: Uint16Array;
  cErrorKm?: Uint16Array;
  /** NATION_FIELDS per nation, in meta.nationIds order. */
  nations?: Float32Array;
  diff?: Partial<Record<Packed, PackedDiff>>;
  events: SimEvent[];
  droppedEvents: number;
  wars: [NationId, NationId][];
  /** Flat (node, nationIndex, level) triples. */
  air: Float32Array;
  sea: Float32Array;
  /** Flat (node, value) pairs for nodes with infrastructure < 1. */
  infra: Float32Array;
  fallout: Float32Array;
  /** Flat (node, nationIndex, share) triples: cells an enemy is pushing into, and how far across it has got, 0..1. */
  contest: Float32Array;
  /** Today's weather per region (weather/effects.ts packWeather), sent when the day changes. */
  weather?: Uint8Array;
  focusNation?: NationDetail;
  /** The focused formation when it is the viewer's or a friend's; a contact comes as focusContact. */
  focusFormation?: FormationDetail;
  focusContact?: ContactDetail;
  /** War cost and production race, sent once a day of game time: it moves slowly and costs a few KB. */
  outputs?: OutputsView;
  /** The viewer's operations (ops/state.ts), ended ones while the engine keeps them; sent when any changed. Never another nation's. */
  ops?: Operation[];
}

/** What the viewer's intelligence holds on a foreign formation: never its orders, supply or magazines. */
export interface ContactDetail {
  id: FormationId;
  name: string;
  nation: NationId;
  kind: FormationKind;
  echelon: Echelon;
  /** Cell of the last fix. */
  node: NodeId;
  /** Estimated platforms at the fix. */
  strength: number;
  ageHours: number;
  confidence: number;
  errorKm: number;
  source: IntelSource;
}

// ---------------------------------------------------------------- encoder (worker side)

export class SnapshotEncoder {
  private lastControl: Uint16Array | null = null;
  private lastIds: FormationId[] = [];
  private readonly initial = new Map<FormationId, number>();
  private readonly nationIndex: Map<NationId, number>;
  private events: SimEvent[] = [];
  private dropped = 0;
  private weatherDay?: number;
  private readonly outputs: OutputsRecorder;
  private outputsTick = -Infinity;
  /** First war_declared that put each nation into each war, keyed `nation|enemy`. */
  private readonly entries = new Map<string, WarEntry>();
  private readonly lastPacked: Partial<Record<Packed, PackedArray>> = {};
  private opsKey = '[]';

  constructor(readonly nationIds: NationId[], private readonly catalog: Catalog, mapSize: number) {
    if (mapSize >= NO_NODE) throw new Error(`map has ${mapSize} nodes; the wire format packs nodes in 16 bits`);
    this.nationIndex = new Map(nationIds.map((n, i) => [n, i]));
    this.outputs = new OutputsRecorder(catalog);
  }

  /** Buffer events from ticks that run between two snapshots. The AI's answers to its own commands never leave the worker. */
  collect(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'command_result' && !e.byPlayer) continue;
      if (e.type === 'war_declared') {
        const entry = { reason: e.reason, tick: e.tick };
        if (!this.entries.has(`${e.by}|${e.on}`)) this.entries.set(`${e.by}|${e.on}`, { nation: e.by, ...entry });
        if (!this.entries.has(`${e.on}|${e.by}`)) this.entries.set(`${e.on}|${e.by}`, { nation: e.on, ...entry, reason: `attacked by ${e.by}` });
      }
      if (this.events.length < EVENT_LIMIT) this.events.push(e);
      else this.dropped++;
    }
  }

  /**
   * The snapshot `viewer` may see: its friends' formations in full, foreign ones only as its
   * intelligence holds them (intel/view.ts). The viewer defaults to the human nation; a world
   * with none (a spectator, a test) sees the truth.
   */
  encode(world: World, map: GameMap, focus: { nation?: NationId; formation?: FormationId } = {}, viewer = humanNation(world)): Snapshot {
    const view = viewer ? viewOf(world, map, viewer) : undefined;
    const control = this.controlArray(world);
    const snap: Snapshot = {
      tick: world.tick,
      date: dateOf(world),
      events: this.events,
      droppedEvents: this.dropped,
      wars: wars(world),
      air: this.sparseControl(world.theater.airControl),
      sea: this.sparseControl(world.theater.seaControl),
      infra: sparseBelow(world.theater.infrastructure, 1),
      fallout: sparseRecord(world.theater.fallout),
      contest: this.contested(world, map),
    };
    this.events = [];
    this.dropped = 0;
    if (world.slices.weather && world.slices.weather.day !== this.weatherDay) {
      this.weatherDay = world.slices.weather.day;
      snap.weather = packWeather(world);
    }

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

    const contactOf = (f: Formation) => (view && !view.friends.has(f.nation) ? view.contacts.get(f.id) : undefined);
    const shown = (f: Formation) => {
      if (!view || view.friends.has(f.nation)) return true;
      const c = contactOf(f);
      return !!c && !c.embarkedOn;
    };
    const fs = Object.values(world.formations).filter(shown);
    for (const f of fs) if (!this.initial.has(f.id)) this.initial.set(f.id, Math.max(1, contactOf(f)?.strength ?? platformCount(f)));
    const entry = (f: Formation): RosterEntry => ({ id: f.id, name: f.name, nation: f.nation, kind: f.kind, echelon: f.echelon, platforms: this.initial.get(f.id)! });
    const prevIds = this.lastIds;
    const kept = fs.length >= prevIds.length && prevIds.every((id, i) => fs[i].id === id);
    if (!kept) snap.roster = fs.map(entry);
    else if (fs.length > prevIds.length) snap.rosterAdd = fs.slice(prevIds.length).map(entry);
    if (!kept || fs.length > prevIds.length) this.lastIds = fs.map((f) => f.id);
    const n = fs.length;
    const contacts = view ? fs.filter((f) => !view.friends.has(f.nation)).length : 0;
    const p = {
      fNode: new Uint16Array(n), fStrength: new Uint8Array(n), fPosture: new Uint8Array(n), fStatus: new Uint8Array(n), fTarget: new Uint16Array(n),
      cConfidence: new Uint8Array(contacts), cAgeHours: new Uint16Array(contacts), cErrorKm: new Uint16Array(contacts),
      nations: this.nationNumbers(world),
    } satisfies Record<Packed, PackedArray>;
    for (let i = 0, j = 0; i < n; i++) {
      const f = fs[i];
      const c = contactOf(f);
      if (c) {
        p.fNode[i] = c.node;
        p.fStrength[i] = Math.round(Math.min(1, c.strength / this.initial.get(f.id)!) * 255);
        p.fPosture[i] = NO_POSTURE;
        p.fStatus[i] = STATUSES.indexOf('active');
        p.fTarget[i] = NO_NODE;
        p.cConfidence[j] = Math.round(c.confidence * 255);
        p.cAgeHours[j] = Math.min(0xffff, Math.round(c.ageHours));
        p.cErrorKm[j++] = Math.min(0xffff, Math.round(c.errorKm));
        continue;
      }
      p.fNode[i] = f.node;
      p.fStrength[i] = Math.round(Math.min(1, platformCount(f) / this.initial.get(f.id)!) * 255);
      p.fPosture[i] = POSTURES.indexOf(f.order.posture);
      p.fStatus[i] = STATUSES.indexOf(f.status);
      p.fTarget[i] = f.order.target ?? NO_NODE;
    }
    for (const k of PACKED) this.pack(snap, k, p[k]);

    this.outputs.observe(world);
    if (viewer && (world.tick - this.outputsTick) * world.dtHours >= 24) {
      this.outputsTick = world.tick;
      snap.outputs = outputsView(world, this.outputs.outputs(world, map), viewer);
    }

    if (viewer) {
      const ops = Object.values(world.slices.ops?.byId ?? {}).filter((o) => o.nation === viewer);
      const key = JSON.stringify(ops);
      if (key !== this.opsKey) {
        this.opsKey = key;
        snap.ops = structuredClone(ops);
      }
    }

    if (focus.nation && world.nations[focus.nation]) snap.focusNation = this.nationDetail(world, map, focus.nation, view);
    const focused = focus.formation ? world.formations[focus.formation] : undefined;
    if (focused) {
      const c = contactOf(focused);
      if (c) snap.focusContact = { id: c.id, name: focused.name, nation: c.nation, kind: c.kind, echelon: focused.echelon, node: c.node, strength: c.strength, ageHours: c.ageHours, confidence: c.confidence, errorKm: c.errorKm, source: c.source };
      else if (!view || view.friends.has(focused.nation)) snap.focusFormation = formationDetail(world, map, this.catalog, focused);
    }
    return snap;
  }

  /** Puts `next` on the snapshot whole, or as the entries that changed since the last one sent when that is smaller. */
  private pack(snap: Snapshot, k: Packed, next: PackedArray): void {
    const prev = this.lastPacked[k];
    this.lastPacked[k] = next;
    if (prev && prev.length === next.length) {
      const at: number[] = [];
      const limit = (next.length * next.BYTES_PER_ELEMENT) / (4 + next.BYTES_PER_ELEMENT);
      for (let i = 0; i < next.length && at.length < limit; i++) if (prev[i] !== next[i]) at.push(i);
      if (at.length < limit) {
        const v = new (next.constructor as new (n: number) => PackedArray)(at.length);
        at.forEach((i, j) => (v[j] = next[i]));
        (snap.diff ??= {})[k] = { i: Uint32Array.from(at), v };
        return;
      }
    }
    snap[k] = next as never;
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

  /** A foreign nation's forces are counted as the viewer believes them (believedWorld): contacts only, magazines by doctrine. */
  private nationDetail(world: World, map: GameMap, id: NationId, view: View | undefined): NationDetail {
    const n = world.nations[id];
    const { catalog } = this;
    const forces = view && !view.friends.has(id) ? believedWorld(world, map, view.nation, catalog).formations : world.formations;
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
    for (const f of Object.values(forces)) {
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
      access: diplomacy?.access[id] ?? [],
      accessFrom: Object.entries(diplomacy?.access ?? {}).flatMap(([host, guests]) => (guests.includes(id) ? [host as NationId] : [])),
      aid: diplomacy?.aid[id] ?? [],
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
            greenfield: this.greenfield(n, eco.lines),
          }
        : null,
      homeFront: homeFront(world, id),
      munitions: [...groups.values()].filter((g) => g.warehoused || g.loaded || g.perMonth),
      wars: this.warViews(world, id),
      nuclear: {
        posture: strategic?.posture[id] ?? null,
        launchers,
        loadedWarheads,
        bmd: bmdOf(strategic?.interceptors ?? {}, id),
        satellites: space ? Object.values(space).reduce((a, s) => a + s.alive, 0) : 0,
        weapons: [...weapons.values()],
        alert: nuclearAlert(n, id, strategic?.alerts[id]),
      },
    };
  }

  private greenfield(n: Nation, lines: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, e] of [...this.catalog.platforms, ...this.catalog.munitions] as [ItemId, { producers: NationId[]; unitCostUsdM: number }][]) {
      if (lines[id] || !e.producers.includes(n.id)) continue;
      const ceiling = greenfieldCeilingPerMonth(n, e.unitCostUsdM, id);
      if (ceiling > 0) out[id] = ceiling;
    }
    return out;
  }

  private warViews(world: World, id: NationId): WarView[] {
    const d = world.slices.diplomacy;
    if (!d) return [];
    return d.wars
      .filter((w) => sideOf(w, id) !== -1)
      .map((w) => {
        const sides = [members(w.sides[0]), members(w.sides[1])];
        const aggressor = sides[0][0];
        const entry = (m: NationId, side: 0 | 1): WarEntry => {
          for (const e of sides[1 - side]) {
            const found = this.entries.get(`${m}|${e}`);
            if (found) return found;
          }
          return { nation: m, reason: m === aggressor ? 'aggressor' : 'scenario start', tick: w.since };
        };
        return {
          id: w.id,
          aggressor,
          startTick: w.since,
          sides: [sides[0].map((m) => entry(m, 0)), sides[1].map((m) => entry(m, 1))],
          pending: d.joins.filter((j) => j.war === w.id).map((j) => ({ nation: j.nation, treaty: j.treaty, side: j.side, dueTick: j.dueTick })),
        };
      });
  }
}

function nuclearAlert(n: Nation, id: NationId, alert: { orderedTick: number; stored: number; mated: number; reason: string } | undefined): NuclearAlertView {
  const stored = Math.max(0, n.nuclear.warheads - n.nuclear.deployed);
  return {
    canOrder: !alert && stored > 0 && id in NUCLEAR_ALERT,
    stored,
    mated: n.nuclear.deployed,
    ordered: alert ? { tick: alert.orderedTick, of: alert.stored, mated: alert.mated, reason: alert.reason } : null,
  };
}

const TOP_LINES = 12;

function homeFront(world: World, id: NationId): HomeFrontView {
  const c = world.slices.civil?.nations[id];
  const p = world.slices.politics?.nations[id];
  const now = currentDate(world).getTime();
  const next = ELECTIONS.filter((e) => e.nation === id && Date.parse(e.date) >= now).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    idps: c?.idps ?? 0,
    refugees: c?.refugees ?? 0,
    sheltering: world.slices.civil ? (hostedBy(world.slices.civil).get(id) ?? 0) : 0,
    civiliansKilled: c?.killed ?? 0,
    civiliansInjured: c?.injured ?? 0,
    underOccupation: c?.underOccupation ?? 0,
    sabotage: c?.sabotage ?? 0,
    supportShift: p?.supportShift ?? 0,
    drivers: p ? { ...p.drivers } : null,
    mobilizationTolerance: p?.mobilizationTolerance ?? null,
    stability: p?.stability ?? null,
    protesting: p?.protesting ?? false,
    aid: p?.aid ? { support: p.aid.support, continues: p.aid.continues } : null,
    nextElection: next ? { date: next.date, kind: next.kind } : null,
    lastElection: p?.elections.at(-1) ?? null,
  };
}

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
    weather: conditionsAt(world, map, f.node) ?? null,
  };
}

function humanNation(world: World): NationId | undefined {
  for (const n of Object.values(world.nations)) if (n.controlledBy === 'human') return n.id;
  return undefined;
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
  /** For a contact, the cell of the last fix. */
  node: NodeId;
  strength: number;
  /** Null for a contact: enemy orders are never seen. */
  posture: Posture | null;
  status: Formation['status'];
  target: NodeId | null;
  /** Null for the viewer's own and friends' formations; for a foreign one, what intelligence holds (stale below intel/view CURRENT_CONFIDENCE). */
  contact: { ageHours: number; confidence: number; errorKm: number } | null;
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
  weather: Uint8Array;
  focusNation?: NationDetail;
  focusFormation?: FormationDetail;
  focusContact?: ContactDetail;
  /** The latest War Cost reading; it arrives once a day. */
  outputs?: OutputsView;
  /** Events from the latest snapshot only. */
  latestEvents: SimEvent[];
  /** The wire's arrays as last decoded, which the next snapshot's diffs apply to. */
  packed: Record<Packed, PackedArray>;
  /** The player's operations, as the latest snapshot that changed them sent them. */
  ops: Operation[];
}

export function emptyClientState(size: number): ClientState {
  return {
    tick: 0, date: '', control: new Uint16Array(size).fill(NO_NATION), controlVersion: 0,
    formations: [], rosterVersion: 0, nations: new Map(), wars: [], warsKey: '',
    air: new Float32Array(0), sea: new Float32Array(0), infra: new Float32Array(0), fallout: new Float32Array(0), contest: new Float32Array(0), weather: new Uint8Array(0),
    latestEvents: [],
    ops: [],
    packed: {
      fNode: new Uint16Array(0), fStrength: new Uint8Array(0), fPosture: new Uint8Array(0), fStatus: new Uint8Array(0), fTarget: new Uint16Array(0),
      cConfidence: new Uint8Array(0), cAgeHours: new Uint16Array(0), cErrorKm: new Uint16Array(0), nations: new Float32Array(0),
    },
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
  const w = state.packed;
  for (const key of PACKED) {
    const whole = snap[key];
    const d = snap.diff?.[key];
    if (whole) w[key] = whole;
    else if (d) for (let x = 0; x < d.i.length; x++) w[key][d.i[x]] = d.v[x];
  }
  let j = 0;
  state.formations = roster.map((entry, i) => {
    const contact = w.fPosture[i] === NO_POSTURE;
    return {
      entry,
      node: w.fNode[i] as NodeId,
      strength: w.fStrength[i] / 255,
      posture: contact ? null : POSTURES[w.fPosture[i]],
      status: STATUSES[w.fStatus[i]],
      target: w.fTarget[i] === NO_NODE ? null : (w.fTarget[i] as NodeId),
      contact: contact ? { confidence: w.cConfidence[j] / 255, ageHours: w.cAgeHours[j], errorKm: w.cErrorKm[j++] } : null,
    };
  });
  const k = NATION_FIELDS.length, v = w.nations;
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
  if (snap.weather) state.weather = snap.weather;
  state.focusNation = snap.focusNation;
  state.focusFormation = snap.focusFormation;
  state.focusContact = snap.focusContact;
  if (snap.outputs) state.outputs = snap.outputs;
  if (snap.ops) state.ops = snap.ops;
  state.latestEvents = snap.events;
}
