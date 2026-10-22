import type { Catalog } from '../../core/catalog';
import { platformCount } from '../../core/forces';
import type { Formation, NationId, NodeId, Order, PlatformId, World } from '../../core/types';
import { CURRENT_CONFIDENCE, type ContactView } from '../intel/view';
import type { AiState, ForceIndex, Plan, SentOrder } from './types';

/** An enemy formation as this nation's intelligence sees it: the believed formation, where it was fixed, how fresh the fix is (1 = this tick). */
export interface Sighting { f: Formation; node: NodeId; confidence: number; contact: ContactView }

/** `e`'s formations that `p.nation` holds a current contact on (CURRENT_CONFIDENCE), at their believed positions. */
export function sighted(p: Plan, e: NationId): Sighting[] {
  const out: Sighting[] = [];
  for (const f of p.index.byNation.get(e) ?? []) {
    const c = p.view.contacts.get(f.id);
    if (c && c.confidence >= CURRENT_CONFIDENCE) out.push({ f, node: c.node, confidence: c.confidence, contact: c });
  }
  return out;
}

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

/** A refused order is offered again after this long even if nothing visible changed (judgment: a staff re-checks a standing request every few days). */
const RETRY_DAYS = 3;

/** Whether `held` is the order `sent` as the engine stores it: an escort's node is filled in from its ward. */
const carries = (held: Order, sent: SentOrder) => held.posture === sent.posture && held.targetFormation === sent.targetFormation && (sent.target === undefined || held.target === sent.target);

/**
 * Whether the engine refused the order sent at `last.tick`, applied the tick after: the formation
 * still holds an older order (air and naval refusals leave it be), or holds another one given that
 * very tick (a land formation with no route is halted to defend).
 */
const refused = (f: Formation, last: SentOrder) => f.order.issuedTick <= last.tick || (f.order.issuedTick === last.tick + 1 && !carries(f.order, last));

/**
 * Queue an order unless the formation already has it, so planning every tick does not reset
 * movement. An order the engine refused is not sent again while the formation stands where it
 * stood, until a front changes or RETRY_DAYS pass.
 */
export function issue(p: Plan, f: Formation, order: Omit<Order, 'issuedTick'>): void {
  const o = f.order;
  if (o.posture === order.posture && o.target === order.target && o.targetFormation === order.targetFormation) return;
  const { tick, dtHours } = p.world;
  const last = p.ai.sent[f.id];
  const same = last?.posture === order.posture && last.target === order.target && last.targetFormation === order.targetFormation;
  if (same && last.node === f.node && refused(f, last) && tick < last.tick + (RETRY_DAYS * 24) / dtHours) return;
  p.ai.sent[f.id] = { posture: order.posture, target: order.target, targetFormation: order.targetFormation, node: f.node, tick };
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
