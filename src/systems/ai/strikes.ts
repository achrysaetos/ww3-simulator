import { relation } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, Munition, MunitionId, NationId, NodeId, PlatformId, TargetClass } from '../../core/types';
import { rung } from '../diplomacy/wars';
import { isGround } from './forces';
import type { Plan } from './types';

export interface StrikeTarget {
  node: NodeId;
  cls: TargetClass;
  value: number;
  formation?: FormationId;
  assigned: number;
}

/**
 * Target values follow the order of the opening air campaign in 1991 Iraq
 * (Gulf War Air Power Survey) and the lessons of 2022 Ukraine: suppress air
 * defences first, then air bases and long-range fires, then the logistics
 * that sustain the front, then forces in contact.
 */
const VALUE_BY_KIND: Partial<Record<FormationKind, { value: number; cls: TargetClass }>> = {
  air_defense: { value: 5, cls: 'soft' },
  air_wing: { value: 4, cls: 'structure' },
  missile: { value: 3.5, cls: 'soft' },
  surface_group: { value: 3.5, cls: 'ship' },
  logistics: { value: 3, cls: 'soft' },
};
const FRONT_FORCES = { value: 2, cls: 'armor' as TargetClass };
const RAIL_HUB = { value: 1.5, cls: 'structure' as TargetClass, minRailKm: 50 };
const CAPITAL = { value: 2.5, cls: 'structure' as TargetClass };
/** Leadership willing to risk deep strikes on a nuclear power's homeland before the ladder sanctions them. */
const DEEP_STRIKE_RISK = 0.7;

/**
 * Whether striking cells of `owner`'s homeland outside the battle area is
 * politically allowed. Deep strikes on a nuclear-armed enemy wait until the
 * dyad has reached strategic conventional war (cf. the 2024 US decision to let
 * Ukraine hit Russian territory near Kharkiv but not deeper).
 */
function deepStrikeAllowed(p: Plan, owner: NationId): boolean {
  if (!p.enemies.has(owner) || p.world.nations[owner].nuclear.warheads <= 0) return true;
  if (p.profile.riskTolerance >= DEEP_STRIKE_RISK) return true;
  return rung(relation(p.world, p.nation, owner).escalation) >= rung('strategic_conventional');
}

export function battleAreaOf(p: Plan): Set<number> {
  const out = new Set<number>();
  for (const s of p.sectors) for (const n of s.battleArea) out.add(n);
  return out;
}

const CELL_DEG = 10;
const ROWS = 180 / CELL_DEG, COLS = 360 / CELL_DEG;

/** Strike targets bucketed by 10-degree cells, so each shooter only looks at what is near it. */
export class TargetGrid {
  private readonly cells = new Map<number, number[]>();

  /** `targets` must be sorted by value, descending. */
  constructor(readonly targets: StrikeTarget[], private readonly map: GameMap) {
    targets.forEach((t, i) => {
      const k = this.row(map.lat[t.node]) * COLS + this.col(map.lon[t.node]);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(i);
    });
  }

  private row(lat: number) { return Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / CELL_DEG))); }
  private col(lon: number) { return ((Math.floor((lon + 180) / CELL_DEG) % COLS) + COLS) % COLS; }

  /** Targets in the cells overlapping a `km` radius around `node`, still sorted by value. */
  near(node: NodeId, km: number): StrikeTarget[] {
    const lat = this.map.lat[node], lon = this.map.lon[node];
    const dLat = km / 111;
    const worstLat = Math.min(89, Math.max(Math.abs(lat - dLat), Math.abs(lat + dLat)));
    const dLon = km / (111 * Math.cos((worstLat * Math.PI) / 180));
    const wide = dLon >= 180;
    const cols = wide ? COLS : Math.min(COLS, Math.floor((lon + dLon + 180) / CELL_DEG) - Math.floor((lon - dLon + 180) / CELL_DEG) + 1);
    const c0 = wide ? 0 : this.col(lon - dLon);
    const idx: number[] = [];
    for (let r = this.row(lat - dLat); r <= this.row(lat + dLat); r++)
      for (let c = 0; c < cols; c++) for (const i of this.cells.get(r * COLS + ((c0 + c) % COLS)) ?? []) idx.push(i);
    return idx.sort((a, b) => a - b).map((i) => this.targets[i]);
  }
}

export function strikeTargets(p: Plan, battleArea: Set<number>): TargetGrid {
  const { map } = p.ctx;
  const out: StrikeTarget[] = [];
  for (const e of p.enemies)
    for (const f of p.index.byNation.get(e) ?? []) {
      const v = VALUE_BY_KIND[f.kind] ?? (isGround(f) && battleArea.has(f.node) ? FRONT_FORCES : undefined);
      if (v) out.push({ node: f.node, cls: v.cls, value: v.value, formation: f.id, assigned: 0 });
    }
  for (const n of battleArea)
    if (map.railKm[n] >= RAIL_HUB.minRailKm) out.push({ node: n as NodeId, cls: RAIL_HUB.cls, value: RAIL_HUB.value * Math.min(2, map.railKm[n] / 200), assigned: 0 });
  for (const e of p.enemies) {
    const cap = p.world.nations[e].capital;
    if (p.world.control[cap] === e) out.push({ node: cap, cls: CAPITAL.cls, value: CAPITAL.value, assigned: 0 });
  }
  const deep = new Map<NationId, boolean>();
  const allowed = (t: StrikeTarget) => {
    if (map.isSea(t.node) || battleArea.has(t.node)) return true;
    const owner = map.owner[t.node];
    let ok = deep.get(owner);
    if (ok === undefined) deep.set(owner, (ok = deepStrikeAllowed(p, owner)));
    return ok;
  };
  return new TargetGrid(out.filter(allowed).sort((a, b) => b.value - a.value || a.node - b.node), map);
}

/** Conventional munitions a formation has in its magazine. */
export function arsenal(p: Plan, f: Formation): Munition[] {
  const out: Munition[] = [];
  for (const [id, n] of Object.entries(f.magazine)) {
    const m = n > 0 ? p.ctx.catalog.munitions.get(id as MunitionId) : undefined;
    if (m && !m.yieldKt) out.push(m);
  }
  return out;
}

/** The munition with the best kill probability against `cls` that reaches `km`. */
export function bestMunition(munitions: readonly Munition[], cls: TargetClass, km: number): MunitionId | undefined {
  let best: MunitionId | undefined, bestPk = 0;
  for (const m of munitions) {
    const pk = m.rangeKm >= km ? (m.pk[cls] ?? 0) : 0;
    if (pk > bestPk) { bestPk = pk; best = m.id; }
  }
  return best;
}

/** Great-circle test with a cheap latitude-band reject first; shooters test thousands of targets. */
export function withinKm(map: GameMap, a: NodeId, b: NodeId, km: number): boolean {
  return Math.abs(map.lat[a] - map.lat[b]) * 111 <= km && map.distanceKm(a, b) <= km;
}

/** Unrefuelled reach of a formation (combat radius for aircraft, range for ships): its shortest-legged type sets it. */
export function reachKm(p: Plan, f: Formation): number {
  let r = Infinity;
  for (const [id, n] of Object.entries(f.equipment)) if (n > 0) r = Math.min(r, p.ctx.catalog.platform(id as PlatformId).mobility.rangeKm);
  return Number.isFinite(r) ? r : 0;
}

/**
 * The best target in reach; each claim divides a target's attraction so
 * strikes spread. `targets` is sorted by value, so the scan stops once no
 * later target could beat the best found.
 */
export function pickTarget(targets: StrikeTarget[], reachable: (t: StrikeTarget) => boolean): StrikeTarget | undefined {
  let best: StrikeTarget | undefined, bestScore = 0;
  for (const t of targets) {
    if (t.value <= bestScore) break;
    const score = t.value / (1 + t.assigned);
    if (score > bestScore && reachable(t)) { bestScore = score; best = t; }
  }
  if (best) best.assigned++;
  return best;
}
