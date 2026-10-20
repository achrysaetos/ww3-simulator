/**
 * Worker <-> UI wire format. The worker owns the World; the UI holds a decoded
 * mirror (`ClientState`) built only from snapshots. Bulk per-node and
 * per-formation data travels as typed arrays so a tick costs a few kilobytes,
 * and the control map is sent only when some node changed hands.
 */
import { platformCount } from '../core/forces';
import type { GameMap } from '../core/map';
import type {
  Command, Echelon, Formation, FormationId, FormationKind, ItemId, Nation, NationId, NodeId, Posture, SimEvent, World,
} from '../core/types';
import type { Catalog } from '../core/catalog';
import { enemiesOf } from '../core/engine';

export const NO_NATION = 0xffff;
export const POSTURES: readonly Posture[] = ['reserve', 'defend', 'attack', 'move', 'strike', 'air_superiority', 'patrol', 'blockade', 'escort', 'embark'];
export const STATUSES: readonly Formation['status'][] = ['active', 'routed', 'destroyed', 'embarked'];
/** Above this many changed nodes a full control array is cheaper than pairs. */
const DIFF_LIMIT = 2_000;
const EVENT_LIMIT = 400;

// ---------------------------------------------------------------- messages

export type ToWorker =
  | { type: 'init'; scenario: string }
  | { type: 'step'; n: number }
  | { type: 'command'; command: Command }
  | { type: 'play_as'; nation: NationId }
  | { type: 'focus'; nation?: NationId; formation?: FormationId };

export type FromWorker =
  | { type: 'ready'; meta: SessionMeta; snapshot: Snapshot }
  | { type: 'snapshot'; snapshot: Snapshot; /** Set when this snapshot answers a step request. */ stepMs?: number }
  | { type: 'error'; message: string };

export interface SessionMeta {
  scenario: string;
  /** Index order used by every nation index in snapshots. */
  nationIds: NationId[];
  platforms: Record<string, { name: string; class: string; domain: string }>;
  munitions: Record<string, { name: string; kind: string; yieldKt?: number; rangeKm: number }>;
  dtHours: number;
}

export interface RosterEntry {
  id: FormationId;
  name: string;
  nation: NationId;
  kind: FormationKind;
  echelon: Echelon;
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

export interface NationDetail {
  id: NationId;
  stockpile: Record<ItemId, number>;
  bulk: Nation['bulk'];
  enemies: NationId[];
  /** Land cells currently held, and how many of them were held at start. */
  nodesHeld: number;
  nodesHome: number;
  formations: number;
  personnel: number;
}

export interface Snapshot {
  tick: number;
  date: string;
  control?: Uint16Array;
  /** Flat (node, nationIndex) pairs applied on top of the previous control array. */
  controlDiff?: Uint32Array;
  roster?: RosterEntry[];
  fNode: Int32Array;
  /** Operational platforms divided by the count first seen. */
  fStrength: Float32Array;
  fPosture: Uint8Array;
  fStatus: Uint8Array;
  /** Order target node, -1 for none. */
  fTarget: Int32Array;
  events: SimEvent[];
  droppedEvents: number;
  nations: NationSummary[];
  wars: [NationId, NationId][];
  /** Flat (node, nationIndex, level) triples. */
  air: Float32Array;
  sea: Float32Array;
  /** Flat (node, value) pairs for nodes with infrastructure < 1. */
  infra: Float32Array;
  fallout: Float32Array;
  focusNation?: NationDetail;
  focusFormation?: Formation;
}

// ---------------------------------------------------------------- encoder (worker side)

export class SnapshotEncoder {
  private lastControl: Uint16Array | null = null;
  private lastIds: FormationId[] = [];
  private readonly initial = new Map<FormationId, number>();
  private readonly nationIndex: Map<NationId, number>;
  private events: SimEvent[] = [];
  private dropped = 0;

  constructor(readonly nationIds: NationId[]) {
    this.nationIndex = new Map(nationIds.map((n, i) => [n, i]));
  }

  /** Buffer events from ticks that run between two snapshots. */
  collect(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (this.events.length < EVENT_LIMIT) this.events.push(e);
      else this.dropped++;
    }
  }

  encode(world: World, map: GameMap, focus: { nation?: NationId; formation?: FormationId } = {}): Snapshot {
    const control = this.controlArray(world);
    const snap: Snapshot = {
      tick: world.tick,
      date: dateOf(world),
      fNode: new Int32Array(0),
      fStrength: new Float32Array(0),
      fPosture: new Uint8Array(0),
      fStatus: new Uint8Array(0),
      fTarget: new Int32Array(0),
      events: this.events,
      droppedEvents: this.dropped,
      nations: Object.values(world.nations).map(summarize),
      wars: wars(world),
      air: this.sparseControl(world.theater.airControl),
      sea: this.sparseControl(world.theater.seaControl),
      infra: sparseBelow(world.theater.infrastructure, 1),
      fallout: sparseRecord(world.theater.fallout),
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
    if (fs.length !== this.lastIds.length || fs.some((f, i) => f.id !== this.lastIds[i])) {
      snap.roster = fs.map((f) => ({ id: f.id, name: f.name, nation: f.nation, kind: f.kind, echelon: f.echelon }));
      this.lastIds = fs.map((f) => f.id);
    }
    const n = fs.length;
    snap.fNode = new Int32Array(n);
    snap.fStrength = new Float32Array(n);
    snap.fPosture = new Uint8Array(n);
    snap.fStatus = new Uint8Array(n);
    snap.fTarget = new Int32Array(n);
    fs.forEach((f, i) => {
      const count = platformCount(f);
      if (!this.initial.has(f.id)) this.initial.set(f.id, Math.max(1, count));
      snap.fNode[i] = f.node;
      snap.fStrength[i] = count / this.initial.get(f.id)!;
      snap.fPosture[i] = POSTURES.indexOf(f.order.posture);
      snap.fStatus[i] = STATUSES.indexOf(f.status);
      snap.fTarget[i] = f.order.target ?? -1;
    });

    if (focus.nation && world.nations[focus.nation]) snap.focusNation = detail(world, map, focus.nation);
    if (focus.formation && world.formations[focus.formation]) snap.focusFormation = world.formations[focus.formation];
    return snap;
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
}

function dateOf(world: World): string {
  return new Date(Date.parse(world.startDate) + world.tick * world.dtHours * 3_600_000).toISOString();
}

function summarize(n: Nation): NationSummary {
  return {
    id: n.id, name: n.name, blocs: n.blocs, status: n.status, controlledBy: n.controlledBy,
    mobilization: n.mobilization, warSupport: n.warSupport, reserves: n.reserves, population: n.population,
    treasuryUsdB: n.treasuryUsdB, gdpUsdB: (n.stats.gdp ?? 0) / 1e9,
    warheads: n.nuclear.warheads, deployed: n.nuclear.deployed, doctrine: n.nuclear.doctrine,
  };
}

function wars(world: World): [NationId, NationId][] {
  const out: [NationId, NationId][] = [];
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) out.push(k.split('|') as [NationId, NationId]);
  return out;
}

function detail(world: World, map: GameMap, id: NationId): NationDetail {
  const n = world.nations[id];
  let held = 0, home = 0;
  for (let i = 0; i < map.landCount; i++) {
    if (world.control[i] === id) held++;
    if (map.owner[i] === id) home++;
  }
  let formations = 0, personnel = 0;
  for (const f of Object.values(world.formations))
    if (f.nation === id && f.status !== 'destroyed') { formations++; personnel += f.personnel; }
  return { id, stockpile: n.stockpile, bulk: n.bulk, enemies: enemiesOf(world, id), nodesHeld: held, nodesHome: home, formations, personnel };
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

export function sessionMeta(scenario: string, world: World, map: GameMap, catalog: Catalog): SessionMeta {
  const platforms: SessionMeta['platforms'] = {};
  for (const p of catalog.platforms.values()) platforms[p.id] = { name: p.name, class: p.class, domain: p.domain };
  const munitions: SessionMeta['munitions'] = {};
  for (const m of catalog.munitions.values()) munitions[m.id] = { name: m.name, kind: m.kind, yieldKt: m.yieldKt, rangeKm: m.rangeKm };
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
  focusNation?: NationDetail;
  focusFormation?: Formation;
  /** Events from the latest snapshot only. */
  latestEvents: SimEvent[];
}

export function emptyClientState(size: number): ClientState {
  return {
    tick: 0, date: '', control: new Uint16Array(size).fill(NO_NATION), controlVersion: 0,
    formations: [], rosterVersion: 0, nations: new Map(), wars: [], warsKey: '',
    air: new Float32Array(0), sea: new Float32Array(0), infra: new Float32Array(0), fallout: new Float32Array(0),
    latestEvents: [],
  };
}

export function applySnapshot(state: ClientState, snap: Snapshot): void {
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
  }
  state.formations = roster.map((entry, i) => ({
    entry,
    node: snap.fNode[i] as NodeId,
    strength: snap.fStrength[i],
    posture: POSTURES[snap.fPosture[i]],
    status: STATUSES[snap.fStatus[i]],
    target: snap.fTarget[i] < 0 ? null : (snap.fTarget[i] as NodeId),
  }));
  state.nations = new Map(snap.nations.map((n) => [n.id, n]));
  const warsKey = snap.wars.map((w) => w.join('|')).sort().join(',');
  if (warsKey !== state.warsKey) {
    state.wars = snap.wars;
    state.warsKey = warsKey;
  }
  state.air = snap.air;
  state.sea = snap.sea;
  state.infra = snap.infra;
  state.fallout = snap.fallout;
  state.focusNation = snap.focusNation;
  state.focusFormation = snap.focusFormation;
  state.latestEvents = snap.events;
}
