import { atWar, type SimContext } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, NationId, NodeId, World } from '../../core/types';
import { supplyFactor } from '../logistics';
import { destroyFormation, isLandFormation, landSlice } from './state';
import { MORALE_ISOLATED_PER_DAY, SURRENDER_GRACE_DAYS, SURRENDER_HAZARD_PER_DAY } from './tables';

/**
 * Which formations of one nation are encircled: cut from supply and hemmed in by
 * the enemy. Supply is the logistics network's own reckoning (`supplyFactor`), so a
 * pocket is never ground logistics still reaches, and an island garrison no enemy
 * has landed on is not a pocket. Verdicts are memoised per cell for one day.
 */
class Encirclement {
  private readonly pocket = new Map<NodeId, boolean>();

  constructor(private readonly world: World, private readonly map: GameMap, private readonly nation: NationId) {}

  private supplied(node: NodeId): boolean {
    return supplyFactor(this.world, this.map, node, this.nation) > 0;
  }

  /** Ground the nation's own supply network runs over: its own and that of bloc partners it is not fighting (logistics' networkMembers). */
  private network(holder: NationId): boolean {
    if (holder === this.nation) return true;
    const a = this.world.nations[this.nation], b = this.world.nations[holder];
    return !!b && a.blocs.some((x) => b.blocs.includes(x)) && !atWar(this.world, this.nation, holder);
  }

  cutOff(f: Formation): boolean {
    const { world, map } = this;
    const holder = world.control[f.node];
    // Fighting inside an enemy cell: cut off unless supplied over the beach, or it borders friendly ground that is not itself a pocket.
    if (atWar(world, f.nation, holder)) {
      if (this.supplied(f.node)) return false;
      for (const n of map.neighbors(f.node)) if (!map.isSea(n) && !atWar(world, f.nation, world.control[n]) && !this.cutOffAt(n)) return false;
      return true;
    }
    return this.cutOffAt(f.node);
  }

  /**
   * Whether non-enemy ground at `node` is cut off for the nation. A host or neutral
   * not at war with it feeds and shelters what it hosts; its own network's ground
   * is cut off only inside a pocket. Supply is read per cell, so a front-line cell
   * logistics leaves dry because the enemy's troops stand in it is not by itself a pocket.
   */
  private cutOffAt(node: NodeId): boolean {
    if (!this.network(this.world.control[node]) || this.supplied(node)) return false;
    return this.inPocket(node);
  }

  /**
   * Whether the unsupplied stretch of network ground around `start` is closed in:
   * every way out runs into enemy-held land, and it touches the enemy somewhere. A
   * stretch that borders supplied ground or a host's land is behind the lines, not
   * surrounded; one bounded only by sea and no enemy is a logistics gap, not a pocket.
   */
  private inPocket(start: NodeId): boolean {
    const known = this.pocket.get(start);
    if (known !== undefined) return known;
    const { world, map } = this;
    const cells: NodeId[] = [start];
    const seen = new Set(cells);
    let open = false, enemy = false;
    for (let i = 0; i < cells.length && !open; i++)
      for (const n of map.neighbors(cells[i])) {
        if (map.isSea(n) || seen.has(n)) continue;
        const holder = world.control[n];
        if (atWar(world, this.nation, holder)) enemy = true;
        else if (!this.network(holder) || this.supplied(n)) open = true;
        else {
          seen.add(n);
          cells.push(n);
        }
      }
    const verdict = !open && enemy;
    for (const n of seen) this.pocket.set(n, verdict);
    return verdict;
  }
}

/** Daily: mark formations cut off from supply, sap their morale, and let long-isolated pockets surrender. */
export function updateEncirclement(world: World, ctx: SimContext): void {
  const ticksPerDay = Math.max(1, Math.round(24 / world.dtHours));
  if (world.tick % ticksPerDay) return;
  const days = (ticksPerDay * world.dtHours) / 24;
  const isolated = landSlice(world).isolatedDays;

  const belligerents = new Set<string>();
  for (const [k, r] of Object.entries(world.relations)) if (r.atWar) for (const n of k.split('|')) belligerents.add(n);
  const byNation = new Map<NationId, Encirclement>();
  for (const f of Object.values(world.formations)) {
    if (!isLandFormation(f, ctx.map)) continue;
    let e = byNation.get(f.nation);
    if (!e && belligerents.has(f.nation)) byNation.set(f.nation, (e = new Encirclement(world, ctx.map, f.nation)));
    if (!e?.cutOff(f)) {
      delete isolated[f.id];
      continue;
    }
    const d = (isolated[f.id] = (isolated[f.id] ?? 0) + days);
    f.morale = Math.max(0, f.morale - MORALE_ISOLATED_PER_DAY * days);
    const starving = f.supply.food <= 0 ? 2 : 1;
    if (ctx.rng.chance(SURRENDER_HAZARD_PER_DAY * Math.max(0, d - SURRENDER_GRACE_DAYS) * (1 - f.morale) * starving * days)) {
      ctx.emit({ type: 'message', tick: world.tick, nation: f.nation, text: `${f.name} surrendered after ${Math.round(d)} days encircled` });
      destroyFormation(world, ctx, f);
    }
  }
}
