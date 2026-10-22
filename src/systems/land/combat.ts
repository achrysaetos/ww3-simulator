import type { Catalog } from '../../core/catalog';
import type { GameMap } from '../../core/map';
import { atWar, type SimContext, type System } from '../../core/engine';
import { platformCount, supplyCapacityOf } from '../../core/forces';
import type { Formation, FormationId, NationId, NodeId, PlatformId, TargetClass, Terrain, World } from '../../core/types';
import { TARGET_CLASSES } from '../../core/types';
import { marchBurnPerHour, marchKmPerDay } from './movement';
import { allied, cellDepthKm, destroyFormation, hostilesAt, indexByNode, landSlice } from './state';
import { updateEncirclement } from './encirclement';
import { c2FireFactor } from '../c2';
import { groundFactorAt } from '../weather/effects';
import {
  AIR_SUPPRESSION, AMMO_DAYS_INTENSE, ATTRITION_KM_PER_DAY, ATTRITION_MAX_KM_PER_DAY, BREAKTHROUGH_KM_PER_DAY, COVERED_KM_PER_DAY, HOSTILE_GROUND_COST,
  ASSAULT_EXPOSURE, BELT_DRAG, DELIBERATE_ASSAULT_RATIO, FRONTAGE_PLATFORMS, WITHDRAWAL_KM, POSITIONAL_INTENSITY, AMMO_RATION_BELOW, AREA_FIRE_REF_DENSITY, CAS_BONUS, DIRECT_DENSITY_EXP, COMBAT_FUEL_DUTY, COMBINED_ARMS,
  CELL_FRONT_KM, ENGAGED_HOURS_PER_DAY, HASTY_BARRIER, ENTRENCH_MAX_BONUS, KILL_ZONE_COMMIT, MASSED_ASSAULT_RATIO, NEXT_LINE_ENTRENCHMENT, NO_FUEL_SPEED, EXPERIENCE_PER_COMBAT_DAY, FATIGUE_COMBAT_PER_DAY, INDIRECT_FIRE, RETREAT_LOSS,
  RETREAT_MORALE, RIVER_DEFENSE, RIVER_TEMPO, ROUT_ABANDON, ROUT_MORALE, SHELL_TONS, SHELLS_PER_TUBE_DAY, TERRAIN, TUBE_ARTILLERY, URBAN_MANOEUVRE, exposureOf, targetClassOf,
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

/** Share of fire a unit keeps with no fuel: guns still fire, but nothing manoeuvres to new positions. */
const DRY_FIRE = 0.7;

/** Share of a day's combat fuel burn the formation has on hand, 0..1. */
function fuelOnHand(f: Formation): number {
  const need = marchBurnPerHour(f) * 24 * COMBAT_FUEL_DUTY;
  return need <= 0 ? 1 : Math.min(1, Math.max(0, f.supply.fuel) / need);
}

/** Fire kept for want of fuel, falling from 1 with a day's combat burn on hand to DRY_FIRE with none. */
export function fuelFactor(f: Formation): number {
  return DRY_FIRE + (1 - DRY_FIRE) * fuelOnHand(f);
}

/**
 * Share of its pace a pressing formation keeps: vehicles go as far as the fuel on hand carries them and past
 * that the troops walk, but a cut-off force with dry tanks stops. Kampfgruppe Peiper halted and abandoned its
 * vehicles for want of fuel in the Ardennes, 1944; the Kyiv convoy stalled on fuel in March 2022.
 */
function mobility(world: World, f: Formation): number {
  const fuelled = fuelOnHand(f);
  return fuelled + (1 - fuelled) * (f.id in landSlice(world).isolatedDays ? 0 : NO_FUEL_SPEED);
}

function fireModifier(f: Formation): number {
  if (f.status === 'routed') return 0;
  return quality(f) * ammoFactor(f) * fuelFactor(f);
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
  /** Share of the side's direct-fire weapons that fit the cell's front; the rest wait in depth. */
  inLine: number;
}

function summarize(world: World, catalog: Catalog, side: Side, node: NodeId, closed: boolean): SideState {
  const count = zeros(), direct = zeros(), indirect = zeros();
  for (const f of side.fighters)
    for (const [pid, n] of Object.entries(f.equipment)) {
      const cls = catalog.platform(pid as PlatformId).class;
      count[targetClassOf(cls)] += n * exposureOf(cls);
    }
  for (const f of [...side.fighters, ...side.support]) {
    const m = fireModifier(f) * c2FireFactor(world, f);
    if (!m) continue;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const p = catalog.platform(pid as PlatformId);
      const into = INDIRECT_FIRE.has(p.class) ? indirect : direct;
      for (const c of TARGET_CLASSES) into[c] += n * (p.firepower[c] ?? 0) * m;
    }
  }
  let total = 0;
  for (const c of TARGET_CLASSES) total += count[c];
  // Only so many direct-fire weapons can see the enemy along one cell's front; the rest wait in depth. Massed artillery is not so limited.
  const inLine = Math.min(1, FRONTAGE_PLATFORMS() / Math.max(1, total));
  for (const c of TARGET_CLASSES) direct[c] *= inLine;
  const ac = world.theater.airControl[node];
  const air = !ac ? 1 : allied(world, side.nation, ac.nation) ? 1 + CAS_BONUS() * ac.level : atWar(world, side.nation, ac.nation) ? 1 - AIR_SUPPRESSION() * ac.level : 1;
  const closePenalty = closed && total > 0 && count.armor / total > COMBINED_ARMS.armorShare && count.infantry / total < COMBINED_ARMS.infantryShare;
  return { count, total, direct, indirect, closePenalty, air, inLine };
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
  const density = Math.min(4, Math.max(0.25, t.total / AREA_FIRE_REF_DENSITY()));
  const directDensity = density ** DIRECT_DENSITY_EXP();
  const mult = hours * fireMult * s.air * (s.closePenalty ? COMBINED_ARMS.fire : 1) * vulnerability * (t.closePenalty ? COMBINED_ARMS.vulnerability : 1);
  for (const c of TARGET_CLASSES) {
    if (!t.count[c]) continue;
    out[c] = Math.min(t.count[c], (s.direct[c] * directDensity + s.indirect[c] * density) * (t.count[c] / t.total) * mult);
  }
  return out;
}

/**
 * Fire `s` can put on `t`'s mix over the fire `t` can put on `s`'s: the raw local force ratio. With `whole`,
 * every weapon counts, including those waiting in depth: the whole-force ratio planners mass to (3:1, 9:1).
 */
function fireRatio(s: SideState, t: SideState, whole = false): number {
  const on = (x: SideState, y: SideState) => {
    let v = 0;
    for (const c of TARGET_CLASSES) if (y.count[c]) v += (x.direct[c] / (whole ? x.inLine : 1) + x.indirect[c]) * (y.count[c] / y.total);
    return v;
  };
  return on(s, t) / Math.max(1e-9, on(t, s));
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
      const expected = (kills[c] * n * exposureOf(p.class)) / totals[c];
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

/**
 * Combat consumption over `dtHours` of full-intensity combat. Gun tubes fire rounds
 * at a per-tube rate, other armed platforms spend their basic load over
 * AMMO_DAYS_INTENSE, and trucks and other unarmed platforms fire nothing. Rounds
 * fired are tallied per nation, the unit open sources count shelling in.
 */
function consume(world: World, catalog: Catalog, f: Formation, dtHours: number): void {
  const dtDays = dtHours / 24;
  const armed: Record<PlatformId, number> = {};
  let tubes = 0;
  for (const key in f.equipment) {
    const pid = key as PlatformId, k = f.equipment[pid];
    if (k <= 0) continue;
    const p = catalog.platform(pid);
    if (TUBE_ARTILLERY.has(p.class)) tubes += k;
    else for (const c in p.firepower) if (p.firepower[c as TargetClass]) { armed[pid] = k; break; }
  }
  // A unit short of ammunition rations fire, and so spends less, the same way it hits less.
  const ration = ammoFactor(f) * dtDays;
  const otherLoad = supplyCapacityOf(catalog, armed).ammo;
  const fired = Math.min(tubes * SHELLS_PER_TUBE_DAY() * ration, Math.max(0, f.supply.ammo) / SHELL_TONS);
  f.supply.ammo = Math.max(0, f.supply.ammo - fired * SHELL_TONS - (otherLoad * ration) / AMMO_DAYS_INTENSE());
  if (fired > 0) {
    const tally = landSlice(world).shellsFired;
    tally[f.nation] = (tally[f.nation] ?? 0) + fired;
  }
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

/** Level of air control `nation`'s side holds over `node`, 0..1. */
function airControlOf(world: World, nation: NationId, node: NodeId): number {
  const ac = world.theater.airControl[node];
  return ac && allied(world, nation, ac.nation) ? ac.level : 0;
}

/** Platform-weighted entrenchment of a group at `node`, 0..1; on its own side's ground it occupies the cell's standing fortifications. */
function entrenchmentOf(world: World, fighters: Formation[], node: NodeId): number {
  if (!fighters.length) return 0;
  const holder = world.control[node];
  const fort = holder && allied(world, fighters[0].nation, holder) ? landSlice(world).fortified[node] ?? 0 : 0;
  let entrench = 0, weight = 0;
  for (const f of fighters) {
    const n = platformCount(f);
    entrench += Math.max(fort, f.entrenchment) * n;
    weight += n;
  }
  return weight ? entrench / weight : 0;
}

/** Terrain and entrenchment of a side's own ground; half of it is cover (fewer hits taken), half prepared fields of fire. */
function defensiveEdge(world: World, map: GameMap, fighters: Formation[], node: NodeId): number {
  return Math.sqrt(TERRAIN[map.terrain[node]].defense * (1 + ENTRENCH_MAX_BONUS() * entrenchmentOf(world, fighters, node)));
}

/**
 * An assault: the attacker fights into the defender's ground, at full
 * intensity while pressing, from a bridgehead when it holds no dry approach
 * (`river`). Positional: two lines in contact, each dug in on its own ground,
 * trading fire at reduced intensity.
 */
type Engagement = { kind: 'assault'; river: boolean } | { kind: 'positional'; attNode: NodeId };

interface BattleResult {
  /** The defender's expected loss rate over the attacker's; > 1 means the attacker is winning. */
  exchange: number;
  /** A defender still able to fight fell back to its next line inside the cell. */
  yielded: boolean;
  /** The attacker's fire over the defender's, the force ratio the assault was fought at. */
  ratio: number;
  /** The same with every weapon of both sides counted, those waiting in depth too. */
  mass: number;
  /** Share of the attacking force inside the defender's kill zone at once, 0..1. */
  committed: number;
  /** Share of the cell's front the defender has the platforms to hold, 0..1. */
  manned: number;
  /** Share of the cell's front the attacker's committed force fills at full frontage density, 0..1: the width its push covers. */
  sector: number;
}

function resolveBattle(world: World, ctx: SimContext, node: NodeId, att: Side, def: Side, byNode: Map<number, Formation[]>, engaged: Set<FormationId>, how: Engagement): BattleResult {
  const { map, catalog, rng } = ctx;
  const slice = landSlice(world);
  const terrain = TERRAIN[map.terrain[node]];
  // A defender behind a river fires on crossing sites it has registered, and the attacker crosses a few vehicles at a time.
  const defEdge = defensiveEdge(world, map, def.fighters, node) * (how.kind === 'assault' && how.river ? RIVER_DEFENSE() : 1);
  const attEdge = how.kind === 'positional' ? defensiveEdge(world, map, att.fighters, how.attNode) : 1;
  const a = summarize(world, catalog, att, node, terrain.closed);
  const d = summarize(world, catalog, def, node, terrain.closed);
  // An attacker without a deliberate-assault superiority attacks on a few narrow axes, not along the whole cell.
  const intensity = how.kind === 'assault' ? Math.min(1, Math.max(POSITIONAL_INTENSITY(), fireRatio(a, d) / DELIBERATE_ASSAULT_RATIO())) : POSITIONAL_INTENSITY();
  // Against a prepared line only part of an assaulting force is in the kill zone at once; the rest waits outside it while the guns fire.
  const committed = how.kind === 'assault' ? 1 - (1 - KILL_ZONE_COMMIT()) * entrenchmentOf(world, def.fighters, node) * (1 - airControlOf(world, att.nation, node)) : 1;
  const hours = (ENGAGED_HOURS_PER_DAY() * world.dtHours * intensity * committed) / 24;
  const routedVulnerability = (s: Side) => (s.fighters.some((f) => f.status === 'routed') ? 2 : 1);
  const noise = () => Math.exp(rng.normal(0, 0.2));
  const onDef = expectedKills(a, d, hours, attEdge * noise(), routedVulnerability(def) / defEdge);
  const exposure = how.kind === 'assault' ? 1 + ASSAULT_EXPOSURE() * entrenchmentOf(world, def.fighters, node) : 1;
  const onAtt = expectedKills(d, a, hours, defEdge * noise(), (exposure * routedVulnerability(att)) / attEdge);
  const sum = (v: ClassVector) => TARGET_CLASSES.reduce((acc, c) => acc + v[c], 0);
  const exchange = sum(onDef) / Math.max(1, d.total) / Math.max(1e-9, sum(onAtt) / Math.max(1, a.total));

  const ledgers: Record<'att' | 'def', Ledger> = { att: { losses: {}, casualties: 0, lost: 0 }, def: { losses: {}, casualties: 0, lost: 0 } };
  const attLost = applyKills(ctx, att, onAtt, a.count, ledgers.att);
  const defLost = applyKills(ctx, def, onDef, d.count, ledgers.def);
  const attRate = ledgers.att.lost / Math.max(1, a.total), defRate = ledgers.def.lost / Math.max(1, d.total);

  const dtDays = world.dtHours / 24;
  const settle = (side: Side, lost: Map<Formation, number>, ledger: Ledger, winning: boolean, onRetreat: (f: Formation) => void) => {
    for (const f of side.fighters) {
      // Holding a line is not an engagement: units there still rest and recover between exchanges.
      if (how.kind === 'assault') engaged.add(f.id);
      const before = platformCount(f) + (lost.get(f) ?? 0);
      f.morale = Math.max(0, Math.min(1, f.morale - (2 * (lost.get(f) ?? 0)) / Math.max(1, before) + (winning ? 0.01 : 0)));
      f.fatigue = Math.min(1, f.fatigue + FATIGUE_COMBAT_PER_DAY * dtDays * intensity);
      f.experience = Math.min(1, f.experience + EXPERIENCE_PER_COMBAT_DAY * dtDays);
      consume(world, catalog, f, world.dtHours * intensity);
      const left = platformCount(f);
      if (left === 0 || f.personnel <= 0) {
        destroyFormation(world, ctx, f);
        continue;
      }
      const lossFrac = 1 - left / (slice.baseline[f.id] ?? left);
      if (f.morale < ROUT_MORALE()) {
        f.status = 'routed';
        for (const pid of Object.keys(f.equipment) as PlatformId[]) {
          const abandoned = rng.binomial(f.equipment[pid], ROUT_ABANDON);
          f.equipment[pid] -= abandoned;
          ledger.losses[pid] = (ledger.losses[pid] ?? 0) + abandoned;
        }
        onRetreat(f);
      } else if (lossFrac > RETREAT_LOSS() || f.morale < RETREAT_MORALE()) onRetreat(f);
    }
    for (const f of side.support) consume(world, catalog, f, world.dtHours * intensity);
  };
  let yielded = false;
  const fallBackFrom = (threat: NodeId) => (f: Formation) => {
    if (!retreat(world, ctx, f, threat, byNode)) f.morale = Math.max(0, f.morale - 0.05);
  };
  if (how.kind === 'positional') {
    settle(att, attLost, ledgers.att, attRate < defRate, fallBackFrom(node));
    settle(def, defLost, ledgers.def, defRate <= attRate, fallBackFrom(how.attNode));
  } else {
    settle(att, attLost, ledgers.att, attRate < defRate, (f) => {
      if (f.status === 'routed') retreat(world, ctx, f, node, byNode);
      else f.order = { posture: 'defend', issuedTick: world.tick };
    });
    // A shaken but intact defender gives up its forward line and digs in on the next one; only a routed one leaves the cell.
    // One not yet dug in has no line to give up and fights where it stands, so a shaken defender yields once per line rather than every tick.
    settle(def, defLost, ledgers.def, defRate <= attRate, (f) => {
      if (f.status === 'routed') return fallBackFrom(node)(f);
      if (f.entrenchment < NEXT_LINE_ENTRENCHMENT()) return;
      yielded = true;
      f.entrenchment = 0;
      slice.baseline[f.id] = platformCount(f);
    });
  }

  const holding = def.fighters.some((f) => f.status !== 'destroyed' && f.node === node);
  const pressing = how.kind === 'assault' && att.fighters.some((f) => f.status === 'active' && f.order.posture === 'attack');
  const winner = how.kind === 'positional' ? undefined : !holding ? att.nation : !pressing ? def.nation : undefined;
  ctx.emit({
    type: 'battle', tick: world.tick, node, attacker: att.nation, defender: def.nation,
    losses: { [att.nation]: ledgers.att.losses, [def.nation]: ledgers.def.losses } as Record<NationId, Record<PlatformId, number>>,
    casualties: { [att.nation]: ledgers.att.casualties, [def.nation]: ledgers.def.casualties } as Record<NationId, number>,
    ...(winner ? { winner } : {}),
  });
  const front = frontPlatforms(map, node);
  return { exchange, yielded, ratio: fireRatio(a, d), mass: fireRatio(a, d, true), committed, manned: Math.min(1, d.total / front), sector: Math.min(1, (a.total * committed) / front) };
}

/** Platforms that fill a cell's front, one line of direct-fire weapons along its width. */
function frontPlatforms(map: GameMap, node: NodeId): number {
  return FRONTAGE_PLATFORMS() * (cellDepthKm(map, node) / CELL_FRONT_KM);
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

const isPressing = (f: Formation) => f.status === 'active' && f.kind === 'maneuver' && f.order.posture === 'attack';

/** `nation` takes control of an enemy-held cell. */
export function seize(world: World, ctx: SimContext, nation: NationId, node: NodeId): void {
  const from = world.control[node];
  if (!from || !atWar(world, nation, from)) return;
  const original = ctx.map.owner[node];
  // Liberated ground returns to its friendly pre-war owner.
  const to = original && original !== from && allied(world, nation, original) ? original : nation;
  world.control[node] = to;
  delete landSlice(world).fortified[node];
  ctx.emit({ type: 'node_captured', tick: world.tick, node, from, to });
}

/**
 * Cells on either side of a standing line of occupation (territory held by a
 * nation other than its owner, bordering ground its owner still holds), and the
 * cells behind them, start fully fortified: the 2023-25 Ukrainian and Russian
 * defensive belts, the Abkhazia and South Ossetia lines. So does the rest of the border between the
 * occupier and the occupied, which years of war have fortified too: Ukraine's
 * 2024-25 belts along the Sumy, Kharkiv and Chernihiv borders, Russia's in
 * Belgorod and Kursk. So does the Korean DMZ, held under arms since the 1953 armistice: the
 * ROK's forward barrier belts, anti-tank walls and minefields south of it, and the North's
 * fortified zone north of it. So does the India-Pakistan border and Line of Control: India's
 * 2003-04 LoC fence and bunker lines, Pakistan's ditch-cum-bund belts and canal defences in Punjab.
 */
const STANDING_BORDERS: readonly (readonly [NationId, NationId])[] = [
  ['KOR' as NationId, 'PRK' as NationId],
  ['IND' as NationId, 'PAK' as NationId],
];

function fortifyStandingLines(world: World, map: GameMap): void {
  const { fortified } = landSlice(world);
  const lines = new Set<string>();
  for (const [a, b] of STANDING_BORDERS) lines.add(`${a}|${b}`).add(`${b}|${a}`);
  for (let n = 0; n < map.landCount; n++) {
    const holder = world.control[n];
    if (holder && holder !== map.owner[n]) lines.add(`${holder}|${map.owner[n]}`).add(`${map.owner[n]}|${holder}`);
  }
  for (let n = 0; n < map.landCount; n++) {
    const a = world.control[n];
    if (!a) continue;
    for (const m of map.neighbors(n as NodeId)) {
      if (m >= map.landCount || !lines.has(`${a}|${world.control[m]}`)) continue;
      fortified[n] = 1;
      fortified[m] = 1;
    }
  }
  // Behind each line stand more belts, one cell deep here: Ukraine's 2024-25 rear lines from Pokrovsk through
  // Kostiantynivka to Sloviansk and around Zaporizhzhia, Russia's three-belt Surovikin line, the ROK's barrier lines
  // north of Seoul (ISW; CSIS; ROK MND).
  for (const n of Object.keys(fortified).map(Number))
    for (const m of map.neighbors(n as NodeId)) if (m < map.landCount && world.control[m] === world.control[n]) fortified[m] = 1;
}

/** Whether `nation`'s side reaches `node` only across a major river: it holds land next to the cell, and none of it joins the cell dry. */
function acrossRiver(world: World, map: GameMap, node: NodeId, nation: NationId): boolean {
  let near = false;
  for (let k = map.adjStart[node]; k < map.adjStart[node + 1]; k++) {
    const m = map.adj[k], holder = world.control[m];
    if (m >= map.landCount || !holder || !allied(world, nation, holder)) continue;
    if (!map.adjRiver[k]) return false;
    near = true;
  }
  return near;
}

/** Hostile manoeuvre units in cells next to `node`, whose fire covers it. */
function coveringFire(world: World, map: GameMap, byNode: Map<number, Formation[]>, node: NodeId, nation: NationId): Formation[] {
  const out: Formation[] = [];
  for (const m of map.neighbors(node))
    for (const f of byNode.get(m) ?? []) if (f.kind === 'maneuver' && f.status === 'active' && atWar(world, nation, f.nation)) out.push(f);
  return out;
}

/** Km/day a force presses through a defence at local odds `ratio`: infiltration at parity, the pace of a breakthrough from the deliberate-assault ratio up. */
function manoeuvreKmPerDay(ratio: number): number {
  const odds = Math.min(1, Math.max(0, (ratio - 1) / (DELIBERATE_ASSAULT_RATIO() - 1)));
  return COVERED_KM_PER_DAY() + (BREAKTHROUGH_KM_PER_DAY() - COVERED_KM_PER_DAY()) * odds;
}

/**
 * Km the attacker gains across a contested cell this tick, given who is still holding it, how the last battle
 * there went, and whether the attacker fights from a river bridgehead.
 */
function advanceKm(world: World, ctx: SimContext, node: NodeId, attackers: Formation[], defenders: Formation[], cover: Formation[], battle: BattleResult, river: boolean): number {
  const { moveCost } = TERRAIN[ctx.map.terrain[node]];
  const movers = attackers.filter((f) => isPressing(f) && mobility(world, f) > 0);
  if (!movers.length) return 0;
  const dtDays = world.dtHours / 24;
  // Mud and deep snow slow an advance as they slow a march: the 2023 and 2024 spring offensives waited on dry ground.
  const ground = groundFactorAt(world, ctx.map, node);
  // Unopposed: a road march through hostile ground (reconnaissance, obstacles, demolitions).
  const unopposed = (ground * Math.max(...movers.map((f) => marchKmPerDay(world, ctx.catalog, f)))) / (HOSTILE_GROUND_COST() * moveCost);
  if (!defenders.length && !cover.length) return unopposed * dtDays;
  const pace = ground * Math.max(...movers.map((f) => mobility(world, f))) * (river ? RIVER_TEMPO() : 1);
  const fort = landSlice(world).fortified[node] ?? 0;
  if (!defenders.length) {
    // An empty cell the line next door covers with fire: infiltrated at parity, broken through by a force that outweighs that line.
    // A belt of obstacles no garrison covers only delays (FM 3-90: an obstacle not covered by fire is not an obstacle).
    const { closed } = TERRAIN[ctx.map.terrain[node]];
    const side = (fs: Formation[]) => summarize(world, ctx.catalog, { nation: fs[0].nation, fighters: fs, support: [] }, node, closed);
    const mine = side(movers);
    const ratio = fireRatio(mine, side(cover), true);
    const sector = Math.min(1, mine.total / frontPlatforms(ctx.map, node));
    // Infiltration moves only the sector the force fills. Cover too weak to matter is no cover: from the deliberate-assault ratio to
    // the massed one the pace climbs to the road march across the whole cell.
    const exploit = Math.min(1, Math.max(0, (ratio - DELIBERATE_ASSAULT_RATIO()) / (MASSED_ASSAULT_RATIO() - DELIBERATE_ASSAULT_RATIO())));
    const covered = (sector * pace * manoeuvreKmPerDay(ratio)) / moveCost;
    return Math.max(covered, (1 - exploit) * covered + exploit * pace * unopposed) * (1 - BELT_DRAG() * fort) * dtDays;
  }
  if (defenders.every((f) => f.status === 'routed')) return ((pace * BREAKTHROUGH_KM_PER_DAY()) / moveCost) * dtDays;
  const attrition = Math.min(ATTRITION_MAX_KM_PER_DAY(), ATTRITION_KM_PER_DAY() * Math.max(0, Math.log(battle.exchange)));
  // A line too thin for its cell is bypassed through its gaps at the pace the odds allow, unless a standing belt of obstacles closes them; a unit's own dug positions and hasty obstacles close part.
  const dug = defenders.reduce((t, f) => t + f.entrenchment, 0) / defenders.length;
  const gaps = (1 - battle.manned) * (1 - Math.max(fort, HASTY_BARRIER() * dug));
  const manoeuvre = battle.ratio > 1 ? manoeuvreKmPerDay(battle.ratio) : 0;
  // Mass beyond the deliberate-assault ratio breaks even a manned line on a narrow sector and rolls it up from there. A belt slows
  // that, a city absorbs it block by block, and a dug-in line's kill zone lets only part of the mass through at once: in 2024-25 the
  // drone-watched front held Russia's best-massed drives to 1-4 km a day (ISW), where air superiority let 1991's armour through.
  const breach = Math.min(1, Math.max(0, (battle.mass - DELIBERATE_ASSAULT_RATIO()) / (MASSED_ASSAULT_RATIO() - DELIBERATE_ASSAULT_RATIO())));
  const open = (battle.committed - KILL_ZONE_COMMIT()) / (1 - KILL_ZONE_COMMIT());
  const penetration = breach * (COVERED_KM_PER_DAY() + (BREAKTHROUGH_KM_PER_DAY() - COVERED_KM_PER_DAY()) * open) * (1 - BELT_DRAG() * fort);
  const urban = ctx.map.terrain[node] === 'urban' ? URBAN_MANOEUVRE() : 1;
  const rate = Math.max(attrition, (urban * Math.max(gaps * manoeuvre, penetration)) / moveCost);
  return battle.sector * pace * (rate * dtDays + (battle.yielded ? WITHDRAWAL_KM() : 0));
}

/**
 * Fight for a cell an enemy has entered, and move the attacker's line across
 * it. Control changes hands only when the advance has crossed the cell.
 */
function contestCell(world: World, ctx: SimContext, node: NodeId, invaders: Formation[], byNode: Map<number, Formation[]>, firing: Set<FormationId>, engaged: Set<FormationId>): void {
  const slice = landSlice(world);
  const lead = (invaders.find((f) => f.kind === 'maneuver') ?? invaders[0]).nation;
  const attackers = invaders.filter((f) => allied(world, lead, f.nation));
  let contest = slice.contest[node];
  if (!contest || !allied(world, lead, contest.by)) contest = slice.contest[node] = { by: lead, km: 0 };

  const defenders = hostilesAt(world, byNode, node, lead);
  let battle: BattleResult = { exchange: 1, yielded: false, ratio: 1, mass: 1, committed: 1, manned: 1, sector: 1 };
  const river = acrossRiver(world, ctx.map, node, lead);
  if (defenders.length) {
    for (const f of [...attackers, ...defenders]) {
      firing.add(f.id);
      if (!(f.id in slice.baseline)) slice.baseline[f.id] = platformCount(f);
    }
    const defNation = defenders[0].nation;
    const att: Side = { nation: lead, fighters: attackers, support: artillerySupport(world, ctx, node, lead, byNode, firing) };
    const def: Side = { nation: defNation, fighters: defenders, support: artillerySupport(world, ctx, node, defNation, byNode, firing) };
    battle = resolveBattle(world, ctx, node, att, def, byNode, engaged, attackers.some(isPressing) ? { kind: 'assault', river } : { kind: 'positional', attNode: node });
  }
  const holdingOn = defenders.filter((f) => f.status !== 'destroyed' && f.node === node);
  const stillIn = attackers.filter((f) => f.status !== 'destroyed' && f.node === node);
  const cover = holdingOn.length ? [] : coveringFire(world, ctx.map, byNode, node, lead);
  contest.km += advanceKm(world, ctx, node, stillIn, holdingOn, cover, battle, river);
  if (contest.km < cellDepthKm(ctx.map, node)) return;

  delete slice.contest[node];
  seize(world, ctx, lead, node);
  for (const f of holdingOn) retreat(world, ctx, f, node, byNode);
  for (const f of stillIn) if (!f.order.path?.length) f.order = { posture: 'defend', issuedTick: world.tick };
}

/**
 * Lines in contact trade fire every day even where no one is assaulting: each
 * idle manoeuvre group engages the first idle hostile group across a cell
 * boundary.
 */
function lineOfContact(world: World, ctx: SimContext, byNode: Map<number, Formation[]>, firing: Set<FormationId>, engaged: Set<FormationId>): void {
  const { map } = ctx;
  const idle = (n: number, side: NationId) =>
    (byNode.get(n) ?? []).filter((f) => f.kind === 'maneuver' && f.status === 'active' && !firing.has(f.id) && allied(world, side, f.nation));
  for (const node of [...byNode.keys()]) {
    const holder = world.control[node];
    if (!holder) continue;
    const mine = idle(node, holder);
    if (!mine.length) continue;
    for (const m of map.neighbors(node as NodeId)) {
      const foe = world.control[m];
      if (m >= map.landCount || !foe || !atWar(world, holder, foe)) continue;
      const theirs = idle(m, foe);
      if (!theirs.length) continue;
      for (const f of [...mine, ...theirs]) firing.add(f.id);
      const att: Side = { nation: holder, fighters: mine, support: artillerySupport(world, ctx, m, holder, byNode, firing) };
      const def: Side = { nation: foe, fighters: theirs, support: artillerySupport(world, ctx, node as NodeId, foe, byNode, firing) };
      resolveBattle(world, ctx, m, att, def, byNode, engaged, { kind: 'positional', attNode: node as NodeId });
      break;
    }
  }
}

export const landCombat: System = {
  id: 'landCombat',
  init(world, ctx) {
    landSlice(world).origin = world.control.slice(0, ctx.map.landCount);
    fortifyStandingLines(world, ctx.map);
  },
  step(world, ctx) {
    const slice = landSlice(world);
    const byNode = indexByNode(world, ctx.map);
    const engaged = new Set<FormationId>();
    const firing = new Set<FormationId>();

    // The main effort is fought first, so the guns next to it fire for it rather than for whichever fight comes up first.
    const pressing = (node: number) => (byNode.get(node) ?? []).reduce((t, f) => t + (isPressing(f) && atWar(world, f.nation, world.control[node]) ? platformCount(f) : 0), 0);
    const effort = [...byNode.keys()].map((node) => [node, pressing(node)]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    for (const [node] of effort) {
      const holder = world.control[node];
      const invaders = holder ? (byNode.get(node) ?? []).filter((f) => atWar(world, f.nation, holder)) : [];
      if (invaders.length) contestCell(world, ctx, node as NodeId, invaders, byNode, firing, engaged);
    }
    for (const key of Object.keys(slice.contest)) {
      const node = Number(key), c = slice.contest[node];
      if (!(byNode.get(node) ?? []).some((f) => allied(world, c.by, f.nation) && atWar(world, f.nation, world.control[node]))) delete slice.contest[node];
    }
    lineOfContact(world, ctx, byNode, firing, engaged);
    for (const id of Object.keys(slice.baseline) as FormationId[]) if (!engaged.has(id)) delete slice.baseline[id];

    updateEncirclement(world, ctx);
  },
};
