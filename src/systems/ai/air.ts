import type { Formation, FormationId, Munition, MunitionId, NodeId, PlatformClass, PlatformId, TargetClass } from '../../core/types';
import { ferryKm, visibility } from '../air';
import { TUNING } from '../air/tables';
import { dominant, issue } from './forces';
import { arsenal, FireBudget, pickTarget, pkAgainst, SamCover, reachKm, strikeOptions, withinKm, type StrikeTarget, type TargetGrid } from './strikes';
import type { Plan } from './types';

type AirRole = 'fighter' | 'multirole' | 'strike' | 'support';

const AIR_ROLE: Partial<Record<PlatformClass, AirRole>> = {
  fighter: 'fighter',
  multirole: 'multirole',
  attack_aircraft: 'strike',
  bomber: 'strike',
  stealth_bomber: 'strike',
  strike_drone: 'strike',
  loitering_munition_launcher: 'strike',
  attack_helo: 'strike',
  awacs: 'support',
  tanker: 'support',
  ew_aircraft: 'support',
  isr_drone: 'support',
  maritime_patrol: 'support',
  transport_aircraft: 'support',
  transport_helo: 'support',
  asw_helo: 'support',
};

/**
 * Closest a strike wing forward-deploys to the target it flies against: beyond SRBM and
 * tactical-aircraft reach. CSIS's 2023 Taiwan wargame flew LRASM-armed bombers from bases
 * outside the first island chain (Guam, Australia) and from the continental US with tankers.
 */
const STANDOFF_BASE_KM = 1500;

/**
 * Basing for fighters sent to a war. A cell's airfields take AIRCRAFT_PER_AIRFIELD aircraft each:
 * Kadena bases about 100 combat aircraft and Misawa about 50 in peacetime and surged to roughly
 * twice that in the 1991 and 2003 build-ups (judgment). Fighters base where the fight is within
 * REACH_SHARE of their radius, leaving fuel to loiter, and as far back from it as that allows:
 * CSIS's 2023 Taiwan wargames lost most US aircraft on ramps inside PLARF range, so the closer
 * base buys nothing but exposure. A nation sends at most COMMIT_SHARE of its fighters to its
 * wars and holds the rest at home (the US kept about half its fighter force out of Desert Storm,
 * judgment).
 */
const BASING = { aircraftPerAirfield: 150, reachShare: 0.8, commitShare: 0.5, minFromFightKm: 150 };

function roleOf(p: Plan, f: Formation): AirRole | undefined {
  let best: AirRole | undefined, n = 0;
  for (const [role, count] of dominant(f, p.ctx.catalog, (c) => AIR_ROLE[c as PlatformClass])) if (count > n) { n = count; best = role; }
  return best;
}

/**
 * Air wings: fighters contest the air over the fronts, most threatened and
 * enemy-held skies first; multiroles join them while the enemy holds the air
 * over a front in reach and strike otherwise; bombers and drones strike
 * (see strikes.ts for target order); support aircraft orbit the main front.
 */
export function planAir(p: Plan, targets: TargetGrid): void {
  const { map } = p.ctx;
  const km = (a: number, b: number) => map.distanceKm(a as NodeId, b as NodeId);
  const wings = (p.index.byNation.get(p.nation) ?? []).filter((f) => f.kind === 'air_wing' && f.status === 'active');
  if (!wings.length) return;
  const keys = p.sectors.map((s) => s.key);
  const enemySky = (n: NodeId) => {
    const c = p.world.theater.airControl[n];
    return !!c && p.enemies.has(c.nation);
  };
  const cover = new Map<NodeId, number>(keys.map((k) => [k, 0]));
  const budget = new FireBudget(p);
  const sams = new SamCover(p);
  let fields: NodeId[] | undefined;
  const airfields = () => (fields ??= friendlyAirfields(p));
  const fighters = wings.filter((w) => roleOf(p, w) === 'fighter').length;
  // Sweeps, strike packages and basing are planned with the tanker support the nation can lay on;
  // the air system then works out each day's actual radius from tanker sorties in range.
  const tanked = wings.some((w) => Object.entries(w.equipment).some(([id, n]) => n > 0 && p.ctx.catalog.platform(id as PlatformId).class === 'tanker')) ? 1 + TUNING.maxTankerExtension : 1;
  const rebase = rebasing(p, wings, keys, targets, airfields, tanked);

  const airSuperiority = (w: Formation, radius: number): boolean => {
    let best: NodeId | undefined, bestScore = -Infinity;
    for (const k of keys) {
      if (km(w.node, k) > radius) continue;
      const score = (enemySky(k) ? 2 : 1) - cover.get(k)!;
      if (score > bestScore) { bestScore = score; best = k; }
    }
    // With no land front at all (a war across a strait or a gulf), fighters sweep the enemy ground the strikes go for.
    if (!keys.length)
      for (const t of targets.near(w.node, radius)) {
        if (map.isSea(t.node) || !p.enemies.has(p.world.control[t.node]) || km(w.node, t.node) > radius) continue;
        const score = t.value / (1 + (cover.get(t.node) ?? 0));
        if (score > bestScore) { bestScore = score; best = t.node; }
      }
    if (best === undefined) return false;
    cover.set(best, (cover.get(best) ?? 0) + 1);
    issue(p, w, { posture: 'air_superiority', target: best });
    return true;
  };
  /**
   * A strike goes in with the aircraft that carry the weapon, so each weapon reaches as far as
   * the longest-legged type loading it, not the wing's shortest: the air system flies each type
   * to its own radius. A naval strike brigade's H-6Js take YJ-12s past the JH-7As' reach.
   */
  const weaponReach = (w: Formation, radius: number, tanking: number) => {
    const legs = new Map<MunitionId, number>();
    for (const pl of strikersOf(p, w)) for (const l of pl.loadout) legs.set(l.munition, Math.max(legs.get(l.munition) ?? 0, pl.mobility.rangeKm * tanking));
    return (m: Munition) => (legs.get(m.id) ?? radius) + m.rangeKm;
  };
  const strike = (w: Formation, radius: number): boolean => {
    const stock = arsenal(p, w);
    const vis = visibility(Math.min(...strikersOf(p, w).map((pl) => pl.protection.stealth)));
    const reach = weaponReach(w, radius, tanked);
    const canHit = (t: StrikeTarget) => {
      for (const m of stock) if (pkAgainst(m, t) > 0 && withinKm(map, w.node, t.at ?? t.node, reach(m)) && sams.clear(w.node, t.node, m.rangeKm, vis)) return true;
      return hasFirepower(p, w, t.cls) && withinKm(map, w.node, t.at ?? t.node, radius) && sams.clear(w.node, t.node, 0, vis);
    };
    const t = pickTarget(targets.near(w.node, stock.reduce((best, m) => Math.max(best, reach(m)), radius)), canHit);
    if (!t) return false;
    const order = { posture: 'strike' as const, target: t.node, targetClass: t.cls, targetFormation: t.formation };
    budget.propose(w, strikeOptions(stock, t).filter((m) => withinKm(map, w.node, t.at ?? t.node, reach(m))), t, order);
    return true;
  };

  for (const w of wings) {
    const radius = reachKm(p, w);
    switch (roleOf(p, w)) {
      case 'fighter':
        if (!airSuperiority(w, radius * tanked)) rebase(w, radius * tanked);
        break;
      case 'multirole': {
        const contested = keys.some((k) => enemySky(k) && km(w.node, k) <= radius);
        if ((contested || fighters < keys.length) && airSuperiority(w, radius * tanked)) break;
        if (!strike(w, radius * tanked)) rebase(w, radius * tanked);
        break;
      }
      case 'strike':
        if (!forwardDeploy(p, w, targets, airfields, weaponReach(w, radius, 1))) strike(w, radius * tanked);
        break;
      case 'support': {
        const k = keys.find((k) => km(w.node, k) <= radius);
        if (k !== undefined) issue(p, w, { posture: 'patrol', target: k });
        break;
      }
    }
  }
  budget.settle();
}

function strikersOf(p: Plan, w: Formation) {
  return Object.entries(w.equipment).filter(([, n]) => n > 0).map(([id]) => p.ctx.catalog.platform(id as PlatformId)).filter((pl) => AIR_ROLE[pl.class] && AIR_ROLE[pl.class] !== 'support');
}

/**
 * Airfields a nation's wings may use: its own and its co-belligerents', and those of any country
 * already hosting its forces (Kadena and Misawa for the US before Japan is in the war).
 */
function friendlyAirfields(p: Plan): NodeId[] {
  const { map } = p.ctx;
  const hosts = new Set<string>();
  for (const f of p.index.byNation.get(p.nation) ?? []) if (f.status === 'active' && f.node < map.landCount) hosts.add(p.world.control[f.node]);
  const fields: NodeId[] = [];
  for (let n = 0; n < map.landCount; n++) {
    const holder = p.world.control[n];
    if (map.airports[n] > 0 && (p.friends.has(holder) || hosts.has(holder)) && !p.enemies.has(holder)) fields.push(n as NodeId);
  }
  return fields;
}

/**
 * A strike wing whose weapons cannot reach the most valuable target they could kill without
 * tankers moves toward the war: to the friendly airfield nearest its present base from which
 * they can, no closer to that target than STANDOFF_BASE_KM, staging through airfields within
 * ferry range. Returns whether it moves. Tankers stretch a raid; they do not base a campaign.
 */
function forwardDeploy(p: Plan, w: Formation, targets: TargetGrid, airfields: () => NodeId[], reach: (m: Munition) => number): boolean {
  const { map } = p.ctx;
  const stock = arsenal(p, w);
  const goal = targets.targets.find((t) => stock.some((m) => pkAgainst(m, t) > 0));
  if (!goal) return false;
  const at = goal.at ?? goal.node;
  if (stock.some((m) => pkAgainst(m, goal) > 0 && withinKm(map, w.node, at, reach(m)))) return false;
  const fields = airfields();
  let base: NodeId | undefined, km = Infinity;
  for (const n of fields) {
    if (map.distanceKm(n, at) < STANDOFF_BASE_KM || !stock.some((m) => pkAgainst(m, goal) > 0 && withinKm(map, n, at, reach(m)))) continue;
    const d = map.distanceKm(w.node, n);
    if (d < km) { km = d; base = n; }
  }
  if (base === undefined) return false;
  const hop = stage(p, w, base, fields);
  if (hop === undefined) return false;
  issue(p, w, { posture: 'move', target: hop });
  return true;
}

/**
 * Sends fighter wings with nothing to fly toward the nearest fight: a land front, else the most
 * valuable target the nation strikes. Each is bound for the friendly airfield with room left from
 * which the fight is in reach and the fewest enemy missiles reach, farthest back among equals
 * (BASING), and stages there through airfields in ferry range over the following days. Returns the per-wing step; it binds no more wings once the
 * nation has BASING.commitShare of its fighters in reach of a fight or on their way.
 */
function rebasing(p: Plan, wings: Formation[], keys: NodeId[], targets: TargetGrid, airfields: () => NodeId[], tanked: number) {
  const { map, catalog } = p.ctx;
  const bound = (p.ai.airBases ??= {});
  const size = (f: Formation) => Object.entries(f.equipment).reduce((a, [id, n]) => a + (AIR_ROLE[catalog.platform(id as PlatformId).class] ? n : 0), 0);
  const goals = keys.length ? keys : targets.targets.slice(0, 1).map((t) => t.at ?? t.node);
  const goalOf = (n: NodeId) => goals.reduce<NodeId | undefined>((best, g) => (best === undefined || map.distanceKm(n, g) < map.distanceKm(n, best) ? g : best), undefined);
  const inReach = (w: Formation, at: NodeId) => {
    const g = goalOf(at);
    return g !== undefined && map.distanceKm(at, g) <= reachKm(p, w) * tanked * BASING.reachShare;
  };
  const combat = wings.filter((w) => { const r = roleOf(p, w); return r === 'fighter' || r === 'multirole'; });
  for (const id of Object.keys(bound) as FormationId[]) {
    const f = p.world.formations[id];
    if (!f || (f.nation === p.nation && f.status !== 'active')) delete bound[id];
  }
  const total = combat.reduce((a, w) => a + size(w), 0);
  let committed = combat.reduce((a, w) => a + (bound[w.id] !== undefined || inReach(w, w.node) ? size(w) : 0), 0);
  let room: Map<NodeId, number> | undefined;
  const roomAt = () => {
    if (room) return room;
    room = new Map(airfields().map((n) => [n, map.airports[n] * BASING.aircraftPerAirfield]));
    for (const f of Object.values(p.world.formations)) {
      if (f.kind !== 'air_wing' || f.status !== 'active') continue;
      const at = bound[f.id] ?? f.node;
      if (room.has(at)) room.set(at, room.get(at)! - size(f));
    }
    return room;
  };
  // Enemy ground-launched rounds that reach each airfield: the PLARF's thousands of SRBMs cover Taiwan's bases,
  // a few hundred DF-21s and DF-26s cover Kadena and Guam.
  let launchers: { node: NodeId; rounds: [number, number][] }[] | undefined;
  const threat = new Map<NodeId, number>();
  const threatAt = (at: NodeId) => {
    launchers ??= Object.values(p.world.formations).filter((f) => f.kind === 'missile' && f.status === 'active' && p.enemies.has(f.nation))
      .map((f) => ({ node: f.node, rounds: Object.entries(f.magazine).map(([m, k]): [number, number] => [catalog.munition(m as MunitionId).rangeKm, k]) }));
    let t = threat.get(at);
    if (t === undefined) {
      t = 0;
      for (const l of launchers) {
        const km = map.distanceKm(l.node, at);
        for (const [range, k] of l.rounds) if (range >= km) t += k;
      }
      threat.set(at, t);
    }
    return t;
  };
  const fly = (w: Formation, base: NodeId) => {
    const hop = stage(p, w, base, airfields());
    if (hop === undefined) return false;
    issue(p, w, { posture: 'move', target: hop });
    return true;
  };
  return (w: Formation, radius: number): boolean => {
    const r = roleOf(p, w);
    if (r !== 'fighter' && r !== 'multirole') return false;
    const to = bound[w.id];
    if (to !== undefined) return w.node !== to && fly(w, to);
    const n = size(w);
    if (!goals.length || inReach(w, w.node) || committed >= total * BASING.commitShare) return false;
    let base: NodeId | undefined, least = Infinity, back = -Infinity;
    for (const [at, left] of roomAt()) {
      if (left < n) continue;
      const d = map.distanceKm(at, goalOf(at)!);
      if (d > radius * BASING.reachShare || d < BASING.minFromFightKm) continue;
      const t = threatAt(at);
      if (t > least || (t === least && d <= back)) continue;
      least = t;
      back = d;
      base = at;
    }
    if (base === undefined || !fly(w, base)) return false;
    bound[w.id] = base;
    roomAt().set(base, roomAt().get(base)! - n);
    committed += n;
    return true;
  };
}

/** The airfield a wing flies to on its way to `base`: the base itself in ferry range, else the field in range nearest it. */
function stage(p: Plan, w: Formation, base: NodeId, fields: NodeId[]): NodeId | undefined {
  const { map } = p.ctx;
  const ferry = ferryKm(p.world, p.ctx.catalog, w);
  if (map.distanceKm(w.node, base) <= ferry) return base;
  let hop: NodeId | undefined, left = map.distanceKm(w.node, base);
  for (const n of fields) {
    const d = map.distanceKm(n, base);
    if (d < left && map.distanceKm(w.node, n) <= ferry) { left = d; hop = n; }
  }
  return hop;
}

/** Organic weapons (guns, rockets) able to hit `cls`, for aircraft without a suitable missile or bomb. */
function hasFirepower(p: Plan, w: Formation, cls: TargetClass): boolean {
  for (const [id, n] of Object.entries(w.equipment)) if (n > 0 && (p.ctx.catalog.platform(id as PlatformId).firepower[cls === 'power' ? 'structure' : cls] ?? 0) > 0) return true;
  return false;
}
