/**
 * Regenerates QUICK (./quick.ts), the pill's ground lookup, from the engine: one attacking stack against one
 * defended cell, across force ratios and three terrains, eight forecast draws each, for each ground: open or across a
 * major river, bare or behind a standing belt. land/combat makes both a stronger defence and a slower advance.
 * `npm run calibrate:quick` writes the table; tests/drag-calibration.realism.test.ts checks that a rerun reproduces it.
 */
import type { Catalog } from '../core/catalog';
import { platformCount } from '../core/forces';
import type { GameMap } from '../core/map';
import type { Formation, FormationId, NationId, NodeId, Terrain, World } from '../core/types';
import { createSession } from '../scenarios';
import { combatPower } from '../systems/ai/forces';
import { TERRAIN } from '../systems/land/tables';
import { forecastInput, type OperationForecast, type OperationForecastInput } from './operation';
import type { Belt, Crossing, QuickRow, QuickTable, QuickTables } from './quick';

/** Ratios of attacking to defending power the table spans, evenly spaced in ln r. Past 8:1 a cell still often holds a week. */
export const QUICK_RATIOS = Array.from({ length: 14 }, (_, i) => 0.25 * 64 ** (i / 13));
export const QUICK_TERRAINS: readonly Terrain[] = ['plain', 'forest', 'urban'];
export const QUICK_DAYS = 7;
export const QUICK_RUNS = 8;

const ATTACKER = 'RUS' as NationId, DEFENDER = 'UKR' as NationId;
const ATTACKER_TEMPLATE = '2nd Guards Motor Rifle Brigade';

export type Forecast = (input: OperationForecastInput, runs: number) => OperationForecast | Promise<OperationForecast>;

interface Duel { forecast: OperationForecast; platforms: number }

/**
 * The duel worlds: ukraine-2026 a tick in, at war, with every formation removed but one attacker and one defender, and the
 * intelligence slice dropped so the planner sees the defender as it is, as a belief at full confidence would.
 * The defender is fresh on the defence, which is how belief fills in an enemy it sees (intel/view believedFormation).
 */
export async function calibrateQuick(forecast: Forecast): Promise<QuickTables> {
  const s = createSession('ukraine-2026', 1);
  // The opening declarations of war take effect on the first tick.
  s.engine.run(s.world, 1);
  const { map, catalog } = s.engine;
  const att = byName(s.world, ATTACKER, ATTACKER_TEMPLATE);
  const def = Object.values(s.world.formations)
    .filter((f) => f.nation === DEFENDER && f.kind === 'maneuver' && f.echelon === 'brigade' && f.status === 'active')
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  const table = async (crossing: Crossing, belt: Belt): Promise<QuickTable> => {
    const river = crossing === 'river';
    const runs = async (ratio: number, terrain: Terrain): Promise<Duel> => {
      const [cell, from] = duelCells(s.world, map, terrain, river);
      const input = duel(s.world, map, catalog, att, def, cell, from, ratio, river, belt === 'fortified');
      return { forecast: await forecast(input, QUICK_RUNS), platforms: platformCount(input.world.formations[att.id]) };
    };
    const rows: QuickRow[] = [];
    for (const r of QUICK_RATIOS) rows.push(rowOf(r, await Promise.all(QUICK_TERRAINS.map((t) => runs(r, t)))));
    return { rows, unopposed: rowOf(Infinity, await Promise.all(QUICK_TERRAINS.map((t) => runs(Infinity, t)))) };
  };
  return {
    open: { bare: await table('open', 'bare'), fortified: await table('open', 'fortified') },
    river: { bare: await table('river', 'bare'), fortified: await table('river', 'fortified') },
  };
}

function byName(world: World, nation: NationId, name: string): Formation {
  const f = Object.values(world.formations).find((x) => x.nation === nation && x.name.startsWith(name));
  if (!f) throw new Error(`no ${name} in ukraine-2026`);
  return f;
}

/** The first defender-held cell of `terrain` (by node) with an attacker-held neighbour across a river or not, as asked; else a defender neighbour handed to the attacker. */
function duelCells(world: World, map: GameMap, terrain: Terrain, river: boolean): [NodeId, NodeId] {
  let fallback: [NodeId, NodeId] | undefined;
  for (let n = 0; n < map.landCount; n++) {
    if (world.control[n] !== DEFENDER || map.terrain[n] !== terrain) continue;
    for (const m of map.neighbors(n as NodeId)) {
      if (m >= map.landCount || !!map.riverBetween(n as NodeId, m) !== river) continue;
      if (world.control[m] === ATTACKER) return [n as NodeId, m];
      if (world.control[m] === DEFENDER) fallback ??= [n as NodeId, m];
    }
  }
  if (!fallback) throw new Error(`no ${terrain} cell for a duel`);
  return fallback;
}

function duel(world: World, map: GameMap, catalog: Catalog, attT: Formation, defT: Formation, cell: NodeId, from: NodeId, ratio: number, river: boolean, fortified: boolean): OperationForecastInput {
  const w: World = structuredClone({ ...world, formations: {}, pending: [], events: [], history: [] });
  delete (w.slices as Partial<World['slices']>).intel;
  // Across a river only when no attacker ground touches the cell from the near bank (land/combat acrossRiver).
  if (river) for (const m of map.neighbors(cell)) if (w.control[m] === ATTACKER) w.control[m] = DEFENDER;
  w.control[from] = ATTACKER;
  if (w.slices.land) {
    if (fortified) w.slices.land.fortified[cell] = 1;
    else delete w.slices.land.fortified[cell];
    delete w.slices.land.contest[cell];
  }
  const att = { ...structuredClone(attT), node: from, home: from, order: { posture: 'defend' as const, issuedTick: 0 } };
  const formations: Record<string, Formation> = { [att.id]: att };
  if (Number.isFinite(ratio)) {
    const def = { ...structuredClone(defT), node: cell, home: cell, entrenchment: 0, fatigue: 0, order: { posture: 'defend' as const, issuedTick: 0 } };
    scale(att, (ratio * combatPower(def, catalog) * TERRAIN[map.terrain[cell]].defense) / combatPower(att, catalog));
    formations[def.id] = def;
  }
  w.formations = formations as World['formations'];
  return forecastInput(w, map, catalog, { nation: ATTACKER, kind: 'offensive', objectives: [cell], formations: [att.id as FormationId] }, QUICK_DAYS);
}

/** Every count and stock of `f` times `k`, so its combat power (ai/forces combatPower) is k times as great. */
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
 * One table row from the terrains' forecasts: the chance the cell is held by the end of QUICK_DAYS, the day by which it
 * likely is (past the window, at the window's daily hazard), and the median loss as a share of the attacker's platforms.
 */
function rowOf(r: number, duels: Duel[]): QuickRow {
  const p = Array.from({ length: QUICK_DAYS }, (_, d) => duels.reduce((s, x) => s + x.forecast.pObjectiveByDay[d], 0) / duels.length);
  const pTake = p[QUICK_DAYS - 1];
  const half = p.findIndex((x) => x >= 0.5);
  const days = half >= 0 ? half + 1 : pTake > 0 ? (Math.LN2 * QUICK_DAYS) / -Math.log(1 - pTake) : Infinity;
  const attLoss = duels.reduce((s, x) => s + x.forecast.losses.p50 / Math.max(1, x.platforms), 0) / duels.length;
  return { r: round(r), pTake: round(pTake), days: round(days), attLoss: round(attLoss) };
}

const round = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);

/** The source of ./quick.ts for `tables`, headed with what produced it. */
export function quickSource(tables: QuickTables, landTables: string): string {
  const row = (q: QuickRow) => `{ r: ${q.r}, pTake: ${q.pTake}, days: ${q.days}, attLoss: ${q.attLoss} }`;
  const table = (t: QuickTable, pad: string) => `{
${pad}  rows: [
${t.rows.map((q) => `${pad}    ${row(q)},`).join('\n')}
${pad}  ],
${pad}  unopposed: ${row(t.unopposed)},
${pad}}`;
  const ground = (g: QuickTables[Crossing]) => `{
    bare: ${table(g.bare, '    ')},
    fortified: ${table(g.fortified, '    ')},
  }`;
  return `// Generated by \`npm run calibrate:quick\` (src/forecast/calibrate-quick.ts) from runOperation duels:
// ${QUICK_RATIOS.length} force ratios x ${QUICK_TERRAINS.join(', ')} x open or river x bare or fortified x ${QUICK_RUNS} draws of ${QUICK_DAYS} days.
// Land tables at ${landTables}. Do not edit by hand. Regenerate: npx tsx scripts/calibrate-quick.ts

/** One force ratio's outcome: r = attacking power / (defending power x terrain defence). */
export interface QuickRow {
  r: number;
  /** Chance the cell is held by the end of day ${QUICK_DAYS}. */
  pTake: number;
  /** Day by which it is likely held (Infinity: no draw took it). */
  days: number;
  /** Median platforms lost, as a share of the attacker's. */
  attLoss: number;
}

/** The rows by ratio, and an attack where no defender stands. */
export interface QuickTable {
  rows: readonly QuickRow[];
  unopposed: QuickRow;
}

/** Whether the attacker's side reaches the cell only across a major river (land/combat acrossRiver). */
export type Crossing = 'open' | 'river';
/** Whether the cell has a standing belt of fortifications (land slice fortified, 0 or 1 here). */
export type Belt = 'bare' | 'fortified';
export type QuickTables = Record<Crossing, Record<Belt, QuickTable>>;

export const QUICK: QuickTables = {
  open: ${ground(tables.open)},
  river: ${ground(tables.river)},
};
`;
}
