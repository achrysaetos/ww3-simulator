import type { Catalog } from '../../core/catalog';
import { atWar, type SimContext, type System } from '../../core/engine';
import { platformCount } from '../../core/forces';
import type { Formation, FormationId, NationId, NodeId, PlatformId, TargetClass, Terrain, World } from '../../core/types';
import { TARGET_CLASSES } from '../../core/types';
import { atLineOfContact } from './movement';
import { allied, destroyFormation, hostilesAt, indexByNode, isLandFormation, landSlice } from './state';
import { updateEncirclement } from './encirclement';
import {
  AIR_SUPPRESSION, AMMO_DAYS_INTENSE, AMMO_RATION_BELOW, AREA_FIRE_REF_DENSITY, CAS_BONUS, DIRECT_DENSITY_EXP, COMBAT_FUEL_DUTY, COMBINED_ARMS,
  ENGAGED_HOURS_PER_DAY, ENTRENCH_MAX_BONUS, EXPERIENCE_PER_COMBAT_DAY, FATIGUE_COMBAT_PER_DAY, INDIRECT_FIRE, RETREAT_LOSS,
  RETREAT_MORALE, ROUT_ABANDON, ROUT_MORALE, TERRAIN, targetClassOf,
} from './tables';

/** Relative weight of each target class in an opposing force; need not be normalised. */
export type TargetMix = Partial<Record<TargetClass, number>>;
type ClassVector = Record<TargetClass, number>;
const zeros = (): ClassVector => Object.fromEntries(TARGET_CLASSES.map((c) => [c, 0])) as ClassVector;

export function terrainDefense(terrain: Terrain): number {
  return TERRAIN[terrain].defense;
}

/**
 * Training, maintenance, morale and exhaustion as one fire multiplier. A
 * well-trained, rested force (readiness 0.9, experience 0.8, morale 0.8) scores
 * ~1.1; a 1991-Iraqi-style conscript force (0.5, 0.3, 0.3) scores ~0.25.
 */
export function quality(f: Formation): number {
  return f.readiness * (0.4 + 1.2 * f.experience) * (0.5 + 0.5 * f.morale) * (1 - 0.4 * f.fatigue);
}

/** Below a third of a basic load units ration fire; a dry unit keeps only small-arms scrounge. */
export function ammoFactor(f: Formation): number {
  if (f.supplyCapacity.ammo <= 0) return 1;
  return Math.max(0.05, Math.min(1, f.supply.ammo / f.supplyCapacity.ammo / AMMO_RATION_BELOW));
}

function fireModifier(f: Formation): number {
  if (f.status === 'routed') return 0;
  return quality(f) * ammoFactor(f) * (f.supply.fuel <= 0 && f.supplyCapacity.fuel > 0 ? 0.7 : 1);
}

/** Kills-equivalent per engaged hour this formation delivers against a force of the given composition. */
export function combatPower(f: Formation, catalog: Catalog, vs: TargetMix): number {
  let total = 0;
  for (const c of TARGET_CLASSES) total += vs[c] ?? 0;
  if (total <= 0) return 0;
  let fire = 0;
  for (const [pid, n] of Object.entries(f.equipment)) {
    const fp = catalog.platform(pid as PlatformId).firepower;
    for (const c of TARGET_CLASSES) fire += n * (fp[c] ?? 0) * ((vs[c] ?? 0) / total);
  }
  return fire * fireModifier(f);
}

/** One side of a battle: who takes fire and who adds fire from adjacent nodes. */
interface Side {
  nation: NationId;
  fighters: Formation[];
  support: Formation[];
}

/** Per-side aggregates needed for the exchange. */
interface SideState {
  count: ClassVector;
  total: number;
  direct: ClassVector;
  indirect: ClassVector;
  closePenalty: boolean;
  air: number;
}

function summarize(world: World, catalog: Catalog, side: Side, node: NodeId, closed: boolean): SideState {
  const count = zeros(), direct = zeros(), indirect = zeros();
  for (const f of side.fighters)
    for (const [pid, n] of Object.entries(f.equipment)) count[targetClassOf(catalog.platform(pid as PlatformId).class)] += n;
  for (const f of [...side.fighters, ...side.support]) {
    const m = fireModifier(f);
    if (!m) continue;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const p = catalog.platform(pid as PlatformId);
      const into = INDIRECT_FIRE.has(p.class) ? indirect : direct;
      for (const c of TARGET_CLASSES) into[c] += n * (p.firepower[c] ?? 0) * m;
    }
  }
  let total = 0;
  for (const c of TARGET_CLASSES) total += count[c];
  const ac = world.theater.airControl[node];
  const air = !ac ? 1 : allied(world, side.nation, ac.nation) ? 1 + CAS_BONUS * ac.level : atWar(world, side.nation, ac.nation) ? 1 - AIR_SUPPRESSION * ac.level : 1;
  const closePenalty = closed && total > 0 && count.armor / total > COMBINED_ARMS.armorShare && count.infantry / total < COMBINED_ARMS.infantryShare;
  return { count, total, direct, indirect, closePenalty, air };
}

/**
 * Expected kills per target class that side `s` inflicts on side `t` this tick.
 * Area fire follows Lanchester's linear law (kills scale with target density);
 * aimed fire sits between square and linear (exponent DIRECT_DENSITY_EXP),
 * because a massed attacker in one cell presents more targets than it has
 * frontage to fire from. Pure square law makes a 3:1 attacker nearly immune,
 * which the 2022-24 record contradicts.
 */
function expectedKills(s: SideState, t: SideState, hours: number, fireMult: number, vulnerability: number): ClassVector {
  const out = zeros();
  if (t.total <= 0) return out;
  const density = Math.min(4, Math.max(0.25, t.total / AREA_FIRE_REF_DENSITY));
  const directDensity = density ** DIRECT_DENSITY_EXP;
  const mult = hours * fireMult * s.air * (s.closePenalty ? COMBINED_ARMS.fire : 1) * vulnerability * (t.closePenalty ? COMBINED_ARMS.vulnerability : 1);
  for (const c of TARGET_CLASSES) {
    if (!t.count[c]) continue;
    out[c] = Math.min(t.count[c], (s.direct[c] * directDensity + s.indirect[c] * density) * (t.count[c] / t.total) * mult);
  }
  return out;
}

type Ledger = { losses: Record<PlatformId, number>; casualties: number; lost: number };

/** Apply kills proportionally across the side's platforms and record them in the ledger; returns platforms lost per formation. */
function applyKills(ctx: SimContext, side: Side, kills: ClassVector, totals: ClassVector, ledger: Ledger): Map<Formation, number> {
  const lostBy = new Map<Formation, number>();
  for (const f of side.fighters) {
    let lostHere = 0;
    for (const [pid, n] of Object.entries(f.equipment)) {
      if (n <= 0) continue;
      const p = ctx.catalog.platform(pid as PlatformId);
      const c = targetClassOf(p.class);
      if (!kills[c]) continue;
      const expected = (kills[c] * n) / totals[c];
      const lost = Math.min(n, Math.floor(expected) + (ctx.rng.chance(expected % 1) ? 1 : 0));
      if (!lost) continue;
      // Knocked-out vehicles are often recoverable: WWII US and 2022-24 Oryx records put ~40-60% of armour losses as repairable or abandoned.
      const destroyed = ctx.rng.binomial(lost, 0.6 - 0.3 * p.protection.armor);
      f.equipment[pid as PlatformId] = n - lost;
      if (lost > destroyed) f.damaged[pid as PlatformId] = (f.damaged[pid as PlatformId] ?? 0) + lost - destroyed;
      ledger.losses[pid as PlatformId] = (ledger.losses[pid as PlatformId] ?? 0) + lost;
      // Crew casualties fall with protection; the 1.5x adds support-echelon losses to fire and strikes. Estimate.
      const cas = Math.min(f.personnel, Math.round(lost * p.crew * (1 - 0.5 * p.protection.armor) * 1.5));
      f.personnel -= cas;
      ledger.casualties += cas;
      lostHere += lost;
    }
    ledger.lost += lostHere;
    lostBy.set(f, lostHere);
  }
  return lostBy;
}

function consume(f: Formation, dtHours: number): void {
  const dtDays = dtHours / 24;
  f.supply.ammo = Math.max(0, f.supply.ammo - (f.supplyCapacity.ammo * dtDays) / AMMO_DAYS_INTENSE);
  f.supply.fuel = Math.max(0, f.supply.fuel - (f.supplyCapacity.fuel / 72) * dtHours * COMBAT_FUEL_DUTY);
}

/** Fall back to the adjacent friendly, enemy-free node farthest from the threat. False when there is nowhere to go. */
function retreat(world: World, ctx: SimContext, f: Formation, threat: NodeId, byNode: Map<number, Formation[]>): boolean {
  const { map } = ctx;
  let best = -1, bestD = -1;
  for (const n of map.neighbors(f.node)) {
    if (map.isSea(n)) continue;
    const holder = world.control[n];
    if (!holder || !allied(world, f.nation, holder) || hostilesAt(world, byNode, n, f.nation).length) continue;
    const d = map.distanceKm(n, threat);
    if (d > bestD) { bestD = d; best = n; }
  }
  f.order = { posture: 'defend', issuedTick: world.tick };
  f.progressKm = 0;
  f.entrenchment = 0;
  if (best < 0) return false;
  const here = byNode.get(f.node)!;
  here.splice(here.indexOf(f), 1);
  (byNode.get(best) ?? byNode.set(best, []).get(best)!).push(f);
  f.node = best as NodeId;
  return true;
}

function resolveBattle(world: World, ctx: SimContext, node: NodeId, att: Side, def: Side, byNode: Map<number, Formation[]>, engaged: Set<FormationId>): void {
  const { map, catalog, rng } = ctx;
  const slice = landSlice(world);
  const terrain = TERRAIN[map.terrain[node]];
  let entrench = 0, weight = 0;
  for (const f of def.fighters) {
    const n = platformCount(f);
    entrench += f.entrenchment * n;
    weight += n;
  }
  const defense = terrain.defense * (1 + ENTRENCH_MAX_BONUS * (weight ? entrench / weight : 0));
  // Half the defensive advantage is cover (fewer hits taken), half is prepared fields of fire.
  const edge = Math.sqrt(defense);
  const hours = (ENGAGED_HOURS_PER_DAY * world.dtHours) / 24;
  const a = summarize(world, catalog, att, node, terrain.closed);
  const d = summarize(world, catalog, def, node, terrain.closed);
  const routedVulnerability = (s: Side) => (s.fighters.some((f) => f.status === 'routed') ? 2 : 1);
  const noise = () => Math.exp(rng.normal(0, 0.2));
  const onDef = expectedKills(a, d, hours, noise(), routedVulnerability(def) / edge);
  const onAtt = expectedKills(d, a, hours, edge * noise(), routedVulnerability(att));

  const ledgers: Record<'att' | 'def', Ledger> = { att: { losses: {}, casualties: 0, lost: 0 }, def: { losses: {}, casualties: 0, lost: 0 } };
  const attLost = applyKills(ctx, att, onAtt, a.count, ledgers.att);
  const defLost = applyKills(ctx, def, onDef, d.count, ledgers.def);
  const attRate = ledgers.att.lost / Math.max(1, a.total), defRate = ledgers.def.lost / Math.max(1, d.total);

  const dtDays = world.dtHours / 24;
  const settle = (side: Side, lost: Map<Formation, number>, ledger: Ledger, winning: boolean, onRetreat: (f: Formation) => void) => {
    for (const f of side.fighters) {
      engaged.add(f.id);
      const before = platformCount(f) + (lost.get(f) ?? 0);
      f.morale = Math.max(0, Math.min(1, f.morale - (2 * (lost.get(f) ?? 0)) / Math.max(1, before) + (winning ? 0.01 : 0)));
      f.fatigue = Math.min(1, f.fatigue + FATIGUE_COMBAT_PER_DAY * dtDays);
      f.experience = Math.min(1, f.experience + EXPERIENCE_PER_COMBAT_DAY * dtDays);
      consume(f, world.dtHours);
      const left = platformCount(f);
      if (left === 0 || f.personnel <= 0) {
        destroyFormation(world, ctx, f);
        continue;
      }
      const lossFrac = 1 - left / (slice.baseline[f.id] ?? left);
      if (f.morale < ROUT_MORALE) {
        f.status = 'routed';
        for (const pid of Object.keys(f.equipment) as PlatformId[]) {
          const abandoned = rng.binomial(f.equipment[pid], ROUT_ABANDON);
          f.equipment[pid] -= abandoned;
          ledger.losses[pid] = (ledger.losses[pid] ?? 0) + abandoned;
        }
        onRetreat(f);
      } else if (lossFrac > RETREAT_LOSS || f.morale < RETREAT_MORALE) onRetreat(f);
    }
    for (const f of side.support) consume(f, world.dtHours);
  };
  const threat = att.fighters[0].node;
  settle(att, attLost, ledgers.att, attRate < defRate, (f) => {
    if (f.status === 'routed') retreat(world, ctx, f, node, byNode);
    else f.order = { posture: 'defend', issuedTick: world.tick };
  });
  settle(def, defLost, ledgers.def, defRate <= attRate, (f) => {
    if (!retreat(world, ctx, f, threat, byNode)) f.morale = Math.max(0, f.morale - 0.05);
  });

  const holding = def.fighters.some((f) => f.status !== 'destroyed' && f.node === node);
  const pressing = att.fighters.some((f) => f.status === 'active' && f.order.posture === 'attack');
  const winner = !holding ? att.nation : !pressing ? def.nation : undefined;
  ctx.emit({
    type: 'battle', tick: world.tick, node, attacker: att.nation, defender: def.nation,
    losses: { [att.nation]: ledgers.att.losses, [def.nation]: ledgers.def.losses } as Record<NationId, Record<PlatformId, number>>,
    casualties: { [att.nation]: ledgers.att.casualties, [def.nation]: ledgers.def.casualties } as Record<NationId, number>,
    ...(winner ? { winner } : {}),
  });
}

/** Artillery formations in nodes adjacent to the battle, friendly to `nation`, not on the march, not yet firing elsewhere this tick. */
function artillerySupport(world: World, ctx: SimContext, node: NodeId, nation: NationId, byNode: Map<number, Formation[]>, firing: Set<FormationId>): Formation[] {
  const out: Formation[] = [];
  for (const n of ctx.map.neighbors(node))
    for (const f of byNode.get(n) ?? []) {
      if (f.kind !== 'artillery' || f.status !== 'active' || f.order.posture === 'move' || firing.has(f.id) || !allied(world, nation, f.nation)) continue;
      firing.add(f.id);
      out.push(f);
    }
  return out;
}

export const landCombat: System = {
  id: 'landCombat',
  init(world) {
    landSlice(world);
  },
  step(world, ctx) {
    const { map } = ctx;
    const slice = landSlice(world);
    const byNode = indexByNode(world, map);

    // Assaults: manoeuvre formations with an attack order standing at the line of contact.
    const assaults = new Map<number, Formation[]>();
    for (const f of Object.values(world.formations)) {
      if (f.kind !== 'maneuver' || f.status !== 'active' || f.order.posture !== 'attack' || !isLandFormation(f, map)) continue;
      const next = f.order.path?.[0];
      if (next === undefined || !hostilesAt(world, byNode, next, f.nation).length || !atLineOfContact(world, map, f)) continue;
      const list = assaults.get(next);
      if (list) list.push(f);
      else assaults.set(next, [f]);
    }

    const engaged = new Set<FormationId>();
    const firing = new Set<FormationId>();
    for (const [node, attackers] of assaults) {
      const lead = attackers[0].nation;
      const fighters = attackers.filter((f) => allied(world, lead, f.nation));
      const defenders = hostilesAt(world, byNode, node, lead);
      if (!defenders.length) continue;
      const defNation = defenders[0].nation;
      for (const f of [...fighters, ...defenders]) {
        firing.add(f.id);
        if (!(f.id in slice.baseline)) slice.baseline[f.id] = platformCount(f);
      }
      const att: Side = { nation: lead, fighters, support: artillerySupport(world, ctx, node as NodeId, lead, byNode, firing) };
      const def: Side = { nation: defNation, fighters: defenders, support: artillerySupport(world, ctx, node as NodeId, defNation, byNode, firing) };
      resolveBattle(world, ctx, node as NodeId, att, def, byNode, engaged);
    }
    for (const id of Object.keys(slice.baseline) as FormationId[]) if (!engaged.has(id)) delete slice.baseline[id];

    updateEncirclement(world, ctx);
  },
};
