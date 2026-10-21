import { atWar as isAtWar } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, NationId, NodeId, PlatformClass, PlatformId } from '../../core/types';
import { liftShare } from '../naval/amphibious';
import { geography, sameWaters, seaNeighbour } from '../naval/geography';
import { sailable } from '../naval/movement';
import { boardable } from '../naval/orders';
import { compose, fleetLosses } from '../naval/state';
import { dominant, isGround, issue, sighted } from './forces';
import { enemyPowerAt, landMass } from './fronts';
import { reachKm } from './strikes';
import type { Plan } from './types';

/** Nearest sea zone to a node, breadth-first; chokepoints often fall on a land cell at 1-degree resolution. */
export function nearestSea(map: GameMap, from: NodeId): NodeId {
  if (map.isSea(from)) return from;
  const seen = new Set<number>([from]);
  const queue = [from as number];
  for (let i = 0; i < queue.length && i < 2000; i++) {
    for (let k = map.adjStart[queue[i]]; k < map.adjStart[queue[i] + 1]; k++) {
      const m = map.adj[k];
      if (map.isSea(m as NodeId)) return m as NodeId;
      if (!seen.has(m)) { seen.add(m); queue.push(m); }
    }
  }
  return from;
}

interface Choke { node: NodeId; users: Set<string>; shores: Set<NationId> }
const chokeCache = new WeakMap<GameMap, Choke[]>();
/** Chokepoint sea zones, with the nations whose trade or energy passes each and the states whose shores form the passage. */
function chokepoints(map: GameMap): Choke[] {
  let c = chokeCache.get(map);
  if (!c) {
    c = geography(map).chokepoints.flatMap(({ def, nodes }) => {
      const users = new Set([...Object.keys(def.general), ...Object.keys(def.energy)]);
      const shores = new Set<NationId>();
      for (const [la, lo] of def.points) {
        const n = map.nodeAt(la, lo);
        for (const m of [n, ...map.neighbors(n)]) if (!map.isSea(m)) shores.add(map.owner[m]);
      }
      return nodes.map((node) => ({ node, users, shores }));
    });
    chokeCache.set(map, c);
  }
  return c;
}

/** Own seaborne trade interdicted, and distance of an enemy warship from a strait, at which its shore state closes it. */
const CLOSURE = { tradeBlocked: 0.25, fleetKm: 1000 };

/**
 * A shore state at war closes the passage it commands, whoever's trade runs through it, once
 * its own exports are cut or an enemy navy operates off it: the world's shipping is its
 * leverage. In the 1980-88 Tanker War Iran began attacking Gulf shipping after Iraq struck its
 * oil exports at Kharg (1984) and mined the Gulf once the US Navy escorted reflagged Kuwaiti
 * tankers (1987-88); "if Iran's oil cannot be exported, no country's oil will be" (Rouhani, July
 * 2018; ONI, "Iran's Naval Forces", 2017). Thresholds are judgment.
 */
function coerciveClosure(p: Plan, c: Choke): boolean {
  if (!c.shores.has(p.nation)) return false;
  if ((p.world.theater.tradeBlocked[p.nation] ?? 0) >= CLOSURE.tradeBlocked) return true;
  for (const e of p.enemies)
    for (const f of p.index.byNation.get(e) ?? [])
      if ((f.kind === 'surface_group' || f.kind === 'submarine') && f.status === 'active' && p.ctx.map.distanceKm(f.node, c.node) <= CLOSURE.fleetKm) return true;
  return false;
}

const coastCache = new WeakMap<GameMap, NodeId[]>();
/** Land cells that touch the sea: every possible beach. */
function coast(map: GameMap): NodeId[] {
  let c = coastCache.get(map);
  if (!c) {
    c = [];
    for (let n = 0; n < map.landCount; n++) if (seaNeighbour(map, n as NodeId) !== undefined) c.push(n as NodeId);
    coastCache.set(map, c);
  }
  return c;
}

type NavalRole = 'ssbn' | 'submarine' | 'capital' | 'lift' | 'escort' | 'raider';
const NAVAL_ROLE: Partial<Record<PlatformClass, NavalRole>> = {
  ssbn: 'ssbn',
  ssn: 'submarine', ssk: 'submarine', ssgn: 'submarine', uuv: 'submarine',
  carrier: 'capital', amphibious: 'capital',
  cruiser: 'escort', destroyer: 'escort', frigate: 'escort', corvette: 'escort', patrol: 'escort', mine_warfare: 'escort', usv: 'raider',
};
const PRIORITY: NavalRole[] = ['ssbn', 'capital', 'submarine', 'escort', 'raider'];

function roleOf(p: Plan, f: Formation, liftCapable: boolean): NavalRole | undefined {
  if (liftCapable) return 'lift';
  const counts = dominant(f, p.ctx.catalog, (c) => NAVAL_ROLE[c as PlatformClass]);
  return PRIORITY.find((r) => counts.has(r));
}

/**
 * Lift crosses only inside land-based air cover and a day's steaming of the embarkation
 * port. The Taiwan Strait is 130-180 km wide and every PLA invasion study (CMPR 2024, CSIS
 * 2023, RAND) stages from Fujian and Zhejiang ports under that cover. Judgement call.
 */
const ASSAULT_RANGE_KM = 600;
/** Ground troops staged at the port per trooper of lift, so the next wave is ready when the ships return. */
const STAGE_WAVES = 2;
/** A lift group sails once this share of its capacity is aboard, or when nobody else is waiting. */
const SAIL_LOAD = 0.9;
/** Submarines this close to the maritime focus go there instead of to distant chokepoints (a few days' transit). */
const FOCUS_SUB_KM = 3000;

/** A cross-sea assault on an enemy-held landmass, rederived from the world every tasking pass. */
interface Assault {
  /** Coastal cell to land on: enemy-held, or a lodgement already held on the far shore. */
  beach: NodeId;
  /** Sea zone off the beach, where the lift and its escorts must hold the sea. */
  zone: NodeId;
  /** Own port where troops board. */
  port: NodeId;
}

/**
 * Whether and where this nation mounts an amphibious assault: only on enemy land it cannot
 * reach by land, within ASSAULT_RANGE_KM of an own port and of a war aim, and only with lift.
 * A held lodgement is reinforced before any new beach is opened; otherwise the beach trades
 * off the pull of war aims against the defenders on and next to it, as the land planner does.
 */
function planAssault(p: Plan, lifts: Formation[]): Assault | undefined {
  if (!lifts.length) return undefined;
  const { map } = p.ctx;
  const { world } = p;
  const mass = landMass(map);
  const home = mass[world.nations[p.nation].capital];
  const ports = geography(map).ports.filter((pt) => world.control[pt.node] === p.nation && mass[pt.node] === home);
  if (!ports.length) return undefined;
  // A landing must open a road to something worth taking: a war aim on the same far shore.
  const aims = p.ai.aims[p.nation] ?? [];
  const aimsOn = new Map<number, NodeId[]>();
  for (const o of aims) if (mass[o.node] !== home) (aimsOn.get(mass[o.node]) ?? aimsOn.set(mass[o.node], []).get(mass[o.node])!).push(o.node);
  if (!aimsOn.size) return undefined;

  const own = p.index.byNation.get(p.nation) ?? [];
  let unit = 0, k = 0;
  for (const f of own) if (isGround(f)) { unit += p.index.power(f); k++; }
  unit = k ? unit / k : 1;
  const pull = (t: NodeId) => {
    let best = 0;
    for (const o of aims) best = Math.max(best, o.value / (1 + map.distanceKm(t, o.node) / 300));
    return best;
  };
  const defence = (t: NodeId) => {
    let d = enemyPowerAt(t, p.index, p.enemies);
    for (let j = map.adjStart[t]; j < map.adjStart[t + 1]; j++) if (map.adj[j] < map.landCount) d += 0.5 * enemyPowerAt(map.adj[j], p.index, p.enemies);
    return d;
  };

  const near = (a: NodeId, b: NodeId) => Math.abs(map.lat[a] - map.lat[b]) * 111 <= ASSAULT_RANGE_KM && map.distanceKm(a, b) <= ASSAULT_RANGE_KM;
  let best: Assault | undefined, bestScore = 0;
  for (const n of coast(map)) {
    const targets = aimsOn.get(mass[n]);
    if (!targets) continue;
    const holder = world.control[n];
    const lodgement = holder === p.nation;
    if (!lodgement && !p.enemies.has(holder)) continue;
    if (!targets.some((o) => near(o, n))) continue;
    let port = ports[0], km = Infinity;
    for (const pt of ports) {
      if (Math.abs(map.lat[pt.node] - map.lat[n]) * 111 > ASSAULT_RANGE_KM || !sameWaters(map, pt.node, seaNeighbour(map, n)!)) continue;
      const d = map.distanceKm(pt.node, n);
      if (d < km) { km = d; port = pt; }
    }
    if (km > ASSAULT_RANGE_KM) continue;
    const score = (lodgement ? 100 : 1) * (1 + pull(n)) / (1 + defence(n) / unit) / (1 + km / 300);
    if (score > bestScore) { bestScore = score; best = { beach: n, zone: seaNeighbour(map, n)!, port: port.node }; }
  }
  return best;
}

/**
 * Where this nation's fleet concentrates: the assault zone when invading; otherwise the sea
 * zone holding the enemy surface fleet that most threatens friendly soil (value of its hulls
 * over distance to the nearest friendly capital), so a defender's allies converge on an
 * invasion fleet; failing both, off the main land front or in home waters. `enemyFleet` says
 * whether there is an enemy fleet at sea to fight.
 */
function maritimeFocus(p: Plan, assault: Assault | undefined): { node: NodeId; enemyFleet: boolean } {
  const { map } = p.ctx;
  if (assault) return { node: assault.zone, enemyFleet: true };
  const capitals = [...p.friends].map((n) => p.world.nations[n].capital);
  let best: NodeId | undefined, bestScore = 0;
  for (const e of p.enemies)
    for (const { f, node } of sighted(p, e)) {
      // Boats ashore in a port cell (shore-launched USVs) are struck from the air, not hunted at sea.
      if (f.kind !== 'surface_group' || !map.isSea(node)) continue;
      let value = 0;
      for (const [pid, n] of Object.entries(f.equipment)) value += n * p.ctx.catalog.platform(pid as PlatformId).unitCostUsdM;
      let d = Infinity;
      for (const c of capitals) d = Math.min(d, map.distanceKm(node, c));
      const score = value / (1 + d / 500);
      if (score > bestScore) { bestScore = score; best = node; }
    }
  if (best !== undefined) return { node: nearestSea(map, best), enemyFleet: true };
  return { node: nearestSea(map, p.sectors.length ? p.sectors[0].key : p.world.nations[p.nation].capital), enemyFleet: false };
}

/**
 * Recent hull losses (fleetLosses, fading over three months) at which a fleet stops sending its
 * groups out when there is no enemy fleet to fight: losses to shore missiles and drones buy
 * nothing, so the fleet stays in its home waters as a fleet in being. One ship lost in the last
 * two months is enough: after Moskva sank in April 2022 the Black Sea Fleet pulled back from the
 * northwestern Black Sea, and from 2023 it operated from Novorossiysk (UK MoD, ISW).
 */
const WITHDRAW_LOSSES = 0.5;

/** Home ports of this nation's fleets that lost WITHDRAW_LOSSES hulls recently. */
function batteredFleets(p: Plan, groups: Formation[]): Set<NodeId> {
  const out = new Set<NodeId>();
  for (const g of groups) if (fleetLosses(p.world, p.nation, g.home) >= WITHDRAW_LOSSES) out.add(g.home);
  return out;
}

/**
 * Where carriers hold station when the focus lies off an enemy coast: sea zones up to two
 * zones (~300-600 km) from the focus, farthest from enemy-held shore first, outside the
 * densest land-based missile and fighter coverage. CSIS 2023 kept US carriers east of Taiwan
 * and still lost two in the base case; the carriers fought by aircraft, not in the strait.
 * Capital groups pair off, one pair to a zone, as in the USN's dual-carrier operations in the
 * Philippine and South China Seas in 2020-24, rather than stacking every carrier in one zone
 * whose escorts would then pool every interceptor against each salvo (judgment).
 */
function standoffZones(p: Plan, focus: NodeId): NodeId[] {
  const { map } = p.ctx;
  const hostileShore = coast(map).filter((n) => p.enemies.has(p.world.control[n]));
  if (!hostileShore.length) return [focus];
  const clearance = (z: NodeId) => {
    let d = Infinity;
    for (const n of hostileShore) if (Math.abs(map.lat[n] - map.lat[z]) * 111 < d) d = Math.min(d, map.distanceKm(n, z));
    return d;
  };
  const zones: { z: NodeId; d: number }[] = [{ z: focus, d: clearance(focus) }];
  let ring: NodeId[] = [focus];
  const seen = new Set<number>(ring);
  for (let depth = 0; depth < 2; depth++) {
    const next: NodeId[] = [];
    for (const z of ring)
      for (const m of map.neighbors(z)) {
        if (!map.isSea(m) || seen.has(m)) continue;
        seen.add(m);
        next.push(m);
        zones.push({ z: m, d: clearance(m) });
      }
    ring = next;
  }
  return zones.sort((a, b) => b.d - a.d || a.z - b.z).map((x) => x.z);
}

/**
 * Where attack submarines wait when the focus holds an enemy fleet: the sea zone next to it
 * farthest from hostile shore, away from the enemy's home-water ASW, from which nuclear boats
 * run in, attack and withdraw (naval combat lets them strike groups one zone over). A submarine
 * that stays among the massed escorts of an invasion fleet is found by area search sooner or
 * later; SSNs attack from the edges of a screen and clear the datum (judgment).
 */
function submarineStation(map: GameMap, focus: NodeId, standoff: NodeId[]): NodeId {
  const next = new Set<number>(map.neighbors(focus));
  return standoff.find((z) => next.has(z)) ?? focus;
}

/**
 * Lift groups shuttle troops from the embarkation port to the beach: sail to the port, load
 * staged formations (oversized ones board as landing teams), sail at SAIL_LOAD, land, return.
 * Ground formations nearest the port are staged there for STAGE_WAVES loads ahead.
 */
function runAssault(p: Plan, a: Assault, lifts: Formation[]): void {
  const { map, catalog } = p.ctx;
  const { world } = p;
  const portZone = geography(map).portZone.get(a.port);
  const aboard = new Map<FormationId, Formation[]>();
  for (const f of Object.values(world.formations))
    if (f.nation === p.nation && f.status === 'embarked' && f.embarkedOn) (aboard.get(f.embarkedOn) ?? aboard.set(f.embarkedOn, []).get(f.embarkedOn)!).push(f);

  const mass = landMass(map);
  const home = mass[a.port];
  const theatres = new Set(p.sectors.map((s) => mass[s.key]));
  const ground = (p.index.byNation.get(p.nation) ?? [])
    .filter((f) => isGround(f) && f.status === 'active' && !map.isSea(f.node) && mass[f.node] === home && !theatres.has(home))
    .map((f) => ({ f, km: map.distanceKm(f.node, a.port) }))
    .sort((x, y) => x.km - y.km || (x.f.id < y.f.id ? -1 : 1));
  const waiting = ground.filter((g) => g.f.node === a.port).map((g) => g.f);

  let liftTroops = 0;
  for (const l of lifts) liftTroops += compose(l, catalog).troopLift;
  let staged = 0;
  for (const { f } of ground) {
    if (staged >= STAGE_WAVES * liftTroops) break;
    staged += f.personnel;
    if (f.node !== a.port) issue(p, f, { posture: 'move', target: a.port });
  }

  const boarding = new Set<Formation>();
  for (const l of lifts) {
    if (l.order.posture === 'reserve') continue;
    const comp = compose(l, catalog);
    const on = aboard.get(l.id) ?? [];
    let load = 0;
    for (const f of on) load += liftShare(catalog, f, comp);
    const atPort = l.node === a.port || l.node === portZone;
    const pending = waiting.filter((f) => !boarding.has(f));
    if (on.length && (load >= SAIL_LOAD || !pending.length || !atPort)) {
      issue(p, l, { posture: 'attack', target: a.beach });
      continue;
    }
    // 'patrol', not 'move': a lift group ordered to move to a land cell unloads there.
    issue(p, l, { posture: 'patrol', target: a.port });
    if (!atPort) continue;
    for (const f of pending) {
      if (load >= SAIL_LOAD) break;
      if (!boardable(1 - load, liftShare(catalog, f, comp))) continue;
      p.out.push({ type: 'order', nation: p.nation, formation: f.id, order: { posture: 'embark', targetFormation: l.id } });
      boarding.add(f);
      load += liftShare(catalog, f, comp);
    }
  }
}

/**
 * Readiness below which a group is in a shipyard availability and cannot sail: a carrier in
 * refuelling overhaul (about four years) or a docking availability. Under the US Navy's Optimized
 * Fleet Response Plan a ship in its maintenance phase is not surge-ready; one in the basic phase
 * between deployments is (GAO-21-366, 2021). The threshold is judgment: it separates the yard
 * availabilities in the orders of battle (0.05-0.2) from ships working up (0.4 and above).
 */
const SEAWORTHY = 0.25;

/**
 * Naval groups: SSBNs hold a bastion in home waters; a nation able to invade across the sea
 * shuttles troops in its lift groups; carriers concentrate on the maritime focus, standing off
 * from a hostile shore unless covering their own landing; attack
 * submarines near the focus hunt there and the rest blockade the chokepoints enemy trade
 * and fleets must pass; escorts screen lift groups first, then carriers, one each, and
 * otherwise blockade or patrol the focus.
 */
export function planNaval(p: Plan): void {
  const { map } = p.ctx;
  const km = (a: number, b: number) => map.distanceKm(a as NodeId, b as NodeId);
  const groups = (p.index.byNation.get(p.nation) ?? []).filter((f) => (f.kind === 'surface_group' || f.kind === 'submarine') && f.status === 'active' && f.readiness >= SEAWORTHY);
  if (!groups.length) return;
  const liftCapable = groups.filter((g) => g.kind === 'surface_group' && compose(g, p.ctx.catalog).troopLift > 0);
  const assault = planAssault(p, liftCapable);
  const { node: focus, enemyFleet } = maritimeFocus(p, assault);
  const stations = assault ? [focus] : standoffZones(p, focus);
  const subStation = enemyFleet && !assault ? submarineStation(map, focus, stations) : focus;
  let capitals = 0;
  const inPort = enemyFleet ? new Set<NodeId>() : batteredFleets(p, groups);
  // A belligerent may not fight in neutral waters, so it blockades only passages a party to the war borders (San Remo Manual 1994, paras 14-16).
  const enemyChokes = chokepoints(map).filter(
    (c) => ([...c.users].some((u) => p.enemies.has(u as NationId)) && [...c.shores].some((n) => p.enemies.has(n) || p.friends.has(n))) || coerciveClosure(p, c),
  );
  const claimed = new Map<NodeId, number>();
  const atWar = [...p.enemies].some((e) => isAtWar(p.world, p.nation, e));
  // A fleet in a closed sea (the Caspian Flotilla, a Black Sea squadron with the Straits shut to it)
  // fights where open water takes it; a station it cannot reach falls back to its home waters.
  const sails = (g: Formation, n: NodeId) => sailable(p.world, map, g, n);
  const patrol = (g: Formation, target: NodeId) => issue(p, g, { posture: 'patrol', target: sails(g, target) ? target : nearestSea(map, g.home) });

  const blockade = (f: Formation): boolean => {
    const range = reachKm(p, f);
    let best: NodeId | undefined, bestScore = Infinity;
    for (const c of enemyChokes) {
      const d = km(f.node, c.node);
      if (d > range || !sails(f, c.node)) continue;
      const score = d * (1 + (claimed.get(c.node) ?? 0));
      if (score < bestScore) { bestScore = score; best = c.node; }
    }
    if (best === undefined) return false;
    claimed.set(best, (claimed.get(best) ?? 0) + 1);
    // Before war a group only takes station: a blockade posture lays mines and interdicts trade.
    issue(p, f, { posture: atWar ? 'blockade' : 'patrol', target: best });
    return true;
  };

  const lift = new Set(liftCapable);
  const roles = new Map(groups.map((g) => [g, roleOf(p, g, lift.has(g))]));
  if (assault) runAssault(p, assault, liftCapable.filter((l) => sails(l, assault.port)));
  const unescorted = [...(assault ? liftCapable.filter((g) => g.order.posture !== 'reserve') : []), ...groups.filter((g) => roles.get(g) === 'capital')];
  for (const g of groups) {
    // Groups with no fighting role (sealift) sail under naval/sealift.ts.
    if (!roles.get(g)) continue;
    // Before entering a war only submarines deploy: quiet, they take station unseen, while surface
    // groups sent forward would sit in the enemy's opening salvo (judgment).
    if (!atWar && roles.get(g) !== 'submarine') continue;
    if (inPort.has(g.home) && roles.get(g) !== 'raider' && roles.get(g) !== 'ssbn') {
      issue(p, g, { posture: 'patrol', target: nearestSea(map, g.home) });
      continue;
    }
    switch (roles.get(g)) {
      case 'ssbn':
        issue(p, g, { posture: 'patrol', target: nearestSea(map, g.home) });
        break;
      case 'submarine':
        if (km(g.node, focus) <= FOCUS_SUB_KM) patrol(g, subStation);
        else if (!blockade(g)) patrol(g, subStation);
        break;
      case 'capital':
        patrol(g, stations[(capitals++ >> 1) % stations.length]);
        break;
      // Without a landing to make, amphibious groups stay out of the missile zone in home waters.
      case 'lift':
        if (!assault) issue(p, g, { posture: 'patrol', target: nearestSea(map, g.home) });
        break;
      // Strike USVs are launched from shore at targets within their range; they do not keep the sea.
      case 'raider':
        issue(p, g, { posture: 'defend', target: g.home });
        break;
      case 'escort': {
        let ward: Formation | undefined, bestD = Infinity;
        for (const c of unescorted) {
          const d = km(g.node, c.node);
          if (d < bestD && sails(g, c.node)) { bestD = d; ward = c; }
        }
        if (ward) {
          unescorted.splice(unescorted.indexOf(ward), 1);
          issue(p, g, { posture: 'escort', targetFormation: ward.id });
        } else if (!blockade(g)) patrol(g, focus);
        break;
      }
    }
  }
}
