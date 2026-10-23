import type { Engine } from '../src/core/engine';
import type { GameMap } from '../src/core/map';
import { withParams } from '../src/core/params';
import type { Command, CommandResult, FormationId, NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';
import { beliefOf, buildKit, type DragKit } from '../src/ui/drag/kit';
import { NO_NATION } from '../src/ui/snapshot';

export const RUS = 'RUS' as NationId, UKR = 'UKR' as NationId;
export type Session = ReturnType<typeof createSession>;

/** ukraine-2026 played as Russia, eight ticks in: the war is on and the picture has filled in. */
export function russia(ticks = 8): Session {
  const s = createSession('ukraine-2026', 1);
  s.world.nations[RUS].controlledBy = 'human';
  s.engine.run(s.world, ticks);
  return s;
}

/** The snapshot's control array: each node's holder as an index into map.nationIds. */
export function controlOf(world: World, map: GameMap): Uint16Array {
  const index = new Map(map.nationIds.map((n, i) => [n, i]));
  return Uint16Array.from(world.control, (n) => index.get(n) ?? NO_NATION);
}

export function kitOf(s: Session, ids: FormationId[], world = s.world): DragKit {
  const kit = buildKit(beliefOf(world, s.map, RUS, s.engine.catalog), s.engine, RUS, ids);
  if (!kit) throw new Error(`no kit for ${ids.join(', ')}`);
  return kit;
}

export const named = (s: Session, name: string): FormationId => {
  const f = Object.values(s.world.formations).find((x) => x.nation === RUS && x.name.startsWith(name));
  if (!f) throw new Error(`no ${name}`);
  return f.id;
};

/** The four-formation Donbas force of the operation-forecast perf test. */
export const donbas = (s: Session): FormationId[] =>
  ['3rd Motor Rifle Division', '2nd Guards Motor Rifle Brigade', '4th Guards Motor Rifle Brigade', '20th Guards Motor Rifle Division'].map((n) => named(s, n));

/** Slices an order handler may write: copied, so the live world is never touched (the dry run src/ui/orders/options.ts used). */
const WRITTEN = ['command', 'diplomacy', 'ops', 'land', 'naval', 'air'] as const;

/** The engine's answer to `cmd` applied at once to a copy of the true world, as it would be on arrival (c2 left out). */
export function engineAnswer(world: World, engine: Engine, cmd: Command): CommandResult | undefined {
  const owner = engine.systems.find((x) => x.commands?.includes(cmd.type))!;
  const formations = { ...world.formations };
  if (cmd.type === 'order') formations[cmd.formation] = structuredClone(formations[cmd.formation]);
  const slices = { ...world.slices } as Record<string, unknown>;
  for (const k of WRITTEN) if (slices[k]) slices[k] = structuredClone(slices[k]);
  delete slices.c2;
  const box: World = { ...world, formations, slices: slices as unknown as World['slices'], pending: [], events: [], history: [], theater: structuredClone(world.theater) };
  withParams(world.params, () => owner.apply!(box, cmd, engine.context(box)));
  return box.events.find((e): e is CommandResult => e.type === 'command_result');
}
