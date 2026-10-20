import type { FormationKind, Terrain } from '../../core/types';

/**
 * Planning factors for the supply model. Each number is either a published
 * planning figure or an estimate calibrated against one; the comment says which.
 */

export const SUPPLY_CLASSES = ['fuel', 'ammo', 'food'] as const;
export type SupplyClass = (typeof SUPPLY_CLASSES)[number];

/**
 * Class I ration weight, tons per person per day, water excluded. US Army planning
 * uses roughly 1.5 to 2 kg (FM 4-0 / ATP 4-41 ration factors); matches the
 * food stockage that core/forces.ts sizes formations with.
 */
export const FOOD_TONS_PER_PERSON_DAY = 0.002;

/**
 * Hours of full-rate fuel burn per day that a formation uses while idle: generators,
 * heaters, engine runs, admin moves, training flights, ships on station. Estimate.
 * Calibration: US armored division planning puts a stationary/defensive day at
 * roughly a quarter to a third of the 2,000-3,000 t/day it burns on the move
 * (RAND MR-1293 / FM 4-0 class III factors); a day of movement is about 10 h of
 * engine time, so 2 h/day of idle burn lands near that ratio.
 */
export const IDLE_FUEL_HOURS_PER_DAY: Record<FormationKind, number> = {
  maneuver: 2,
  artillery: 2,
  air_defense: 4, // radars and launchers on gensets around the clock
  missile: 1,
  air_wing: 0.6, // ~18 training hours per aircraft per month (NATO minimum is ~15)
  surface_group: 8, // loiter burn is about a third of transit-speed burn
  submarine: 2, // SSK snorkel charging; SSNs list 0 t/h so burn nothing
  strategic: 1,
  logistics: 3, // the trucks themselves
  space: 0,
};

/**
 * Most of a formation's carried load that the supply chain can push to it in one
 * day at a supply factor of 1. Formations carry three days of full-rate fuel
 * (core/forces.ts), so 0.5/day sustains continuous full-rate operations at a
 * factor of about 0.67 and below that a unit must pause to rebuild stocks.
 * Estimate, chosen so a rail-fed division sustains offensive tempo (FM 4-0) and a
 * division 600 km past its railhead does not, as in 1941 and 1944 (van Creveld,
 * Supplying War, ch. 5 and 7).
 */
export const MAX_REFILL_FRACTION_PER_DAY = 0.5;

/**
 * Tons per day one map cell can receive at a supply factor of 1, shared by every
 * formation there. Estimate: one double-track military rail line moves roughly
 * 15,000 t/day (24 trains of ~600 t). For scale, Russian artillery firing about
 * 20,000 shells/day at the 2022 peak (RUSI, Watling & Reynolds 2023) is about
 * 1,200 t/day of ammunition, and a US heavy division in high-intensity combat
 * draws 1,000-2,000 t/day of ammunition (FM 4-0 class V factors).
 */
export const NODE_TONS_PER_DAY = 15_000;

/**
 * Supply-route cost, in road-km equivalents per km, by mode. A ton moved by rail or
 * ship costs a small fraction of a truck ton-km in fuel and vehicles (US DOT/FRA:
 * rail ~3-4x more fuel-efficient; the binding constraint on trucks is the fleet
 * tied up in turnaround), so distance from the railhead is what decays supply.
 */
export const RAIL_COST_PER_KM = 0.05;
export const SEA_COST_PER_KM = 0.02;
/** Loading or unloading at a port, in road-km equivalents. Estimate. */
export const PORT_HANDLING_KM = 75;
/** Cells with less track than this have no railhead worth the name. */
export const MIN_RAIL_KM = 20;
/** A rail line under this infrastructure level is cut; traffic falls back to roads. */
export const RAIL_CUT_INFRASTRUCTURE = 0.3;
/** Port size (map.ports count) at which a port is not the bottleneck. */
export const FULL_PORT = 3;

/**
 * Road cost multiplier by terrain of the cell entered. Estimates from relative
 * road density and march-rate tables (FM 3-90 movement rates; desert and arctic
 * routes are few and long, mountains force switchbacks).
 */
export const TERRAIN_ROAD_COST: Record<Terrain, number> = {
  plain: 1,
  urban: 1,
  forest: 1.4,
  hills: 1.6,
  desert: 1.5,
  marsh: 2.5,
  jungle: 3,
  mountain: 3,
  arctic: 3.5,
};

/**
 * Road-km equivalent at which half the nominal tonnage still arrives; supply
 * falls as 1 / (1 + (d / D50)^2). Calibration: van Creveld puts the useful truck
 * radius from a railhead at about 300 km (two-day turnaround) for 1941 and 1944
 * motor transport; modern palletised systems (PLS/HEMTT) stretch that somewhat.
 * At 350 km the curve gives 0.5; 600 km of desert (900 road-km) gives 0.13.
 */
export const DECAY_HALF_KM = 350;

/** Throughput penalty for a friendly cell adjacent to enemy-held ground (artillery and drone interdiction of the last 20-30 km, Ukraine 2022-24). */
export const FRONTLINE_CAPACITY = 0.5;
export const FRONTLINE_COST = 1.5;

/**
 * Best supply an airfield can get by airlift alone. Calibration: the Stalingrad
 * airlift averaged about 100 t/day against 700 t/day needed (~15%); Demyansk
 * did better with a smaller pocket. Enemy air control scales it down.
 */
export const AIRLIFT_FACTOR = 0.12;

/** Below this a node is treated as unsupplied and the search stops expanding. */
export const MIN_FACTOR = 0.01;

/** Depots per nation: its capital plus the most populous cells covering this share of population, capped at MAX_DEPOTS. */
export const DEPOT_POP_SHARE = 0.5;
export const MAX_DEPOTS = 12;

/**
 * Networks refreshed per tick after their inputs change, oldest first; new ones
 * always compute at once. Each refresh is one graph search (about 1-3 ms). With
 * up to 16 networks every change is picked up within a day of 6 h ticks;
 * formations carry three days of supply, so that lag changes little.
 */
export const MAX_REFRESHES_PER_TICK = 4;

/** Infrastructure, sea- or air-control change smaller than this does not trigger a network refresh. */
export const INPUT_TOLERANCE = 0.05;

/**
 * Share of the damaged pool returned to service per day at full supply. Estimate:
 * WWII and 1973 data show most knocked-out tanks were recoverable and the median
 * field repair took about a week (US Army ORO studies; Israeli 1973 repair rates).
 */
export const REPAIR_FRACTION_PER_DAY = 0.1;

/**
 * Share of establishment a formation can absorb as replacements per day at full
 * supply while in the line; triple that when pulled back to reserve. Estimate based
 * on individual and equipment replacement flows of a few percent a day (US Army
 * WWII replacement system; Ukrainian brigade rotations 2023).
 */
export const REPLACE_FRACTION_PER_DAY = 0.02;
export const RESERVE_REPLACE_MULTIPLIER = 3;

/** Infrastructure restored per day by repair crews on friendly, non-front cells. Ukrzaliznytsia restored most cut lines in days to weeks in 2022. */
export const INFRA_REPAIR_PER_DAY = 0.03;

/** Formation kinds that occupy ground and block enemy supply through their cell. */
export const LAND_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'missile', 'logistics', 'strategic']);
