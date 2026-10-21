import { relation } from '../../core/engine';
import type { Formation, FormationId, NationId, NodeId, World } from '../../core/types';
import { alliances } from '../../data/nations';
import { debarkation, landMass, overseas } from '../land/strategic';
import { isGround, issue } from './forces';
import type { Plan, Sector } from './types';

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
export const aggressor = (p: Plan) => !!p.world.slices.diplomacy?.wars.some((w) => w.aggressor === p.nation);

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
/** A unit bound for a port this close to a sector counts toward that sector. */
const INBOUND_KM = 800;
/** Defensive force ratio, as in land.ts. */
const HOLD_RATIO = 3;

const deploying = (p: Plan, f: Formation) => f.status === 'embarked' || (f.order.posture === 'move' && f.order.target !== undefined && overseas(p.ctx.map, f.node, f.order.target));

/**
 * Strategic deployment: a nation at war whose homeland is quiet ships and flies its
 * ready ground forces to friendly ports in the theatres where its coalition is fighting
 * (reception, staging and onward movement happen on arrival, under planLand). Forces are
 * shared out by treaty commitment times threat; a homeland reserve and all territorial
 * forces stay home.
 */
export function planDeploy(p: Plan): void {
  const { map } = p.ctx;
  const { world } = p;
  if (!p.sectors.length) return;
  const mass = landMass(map);
  const theatres = new Set(p.sectors.map((s) => mass[s.key]));
  const own = p.index.byNation.get(p.nation) ?? [];
  const power = p.index.power;

  const inbound = new Map<Sector, number>();
  const nearest = (port: NodeId) => {
    let best: Sector | undefined, bestKm = INBOUND_KM;
    for (const s of p.sectors) {
      const km = mass[s.key] === mass[port] ? map.distanceKm(s.key, port) : Infinity;
      if (km < bestKm) { bestKm = km; best = s; }
    }
    return best;
  };
  // Home-based ground power, and how much of it is already abroad or on its way.
  let total = 0, sent = 0;
  for (const [id, port] of Object.entries(p.ai.deployments) as [FormationId, NodeId][]) {
    const f = world.formations[id];
    if (!f || f.status === 'destroyed' || !deploying(p, f)) {
      delete p.ai.deployments[id];
      continue;
    }
    if (f.status === 'embarked') { total += power(f); sent += power(f); }
    const s = nearest(port);
    if (s) inbound.set(s, (inbound.get(s) ?? 0) + power(f));
  }
  const homeBased = own.filter((f) => isGround(f) && f.status === 'active' && !theatres.has(mass[f.home]));
  for (const f of homeBased) {
    total += power(f);
    if (theatres.has(mass[f.node]) || deploying(p, f)) sent += power(f);
  }
  const home = homeBased
    .filter((f) => !map.isSea(f.node) && !theatres.has(mass[f.node]) && !f.territorial && !deploying(p, f))
    .sort((a, b) => b.readiness - a.readiness || (a.id < b.id ? -1 : 1));
  let budget = (1 - HOME_RESERVE) * total - sent;
  if (budget <= 0 || !home.length) return;

  // The nation's own forces already in each sector or bound for it.
  const committed = new Map<Sector, number>();
  for (const s of p.sectors) {
    let v = inbound.get(s) ?? 0;
    for (const n of s.nodes) for (const g of p.index.groundAt.get(n) ?? []) if (g.nation === p.nation) v += power(g);
    committed.set(s, v);
  }
  // Each formation goes where treaty weight times threat, discounted by what the nation already sends there, is largest:
  // forces flow to theatres in proportion to the stakes, not only to plug today's gaps, as US war plans for Europe and Korea do.
  const score = (s: Sector) => (commitment(p.nation, world.control[s.key]) * s.threat) / (1 + (HOLD_RATIO * committed.get(s)!) / Math.max(1e-9, s.threat));
  const ports = new Map<Sector, NodeId | undefined>();
  const open = new Set(p.sectors.filter((s) => s.threat > 0));
  for (const f of home) {
    if (budget <= 0 || !open.size) break;
    if (!releasable(p, f)) continue;
    let best: Sector | undefined, bestScore = 0;
    for (const s of open) if (score(s) > bestScore) { bestScore = score(s); best = s; }
    if (!best) break;
    if (!ports.has(best)) ports.set(best, debarkation(world, map, p.nation, best.key, 'sea'));
    const port = ports.get(best);
    if (port === undefined) {
      open.delete(best);
      continue;
    }
    issue(p, f, { posture: 'move', target: port });
    p.ai.deployments[f.id] = port;
    committed.set(best, committed.get(best)! + power(f));
    budget -= power(f);
  }
}
