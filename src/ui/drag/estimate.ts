/**
 * The pill's numbers: pure functions of the kit, so they read belief and public facts only. Ground outcomes are a
 * lookup into QUICK, which `runOperation` duels produced, by the numbers land/combat moves a line by: the local fire
 * ratio, the share of the cell's front the attack fills and the share the defence mans. Strikes run the engine's own salvo math at its expectation.
 */
import type { GameMap } from '../../core/map';
import type { NodeId } from '../../core/types';
import { QUICK, type QuickCell, type QuickTable, type QuickTables } from '../../forecast/quick';
import { interceptSalvo, MEAN_RNG } from '../../systems/air/intercept';
import { CELL_FRONT_KM, FRONTAGE_PLATFORMS, KILL_ZONE_COMMIT, KILL_ZONE_DENSITY, SCREEN_DENSITY, TERRAIN, URBAN_MANOEUVRE } from '../../systems/land/tables';
import { cellDepthKm } from '../../systems/land/state';
import type { PublicRefusal, Target } from './gesture';
import { assaultPath, FORCE, LAND_TARGETS, routeKm, type BeliefField, type DragKit, type LandForce, type SubjectUnit } from './kit';

/** A belief-driven range. lo/hi come from re-running the estimate at the edges of intel confidence. */
export interface Band { lo: number; mid: number; hi: number }

export type Caveat = 'intel_old' | 'nothing_seen' | 'out_of_supply' | 'moving_target_old_fix' | 'far' | 'widens_war';

export type Pill = { who: { going: number; staying: number }; caveats: Caveat[]; refined?: Band } & (
  | { kind: 'refused'; code: PublicRefusal; reason: string }
  | { kind: 'take'; p: Band; loss: number; etaHours: number }
  | { kind: 'hold'; days: Band; etaHours: number; cells: number }
  | { kind: 'strike'; through: Band; of: number }
  | { kind: 'contest'; ratio: Band; seen: number }
  | { kind: 'arrive'; etaHours: number }
);

/** `cells` is the cell each going unit takes: its own front cell for hold_front, else the target for all. */
export type Estimator = (kit: DragKit, going: SubjectUnit[], t: Target, cells: NodeId[], map: GameMap) => Pill;

const NOBODY = { going: 0, staying: 0 };
/** Fix ages past this read as old intelligence (two days). */
const OLD_FIX_H = 48;
/** A contact fixed longer ago than this may have moved off the aim point. */
const MOVED_H = 6;
/** An arrival past this is a long march: the picture will have changed by then. */
const FAR_H = 7 * 24;
/** Radius of a patrol or blockade zone, km: about a day's steaming for a task group (judgment). */
const ZONE_KM = 300;
/** Supply below this (hundredths of supplyFactor) at an attacked cell means the last mile across the line (about 25) does not reach it. */
const SUPPLY_FLOOR = 20;
/** Hold estimates stop at a month: past that the duel tables say nothing. */
export const HOLD_CAP_DAYS = 30;

/** Uncertainty of a believed force: low confidence and an old fix both widen the band. */
const spread = (conf: number, ageH: number) => 1 - conf + Math.min(0.3, ageH / 240);
/** Believed enemy strength at the low, mid and high edges of `u`, in Band order of the outcome it gives the player (lo = enemy strongest). */
const edges = (u: number) => [1 + u, 1, 1 / (1 + u)] as const;

const K = LAND_TARGETS.length;
const platformsOf = (x: LandForce) => x[0] + x[1] + x[2];

/** The fire `x` puts on `y`'s mix (land/combat fireRatio's numerator): direct fire only from the platforms that fit a front, unless the `whole` force counts. */
function fireOn(x: LandForce, y: LandForce, whole: boolean): number {
  const yt = platformsOf(y);
  if (yt <= 0) return 0;
  const inLine = whole ? 1 : Math.min(1, FRONTAGE_PLATFORMS() / Math.max(1, platformsOf(x)));
  let v = 0;
  for (let c = 0; c < K; c++) v += (x[K + c] * inLine + x[2 * K + c]) * (y[c] / yt);
  return v;
}

/** The local force ratio an assault of `a` on `d` is fought at (land/combat fireRatio). */
export const fireRatio = (a: LandForce, d: LandForce, whole = false): number => fireOn(a, d, whole) / Math.max(1e-9, fireOn(d, a, whole));

/** Where an assault reads in the duel tables (estimate axesAt). */
export interface Axes {
  /** The local fire ratio over the terrain's defence, whose edge (land/combat defensiveEdge) cuts the attacker's kills and raises its losses. */
  r: number;
  /**
   * land/combat sector, the share of the front the attacker's platforms fill once a manned belt keeps part of them out
   * of its kill zone (without air control), carried to the duel cell: advanceKm moves the line by sector x pace /
   * moveCost, a fifth of that in a city, and a deeper cell takes proportionally longer to cross.
   */
  s: number;
  /** land/combat manned, the share of the front the defender's platforms hold: the gaps it leaves, and how soon fire destroys it. */
  m: number;
}

/**
 * Where `att` assaulting `def` in cell `n`, bare or behind a belt (`fort`), reads in the duel tables, fought on a plain
 * cell `depthKm` deep. `pace` is the ground's pace at `n` over the duel cell's (weather groundFactorAt: mud and snow).
 */
export function axesAt(map: GameMap, n: NodeId, att: LandForce, def: LandForce, fort: number, pace = 1, depthKm = QUICK.depthKm): Axes {
  const depth = cellDepthKm(map, n);
  const front = (FRONTAGE_PLATFORMS() * depth) / CELL_FRONT_KM;
  const prepared = fort * Math.min(1, platformsOf(def) / (KILL_ZONE_DENSITY() * depth));
  const committed = 1 - (1 - KILL_ZONE_COMMIT()) * prepared;
  const sector = Math.min(1, (platformsOf(att) * committed) / front);
  const { defense, moveCost } = TERRAIN[map.terrain[n]];
  const s = (sector * pace * (map.terrain[n] === 'urban' ? URBAN_MANOEUVRE() : 1) * depthKm) / (moveCost * depth);
  return { r: fireRatio(att, def) / defense, s, m: platformsOf(def) / front };
}

/**
 * Where crossing empty cell `n` under the fire of `cover`, the line next to it, reads in the covered tables, fought on a
 * plain cell `depthKm` deep (land/combat advanceKm with no one holding the cell): the fire ratio counts every direct
 * weapon of both sides, and the share of the front the attack fills has no kill zone holding part of it back.
 */
export function coverAxes(map: GameMap, n: NodeId, att: LandForce, cover: LandForce, pace = 1, depthKm = QUICK.depthKm): Pick<Axes, 'r' | 's'> {
  const depth = cellDepthKm(map, n);
  const sector = Math.min(1, platformsOf(att) / (SCREEN_DENSITY() * depth));
  return { r: fireRatio(att, cover, true), s: (sector * pace * depthKm) / (TERRAIN[map.terrain[n]].moveCost * depth) };
}

/** `t` at `at`, interpolated in the log of each axis and clamped to the table. */
export function quickAt(at: Axes, t: QuickTable = QUICK.open.bare, tables: QuickTables = QUICK): QuickCell {
  const c = cornerOf(at, tables);
  return { pTake: cellField(t, c, 'pTake'), days: cellField(t, c, 'days'), attLoss: cellField(t, c, 'attLoss') };
}

/** `t`'s covered table at `at`, interpolated as quickAt. */
export function coveredAt(at: Pick<Axes, 'r' | 's'>, t: QuickTable = QUICK.open.bare, tables: QuickTables = QUICK): QuickCell {
  const c = cornerOf({ ...at, m: 0 }, tables);
  const field = (key: keyof QuickCell) => {
    const v = (x: number, y: number) => t.covered[x][y][key];
    return lerp(lerp(v(c.i, c.j), v(c.i, c.j + 1), c.kj), lerp(v(c.i + 1, c.j), v(c.i + 1, c.j + 1), c.kj), c.ki);
  };
  return { pTake: field('pTake'), days: field('days'), attLoss: field('attLoss') };
}

/** Where a reading falls on the table's axes: the index below it on each and how far it lies toward the next. */
interface Corner { i: number; ki: number; j: number; kj: number; k: number; kk: number }

function cornerOf(at: Axes, tables: QuickTables): Corner {
  const [i, ki] = bracket(tables.ratios, at.r), [j, kj] = bracket(tables.shares, at.s), [k, kk] = bracket(tables.manned, at.m);
  return { i, ki, j, kj, k, kk };
}

/** One field of `t`'s duel cells at `c`, by manned, then share, then ratio. */
function cellField(t: QuickTable, c: Corner, key: keyof QuickCell): number {
  const v = (x: number, y: number) => lerp(t.cells[x][y][c.k][key], t.cells[x][y][c.k + 1][key], c.kk);
  return lerp(lerp(v(c.i, c.j), v(c.i, c.j + 1), c.kj), lerp(v(c.i + 1, c.j), v(c.i + 1, c.j + 1), c.kj), c.ki);
}

/** The index below `x` on the ascending `axis` and how far `x` lies toward the next, in ln x, clamped to the ends. */
function bracket(axis: readonly number[], x: number): [number, number] {
  const last = axis.length - 2;
  if (!(x > axis[0])) return [0, 0];
  if (x >= axis[last + 1]) return [last, 1];
  let i = 0;
  while (axis[i + 1] < x) i++;
  return [i, Math.log(x / axis[i]) / Math.log(axis[i + 1] / axis[i])];
}

/** `x` and `y` mixed `k` of the way to `y`; an Infinity days mixes as a step. */
const lerp = (x: number, y: number, k: number) => (Number.isFinite(x) && Number.isFinite(y) ? x + (y - x) * k : k < 1 ? x : y);

/** `a` and `b` mixed `k` of the way to `b`, as lerp. */
function mix(a: QuickCell, b: QuickCell, k: number): QuickCell {
  return { pTake: lerp(a.pTake, b.pTake, k), days: lerp(a.days, b.days, k), attLoss: lerp(a.attLoss, b.attLoss, k) };
}

/** `out` plus `w` times the LandForce `src` holds for node `n`. */
function addAt(out: LandForce, src: Float32Array, n: number, w = 1): LandForce {
  const at = n * FORCE;
  for (let i = 0; i < out.length; i++) out[i] += w * src[at + i];
  return out;
}

/** `out` plus `src` at each land neighbour of `n` that is hostile, or with `hostile` false each that is not (where own guns may stand). */
function addAround(out: LandForce, src: Float32Array, f: BeliefField, map: GameMap, n: NodeId, hostile = true): LandForce {
  for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
    const m = map.adj[k];
    if (m < map.landCount && !!f.hostile[m] === hostile) addAt(out, src, m);
  }
  return out;
}

/** Who stands against an attack on a cell: its defenders, the line next to an empty cell, or no one. */
type Defence = { held: LandForce } | { covered: LandForce } | null;

/**
 * `att` attacking cell `n`, on its side of a river or across one, mixed from bare to fortified by the believed belt:
 * assaulting its defenders, or crossing it empty under the fire of the line next to it (land/combat advanceKm).
 */
function takeAt(f: BeliefField, map: GameMap, n: NodeId, att: LandForce, against: Defence): QuickCell {
  const ground = QUICK[f.river[n] ? 'river' : 'open'], dig = f.enemyDig[n];
  const pace = (t: QuickTable) => f.ground[n] / t.ground;
  const both = (read: (t: QuickTable, fort: number) => QuickCell) => mix(read(ground.bare, 0), read(ground.fortified, 1), dig);
  if (!against) return both((t) => t.unopposed);
  if ('covered' in against) return both((t) => coveredAt(coverAxes(map, n, att, against.covered, pace(t)), t));
  return both((t, fort) => quickAt(axesAt(map, n, att, against.held, fort, pace(t)), t));
}

/** `x` with every number times `k`: a force believed `k` times as large. */
const times = (x: LandForce, k: number) => x.map((v) => v * k);

/** Hours until the slowest of `going` stands at its cell, counting the order's trip down the chain of command. */
function eta(kit: DragKit, going: SubjectUnit[], cellOf: (i: number) => NodeId, posture: 'attack' | 'move'): number {
  let h = 0;
  going.forEach((u, i) => {
    const km = routeKm(kit, u, cellOf(i), posture);
    h = Math.max(h, u.c2DelayHours + (km === 0 ? 0 : km > 0 && u.kmPerDay > 0 ? (km / u.kmPerDay) * 24 : Infinity));
  });
  return h;
}

const sum = (us: SubjectUnit[]) => us.reduce((s, u) => s + u.power, 0);

/**
 * The believed defence of enemy ground `n` against `att`, as land/combat fights a cell: the land forces in it, with the
 * guns next to it on both sides joining in. An empty cell is crossed under the fire of the line next to it. Rows are
 * in Band order.
 */
function oddsAt(f: BeliefField, map: GameMap, n: NodeId, att: LandForce) {
  const held = addAt(new Float32Array(FORCE), f.enemyForce, n);
  if (platformsOf(held) > 0) {
    addAround(held, f.enemyGuns, f, map, n);
    const own = addAround(att.slice(), f.ownGuns, f, map, n, false);
    const u = spread(f.enemyConf[n], f.enemyAgeH[n]);
    return { believed: f.enemyPower[n], age: f.enemyAgeH[n], rows: edges(u).map((k) => takeAt(f, map, n, own, { held: times(held, k) })) };
  }
  const cover = addAround(new Float32Array(FORCE), f.enemyLine, f, map, n);
  let believed = 0, conf = 0, age = Infinity;
  for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
    const m = map.adj[k];
    if (m >= map.landCount || !f.hostile[m]) continue;
    believed += f.enemyPower[m];
    conf += f.enemyPower[m] * f.enemyConf[m];
    age = Math.min(age, f.enemyAgeH[m]);
  }
  if (platformsOf(cover) <= 0) {
    const q = takeAt(f, map, n, att, null);
    return { believed: 0, age, rows: [q, q, q] };
  }
  const u = spread(believed > 0 ? conf / believed : 0, age);
  return { believed: 0, age, rows: edges(u).map((k) => takeAt(f, map, n, att, { covered: times(cover, k) })) };
}

export const estimateTake: Estimator = (kit, going, t, _cells, map) => {
  const f = kit.field, n = t.node;
  const caveats: Caveat[] = [];
  const etaHours = eta(kit, going, () => n, 'attack');
  if (etaHours > FAR_H) caveats.push('far');
  if (f.supply[n] < SUPPLY_FLOOR) caveats.push('out_of_supply');
  // A unit standing in enemy ground fights for that cell before it moves on (land/movement march), so it adds nothing elsewhere yet.
  const A = new Float32Array(FORCE);
  for (const u of going) if (u.node === n || !f.hostile[u.node]) for (let i = 0; i < A.length; i++) A[i] += u.force[i];
  if (platformsOf(A) <= 0) return { kind: 'take', who: NOBODY, caveats, p: { lo: 0, mid: 0, hi: 0 }, loss: 0, etaHours };
  const at = oddsAt(f, map, n, A);
  if (at.believed <= 0) caveats.push('nothing_seen');
  else if (at.age > OLD_FIX_H) caveats.push('intel_old');
  const p = at.rows.map((q) => q.pTake);
  // The march takes each enemy cell on the way first (land/movement), so the odds are the chance of taking every one.
  const onTheWay = new Set(going.flatMap((u) => assaultPath(kit, u, n)).filter((c) => f.hostile[c]));
  for (const c of onTheWay) oddsAt(f, map, c, A).rows.forEach((q, i) => (p[i] *= q.pTake));
  return { kind: 'take', who: NOBODY, caveats, p: { lo: p[0], mid: p[1], hi: p[2] }, loss: at.rows[1].attLoss, etaHours };
};

let stamp = new Uint32Array(0);
let gen = 0;

/** Believed hostile power and land force within two rings of `n` (and the guns of ring 1), with the power's confidence and freshest fix. */
interface Threat { E: number; force: LandForce; conf: number; age: number }

/** Believed hostile power within two rings of `n`, ring 1 in full and ring 2 at half, with its confidence and freshest fix, and its land force unless only the power is wanted. */
function threatAround(kit: DragKit, map: GameMap, n: NodeId, withForce = true): Threat {
  if (stamp.length !== map.size) stamp = new Uint32Array(map.size);
  const near = ++gen, far = ++gen;
  const { adjStart, adj } = map;
  const t: Threat = { E: 0, force: new Float32Array(FORCE), conf: 0, age: Infinity };
  stamp[n] = near;
  for (let k = adjStart[n]; k < adjStart[n + 1]; k++) stamp[adj[k]] = near;
  for (let k = adjStart[n]; k < adjStart[n + 1]; k++) {
    const m = adj[k];
    addThreat(t, kit.field, m, 1, withForce);
    if (withForce && m < map.landCount) addAt(t.force, kit.field.enemyGuns, m);
    for (let j = adjStart[m]; j < adjStart[m + 1]; j++) {
      const x = adj[j];
      if (stamp[x] === near || stamp[x] === far) continue;
      stamp[x] = far;
      addThreat(t, kit.field, x, 0.5, withForce);
    }
  }
  return t;
}

function addThreat(t: Threat, f: DragKit['field'], x: number, w: number, withForce: boolean): void {
  if (withForce && x < f.enemyForce.length / FORCE) addAt(t.force, f.enemyForce, x, w);
  const p = f.enemyPower[x];
  if (!p) return;
  t.E += w * p;
  t.conf += w * p * f.enemyConf[x];
  if (f.enemyAgeH[x] < t.age) t.age = f.enemyAgeH[x];
}

/** Days until the enemy `E` likely takes a cell `own` holds, read as if all of it assaulted at once over ground of `pace`. */
function daysAt(map: GameMap, n: NodeId, E: LandForce, own: LandForce, pace: number): number {
  const t = QUICK.open.bare;
  if (platformsOf(own) <= 0) return t.unopposed.days;
  return cellField(t, cornerOf(axesAt(map, n, E, own, 0, pace / t.ground), QUICK), 'days');
}

/** Days a cell with `own` standing in it (and own guns next to it) holds against the believed enemy within two rings, as a band. */
function holdDays(kit: DragKit, map: GameMap, n: NodeId, own: LandForce): { days: Band; old: boolean } {
  const { E, force, conf, age } = threatAround(kit, map, n);
  if (E <= 0 || platformsOf(force) <= 0) return { days: { lo: Infinity, mid: Infinity, hi: Infinity }, old: false };
  const side = addAround(own.slice(), kit.field.ownGuns, kit.field, map, n, false);
  const [lo, mid, hi] = edges(spread(conf / E, age)).map((k) => daysAt(map, n, times(force, k), side, kit.field.ground[n]));
  return { days: { lo, mid, hi }, old: age > OLD_FIX_H };
}

/** What stands at `n` plus `going`, as one land force. */
function ownAt(f: BeliefField, n: NodeId, going: SubjectUnit[]): LandForce {
  const out = addAt(new Float32Array(FORCE), f.ownForce, n);
  for (const u of going) for (let i = 0; i < out.length; i++) out[i] += u.force[i];
  return out;
}

export const estimateHold: Estimator = (kit, going, t, _cells, map) => {
  const h = holdDays(kit, map, t.node, ownAt(kit.field, t.node, going));
  const caveats: Caveat[] = h.old ? ['intel_old'] : [];
  const etaHours = eta(kit, going, () => t.node, 'move');
  if (etaHours > FAR_H) caveats.push('far');
  return { kind: 'hold', who: NOBODY, caveats, days: h.days, etaHours, cells: 1 };
};

/** `slots` is the cell each going unit holds (frontSlots); the pill reports the weakest cell with what stands there plus who goes. */
export const estimateFront: Estimator = (kit, going, _t, slots, map) => {
  const cells = [...new Set(slots)];
  const own = cells.map((c) => ownAt(kit.field, c, going.filter((_, i) => slots[i] === c)));
  let weakest: Band = { lo: Infinity, mid: Infinity, hi: Infinity };
  let old = false;
  cells.forEach((c, i) => {
    const h = holdDays(kit, map, c, own[i]);
    old ||= h.old;
    if (h.days.mid < weakest.mid || (h.days.mid === weakest.mid && h.days.lo < weakest.lo)) weakest = h.days;
  });
  const caveats: Caveat[] = old ? ['intel_old'] : [];
  const etaHours = eta(kit, going, (i) => slots[i], 'move');
  if (etaHours > FAR_H) caveats.push('far');
  return { kind: 'hold', who: NOBODY, caveats, days: weakest, etaHours, cells: cells.length };
};

/** The cell each of `going` holds: units strongest first onto cells most threatened first, wrapping when there are more units than cells. */
export function frontSlots(kit: DragKit, map: GameMap, going: SubjectUnit[], cells: NodeId[]): NodeId[] {
  const threat = cells.map((c) => threatAround(kit, map, c, false).E);
  const byThreat = cells.map((_, i) => i).sort((a, b) => threat[b] - threat[a]);
  const out: NodeId[] = new Array(going.length);
  going.map((_, i) => i).sort((a, b) => going[b].power - going[a].power).forEach((ui, rank) => (out[ui] = cells[byThreat[rank % cells.length]]));
  return out;
}

export const estimateStrike: Estimator = (kit, going, t, _cells, map) => {
  const lead = going.reduce((a, b) => (b.salvo > a.salvo ? b : a));
  const of = going.reduce((s, u) => s + u.salvo, 0);
  const caveats: Caveat[] = [];
  const c = t.contact ? kit.contacts[t.contact] : undefined;
  if (c?.mobile && c.ageH > MOVED_H) caveats.push('moving_target_old_fix');
  if (!lead.threat || of <= 0) return { kind: 'strike', who: NOBODY, caveats, through: { lo: 0, mid: 0, hi: 0 }, of: 0 };
  const covering = kit.sites.filter((s) => map.distanceKm(s.node, t.node) <= s.defense.rangeKm);
  const through = [0, 1, 2].map((edge) => {
    let left = of;
    for (const s of covering) {
      const k = edges(spread(s.conf, s.ageH))[edge];
      left = interceptSalvo({ ...lead.threat!, count: left }, { ...s.defense, channels: s.defense.channels * k, interceptors: s.defense.interceptors * k }, MEAN_RNG).leaked;
    }
    return left;
  });
  return { kind: 'strike', who: NOBODY, caveats, through: { lo: through[0], mid: through[1], hi: through[2] }, of };
};

/** Own power against believed hostile air and naval power within a zone around the target: a ratio, not a probability (no table backs one). */
export const estimateContest: Estimator = (kit, going, t, _cells, map) => {
  let E = 0, conf = 0, age = Infinity, seen = 0;
  for (const c of Object.values(kit.contacts)) {
    if ((c.domain !== 'air' && c.domain !== 'sea') || map.distanceKm(c.node, t.node) > ZONE_KM) continue;
    seen++;
    E += c.power;
    conf += c.power * c.conf;
    age = Math.min(age, c.ageH);
  }
  const own = sum(going);
  const caveats: Caveat[] = age > OLD_FIX_H && seen ? ['intel_old'] : [];
  if (E <= 0) return { kind: 'contest', who: NOBODY, caveats, ratio: { lo: Infinity, mid: Infinity, hi: Infinity }, seen };
  const [lo, mid, hi] = edges(spread(conf / E, age)).map((s) => own / (E * s));
  return { kind: 'contest', who: NOBODY, caveats, ratio: { lo, mid, hi }, seen };
};

export const estimateRebase: Estimator = (_kit, going) => ({ kind: 'arrive', who: NOBODY, caveats: [], etaHours: Math.max(0, ...going.map((u) => u.c2DelayHours)) });

const pct = (x: number) => Math.round(x * 100);

function lossWords(x: number): string {
  if (x < 0.05) return 'light losses';
  if (x < 0.15) return 'lose about a tenth';
  if (x < 0.29) return 'lose about a quarter';
  if (x < 0.42) return 'lose about a third';
  if (x < 0.6) return 'lose about half';
  return 'lose most of the force';
}

function etaWords(h: number): string | undefined {
  if (!Number.isFinite(h)) return undefined;
  if (h < 1) return 'goes at once';
  if (h < 20) return `there in ~${Math.round(h)} h`;
  const d = Math.max(1, Math.round(h / 24));
  return `there in ~${d} day${d === 1 ? '' : 's'}`;
}

function daysWords(d: number): string {
  if (d >= HOLD_CAP_DAYS) return 'a month or more';
  if (d < 1.5) return 'a day';
  if (d < 10) return `${Math.round(d)} days`;
  return `${Math.round(d / 7)} weeks`;
}

function holdWords(b: Band): string {
  if (b.lo === Infinity) return 'no threat seen nearby';
  const lo = Math.min(b.lo, HOLD_CAP_DAYS), hi = Math.min(b.hi, HOLD_CAP_DAYS);
  if (lo >= HOLD_CAP_DAYS) return 'likely holds a month or more';
  const a = daysWords(lo), z = daysWords(hi);
  if (a === z) return `likely holds ${a}`;
  // "2-4 weeks" rather than "2 weeks-4 weeks" when both ends share a unit.
  const unit = (s: string) => s.replace(/^[\d~]+ /, '');
  return unit(a) === unit(z) && /^\d/.test(a) && /^\d/.test(z) ? `likely holds ${a.split(' ')[0]}-${z}` : `likely holds ${a} to ${z}`;
}

function ratioWords(r: number): string {
  if (!Number.isFinite(r)) return 'no enemy air or naval force seen';
  if (r >= 1.5) return `outguns them about ${Math.round(r)}:1`;
  if (r > 1 / 1.5) return 'about even';
  return `outgunned about 1:${Math.round(1 / Math.max(r, 1e-3))}`;
}

const CAVEAT_WORDS: Record<Caveat, string> = {
  intel_old: 'intel is days old',
  nothing_seen: 'no enemy seen there',
  out_of_supply: 'beyond your supply lines',
  moving_target_old_fix: 'the target may have moved',
  far: 'a long march',
  widens_war: 'widens the war',
};

const bandPct = (b: Band) => (b.hi - b.lo < 0.15 ? `${pct(b.mid)}%` : `${pct(b.lo)}-${pct(b.hi)}%`);

/** Words for the pill. Pure, so the e2e and unit tests assert on the same strings. */
export function pillText(p: Pill): { primary: string; secondary?: string; tone: 'good' | 'even' | 'bad' | 'refused' } {
  const extra: string[] = [];
  const done = (primary: string, tone: 'good' | 'even' | 'bad', lead: (string | undefined)[] = []) => {
    const rest = [...lead.filter((s): s is string => !!s), ...extra, ...p.caveats.map((c) => CAVEAT_WORDS[c])];
    if (p.who.staying) rest.push(`${p.who.staying} stay${p.who.staying === 1 ? 's' : ''}`);
    return rest.length ? { primary, secondary: rest.join(' · '), tone } : { primary, tone };
  };
  switch (p.kind) {
    case 'refused':
      return { primary: p.reason, tone: 'refused' };
    case 'take': {
      if (p.refined) extra.push(`staff check ${pct(p.refined.mid)}%`);
      return done(`${bandPct(p.p)} to take it`, p.p.mid >= 0.6 ? 'good' : p.p.mid >= 0.4 ? 'even' : 'bad', [lossWords(p.loss), etaWords(p.etaHours)]);
    }
    case 'hold': {
      const words = holdWords(p.days);
      const primary = p.cells <= 1 ? words : p.days.lo === Infinity ? `holds ${p.cells} cells · ${words}` : `holds ${p.cells} cells · weakest ${words.replace(/^likely holds /, '')}`;
      return done(primary, p.days.mid >= 14 ? 'good' : p.days.mid >= 5 ? 'even' : 'bad', [etaWords(p.etaHours)]);
    }
    case 'strike': {
      const r = (x: number) => Math.round(x);
      const n = r(p.through.hi) - r(p.through.lo) <= Math.max(1, 0.15 * p.of) ? `${r(p.through.mid)}` : `${r(p.through.lo)}-${r(p.through.hi)}`;
      const share = p.of ? p.through.mid / p.of : 0;
      return done(p.of ? `${n} of ${p.of} get through` : 'nothing to fire', share >= 0.6 ? 'good' : share >= 0.3 ? 'even' : 'bad');
    }
    case 'contest': {
      const seen = p.seen ? `${p.seen} enemy group${p.seen === 1 ? '' : 's'} seen` : undefined;
      return done(ratioWords(p.ratio.mid), p.ratio.mid >= 1.5 ? 'good' : p.ratio.mid > 1 / 1.5 ? 'even' : 'bad', [seen]);
    }
    case 'arrive':
      return done(p.etaHours < 1 ? 'rebases at once' : etaWords(p.etaHours)!, 'good');
  }
}
