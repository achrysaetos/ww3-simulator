/**
 * Counters glide between ticks instead of jumping: a formation that moved to an adjacent node in
 * the latest tick is drawn along that edge as the clock runs the tick's hours. Anything else (a
 * new formation, a jump of more than one node, a contact re-fixed far away) snaps.
 */
import type { GameMap } from '../core/map';
import type { FormationId, NodeId } from '../core/types';
import type { FormationView } from './snapshot';
import { weight, type Stack } from './stacks';

export function nodesOf(formations: readonly FormationView[]): Map<FormationId, NodeId> {
  return new Map(formations.map((f) => [f.entry.id, f.node]));
}

/** Where each formation that stepped to an adjacent node came from, keyed by formation. */
export function glidesFrom(before: ReadonlyMap<FormationId, NodeId>, now: readonly FormationView[], map: GameMap): Map<FormationId, NodeId> {
  const out = new Map<FormationId, NodeId>();
  for (const f of now) {
    const from = before.get(f.entry.id);
    if (from === undefined || from === f.node) continue;
    for (const n of map.neighbors(from)) {
      if (n !== f.node) continue;
      out.set(f.entry.id, from);
      break;
    }
  }
  return out;
}

/** The lon/lat a share `t` of the way from `from` to `to`, the short way round the antimeridian. */
export function along(map: GameMap, from: NodeId, to: NodeId, t: number): [number, number] {
  let dLon = map.lon[to] - map.lon[from];
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  return [map.lon[from] + dLon * t, map.lat[from] + (map.lat[to] - map.lat[from]) * t];
}

/** The formations gliding in the latest tick, one stack per edge and nation, strongest first, with the node each left. */
export function gliders(formations: readonly FormationView[], from: ReadonlyMap<FormationId, NodeId>): Map<Stack, NodeId> {
  const groups = new Map<string, { stack: Stack; from: NodeId }>();
  for (const f of formations) {
    const a = from.get(f.entry.id);
    if (a === undefined || f.status === 'destroyed' || f.status === 'embarked') continue;
    const key = `${a}>${f.node}|${f.entry.nation}`;
    const g = groups.get(key);
    if (g) g.stack.members.push(f);
    else groups.set(key, { from: a, stack: { nation: f.entry.nation, node: f.node, members: [f], nodes: 1 } });
  }
  for (const { stack } of groups.values()) stack.members.sort((a, b) => weight(b) - weight(a));
  return new Map([...groups.values()].map((g) => [g.stack, g.from]));
}
