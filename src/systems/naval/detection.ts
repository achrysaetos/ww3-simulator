import { atWar } from '../../core/engine';
import type { Formation, FormationId, NationId, NodeId } from '../../core/types';
import type { TickEnv } from './env';

interface Effort { surface: number; asw: number }

/** Search-effort scale against submarines; tuned so a lone destroyer holds an SSN under 5% of 6-hour ticks while a frigate/helo/MPA screen finds it about a third of the time (Cold War ASW exercise lore; estimate). */
const ASW_K = 0.5;
/** A submarine that fired last tick is a flaming datum: torpedo and missile launches are loud. */
const DATUM_EFFORT = 2.5;
/** A submarine at transit speed is louder. */
const TRANSIT_STEALTH_PENALTY = 0.1;
/** SSBN bastions (Sea of Okhotsk, Barents, Bohai): friendly sea control screens the boomers. */
const BASTION_SCREEN = 0.7;

/**
 * Roll which hostile nations hold a track on each naval formation this tick. Surface ships
 * are found by radar, aircraft and satellites from the node and its neighbours; submarines
 * only by ASW effort at their own node.
 */
export function detect(env: TickEnv): Map<FormationId, Set<NationId>> {
  const { world, ctx } = env;
  const { map } = ctx;
  const effort = new Map<number, Map<NationId, Effort>>();
  const add = (node: number, nation: NationId, s: number, a: number) => {
    let m = effort.get(node);
    if (!m) effort.set(node, (m = new Map()));
    const e = m.get(nation);
    if (e) { e.surface += s; e.asw += a; } else m.set(nation, { surface: s, asw: a });
  };
  for (const [node, fs] of env.byNode) for (const f of fs) { const c = env.comp(f); add(node, f.nation, c.surfaceSearch, c.aswSearch); }
  for (const [node, fs] of env.maritimeAir) for (const f of fs) { const c = env.comp(f); add(node, f.nation, c.surfaceSearch, c.aswSearch); }

  const sat = (Object.entries(world.slices.naval.oceanSurveillance) as [NationId, number][]).filter(([, v]) => v > 0);
  const surfaceNear = new Map<number, Map<NationId, number>>();
  const surfaceEffortAround = (node: NodeId) => {
    let total = surfaceNear.get(node);
    if (total) return total;
    total = new Map(sat);
    for (const [nation, e] of effort.get(node) ?? []) total.set(nation, (total.get(nation) ?? 0) + e.surface);
    for (let k = map.adjStart[node]; k < map.adjStart[node + 1]; k++)
      for (const [nation, e] of effort.get(map.adj[k]) ?? []) total.set(nation, (total.get(nation) ?? 0) + e.surface * 0.5);
    surfaceNear.set(node, total);
    return total;
  };
  const tracks = new Map<FormationId, Set<NationId>>();
  const rng = ctx.rng;
  for (const t of env.naval) {
    const c = env.comp(t);
    if (!c.hullCount) continue;
    const seen = new Set<NationId>();
    if (c.submerged) {
      const here = effort.get(t.node);
      if (!here) continue;
      const control = world.theater.seaControl[t.node];
      const bastion = c.hulls.every((h) => h.platform.class === 'ssbn') && control?.nation === t.nation ? 1 - BASTION_SCREEN * control.level : 1;
      const datum = world.slices.naval.lastFired[t.id] === world.tick - 1 ? DATUM_EFFORT : 0;
      const stealth = Math.max(0, c.stealth - (t.order.path?.length ? TRANSIT_STEALTH_PENALTY : 0));
      for (const [nation, e] of here) {
        if (!atWar(world, nation, t.nation)) continue;
        if (rng.chance(1 - Math.exp(-(e.asw * bastion + datum) * (1 - stealth) * ASW_K))) seen.add(nation);
      }
    } else {
      for (const [nation, e] of surfaceEffortAround(t.node)) {
        if (!atWar(world, nation, t.nation)) continue;
        if (rng.chance(1 - Math.exp(-e * (1 - c.stealth)))) seen.add(nation);
      }
    }
    if (seen.size) tracks.set(t.id, seen);
  }
  return tracks;
}

export function tracked(tracks: Map<FormationId, Set<NationId>>, by: NationId, f: Formation): boolean {
  return tracks.get(f.id)?.has(by) ?? false;
}
