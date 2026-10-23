/**
 * Regenerates QUICK (./quick.ts), the pill's ground lookup, from the engine: one attacking stack against one
 * defended plain cell, eight forecast draws each, across the three numbers land/combat advances a line by: the local
 * fire ratio (fireRatio), the share of the front the attacker's committed platforms fill (sector) and the share the
 * defender mans (manned). Each side is scaled on its own to set them. Each ground has its own table: open or across a
 * major river, bare or behind a standing belt. land/combat makes both a stronger defence and a slower advance. Beside
 * it, the same cell left empty under the fire of a line in the next cell, by the fire ratio against that line and the
 * share: what is left to cross once a garrison is gone, the line next to it still there.
 * `npm run calibrate:quick` writes the table; tests/drag-calibration.realism.test.ts checks that a rerun reproduces it.
 */
import type { Catalog } from '../core/catalog';
import { platformCount } from '../core/forces';
import type { GameMap } from '../core/map';
import type { Formation, FormationId, NationId, NodeId, Terrain, World } from '../core/types';
import { createSession } from '../scenarios';
import { c2FireFactor, orderDelayHours } from '../systems/c2';
import { acrossRiver } from '../systems/land/combat';
import { cellDepthKm } from '../systems/land/state';
import { edgeKm, marchKmPerDay } from '../systems/land/movement';
import { routeAxis } from '../systems/ops';
import { groundFactorAt } from '../systems/weather/effects';
import { addForce, fireOf, FORCE, type LandForce } from '../ui/drag/kit';
import { axesAt, coverAxes, fireRatio } from '../ui/drag/estimate';
import { forecastInput, type OperationForecast, type OperationForecastInput } from './operation';
import type { Belt, Crossing, QuickCell, QuickTable, QuickTables } from './quick';

const round = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const geometric = (n: number, lo: number, hi: number) => Array.from({ length: n }, (_, i) => round(lo * (hi / lo) ** (i / (n - 1))));

/** Local fire ratios the table spans, evenly spaced in ln r. Below parity only attrition moves a line, which takes no cell in a week; past 3:1 the gaps open at the breakthrough's pace, past 9:1 mass breaks a manned line. */
export const QUICK_RATIOS = geometric(7, 1, 16);
/** Shares of the front the attack fills, evenly spaced in ln s up to the whole front. */
export const QUICK_SHARES = geometric(6, 0.03, 1);
/** Shares of the front the defence mans, from a battalion's worth of a cell's front to a full brigade's. A belt's kill zone is fully manned from about 0.17. */
export const QUICK_MANNED = geometric(4, 0.02, 0.3);
export const QUICK_DAYS = 7;
export const QUICK_RUNS = 8;

const ATTACKER = 'RUS' as NationId, DEFENDER = 'UKR' as NationId;
const ATTACKER_TEMPLATE = '2nd Guards Motor Rifle Brigade';

export type Forecast = (input: OperationForecastInput, runs: number) => OperationForecast | Promise<OperationForecast>;

/** `f` as a land side (kit addForce), its C2 counted when it is the player's own. */
function forceOf(w: World, catalog: Catalog, f: Formation, own: boolean): LandForce {
  const out = new Float32Array(FORCE);
  addForce(out, 0, catalog, f, fireOf(f) * (own ? c2FireFactor(w, f) : 1));
  return out;
}
const platformsOf = (x: LandForce) => x[0] + x[1] + x[2];

/**
 * The duel worlds: ukraine-2026 a tick in, at war, with every formation removed but one attacker and one defender, and the
 * intelligence slice dropped so the planner sees the defender as it is. The defender is filled in as belief fills in an
 * enemy it sees (intel/view believedFormation): fresh, supplied, not dug in.
 */
export async function calibrateQuick(forecast: Forecast): Promise<QuickTables> {
  const s = createSession('ukraine-2026', 1);
  // The opening declarations of war take effect on the first tick.
  s.engine.run(s.world, 1);
  const { map, catalog } = s.engine;
  const att = byName(s.world, ATTACKER, ATTACKER_TEMPLATE);
  const def = believed(medianDefender(s.world, catalog, att));
  const depthKm = round(cellDepthKm(map, duelCells(s.world, map, 'plain', false)[0]));
  const table = async (crossing: Crossing, belt: Belt): Promise<QuickTable> => {
    const river = crossing === 'river';
    const [cell, from] = duelCells(s.world, map, 'plain', river);
    const fort = belt === 'fortified' ? 1 : 0;
    const run = async (sides: Sides): Promise<QuickCell> => {
      const input = duel(s.world, map, catalog, cell, from, sides, fort);
      return cellOf(await forecast(input, QUICK_RUNS), input.days - QUICK_DAYS, platformCount(sides.att));
    };
    const at = (r: number, share: number, manned: number) => run(sized(s.world, map, catalog, att, def, cell, { r, s: share, m: manned }, fort, depthKm));
    const cells = await Promise.all(QUICK_RATIOS.map((r) => Promise.all(QUICK_SHARES.map((share) => Promise.all(QUICK_MANNED.map((m) => at(r, share, m)))))));
    const coverAt = (r: number, share: number) => run(sizedCover(s.world, map, catalog, att, def, cell, { r, s: share }, depthKm));
    const covered = await Promise.all(QUICK_RATIOS.map((r) => Promise.all(QUICK_SHARES.map((share) => coverAt(r, share)))));
    return { ground: round(groundFactorAt(s.world, map, cell)), cells, covered, unopposed: await run({ att: structuredClone(att) }) };
  };
  const open = { bare: await table('open', 'bare'), fortified: await table('open', 'fortified') };
  const river = { bare: await table('river', 'bare'), fortified: await table('river', 'fortified') };
  return { ratios: QUICK_RATIOS, shares: QUICK_SHARES, manned: QUICK_MANNED, depthKm, open, river };
}

/** The defending brigade of median fire per platform: its mix of armour and infantry is the defender's typical one. */
function medianDefender(w: World, catalog: Catalog, att: Formation): Formation {
  const a = forceOf(w, catalog, att, true);
  const perPlatform = (f: Formation) => {
    const d = forceOf(w, catalog, f, false);
    return fireRatio(a, d) * platformsOf(d);
  };
  const brigades = Object.values(w.formations)
    .filter((f) => f.nation === DEFENDER && f.kind === 'maneuver' && f.echelon === 'brigade' && f.status === 'active')
    .map((f) => ({ f, k: perPlatform(f) }))
    .sort((x, y) => x.k - y.k || (x.f.id < y.f.id ? -1 : 1));
  return brigades[brigades.length >> 1].f;
}

/** `f` as belief fills in an enemy it sees (intel/view believedFormation): its kit, at a planner's guess of its state. */
function believed(f: Formation): Formation {
  return { ...structuredClone(f), supply: { ...f.supplyCapacity }, readiness: 0.8, morale: 0.7, experience: 0.5, fatigue: 0, entrenchment: 0 };
}

/** The sides of one duel: the attacker, the cell's defender and the line covering it from the next cell; no one against it is an unopposed march. */
interface Sides { att: Formation; def?: Formation; cover?: Formation }

/**
 * `attT` and `defT` scaled until an attack of one on the other in `cell` reads at `want` (estimate axesAt, as the pill
 * reads it): the defender's platforms set the share of the front it mans, the attacker's the share it fills (behind a
 * belt that hangs on the defender's too), and the readiness of one side the fire ratio left over, since fire is
 * linear in it (land/combat quality). Only ever the side that must be weaker loses readiness.
 */
function sized(w: World, map: GameMap, catalog: Catalog, attT: Formation, defT: Formation, cell: NodeId, want: { r: number; s: number; m: number }, fort: number, depthKm: number): Sides {
  const a = forceOf(w, catalog, attT, true), d = forceOf(w, catalog, defT, false);
  const times = (x: LandForce, k: number) => x.map((v) => v * k);
  const k = { att: 1, def: 1 };
  for (let i = 0; i < 6; i++) {
    const got = axesAt(map, cell, times(a, k.att), times(d, k.def), fort, 1, depthKm);
    k.att *= want.s / got.s;
    k.def *= want.m / got.m;
  }
  const att = structuredClone(attT), def = structuredClone(defT);
  scale(att, k.att);
  scale(def, k.def);
  const r = axesAt(map, cell, times(a, k.att), times(d, k.def), fort, 1, depthKm).r;
  if (r > want.r) att.readiness *= want.r / r;
  else def.readiness *= r / want.r;
  return { att, def };
}

/** `attT` scaled to fill `want.s` of the empty `cell`'s front and `coverT` to stand at `want.r` against it from the next cell (estimate coverAxes). */
function sizedCover(w: World, map: GameMap, catalog: Catalog, attT: Formation, coverT: Formation, cell: NodeId, want: { r: number; s: number }, depthKm: number): Sides {
  const a = forceOf(w, catalog, attT, true), c = forceOf(w, catalog, coverT, false);
  const got = coverAxes(map, cell, a, c, 1, depthKm);
  // Every weapon counts on both sides, so the ratio is linear in the cover's size.
  const att = structuredClone(attT), cover = structuredClone(coverT);
  scale(att, want.s / got.s);
  scale(cover, (got.r * (want.s / got.s)) / want.r);
  return { att, cover };
}

function byName(world: World, nation: NationId, name: string): Formation {
  const f = Object.values(world.formations).find((x) => x.nation === nation && x.name.startsWith(name));
  if (!f) throw new Error(`no ${name} in ukraine-2026`);
  return f;
}

/**
 * The first defender-held cell of `terrain` (by node) with an attacker-held neighbour, across a river or not as asked.
 * Across one, it is a cell the attacker reaches only over the river and whose shortest axis is the crossing itself
 * (ops routeAxis), so the attack does not walk round through the duel world's empty ground. Without one, a defender
 * neighbour is handed to the attacker.
 */
function duelCells(world: World, map: GameMap, terrain: Terrain, river: boolean): [NodeId, NodeId] {
  let fallback: [NodeId, NodeId] | undefined;
  for (let n = 0; n < map.landCount; n++) {
    if (world.control[n] !== DEFENDER || map.terrain[n] !== terrain) continue;
    for (const m of map.neighbors(n as NodeId)) {
      if (m >= map.landCount || !!map.riverBetween(n as NodeId, m) !== river) continue;
      if (river) {
        if (world.control[m] === ATTACKER && acrossRiver(world, map, n as NodeId, ATTACKER) && routeAxis(world, map, ATTACKER, [m, n as NodeId])?.length === 2) return [n as NodeId, m];
        continue;
      }
      if (world.control[m] === ATTACKER) return [n as NodeId, m];
      if (world.control[m] === DEFENDER) fallback ??= [n as NodeId, m];
    }
  }
  if (!fallback) throw new Error(`no ${terrain} cell for a duel`);
  return fallback;
}

/** A defender-held land neighbour of `cell` the line covers it from, out of reach of `from` where one is, so it fights no one but the crossing. */
function coverCell(world: World, map: GameMap, cell: NodeId, from: NodeId): NodeId {
  const held = [...map.neighbors(cell)].filter((m) => m < map.landCount && m !== from && world.control[m] === DEFENDER);
  const out = held.find((m) => ![...map.neighbors(from)].includes(m)) ?? held[0];
  if (out === undefined) throw new Error(`no cell next to ${cell} to cover it from`);
  return out;
}

/**
 * The forecast of one duel, run QUICK_DAYS past the day the attack reaches the cell as the pill counts it (kit routeKm,
 * estimate eta: the order's trip down the chain of command, then the march over the edge), since the pill's odds run
 * a week from contact.
 */
function duel(world: World, map: GameMap, catalog: Catalog, cell: NodeId, from: NodeId, sides: Sides, fort: number): OperationForecastInput {
  const w: World = structuredClone({ ...world, formations: {}, pending: [], events: [], history: [] });
  delete (w.slices as Partial<World['slices']>).intel;
  w.control[from] = ATTACKER;
  if (w.slices.land) {
    if (fort) w.slices.land.fortified[cell] = fort;
    else delete w.slices.land.fortified[cell];
    delete w.slices.land.contest[cell];
  }
  const att = { ...sides.att, node: from, home: from, order: { posture: 'defend' as const, issuedTick: 0 } };
  const formations: Record<string, Formation> = { [att.id]: att };
  if (sides.def) formations[sides.def.id] = { ...sides.def, node: cell, home: cell, order: { posture: 'defend' as const, issuedTick: 0 } };
  if (sides.cover) {
    const at = coverCell(world, map, cell, from);
    formations[sides.cover.id] = { ...sides.cover, node: at, home: at, order: { posture: 'defend' as const, issuedTick: 0 } };
  }
  w.formations = formations as World['formations'];
  let km = Infinity;
  for (let k = map.adjStart[from]; k < map.adjStart[from + 1]; k++) if (map.adj[k] === cell) km = edgeKm(w, map, att, from, cell, map.adjKm[k], true, false);
  const lead = orderDelayHours(w, att.id) + (km / marchKmPerDay(w, catalog, att)) * 24;
  return forecastInput(w, map, catalog, { nation: ATTACKER, kind: 'offensive', objectives: [cell], formations: [att.id as FormationId] }, QUICK_DAYS + Math.ceil(lead / 24));
}

/** Every count and stock of `f` times `k`, so its combat power, and its force as a land side, is k times as great. */
export function scale(f: Formation, k: number): void {
  for (const id of Object.keys(f.equipment) as (keyof Formation['equipment'])[]) f.equipment[id] *= k;
  for (const id of Object.keys(f.magazine) as (keyof Formation['magazine'])[]) f.magazine[id] *= k;
  for (const r of ['fuel', 'ammo', 'food'] as const) {
    f.supply[r] *= k;
    f.supplyCapacity[r] *= k;
  }
  f.personnel *= k;
}

/**
 * One table cell from a duel's forecast, counted from contact `lead` days in: the chance the cell is held QUICK_DAYS
 * later, the day by which it likely is (past the window, at the window's daily hazard), and the median loss as a share
 * of the attacker's `platforms`.
 */
function cellOf(forecast: OperationForecast, lead: number, platforms: number): QuickCell {
  const p = forecast.pObjectiveByDay.slice(lead);
  const pTake = p[QUICK_DAYS - 1];
  const half = p.findIndex((x) => x >= 0.5);
  const days = half >= 0 ? half + 1 : pTake > 0 ? (Math.LN2 * QUICK_DAYS) / -Math.log(1 - pTake) : Infinity;
  return { pTake: round(pTake), days: round(days), attLoss: round(forecast.losses.p50 / Math.max(1, platforms)) };
}


/** The source of ./quick.ts for `tables`, headed with what produced it. */
export function quickSource(tables: QuickTables, landTables: string): string {
  const cell = (q: QuickCell) => `{ pTake: ${q.pTake}, days: ${q.days}, attLoss: ${q.attLoss} }`;
  const table = (t: QuickTable, pad: string) => `{
${pad}  ground: ${t.ground},
${pad}  cells: [
${t.cells.map((row, i) => `${pad}    // r ${tables.ratios[i]}, by share then manned\n${pad}    [\n${row.map((ms) => `${pad}      [${ms.map(cell).join(', ')}],`).join('\n')}\n${pad}    ],`).join('\n')}
${pad}  ],
${pad}  covered: [
${t.covered.map((row, i) => `${pad}    // r ${tables.ratios[i]}, by share\n${pad}    [${row.map(cell).join(', ')}],`).join('\n')}
${pad}  ],
${pad}  unopposed: ${cell(t.unopposed)},
${pad}}`;
  const ground = (g: QuickTables[Crossing]) => `{
    bare: ${table(g.bare, '    ')},
    fortified: ${table(g.fortified, '    ')},
  }`;
  return `// Generated by \`npm run calibrate:quick\` (src/forecast/calibrate-quick.ts) from runOperation duels:
// ${QUICK_RATIOS.length} fire ratios x ${QUICK_SHARES.length} attacker front shares x ${QUICK_MANNED.length} defender front shares (or the cell empty under covering
// fire) x open or river x bare or fortified x ${QUICK_RUNS} draws of ${QUICK_DAYS} days, on a plain cell.
// Land tables at ${landTables}. Do not edit by hand. Regenerate: npx tsx scripts/calibrate-quick.ts

/** One duel's outcome. */
export interface QuickCell {
  /** Chance the cell is held by the end of day ${QUICK_DAYS}. */
  pTake: number;
  /** Day by which it is likely held (Infinity: no draw took it). */
  days: number;
  /** Median platforms lost, as a share of the attacker's. */
  attLoss: number;
}

/** Outcomes by fire ratio, attacker's front share and defender's (cells[ratio][share][manned], on the QuickTables axes), and an attack where no defender stands. */
export interface QuickTable {
  /** The pace mud and snow left at the duel cell when the duels began (weather groundFactorAt). */
  ground: number;
  cells: readonly (readonly (readonly QuickCell[])[])[];
  /** The cell empty under the fire of the line next to it, by the fire ratio against that line and the attacker's front share (covered[ratio][share]). */
  covered: readonly (readonly QuickCell[])[];
  unopposed: QuickCell;
}

/** Whether the attacker's side reaches the cell only across a major river (land/combat acrossRiver). */
export type Crossing = 'open' | 'river';
/** Whether the cell has a standing belt of fortifications (land slice fortified, 0 or 1 here). */
export type Belt = 'bare' | 'fortified';

/**
 * The tables by ground, on three axes: the local fire ratio an assault is fought at (land/combat fireRatio), the
 * share of the front the attacker's committed platforms fill (land/combat sector) in a plain cell \`depthKm\` deep,
 * and the share the defender's platforms man (land/combat manned).
 */
export interface QuickTables extends Record<Crossing, Record<Belt, QuickTable>> {
  ratios: readonly number[];
  shares: readonly number[];
  manned: readonly number[];
  depthKm: number;
}

export const QUICK: QuickTables = {
  ratios: [${tables.ratios.join(', ')}],
  shares: [${tables.shares.join(', ')}],
  manned: [${tables.manned.join(', ')}],
  depthKm: ${tables.depthKm},
  open: ${ground(tables.open)},
  river: ${ground(tables.river)},
};
`;
}
