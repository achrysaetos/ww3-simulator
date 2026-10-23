/**
 * The pill's numbers: pure functions of the kit, so they read belief and public facts only. Ground outcomes are a
 * lookup into QUICK, which `runOperation` duels produced; strikes run the engine's own salvo math at its expectation.
 */
import type { GameMap } from '../../core/map';
import type { NodeId } from '../../core/types';
import { QUICK, type QuickRow, type QuickTable } from '../../forecast/quick';
import { interceptSalvo, MEAN_RNG } from '../../systems/air/intercept';
import type { PublicRefusal, Target } from './gesture';
import { assaultPath, routeKm, type BeliefField, type DragKit, type SubjectUnit } from './kit';

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

/** `rows` at force ratio `r`, interpolated in ln r and clamped to the table. */
export function quickAt(r: number, rows: readonly QuickRow[] = QUICK.open.bare.rows): QuickRow {
  if (!(r > rows[0].r)) return { ...rows[0], r };
  const last = rows[rows.length - 1];
  if (r >= last.r) return { ...last, r };
  let i = 1;
  while (rows[i].r < r) i++;
  const a = rows[i - 1], b = rows[i];
  return { ...mixRow(a, b, (Math.log(r) - Math.log(a.r)) / (Math.log(b.r) - Math.log(a.r))), r };
}

/** `a` and `b` mixed `k` of the way to `b`; an Infinity days mixes as a step. */
function mixRow(a: QuickRow, b: QuickRow, k: number): QuickRow {
  const mix = (x: number, y: number) => (Number.isFinite(x) && Number.isFinite(y) ? x + (y - x) * k : k < 1 ? x : y);
  return { r: mix(a.r, b.r), pTake: mix(a.pTake, b.pTake), days: mix(a.days, b.days), attLoss: mix(a.attLoss, b.attLoss) };
}

/** The tables for enemy ground `n` at ratio `r` (Infinity: no defender), mixed from bare to fortified by its believed belt. */
function takeAt(f: BeliefField, n: NodeId, r: number): QuickRow {
  const ground = QUICK[f.river[n] ? 'river' : 'open'];
  const at = (t: QuickTable) => (r === Infinity ? t.unopposed : quickAt(r, t.rows));
  return { ...mixRow(at(ground.bare), at(ground.fortified), f.enemyDig[n]), r };
}

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

/** The believed defence of enemy ground `n` against attacking power `A`: the cell in full and its hostile neighbours at half. */
function oddsAt(f: BeliefField, map: GameMap, n: NodeId, A: number) {
  let believed = f.enemyPower[n], conf = f.enemyPower[n] * f.enemyConf[n], age = f.enemyAgeH[n];
  for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
    const m = map.adj[k];
    if (!f.hostile[m] || !f.enemyPower[m]) continue;
    believed += 0.5 * f.enemyPower[m];
    conf += 0.5 * f.enemyPower[m] * f.enemyConf[m];
    age = Math.min(age, f.enemyAgeH[m]);
  }
  if (believed <= 0) {
    const q = takeAt(f, n, Infinity);
    return { believed, age, rows: [q, q, q] };
  }
  const D = believed * f.defense[n];
  return { believed, age, rows: edges(spread(conf / believed, age)).map((s) => takeAt(f, n, A / (D * s))) };
}

export const estimateTake: Estimator = (kit, going, t, _cells, map) => {
  const f = kit.field, n = t.node;
  const caveats: Caveat[] = [];
  const etaHours = eta(kit, going, () => n, 'attack');
  if (etaHours > FAR_H) caveats.push('far');
  if (f.supply[n] < SUPPLY_FLOOR) caveats.push('out_of_supply');
  // A unit standing in enemy ground fights for that cell before it moves on (land/movement march), so it adds nothing elsewhere yet.
  const A = going.reduce((sum, u) => sum + (u.node === n || !f.hostile[u.node] ? u.power : 0), 0);
  if (A <= 0) return { kind: 'take', who: NOBODY, caveats, p: { lo: 0, mid: 0, hi: 0 }, loss: 0, etaHours };
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

interface Threat { E: number; conf: number; age: number }

/** Believed hostile power within two rings of `n`, ring 1 in full and ring 2 at half, with its confidence and freshest fix. */
function threatAround(kit: DragKit, map: GameMap, n: NodeId): Threat {
  if (stamp.length !== map.size) stamp = new Uint32Array(map.size);
  const near = ++gen, far = ++gen;
  const { adjStart, adj } = map;
  const t: Threat = { E: 0, conf: 0, age: Infinity };
  stamp[n] = near;
  for (let k = adjStart[n]; k < adjStart[n + 1]; k++) stamp[adj[k]] = near;
  for (let k = adjStart[n]; k < adjStart[n + 1]; k++) {
    const m = adj[k];
    addThreat(t, kit.field, m, 1);
    for (let j = adjStart[m]; j < adjStart[m + 1]; j++) {
      const x = adj[j];
      if (stamp[x] === near || stamp[x] === far) continue;
      stamp[x] = far;
      addThreat(t, kit.field, x, 0.5);
    }
  }
  return t;
}

function addThreat(t: Threat, f: DragKit['field'], x: number, w: number): void {
  const p = f.enemyPower[x];
  if (!p) return;
  t.E += w * p;
  t.conf += w * p * f.enemyConf[x];
  if (f.enemyAgeH[x] < t.age) t.age = f.enemyAgeH[x];
}

/** Days until enemy power `E` likely takes a cell `O` holds: Infinity below the table's floor. */
const daysAt = (E: number, O: number) => (O > 0 && E / O <= QUICK.open.bare.rows[0].r ? Infinity : quickAt(O > 0 ? E / O : Infinity).days);

/** Days a cell with `own` power standing in it holds against the believed enemy within two rings, as a band. */
function holdDays(kit: DragKit, map: GameMap, n: NodeId, own: number): { days: Band; old: boolean } {
  const { E, conf, age } = threatAround(kit, map, n);
  if (E <= 0) return { days: { lo: Infinity, mid: Infinity, hi: Infinity }, old: false };
  const O = own * kit.field.defense[n];
  const [lo, mid, hi] = edges(spread(conf / E, age));
  return { days: { lo: daysAt(E * lo, O), mid: daysAt(E * mid, O), hi: daysAt(E * hi, O) }, old: age > OLD_FIX_H };
}

export const estimateHold: Estimator = (kit, going, t, _cells, map) => {
  const h = holdDays(kit, map, t.node, kit.field.ownPower[t.node] + sum(going));
  const caveats: Caveat[] = h.old ? ['intel_old'] : [];
  const etaHours = eta(kit, going, () => t.node, 'move');
  if (etaHours > FAR_H) caveats.push('far');
  return { kind: 'hold', who: NOBODY, caveats, days: h.days, etaHours, cells: 1 };
};

/** `slots` is the cell each going unit holds (frontSlots); the pill reports the weakest cell with what stands there plus who goes. */
export const estimateFront: Estimator = (kit, going, _t, slots, map) => {
  const cells = [...new Set(slots)];
  const own = cells.map((c) => kit.field.ownPower[c]);
  going.forEach((u, i) => (own[cells.indexOf(slots[i])] += u.power));
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
  const threat = cells.map((c) => threatAround(kit, map, c).E);
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
      const primary = p.cells > 1 ? `holds ${p.cells} cells · weakest ${words.replace(/^likely holds /, '')}` : words;
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
