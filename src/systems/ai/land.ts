import type { Formation, FormationId, NationId, NodeId, Operation } from '../../core/types';
import { landSlice, openTo } from '../land';
import { ACTIVE, committedFormations, routeAxis } from '../ops';
import { aggressor, commitment, releasable } from './deploy';
import { isGround, issue, strength } from './forces';
import { enemyPowerAt, landMass, stagingSector } from './fronts';
import type { Plan, Sector } from './types';
import { defineParam } from '../../core/params';

/**
 * Force ratios. The 3:1 attacker's rule (Mearsheimer 1989, "Assessing the
 * Conventional Balance"; Dupuy's QJM analyses of WWII and Arab-Israeli
 * battles) is the local ratio below which assaults on prepared defences
 * usually fail; by the same rule a dug-in defender holds at one third of the
 * attacker's strength.
 */
export const ATTACK_RATIO = defineParam({ id: 'ai.ATTACK_RATIO', value: 3, range: [2, 4], tag: 'contested',
  source: 'The 3:1 rule (Mearsheimer 1989; Dupuy QJM) against its critics (Epstein 1989); also scales the attritional press ratio',
  affects: 'when the AI attacks and holds' });
const HOLD_RATIO = 3;
/** Fraction of power kept back as an operational reserve: 30% for a cautious command, 15% for an aggressive one. */
const reserveShare = (aggression: number) => 0.3 - 0.15 * aggression;
/**
 * Share of that reserve a defender keeps out of the line even when the line is short of what the threat needs. Ukraine
 * in 2023-25 held a few brigades back as a counterattack reserve while its line was thin (ISW, RUSI); a larger reserve
 * thins the ukraine-2026 line past the realism bands (A2b probes: 0.33 lets Russia net 3.5 cells on seed 1).
 */
const SHORT_LINE_RESERVE = defineParam({ id: 'ai.SHORT_LINE_RESERVE', value: 0.25, range: [0, 0.5], tag: 'judgment',
  source: 'Judgment, band-fitting: a defender\'s operational reserve of a few brigades (FM 3-90; Ukraine 2023-25, ISW)',
  affects: 'how many formations a defender holds back from a short line to meet the main effort' });
/** Farther than this, a formation is in another theatre and is not pulled into this front. */
const MAX_COMMIT_KM = 1500;
const RETREAT_BELOW = { strength: 0.4, supply: 0.15, morale: 0.25 };
/**
 * Attritional offensive doctrine: a command that accepts heavy losses keeps
 * line units assaulting wherever they locally match the defender, instead of
 * waiting for a 3:1. Russia 2023-25 (Avdiivka, Pokrovsk: continuous small-unit
 * assaults along most of the front, ISW/RUSI) and North Korean doctrine of
 * massed continuous attack. Gated on aggression x casualty tolerance.
 */
const AGGRESSOR = 0.3;
/** Local ratio at which line units keep assaulting: 3:1 scaled down by the command's appetite for offensive losses (Russia ~0.85:1, DPRK ~1.3:1). */
const pressureRatio = (aggression: number, casualtyTolerance: number) => ATTACK_RATIO() / (1 + 4 * aggression * casualtyTolerance);
/**
 * Culminating point: offensives stall as supply lines lengthen and units wear
 * out. No attack is launched more than MAX_DRIVE_CELLS (~300 km) beyond the
 * ground the coalition held at the start, the depth Russia's 2022 drives and
 * Ukraine's 2022 Kharkiv and 2024 Kursk offensives reached before stalling;
 * worn or under-supplied units stop attacking.
 */
const MAX_DRIVE_CELLS = defineParam({ id: 'ai.MAX_DRIVE_CELLS', value: 3, range: [2, 5], tag: 'judgment',
  source: 'Judgment, band-fitting: Russia 2022, Kharkiv 2022 and Kursk 2024 drives stalled ~300 km deep',
  affects: 'offensive culmination depth, in one-degree cells' });
/**
 * Most of an army a nation sends to partners' fronts. NATO's regional plans assign each ally a region and expect it to hold its own territory
 * first (Vilnius summit 2023), so half the army stays home (judgement call).
 */
const FOREIGN_SHARE = 0.5;
const FIT_TO_ATTACK = { strength: 0.6, supply: 0.4 };

function needsRetreat(p: Plan, f: Formation): boolean {
  if (f.status === 'routed') return true;
  const cap = f.supplyCapacity.fuel + f.supplyCapacity.ammo;
  const supply = cap > 0 ? (f.supply.fuel + f.supply.ammo) / cap : 1;
  return strength(p.ai, f) < RETREAT_BELOW.strength || supply < RETREAT_BELOW.supply || f.morale < RETREAT_BELOW.morale;
}

/**
 * Connected regions of land the nation's troops can march through without fighting: own,
 * co-belligerent and granted ground. -1 elsewhere. Both the list of open holders and the flood
 * fill over it are cached until control changes (Plan.memo); the list is re-read daily, since
 * war membership and grants of passage change without an event.
 */
function passableRegions(p: Plan): Int32Array {
  const { map } = p.ctx;
  const { world } = p;
  const listKey = `open|${p.nation}`;
  let list = p.memo.get(listKey) as { tick: number; key: string; holders: NationId[] } | undefined;
  if (!list || (world.tick - list.tick) * world.dtHours >= 24) {
    // canEnter's rule by holder: own, co-belligerent, granted passage, unclaimed, or (not here) enemy ground.
    const holders = (Object.keys(world.nations) as NationId[]).filter((c) => !p.enemies.has(c) && openTo(world, p.nation, c)).sort();
    p.memo.set(listKey, (list = { tick: world.tick, key: `regions|${holders.join(',')}`, holders }));
  }
  const { key } = list;
  const hit = p.memo.get(key) as Int32Array | undefined;
  if (hit) return hit;
  const isOpen = new Set(list.holders);
  const region = new Int32Array(map.landCount).fill(-1);
  const open = new Uint8Array(map.landCount);
  for (let n = 0; n < map.landCount; n++) {
    const c = world.control[n];
    open[n] = !c || isOpen.has(c) ? 1 : 0;
  }
  p.memo.set(key, region);
  let next = 0;
  for (let s = 0; s < map.landCount; s++) {
    if (!open[s] || region[s] >= 0) continue;
    const stack = [s];
    region[s] = next;
    while (stack.length) {
      const n = stack.pop()!;
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && open[m] && region[m] < 0) { region[m] = next; stack.push(m); }
      }
    }
    next++;
  }
  return region;
}

/**
 * A cell at least two cells behind the front, by breadth-first search from `from`, inside the
 * territory of whoever holds `from`: a reserve backing Estonia's line waits in Estonia, not
 * across the Gulf in Finland. A small country whose every cell is near the front gets its
 * deepest cell. From enemy ground, any friendly cell will do.
 */
function rear(p: Plan, from: NodeId, front: Set<number>): NodeId {
  const { map } = p.ctx;
  const holder = p.world.control[from];
  const ok = p.friends.has(holder) ? (n: number) => n < map.landCount && p.world.control[n] === holder : (n: number) => n < map.landCount && p.friends.has(p.world.control[n]);
  const quiet = (n: number) => {
    if (front.has(n)) return false;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (front.has(map.adj[k])) return false;
    return true;
  };
  const seen = new Set<number>([from]);
  const queue = [from as number];
  for (let i = 0; i < queue.length && i < 400; i++) {
    const n = queue[i];
    if (ok(n) && quiet(n)) return n as NodeId;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (!seen.has(m) && ok(m)) { seen.add(m); queue.push(m); }
    }
  }
  return queue.length > 1 && ok(queue[queue.length - 1]) ? (queue[queue.length - 1] as NodeId) : from;
}

/** Most of its out-of-contact formations a nation spends screening border build-ups; the rest stays in reserve (judgment). */
const SCREEN_SHARE = 0.5;

/** A formation fighting inside an enemy-held cell is this many km further from a home task than its distance: it must break contact first (estimate). */
const ENGAGED_KM = 400;

/**
 * Defence of the homeland, planned before anything else and drawing on the whole army, the
 * offensive included. Every cell of the nation's own soil that it held at the start and an
 * enemy now holds draws the nearest fit formations until they outnumber the enemy there
 * ATTACK_RATIO to 1, as Russia drew forces from Donbas and Zaporizhzhia to clear Kursk in
 * 2024. Every home cell that borders such a penetration keeps at least one formation, so a
 * breakthrough meets a screen rather than rolling on through an empty rear, and so does an
 * empty border cell facing enemy troops mounting an assault. A quiet border is not screened:
 * holding every cell against every enemy across it would tie down an attacker's whole army,
 * Russia facing NATO from Kola to Belarus among them. It covers land borders only: a landing on
 * an island the enemy has no soil on is fought by the ordinary front. Ground next to home soil already occupied
 * when the scenario began is the old front, where cells change hands in attrition; losing one
 * there is not a penetration. A counter-attack goes in only with the means to reach 3:1;
 * short of that the screen holds. Returns the formations so committed, which the rest of the
 * plan leaves alone.
 */
function defendHomeland(p: Plan, fit: (f: Formation) => boolean): Set<Formation> {
  const { map } = p.ctx;
  const { world } = p;
  const committed = new Set<Formation>();
  const { origin } = landSlice(world);
  if (!origin.length) return committed;
  // Only across a land border: an amphibious lodgement on an island is the naval war's and the ordinary front's business.
  const mass = landMass(map);
  const bordered = new Set<number>();
  for (const e of p.enemies) for (const n of map.nodesOf(e)) bordered.add(mass[n]);
  const home = (n: number) => n < map.landCount && map.owner[n] === p.nation && origin[n] === p.nation && bordered.has(mass[n]);
  // The nation's own soil already in enemy hands when the scenario began: the old front, where ground changes hands by inches.
  const oldFront = (n: number) => n < map.landCount && map.owner[n] === p.nation && origin[n] !== p.nation;
  const nextToOldFront = (n: number) => {
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (oldFront(map.adj[k])) return true;
    return false;
  };
  // Enemy orders are not seen, only forces: troops moved out of their garrisons (home, from the open
  // order of battle) into an enemy cell with the 3:1 they need against the friendly troops around it are
  // read as an assault forming, as the 2021-22 build-up around Ukraine was read from units away from base.
  /** Enemy power massing in `m`, or 0 when what stands there is not an assault forming. */
  const massing = (m: number) => {
    let enemy = 0;
    for (const g of p.index.groundAt.get(m) ?? []) if (p.enemies.has(g.nation) && g.node !== g.home) enemy += p.index.power(g);
    if (enemy <= 0) return 0;
    let friendly = 0;
    for (let k = map.adjStart[m]; k < map.adjStart[m + 1]; k++)
      for (const g of p.index.groundAt.get(map.adj[k]) ?? []) if (p.friends.has(g.nation)) friendly += p.index.power(g);
    return enemy >= ATTACK_RATIO() * friendly ? enemy : 0;
  };
  const occupied = (n: number) => (p.index.groundAt.get(n) ?? []).some((g) => g.nation === p.nation);
  // Home cells lost across a border, not ground given up on the old front (Russian gains in Donbas are not a penetration of Ukraine's rear).
  const lost: { n: NodeId; enemy: number }[] = [];
  for (const n of map.nodesOf(p.nation)) if (home(n) && p.enemies.has(world.control[n]) && !nextToOldFront(n)) lost.push({ n, enemy: enemyPowerAt(n, p.index, p.enemies) });
  const lostCells = new Set<number>(lost.map((l) => l.n));
  /** Cells to hold: true next to a penetration (any formation will do), false on a border facing an assault (reserves only). */
  const screen = new Map<NodeId, boolean>();
  const facing = new Map<NodeId, number>();
  for (const n of map.nodesOf(p.nation)) {
    if (!home(n) || world.control[n] !== p.nation) continue;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m >= map.landCount || !p.enemies.has(world.control[m])) continue;
      if (lostCells.has(m)) {
        screen.set(n, true);
        facing.delete(n);
        break;
      }
      const e = !oldFront(m) && !occupied(n) ? massing(m) : 0;
      if (e > 0) {
        screen.set(n, false);
        facing.set(n, Math.max(facing.get(n) ?? 0, e));
      }
    }
  }
  if (!lost.length && !screen.size) return committed;
  const power = p.index.power;
  const inOperation = committedFormations(world);
  const own = (p.index.byNation.get(p.nation) ?? []).filter((f) => isGround(f) && f.kind === 'maneuver' && !map.isSea(f.node) && !needsRetreat(p, f) && !inOperation.has(f.id));
  const cost = (f: Formation, n: number) => map.distanceKm(f.node, n as NodeId) + (p.enemies.has(world.control[f.node]) ? ENGAGED_KM : 0);
  const nearest = (n: number, ok: (f: Formation) => boolean) =>
    own
      .filter((f) => !committed.has(f) && ok(f) && mass[f.node] === mass[n] && map.distanceKm(f.node, n as NodeId) <= MAX_COMMIT_KM)
      .sort((a, b) => cost(a, n) - cost(b, n) || (a.id < b.id ? -1 : 1));

  // A border screen takes formations out of contact, so it never strips the line or the nation's own assault groups.
  const inContact = (f: Formation) => {
    for (let k = map.adjStart[f.node]; k < map.adjStart[f.node + 1]; k++) if (map.adj[k] < map.landCount && p.enemies.has(world.control[map.adj[k]])) return true;
    return p.enemies.has(world.control[f.node]);
  };
  // The reserve screens only the heaviest build-ups and keeps the rest back to meet the enemy's main effort when it shows,
  // not one brigade per border cell: FM 3-90 keeps a reserve uncommitted until the decisive point is known.
  const screens = Math.floor(SCREEN_SHARE * own.filter((g) => !inContact(g)).length);
  [...facing].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(screens).forEach(([n]) => screen.delete(n));
  // Formations already on a homeland task keep it.
  const sent = new Map<number, number>();
  for (const f of own) {
    const t = f.order.target;
    if (t === undefined) continue;
    if (f.order.posture === 'attack' && lostCells.has(t)) {
      committed.add(f);
      sent.set(t, (sent.get(t) ?? 0) + power(f));
    } else if (f.order.posture === 'defend' && screen.has(t)) {
      committed.add(f);
      screen.delete(t);
    }
  }
  lost.sort((a, b) => b.enemy - a.enemy || a.n - b.n);
  for (const { n, enemy } of lost) {
    // An empty lost cell still takes a formation to retake it.
    const need = Math.max(ATTACK_RATIO() * enemy, Number.MIN_VALUE);
    let got = sent.get(n) ?? 0;
    if (got >= need) continue;
    // Counter-attack only with the means to win it; short of 3:1 the screen around the cell has to hold instead.
    const near = nearest(n, fit);
    if (near.reduce((t, f) => t + power(f), got) < need) continue;
    for (const f of near) {
      committed.add(f);
      got += power(f);
      issue(p, f, { posture: 'attack', target: n });
      if (got >= need) break;
    }
  }
  for (const [n, block] of [...screen].sort((a, b) => a[0] - b[0])) {
    const f = own.find((g) => g.node === n && !committed.has(g)) ?? nearest(n, block ? () => true : (g) => !inContact(g))[0];
    if (!f) continue;
    committed.add(f);
    issue(p, f, { posture: 'defend', target: n });
  }
  return committed;
}

/**
 * A coalition's connected front split into each holder's stretch of it, with the threat
 * shared out by the enemy pressing on each cell, so one nation's duty to its own border is
 * not read as a duty to the whole line from Poland to Finland.
 */
function byHolder(p: Plan, s: Sector): Sector[] {
  const { map } = p.ctx;
  const groups = new Map<NationId, { nodes: NodeId[]; pressure: number }>();
  for (const n of s.nodes) {
    const h = p.world.control[n];
    (groups.get(h) ?? groups.set(h, { nodes: [], pressure: 0 }).get(h)!).nodes.push(n);
  }
  if (groups.size === 1) return [s];
  let total = 0;
  const holderOf = new Map<number, NationId>();
  for (const [h, g] of groups) {
    for (const n of g.nodes) {
      holderOf.set(n, h);
      let e = 2 * enemyPowerAt(n, p.index, p.enemies);
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && p.enemies.has(p.world.control[m])) e += enemyPowerAt(m, p.index, p.enemies);
      }
      g.pressure += e;
    }
    total += g.pressure;
  }
  const facing = new Map<NationId, NodeId[]>();
  for (const e of s.enemyNodes) {
    const seen = new Set<NationId>();
    for (let k = map.adjStart[e]; k < map.adjStart[e + 1]; k++) {
      const h = holderOf.get(map.adj[k]);
      if (h === undefined || seen.has(h)) continue;
      seen.add(h);
      (facing.get(h) ?? facing.set(h, []).get(h)!).push(e);
    }
  }
  return [...groups].map(([h, g]) => ({
    nodes: g.nodes,
    enemyNodes: facing.get(h) ?? [],
    battleArea: s.battleArea,
    threat: s.threat * (total > 0 ? g.pressure / total : g.nodes.length / s.nodes.length),
    key: g.nodes[0],
  }));
}

/** What the whole plan reads: the nation's fronts split by holder, and its doctrine's tests for attacking. */
interface LandPicture {
  p: Plan;
  sectors: Sector[];
  sectorOf: Map<number, Sector>;
  front: Set<number>;
  mass: Int32Array;
  theatres: Set<number>;
  attritional: boolean;
  pressAt: number;
  /** Within MAX_DRIVE_CELLS of ground the coalition held at the start. */
  inReach: (t: number) => boolean;
  fit: (f: Formation) => boolean;
  friendlyPowerAt: (n: number) => number;
  /** The enemy-held cell next to `n` with the least enemy ground power in it, or -1. */
  weakestNeighbour: (n: number) => number;
  canPress: (from: number, t: number) => boolean;
}

function landPicture(p: Plan): LandPicture | undefined {
  const { map } = p.ctx;
  const stagingKey = `staging|${p.nation}`;
  let staging = p.memo.get(stagingKey) as Sector | null | undefined;
  if (staging === undefined) p.memo.set(stagingKey, (staging = stagingSector(p.world, map, p.nation, p.friends, p.enemies, p.index) ?? null));
  if (staging) staging = { ...staging, threat: staging.enemyNodes.reduce((a, n) => a + enemyPowerAt(n, p.index, p.enemies), 0) };
  const sectors = (staging ? [...p.sectors, staging] : p.sectors).flatMap((s) => byHolder(p, s));
  if (!sectors.length) return undefined;
  const mass = landMass(map);
  const front = new Set<number>();
  const sectorOf = new Map<number, Sector>();
  for (const s of sectors)
    for (const n of s.nodes) {
      front.add(n);
      sectorOf.set(n, s);
    }
  const power = p.index.power;
  const attritional = p.profile.aggression >= AGGRESSOR;
  const pressAt = pressureRatio(p.profile.aggression, p.profile.casualtyTolerance);
  const origin = landSlice(p.world).origin;
  // Counted in one-degree cells: a finer Baltic, Korean or Israeli cell is a fraction of a step, so it does not shorten the reach.
  const inReach = (t: number) => {
    if (!origin.length) return true;
    const steps = new Map<number, number>([[t, 0]]);
    const queue = [t];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      if (p.friends.has(origin[n])) return true;
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m >= map.landCount) continue;
        const d = steps.get(n)! + 2 * map.halfDeg[m];
        if (d <= MAX_DRIVE_CELLS() + 1e-9 && d < (steps.get(m) ?? Infinity)) { steps.set(m, d); queue.push(m); }
      }
    }
    return false;
  };
  const fit = (f: Formation) => {
    const cap = f.supplyCapacity.fuel + f.supplyCapacity.ammo;
    return f.kind === 'maneuver' && strength(p.ai, f) >= FIT_TO_ATTACK.strength && (cap <= 0 || (f.supply.fuel + f.supply.ammo) / cap >= FIT_TO_ATTACK.supply);
  };
  const friendlyPowerAt = (n: number) => {
    let v = 0;
    for (const g of p.index.groundAt.get(n) ?? []) if (p.friends.has(g.nation)) v += power(g);
    return v;
  };
  const weakestNeighbour = (n: number) => {
    let best = -1, bestPower = Infinity;
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const m = map.adj[k];
      if (m >= map.landCount || !p.enemies.has(p.world.control[m])) continue;
      const e = enemyPowerAt(m, p.index, p.enemies);
      if (e < bestPower) { bestPower = e; best = m; }
    }
    return best;
  };
  const canPress = (from: number, t: number) => attritional && inReach(t) && friendlyPowerAt(from) >= pressAt * enemyPowerAt(t, p.index, p.enemies);
  return { p, sectors, sectorOf, front, mass, theatres: new Set(sectors.map((s) => mass[s.key])), attritional, pressAt, inReach, fit, friendlyPowerAt, weakestNeighbour, canPress };
}

/**
 * Orders every ground formation the homeland defence left alone that has its own business:
 * spent units pull back, units inside an enemy cell fight on, units staged on a host's ground
 * attack across its border. Returns the rest, free for the fronts.
 */
function triage(lp: LandPicture, countering: Set<Formation>): Formation[] {
  const { p, mass, theatres, front, fit, canPress, inReach, weakestNeighbour, friendlyPowerAt, attritional, pressAt } = lp;
  const { map } = p.ctx;
  const pool: Formation[] = [];
  const committed = committedFormations(p.world);
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if (!isGround(f) || map.isSea(f.node) || !theatres.has(mass[f.node]) || countering.has(f) || committed.has(f.id)) continue;
    if (needsRetreat(p, f)) {
      const to = rear(p, f.node, front);
      issue(p, f, to === f.node ? { posture: 'reserve' } : { posture: 'move', target: to });
      continue;
    }
    // Already fighting inside an enemy-held cell: hold the ground won, and keep pushing if the doctrine allows.
    if (p.enemies.has(p.world.control[f.node])) {
      if (fit(f) && f.order.posture !== 'attack' && canPress(f.node, f.node)) issue(p, f, { posture: 'attack', target: f.node });
      continue;
    }
    // Staged on a host ally's ground next to the enemy (Russian troops in Belarus): that border is a front the sector picture does not cover.
    if (!p.friends.has(p.world.control[f.node]) && fit(f)) {
      const t = weakestNeighbour(f.node);
      const ratio = attritional ? pressAt : ATTACK_RATIO();
      if (t >= 0 && inReach(t) && friendlyPowerAt(f.node) >= ratio * enemyPowerAt(t, p.index, p.enemies)) {
        issue(p, f, { posture: 'attack', target: t as NodeId });
        continue;
      }
    }
    pool.push(f);
  }
  return pool;
}

/**
 * The free formations and the rules for where each may go. A nation holds its own front first.
 * A partner's front is a commitment: the nation covers, in proportion to its treaty obligation,
 * only the part of the threat the coalition has not already manned, sends only formations
 * released for service abroad, and keeps at least half its army home. Territorial forces never
 * leave their own soil.
 */
class Allocation {
  readonly total: number;
  readonly free: Set<Formation>;
  private readonly released: Set<Formation>;
  private readonly ownSectors: Set<Sector>;
  private readonly ownSoil: Set<Sector>;
  private readonly region: Int32Array;
  /** Power the nation may still send onto partners' soil. */
  private abroadBudget: number;

  constructor(readonly lp: LandPicture, readonly pool: Formation[]) {
    const { p, sectors, mass, theatres } = lp;
    const { map } = p.ctx;
    const power = p.index.power;
    this.total = pool.reduce((a, f) => a + power(f), 0);
    this.free = new Set(pool);
    this.region = passableRegions(p);
    this.ownSectors = new Set(sectors.filter((s) => s.nodes.some((n) => map.owner[n] === p.nation || p.world.control[n] === p.nation)));
    this.ownSoil = new Set(sectors.filter((s) => s.nodes.some((n) => map.owner[n] === p.nation)));
    this.released = new Set(pool.filter((f) => releasable(p, f)));
    // The share is of the whole army in the theatre. Formations on a partner's soil, fighting or not, have spent it; ground the
    // nation holds itself (occupied or captured) is not a partner's. A nation that started the war deploys to its own plan instead.
    const onPartnerSoil = (f: Formation) => p.world.control[f.node] !== f.nation && map.owner[f.node] !== f.nation;
    this.abroadBudget = aggressor(p) ? Infinity : 0;
    for (const f of p.index.byNation.get(p.nation) ?? []) {
      if (!isGround(f) || map.isSea(f.node) || !theatres.has(mass[f.node])) continue;
      this.abroadBudget += onPartnerSoil(f) ? (FOREIGN_SHARE - 1) * power(f) : FOREIGN_SHARE * power(f);
    }
  }

  km(a: number, b: number): number {
    return this.lp.p.ctx.map.distanceKm(a as NodeId, b as NodeId);
  }

  inRange(f: Formation, n: number): boolean {
    return this.km(f.node, n) <= MAX_COMMIT_KM && this.region[f.node] >= 0 && this.region[f.node] === this.region[n];
  }

  own(s: Sector): boolean {
    return this.ownSectors.has(s);
  }

  mayServe(f: Formation, s: Sector): boolean {
    return f.territorial ? this.atHome(f) && this.ownSoil.has(s) : this.own(s) || !this.atHome(f) || this.released.has(f);
  }

  /** Whether sending `f` to `s` would take it out of the country with the share of the army allowed out spent. */
  overBudget(f: Formation, s: Sector): boolean {
    return this.leaves(f, s) && this.abroadBudget < this.lp.p.index.power(f);
  }

  /** Charges `f` against the share allowed abroad when sending it to `s` takes it out of the country. */
  spend(f: Formation, s: Sector): void {
    if (this.leaves(f, s)) this.abroadBudget -= this.lp.p.index.power(f);
  }

  private atHome(f: Formation): boolean {
    return this.lp.p.ctx.map.owner[f.node] === f.nation;
  }

  private leaves(f: Formation, s: Sector): boolean {
    return !this.own(s) && this.atHome(f) && this.lp.sectorOf.get(f.node) !== s;
  }
}

/** Partners' troops on each front cell or ordered onto it. */
function partnersOnLine(lp: LandPicture): Map<number, number> {
  const { p, sectorOf } = lp;
  const others = new Map<number, number>();
  for (const n of p.friends) {
    if (n === p.nation) continue;
    for (const g of p.index.byNation.get(n) ?? []) {
      if (!isGround(g)) continue;
      const t = g.order.target;
      const at = sectorOf.has(g.node) ? g.node : t !== undefined && sectorOf.has(t) && g.order.posture !== 'reserve' ? t : -1;
      if (at >= 0) others.set(at, (others.get(at) ?? 0) + p.index.power(g));
    }
  }
  return others;
}

/** Enemy pressure on a line cell: what stands in it, twice over, and what stands in the enemy cells next to it. */
function pressureOn(p: Plan, n: number): number {
  const { map } = p.ctx;
  let e = 2 * enemyPowerAt(n, p.index, p.enemies);
  for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
    const m = map.adj[k];
    if (m < map.landCount && p.enemies.has(p.world.control[m])) e += enemyPowerAt(m, p.index, p.enemies);
  }
  return e;
}

/** Mans every sector in proportion to the threat against it, own fronts first, partners' as committed. Returns the power now holding each line cell. */
function holdTheLine(a: Allocation, reserved: number): Map<number, number> {
  const { lp, pool, free } = a;
  const { p, sectors, sectorOf, fit, canPress, weakestNeighbour, attritional } = lp;
  const power = p.index.power;
  /** The weakest adjacent enemy cell the line units in `n` can assault under attritional doctrine, or -1. */
  const pressureTarget = (n: number) => {
    if (!attritional) return -1;
    const best = weakestNeighbour(n);
    return best >= 0 && canPress(n, best) ? best : -1;
  };
  const others = partnersOnLine(lp);
  const need = sectors.map((s) => {
    if (!pool.some((f) => a.inRange(f, s.key) && a.mayServe(f, s))) return 0;
    const covered = s.nodes.reduce((t, n) => t + (others.get(n) ?? 0), 0);
    return Math.max(0, s.threat / HOLD_RATIO - covered) * commitment(p.nation, p.world.control[s.key]);
  });
  const needTotal = need.reduce((x, y) => x + y, 0);
  // However short the line, the reserve is not fed into it: it is kept back to meet the enemy's main effort (FM 3-90).
  const lineBudget = a.total - reserved;
  const scale = needTotal > lineBudget ? lineBudget / needTotal : 1;
  const manned = new Map<number, number>();
  const byDuty = sectors.map((_, i) => i).sort((x, y) => Number(a.own(sectors[y])) - Number(a.own(sectors[x])) || need[y] - need[x] || x - y);
  for (const i of byDuty) {
    const s = sectors[i];
    const req = need[i] * scale;
    // A unit already on a cell of this line stays on it; one marching to it keeps its post.
    const post = (f: Formation): number | undefined => {
      if (sectorOf.get(f.node) === s) return f.node;
      const t = f.order.target;
      return f.order.posture === 'defend' && t !== undefined && sectorOf.get(t) === s ? t : undefined;
    };
    const candidates = [...free]
      .filter((f) => a.mayServe(f, s) && (post(f) !== undefined || a.inRange(f, s.key)))
      .sort((x, y) => a.km(x.node, s.key) - a.km(y.node, s.key) || (x.id < y.id ? -1 : 1));
    const pressure = new Map<number, number>();
    for (const n of s.nodes) {
      pressure.set(n, pressureOn(p, n));
      manned.set(n, others.get(n) ?? 0);
    }
    let got = 0;
    const assign = (f: Formation, target: number) => {
      if (a.overBudget(f, s)) return;
      a.spend(f, s);
      manned.set(target, manned.get(target)! + power(f));
      const push = f.node === target && fit(f) ? pressureTarget(target) : -1;
      issue(p, f, push >= 0 ? { posture: 'attack', target: push as NodeId } : { posture: 'defend', target: target as NodeId });
      free.delete(f);
      got += power(f);
    };
    const short = (n: number) => manned.get(n)! < pressure.get(n)! / HOLD_RATIO;
    // Units standing on the line hold their cells while their cell needs them.
    for (const f of candidates) if (sectorOf.get(f.node) === s && (!manned.get(f.node) || short(f.node))) assign(f, f.node);
    // An unmanned cell on the line is a gap the enemy walks through, so every cell gets the nearest
    // free unit as a screen before any is reinforced; a far unit marching in leaves the cell open for days.
    for (const n of s.nodes) {
      if (manned.get(n)) continue;
      let best: Formation | undefined, bestKm = Infinity;
      for (const f of candidates) {
        if (!free.has(f) || a.overBudget(f, s)) continue;
        const d = a.km(f.node, n);
        if (d < bestKm) { bestKm = d; best = f; }
      }
      if (best) assign(best, n);
    }
    // Then newcomers go where the enemy presses hardest relative to what already holds there.
    for (const f of candidates) {
      if (got >= req) break;
      if (!free.has(f) || a.overBudget(f, s)) continue;
      let target = post(f);
      if (target === undefined || !short(target)) {
        let gap = -Infinity;
        for (const n of s.nodes) {
          const g = pressure.get(n)! / HOLD_RATIO - manned.get(n)!;
          if (g > gap) { gap = g; target = n; }
        }
      }
      assign(f, target!);
    }
  }
  return manned;
}

/** A cell pressed this much harder than the line's average is where the enemy's main effort is falling (judgment). */
const MAIN_EFFORT_PRESSURE = 2;

/**
 * Commits the reserve against the enemy's main effort: line cells pressed far harder than the rest of the line, where
 * the enemy has the 3:1 it needs, get the nearest reserve formations until it no longer does, worst first, up to half
 * the reserve.
 */
function meetMainEffort(a: Allocation, reserve: Set<Formation>, manned: Map<number, number>): void {
  const { lp } = a;
  const { p, front } = lp;
  if (!reserve.size || !front.size) return;
  const power = p.index.power;
  const pressure = new Map<number, number>();
  let total = 0;
  for (const n of front) {
    const e = pressureOn(p, n);
    pressure.set(n, e);
    total += e;
  }
  const mean = total / front.size;
  const held = (n: number) => manned.get(n) ?? lp.friendlyPowerAt(n);
  const threatened = [...front]
    .filter((n) => pressure.get(n)! >= MAIN_EFFORT_PRESSURE * mean && pressure.get(n)! > ATTACK_RATIO() * held(n))
    .sort((x, y) => pressure.get(y)! / Math.max(1e-9, held(y)) - pressure.get(x)! / Math.max(1e-9, held(x)) || x - y);
  // Half the reserve at most, so a second thrust still meets one.
  let budget = Math.floor(reserve.size / 2);
  for (const n of threatened) {
    if (budget <= 0) break;
    const s = lp.sectorOf.get(n)!;
    const near = [...reserve].filter((f) => a.inRange(f, n) && a.mayServe(f, s) && !a.overBudget(f, s)).sort((x, y) => a.km(x.node, n) - a.km(y.node, n) || (x.id < y.id ? -1 : 1));
    for (const f of near) {
      if (pressure.get(n)! <= ATTACK_RATIO() * held(n) || budget <= 0) break;
      budget--;
      reserve.delete(f);
      a.spend(f, s);
      manned.set(n, held(n) + power(f));
      issue(p, f, { posture: 'defend', target: n as NodeId });
    }
  }
}

/** What an assault on enemy cell `t` meets: the troops in it, and half of those in the enemy cells next to it, whose fire covers it. */
function defenceOf(p: Plan, t: number): number {
  const { map } = p.ctx;
  let d = enemyPowerAt(t, p.index, p.enemies);
  for (let k = map.adjStart[t]; k < map.adjStart[t + 1]; k++) {
    const m = map.adj[k];
    if (m < map.landCount && p.enemies.has(p.world.control[m])) d += 0.5 * enemyPowerAt(m, p.index, p.enemies);
  }
  return d;
}

/** A failed or cancelled main effort is not tried again on the same objective for this long (judgment: a staff re-plans rather than repeats). */
const RETRY_OBJECTIVE_DAYS = 5;
/** Smallest main effort, in the nation's average formations: a division's worth of brigades (judgment). */
const MIN_EFFORT_UNITS = 3;
/** Share of the spare force the main effort takes; supporting directions get only what their axis needs (judgment). */
const MAIN_EFFORT_SHARE = 0.3;
/** Weight of an axis mounted from a host's ground rather than the nation's own (judgment: its railheads and depots are its own). */
const HOSTED_AXIS = 0.8;
/** Artillery this close to the line of departure goes with an operation. */
const GUNS_KM = 400;

/**
 * Main efforts. A general staff does not attack everywhere at once: on each strategic direction (each enemy state it
 * invades) it picks the axis toward the war aim worth most for what defends it, masses a force on it as an operation,
 * and leaves supporting attacks and the reserve to what is left (FM 3-0 "main effort"; Soviet operational art's axis
 * of main attack, Glantz 1991). RAND's Baltic games (Shlapak and Johnson 2016) reach Tallinn or Riga in 36-60 hours on
 * such thrusts. Only a nation that started the war runs them, one per direction, no deeper than its culmination point,
 * and it feeds one whose force has worn below what the rest of its axis needs. On a fortified, drone-watched front it keeps up attritional pressure
 * instead, as Russia did in 2023-25 (ISW): no deep operation is aimed into the belts.
 */
function mainEffort(a: Allocation): void {
  const { lp, free, pool } = a;
  const { p, front, fit, inReach, mass, sectorOf } = lp;
  const { map } = p.ctx;
  if (!aggressor(p)) return;
  const power = p.index.power;
  const unit = a.total / pool.length;
  const take = (near: NodeId, need: number, s: Sector | undefined): Formation[] => {
    const group: Formation[] = [];
    let got = 0;
    const candidates = [...free]
      .filter((f) => f.kind === 'maneuver' && fit(f) && a.inRange(f, near) && (!s || (a.mayServe(f, s) && !a.overBudget(f, s))))
      .sort((x, y) => a.km(x.node, near) - a.km(y.node, near) || (x.id < y.id ? -1 : 1));
    for (const f of candidates) {
      if (got >= need) break;
      group.push(f);
      got += power(f);
      free.delete(f);
      if (s) a.spend(f, s);
    }
    return group;
  };
  let spare = [...free].reduce((t, f) => t + power(f), 0) - reserveShare(p.profile.aggression) * a.total;
  /** The force an axis needs: the attacker's ratio against every defended bound on it, and never less than a division's worth. */
  const needFor = (axis: readonly NodeId[], from: number) => {
    let d = 0;
    for (let i = Math.max(1, from); i < axis.length; i++) if (p.enemies.has(p.world.control[axis[i]])) d += defenceOf(p, axis[i]);
    return Math.max(ATTACK_RATIO() * d, MIN_EFFORT_UNITS * unit);
  };

  const ops = Object.values(p.world.slices.ops?.byId ?? {}).filter((o) => o.nation === p.nation && o.planner === 'ai');
  const directions = new Set<NationId>();
  for (const o of ops) {
    if (!ACTIVE.has(o.phase)) continue;
    directions.add(map.owner[o.objectives[0]]);
    if (spare <= 0) continue;
    const have = o.formations.reduce((t, id) => t + (p.world.formations[id] ? power(p.world.formations[id]) : 0), 0);
    const need = Math.min(needFor(o.axis, o.progress.bound) - have, spare);
    if (need <= 0) continue;
    const more = take(o.axis[Math.max(0, o.progress.bound - 1)], need, sectorOf.get(o.axis[0]));
    spare -= more.reduce((t, f) => t + power(f), 0);
    if (more.length) p.out.push({ type: 'adjust_operation', nation: p.nation, operation: o.id, formations: [...o.formations, ...more.map((f) => f.id)] });
  }

  const recent = (o: Operation) => o.endedTick !== undefined && o.phase !== 'succeeded' && (p.world.tick - o.endedTick) * p.world.dtHours < RETRY_OBJECTIVE_DAYS * 24;
  const tried = new Set<number>(ops.filter(recent).flatMap((o) => o.objectives));
  const { fortified } = landSlice(p.world);
  const best = new Map<NationId, { axis: NodeId[]; score: number }>();
  for (const aim of p.ai.aims[p.nation] ?? []) {
    const direction = map.owner[aim.node];
    if (directions.has(direction) || !p.enemies.has(p.world.control[aim.node]) || !lp.theatres.has(mass[aim.node])) continue;
    let from = -1, fromKm = Infinity;
    for (const n of front) {
      const km = mass[n] === mass[aim.node] ? map.distanceKm(n as NodeId, aim.node) : Infinity;
      if (km < fromKm) { fromKm = km; from = n; }
    }
    if (from < 0) continue;
    // Through the gaps, not the strongpoints: the route avoids believed defenders the way it avoids bad going.
    const route = routeAxis(p.world, map, p.nation, [from as NodeId, aim.node], (n) => (p.enemies.has(p.world.control[n]) ? defenceOf(p, n) / unit : 0));
    if (!route) continue;
    let end = 1;
    while (end < route.length && inReach(route[end]) && p.enemies.has(p.world.control[route[end]])) end++;
    const axis = route.slice(0, end);
    if (axis.length < 2 || tried.has(axis[axis.length - 1]) || axis.slice(1, 3).some((n) => fortified[n])) continue;
    // An axis mounted from the nation's own soil runs on its own railheads; one from a host's ground is second choice.
    const base = p.world.control[axis[0]] === p.nation ? 1 : HOSTED_AXIS;
    const score = (base * aim.value * axis.length) / route.length / (1 + defenceOf(p, axis[1]) / unit);
    if (score > (best.get(direction)?.score ?? -Infinity)) best.set(direction, { axis, score });
  }
  let first = true;
  for (const { axis } of [...best.values()].sort((x, y) => y.score - x.score || x.axis[0] - y.axis[0])) {
    const need = needFor(axis, 1);
    if (spare < need) continue;
    // The main effort gets the mass; the other directions get what their axis needs.
    const group = take(axis[0], first ? Math.max(need, MAIN_EFFORT_SHARE * spare) : need, sectorOf.get(axis[0]));
    const got = group.reduce((t, f) => t + power(f), 0);
    if (got < need) {
      for (const f of group) free.add(f);
      continue;
    }
    spare -= got;
    first = false;
    // Guns go with it: half a battalion group of artillery per manoeuvre formation, nearest first.
    const guns = [...free]
      .filter((f) => f.kind === 'artillery' && a.inRange(f, axis[0]) && a.km(f.node, axis[0]) <= GUNS_KM)
      .sort((x, y) => a.km(x.node, axis[0]) - a.km(y.node, axis[0]) || (x.id < y.id ? -1 : 1))
      .slice(0, Math.ceil(group.length / 2));
    for (const g of guns) free.delete(g);
    p.out.push({ type: 'plan_operation', nation: p.nation, kind: 'offensive', objectives: [axis[axis.length - 1]], axis, formations: [...group, ...guns].map((f) => f.id), launch: true });
  }
}

/** Sends spare power beyond the reserve to sectors where a local 3:1 can be assembled, weighted toward the war aims. */
function launchAttacks(a: Allocation): void {
  const { lp, pool, free } = a;
  const { p, sectors, fit, inReach } = lp;
  const { map } = p.ctx;
  const power = p.index.power;
  let spare = [...free].reduce((t, f) => t + power(f), 0) - reserveShare(p.profile.aggression) * a.total;
  const aims = p.ai.aims[p.nation] ?? [];
  const pull = (t: number) => {
    let best = 0;
    for (const o of aims) best = Math.max(best, o.value / (1 + a.km(t, o.node) / 300));
    return best;
  };
  const defence = (t: number) => defenceOf(p, t);
  const unit = a.total / pool.length;
  for (const s of sectors) {
    if (spare <= 0 || !free.size) break;
    let target = -1, bestScore = -1, targetDefence = 0;
    for (const t of s.enemyNodes) {
      if (!inReach(t)) continue;
      const d = defence(t);
      const score = (1 + pull(t)) / (1 + d / unit);
      if (score > bestScore) { bestScore = score; target = t; targetDefence = d; }
    }
    if (target < 0) continue;
    const required = ATTACK_RATIO() * targetDefence;
    if (required > spare) continue;
    const assaulting = (f: Formation) => f.order.posture === 'attack' && f.order.target === target;
    const group: Formation[] = [];
    let got = 0;
    const candidates = [...free]
      .filter((f) => fit(f) && a.mayServe(f, s) && !a.overBudget(f, s) && (assaulting(f) || a.inRange(f, s.key)))
      .map((f) => ({ f, d: assaulting(f) ? 0 : a.km(f.node, target) }))
      .sort((x, y) => x.d - y.d || (x.f.id < y.f.id ? -1 : 1));
    for (const { f } of candidates) {
      if (group.length && got >= required) break;
      group.push(f);
      got += power(f);
    }
    if (!group.length || got < required || got > spare + 1e-9) continue;
    for (const f of group) {
      issue(p, f, { posture: 'attack', target: target as NodeId });
      free.delete(f);
      a.spend(f, s);
    }
    spare -= got;
  }
}

/**
 * Sets the operational reserve aside before the line is manned: formations out of contact, those already in reserve
 * first, then the nearest to the front, up to SHORT_LINE_RESERVE of the command's reserve share. A short line does not swallow it; it is
 * kept for the enemy's main effort or one's own (FM 3-90: the reserve is committed at the decisive point, not spread).
 */
function keepReserve(a: Allocation): Set<Formation> {
  const { lp, free } = a;
  const { p, sectors, sectorOf } = lp;
  const { map } = p.ctx;
  const power = p.index.power;
  const want = SHORT_LINE_RESERVE() * reserveShare(p.profile.aggression) * a.total;
  const touching = (f: Formation) => {
    if (sectorOf.has(f.node) || p.enemies.has(p.world.control[f.node])) return true;
    for (let k = map.adjStart[f.node]; k < map.adjStart[f.node + 1]; k++) if (map.adj[k] < map.landCount && p.enemies.has(p.world.control[map.adj[k]])) return true;
    return false;
  };
  const toFront = (f: Formation) => Math.min(...sectors.map((s) => (a.inRange(f, s.key) ? a.km(f.node, s.key) : Infinity)));
  const kept = new Set<Formation>();
  let got = 0;
  const candidates = [...free]
    .filter((f) => f.kind === 'maneuver' && !touching(f))
    .map((f) => ({ f, d: toFront(f), r: f.order.posture === 'reserve' ? 0 : 1 }))
    .filter((c) => c.d <= MAX_COMMIT_KM)
    .sort((x, y) => x.r - y.r || x.d - y.d || (x.f.id < y.f.id ? -1 : 1));
  for (const { f } of candidates) {
    if (got >= want) break;
    kept.add(f);
    free.delete(f);
    got += power(f);
  }
  return kept;
}

/** Puts everything left in reserve behind the nearest sector it may serve on without leaving the country beyond its share. */
function holdReserve(a: Allocation): void {
  const { lp, free } = a;
  const { p, sectors, front } = lp;
  const rearOf = new Map<Sector, NodeId>();
  for (const f of free) {
    let near = sectors[0], bestD = Infinity;
    for (const s of sectors) {
      const d = a.inRange(f, s.key) && a.mayServe(f, s) && !a.overBudget(f, s) ? a.km(f.node, s.key) : Infinity;
      if (d < bestD) { bestD = d; near = s; }
    }
    if (bestD > MAX_COMMIT_KM) continue;
    a.spend(f, near);
    if (!rearOf.has(near)) rearOf.set(near, rear(p, near.key, front));
    issue(p, f, { posture: 'reserve', target: rearOf.get(near)! });
  }
}

/**
 * Operational plan for one nation's ground forces: defend the homeland, pull back spent units,
 * man every sector in proportion to the threat against it, mass a main effort on one axis,
 * launch other attacks only where a local 3:1 can be assembled, and keep the rest in reserve.
 */
export function planLand(p: Plan): void {
  const lp = landPicture(p);
  if (!lp) return;
  const pool = triage(lp, defendHomeland(p, lp.fit));
  if (!pool.length) return;
  const a = new Allocation(lp, pool);
  // A defender keeps its reserve out of the line to meet the enemy's main effort; an attacker's reserve is what its own
  // main effort and attacks are mounted from, below.
  const reserve = aggressor(p) ? new Set<Formation>() : keepReserve(a);
  const manned = holdTheLine(a, [...reserve].reduce((t, f) => t + p.index.power(f), 0));
  meetMainEffort(a, reserve, manned);
  for (const f of reserve) a.free.add(f);
  mainEffort(a);
  launchAttacks(a);
  holdReserve(a);
}
