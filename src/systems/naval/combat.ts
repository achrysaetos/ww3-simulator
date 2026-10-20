import { atWar } from '../../core/engine';
import type { Formation, FormationId, Munition, MunitionId, NationId, PlatformId, TargetClass } from '../../core/types';
import { tracked } from './detection';
import type { TickEnv } from './env';
import { resolveSalvo, type SalvoDefense, type SalvoOutcome } from './salvo';
import { effectiveHitsToKill, ledger } from './state';
import { ANTISHIP_KINDS, CREW_LOSS_SUNK, INTERCEPTOR_KINDS, LAUNCHES_PER_HULL, SORTIES_PER_HOUR, TORPEDO_SPREAD, USV_STRIKE, USV_WAVE } from './tables';

type Tracks = Map<FormationId, Set<NationId>>;

/** Postures in which a group initiates fire; others only defend. */
const ENGAGING = new Set(['attack', 'patrol', 'blockade', 'escort', 'defend', 'strike']);
/**
 * Torpedoes a hunting force puts on one detected submarine formation per tick. A track is one
 * localized contact, a single boat, prosecuted with a pair of torpedoes; the boats it sails with
 * are not localized by it (submarines operate dispersed; USN ASW doctrine, estimate).
 */
const ASW_SALVO = 2;
/**
 * Ticks one boat needs after an attack before it attacks again: it clears the datum, evades
 * the counterattack and works back into a firing position (~a day; WWII U-boat and Falklands
 * 1982 experience; estimate). A formation's boats patrol dispersed and take turns, so a
 * formation of n boats makes one attack every SUB_REATTACK_TICKS / n ticks, never more than
 * one per tick.
 */
const SUB_REATTACK_TICKS = 4;
/**
 * Chance per unit of screen ASW effort x (1 - stealth) that a target group's own screen catches a
 * submarine closing to firing range. Fleet exercises still see quiet boats reach carriers (Saphir
 * vs Theodore Roosevelt 2015, Gotland vs Ronald Reagan 2005), so a carrier group's screen (destroyers
 * and a dozen MH-60Rs, ~8 units) should foil about half the attacks by a 0.9-stealth SSN (estimate).
 */
const SCREEN_K = 0.9;
/** Decoy/evasion chance for a surface ship against one torpedo (Nixie-type towed decoys; estimate). */
const SHIP_TORPEDO_DEFENSE = 0.15;

export interface Losses { sunk: Record<PlatformId, number>; damaged: Record<PlatformId, number>; casualties: number }

/**
 * One tick of naval combat at every contested node: submarine ambushes first, then ASW
 * against tracked submarines, then a simultaneous missile exchange (all salvos are fired
 * from pre-exchange strength, damage applied after, as in Hughes' model).
 */
export function navalCombat(env: TickEnv, tracks: Tracks): void {
  const pending = new Map<FormationId, { target: Formation; hits: number[]; by: NationId }>();
  const queue = (target: Formation, by: NationId, out: SalvoOutcome) => {
    if (!out.hits.length) return;
    const p = pending.get(target.id);
    if (p) p.hits.push(...out.hits);
    else pending.set(target.id, { target, hits: [...out.hits], by });
  };

  for (const f of env.naval) {
    if (!ENGAGING.has(f.order.posture) || f.order.path?.length) continue;
    const c = env.comp(f);
    if (!c.submerged || c.hulls.every((h) => h.platform.class === 'ssbn')) continue;
    if (env.world.tick - (env.world.slices.naval.lastFired[f.id] ?? -Infinity) < SUB_REATTACK_TICKS / c.hullCount) continue;
    const target = pickTarget(env, tracks, f, (t) => t.node === f.node && !env.comp(t).submerged);
    if (!target) continue;
    const torp = bestMunition(env, f, 'ship', 0, (m) => m.kind === 'torpedo');
    if (!torp) continue;
    // A boat caught on its approach breaks off; it is a datum the screen searches next tick.
    if (env.ctx.rng.chance(1 - Math.exp(-screen(env, target) * (1 - c.stealth) * SCREEN_K))) {
      env.world.slices.naval.lastFired[f.id] = env.world.tick;
      continue;
    }
    const n = Math.min(Math.floor(f.magazine[torp.id]), TORPEDO_SPREAD);
    queue(target, f.nation, fire(env, f, target, torp, n, 'ship'));
  }

  for (const sub of env.naval) {
    if (!env.comp(sub).submerged) continue;
    const hunters = tracks.get(sub.id);
    if (!hunters) continue;
    let salvo = ASW_SALVO;
    for (const h of env.byNode.get(sub.node) ?? []) {
      if (salvo <= 0) break;
      if (h === sub || !hunters.has(h.nation) || !atWar(env.world, h.nation, sub.nation)) continue;
      const w = bestMunition(env, h, 'submarine', 0, (m) => m.kind === 'torpedo');
      if (!w) continue;
      const n = Math.min(Math.floor(h.magazine[w.id]), salvo);
      salvo -= n;
      queue(sub, h.nation, fire(env, h, sub, w, n, 'submarine'));
    }
  }

  for (const f of env.naval) {
    if (!ENGAGING.has(f.order.posture)) continue;
    const c = env.comp(f);
    if (c.hulls.every((h) => h.platform.class === 'ssbn')) continue;
    const target = pickTarget(env, tracks, f, (t) => !env.comp(t).submerged && (t.node === f.node || isNeighbour(env, f.node, t.node)));
    if (!target) continue;
    const km = env.ctx.map.distanceKm(f.node, target.node);
    const m = bestMunition(env, f, 'ship', km, (x) => x.kind !== 'torpedo' && ANTISHIP_KINDS.has(x.kind));
    if (!m) continue;
    const defense = poolDefense(env, target);
    const need = Math.ceil(defense.channels * 1.5 + 2 * env.comp(target).hullCount);
    const n = Math.min(f.magazine[m.id], launchCapacity(env, f, m), need);
    if (n > 0) queue(target, f.nation, fire(env, f, target, m, n, 'ship', defense));
  }

  for (const f of env.naval) if (ENGAGING.has(f.order.posture)) usvAttack(env, tracks, f, queue);

  for (const { target, hits, by } of pending.values()) applyHits(env, target, hits, by);
}

/** Strike USVs in the group run at the best tracked hostile surface group here or next door, expending themselves. */
function usvAttack(env: TickEnv, tracks: Tracks, f: Formation, queue: (t: Formation, by: NationId, out: SalvoOutcome) => void): void {
  const boats = env.comp(f).hulls.filter((h) => h.platform.class === 'usv' && (h.platform.firepower.ship ?? 0) > 0);
  if (!boats.length) return;
  const target = pickTarget(env, tracks, f, (t) => !env.comp(t).submerged && (t.node === f.node || isNeighbour(env, f.node, t.node)));
  if (!target) return;
  let launched = 0;
  for (const b of boats) {
    const n = Math.min(b.count, USV_WAVE - launched);
    f.equipment[b.pid] -= n;
    if (f.equipment[b.pid] <= 0) delete f.equipment[b.pid];
    launched += n;
    if (launched >= USV_WAVE) break;
  }
  env.invalidate(f);
  const out = resolveSalvo(env.ctx.rng, USV_STRIKE, launched, poolDefense(env, target), 'ship');
  const lb = ledger(env.world, f.nation);
  lb.leakers += out.leakers;
  env.ctx.emit({ type: 'message', tick: env.world.tick, nation: f.nation, text: `${launched} strike USVs from ${f.name} attacked ${target.name}: ${out.hits.length} hits` });
  queue(target, f.nation, out);
}

/** ASW effort screening a group against an approaching submarine: its own sensors and those of the groups escorting it. */
function screen(env: TickEnv, target: Formation): number {
  let asw = env.comp(target).aswSearch;
  for (const g of env.byNode.get(target.node) ?? [])
    if (g !== target && g.nation === target.nation && g.order.posture === 'escort' && g.order.targetFormation === target.id) asw += env.comp(g).aswSearch;
  return asw;
}

function isNeighbour(env: TickEnv, a: number, b: number): boolean {
  const { map } = env.ctx;
  for (let k = map.adjStart[a]; k < map.adjStart[a + 1]; k++) if (map.adj[k] === b) return true;
  return false;
}

/** Most valuable tracked hostile formation the predicate allows; an ordered targetFormation wins if eligible. */
function pickTarget(env: TickEnv, tracks: Tracks, f: Formation, ok: (t: Formation) => boolean): Formation | undefined {
  const { map } = env.ctx;
  const ordered = f.order.targetFormation ? env.world.formations[f.order.targetFormation] : undefined;
  if (ordered && ordered.status === 'active' && tracked(tracks, f.nation, ordered) && ok(ordered)) return ordered;
  let best: Formation | undefined, bestValue = 0;
  const consider = (node: number) => {
    for (const t of env.byNode.get(node) ?? []) {
      if (!atWar(env.world, f.nation, t.nation) || !tracked(tracks, f.nation, t) || !ok(t)) continue;
      let v = 0;
      for (const h of env.comp(t).hulls) v += h.platform.unitCostUsdM * h.count;
      if (v > bestValue) { bestValue = v; best = t; }
    }
  };
  consider(f.node);
  for (let k = map.adjStart[f.node]; k < map.adjStart[f.node + 1]; k++) consider(map.adj[k]);
  return best;
}

/** Highest expected-damage munition in the magazine that reaches `km`, honouring order.munition. Aircraft-launched weapons reach out to the aircraft's combat radius plus the weapon's range. */
function bestMunition(env: TickEnv, f: Formation, against: TargetClass, km: number, ok: (m: Munition) => boolean): Munition | undefined {
  const { catalog } = env.ctx;
  let best: Munition | undefined, bestScore = 0;
  for (const [id, n] of Object.entries(f.magazine) as [MunitionId, number][]) {
    if (n < 1) continue;
    const m = catalog.munition(id);
    if (!ok(m) || !(m.pk[against] ?? 0)) continue;
    if (f.order.munition && f.order.munition !== id) continue;
    if (reach(env, f, m) < km) continue;
    const score = (m.pk[against] ?? 0) * (0.5 + m.interceptDifficulty) * m.warheadKg ** (2 / 3);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

function reach(env: TickEnv, f: Formation, m: Munition): number {
  let r = 0;
  for (const h of env.comp(f).hulls) if (h.platform.loadout.some((l) => l.munition === m.id)) r = Math.max(r, m.rangeKm);
  for (const a of env.comp(f).aircraft) if (a.platform.loadout.some((l) => l.munition === m.id)) r = Math.max(r, m.rangeKm + a.platform.mobility.rangeKm);
  return r;
}

/** Missiles this group can put in the air in one tick: VLS/launcher ripple per hull plus strike sorties by embarked aircraft. */
function launchCapacity(env: TickEnv, f: Formation, m: Munition): number {
  let cap = 0;
  const c = env.comp(f);
  for (const h of c.hulls) if (h.platform.loadout.some((l) => l.munition === m.id)) cap += LAUNCHES_PER_HULL * h.count;
  for (const a of c.aircraft) {
    const per = a.platform.loadout.find((l) => l.munition === m.id)?.count ?? 0;
    cap += Math.floor(a.count * SORTIES_PER_HOUR * env.world.dtHours * per);
  }
  return cap;
}

/**
 * The target's whole task force at its node defends it: area-defense channels, interceptors
 * and CAP are pooled across same-nation surface groups; point defense is the target's own.
 */
export function poolDefense(env: TickEnv, target: Formation): SalvoDefense & { holders: Formation[] } {
  const { catalog } = env.ctx;
  const holders = (env.byNode.get(target.node) ?? []).filter((g) => g.nation === target.nation && g.node === target.node && !env.comp(g).submerged);
  if (!holders.includes(target)) holders.push(target);
  let channels = 0, capShots = 0;
  const stock = new Map<MunitionId, number>();
  for (const g of holders) {
    const c = env.comp(g);
    channels += c.channels;
    capShots += c.capShots;
    for (const [id, n] of Object.entries(g.magazine) as [MunitionId, number][]) {
      if (n < 1) continue;
      const m = catalog.munition(id);
      if (INTERCEPTOR_KINDS.has(m.kind) && (m.pk.missile ?? 0) > 0) stock.set(id, (stock.get(id) ?? 0) + Math.floor(n));
    }
  }
  const interceptors = [...stock].map(([id, available]) => ({ munition: catalog.munition(id), available })).sort((a, b) => (b.munition.pk.missile ?? 0) - (a.munition.pk.missile ?? 0));
  return { channels, capShots, interceptors, pointDefense: env.comp(target).pointDefense, holders };
}

/** Fire `n` of munition `m` from shooter (or `by` for outside strikers) at target, spend magazines, record the ledger and a strike event. */
export function fire(env: TickEnv, shooter: Formation | null, target: Formation, m: Munition, n: number, against: 'ship' | 'submarine', defense?: ReturnType<typeof poolDefense>, by = shooter!.nation): SalvoOutcome {
  n = Math.floor(n);
  const def = defense ?? (m.kind === 'torpedo' || against === 'submarine'
    ? { channels: 0, capShots: 0, interceptors: [], pointDefense: against === 'submarine' ? env.comp(target).pointDefense : SHIP_TORPEDO_DEFENSE, holders: [] }
    : poolDefense(env, target));
  const out = resolveSalvo(env.ctx.rng, m, n, def, against);
  if (shooter) {
    shooter.magazine[m.id] -= n;
    env.world.slices.naval.lastFired[shooter.id] = env.world.tick;
  }
  const lb = ledger(env.world, by);
  if (m.kind === 'torpedo') lb.torpedoesFired += n;
  else lb.missilesFired += n;
  lb.leakers += out.leakers;
  for (const [id, used] of out.interceptorsUsed) {
    ledger(env.world, target.nation).interceptorsFired += used;
    let left = used;
    for (const g of def.holders) {
      const take = Math.min(left, Math.floor(g.magazine[id] ?? 0));
      if (take > 0) { g.magazine[id] -= take; left -= take; }
      if (!left) break;
    }
  }
  env.ctx.emit({ type: 'strike', tick: env.world.tick, by, munition: m.id, fired: n, intercepted: out.intercepted, target: target.node, damage: `${out.hits.length} hits on ${target.name}` });
  return out;
}

/**
 * Spread hits over the target's hulls in proportion to signature; a hull whose damage
 * reaches its readiness-scaled hits-to-kill sinks, any other hit hull is mission-killed and
 * goes to `damaged`. Sinking takes its crew share, its magazine share, carrier aircraft and
 * embarked troops down with it.
 */
export function applyHits(env: TickEnv, target: Formation, hits: number[], by: NationId): Losses {
  const { world, ctx } = env;
  const c = env.comp(target);
  const hulls: { stack: (typeof c.hulls)[number]; dmg: number }[] = [];
  for (const stack of c.hulls) for (let i = 0; i < stack.count; i++) hulls.push({ stack, dmg: 0 });
  const losses: Losses = { sunk: {}, damaged: {}, casualties: 0 };
  if (!hulls.length) return losses;
  const totalSig = hulls.reduce((s, h) => s + h.stack.profile.signature, 0);
  for (const w of hits) {
    let r = ctx.rng.next() * totalSig;
    let h = hulls[hulls.length - 1];
    for (const x of hulls) if ((r -= x.stack.profile.signature) <= 0) { h = x; break; }
    h.dmg += w;
  }
  let liftLost = 0, aircraftCapLost = 0, aircraftCap = 0;
  for (const s of c.hulls) aircraftCap += (s.platform.capacity?.aircraft ?? 0) * s.count;
  const sunkByPid = new Map<PlatformId, number>();
  for (const h of hulls) {
    if (!h.dmg) continue;
    const pid = h.stack.pid;
    target.equipment[pid] -= 1;
    if (h.dmg >= effectiveHitsToKill(h.stack.profile, target.readiness)) {
      losses.sunk[pid] = (losses.sunk[pid] ?? 0) + 1;
      sunkByPid.set(pid, (sunkByPid.get(pid) ?? 0) + 1);
      target.personnel = Math.max(0, target.personnel - h.stack.platform.crew);
      losses.casualties += h.stack.platform.crew * CREW_LOSS_SUNK;
      liftLost += h.stack.platform.capacity?.troops ?? 0;
      aircraftCapLost += h.stack.platform.capacity?.aircraft ?? 0;
    } else {
      losses.damaged[pid] = (losses.damaged[pid] ?? 0) + 1;
      target.damaged[pid] = (target.damaged[pid] ?? 0) + 1;
    }
  }
  for (const [pid, n] of sunkByPid) loseMagazineShare(env, target, pid, n);
  if (aircraftCapLost && aircraftCap) {
    const share = aircraftCapLost / aircraftCap;
    for (const a of c.aircraft) target.equipment[a.pid] -= Math.round(a.count * share);
    for (const w of env.embarked.get(target.id) ?? []) if (w.kind === 'air_wing') shrink(env, w, share);
  }
  if (liftLost && c.troopLift) for (const e of env.embarked.get(target.id) ?? []) if (e.kind !== 'air_wing') shrink(env, e, liftLost / c.troopLift);

  const lb = ledger(world, target.nation);
  for (const n of Object.values(losses.sunk)) lb.hullsSunk += n;
  for (const n of Object.values(losses.damaged)) lb.hullsDamaged += n;
  for (const [pid, n] of Object.entries(target.equipment)) if (n <= 0) delete target.equipment[pid as PlatformId];
  env.invalidate(target);
  ctx.emit({ type: 'battle', tick: world.tick, node: target.node, attacker: by, defender: target.nation, losses: { [target.nation]: { ...losses.sunk } }, casualties: { [target.nation]: Math.round(losses.casualties) } });
  const after = env.comp(target);
  if (after.crippled && target.order.posture !== 'reserve') target.order = { posture: 'reserve', issuedTick: world.tick };
  else if (!after.hullCount && !after.crippled) destroy(env, target);
  return losses;
}

function loseMagazineShare(env: TickEnv, f: Formation, pid: PlatformId, sunk: number): void {
  const p = env.ctx.catalog.platform(pid);
  for (const l of p.loadout) {
    let full = 0;
    for (const h of env.comp(f).hulls) full += (h.platform.loadout.find((x) => x.munition === l.munition)?.count ?? 0) * h.count;
    if (full > 0 && f.magazine[l.munition]) f.magazine[l.munition] *= Math.max(0, 1 - (l.count * sunk) / full);
  }
}

/** Remove a share of a formation (embarked troops drowned with their ship, aircraft lost with their carrier). */
function shrink(env: TickEnv, f: Formation, share: number): void {
  if (share >= 0.999) return destroy(env, f);
  for (const [pid, n] of Object.entries(f.equipment) as [PlatformId, number][]) f.equipment[pid] = n - Math.round(n * share);
  f.personnel = Math.round(f.personnel * (1 - share));
  env.invalidate(f);
}

export function destroy(env: TickEnv, f: Formation): void {
  f.status = 'destroyed';
  delete env.world.slices.naval.tracks[f.id];
  env.ctx.emit({ type: 'formation_destroyed', tick: env.world.tick, formation: f.id, nation: f.nation });
  for (const e of env.embarked.get(f.id) ?? []) if (e.status === 'embarked') destroy(env, e);
}
