/**
 * The Operations panel's rows, read from the player's own formations and the cells an enemy is
 * pushing into: offensives under way, stretches of front under pressure, and the biggest sector
 * held. The engine has no operation object yet (battle plans need an objective order), so an
 * operation here is a group of the player's units sharing an order and an area.
 */
import type { GameMap } from '../../core/map';
import type { FormationId, FormationKind, NationId, NodeId } from '../../core/types';
import type { PlaceNamer } from '../events';
import type { FormationView } from '../snapshot';

export interface Operation {
  key: string;
  kind: 'offensive' | 'pressure' | 'holding';
  name: string;
  detail: string;
  status: { label: string; tone: 'gold' | 'blue' | 'red' };
  /** 0..1: average strength of an offensive, or how far the enemy has pushed into a sector. */
  meter: number;
  node: NodeId;
  formations: FormationId[];
}

export interface OperationsInput {
  me: NationId;
  map: GameMap;
  nationIds: readonly NationId[];
  control: Uint16Array;
  contest: Float32Array;
  formations: readonly FormationView[];
  enemies: readonly NationId[];
  places: PlaceNamer;
  /** Who commands a formation: the player, the AI staff, or nobody yet. */
  commandOf(id: FormationId, kind: FormationKind): 'player' | 'delegate' | 'none';
}

const LINE: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery']);
const CODEWORDS = ['Zenith', 'Tempest', 'Anvil', 'Granite', 'Lancer', 'Bastion', 'Thunder', 'Sabre', 'Citadel', 'Meridian', 'Trident', 'Halberd', 'Aurora', 'Ironside', 'Kestrel', 'Rampart'];
const MAX_ROWS = 4;

const bare = (place: string) => place.replace(/^near /, '');
function codeword(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return CODEWORDS[(h >>> 0) % CODEWORDS.length];
}

function runBy(fs: readonly FormationView[], commandOf: OperationsInput['commandOf']): string {
  const who = new Set(fs.map((f) => commandOf(f.entry.id, f.entry.kind)));
  if (who.size > 1) return 'mixed command';
  return who.has('player') ? 'your command' : who.has('delegate') ? 'AI staff' : 'awaiting your orders';
}

const units = (n: number) => `${n} ${n === 1 ? 'formation' : 'formations'}`;

export function operations(p: OperationsInput): Operation[] {
  const mine = p.nationIds.indexOf(p.me);
  const enemyIdx = new Set(p.enemies.map((e) => p.nationIds.indexOf(e)));
  const own = p.formations.filter((f) => f.entry.nation === p.me && f.status === 'active' && LINE.has(f.entry.kind) && !p.map.isSea(f.node));
  const at = new Map<NodeId, FormationView[]>();
  const sector = (node: NodeId) => bare(p.places.heldName(node, (cell) => p.control[cell] === mine));
  for (const f of own) at.set(f.node, [...(at.get(f.node) ?? []), f]);

  const offensives = new Map<string, FormationView[]>();
  for (const f of own) {
    if (f.posture !== 'attack' || f.target === null) continue;
    const area = bare(p.places.name(f.target));
    offensives.set(area, [...(offensives.get(area) ?? []), f]);
  }
  const attack: Operation[] = [...offensives.entries()].map(([area, fs]) => ({
    key: `off|${area}`,
    kind: 'offensive',
    name: `Operation ${codeword(area)}`,
    detail: `Toward ${area} · ${units(fs.length)} · ${runBy(fs, p.commandOf)}`,
    status: { label: 'Attacking', tone: 'gold' },
    meter: fs.reduce((a, f) => a + f.strength, 0) / fs.length,
    node: fs[0].target!,
    formations: fs.map((f) => f.entry.id),
  }));

  const pushed = new Map<string, { share: number; node: NodeId; cells: NodeId[] }>();
  const c = p.contest;
  for (let i = 0; i < c.length; i += 3) {
    const node = c[i] as NodeId;
    if (p.control[node] !== mine || !enemyIdx.has(c[i + 1])) continue;
    const area = sector(node);
    const s = pushed.get(area) ?? { share: 0, node, cells: [] };
    s.cells.push(node);
    if (c[i + 2] >= s.share) {
      s.share = c[i + 2];
      s.node = node;
    }
    pushed.set(area, s);
  }
  const pressure: Operation[] = [...pushed.entries()].map(([area, s]) => {
    const fs = s.cells.flatMap((n) => at.get(n) ?? []);
    return {
      key: `def|${area}`,
      kind: 'pressure',
      name: `Hold ${area}`,
      detail: `${s.share >= 0.5 ? `${area} may fall` : 'Under attack'} · ${fs.length ? `${units(fs.length)} · ${runBy(fs, p.commandOf)}` : 'no units in the line'}`,
      status: { label: 'Under pressure', tone: 'red' },
      meter: s.share,
      node: s.node,
      formations: fs.map((f) => f.entry.id),
    };
  });

  const front = new Map<string, FormationView[]>();
  for (const [node, fs] of at) {
    let touches = false;
    for (let i = p.map.adjStart[node]; i < p.map.adjStart[node + 1] && !touches; i++) touches = enemyIdx.has(p.control[p.map.adj[i]]);
    if (!touches) continue;
    const area = sector(node);
    if (pushed.has(area)) continue;
    front.set(area, [...(front.get(area) ?? []), ...fs.filter((f) => f.posture !== 'attack')]);
  }
  const holding: Operation[] = [...front.entries()].filter(([, fs]) => fs.length).map(([area, fs]) => ({
    key: `hold|${area}`,
    kind: 'holding',
    name: `Hold ${area}`,
    detail: `${units(fs.length)} · ${runBy(fs, p.commandOf)}`,
    status: { label: 'Holding', tone: 'blue' },
    meter: fs.reduce((a, f) => a + f.strength, 0) / fs.length,
    node: fs[0].node,
    formations: fs.map((f) => f.entry.id),
  }));

  const byKey = (a: Operation, b: Operation) => a.key.localeCompare(b.key);
  attack.sort((a, b) => b.formations.length - a.formations.length || byKey(a, b));
  pressure.sort((a, b) => b.meter - a.meter || byKey(a, b));
  holding.sort((a, b) => b.formations.length - a.formations.length || byKey(a, b));
  return [...attack.slice(0, 2), ...pressure.slice(0, 2), ...holding].slice(0, MAX_ROWS);
}
