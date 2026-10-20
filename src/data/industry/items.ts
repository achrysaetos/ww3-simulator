import type { ItemId } from '../../core/types';

/** Critical inputs a war economy cannot make out of money alone. */
export const RESOURCES = ['energy', 'food', 'semiconductors', 'rare_earths', 'energetics', 'steel'] as const;
export type Resource = (typeof RESOURCES)[number];

export type ItemCategory =
  | 'bulk_ammo'
  | 'shell'
  | 'rocket'
  | 'cruise_missile'
  | 'ballistic_missile'
  | 'interceptor'
  | 'aam'
  | 'atgm'
  | 'one_way_drone'
  | 'fpv_drone'
  | 'glide_kit'
  | 'armor'
  | 'artillery'
  | 'fighter'
  | 'surface_combatant'
  | 'submarine';

export interface CategorySpec {
  /**
   * First-order time constant, in months, for a line to move from its current rate
   * toward a new target. Calibrated against observed ramps: US 155 mm went from
   * ~14k/month (2022) to ~40k/month (early 2025), about 30 months for 3x; Alabuga's
   * Geran-2 output grew several-fold within a year; aircraft and hulls take years.
   */
  rampMonths: number;
  /** Share of output lost when the input is entirely unavailable. Estimates by bill of materials. */
  inputs: Partial<Record<Resource, number>>;
}

export const CATEGORIES: Record<ItemCategory, CategorySpec> = {
  bulk_ammo: { rampMonths: 9, inputs: { energy: 0.6, energetics: 0.9, steel: 0.4 } },
  shell: { rampMonths: 18, inputs: { energy: 0.6, energetics: 0.9, steel: 0.5 } },
  rocket: { rampMonths: 18, inputs: { energy: 0.5, energetics: 0.8, semiconductors: 0.6 } },
  cruise_missile: { rampMonths: 24, inputs: { energy: 0.4, semiconductors: 0.9, rare_earths: 0.6, energetics: 0.6 } },
  ballistic_missile: { rampMonths: 24, inputs: { energy: 0.4, semiconductors: 0.8, rare_earths: 0.5, energetics: 0.8 } },
  interceptor: { rampMonths: 24, inputs: { energy: 0.4, semiconductors: 0.95, rare_earths: 0.7, energetics: 0.6 } },
  aam: { rampMonths: 24, inputs: { energy: 0.4, semiconductors: 0.9, rare_earths: 0.6, energetics: 0.6 } },
  atgm: { rampMonths: 18, inputs: { energy: 0.4, semiconductors: 0.8, energetics: 0.6 } },
  // Western microelectronics were found in nearly every recovered Geran/Shahed (Conflict Armament Research, 2022-2024).
  one_way_drone: { rampMonths: 6, inputs: { energy: 0.4, semiconductors: 0.7, rare_earths: 0.3, energetics: 0.4 } },
  fpv_drone: { rampMonths: 4, inputs: { energy: 0.3, semiconductors: 0.8, rare_earths: 0.6, energetics: 0.3 } },
  glide_kit: { rampMonths: 9, inputs: { energy: 0.5, semiconductors: 0.4, steel: 0.6, energetics: 0.7 } },
  armor: { rampMonths: 12, inputs: { energy: 0.6, steel: 0.8, semiconductors: 0.3 } },
  artillery: { rampMonths: 18, inputs: { energy: 0.6, steel: 0.8, semiconductors: 0.2 } },
  // An F-35 contains ~417 kg of rare-earth materials (CRS R41744).
  fighter: { rampMonths: 36, inputs: { energy: 0.4, semiconductors: 0.95, rare_earths: 0.9, steel: 0.2 } },
  surface_combatant: { rampMonths: 48, inputs: { energy: 0.6, steel: 0.9, semiconductors: 0.6, rare_earths: 0.4 } },
  submarine: { rampMonths: 60, inputs: { energy: 0.6, steel: 0.9, semiconductors: 0.6, rare_earths: 0.5 } },
};

/** Where a finished unit goes: an item in `nation.stockpile`, or tons into `nation.bulk.ammo`. */
export type Sink = { kind: 'stockpile' } | { kind: 'bulk_ammo'; tonsPerUnit: number };

export interface ItemSpec {
  /** Catalog id. The only place a production key is tied to a catalog name; remap here. */
  id: ItemId;
  category: ItemCategory;
  sink: Sink;
  /** Full-load displacement for hulls, used to cap greenfield ship lines by yard capacity. */
  tons?: number;
}

const stock = { kind: 'stockpile' } as const;
// A complete 155/152 mm round with propelling charge and packaging is ~60 kg shipped.
const shellTons = { kind: 'bulk_ammo', tonsPerUnit: 0.06 } as const;

const item = (id: string, category: ItemCategory, sink: Sink = stock, tons?: number): ItemSpec => ({ id: id as ItemId, category, sink, ...(tons ? { tons } : {}) });

/**
 * Every item the industry model produces, keyed by production key. The coordinator
 * reconciles catalog names by editing the `id` column only.
 */
export const ITEMS = {
  // Generic small-arms, mortar, tank and grenade ammunition, counted in tons.
  ammo_generic: item('ammo_generic', 'bulk_ammo', { kind: 'bulk_ammo', tonsPerUnit: 1 }),
  shell_155: item('shell_155', 'shell', shellTons),
  shell_152: item('shell_152', 'shell', shellTons),
  gmlrs: item('gmlrs', 'rocket'),
  pac3_mse: item('pac3_mse', 'interceptor'),
  sm6: item('sm6', 'interceptor'),
  thaad: item('thaad', 'interceptor'),
  tamir: item('tamir', 'interceptor'),
  aster30: item('aster30', 'interceptor'),
  s400_48n6: item('s400_48n6', 'interceptor'),
  hq9: item('hq9', 'interceptor'),
  tomahawk: item('tomahawk', 'cruise_missile'),
  jassm: item('jassm', 'cruise_missile'),
  lrasm: item('lrasm', 'cruise_missile'),
  storm_shadow: item('storm_shadow', 'cruise_missile'),
  kh101: item('kh101', 'cruise_missile'),
  kalibr: item('kalibr', 'cruise_missile'),
  cj10: item('cj10', 'cruise_missile'),
  brahmos: item('brahmos', 'cruise_missile'),
  iskander_m: item('iskander_m', 'ballistic_missile'),
  df15: item('df15', 'ballistic_missile'),
  df21d: item('df21d', 'ballistic_missile'),
  df26: item('df26', 'ballistic_missile'),
  fateh_110: item('fateh_110', 'ballistic_missile'),
  kn23: item('kn23', 'ballistic_missile'),
  aim120: item('aim120', 'aam'),
  pl15: item('pl15', 'aam'),
  javelin: item('javelin', 'atgm'),
  stinger: item('stinger', 'atgm'),
  shahed_136: item('shahed_136', 'one_way_drone'),
  fpv_drone: item('fpv_drone', 'fpv_drone'),
  fab500_umpk: item('fab500_umpk', 'glide_kit'),
  m1a2: item('m1a2', 'armor'),
  t90m: item('t90m', 'armor'),
  // Refurbished from stored hulls; finite, see `maxTotal` on the line.
  t72b3: item('t72b3', 'armor'),
  leopard2a8: item('leopard2a8', 'armor'),
  k2: item('k2', 'armor'),
  ztz99a: item('ztz99a', 'armor'),
  k9: item('k9', 'artillery'),
  f35a: item('f35a', 'fighter'),
  su35s: item('su35s', 'fighter'),
  su34: item('su34', 'fighter'),
  j20: item('j20', 'fighter'),
  j16: item('j16', 'fighter'),
  rafale: item('rafale', 'fighter'),
  tejas: item('tejas', 'fighter'),
  ddg51: item('ddg51', 'surface_combatant', stock, 9_700),
  type055: item('type055', 'surface_combatant', stock, 13_000),
  type052d: item('type052d', 'surface_combatant', stock, 7_500),
  mogami: item('mogami', 'surface_combatant', stock, 5_500),
  ssn_virginia: item('ssn_virginia', 'submarine', stock, 10_200),
  ssn_yasen: item('ssn_yasen', 'submarine', stock, 13_800),
  ssn_093: item('ssn_093', 'submarine', stock, 7_000),
} as const satisfies Record<string, ItemSpec>;

export type ItemKey = keyof typeof ITEMS;

const byId = new Map<string, ItemSpec>(Object.values(ITEMS).map((s) => [s.id, s]));

/** The production spec for a catalog id, if the industry model knows it. */
export function itemSpec(id: ItemId): ItemSpec | undefined {
  return byId.get(id);
}
