import { atWar } from '../../core/engine';
import type { Catalog } from '../../core/catalog';
import type { GameMap } from '../../core/map';
import type { Formation, NationId, NodeId, PlatformId, World } from '../../core/types';
import type { CommandNode, Jam } from './state';
import { BAND_MAX, EMITTERS, ORGANIC_EW, ORGANIC_KINDS, type EmitterSpec } from './tables';

const KM_PER_DEG = 111.2;
const EMIT_POSTURES: ReadonlySet<string> = new Set(['strike', 'air_superiority', 'patrol', 'escort']);

/** Cells an emitter at `center` reaches, each with the share of its area covered. */
const footprints = new WeakMap<GameMap, Map<number, { node: number; cover: number }[]>>();

function footprint(map: GameMap, center: NodeId, radiusKm: number): { node: number; cover: number }[] {
  let byKey = footprints.get(map);
  if (!byKey) footprints.set(map, (byKey = new Map()));
  const key = center * 4096 + radiusKm;
  let out = byKey.get(key);
  if (out) return out;
  const side = 2 * map.halfDeg[center] * KM_PER_DEG;
  const area = side * side * Math.cos((map.lat[center] * Math.PI) / 180);
  const own = Math.min(1, (Math.PI * radiusKm * radiusKm) / Math.max(1, area));
  out = [{ node: center, cover: own }];
  const within = new Set<number>(map.nodesWithin(center, radiusKm));
  for (const n of within) if (n !== center) out.push({ node: n, cover: 1 });
  // Jammers sit a few km behind the line (RUSI, "Stormbreak"), so half their disk reaches the cell across it.
  for (let k = map.adjStart[center]; k < map.adjStart[center + 1]; k++) if (!within.has(map.adj[k])) out.push({ node: map.adj[k], cover: own / 2 });
  byKey.set(key, out);
  return out;
}

/** Per emitting nation and cell, the log of the share of each band left unjammed; summed over emitters, then turned into jam. */
type Field = Map<NationId, Map<number, [number, number, number]>>;

function emit(field: Field, map: GameMap, nation: NationId, node: NodeId, spec: EmitterSpec, count: number): void {
  let cells = field.get(nation);
  if (!cells) field.set(nation, (cells = new Map()));
  for (const { node: n, cover } of footprint(map, node, spec.radiusKm)) {
    let acc = cells.get(n);
    if (!acc) cells.set(n, (acc = [0, 0, 0]));
    acc[0] += count * Math.log(1 - spec.gnss * cover);
    acc[1] += count * Math.log(1 - spec.comms * cover);
    acc[2] += count * Math.log(1 - spec.radar * cover);
  }
}

/**
 * Where an EW-equipped formation jams this tick: a land formation where it stands, an air wing over
 * its mission target while flying an offensive mission, nothing while it sits at base.
 */
function emitterNode(map: GameMap, f: Formation): NodeId | undefined {
  if (f.kind === 'air_wing') return EMIT_POSTURES.has(f.order.posture) ? f.order.target : undefined;
  return map.isSea(f.node) && f.kind !== 'surface_group' ? undefined : f.node;
}

/**
 * The jamming field the given formations and HQs of nations at war put out: EW platforms in its formations, the organic EW
 * its manoeuvre formations carry by doctrine (ORGANIC_EW), and the EW brigades with its HQs.
 */
export function buildJam(map: GameMap, catalog: Catalog, formations: Iterable<Formation>, belligerent: (n: NationId) => boolean, hqs: Iterable<CommandNode>): Record<NationId, Record<number, Jam>> {
  // Emitters of one type in one cell jam as one source of their summed count, so each footprint is walked once.
  const sources = new Map<string, { nation: NationId; node: NodeId; pid: string; count: number }>();
  const add = (nation: NationId, node: NodeId, pid: string, count: number) => {
    const key = `${nation}|${node}|${pid}`;
    const src = sources.get(key);
    if (src) src.count += count;
    else sources.set(key, { nation, node, pid, count });
  };
  for (const f of formations) {
    if (f.status !== 'active' || f.embarkedOn || !belligerent(f.nation)) continue;
    const organic = ORGANIC_KINDS.has(f.kind) && !map.isSea(f.node) ? ORGANIC_EW[f.nation]?.[f.echelon] : undefined;
    if (organic) for (const pid in organic) add(f.nation, f.node, pid, organic[pid]);
    const at = emitterNode(map, f);
    if (at === undefined) continue;
    for (const pid in f.equipment) if (EMITTERS[pid] && f.equipment[pid as PlatformId] > 0 && catalog.platforms.has(pid as PlatformId)) add(f.nation, at, pid, f.equipment[pid as PlatformId]);
  }
  for (const hq of hqs) {
    const kit = hq.level !== 'national' && hq.integrity > 0 && belligerent(hq.nation) ? ORGANIC_EW[hq.nation]?.hq : undefined;
    if (kit) for (const pid in kit) add(hq.nation, hq.node, pid, kit[pid] * hq.integrity);
  }
  const field: Field = new Map();
  for (const src of sources.values()) emit(field, map, src.nation, src.node, EMITTERS[src.pid], src.count);
  const out: Record<NationId, Record<number, Jam>> = {};
  for (const [nation, cells] of field) {
    const row: Record<number, Jam> = (out[nation] = {});
    for (const [n, [g, c, r]] of cells) row[n] = { gnss: BAND_MAX.gnss * (1 - Math.exp(g)), comms: BAND_MAX.comms * (1 - Math.exp(c)), radar: BAND_MAX.radar * (1 - Math.exp(r)) };
  }
  return out;
}

const CLEAR: Jam = Object.freeze({ gnss: 0, comms: 0, radar: 0 });

/** Jamming that `nation`'s enemies put on `node`, combining every enemy's emitters. */
export function jamAgainst(world: World, node: NodeId, nation: NationId): Jam {
  const field = world.slices.c2?.jam;
  if (!field) return CLEAR;
  let g = 1, c = 1, r = 1, any = false;
  for (const e in field) {
    const j = field[e as NationId][node];
    if (!j || !atWar(world, e as NationId, nation)) continue;
    any = true;
    g *= 1 - j.gnss;
    c *= 1 - j.comms;
    r *= 1 - j.radar;
  }
  return any ? { gnss: 1 - g, comms: 1 - c, radar: 1 - r } : CLEAR;
}
