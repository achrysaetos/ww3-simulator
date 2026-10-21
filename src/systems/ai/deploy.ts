import { relation } from '../../core/engine';
import type { Formation, FormationId, NationId, NodeId, World } from '../../core/types';
import { alliances } from '../../data/nations';
import { debarkation, landMass, overseas } from '../land/strategic';
import { isGround, issue } from './forces';
import type { Plan } from './types';

/**
 * Readiness to deploy beyond the nation's own borders. The NATO Force Model (Madrid
 * summit 2022, in force 2024) promises ~100,000 troops within 10 days, ~200,000 more in
 * 10-30 days and ~500,000 in 30-180 days. Notice grows with the square of a formation's
 * unreadiness: readiness 0.8 is ready to move at 10 days, 0.65 at 30, 0.4 at 90, while
 * the US 82nd Airborne's alert brigade (0.9) is out in a few days. Army National Guard
 * brigades (0.55) need about 50 days, in line with their post-mobilisation training.
 */
const NOTICE_AT_READY_DAYS = 10;
export const noticeDays = (readiness: number) => NOTICE_AT_READY_DAYS * ((1 - readiness) / 0.2) ** 2;

/** Days since the nation's first war with any of its current enemies began. */
export function warDays(world: World, nation: NationId, enemies: Iterable<NationId>): number {
  let since = world.tick;
  for (const e of enemies) since = Math.min(since, relation(world, nation, e).warSince ?? world.tick);
  return ((world.tick - since) * world.dtHours) / 24;
}

/** Whether the planning nation started one of its wars: its forces stand where its own war plan put them. */
export const aggressor = (p: Plan) => !!p.world.slices.diplomacy?.wars.some((w) => w.sides.some((s) => s.members[p.nation]?.via === 'declared'));

/**
 * Whether a formation may be sent to fight on another nation's soil. Territorial forces
 * never leave home; others wait out their notice to move, except in a war their own nation
 * started, whose deployments were made before the first shot.
 */
export function releasable(p: Plan, f: Formation): boolean {
  if (f.territorial) return false;
  let days = atWarDays.get(p);
  if (days === undefined) atWarDays.set(p, (days = aggressor(p) ? Infinity : warDays(p.world, p.nation, p.enemies)));
  return days >= noticeDays(f.readiness);
}
/** Days at war, per planning pass. */
const atWarDays = new WeakMap<Plan, number>();

/** Pull toward a partner's front when no treaty binds the two: co-belligerents help, but less. */
const COBELLIGERENT = 0.3;
const commitments = new Map<string, number>();

/** How strongly `nation` is bound to fight for `host`: its own soil 1, else the firmest treaty both belong to. */
export function commitment(nation: NationId, host: NationId | undefined): number {
  if (!host || host === nation) return 1;
  const key = `${nation}|${host}`;
  let c = commitments.get(key);
  if (c === undefined) {
    c = COBELLIGERENT;
    for (const a of alliances)
      if (a.obligation !== 'none' && a.obligation !== 'consultation' && a.members.includes(nation) && a.members.includes(host)) c = Math.max(c, a.commitment);
    commitments.set(key, c);
  }
  return c;
}

/** Share of a nation's home-based ground power kept at home for homeland defence (estimate; US doctrine keeps a homeland reserve). */
const HOME_RESERVE = 0.25;
/** Ground forces this close to a sector, on its land mass, are the forces that fight there (judgment: a corps sector and its depth). */
const THEATRE_KM = 400;

/**
 * The share of the enemy's ground power a nation's war plans want the coalition to match in a
 * theatre, by the enemy fighting there, where its strategy says so; parity elsewhere. The US
 * 2022 National Defense Strategy names China the pacing challenge and Russia the acute threat,
 * and North Korea and Iran persistent threats to deter together with allies, whose own armies
 * hold those fronts (the share is a judgment).
 */
const PRIORITY: Readonly<Partial<Record<string, Readonly<Partial<Record<string, number>>>>>> = { USA: { PRK: 0.5, IRN: 0.5 } };

const deploying = (p: Plan, f: Formation) => f.status === 'embarked' || (f.order.posture === 'move' && f.order.target !== undefined && overseas(p.ctx.map, f.node, f.order.target));

/** A front strategic deployment can send forces to: the ground power on both sides around it and the port it lands at. */
interface Theatre {
  port: NodeId;
  enemy: number;
  /** The whole coalition's: allies' armies, the nation's own forces there and those bound for it. */
  friendly: number;
  /** Treaty commitment to the holder times the nation's priority for the enemy there: the coalition strength wanted per unit of enemy. */
  weight: number;
}

/**
 * Strategic deployment: a nation at war whose homeland is quiet ships and flies its ready
 * ground forces to friendly ports in the theatres where its coalition is fighting (reception,
 * staging and onward movement happen on arrival, under planLand). The whole coalition's forces
 * count: each formation goes first where the coalition falls furthest short of the strength the
 * nation's treaties and stated priorities want against the enemy there, then, once every front
 * has it, where the enemy most outweighs the coalition. So forces flow to the fronts allies hold
 * thinly, not to the biggest enemy army. A homeland reserve and all territorial forces stay home.
 */
export function planDeploy(p: Plan): void {
  const { map } = p.ctx;
  const { world } = p;
  if (!p.sectors.length) return;
  const mass = landMass(map);
  const theatres = new Set(p.sectors.map((s) => mass[s.key]));
  const own = p.index.byNation.get(p.nation) ?? [];
  const power = p.index.power;

  // Home-based ground power, and how much of it is already abroad or on its way.
  let total = 0, sent = 0;
  const inbound: { port: NodeId; power: number }[] = [];
  for (const [id, port] of Object.entries(p.ai.deployments) as [FormationId, NodeId][]) {
    const f = world.formations[id];
    if (!f || f.status === 'destroyed' || !deploying(p, f)) {
      delete p.ai.deployments[id];
      continue;
    }
    if (f.status === 'embarked') { total += power(f); sent += power(f); }
    inbound.push({ port, power: power(f) });
  }
  const homeBased = own.filter((f) => isGround(f) && f.status === 'active' && !theatres.has(mass[f.home]));
  for (const f of homeBased) {
    total += power(f);
    if (theatres.has(mass[f.node]) || deploying(p, f)) sent += power(f);
  }
  const ready = homeBased
    .filter((f) => !map.isSea(f.node) && !theatres.has(mass[f.node]) && !deploying(p, f) && releasable(p, f))
    .sort((a, b) => b.readiness - a.readiness || (a.id < b.id ? -1 : 1));
  let budget = (1 - HOME_RESERVE) * total - sent;
  if (budget <= 0 || !ready.length) return;

  const open = theatresOf(p, inbound);
  const want = (t: Theatre) => t.weight * t.enemy;
  for (const f of ready) {
    if (budget <= 0) break;
    // Fronts below the strength the nation's plans want come first, the largest shortfall first; past that, the thinnest.
    const short = open.some((t) => want(t) > t.friendly);
    let best: Theatre | undefined, bestScore = 0;
    for (const t of open) {
      const score = short ? want(t) - t.friendly : want(t) / Math.max(t.friendly, 1e-9);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (!best) break;
    issue(p, f, { posture: 'move', target: best.port });
    p.ai.deployments[f.id] = best.port;
    best.friendly += power(f);
    budget -= power(f);
  }
}

/** The coalition's sectors that face an enemy army and have a friendly port, each with the ground balance around it. */
function theatresOf(p: Plan, inbound: readonly { port: NodeId; power: number }[]): Theatre[] {
  const { map } = p.ctx;
  const { world } = p;
  const mass = landMass(map);
  const armies: { node: NodeId; friendly: number; enemy: number }[] = [];
  for (const [n, gs] of p.index.groundAt) {
    if (map.isSea(n as NodeId)) continue;
    let friendly = 0, enemy = 0;
    for (const g of gs) {
      if (p.friends.has(g.nation)) friendly += p.index.power(g);
      else if (p.enemies.has(g.nation)) enemy += p.index.power(g);
    }
    if (friendly || enemy) armies.push({ node: n as NodeId, friendly, enemy });
  }
  const out: Theatre[] = [];
  for (const s of p.sectors) {
    if (s.threat <= 0) continue;
    let enemy = 0, friendly = 0;
    for (const a of armies) {
      if (mass[a.node] !== mass[s.key] || map.distanceKm(a.node, s.key) > THEATRE_KM) continue;
      enemy += a.enemy;
      friendly += a.friendly;
    }
    if (enemy <= 0) continue;
    const port = debarkation(world, map, p.nation, s.key, 'sea');
    if (port === undefined) continue;
    for (const i of inbound) if (mass[i.port] === mass[s.key] && map.distanceKm(i.port, s.key) <= THEATRE_KM) friendly += i.power;
    const weight = commitment(p.nation, world.control[s.key]) * (PRIORITY[p.nation]?.[world.control[s.enemyNodes[0]]] ?? 1);
    out.push({ port, enemy, friendly, weight });
  }
  return out;
}
