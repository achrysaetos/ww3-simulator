import type { SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { NationId, NodeId, World } from '../../core/types';
import { chokepointShare, geography } from '../naval/geography';
import type { NonKineticState, ZoneRisk } from './state';
import { ATTACK_HEAT, HEAT_HALF_DAYS, MAX_PREMIUM_PCT, MAX_REFUSING, MINE_RISK, WARSHIP_ATTACK_SHARE } from './tables';

/**
 * Shipping fear by sea zone, rebuilt each tick. Every attack on warships in a sea zone (a strike
 * that gets through, a sea battle) leaves heat that decays over days; hostile mines add standing
 * risk. Risk sets a war-risk premium and the share of merchant ships that refuse to transit, the
 * Red Sea 2024 mechanism where few sinkings still cut transits by two thirds (UNCTAD, Lloyd's List).
 * Warship fighting scares merchants far less than a campaign against them (WARSHIP_ATTACK_SHARE).
 * Submarines sinking merchants emit no event; blockade.ts counts that interdiction physically.
 */
export function stepMaritimeRisk(world: World, ctx: SimContext, s: NonKineticState): void {
  const dtDays = world.dtHours / 24;
  const decay = Math.exp(-(dtDays / HEAT_HALF_DAYS()) * Math.LN2);
  for (const node of Object.keys(s.maritime)) s.maritime[Number(node)].attackHeat *= decay;

  // A salvo that hits emits a strike and a battle; one attacker's fire in one zone in one tick is one attack.
  const attacks = new Set<string>();
  for (const e of world.events) {
    let node: NodeId | undefined, by: NationId | undefined;
    if (e.type === 'strike' && ctx.map.isSea(e.target) && e.fired > e.intercepted) [node, by] = [e.target, e.by];
    else if (e.type === 'battle' && e.domain === 'sea') [node, by] = [e.node as NodeId, e.attacker];
    if (node === undefined || attacks.has(`${node}|${by}`)) continue;
    attacks.add(`${node}|${by}`);
    zoneOf(s, node).attackHeat += ATTACK_HEAT() * WARSHIP_ATTACK_SHARE();
  }

  const mineRisk = new Map<number, number>();
  const mines = world.slices.naval?.mines ?? {};
  for (const node in mines) {
    let laid = 0;
    for (const who in mines[node]) laid += mines[node][who as NationId];
    if (laid > 0) mineRisk.set(Number(node), MINE_RISK() * laid);
  }

  for (const n of new Set<number>([...Object.keys(s.maritime).map(Number), ...mineRisk.keys()])) {
    const z = zoneOf(s, n);
    const risk = Math.min(1, z.attackHeat + (mineRisk.get(n) ?? 0));
    if (risk < 1e-3 && z.attackHeat < 1e-3) { delete s.maritime[n]; continue; }
    z.risk = risk;
    z.premiumPct = MAX_PREMIUM_PCT() * risk;
    z.refusing = MAX_REFUSING() * risk;
  }
}

function zoneOf(s: NonKineticState, node: number): ZoneRisk {
  return (s.maritime[node] ??= { risk: 0, premiumPct: 0, refusing: 0, attackHeat: 0 });
}

/**
 * Share of a nation's seaborne trade deterred by shipping fear, 0..1: the worst risk on the
 * chokepoints its trade must pass and on its own port zones, weighted by how much trade uses each.
 * Ships refusing to sail is trade not moving, on top of any physical blockade the naval system models.
 */
export function maritimeDeterred(world: World, map: GameMap, s: NonKineticState, nation: NationId): number {
  if (Object.keys(s.maritime).length === 0) return 0;
  const geo = geography(map);
  const energyWeight = 0.1 + 0.3 * Math.min(1, Math.max(0, (world.nations[nation]?.stats.energyImportPct ?? 0) / 100));
  let open = 1;
  for (const cp of geo.chokepoints) {
    const share = chokepointShare(cp.def, nation, energyWeight);
    if (!share) continue;
    let worst = 0;
    for (const n of cp.nodes) worst = Math.max(worst, s.maritime[n]?.refusing ?? 0);
    open *= 1 - share * worst;
  }
  let homeWorst = 0, w = 0;
  for (const p of geo.ports) {
    if (world.control[p.node] !== nation) continue;
    homeWorst += p.weight * (s.maritime[p.zone]?.refusing ?? 0);
    w += p.weight;
  }
  if (w > 0) open *= 1 - homeWorst / w;
  return 1 - open;
}
