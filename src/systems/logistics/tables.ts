import type { FormationKind, PlatformClass, Terrain } from '../../core/types';

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
 * Hours of full-rate fuel burn per platform per day spent keeping it ready when no
 * operation is charged for it: engine runs, generators and admin moves for vehicles,
 * training and readiness flights for aircraft, days underway for ships. Applied at each
 * platform's own catalog fuel rate (Platform.mobility.fuelTonsPerHour).
 *
 * Calibration target: the US military burns about 85-100M barrels of operational fuel a
 * year (DLA Energy FY2019; DoD Operational Energy reports FY2019-21), about 32-37k t/day,
 * and the Air Force uses roughly 60% of it, Air Mobility Command about half the Air
 * Force's share.
 * - Ground vehicles: US armored division planning puts a stationary/defensive day at
 *   roughly a quarter to a third of the 2,000-3,000 t/day it burns on the move (RAND
 *   MR-1293 / FM 4-0 class III factors); a day of movement is about 10 h of engine time,
 *   so 2 h/day. Air defence runs radars and launchers on gensets around the clock.
 * - Fighters and attack aircraft: ~18 flight hours per aircraft per month (USAF fighter
 *   fleets fly 200-250 h/yr per tail; NATO's pilot minimum is 180 h/yr), 0.6 h/day.
 * - Bombers: B-52H and B-2 fleets fly about 250-300 h/yr per airframe (USAF flying-hour
 *   programme), 0.7 h/day.
 * - Tankers: KC-135 and KC-46 about 300 h/yr per airframe in peacetime, 0.8 h/day.
 * - Strategic airlift: the C-17 was sized for 1,000 h/yr and flies 800-1,000 in
 *   peacetime channel and exercise missions; C-130s ~600. 2.2 h/day (800 h/yr).
 * - AEW, EW and maritime patrol: 400-600 h/yr (E-3, RC-135, P-8, E-2D), 1.2 h/day.
 * - Helicopters: the Army flying-hour programme funds ~12-15 h per aircraft per month,
 *   0.5 h/day. Drones fly long sorties at very low burn, 1 h/day.
 * - Surface ships: US Navy OPTEMPO targets ~50 days underway per quarter deployed and
 *   ~25 non-deployed, so a fleet spends about a third of its days at sea, mostly at
 *   economical speed burning about a third of the rated transit rate, plus hotel load in
 *   port: about 4 h/day of full-rate burn. SSKs charge batteries on diesel, 2 h/day.
 *   Nuclear hulls list 0 t/h and burn nothing.
 * Estimates except where a source is named.
 */
export const READINESS_HOURS_PER_DAY: Record<PlatformClass, number> = {
  infantry: 2, mbt: 2, ifv: 2, apc: 2, recon: 2, sp_artillery: 2, towed_artillery: 2, mlrs: 2,
  atgm: 2, engineer: 2, truck: 2, fuel_truck: 2,
  sam_long: 4, sam_medium: 4, shorad: 4, abm: 4, ew: 4, radar: 4,
  tel_srbm: 1, tel_mrbm: 1, tel_irbm: 1, icbm_silo: 1, icbm_mobile: 1, cruise_launcher: 1, coastal_asm: 1,
  fighter: 0.6, multirole: 0.6, attack_aircraft: 0.6, bomber: 0.7, stealth_bomber: 0.7,
  awacs: 1.2, tanker: 0.8, transport_aircraft: 2.2, maritime_patrol: 1.2, ew_aircraft: 1.2,
  isr_drone: 1, strike_drone: 1, loitering_munition_launcher: 1,
  attack_helo: 0.5, transport_helo: 0.5, asw_helo: 0.5,
  carrier: 4, amphibious: 4, cruiser: 4, destroyer: 4, frigate: 4, corvette: 4, patrol: 4, mine_warfare: 4,
  replenishment: 4, cargo_ship: 4, tanker_ship: 4, usv: 4,
  ssn: 0, ssk: 2, ssgn: 0, ssbn: 0, uuv: 0,
  recon_satellite: 0, nav_satellite: 0, comms_satellite: 0, asat: 0,
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
 * Throughput over a beach or minor harbour the map does not list as a port, as a
 * share of a full port: island bases such as Okinawa, and a lodgement on an enemy
 * coast supplied from the sea. Estimate: Omaha and Utah together landed roughly
 * 10,000-15,000 t/day by late June 1944 (Ruppenthal, Logistical Support of the
 * Armies, vol. 1), against NODE_TONS_PER_DAY of 15,000 for a full cell.
 */
export const BEACH_CAPACITY = 0.25;
/** Ships that carry a lodgement's supplies across the beach. */
export const SEALIFT_CLASSES: ReadonlySet<PlatformClass> = new Set(['amphibious', 'cargo_ship']);
/**
 * Cargo tons per vehicle lane and per troop berth, for landing ships the catalog rates
 * in troops and vehicles rather than tons. Fitted so a Ropucha (10 vehicles, 225 troops)
 * comes to ~450 t and a Type 074 Yuhai (2 vehicles, 250 troops) to ~250 t, their
 * published cargo loads (Jane's Fighting Ships). Estimate.
 */
export const LIFT_TONS_PER_VEHICLE = 25;
export const LIFT_TONS_PER_TROOP = 0.75;

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
 * Share of an adjacent friendly cell's factor that reaches forces fighting inside a
 * cell the network cannot enter: the last 10-20 km under drone and artillery
 * observation, crossed by night, on foot, by quad bike or unmanned ground vehicle
 * (RUSI, Watling and Reynolds, "Tactical Developments During the Third Year of the
 * Russo-Ukrainian War", 2025). Judgment; with it Russia fires 13-15k shells a day in
 * ukraine-2026, inside the 10-20k band.
 */
export const LAST_MILE_CAPACITY = 0.5;

/**
 * Supply factor a host nation gives foreign forces stationed on its ground, times the cell's
 * infrastructure: fuel, food and transport under host-nation support agreements (NATO AJP-4.5)
 * and local contracts, as at Al Udeid, Bahrain, Djibouti or Gyumri. Judgment: half a full cell,
 * the same as feeding across a contact line.
 */
export const HOST_SUPPORT = 0.5;

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

/**
 * Share of its full munition load a formation can take back from the national
 * stockpile per day at a supply factor of 1; ships rearm only in port (REARMS_IN_PORT_ONLY).
 * - Bombers rearm at their base between sorties; turning an aircraft round takes
 *   hours, so a regiment reloads fully in a day. Estimate.
 * - Land launchers reload from depot stocks over days: a Patriot launcher reloads in
 *   about an hour once missiles reach it (US Army FM 3-01.85), so delivery from the
 *   depot binds, about half a load a day at full supply. Estimate.
 * - Ships reload only alongside in port: Mk 41 VLS cells are not reloadable at sea
 *   (the US Navy first demonstrated an at-sea rig, TRAM, in 2024), and a full
 *   destroyer reload takes days pierside. Estimate.
 */
export const REARM_PER_DAY: Record<FormationKind, number> = {
  maneuver: 0.5,
  artillery: 0.5,
  // Air wings, missile brigades and air defence rearm in the air system (air/rearm.ts).
  air_defense: 0,
  missile: 0,
  air_wing: 0,
  surface_group: 0.33,
  submarine: 0.33,
  strategic: 1,
  logistics: 0.5,
  space: 0,
};
/** Kinds that can rearm only in a friendly port, never at sea. */
export const REARMS_IN_PORT_ONLY: ReadonlySet<FormationKind> = new Set(['surface_group', 'submarine']);

/**
 * Platform classes a formation regenerates without drawing them from the national
 * stockpile. Rifle squads are raised from the troops a formation already has (personnel
 * replacement draws them from reserves); trucks are requisitioned from the civilian fleet,
 * as both Russia and Ukraine have done since 2022.
 */
export const REGENERATED_CLASSES: ReadonlySet<PlatformClass> = new Set(['infantry', 'truck']);

/**
 * Days after its destruction that a land formation can be re-formed at its home
 * garrison from reserves and stockpiled equipment. Russia re-formed units destroyed in
 * 2022 (e.g. 1st Guards Tank Army, 4th Guards Tank Division) within about 3-6 months
 * (ISW, RUSI 2023); Ukraine withdraws brigades for 2-3 months of restoration. Estimate.
 */
export const RECONSTITUTE_DAYS = 90;
/** A re-formed formation must field at least this share of its establishment platforms. */
export const RECONSTITUTE_MIN_STRENGTH = 0.5;
/** Kinds that are re-formed after destruction. Lost ships and air wings are not rebuilt this way. */
export const RECONSTITUTED_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'missile']);
