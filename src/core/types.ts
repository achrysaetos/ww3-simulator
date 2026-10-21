/**
 * The shared data model. Every subsystem reads and writes a World; nothing
 * else carries simulation state. The World is plain JSON so a run can be
 * saved, replayed, diffed, and shipped to a web worker unchanged.
 *
 * Subsystems that need private state declare it on `Slices` via module
 * augmentation in their own folder, so no two subsystems edit this file:
 *
 *   declare module '../core/types' { interface Slices { economy: EconomyState } }
 */

export type NationId = string & { readonly __brand: 'NationId' }; // ISO3, e.g. 'USA'
export type NodeId = number & { readonly __brand: 'NodeId' }; // index into GameMap nodes (land cells, then sea zones)
export type FormationId = string & { readonly __brand: 'FormationId' };
export type PlatformId = string & { readonly __brand: 'PlatformId' };
export type MunitionId = string & { readonly __brand: 'MunitionId' };
export type ItemId = PlatformId | MunitionId;

export const TERRAINS = ['plain', 'forest', 'jungle', 'hills', 'mountain', 'desert', 'marsh', 'arctic', 'urban'] as const;
export type Terrain = (typeof TERRAINS)[number];

// ---------------------------------------------------------------- catalog

export type Domain = 'land' | 'air' | 'sea' | 'subsurface' | 'space';

/** What a weapon is shooting at. Kill probabilities and firepower are keyed by this. */
export const TARGET_CLASSES = ['infantry', 'soft', 'armor', 'aircraft', 'helicopter', 'ship', 'submarine', 'missile', 'structure', 'hardened', 'power'] as const;
export type TargetClass = (typeof TARGET_CLASSES)[number];

export type PlatformClass =
  // land
  | 'infantry' | 'mbt' | 'ifv' | 'apc' | 'recon' | 'sp_artillery' | 'towed_artillery' | 'mlrs'
  | 'atgm' | 'engineer' | 'truck' | 'fuel_truck'
  | 'sam_long' | 'sam_medium' | 'shorad' | 'abm' | 'ew' | 'radar'
  | 'tel_srbm' | 'tel_mrbm' | 'tel_irbm' | 'icbm_silo' | 'icbm_mobile' | 'cruise_launcher' | 'coastal_asm'
  // air
  | 'fighter' | 'multirole' | 'attack_aircraft' | 'bomber' | 'stealth_bomber' | 'awacs' | 'tanker'
  | 'transport_aircraft' | 'maritime_patrol' | 'ew_aircraft' | 'isr_drone' | 'strike_drone' | 'loitering_munition_launcher'
  | 'attack_helo' | 'transport_helo' | 'asw_helo'
  // sea
  | 'carrier' | 'amphibious' | 'cruiser' | 'destroyer' | 'frigate' | 'corvette' | 'patrol' | 'mine_warfare'
  | 'replenishment' | 'cargo_ship' | 'tanker_ship' | 'usv'
  // subsurface
  | 'ssn' | 'ssk' | 'ssgn' | 'ssbn' | 'uuv'
  // space
  | 'recon_satellite' | 'nav_satellite' | 'comms_satellite' | 'asat';

export interface Platform {
  id: PlatformId;
  name: string;
  class: PlatformClass;
  domain: Domain;
  /** Nations that can manufacture it. */
  producers: NationId[];
  /** Year the variant entered service. */
  inService: number;
  unitCostUsdM: number;
  crew: number;
  mobility: {
    /** Sustained operational speed. */
    speedKph: number;
    /** Unrefuelled radius (aircraft: combat radius; ships/vehicles: range). */
    rangeKm: number;
    /** Fuel burned per hour of operation, metric tons. */
    fuelTonsPerHour: number;
  };
  protection: {
    /** Abstract survivability 0..1 vs a single hit of its class's typical threat. */
    armor: number;
    /** 0 = very visible, 1 = near-undetectable (stealth, quiet subs). */
    stealth: number;
  };
  sensors: { detectionKm: number };
  /** Organic direct-fire/strike power per target class, per platform per hour of engaged combat (abstract kills-equivalent). */
  firepower: Partial<Record<TargetClass, number>>;
  /** Munitions carried per platform per sortie or per full load. */
  loadout: { munition: MunitionId; count: number }[];
  /** For air-defense, ABM and ships: simultaneous engagement channels. */
  engagementChannels?: number;
  /** Lift capacity for transports and carriers. */
  capacity?: { cargoTons?: number; troops?: number; aircraft?: number; vehicles?: number };
  /** Nuclear-capable delivery system. */
  nuclearCapable?: boolean;
}

export type MunitionKind =
  | 'srbm' | 'mrbm' | 'irbm' | 'icbm' | 'slbm' | 'hgv' | 'cruise' | 'antiship_cruise' | 'antiship_ballistic'
  | 'aam' | 'sam' | 'abm' | 'shorad_missile' | 'glide_bomb' | 'guided_bomb' | 'unguided_bomb'
  | 'atgm' | 'shell' | 'guided_shell' | 'rocket' | 'guided_rocket' | 'torpedo' | 'mine' | 'loitering' | 'drone_oneway'
  | 'arm' | 'small_arms';

export interface Munition {
  id: MunitionId;
  name: string;
  kind: MunitionKind;
  producers: NationId[];
  rangeKm: number;
  speedMach: number;
  warheadKg: number;
  /** Nuclear yield in kilotons; absent for conventional. */
  yieldKt?: number;
  /** Circular error probable, meters. */
  cepM: number;
  /** Single-shot kill probability against each target class it can engage. */
  pk: Partial<Record<TargetClass, number>>;
  /** 0 = trivially intercepted, 1 = effectively unstoppable with current defenses. */
  interceptDifficulty: number;
  unitCostUsdM: number;
  weightKg: number;
}

// ---------------------------------------------------------------- forces

export type FormationKind =
  | 'maneuver' // brigades/divisions/corps of ground troops
  | 'artillery'
  | 'air_defense'
  | 'missile' // ground-launched strike missiles
  | 'air_wing'
  | 'surface_group'
  | 'submarine'
  | 'strategic' // nuclear triad elements
  | 'logistics'
  | 'space';

export type Echelon = 'battalion' | 'brigade' | 'division' | 'corps' | 'army' | 'squadron' | 'wing' | 'flotilla' | 'task_group' | 'fleet';

export type Posture =
  | 'reserve' // regenerating, not engaging
  | 'defend' // dig in, hold node
  | 'attack' // assault order.target
  | 'move' // follow path
  | 'strike' // air/missile: hit order.target
  | 'air_superiority' // fighters contest airspace over order.target
  | 'patrol' // naval/air presence
  | 'blockade' // naval interdiction of a sea zone
  | 'escort' // protect another formation
  | 'embark' // loaded on sea/air lift
  | 'air_assault'; // airborne/air-assault insertion onto order.target

export interface Order {
  posture: Posture;
  target?: NodeId;
  /** For strikes, what to aim at. */
  targetClass?: TargetClass;
  targetFormation?: FormationId;
  /** Precomputed route; movement consumes from the front. */
  path?: NodeId[];
  /** Restrict munition expenditure. */
  munition?: MunitionId;
  /** For an overseas 'move': how to cross. 'sea' keeps an air-portable formation off the airlift; absent picks air when it can fly. */
  lift?: 'air' | 'sea';
  issuedTick: number;
}

export interface Formation {
  id: FormationId;
  nation: NationId;
  name: string;
  kind: FormationKind;
  echelon: Echelon;
  node: NodeId;
  /** Airbase/port/garrison it regenerates at. */
  home: NodeId;
  /** Operational platforms by type. */
  equipment: Record<PlatformId, number>;
  /** Platforms awaiting repair; flow back into equipment over time. */
  damaged: Record<PlatformId, number>;
  personnel: number;
  /** Munitions held by the formation (missiles, PGMs, interceptors, torpedoes). */
  magazine: Record<MunitionId, number>;
  /** Bulk consumables in metric tons. */
  supply: { fuel: number; ammo: number; food: number };
  /** Bulk capacity it can carry, in tons, used to compute supply fractions. */
  supplyCapacity: { fuel: number; ammo: number; food: number };
  readiness: number; // 0..1 training/maintenance state
  morale: number; // 0..1
  experience: number; // 0..1
  fatigue: number; // 0..1, accumulates in combat/movement
  entrenchment: number; // 0..1, accumulates while defending
  /** Accumulated movement progress toward path[0], km. */
  progressKm: number;
  order: Order;
  status: 'active' | 'routed' | 'destroyed' | 'embarked';
  /** Carrier/transport formation this one is embarked on. */
  embarkedOn?: FormationId;
  /** Territorial or home-defence force (Polish WOT, Ukrainian TDF, Baltic and Nordic home guards): fights only on its own nation's soil. */
  territorial?: true;
  /** Trained and equipped to be inserted by parachute or helicopter (VDV, US 82nd/101st/173rd, PLA Airborne Corps). */
  airborne?: true;
}

// ---------------------------------------------------------------- nations

export type Government = 'liberal_democracy' | 'flawed_democracy' | 'hybrid' | 'authoritarian' | 'totalitarian' | 'theocracy' | 'military_junta' | 'monarchy';

export interface NationStats {
  gdp?: number;
  gdpPpp?: number;
  population?: number;
  milexPctGdp?: number;
  milexUsd?: number;
  armedForces?: number;
  manufacturing?: number;
  exportsPctGdp?: number;
  importsPctGdp?: number;
  energyImportPct?: number;
  oilRentsPct?: number;
  gasRentsPct?: number;
  foodImportPct?: number;
  urbanPct?: number;
  workingAgePct?: number;
  govDebtPctGdp?: number;
  railKm?: number;
  highTechExportsUsd?: number;
}

export interface Nation {
  id: NationId;
  name: string;
  /** Baseline statistics (peacetime, from open data). */
  stats: NationStats;
  capital: NodeId;
  government: Government;
  /** Military treaties whose members host, transit and supply each other's forces, e.g. 'NATO', 'CSTO'; never SCO or BRICS. */
  blocs: string[];
  /** Current warfighting state; subsystems update these. */
  population: number;
  /** Fraction of the economy converted to war production, 0..1. */
  mobilization: number;
  /** Public/elite will to keep fighting, 0..1. Below ~0.2 a nation seeks terms. */
  warSupport: number;
  /** Trained manpower ready to replace losses or man new formations. */
  reserves: number;
  /** Trained reservists not yet recalled; mobilization recalls them into `reserves` after a refresher. */
  reservists: number;
  /** Warehoused munitions and platforms not assigned to formations. */
  stockpile: Record<ItemId, number>;
  /** National bulk stocks, tons. */
  bulk: { fuel: number; ammo: number; food: number };
  /** Treasury in USD billions; deficit spending pushes it negative. */
  treasuryUsdB: number;
  nuclear: { warheads: number; deployed: number; doctrine: 'no_first_use' | 'calculated_ambiguity' | 'escalate_to_deescalate' | 'none' };
  controlledBy: 'human' | 'ai';
  status: 'peace' | 'war' | 'capitulated' | 'collapsed';
}

// ---------------------------------------------------------------- diplomacy

/** Escalation rungs between a pair of nations, ordered. */
export const ESCALATION = ['peace', 'tension', 'crisis', 'conventional', 'strategic_conventional', 'tactical_nuclear', 'strategic_nuclear'] as const;
export type EscalationLevel = (typeof ESCALATION)[number];

export interface Relation {
  /** -100 hostile .. 100 allied. */
  opinion: number;
  atWar: boolean;
  escalation: EscalationLevel;
  sanctions: boolean;
  /** Tick war was declared, for war-weariness. */
  warSince?: number;
}

// ---------------------------------------------------------------- events and commands

/**
 * What one strike did, as data for readers to word. Levels are 0..1 shares of capacity before
 * and after the strike. An empty list is a strike that changed nothing.
 */
export type StrikeEffect =
  | { kind: 'losses'; platforms: Partial<Record<PlatformId, number>> }
  | { kind: 'ship_hits'; formation: FormationId; hits: number }
  | { kind: 'infrastructure' | 'grid' | 'runway'; before: number; after: number }
  | { kind: 'sam_suppressed'; sites: number }
  | { kind: 'nuclear_detonations'; count: number }
  | { kind: 'satellites_destroyed'; count: number }
  /** Why the rounds that got through did nothing: none got through, nothing hostile to hit there, or no target of the aimed class found. */
  | { kind: 'no_effect'; why: 'all_intercepted' | 'not_hostile' | 'no_targets' };

export type SimEvent =
  | { type: 'war_declared'; tick: number; by: NationId; on: NationId; reason: string }
  | { type: 'peace'; tick: number; a: NationId; b: NationId; terms: string }
  | { type: 'battle'; tick: number; node: NodeId; attacker: NationId; defender: NationId; losses: Record<NationId, Record<PlatformId, number>>; casualties: Record<NationId, number>; winner?: NationId; domain?: 'land' | 'sea' | 'air' }
  | { type: 'strike'; tick: number; by: NationId; munition: MunitionId; fired: number; intercepted: number; target: NodeId; effects: StrikeEffect[] }
  | { type: 'node_captured'; tick: number; node: NodeId; from: NationId; to: NationId }
  | { type: 'formation_destroyed'; tick: number; formation: FormationId; nation: NationId }
  | { type: 'nuclear_detonation'; tick: number; by: NationId; node: NodeId; yieldKt: number; casualties: number }
  | { type: 'escalation'; tick: number; a: NationId; b: NationId; level: EscalationLevel }
  /** A nation mating stored warheads to launchers: ordered, first tranche ready, all ready. */
  | { type: 'nuclear_alert'; tick: number; nation: NationId; stage: 'ordered' | 'ready' | 'complete'; ready: number; of: number; reason: string }
  | { type: 'production'; tick: number; nation: NationId; item: ItemId; count: number }
  | { type: 'shortage'; tick: number; nation: NationId; what: string }
  | { type: 'capitulation'; tick: number; nation: NationId; to: NationId[] }
  | { type: 'message'; tick: number; nation?: NationId; text: string }
  | CommandResult;

/** Why a command was refused. A closed set, so the UI can word and act on each one. */
export type RefusalCode =
  /** The command names a nation or formation the issuer does not command. */
  | 'not_yours'
  /** The command failed the boundary's checks: an unknown id, a malformed field. */
  | 'invalid'
  | 'unknown_formation'
  | 'destroyed'
  /** Not fit to act now: routed, in a shipyard, already embarked. */
  | 'not_ready'
  /** The formation's kind or equipment cannot carry out that posture. */
  | 'wrong_role'
  | 'no_target'
  /** The target or lift named is not one the order can use. */
  | 'bad_target'
  | 'out_of_range'
  | 'no_lift'
  | 'no_route'
  | 'no_airfield'
  /** An air assault without friendly air control over the drop zone. */
  | 'no_air_cover'
  | 'not_in_port'
  | 'embarked'
  /** The target belongs to a nation the issuer is not at war with. */
  | 'neutral_territory';

/**
 * The answer to one command, emitted by whichever system applied it. 'relayed' means the order is
 * in transit down a degraded chain of command (c2) and a final answer follows when it arrives.
 */
export type CommandResult = {
  type: 'command_result';
  tick: number;
  nation: NationId;
  command: Command['type'];
  formation?: FormationId;
  /** The human player issued it (an order flagged `byPlayer`, or a command only players issue). */
  byPlayer?: true;
  reason: string;
} & (
  | {
      ok: true;
      code: 'accepted' | 'relayed';
      /** Hours until the order takes effect or the formation arrives, when known. */
      etaHours?: number;
      /** A caveat the player should hear with the acceptance. */
      note?: string;
    }
  | { ok: false; code: RefusalCode }
);

export type Command =
  /**
   * `byPlayer` marks the human player's own order: accepted, it takes the formation from the AI
   * delegate; refused, the delegate keeps it. Only the session host sets it.
   */
  | { type: 'order'; nation: NationId; formation: FormationId; order: Omit<Order, 'issuedTick'>; byPlayer?: true }
  | { type: 'declare_war'; nation: NationId; target: NationId; reason?: string }
  | { type: 'offer_peace'; nation: NationId; target: NationId }
  | { type: 'sanction'; nation: NationId; target: NationId; on: boolean }
  | { type: 'set_mobilization'; nation: NationId; level: number }
  | { type: 'produce'; nation: NationId; item: ItemId; ratePerMonth: number }
  | { type: 'nuclear_release'; nation: NationId; target: NodeId; warheads: number; munition: MunitionId }
  /** Order stored warheads mated to their launchers (see strategic/alert.ts). */
  | { type: 'nuclear_alert'; nation: NationId; reason?: string }
  /** A human nation hands a domain to its AI delegate, or takes it back. */
  | { type: 'delegate'; nation: NationId; domain: CommandDomain; ai: boolean }
  /** A human nation takes formations under its own command (the delegate leaves them alone) or hands them back. */
  | { type: 'hold'; nation: NationId; formations: FormationId[]; held: boolean }
  /** A human nation's answer to a treaty call it has been asked to honour. */
  | { type: 'answer_treaty'; nation: NationId; war: string; treaty: string; join: boolean }
  /** The host `nation` opens its land to `target`'s troops, or closes it again. */
  | { type: 'grant_access'; nation: NationId; target: NationId; on: boolean }
  /** `nation` helps the belligerent `target` without joining its war: its air defence covers `target`. */
  | { type: 'set_aid'; nation: NationId; target: NationId; on: boolean };

/**
 * What a human player can delegate to the AI: the forces of each domain, the home front
 * (mobilisation and production), and strategic decisions (war, peace, treaty entry, nuclear release).
 */
export const COMMAND_DOMAINS = ['land', 'air', 'naval', 'homefront', 'strategic'] as const;
export type CommandDomain = (typeof COMMAND_DOMAINS)[number];

// ---------------------------------------------------------------- world

/** Private per-subsystem state; extended by module augmentation. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Slices {}

export interface World {
  seed: number;
  /** RNG state, advanced deterministically by ctx.rng. */
  rngState: number;
  tick: number;
  /** Hours simulated per tick. */
  dtHours: number;
  /** ISO timestamp of tick 0. */
  startDate: string;
  nations: Record<NationId, Nation>;
  /** Controlling nation per land node (index = NodeId); '' for sea nodes. */
  control: NationId[];
  formations: Record<FormationId, Formation>;
  /** Key is relationKey(a, b), always sorted. */
  relations: Record<string, Relation>;
  /** Commands queued for the next tick (from players or AI). */
  pending: Command[];
  /** Events emitted during the most recent tick. */
  events: SimEvent[];
  /** Rolling history of notable events. */
  history: SimEvent[];
  nextId: number;
  /** Overrides of calibration params (src/core/params.ts) in force for this run, by param id. Absent = every default. */
  params?: Record<string, number>;
  /** Cross-system signals: one system writes each field, several read it. */
  theater: Theater;
  slices: Slices;
}

/**
 * Battlefield conditions shared between subsystems. Each field has exactly one
 * writer (named below); everyone else only reads.
 */
export interface Theater {
  /** Writer: air. Which nation holds the air over a node and how firmly (0..1). Absent = contested/none. */
  airControl: Record<number, { nation: NationId; level: number }>;
  /** Writer: naval. Which nation controls a sea node and how firmly (0..1). */
  seaControl: Record<number, { nation: NationId; level: number }>;
  /** Writers: any strike (air, missile, strategic) multiplies down; logistics repairs up. Per node 0..1, 1 = intact. */
  infrastructure: number[];
  /** Writer: naval. Share of each nation's seaborne trade currently interdicted, 0..1. */
  tradeBlocked: Record<NationId, number>;
  /** Writer: strategic. Radiation/fallout intensity per node, decays over time. */
  fallout: Record<number, number>;
  /**
   * Writer: air (strikes on the 'power' target class, and repair). Generation and grid capacity
   * serving each land cell, 0..1; absent = intact. Absent in older saves.
   */
  power?: Record<number, number>;
}
