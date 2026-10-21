/**
 * Command and control, and electronic warfare. Builds each belligerent's chain of command (national
 * command authority, army and corps HQs from the order of battle, front HQs derived for the rest),
 * tracks HQ damage from strikes and overrun, works out each formation's communications over
 * satellite, radio and fibre bearers, and lays the jamming field every nation's EW puts out.
 *
 * Sole writer of slices.c2. Other systems read it only through the modifiers exported here, each
 * neutral (1, or no delay) in a world run without this system:
 * - c2FireFactor: land combat fire (HQ losses, comms, GNSS-guided rounds under jamming);
 * - jammedHits: strike hits left after GNSS and datalink jamming at the target;
 * - radarFactor: SAM fire-control channels left under radar jamming;
 * - isrJammed: whether jamming denies an airborne ISR fix;
 * - holdOrder: holds an order in transit while the formation's C2 is degraded.
 */
import type { Catalog } from '../../core/catalog';
import { hostility, type System } from '../../core/engine';
import type { Formation, FormationId, Munition, NationId, NodeId, PlatformId, World } from '../../core/types';
import { assessHqs, attach, chainOf, draw, relocate, tallyOf } from './command';
import { buildJam, jamAgainst } from './ew';
import type { C2State, Jam, OrderCommand } from './state';
import { BEARERS, COMMS_DELAY_H, COMMS_FLOOR, DEFAULT_BEARERS, DRONE_KINDS, HQ, ISR_LINK_DENIAL, RADAR_DENIAL, SAM_RADAR_DENIAL, SATCOM_PROVIDER, VULN, VULN_OVERRIDE } from './tables';

export type { C2State, C2Tally, CommandNode, FormationC2, HqLevel, Jam } from './state';
export { jamAgainst } from './ew';

const IMMUNE = { gnss: 0, link: 0 };
function vulnOf(m: Munition): { gnss: number; link: number } {
  return VULN_OVERRIDE[m.id] ?? VULN[m.kind] ?? IMMUNE;
}

/** Per platform: total firepower, and the shares of its rounds lost to full GNSS and full datalink jamming. */
const platformVuln = new WeakMap<Catalog, Map<PlatformId, { fire: number; gnss: number; link: number }>>();

function platformVulnOf(catalog: Catalog, pid: PlatformId): { fire: number; gnss: number; link: number } {
  let byId = platformVuln.get(catalog);
  if (!byId) platformVuln.set(catalog, (byId = new Map()));
  let v = byId.get(pid);
  if (v) return v;
  const p = catalog.platform(pid);
  let fire = 0, rounds = 0, gnss = 0, link = 0;
  for (const k in p.firepower) fire += p.firepower[k as keyof typeof p.firepower] ?? 0;
  for (const l of p.loadout) {
    const m = vulnOf(catalog.munition(l.munition));
    rounds += l.count;
    gnss += l.count * m.gnss;
    link += l.count * m.link;
  }
  byId.set(pid, (v = rounds ? { fire, gnss: gnss / rounds, link: link / rounds } : { fire, gnss: 0, link: 0 }));
  return v;
}

/** Share of a formation's fire that jamming takes away: guided rounds that miss and drones whose links are cut. */
function jammedFire(catalog: Catalog, f: Formation, jam: Jam): number {
  let fire = 0, lost = 0;
  for (const pid in f.equipment) {
    const n = f.equipment[pid as PlatformId];
    if (n <= 0) continue;
    const v = platformVulnOf(catalog, pid as PlatformId);
    fire += n * v.fire;
    lost += n * v.fire * (1 - (1 - v.gnss * jam.gnss) * (1 - v.link * jam.comms));
  }
  return fire > 0 ? lost / fire : 0;
}

function countSatcom(world: World, catalog: Catalog, s: C2State): void {
  const alive: Record<string, number> = {};
  for (const id of s.space) {
    const f = world.formations[id];
    if (!f || f.status === 'destroyed') continue;
    for (const pid in f.equipment) if (catalog.platform(pid as PlatformId).class === 'comms_satellite') alive[f.nation] = (alive[f.nation] ?? 0) + f.equipment[pid as PlatformId];
  }
  for (const n of new Set([...Object.keys(alive), ...Object.keys(s.satcomBase)]) as Set<NationId>) {
    const now = alive[n] ?? 0;
    s.satcomBase[n] = Math.max(s.satcomBase[n] ?? 0, now);
    s.satcom[n] = s.satcomBase[n] > 0 ? now / s.satcomBase[n] : 1;
  }
}

/** Share of a nation's satellite bandwidth still up: its own constellation, else its provider's, else (commercial, unmodelled) all of it. */
function satcomUp(s: C2State, nation: NationId): number {
  return s.satcom[nation] ?? s.satcom[SATCOM_PROVIDER[nation]] ?? 1;
}

function initialState(): C2State {
  return { hqs: {}, chain: {}, jam: {}, satcomBase: {}, satcom: {}, formations: {}, transit: {}, released: {}, tally: {}, attachedTo: -1, space: [], emitters: [] };
}

export const c2: System = {
  id: 'c2',
  init(world, ctx) {
    const s = (world.slices.c2 = initialState());
    attach(world, ctx.map, s);
    countSatcom(world, ctx.catalog, s);
  },
  step(world, ctx) {
    const s = world.slices.c2;
    const { map, catalog } = ctx;
    const foes = hostility(world).foes;
    const belligerent = (n: NationId) => foes.has(n);
    attach(world, map, s);
    countSatcom(world, catalog, s);
    const live: Formation[] = [];
    for (const fid in s.chain) {
      const f = world.formations[fid as FormationId];
      if (!f || f.status === 'destroyed') delete s.chain[fid as FormationId];
      else if (belligerent(f.nation)) live.push(f);
    }
    assessHqs(world, ctx, s);
    relocate(world, map, s, live);
    const ew = s.emitters.map((id) => world.formations[id]).filter((f) => f && !(f.id in s.chain));
    s.jam = foes.size ? buildJam(map, catalog, [...live, ...ew], belligerent, Object.values(s.hqs)) : {};

    s.formations = {};
    for (const f of live) {
      let coordination = 1, delayH = 0;
      for (const hq of chainOf(s, f.id)) {
        coordination *= 1 - HQ[hq.level].fire * (1 - hq.integrity);
        delayH += HQ[hq.level].delayH * (1 - hq.integrity);
      }
      const jam = jamAgainst(world, f.node, f.nation);
      const b = BEARERS[f.nation] ?? DEFAULT_BEARERS;
      // Satellite terminals are harder to jam than line-of-sight radio, but Zhitel-class sets do reach them.
      const comms = b.satcom * satcomUp(s, f.nation) * (1 - 0.5 * jam.comms) + b.radio * (1 - jam.comms) + b.fibre * (world.theater.infrastructure[f.node] ?? 1);
      coordination *= COMMS_FLOOR + (1 - COMMS_FLOOR) * comms;
      delayH += COMMS_DELAY_H * (1 - comms);
      s.formations[f.id] = { coordination, delayH, guided: jam.gnss > 0 || jam.comms > 0 ? 1 - jammedFire(catalog, f, jam) : 1 };
    }

    for (const fid in s.transit) {
      const t = s.transit[fid as FormationId];
      // Released now, it is applied at the start of the next tick, its due tick.
      if (t.due > world.tick + 1) continue;
      world.pending.push(t.command);
      s.released[fid as FormationId] = world.tick + 1;
      delete s.transit[fid as FormationId];
    }
    for (const fid in s.released) if (s.released[fid as FormationId] <= world.tick) delete s.released[fid as FormationId];
  },
};

// ---------------------------------------------------------------- modifiers read by other systems

/** Multiplier on a land formation's fire from its command, communications and GNSS jamming; 1 outside a war or without this system. */
export function c2FireFactor(world: World, f: Formation): number {
  const c = world.slices.c2?.formations[f.id];
  return c ? c.coordination * c.guided : 1;
}

/** Hours an order to this formation waits in transit now; 0 outside a war or without this system. */
export function orderDelayHours(world: World, id: FormationId): number {
  return world.slices.c2?.formations[id]?.delayH ?? 0;
}

/**
 * Of `hits` weapons of munition `m` that reached `target`, how many still find it after the defenders'
 * GNSS and datalink jamming there. The expected number, rounded by a deterministic draw.
 */
export function jammedHits(world: World, target: NodeId, attacker: NationId, m: Munition, hits: number): number {
  const s = world.slices.c2;
  if (!s || hits <= 0) return hits;
  const { gnss: g, link: l } = vulnOf(m);
  if (!g && !l) return hits;
  const jam = jamAgainst(world, target, attacker);
  const keep = (1 - g * jam.gnss) * (1 - l * jam.comms);
  if (keep >= 1) return hits;
  const expected = hits * keep;
  const kept = Math.floor(expected) + (draw(`${attacker}|${target}|${m.id}`, world.tick, world.seed) < expected % 1 ? 1 : 0);
  const t = tallyOf(s, attacker);
  t.jammedWeapons += hits - kept;
  if (DRONE_KINDS.has(m.kind)) t.jammedDrones += hits - kept;
  return kept;
}

/** Share of a SAM site's fire-control channels left under the enemy's radar jamming at its cell. */
export function radarFactor(world: World, node: NodeId, nation: NationId): number {
  return 1 - SAM_RADAR_DENIAL * jamAgainst(world, node, nation).radar;
}

/** Whether the target's side's jamming at `node` denies `observer`'s airborne ISR a fix on formation `id` this tick. */
export function isrJammed(world: World, node: NodeId, observer: NationId, id: FormationId): boolean {
  const jam = jamAgainst(world, node, observer);
  const p = 1 - (1 - RADAR_DENIAL * jam.radar) * (1 - ISR_LINK_DENIAL * jam.comms);
  return p > 0 && draw(`isr|${id}|${observer}`, world.tick, world.seed) < p;
}

/**
 * Holds an order to a commanded formation in transit for its current delay, rounded to ticks by a
 * deterministic draw. A newer order replaces the one in transit but keeps its due tick: staff pass on
 * the latest intent when the link comes up. Returns true when the order was held.
 */
export function holdOrder(world: World, cmd: OrderCommand): boolean {
  const s = world.slices.c2;
  if (!s || !(cmd.formation in s.chain)) return false;
  if (s.released[cmd.formation] === world.tick) {
    delete s.released[cmd.formation];
    return false;
  }
  const prior = s.transit[cmd.formation];
  if (prior) {
    prior.command = cmd;
    return true;
  }
  const ticks = orderDelayHours(world, cmd.formation) / world.dtHours;
  const due = world.tick + Math.floor(ticks) + (draw(`order|${cmd.formation}`, world.tick, world.seed) < ticks % 1 ? 1 : 0);
  if (due <= world.tick) return false;
  s.transit[cmd.formation] = { command: cmd, due };
  tallyOf(s, cmd.nation).delayedOrders++;
  return true;
}
