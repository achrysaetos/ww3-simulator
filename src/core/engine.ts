import type { Catalog } from './catalog';
import type { GameMap } from './map';
import { withParams } from './params';
import { Rng } from './rng';
import type { Command, NationId, Relation, SimEvent, World } from './types';

export interface SimContext {
  readonly map: GameMap;
  readonly catalog: Catalog;
  readonly rng: Rng;
  emit(event: SimEvent): void;
}

/**
 * One subsystem of the simulation. Systems run in registry order every tick and
 * mutate the World in place. A system that owns a Command type lists it in
 * `commands`; the engine routes queued commands of that type to `apply`.
 */
export interface System {
  readonly id: string;
  readonly commands?: readonly Command['type'][];
  /** Called once when a world is created; initialise this system's slice here. */
  init?(world: World, ctx: SimContext): void;
  apply?(world: World, command: Command, ctx: SimContext): void;
  step(world: World, ctx: SimContext): void;
}

const HISTORY_LIMIT = 5_000;
const NOTABLE: ReadonlySet<SimEvent['type']> = new Set(['war_declared', 'peace', 'node_captured', 'formation_destroyed', 'nuclear_detonation', 'nuclear_alert', 'escalation', 'capitulation', 'message']);

export class Engine {
  private readonly commandOwner = new Map<Command['type'], System>();

  constructor(
    readonly map: GameMap,
    readonly catalog: Catalog,
    readonly systems: readonly System[],
  ) {
    for (const s of systems)
      for (const c of s.commands ?? []) {
        const prior = this.commandOwner.get(c);
        if (prior) throw new Error(`command ${c} claimed by both ${prior.id} and ${s.id}`);
        this.commandOwner.set(c, s);
      }
  }

  context(world: World): SimContext {
    const rng = new Rng(world.rngState);
    return {
      map: this.map,
      catalog: this.catalog,
      rng,
      emit: (e) => {
        world.events.push(e);
        if (NOTABLE.has(e.type)) {
          world.history.push(e);
          if (world.history.length > HISTORY_LIMIT) world.history.splice(0, world.history.length - HISTORY_LIMIT);
        }
      },
    };
  }

  init(world: World): void {
    const ctx = this.context(world);
    withParams(world.params, () => {
      for (const s of this.systems) s.init?.(world, ctx);
    });
    world.rngState = ctx.rng.state;
  }

  step(world: World): SimEvent[] {
    return withParams(world.params, () => this.stepWith(world));
  }

  private stepWith(world: World): SimEvent[] {
    world.events = [];
    const ctx = this.context(world);
    const queued = world.pending;
    world.pending = [];
    const outer = stepping;
    stepping = { world };
    try {
      for (const cmd of queued) {
        const owner = this.commandOwner.get(cmd.type);
        if (owner?.apply) owner.apply(world, cmd, ctx);
        else ctx.emit({ type: 'message', tick: world.tick, text: `no system handles command ${cmd.type}` });
      }
      for (const s of this.systems) s.step(world, ctx);
    } finally {
      stepping = outer;
    }
    world.rngState = ctx.rng.state;
    world.tick++;
    return world.events;
  }

  run(world: World, ticks: number, onTick?: (world: World, events: SimEvent[]) => void): void {
    for (let i = 0; i < ticks; i++) {
      const events = this.step(world);
      onTick?.(world, events);
    }
  }
}

// ---------------------------------------------------------------- shared helpers

// Relations are read in the inner loops of movement, combat and detection; building the key string on each read cost ~4% of a ww3-2027 tick plus its garbage.
const relationKeys = new Map<NationId, Map<NationId, string>>();

export function relationKey(a: NationId, b: NationId): string {
  let row = relationKeys.get(a);
  if (!row) relationKeys.set(a, (row = new Map()));
  let key = row.get(b);
  if (key === undefined) row.set(b, (key = a < b ? `${a}|${b}` : `${b}|${a}`));
  return key;
}

const NEUTRAL: Relation = { opinion: 0, atWar: false, escalation: 'peace', sanctions: false };

export function relation(world: World, a: NationId, b: NationId): Relation {
  return world.relations[relationKey(a, b)] ?? NEUTRAL;
}

/** Mutable relation, created on first write. */
export function relationMut(world: World, a: NationId, b: NationId): Relation {
  const k = relationKey(a, b);
  return (world.relations[k] ??= { ...NEUTRAL });
}

/** Sets whether `a` and `b` are at war. The only writer of `Relation.atWar` in a running sim, so the tick's hostility index stays current. */
export function setAtWar(world: World, a: NationId, b: NationId, on: boolean): Relation {
  const r = relationMut(world, a, b);
  r.atWar = on;
  if (stepping?.world === world) stepping.hostility = undefined;
  return r;
}

/** Sets whether `a` and `b` sanction each other. The only writer of `Relation.sanctions` in a running sim. */
export function setSanctions(world: World, a: NationId, b: NationId, on: boolean): Relation {
  const r = relationMut(world, a, b);
  r.sanctions = on;
  if (stepping?.world === world) stepping.hostility = undefined;
  return r;
}

/** The pairs at war or under sanctions, in `world.relations` order, and each nation's enemies in that order. */
export interface Hostility {
  readonly pairs: readonly { readonly a: NationId; readonly b: NationId; readonly war: boolean }[];
  readonly foes: ReadonlyMap<NationId, ReadonlySet<NationId>>;
}

/**
 * The world being stepped, with its hostility index once something has read it.
 * Systems read war status thousands of times a tick and it changes a few times a
 * war, so the index is built from `world.relations` on first read in each step and
 * dropped by `setAtWar`/`setSanctions`. Outside a step every read goes to the
 * relations themselves, so tests and tools that edit them directly see their edits.
 */
let stepping: { world: World; hostility?: Hostility } | undefined;

export function hostility(world: World): Hostility {
  if (stepping?.world !== world) return indexHostility(world);
  return (stepping.hostility ??= indexHostility(world));
}

function indexHostility(world: World): Hostility {
  const pairs: { a: NationId; b: NationId; war: boolean }[] = [];
  const foes = new Map<NationId, Set<NationId>>();
  for (const k in world.relations) {
    const r = world.relations[k];
    if (!r.atWar && !r.sanctions) continue;
    const [a, b] = k.split('|') as NationId[];
    pairs.push({ a, b, war: r.atWar });
    if (!r.atWar) continue;
    (foes.get(a) ?? foes.set(a, new Set()).get(a)!).add(b);
    (foes.get(b) ?? foes.set(b, new Set()).get(b)!).add(a);
  }
  return { pairs, foes };
}

export function atWar(world: World, a: NationId, b: NationId): boolean {
  if (a === b) return false;
  if (stepping?.world === world) return (stepping.hostility ??= indexHostility(world)).foes.get(a)?.has(b) ?? false;
  return relation(world, a, b).atWar;
}

export function enemiesOf(world: World, nation: NationId): NationId[] {
  return [...(hostility(world).foes.get(nation) ?? [])];
}

export function newId<T extends string>(world: World, prefix: string): T {
  return `${prefix}${world.nextId++}` as T;
}

export function hoursElapsed(world: World): number {
  return world.tick * world.dtHours;
}

export function currentDate(world: World): Date {
  return new Date(Date.parse(world.startDate) + hoursElapsed(world) * 3_600_000);
}
