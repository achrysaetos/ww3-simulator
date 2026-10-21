import type { SimContext } from '../../core/engine';
import type { Catalog } from '../../core/catalog';
import { platformCount } from '../../core/forces';
import type { Rng } from '../../core/rng';
import type { Formation, Munition, MunitionId, NationId, NodeId, World } from '../../core/types';
import { nodePopulation, popWithin, recordDeaths, survivingShare } from './demography';
import { blastFatalities, empDamage, empRadiusKm, overpressureRadiusKm, sspk, thermalRadiusKm } from './effects';
import { depositFallout } from './fallout';
import { addSoot } from './climate';
import type { Burst, LaunchWarning, ReleaseRequest, Salvo } from './state';
import { BMD_SYSTEMS, DISPERSION_KM2, EARLY_WARNING, POINT_TARGET, SOOT_TONS_PER_PERSON, bmdCovers, hardnessPsi } from './tables';

/** Decides whether a nation under a detected counterforce attack launches before impact. The AI system supplies it. */
export type LaunchOnWarningHook = (world: World, warning: LaunchWarning, ctx: SimContext) => ReleaseRequest[];

const isLive = (f: Formation) => f.status === 'active' || f.status === 'routed';

/** How far a formation can deliver this munition: missile range, plus the combat radius when the carrier is an aircraft. */
export function deliveryReachKm(catalog: Catalog, f: Formation, m: Munition): number {
  let carrier = 0;
  for (const pid of Object.keys(f.equipment) as (keyof typeof f.equipment)[]) {
    const p = catalog.platform(pid);
    if (p.domain === 'air' && f.equipment[pid] > 0) carrier = Math.max(carrier, p.mobility.rangeKm);
  }
  return m.rangeKm + carrier;
}

/** Silos and alert ICBMs fire first (use or lose), bombers last (slow and recallable). */
const LAUNCH_ORDER: Partial<Record<Formation['kind'], number>> = { strategic: 0, missile: 1, submarine: 2, surface_group: 3, air_wing: 4 };

/**
 * Release warheads at a node. Draws them from the magazines of the nation's formations that can reach the target,
 * up to the nation's deployed (on-launcher) warheads; reserve warheads in storage cannot fly until loaded. Magazine
 * units are reentry vehicles, so a MIRVed missile contributes one unit per warhead. Returns warheads launched.
 */
export function release(world: World, ctx: SimContext, req: ReleaseRequest): number {
  const nation = world.nations[req.nation];
  const m = ctx.catalog.munitions.get(req.munition);
  const refuse = (why: string) => {
    ctx.emit({ type: 'message', tick: world.tick, nation: req.nation, text: `nuclear release refused: ${why}` });
    return 0;
  };
  if (!nation) return refuse('unknown nation');
  if (!m?.yieldKt) return refuse(`${req.munition} is not a nuclear munition`);
  const want = Math.min(Math.floor(req.warheads), nation.nuclear.deployed);
  if (want <= 0) return refuse('no deployed warheads');
  const launchers = Object.values(world.formations)
    .filter((f) => f.nation === req.nation && isLive(f) && (f.magazine[req.munition] ?? 0) > 0 && ctx.map.distanceKm(f.node, req.target) <= deliveryReachKm(ctx.catalog, f, m))
    .sort((a, b) => (LAUNCH_ORDER[a.kind] ?? 9) - (LAUNCH_ORDER[b.kind] ?? 9) || (a.id < b.id ? -1 : 1));
  let fired = 0;
  for (const f of launchers) {
    const take = Math.min(f.magazine[req.munition], want - fired);
    f.magazine[req.munition] -= take;
    fired += take;
    if (fired === want) break;
  }
  if (fired === 0) return refuse('no launcher in range holds that warhead');
  nation.nuclear.deployed -= fired;
  nation.nuclear.warheads = Math.max(0, nation.nuclear.warheads - fired);
  world.slices.strategic.salvos.push({ by: req.nation, target: req.target, munition: req.munition, warheads: fired, burst: req.burst });
  return fired;
}

// ---------------------------------------------------------------- missile defense

/** Fire interceptors at a salvo of RVs, `shotsPerTarget` each until the inventory runs out. */
export function interceptSalvo(rng: Rng, incoming: number, interceptors: number, pk: number, shotsPerTarget: number): { killed: number; used: number } {
  const full = Math.min(incoming, Math.floor(interceptors / shotsPerTarget));
  let killed = rng.binomial(full, 1 - (1 - pk) ** shotsPerTarget);
  let used = full * shotsPerTarget;
  const spare = interceptors - used;
  if (full < incoming && spare > 0) {
    if (rng.chance(1 - (1 - pk) ** spare)) killed++;
    used += spare;
  }
  return { killed, used };
}

function victimOf(world: World, node: NodeId, byNode: Map<number, Formation[]>, attacker: NationId): NationId | undefined {
  const owner = world.control[node];
  if (owner && owner !== attacker) return owner;
  return byNode.get(node)?.find((f) => f.nation !== attacker)?.nation;
}

function defend(world: World, ctx: SimContext, salvo: Salvo, kind: Munition['kind'], victim: NationId | undefined): number {
  if (!victim) return 0;
  const stock = world.slices.strategic.interceptors;
  let intercepted = 0;
  for (const sys of BMD_SYSTEMS) {
    const left = salvo.warheads - intercepted;
    if (left <= 0 || !stock[sys.id] || !sys.engages.includes(kind) || !bmdCovers(sys, ctx.map, victim, salvo.target)) continue;
    const r = interceptSalvo(ctx.rng, left, stock[sys.id], sys.pk, sys.shotsPerTarget);
    stock[sys.id] -= r.used;
    intercepted += r.killed;
  }
  return intercepted;
}

// ---------------------------------------------------------------- resolution

function indexByNode(world: World): Map<number, Formation[]> {
  const byNode = new Map<number, Formation[]>();
  for (const f of Object.values(world.formations)) {
    if (!isLive(f) && f.status !== 'embarked') continue;
    const list = byNode.get(f.node);
    if (list) list.push(f);
    else byNode.set(f.node, [f]);
  }
  return byNode;
}

function warningsFor(world: World, ctx: SimContext, batch: Salvo[], byNode: Map<number, Formation[]>): LaunchWarning[] {
  const out = new Map<string, LaunchWarning>();
  for (const sv of batch) {
    const victim = victimOf(world, sv.target, byNode, sv.by);
    if (!victim) continue;
    const key = `${sv.by}|${victim}`;
    let w = out.get(key);
    if (!w) {
      if (!ctx.rng.chance(EARLY_WARNING[victim] ?? 0)) continue;
      w = { tick: world.tick, attacker: sv.by, victim, inbound: 0, targets: [], counterforce: false };
      out.set(key, w);
    }
    w.inbound += sv.warheads;
    w.targets.push(sv.target);
    w.counterforce ||= (byNode.get(sv.target) ?? []).some((f) => f.nation === victim && f.kind === 'strategic');
  }
  return [...out.values()];
}

/**
 * Resolve every salvo launched this tick. Before each wave lands, nations that detect a counterforce strike and hold
 * a launch-on-warning posture get one chance per attacker to launch; their missiles leave before the impacts.
 */
export function resolveSalvos(world: World, ctx: SimContext, onWarning: LaunchOnWarningHook | undefined): void {
  const s = world.slices.strategic;
  s.warnings = [];
  const asked = new Set<string>();
  while (s.salvos.length) {
    const batch = s.salvos;
    s.salvos = [];
    const byNode = indexByNode(world);
    for (const w of warningsFor(world, ctx, batch, byNode)) {
      s.warnings.push(w);
      const key = `${w.victim}|${w.attacker}`;
      if (!onWarning || !w.counterforce || s.posture[w.victim] !== 'launch_on_warning' || asked.has(key)) continue;
      asked.add(key);
      for (const req of onWarning(world, w, ctx)) release(world, ctx, req);
    }
    for (const sv of batch) {
      const m = ctx.catalog.munition(sv.munition);
      const intercepted = defend(world, ctx, sv, m.kind, victimOf(world, sv.target, byNode, sv.by));
      const arriving = sv.warheads - intercepted;
      ctx.emit({ type: 'strike', tick: world.tick, by: sv.by, munition: sv.munition, fired: sv.warheads, intercepted, target: sv.target, effects: [{ kind: 'nuclear_detonations', count: arriving }] });
      if (arriving > 0) detonate(world, ctx, sv.by, sv.target, m, arriving, sv.burst ?? defaultBurst(byNode.get(sv.target) ?? [], sv.by, ctx.catalog), byNode);
    }
  }
}

/** Surface bursts against hardened military targets (silos, bunkers), air bursts to maximise the 5 psi area elsewhere. */
function defaultBurst(here: Formation[], attacker: NationId, catalog: Catalog): Burst {
  const hard = here.some((f) => f.nation !== attacker && (Object.keys(f.equipment) as (keyof typeof f.equipment)[]).some((pid) => POINT_TARGET.has(catalog.platform(pid).class)));
  return hard ? 'ground' : 'air';
}

/** Detonate `count` warheads of munition `m` at a node and apply every effect. */
export function detonate(world: World, ctx: SimContext, by: NationId, node: NodeId, m: Munition, count: number, burst: Burst, byNode = indexByNode(world)): void {
  const s = world.slices.strategic;
  const y = m.yieldKt ?? 0;
  s.totals.detonations += count;
  s.totals.megatons += (y * count) / 1000;
  if (burst === 'high_altitude') {
    const keep = (1 - empDamage(y)) ** count;
    for (const n of ctx.map.nodesWithin(node, empRadiusKm())) world.theater.infrastructure[n] *= keep;
    for (let i = 0; i < count; i++) {
      ctx.emit({ type: 'nuclear_detonation', tick: world.tick, by, node, yieldKt: y, casualties: 0 });
    }
    return;
  }
  const pop = nodePopulation(world, ctx.map, node);
  const r5 = overpressureRadiusKm(y, 5, burst), r2 = overpressureRadiusKm(y, 2, burst), rTh = thermalRadiusKm(y, burst);
  for (let i = 0; i < count; i++) {
    const alive = survivingShare(world, pop, node);
    const dead = recordDeaths(world, pop, node, blastFatalities(y, burst, (r) => popWithin(pop, r)) * alive);
    if (pop.total > 0) {
      const wrecked = (popWithin(pop, r5) + 0.5 * (popWithin(pop, r2) - popWithin(pop, r5))) / pop.total;
      world.theater.infrastructure[node] *= 1 - Math.min(0.95, wrecked);
      addSoot(world, (popWithin(pop, rTh) * alive * SOOT_TONS_PER_PERSON) / 1e6);
    }
    if (burst === 'ground') depositFallout(world, ctx.map, node, y);
    ctx.emit({ type: 'nuclear_detonation', tick: world.tick, by, node, yieldKt: y, casualties: dead });
  }
  damageFormations(world, ctx, byNode.get(node) ?? [], y, count, burst, m.cepM);
}

/**
 * Point targets (silos) share the warheads evenly, each silo facing n/silos shots at its SSPK. Everything else is an
 * area target spread over its formation's dispersion area; each warhead independently wrecks the share of it that
 * lies inside the platform's lethal overpressure radius.
 */
function damageFormations(world: World, ctx: SimContext, here: Formation[], yieldKt: number, warheads: number, burst: Burst, cepM: number): void {
  let silos = 0;
  for (const f of here)
    for (const [pid, n] of Object.entries(f.equipment)) if (POINT_TARGET.has(ctx.catalog.platform(pid as keyof typeof f.equipment).class)) silos += n;
  for (const f of here) {
    if (f.kind === 'space') continue;
    const before = platformCount(f);
    if (before === 0) continue;
    for (const pid of Object.keys(f.equipment) as (keyof typeof f.equipment)[]) {
      const p = ctx.catalog.platform(pid);
      const psi = hardnessPsi(p.class, p.domain);
      const pKill = POINT_TARGET.has(p.class)
        ? 1 - (1 - sspk(yieldKt, psi, cepM, burst)) ** (warheads / silos)
        : 1 - (1 - Math.min(1, (Math.PI * overpressureRadiusKm(yieldKt, psi, burst) ** 2) / DISPERSION_KM2[f.kind])) ** warheads;
      f.equipment[pid] -= ctx.rng.binomial(f.equipment[pid], pKill);
    }
    const after = platformCount(f);
    if (after === before) continue;
    scaleHoldings(world, ctx.catalog, f, after / before);
    if (after === 0) {
      f.status = 'destroyed';
      ctx.emit({ type: 'formation_destroyed', tick: world.tick, formation: f.id, nation: f.nation });
    }
  }
}

/** Crews and the munitions held on destroyed launchers go with them; lost nuclear warheads leave the national count. */
function scaleHoldings(world: World, catalog: Catalog, f: Formation, keep: number): void {
  f.personnel = Math.round(f.personnel * keep);
  const nuclear = world.nations[f.nation]?.nuclear;
  for (const mid of Object.keys(f.magazine) as MunitionId[]) {
    const lost = f.magazine[mid] - Math.round(f.magazine[mid] * keep);
    f.magazine[mid] -= lost;
    if (nuclear && catalog.munition(mid).yieldKt) {
      nuclear.deployed = Math.max(0, nuclear.deployed - lost);
      nuclear.warheads = Math.max(0, nuclear.warheads - lost);
    }
  }
}
