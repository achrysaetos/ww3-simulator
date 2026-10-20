import { atWar } from '../../core/engine';
import type { NationId, NodeId, World } from '../../core/types';
import type { TickEnv } from './env';
import { chokepointShare, geography } from './geography';

/** Postures that project presence into neighbouring sea zones. */
const PROJECTING = new Set(['patrol', 'blockade', 'attack', 'escort']);
const PROJECTION = 0.3;
/** Sea-control strength at which a lone navy's hold reaches ~63%: about a destroyer squadron. */
const CONTROL_SCALE = 2;
/** Interdiction strength per attack submarine on a sea lane (U-boat and USN Pacific campaigns; a single SSN suspends a lane about 45%, estimate). */
const SUB_INTERDICTION = 0.6;
/** Interdiction strength of hostile mines per mine (100 mines ~ 2.0). */
const MINE_INTERDICTION = 0.02;
/**
 * Neutral shipping avoids active war zones: sea zones that are mined or where navies at war
 * meet. Red Sea 2024: attacks aimed at Israel-linked ships cut Suez/Bab-el-Mandeb transits by
 * about two thirds for everyone (UNCTAD, Feb-Jul 2024). A belligerent's patrol far from any
 * fighting does not turn away neutral ships it has no quarrel with.
 */
const NEUTRAL_DISRUPTION = 0.5;

/** Sea control per sea node: the strongest navy's share of presence, damped when presence is thin. Sole writer of theater.seaControl. */
export function computeSeaControl(env: TickEnv): void {
  const { world, ctx } = env;
  const strength = new Map<number, Map<NationId, number>>();
  const add = (node: number, nation: NationId, s: number) => {
    if (!ctx.map.isSea(node as NodeId) || s <= 0) return;
    let m = strength.get(node);
    if (!m) strength.set(node, (m = new Map()));
    m.set(nation, (m.get(nation) ?? 0) + s);
  };
  for (const f of env.naval) {
    const s = env.comp(f).seaControl;
    add(f.node, f.nation, s);
    if (PROJECTING.has(f.order.posture) && !f.order.path?.length) for (const n of ctx.map.neighbors(f.node)) add(n, f.nation, s * PROJECTION);
  }
  const out: World['theater']['seaControl'] = {};
  for (const [node, m] of strength) {
    let top: NationId | undefined, topS = 0, total = 0;
    for (const [nation, s] of m) {
      total += s;
      if (s > topS) { topS = s; top = nation; }
    }
    if (top) out[node] = { nation: top, level: (topS / total) * (1 - Math.exp(-topS / CONTROL_SCALE)) };
  }
  world.theater.seaControl = out;
}

/**
 * Share of each nation's seaborne trade interdicted. Trade must clear home waters (port zones,
 * weighted by port count) and then each chokepoint on its routes (share from the chokepoint
 * table, mixing general and energy routes by energy import dependence). Each passage is
 * suspended by 1 - exp(-hostile strength / (1 + own escorts)). Sole writer of theater.tradeBlocked.
 * The economic weight of the result (importsPctGdp) belongs to the economy system.
 */
export function computeTradeBlocked(env: TickEnv): void {
  const { world, ctx } = env;
  const geo = geography(ctx.map);
  const blockers = new Map<number, Map<NationId, number>>();
  const escorts = new Map<number, Map<NationId, number>>();
  const add = (m: Map<number, Map<NationId, number>>, node: number, nation: NationId, s: number) => {
    let x = m.get(node);
    if (!x) m.set(node, (x = new Map()));
    x.set(nation, (x.get(nation) ?? 0) + s);
  };
  const belligerent = new Set<NationId>();
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) for (const n of k.split('|')) belligerent.add(n as NationId);
  if (!belligerent.size) {
    world.theater.tradeBlocked = Object.fromEntries(Object.keys(world.nations).map((n) => [n, 0]));
    return;
  }
  for (const f of env.naval) {
    const c = env.comp(f);
    add(escorts, f.node, f.nation, c.seaControl);
    if (!belligerent.has(f.nation) || f.order.path?.length) continue;
    let s = f.order.posture === 'blockade' ? c.seaControl : 0;
    if (c.submerged && ['patrol', 'blockade', 'attack'].includes(f.order.posture))
      for (const h of c.hulls) if (h.platform.class !== 'ssbn') s += SUB_INTERDICTION * h.count;
    if (s > 0) add(blockers, f.node, f.nation, s);
  }
  const warZone = new Set<number>();
  for (const [node, laid] of Object.entries(world.slices.naval.mines))
    for (const [layer, n] of Object.entries(laid)) {
      add(blockers, Number(node), layer as NationId, n * MINE_INTERDICTION);
      warZone.add(Number(node));
    }
  for (const [node, here] of env.byNode) if (fighting(world, here)) warZone.add(node);

  const intensity = (node: number, victim: NationId): number => {
    const b = blockers.get(node);
    if (!b) return 0;
    let s = 0;
    for (const [nation, v] of b) {
      if (nation === victim) continue;
      if (atWar(world, nation, victim)) s += v;
      else if (warZone.has(node)) s += v * NEUTRAL_DISRUPTION;
    }
    return s > 0 ? 1 - Math.exp(-s / (1 + (escorts.get(node)?.get(victim) ?? 0))) : 0;
  };

  const portsBy = new Map<NationId, { zone: number; weight: number }[]>();
  for (const p of geo.ports) {
    const owner = world.control[p.node];
    if (!owner) continue;
    const l = portsBy.get(owner);
    if (l) l.push(p);
    else portsBy.set(owner, [p]);
  }
  const contested = geo.chokepoints.filter((cp) => cp.nodes.some((n) => blockers.has(n)));
  const out: Record<NationId, number> = {};
  for (const [id, nation] of Object.entries(world.nations) as [NationId, World['nations'][NationId]][]) {
    let home = 0, w = 0;
    for (const p of portsBy.get(id) ?? []) {
      home += p.weight * intensity(p.zone, id);
      w += p.weight;
    }
    let open = 1 - (w ? home / w : 0);
    // Fuels are ~15% of world merchandise trade by value (WTO 2023), a larger share for heavy energy importers.
    const energyWeight = 0.1 + 0.3 * Math.min(1, Math.max(0, (nation.stats.energyImportPct ?? 0) / 100));
    for (const cp of contested) {
      const share = chokepointShare(cp.def, id, energyWeight);
      if (!share) continue;
      let worst = 0;
      for (const n of cp.nodes) worst = Math.max(worst, intensity(n, id));
      open *= 1 - share * worst;
    }
    out[id] = 1 - open;
  }
  world.theater.tradeBlocked = out;
}

/** Whether naval forces of two nations at war share this sea zone. */
function fighting(world: World, here: readonly { nation: NationId }[]): boolean {
  for (let i = 0; i < here.length; i++)
    for (let j = i + 1; j < here.length; j++) if (here[i].nation !== here[j].nation && atWar(world, here[i].nation, here[j].nation)) return true;
  return false;
}
