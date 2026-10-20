import type { Catalog } from '../../core/catalog';
import { platformCount } from '../../core/forces';
import type { Formation, NationId, Order, PlatformId, World } from '../../core/types';
import type { AiState, ForceIndex, Plan } from './types';

const GROUND_TARGETS = ['infantry', 'soft', 'armor'] as const;
const groundValue = new WeakMap<Catalog, Map<PlatformId, number>>();

/** Ground firepower of one platform, weighted up by protection (a tank both kills and survives). */
function platformValue(catalog: Catalog, id: PlatformId): number {
  let memo = groundValue.get(catalog);
  if (!memo) groundValue.set(catalog, (memo = new Map()));
  let v = memo.get(id);
  if (v === undefined) {
    const p = catalog.platform(id);
    v = 0;
    for (const t of GROUND_TARGETS) v += p.firepower[t] ?? 0;
    v *= 1 + p.protection.armor;
    memo.set(id, v);
  }
  return v;
}

/**
 * Relative ground combat power, used only for force ratios, so both sides are
 * measured on the same scale. Readiness, morale and ammunition degrade it the
 * way Dupuy's QJM degrades raw firepower scores.
 */
export function combatPower(f: Formation, catalog: Catalog): number {
  let raw = 0;
  for (const [id, n] of Object.entries(f.equipment)) raw += n * platformValue(catalog, id as PlatformId);
  const ammo = f.supplyCapacity.ammo > 0 ? f.supply.ammo / f.supplyCapacity.ammo : 1;
  return raw * f.readiness * (0.5 + 0.5 * f.morale) * (0.4 + 0.6 * Math.min(1, ammo));
}

export const isGround = (f: Formation) => f.kind === 'maneuver' || f.kind === 'artillery';

export function indexForces(world: World, catalog: Catalog): ForceIndex {
  const byNation = new Map<NationId, Formation[]>();
  const groundAt = new Map<number, Formation[]>();
  const memo = new Map<Formation, number>();
  for (const f of Object.values(world.formations)) {
    if (f.status !== 'active' && f.status !== 'routed') continue;
    if (f.embarkedOn) continue;
    (byNation.get(f.nation) ?? byNation.set(f.nation, []).get(f.nation)!).push(f);
    if (!isGround(f)) continue;
    (groundAt.get(f.node) ?? groundAt.set(f.node, []).get(f.node)!).push(f);
  }
  const power = (f: Formation) => {
    let v = memo.get(f);
    if (v === undefined) memo.set(f, (v = combatPower(f, catalog)));
    return v;
  };
  return { byNation, groundAt, power };
}

/** Share of its first-seen platforms a formation still has. */
export function strength(ai: AiState, f: Formation): number {
  const now = platformCount(f);
  const base = (ai.baseStrength[f.id] ??= now);
  return base > 0 ? now / base : 0;
}

/** Queue an order unless the formation already has it, so planning every tick does not reset movement. */
export function issue(p: Plan, f: Formation, order: Omit<Order, 'issuedTick'>): void {
  const o = f.order;
  if (o.posture === order.posture && o.target === order.target && o.targetFormation === order.targetFormation) return;
  p.out.push({ type: 'order', nation: f.nation, formation: f.id, order });
}

/** The platform class with the most airframes/hulls in a formation. */
export function dominant<T extends string>(f: Formation, catalog: Catalog, classify: (cls: string) => T | undefined): Map<T, number> {
  const out = new Map<T, number>();
  for (const [id, n] of Object.entries(f.equipment)) {
    if (n <= 0) continue;
    const role = classify(catalog.platform(id as PlatformId).class);
    if (role) out.set(role, (out.get(role) ?? 0) + n);
  }
  return out;
}
