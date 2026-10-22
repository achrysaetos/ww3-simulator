/**
 * The Operations panel's rows: the player's battle plans as the engine runs them, then what the
 * player's own formations and the enemy are doing outside them: units attacking on their own
 * orders, stretches of front under pressure, the biggest sector held, and at war the campaigns in
 * the air, at sea and by missile, which are a nation's whole war when it has no land front.
 */
import type { GameMap } from '../../core/map';
import type { FormationId, FormationKind, NationId, NodeId, Operation as Planned, OperationId, Posture } from '../../core/types';
import { namePlaces, type PlaceNamer } from '../events';
import type { FormationView } from '../snapshot';

export interface Operation {
  key: string;
  kind: 'planned' | 'offensive' | 'pressure' | 'holding' | 'air' | 'naval' | 'strike';
  /** The engine's operation, for a planned row. */
  op?: OperationId;
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
  /** The player's operations as the engine holds them (ops/state.ts). */
  planned: readonly Planned[];
  tick: number;
  enemies: readonly NationId[];
  places: PlaceNamer;
  /** Who commands a formation: the player, the AI staff, or nobody yet. */
  commandOf(id: FormationId, kind: FormationKind): 'player' | 'delegate' | 'none';
}

const LINE: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery']);
const CODEWORDS = ['Zenith', 'Tempest', 'Anvil', 'Granite', 'Lancer', 'Bastion', 'Thunder', 'Sabre', 'Citadel', 'Meridian', 'Trident', 'Halberd', 'Aurora', 'Ironside', 'Kestrel', 'Rampart'];
const MAX_ROWS = 4;
/** Rows kept for the air, sea and missile campaigns when the land war fills the panel. */
const CAMPAIGN_ROWS = 2;
const AREAS_NAMED = 2;

/** A campaign away from the land front: which formations and postures it gathers, and how its row reads. */
interface Campaign {
  key: string;
  kind: 'air' | 'naval' | 'strike';
  name: string;
  status: Operation['status'];
  /** The word before where it is fought, "On Pyongyang"; empty when the place name carries its own ("off Dubai"). */
  where: string;
  kinds: ReadonlySet<FormationKind>;
  postures: ReadonlySet<Posture>;
}

const CAMPAIGNS: readonly Campaign[] = [
  { key: 'strike', kind: 'strike', name: 'Strike campaign', status: { label: 'Striking', tone: 'gold' }, where: 'On', kinds: new Set(['air_wing', 'missile']), postures: new Set(['strike']) },
  { key: 'air', kind: 'air', name: 'Air superiority', status: { label: 'Contesting', tone: 'gold' }, where: 'Over', kinds: new Set(['air_wing']), postures: new Set(['air_superiority']) },
  { key: 'blockade', kind: 'naval', name: 'Blockade', status: { label: 'Blockading', tone: 'gold' }, where: '', kinds: new Set(['surface_group', 'submarine']), postures: new Set(['blockade']) },
  { key: 'sea', kind: 'naval', name: 'Sea control', status: { label: 'At sea', tone: 'blue' }, where: '', kinds: new Set(['surface_group', 'submarine']), postures: new Set(['patrol', 'escort']) },
];
/** An ended operation stays on the panel this many ticks, so its outcome is seen. */
const ENDED_TICKS = 8;
const PHASE: Record<Planned['phase'], Operation['status']> = {
  draft: { label: 'Draft', tone: 'blue' }, launched: { label: 'Advancing', tone: 'gold' }, stalled: { label: 'Stalled', tone: 'red' },
  succeeded: { label: 'Objective taken', tone: 'blue' }, failed: { label: 'Failed', tone: 'red' }, cancelled: { label: 'Called off', tone: 'blue' },
};

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

/** Share of the axis taken: its first cell is the line of departure, held from the start. */
export const gained = (o: Planned) => Math.max(0, Math.min(1, (o.progress.advance - 1) / Math.max(1, o.axis.length - 1)));

const units = (n: number) => `${n} ${n === 1 ? 'formation' : 'formations'}`;

export function operations(p: OperationsInput): Operation[] {
  const mine = p.nationIds.indexOf(p.me);
  const enemyIdx = new Set(p.enemies.map((e) => p.nationIds.indexOf(e)));
  const own = p.formations.filter((f) => f.entry.nation === p.me && f.status === 'active' && LINE.has(f.entry.kind) && !p.map.isSea(f.node));
  const at = new Map<NodeId, FormationView[]>();
  const sector = (node: NodeId) => bare(p.places.heldName(node, (cell) => p.control[cell] === mine));
  for (const f of own) at.set(f.node, [...(at.get(f.node) ?? []), f]);

  const live = p.planned.filter((o) => o.phase === 'draft' || o.phase === 'launched' || o.phase === 'stalled');
  const committed = new Set(live.filter((o) => o.phase !== 'draft').flatMap((o) => o.formations));
  const planned: Operation[] = p.planned
    .filter((o) => o.phase !== 'cancelled' && (o.endedTick === undefined || p.tick - o.endedTick <= ENDED_TICKS))
    .map((o) => {
      const cells = Math.max(1, o.axis.length - 1);
      const goal = o.objectives[o.objectives.length - 1] ?? o.axis[o.axis.length - 1];
      const note = o.phase === 'stalled' || o.phase === 'failed' ? namePlaces(o.progress.note, p.places) : `Toward ${bare(p.places.name(goal))} · ${units(o.formations.length)}${o.phase === 'launched' ? ` · bound ${Math.min(o.progress.bound, cells)} of ${cells}` : ''}`;
      return { key: `op|${o.id}`, kind: 'planned', op: o.id, name: o.name, detail: note, status: PHASE[o.phase], meter: gained(o), node: goal, formations: [...o.formations] };
    });

  const offensives = new Map<string, FormationView[]>();
  for (const f of own) {
    if (f.posture !== 'attack' || f.target === null || committed.has(f.entry.id)) continue;
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
  const land = [...planned.slice(0, MAX_ROWS - 1), ...attack.slice(0, 2), ...pressure.slice(0, 2), ...holding];
  const away = p.enemies.length ? campaigns(p) : [];
  const kept = land.slice(0, MAX_ROWS - Math.min(CAMPAIGN_ROWS, away.length));
  return [...kept, ...away].slice(0, MAX_ROWS);
}

/** One row per campaign the player's air, naval and missile formations are flying or sailing, biggest first. */
function campaigns(p: OperationsInput): Operation[] {
  const out: Operation[] = [];
  for (const c of CAMPAIGNS) {
    const fs = p.formations.filter((f) => f.entry.nation === p.me && f.status === 'active' && f.target !== null && c.kinds.has(f.entry.kind) && f.posture !== null && c.postures.has(f.posture));
    if (!fs.length) continue;
    const areas = new Map<string, { node: NodeId; n: number }>();
    for (const f of fs) {
      const area = bare(p.places.name(f.target!));
      const a = areas.get(area) ?? { node: f.target!, n: 0 };
      a.n++;
      areas.set(area, a);
    }
    const ranked = [...areas.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
    const named = ranked.slice(0, AREAS_NAMED).map(([area]) => area).join(', ') + (ranked.length > AREAS_NAMED ? ` and ${ranked.length - AREAS_NAMED} more` : '');
    out.push({
      key: `${c.key}|${p.me}`, kind: c.kind, name: c.name,
      detail: `${c.where ? `${c.where} ${named}` : named[0].toUpperCase() + named.slice(1)} · ${units(fs.length)} · ${runBy(fs, p.commandOf)}`,
      status: c.status,
      meter: fs.reduce((a, f) => a + f.strength, 0) / fs.length,
      node: ranked[0][1].node,
      formations: fs.map((f) => f.entry.id),
    });
  }
  return out.sort((a, b) => b.formations.length - a.formations.length || a.key.localeCompare(b.key));
}
