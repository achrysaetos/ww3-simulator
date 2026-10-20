/**
 * Spec shapes and the class tables that turn a terse catalog row into a full
 * Platform or Munition. A row states what is specific to that system (cost,
 * year, speed, loadout, quality); everything typical of its class comes from
 * CLASS_TEMPLATE and CLASS_FIREPOWER below, so each class is described once.
 *
 * Firepower calibration is documented at the top of land.ts.
 */
import type { Domain, Munition, MunitionId, MunitionKind, NationId, Platform, PlatformClass, PlatformId, TargetClass } from '../../core/types';

export type Pk = Partial<Record<TargetClass, number>>;

export interface MunitionSpec {
  id: string;
  name: string;
  kind: MunitionKind;
  producers: readonly string[];
  rangeKm: number;
  speedMach: number;
  warheadKg: number;
  /** Per warhead. MIRV counts are noted in comments (Munition has no warhead-count field yet). */
  yieldKt?: number;
  cepM: number;
  pk: Pk;
  interceptDifficulty: number;
  unitCostUsdM: number;
  weightKg: number;
}

/** Keeps each id as a string literal so loadouts can be checked at compile time. */
export function defineMunitions<const T extends readonly MunitionSpec[]>(specs: T): T {
  return specs;
}

export function toMunition(s: MunitionSpec): Munition {
  return { ...s, id: s.id as MunitionId, producers: s.producers as NationId[], pk: { ...s.pk } };
}

/**
 * Counterforce single-shot kill probability of a nuclear warhead against a
 * ~2,000 psi hardened silo: SSPK = 1 - 0.5^((R/CEP)^2), with lethal radius
 * R = 22 m * Y^(1/3). The 22 m constant is an estimate fitted so that W88
 * (475 kt, 90 m CEP) gives ~0.9 and W78 (335 kt, 120 m) ~0.7, the figures
 * usually cited in open counterforce analyses (e.g. Lieber & Press 2017).
 */
export function nuclearPk(yieldKt: number, cepM: number): Pk {
  const r = 22 * Math.cbrt(yieldKt);
  const hardened = 1 - Math.pow(0.5, (r / cepM) ** 2);
  return { infantry: 1, soft: 1, structure: 1, armor: 0.95, ship: 0.95, submarine: 0.3, hardened: Math.round(hardened * 100) / 100 };
}

export const DOMAIN_OF: Record<PlatformClass, Domain> = {
  infantry: 'land', mbt: 'land', ifv: 'land', apc: 'land', recon: 'land', sp_artillery: 'land', towed_artillery: 'land', mlrs: 'land',
  atgm: 'land', engineer: 'land', truck: 'land', fuel_truck: 'land',
  sam_long: 'land', sam_medium: 'land', shorad: 'land', abm: 'land', ew: 'land', radar: 'land',
  tel_srbm: 'land', tel_mrbm: 'land', tel_irbm: 'land', icbm_silo: 'land', icbm_mobile: 'land', cruise_launcher: 'land', coastal_asm: 'land',
  fighter: 'air', multirole: 'air', attack_aircraft: 'air', bomber: 'air', stealth_bomber: 'air', awacs: 'air', tanker: 'air',
  transport_aircraft: 'air', maritime_patrol: 'air', ew_aircraft: 'air', isr_drone: 'air', strike_drone: 'air', loitering_munition_launcher: 'land',
  attack_helo: 'air', transport_helo: 'air', asw_helo: 'air',
  carrier: 'sea', amphibious: 'sea', cruiser: 'sea', destroyer: 'sea', frigate: 'sea', corvette: 'sea', patrol: 'sea', mine_warfare: 'sea',
  replenishment: 'sea', cargo_ship: 'sea', tanker_ship: 'sea', usv: 'sea',
  ssn: 'subsurface', ssk: 'subsurface', ssgn: 'subsurface', ssbn: 'subsurface', uuv: 'subsurface',
  recon_satellite: 'space', nav_satellite: 'space', comms_satellite: 'space', asat: 'space',
};

interface Template {
  crew: number;
  speedKph: number;
  rangeKm: number;
  fuelTph: number;
  armor: number;
  stealth: number;
  detectionKm: number;
}

/**
 * Typical values per class; rows override what differs. Fuel figures are
 * metric tons per hour of operation (diesel ~0.84 t/m3, JP-8 ~0.8 t/m3).
 * Air "rangeKm" is combat radius; ships and vehicles use unrefuelled range.
 * Nuclear-powered vessels use 1e6 km (effectively unlimited) and burn no fuel.
 */
export const CLASS_TEMPLATE: Record<PlatformClass, Template> = {
  // land
  infantry: { crew: 9, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.05, stealth: 0.5, detectionKm: 2 },
  mbt: { crew: 4, speedKph: 40, rangeKm: 450, fuelTph: 0.15, armor: 0.7, stealth: 0.1, detectionKm: 4 },
  ifv: { crew: 9, speedKph: 40, rangeKm: 500, fuelTph: 0.1, armor: 0.35, stealth: 0.1, detectionKm: 4 },
  apc: { crew: 11, speedKph: 50, rangeKm: 600, fuelTph: 0.06, armor: 0.2, stealth: 0.15, detectionKm: 3 },
  recon: { crew: 4, speedKph: 60, rangeKm: 600, fuelTph: 0.05, armor: 0.2, stealth: 0.4, detectionKm: 10 },
  sp_artillery: { crew: 5, speedKph: 35, rangeKm: 400, fuelTph: 0.12, armor: 0.2, stealth: 0.1, detectionKm: 30 },
  towed_artillery: { crew: 8, speedKph: 25, rangeKm: 500, fuelTph: 0.04, armor: 0.1, stealth: 0.3, detectionKm: 25 },
  mlrs: { crew: 3, speedKph: 50, rangeKm: 480, fuelTph: 0.08, armor: 0.1, stealth: 0.2, detectionKm: 40 },
  atgm: { crew: 3, speedKph: 4, rangeKm: 40, fuelTph: 0, armor: 0.05, stealth: 0.6, detectionKm: 4 },
  engineer: { crew: 9, speedKph: 30, rangeKm: 400, fuelTph: 0.05, armor: 0.25, stealth: 0.3, detectionKm: 2 },
  truck: { crew: 2, speedKph: 50, rangeKm: 500, fuelTph: 0.03, armor: 0.05, stealth: 0.2, detectionKm: 1 },
  fuel_truck: { crew: 2, speedKph: 50, rangeKm: 500, fuelTph: 0.03, armor: 0.03, stealth: 0.2, detectionKm: 1 },
  sam_long: { crew: 6, speedKph: 40, rangeKm: 500, fuelTph: 0.08, armor: 0.1, stealth: 0.1, detectionKm: 300 },
  sam_medium: { crew: 5, speedKph: 50, rangeKm: 500, fuelTph: 0.06, armor: 0.1, stealth: 0.15, detectionKm: 120 },
  shorad: { crew: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.06, armor: 0.25, stealth: 0.2, detectionKm: 25 },
  abm: { crew: 6, speedKph: 40, rangeKm: 500, fuelTph: 0.08, armor: 0.1, stealth: 0.1, detectionKm: 1000 },
  ew: { crew: 4, speedKph: 50, rangeKm: 500, fuelTph: 0.05, armor: 0.1, stealth: 0.2, detectionKm: 200 },
  radar: { crew: 5, speedKph: 30, rangeKm: 300, fuelTph: 0.05, armor: 0.05, stealth: 0, detectionKm: 600 },
  tel_srbm: { crew: 4, speedKph: 40, rangeKm: 500, fuelTph: 0.12, armor: 0.1, stealth: 0.4, detectionKm: 0 },
  tel_mrbm: { crew: 5, speedKph: 35, rangeKm: 600, fuelTph: 0.15, armor: 0.1, stealth: 0.35, detectionKm: 0 },
  tel_irbm: { crew: 5, speedKph: 35, rangeKm: 600, fuelTph: 0.18, armor: 0.1, stealth: 0.35, detectionKm: 0 },
  icbm_silo: { crew: 3, speedKph: 0, rangeKm: 0, fuelTph: 0, armor: 0.9, stealth: 0, detectionKm: 0 },
  icbm_mobile: { crew: 6, speedKph: 30, rangeKm: 500, fuelTph: 0.2, armor: 0.15, stealth: 0.45, detectionKm: 0 },
  cruise_launcher: { crew: 4, speedKph: 50, rangeKm: 600, fuelTph: 0.1, armor: 0.1, stealth: 0.35, detectionKm: 0 },
  coastal_asm: { crew: 4, speedKph: 50, rangeKm: 600, fuelTph: 0.1, armor: 0.1, stealth: 0.35, detectionKm: 200 },
  // air
  fighter: { crew: 1, speedKph: 900, rangeKm: 1000, fuelTph: 3.5, armor: 0.1, stealth: 0.2, detectionKm: 150 },
  multirole: { crew: 1, speedKph: 900, rangeKm: 900, fuelTph: 3, armor: 0.1, stealth: 0.2, detectionKm: 130 },
  attack_aircraft: { crew: 1, speedKph: 650, rangeKm: 500, fuelTph: 2, armor: 0.35, stealth: 0.1, detectionKm: 50 },
  bomber: { crew: 4, speedKph: 850, rangeKm: 5000, fuelTph: 7, armor: 0.1, stealth: 0.1, detectionKm: 200 },
  stealth_bomber: { crew: 2, speedKph: 850, rangeKm: 5000, fuelTph: 5, armor: 0.15, stealth: 0.9, detectionKm: 150 },
  awacs: { crew: 18, speedKph: 750, rangeKm: 1500, fuelTph: 6, armor: 0.05, stealth: 0, detectionKm: 400 },
  tanker: { crew: 4, speedKph: 800, rangeKm: 2000, fuelTph: 6, armor: 0.05, stealth: 0, detectionKm: 50 },
  transport_aircraft: { crew: 4, speedKph: 750, rangeKm: 4000, fuelTph: 5, armor: 0.05, stealth: 0, detectionKm: 50 },
  maritime_patrol: { crew: 9, speedKph: 750, rangeKm: 2000, fuelTph: 4, armor: 0.05, stealth: 0.05, detectionKm: 300 },
  ew_aircraft: { crew: 3, speedKph: 850, rangeKm: 800, fuelTph: 3, armor: 0.1, stealth: 0.2, detectionKm: 300 },
  isr_drone: { crew: 0, speedKph: 300, rangeKm: 1800, fuelTph: 0.1, armor: 0.05, stealth: 0.3, detectionKm: 80 },
  strike_drone: { crew: 0, speedKph: 300, rangeKm: 1500, fuelTph: 0.1, armor: 0.05, stealth: 0.3, detectionKm: 50 },
  loitering_munition_launcher: { crew: 3, speedKph: 50, rangeKm: 500, fuelTph: 0.04, armor: 0.05, stealth: 0.4, detectionKm: 0 },
  attack_helo: { crew: 2, speedKph: 250, rangeKm: 450, fuelTph: 0.5, armor: 0.3, stealth: 0.2, detectionKm: 10 },
  transport_helo: { crew: 3, speedKph: 250, rangeKm: 500, fuelTph: 0.8, armor: 0.2, stealth: 0.1, detectionKm: 5 },
  asw_helo: { crew: 3, speedKph: 220, rangeKm: 300, fuelTph: 0.5, armor: 0.15, stealth: 0.1, detectionKm: 30 },
  // sea
  carrier: { crew: 3200, speedKph: 55, rangeKm: 1e6, fuelTph: 0, armor: 0.6, stealth: 0, detectionKm: 400 },
  amphibious: { crew: 1000, speedKph: 40, rangeKm: 15000, fuelTph: 3, armor: 0.3, stealth: 0.05, detectionKm: 200 },
  cruiser: { crew: 330, speedKph: 55, rangeKm: 11000, fuelTph: 3, armor: 0.3, stealth: 0.1, detectionKm: 400 },
  destroyer: { crew: 300, speedKph: 55, rangeKm: 8000, fuelTph: 2.5, armor: 0.3, stealth: 0.2, detectionKm: 350 },
  frigate: { crew: 180, speedKph: 50, rangeKm: 8000, fuelTph: 1.5, armor: 0.25, stealth: 0.25, detectionKm: 250 },
  corvette: { crew: 90, speedKph: 48, rangeKm: 4000, fuelTph: 0.8, armor: 0.15, stealth: 0.25, detectionKm: 150 },
  patrol: { crew: 40, speedKph: 50, rangeKm: 2500, fuelTph: 0.4, armor: 0.1, stealth: 0.3, detectionKm: 60 },
  mine_warfare: { crew: 50, speedKph: 25, rangeKm: 3000, fuelTph: 0.3, armor: 0.15, stealth: 0.3, detectionKm: 20 },
  replenishment: { crew: 200, speedKph: 40, rangeKm: 12000, fuelTph: 3, armor: 0.1, stealth: 0, detectionKm: 100 },
  cargo_ship: { crew: 25, speedKph: 35, rangeKm: 20000, fuelTph: 1.5, armor: 0.05, stealth: 0, detectionKm: 30 },
  tanker_ship: { crew: 25, speedKph: 28, rangeKm: 20000, fuelTph: 1.5, armor: 0.05, stealth: 0, detectionKm: 30 },
  usv: { crew: 0, speedKph: 70, rangeKm: 800, fuelTph: 0.05, armor: 0.05, stealth: 0.5, detectionKm: 10 },
  // subsurface
  ssn: { crew: 130, speedKph: 37, rangeKm: 1e6, fuelTph: 0, armor: 0.2, stealth: 0.85, detectionKm: 60 },
  ssk: { crew: 50, speedKph: 18, rangeKm: 12000, fuelTph: 0.2, armor: 0.15, stealth: 0.85, detectionKm: 40 },
  ssgn: { crew: 150, speedKph: 37, rangeKm: 1e6, fuelTph: 0, armor: 0.2, stealth: 0.85, detectionKm: 60 },
  ssbn: { crew: 155, speedKph: 37, rangeKm: 1e6, fuelTph: 0, armor: 0.2, stealth: 0.9, detectionKm: 40 },
  uuv: { crew: 0, speedKph: 8, rangeKm: 1000, fuelTph: 0, armor: 0.05, stealth: 0.9, detectionKm: 5 },
  // space: speed is orbital velocity; detectionKm is the useful ground swath or coverage radius
  recon_satellite: { crew: 0, speedKph: 27000, rangeKm: 0, fuelTph: 0, armor: 0, stealth: 0.2, detectionKm: 500 },
  nav_satellite: { crew: 0, speedKph: 14000, rangeKm: 0, fuelTph: 0, armor: 0, stealth: 0.1, detectionKm: 0 },
  comms_satellite: { crew: 0, speedKph: 11000, rangeKm: 0, fuelTph: 0, armor: 0, stealth: 0.1, detectionKm: 0 },
  asat: { crew: 6, speedKph: 30, rangeKm: 500, fuelTph: 0.15, armor: 0.1, stealth: 0.3, detectionKm: 0 },
};

/**
 * Firepower of a typical in-service member of each class at quality 1.0.
 * Rows scale it by `q` and may override single target classes with `fp`.
 * See the calibration rule at the top of land.ts.
 */
export const CLASS_FIREPOWER: Record<PlatformClass, Pk> = {
  infantry: { infantry: 0.02, soft: 0.01, armor: 0.003 },
  mbt: { armor: 0.05, soft: 0.06, infantry: 0.05, structure: 0.01 },
  ifv: { armor: 0.02, soft: 0.05, infantry: 0.05, helicopter: 0.002 },
  apc: { infantry: 0.03, soft: 0.03, armor: 0.004 },
  recon: { infantry: 0.02, soft: 0.03, armor: 0.008 },
  sp_artillery: { infantry: 0.12, soft: 0.1, armor: 0.02, structure: 0.03 },
  towed_artillery: { infantry: 0.1, soft: 0.08, armor: 0.012, structure: 0.025 },
  mlrs: { infantry: 0.2, soft: 0.18, armor: 0.025, structure: 0.05 },
  atgm: { armor: 0.04, soft: 0.02, infantry: 0.01, helicopter: 0.003 },
  engineer: { infantry: 0.015, soft: 0.01, armor: 0.004, structure: 0.02 },
  truck: {},
  fuel_truck: {},
  sam_long: {},
  sam_medium: {},
  shorad: { helicopter: 0.05, aircraft: 0.02, missile: 0.03 },
  abm: {},
  ew: {},
  radar: {},
  tel_srbm: {},
  tel_mrbm: {},
  tel_irbm: {},
  icbm_silo: {},
  icbm_mobile: {},
  cruise_launcher: {},
  coastal_asm: {},
  fighter: { aircraft: 0.3, helicopter: 0.1 },
  multirole: { aircraft: 0.25, helicopter: 0.1, armor: 0.15, soft: 0.2, ship: 0.03, structure: 0.05 },
  attack_aircraft: { armor: 0.3, soft: 0.3, infantry: 0.2, helicopter: 0.02 },
  bomber: { structure: 0.3, soft: 0.4, infantry: 0.3, armor: 0.1 },
  stealth_bomber: { structure: 0.4, hardened: 0.1, soft: 0.3 },
  awacs: {},
  tanker: {},
  transport_aircraft: {},
  maritime_patrol: { submarine: 0.05, ship: 0.03 },
  ew_aircraft: {},
  isr_drone: {},
  strike_drone: { armor: 0.04, soft: 0.06, infantry: 0.03 },
  loitering_munition_launcher: {},
  attack_helo: { armor: 0.2, soft: 0.15, infantry: 0.1, helicopter: 0.03 },
  transport_helo: {},
  asw_helo: { submarine: 0.04, ship: 0.01 },
  carrier: { aircraft: 0.05, missile: 0.05 },
  amphibious: { aircraft: 0.02, missile: 0.03 },
  cruiser: { ship: 0.25, aircraft: 0.35, missile: 0.35, submarine: 0.03 },
  destroyer: { ship: 0.2, aircraft: 0.3, missile: 0.3, submarine: 0.04 },
  frigate: { ship: 0.12, aircraft: 0.15, missile: 0.15, submarine: 0.06 },
  corvette: { ship: 0.08, aircraft: 0.05, missile: 0.06, submarine: 0.02 },
  patrol: { ship: 0.03, missile: 0.01 },
  mine_warfare: {},
  replenishment: {},
  cargo_ship: {},
  tanker_ship: {},
  usv: { ship: 0.03 },
  ssn: { ship: 0.3, submarine: 0.2 },
  ssk: { ship: 0.2, submarine: 0.1 },
  ssgn: { ship: 0.3, submarine: 0.15 },
  ssbn: { submarine: 0.05 },
  uuv: {},
  recon_satellite: {},
  nav_satellite: {},
  comms_satellite: {},
  asat: {},
};

export interface PlatformSpec<M extends string> {
  id: string;
  name: string;
  cls: PlatformClass;
  producers: readonly string[];
  inService: number;
  unitCostUsdM: number;
  /** Firepower multiplier on the class baseline: generation, fire control, crew training. 1.0 = typical modern. */
  q?: number;
  /** Replaces the scaled class value for these target classes. */
  fp?: Pk;
  load?: Partial<Record<M, number>>;
  domain?: Domain;
  crew?: number;
  speedKph?: number;
  rangeKm?: number;
  fuelTph?: number;
  armor?: number;
  stealth?: number;
  detectionKm?: number;
  channels?: number;
  capacity?: Platform['capacity'];
  nuclear?: boolean;
}

const round = (x: number) => Math.round(x * 10_000) / 10_000;

export function toPlatform<M extends string>(s: PlatformSpec<M>): Platform {
  const t = CLASS_TEMPLATE[s.cls];
  const q = s.q ?? 1;
  const firepower: Pk = {};
  for (const [tc, v] of Object.entries(CLASS_FIREPOWER[s.cls]) as [TargetClass, number][]) firepower[tc] = round(v * q);
  Object.assign(firepower, s.fp);
  const p: Platform = {
    id: s.id as PlatformId,
    name: s.name,
    class: s.cls,
    domain: s.domain ?? DOMAIN_OF[s.cls],
    producers: s.producers as NationId[],
    inService: s.inService,
    unitCostUsdM: s.unitCostUsdM,
    crew: s.crew ?? t.crew,
    mobility: { speedKph: s.speedKph ?? t.speedKph, rangeKm: s.rangeKm ?? t.rangeKm, fuelTonsPerHour: s.fuelTph ?? t.fuelTph },
    protection: { armor: s.armor ?? t.armor, stealth: s.stealth ?? t.stealth },
    sensors: { detectionKm: s.detectionKm ?? t.detectionKm },
    firepower,
    loadout: Object.entries(s.load ?? {}).map(([munition, count]) => ({ munition: munition as MunitionId, count: count as number })),
  };
  if (s.channels !== undefined) p.engagementChannels = s.channels;
  if (s.capacity) p.capacity = s.capacity;
  if (s.nuclear) p.nuclearCapable = true;
  return p;
}
