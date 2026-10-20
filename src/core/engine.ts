import type { Catalog } from './catalog';
import type { GameMap } from './map';
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
const NOTABLE: ReadonlySet<SimEvent['type']> = new Set(['war_declared', 'peace', 'node_captured', 'formation_destroyed', 'nuclear_detonation', 'escalation', 'capitulation', 'message']);

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
    for (const s of this.systems) s.init?.(world, ctx);
    world.rngState = ctx.rng.state;
  }

  step(world: World): SimEvent[] {
    world.events = [];
    const ctx = this.context(world);
    const queued = world.pending;
    world.pending = [];
    for (const cmd of queued) {
      const owner = this.commandOwner.get(cmd.type);
      if (owner?.apply) owner.apply(world, cmd, ctx);
      else ctx.emit({ type: 'message', tick: world.tick, text: `no system handles command ${cmd.type}` });
    }
    for (const s of this.systems) s.step(world, ctx);
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

export function relationKey(a: NationId, b: NationId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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

export function atWar(world: World, a: NationId, b: NationId): boolean {
  return a !== b && relation(world, a, b).atWar;
}

export function enemiesOf(world: World, nation: NationId): NationId[] {
  const out: NationId[] = [];
  for (const [k, r] of Object.entries(world.relations)) {
    if (!r.atWar) continue;
    const [a, b] = k.split('|') as NationId[];
    if (a === nation) out.push(b);
    else if (b === nation) out.push(a);
  }
  return out;
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
