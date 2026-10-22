/**
 * The war below the shooting. One System that models cyber operations (access built over months,
 * then grid and telecom payloads), covert state sabotage, cuts to undersea cables with repair queues
 * measured in months, shipping deterred by fear in dangerous sea zones, and armed resistance in
 * occupied territory. Each hooks the systems that already exist:
 *
 * - cyber grid payloads and cut power/gas cables multiply theater.infrastructure down once, like a
 *   strike, so the economy (industrial integrity) and C2 (fibre comms) feel them until repair;
 * - cyber telecom payloads and cut data cables cut national connectivity the economy reads through
 *   nonKineticGdpDrag;
 * - maritime risk deters a share of seaborne trade the economy reads through the same drag;
 * - occupation resistance erodes garrison readiness and drains the occupier's treasury.
 *
 * Commands (cyber_op, sabotage, cut_cable) are the player's handle; for AI nations the system runs a
 * modest standing campaign against their enemies. Sole writer of slices.nonKinetic.
 */
import { atWar, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Command, CommandResult, NationId, World } from '../../core/types';
import { cyberCapability } from '../strategic';
import { draw, keyOf } from '../civil/hash';
import { accessOf, buildAccess, firePayload, recoverOutage, stepAccess } from './cyber';
import { cutCable, stepRepairs } from './cables';
import { stepMaritimeRisk } from './maritime';
import { stepOccupation } from './occupation';
import { emptyState, pairKey, type CyberSector, type NonKineticState } from './state';

export type { NonKineticState } from './state';
export { CABLES } from './cables';
export { dataConnectivityLost, telecomOutage, maritimeDeterred, digitalLost, nonKineticState } from './reads';

/** Per-tick chance a running sabotage campaign lands an act, scaled by the attacker's cyber/special-ops reach. */
const SABOTAGE_LAND = 0.15;
const SABOTAGE_CUT = 0.15;
const SABOTAGE_MIN_RAIL_KM = 20;
/** Share of landed acts the target attributes to the attacker. */
const ATTRIBUTION = 0.3;

function ok(world: World, cmd: Command, reason: string): CommandResult {
  return { type: 'command_result', tick: world.tick, nation: cmd.nation, command: cmd.type, byPlayer: true, ok: true, code: 'accepted', reason };
}
function refused(world: World, cmd: Command, reason: string): CommandResult {
  return { type: 'command_result', tick: world.tick, nation: cmd.nation, command: cmd.type, byPlayer: true, ok: false, code: 'no_access', reason };
}

export const nonKinetic: System = {
  id: 'nonkinetic',
  commands: ['cyber_op', 'sabotage', 'cut_cable'],
  init(world) {
    world.slices.nonKinetic = emptyState();
  },
  apply(world, cmd, ctx) {
    const s = world.slices.nonKinetic;
    if (cmd.type === 'cyber_op') {
      const sector = cmd.sector as CyberSector;
      if (cmd.action === 'build') {
        buildAccess(s, cmd.nation, cmd.target, sector);
        ctx.emit(ok(world, cmd, `building ${sector} access into ${cmd.target}`));
      } else if (cmd.action === 'stop') {
        const a = accessOf(s, cmd.nation, cmd.target, sector);
        if (a) a.building = false;
        ctx.emit(ok(world, cmd, `${sector} intrusion into ${cmd.target} stood down`));
      } else {
        const hit = firePayload(world, ctx.map, s, cmd.nation, cmd.target, sector);
        if (hit > 0) ctx.emit(ok(world, cmd, `${sector} payload fired on ${cmd.target}, ${Math.round(hit * 100)}% down`));
        else ctx.emit(refused(world, cmd, `no ${sector} access into ${cmd.target} to fire`));
      }
    } else if (cmd.type === 'sabotage') {
      const key = pairKey(cmd.nation, cmd.target);
      if (cmd.on) {
        s.sabotage[key] ??= { by: cmd.nation, on: cmd.target, startedTick: world.tick, acts: 0, attributed: 0 };
        ctx.emit(ok(world, cmd, `sabotage campaign against ${cmd.target} begun`));
      } else {
        delete s.sabotage[key];
        ctx.emit(ok(world, cmd, `sabotage campaign against ${cmd.target} ended`));
      }
    } else if (cmd.type === 'cut_cable') {
      const cut = cutCable(world, ctx.map, s, cmd.nation, cmd.cable);
      ctx.emit(cut ? ok(world, cmd, `${cmd.cable} severed`) : refused(world, cmd, `${cmd.cable} is unknown or already cut`));
    }
  },
  step(world, ctx) {
    const s = world.slices.nonKinetic;
    stepAccess(world, s);
    recoverOutage(world, s);
    stepSabotage(world, ctx, s);
    stepRepairs(world, s);
    stepMaritimeRisk(world, ctx, s);
    stepOccupation(world, ctx, s);
  },
};

/**
 * Covert sabotage of the target's rear: a landed act cuts rail/infrastructure at one of its rail
 * cells. Hash draws, so sabotage never perturbs the RNG the other systems draw from.
 */
function stepSabotage(world: World, ctx: SimContext, s: NonKineticState): void {
  for (const key of Object.keys(s.sabotage)) {
    const c = s.sabotage[key];
    if (!atWar(world, c.by, c.on) || world.nations[c.on]?.status === 'capitulated') continue;
    const k = keyOf(key);
    if (draw(world.seed, world.tick, k) >= SABOTAGE_LAND * cyberCapability(c.by)) continue;
    const held = railCells(ctx.map, c.on).filter((n) => world.control[n] === c.on);
    if (!held.length) continue;
    const cell = held[Math.min(held.length - 1, Math.floor(draw(world.seed, world.tick, k + 1) * held.length))];
    world.theater.infrastructure[cell] *= 1 - SABOTAGE_CUT;
    c.acts++;
    if (draw(world.seed, world.tick, k + 2) < ATTRIBUTION) c.attributed++;
  }
}

const railCache = new WeakMap<GameMap, Map<NationId, number[]>>();
function railCells(map: GameMap, nation: NationId): number[] {
  let byNation = railCache.get(map);
  if (!byNation) railCache.set(map, (byNation = new Map()));
  let cells = byNation.get(nation);
  if (!cells) {
    cells = [];
    for (let n = 0; n < map.landCount; n++) if (map.owner[n] === nation && map.railKm[n] >= SABOTAGE_MIN_RAIL_KM) cells.push(n);
    byNation.set(nation, cells);
  }
  return cells;
}
