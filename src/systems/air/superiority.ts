/**
 * Counter-air over every node where hostile air forces meet. Offensive counter-air
 * (air_superiority/escort/patrol orders) commits all its sorties to order.target;
 * fighters on 'defend' split theirs across threatened nodes in radius. The battle,
 * then SAM fire on the survivors, decides who holds the air. Only nodes with hostile
 * contact get an airControl entry, and a contested node gets none.
 */
import type { SimContext } from '../../core/engine';
import type { NationId, NodeId, PlatformId, World } from '../../core/types';
import { resolveAirBattle, type AirSide, type Flight } from './combat';
import { hostileDefenders, samDenial, samVsAircraft, type ExposedFlight } from './iads';
import { takeLosses, type LossTally } from './losses';
import { nodeDistance, type AirGroup, type AirPicture } from './picture';
import { COUNTER_AIR_POSTURES, STRIKE_ROLES, TUNING } from './tables';

export function resolveAirSuperiority(world: World, ctx: SimContext, pic: AirPicture): void {
  const present = new Map<number, Map<NationId, ExposedFlight[]>>();
  const active = new Map<number, Set<NationId>>();
  const join = (node: NodeId, g: AirGroup, n: number) => {
    let byNation = present.get(node);
    if (!byNation) present.set(node, (byNation = new Map()));
    const list = byNation.get(g.f.nation);
    if (list) list.push({ g, n });
    else byNation.set(g.f.nation, [{ g, n }]);
  };
  const mark = (node: NodeId, nation: NationId) => {
    const s = active.get(node);
    if (s) s.add(nation);
    else active.set(node, new Set([nation]));
  };

  for (const g of pic.groups) {
    const { f } = g, target = f.order.target;
    if (target === undefined || g.sorties <= 0) continue;
    const dist = nodeDistance(ctx, f.node, target);
    if (g.profile.role === 'counter_air' && COUNTER_AIR_POSTURES.has(f.order.posture) && dist <= g.radiusKm) {
      join(target, g, g.sorties);
      mark(target, f.nation);
      g.sorties = 0;
    } else if (f.order.posture === 'strike' && STRIKE_ROLES.has(g.profile.role)) mark(target, f.nation);
  }
  if (!active.size) return;

  const contested = [...active.keys()] as NodeId[];
  for (const g of pic.groups) {
    if (g.profile.role !== 'counter_air' || g.f.order.posture !== 'defend' || g.sorties <= 0) continue;
    const nodes = contested.filter((n) => [...active.get(n)!].some((x) => pic.atWar(x, g.f.nation)) && !enemyHeld(world, pic, n, g.f.nation) && nodeDistance(ctx, g.f.node, n) <= g.radiusKm);
    nodes.forEach((n, i) => {
      const share = Math.floor(g.sorties / nodes.length) + (i < g.sorties % nodes.length ? 1 : 0);
      if (share > 0) join(n, g, share);
    });
  }

  for (const node of contested) {
    const byNation = present.get(node);
    if (byNation) fightOver(world, ctx, pic, node, byNation);
  }
}

function fightOver(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, byNation: Map<NationId, ExposedFlight[]>) {
  const sorties = (n: NationId) => byNation.get(n)!.reduce((s, x) => s + x.n, 0);
  const nations = [...byNation.keys()];
  const blue = nations.reduce((a, b) => (sorties(b) > sorties(a) ? b : a));
  const red = nations.filter((n) => pic.atWar(n, blue));
  const blueSide = nations.filter((n) => !pic.atWar(n, blue) && !red.includes(n));
  if (!red.length && !hostileTo(world, ctx, pic, node, blue)) return;

  // Pilots hold outside a dense hostile SAM envelope rather than fight under it, so
  // fighters over a front both sides defend trade few kills and neither holds the air
  // (Ukraine 2022-25: both air forces stayed behind their own SAM umbrellas).
  for (const [nation, flights] of byNation)
    for (const x of flights) x.n -= ctx.rng.binomial(x.n, samDenial(world, ctx, pic, node, nation, x.g.platform.protection.stealth));

  const tally: LossTally = {};
  const flightsOf = (side: NationId[]) => side.flatMap((n) => byNation.get(n)!);
  const blueFlights = flightsOf(blueSide), redFlights = flightsOf(red);

  if (red.length) {
    const out = resolveAirBattle(airSide(ctx, pic, node, blueSide, blueFlights), airSide(ctx, pic, node, red, redFlights), ctx.rng);
    const settle = (flights: ExposedFlight[], results: typeof out.a) =>
      flights.forEach((x, i) => {
        const aam = pic.aamOf(x.g.f);
        if (aam) x.g.f.magazine[aam.id] = Math.max(0, (x.g.f.magazine[aam.id] ?? 0) - results[i].missilesFired);
        x.n -= takeLosses(world, ctx, x.g.f, x.g.pid, results[i].lost, TUNING.damagedShare, tally);
      });
    settle(blueFlights, out.a);
    settle(redFlights, out.b);
  }

  for (const [nation, flights] of byNation) {
    const lost = samVsAircraft(world, ctx, pic, node, nation, flights, 'counter_air', hasSupport(ctx, pic, node, nation, 'ew'), tally);
    flights.forEach((x, i) => (x.n -= lost[i]));
  }

  const survivors = (fl: ExposedFlight[]) => fl.reduce((s, x) => s + x.n, 0);
  const qBlue = survivors(blueFlights), qRed = survivors(redFlights);
  if (qBlue + qRed > 0) {
    const share = qBlue / (qBlue + qRed);
    const [winSide, winShare] = share >= 1 - share ? [blueSide, share] : [red, 1 - share];
    if (winShare >= TUNING.controlShare) {
      const winner = winSide.reduce((a, b) => (survivors(byNation.get(b)!) > survivors(byNation.get(a)!) ? b : a));
      const winFlights = flightsOf(winSide);
      const stealth = winFlights.reduce((s, x) => s + x.n * x.g.platform.protection.stealth, 0) / Math.max(1, survivors(winFlights));
      const level = Math.min(1, (winShare - 0.5) * 2) * (1 - samDenial(world, ctx, pic, node, winner, stealth));
      if (level >= 0.1) world.theater.airControl[node] = { nation: winner, level: Math.round(level * 1000) / 1000 };
    }
  }
  emitBattle(world, ctx, pic, node, blue, tally, red[0]);
}

function airSide(ctx: SimContext, pic: AirPicture, node: NodeId, nations: NationId[], flights: ExposedFlight[]): AirSide {
  const left = new Map<string, number>();
  const fl: Flight[] = flights.map(({ g, n }) => {
    const aam = pic.aamOf(g.f);
    const perSortie = aam ? (g.platform.loadout.find((l) => l.munition === aam.id)?.count ?? 0) : 0;
    const key = g.f.id;
    const avail = left.get(key) ?? (aam ? g.f.magazine[aam.id] ?? 0 : 0);
    const missiles = Math.min(avail, n * perSortie);
    left.set(key, avail - missiles);
    return { platform: g.platform, aircraft: n, aam: perSortie ? aam : undefined, missiles, experience: g.f.experience };
  });
  let awacsKm = 0;
  for (const g of pic.groups)
    if (g.profile.role === 'awacs' && g.sorties > 0 && nations.includes(g.f.nation) && nodeDistance(ctx, g.f.node, node) <= g.radiusKm)
      awacsKm = Math.max(awacsKm, g.platform.sensors.detectionKm);
  return { flights: fl, awacsKm };
}

export function hasSupport(ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId, role: 'ew' | 'awacs'): boolean {
  return pic.groups.some((g) => g.profile.role === role && g.sorties > 0 && g.f.nation === nation && nodeDistance(ctx, g.f.node, node) <= g.radiusKm);
}

/** Defensive counter-air covers friendly and neutral airspace; going over enemy ground is an offensive sweep. */
function enemyHeld(world: World, pic: AirPicture, node: NodeId, nation: NationId): boolean {
  const owner = world.control[node];
  return !!owner && pic.atWar(owner, nation);
}

/** Flying over this node means contact: enemy ground, enemy forces, or enemy SAM coverage. */
function hostileTo(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, nation: NationId): boolean {
  const owner = world.control[node];
  if (owner && pic.atWar(owner, nation)) return true;
  if (pic.atNode.get(node)?.some((f) => pic.atWar(f.nation, nation))) return true;
  return hostileDefenders(world, ctx, pic, node, nation).length > 0;
}

/**
 * An air battle at `node`: `attacker` is the side that flew in, the defender whoever it fought
 * there (the enemy flying against it, a nation it lost aircraft to or shot down, else the hostile holder of the cell, the
 * hostile forces on it, or the SAMs covering it). No hostile party, no battle.
 */
export function emitBattle(world: World, ctx: SimContext, pic: AirPicture, node: NodeId, attacker: NationId, tally: LossTally, opponent?: NationId) {
  const nations = Object.keys(tally) as NationId[];
  if (!nations.length) return;
  const hostile = (n: NationId | undefined): n is NationId => !!n && pic.atWar(n, attacker);
  const owner = world.control[node];
  const defender =
    (hostile(opponent) ? opponent : undefined) ??
    nations.find(hostile) ??
    (hostile(owner) ? owner : undefined) ??
    pic.atNode.get(node)?.find((f) => hostile(f.nation))?.nation ??
    pic.defenders.find((d) => hostile(d.f.nation) && nodeDistance(ctx, d.f.node, node) <= d.rangeKm)?.f.nation;
  if (!defender) return;
  const casualties: Record<NationId, number> = {};
  for (const n of nations) casualties[n] = Object.entries(tally[n]).reduce((s, [pid, c]) => s + c * ctx.catalog.platform(pid as PlatformId).crew, 0);
  ctx.emit({ type: 'battle', tick: world.tick, node, attacker, defender, losses: tally, casualties, domain: 'air' });
}
