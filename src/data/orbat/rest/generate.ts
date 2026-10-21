/**
 * Plausible forces for every nation without a hand-written order of battle.
 *
 * Calibration (all estimates, stated so a reader can challenge them):
 * - Total personnel equals World Bank `armedForces` (IISS-sourced); nations with no figure
 *   get 0.1% of population, floored at 100.
 * - Split: air 12% if spending is at least $0.05B, navy/coast guard 8% if coastal, air
 *   defence 5% if spending is at least $0.5B, ground forces the rest.
 * - Tanks per 1,000 ground troops by supplier (soviet 5.0, chinese 2.4, western 0.6),
 *   scaled by spending per soldier against $25k (clamped 0.25..1.5).
 * - Combat aircraft = 14 x (milex in $B)^0.7, zero below $0.15B.
 * - Kit follows each nation's main supplier (SIPRI Arms Transfers Database); the better
 *   variant needs both $40k per soldier and $3B total spending.
 * Spot checks, generated vs IISS 2025 (approximate). Tanks: Angola 219/~300, Kazakhstan
 * 196/~350, Bangladesh 276/~320, Peru 389/~165, Kuwait 17/~290. Combat aircraft: Oman
 * 49/~47, Kuwait 60/~55, Kenya 18/~17. Single nations can be off by 2x or more; a nation
 * that matters to a scenario should be hand-modelled.
 * Submarines are not generated; the few small-navy SSK fleets (Chile, Peru, Colombia,
 * Malaysia, Bangladesh) are left to hand modelling.
 */
import type { GameMap } from '../../../core/map';
import type { Echelon, NationStats } from '../../../core/types';
import type { OrbatEntry } from '../types';
import type { Base, Kit } from './build';
import { REST_NATIONS } from './hand';
import type { KitId } from './kit';
import { placeOnOwnLand } from './place';

export type Supplier = 'soviet' | 'chinese' | 'western' | 'light';
type Tier = 'low' | 'high';

interface SupplierKit {
  mbt: KitId; ifv: KitId; apc: KitId; gun: KitId; mlrs: KitId;
  fighter: KitId; attack: KitId; helo: KitId; transport: KitId;
  sam: KitId; shorad: KitId; frigate: KitId;
}

const KITS: Record<Exclude<Supplier, 'light'>, Record<Tier, SupplierKit>> = {
  soviet: {
    low: { mbt: 't55', ifv: 'bmp1', apc: 'btr60', gun: 'd30', mlrs: 'bm21', fighter: 'mig21', attack: 'su25', helo: 'mi8', transport: 'an26', sam: 's125_pechora', shorad: 'zsu_23_4', frigate: 'koni' },
    high: { mbt: 't72', ifv: 'bmp2', apc: 'btr80', gun: 'msta_b', mlrs: 'bm21', fighter: 'mig29', attack: 'su25', helo: 'mi17', transport: 'an26', sam: 's300ps', shorad: 'osa_ak', frigate: 'koni' },
  },
  chinese: {
    low: { mbt: 'type59', ifv: 'vn1', apc: 'wz551', gun: 'type59_1_gun', mlrs: 'type63_mlrs', fighter: 'f7', attack: 'k8', helo: 'z9', transport: 'y8', sam: 'ly80_launcher', shorad: 'fm90', frigate: 'jianghu' },
    high: { mbt: 'vt4', ifv: 'vn1', apc: 'wz551', gun: 'sh15_sph', mlrs: 'phl03', fighter: 'jf17', attack: 'k8', helo: 'z9', transport: 'y8', sam: 'fd2000b', shorad: 'fm90', frigate: 'jianghu' },
  },
  western: {
    low: { mbt: 'm60a3', ifv: 'm113', apc: 'm113', gun: 'm101', mlrs: 'astros2', fighter: 'f5e', attack: 'a29', helo: 'uh1h', transport: 'c130h', sam: 'hawk', shorad: 'rbs70', frigate: 'oliver_hazard_perry' },
    high: { mbt: 'leopard2a4', ifv: 'm2a2_bradley', apc: 'm113', gun: 'm109a5', mlrs: 'himars', fighter: 'f16c', attack: 'a29', helo: 'uh60', transport: 'c130h', sam: 'patriot_pac3', shorad: 'rbs70', frigate: 'meko_a200' },
  },
};

const TANKS_PER_K: Record<Supplier, number> = { soviet: 5.0, chinese: 2.4, western: 0.6, light: 0 };

/** Main arms supplier by nation (SIPRI Arms Transfers Database, 1990-2024 deliveries). */
const SUPPLIER_GROUPS: Record<Supplier, readonly string[]> = {
  soviet: [
    'AFG', 'AGO', 'ARM', 'AZE', 'BGR', 'BLR', 'CAF', 'COG', 'CUB', 'CYP', 'DZA', 'ERI', 'ETH', 'GEO', 'GIN', 'IND', 'IRN', 'KAZ', 'KGZ',
    'LAO', 'LBY', 'MLI', 'MNG', 'MOZ', 'NIC', 'PER', 'PRK', 'RUS', 'SRB', 'SSD', 'SYR', 'TCD', 'TJK', 'TKM', 'UGA', 'UKR', 'UZB', 'VEN',
    'VNM', 'YEM', 'BFA', 'COD', 'MDA',
  ],
  chinese: ['BGD', 'BOL', 'CHN', 'CMR', 'GHA', 'KHM', 'LKA', 'MMR', 'MRT', 'NAM', 'PAK', 'SDN', 'TZA', 'ZMB', 'ZWE', 'NER'],
  western: [
    'ALB', 'ARE', 'ARG', 'AUS', 'AUT', 'BEL', 'BHR', 'BRA', 'BRN', 'BWA', 'CAN', 'CHE', 'CHL', 'CIV', 'COL', 'CZE', 'DEU', 'DNK', 'DOM',
    'ECU', 'EGY', 'ESP', 'EST', 'FIN', 'FRA', 'GAB', 'GBR', 'GRC', 'GTM', 'HND', 'HRV', 'HUN', 'IRL', 'IRQ', 'ISR', 'ITA', 'JOR', 'JPN',
    'KEN', 'KOR', 'KWT', 'LBN', 'LTU', 'LUX', 'LVA', 'MAR', 'MEX', 'MKD', 'MLT', 'MNE', 'MYS', 'NGA', 'NLD', 'NOR', 'NZL', 'OMN', 'PHL',
    'POL', 'PRT', 'PRY', 'QAT', 'ROU', 'SAU', 'SEN', 'SGP', 'SLV', 'SVK', 'SVN', 'SWE', 'THA', 'TUN', 'TUR', 'TWN', 'URY', 'USA', 'ZAF',
    'IDN', 'SOM', 'RWA',
  ],
  light: [
    'ATG', 'BDI', 'BEN', 'BHS', 'BLZ', 'BRB', 'BTN', 'COM', 'CPV', 'CRI', 'DJI', 'DMA', 'FJI', 'FSM', 'GMB', 'GNB', 'GNQ', 'GRD', 'GUY',
    'HTI', 'ISL', 'JAM', 'KIR', 'KNA', 'LBR', 'LCA', 'LSO', 'MCO', 'MDG', 'MDV', 'MHL', 'MUS', 'MWI', 'NPL', 'NRU', 'PAN', 'PLW', 'PNG',
    'PSE', 'SLB', 'SLE', 'STP', 'SUR', 'SWZ', 'SYC', 'TGO', 'TLS', 'TON', 'TTO', 'VAT', 'VCT', 'VUT', 'WSM', 'XKX',
  ],
};

export const SUPPLIER: Readonly<Record<string, Supplier>> = Object.fromEntries(
  (Object.entries(SUPPLIER_GROUPS) as [Supplier, readonly string[]][]).flatMap(([s, isos]) => isos.map((iso) => [iso, s])),
);

/** Forces with recent sustained combat (IISS 2025 regional analysis); others default to 0.3. */
const EXPERIENCE: Readonly<Record<string, number>> = {
  AFG: 0.6, SDN: 0.6, SSD: 0.5, YEM: 0.6, MMR: 0.6, SOM: 0.5, MLI: 0.5, BFA: 0.5, NER: 0.5, COD: 0.5, LBY: 0.55, COL: 0.6,
  ERI: 0.5, CMR: 0.45, MOZ: 0.45, TCD: 0.5, RWA: 0.55, UGA: 0.5,
};

/**
 * Nations other workers model by hand (assumed from the work split: US, NATO Europe and
 * Canada, Russia and its partners, China, North Korea, Iran). Turkey is modelled here.
 * The coordinator passes the authoritative set to `generatedOrbat` after merging.
 */
export const HAND_MODELLED_ELSEWHERE: ReadonlySet<string> = new Set([
  'USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'PRT', 'NLD', 'BEL', 'LUX', 'DNK', 'NOR', 'ISL', 'SWE', 'FIN', 'POL', 'CZE', 'SVK',
  'HUN', 'ROU', 'BGR', 'GRC', 'ALB', 'MKD', 'MNE', 'HRV', 'SVN', 'EST', 'LVA', 'LTU',
  'TUR', 'RUS', 'BLR', 'UKR', 'CHN', 'PRK', 'IRN',
]);

const SOURCE = 'Generated estimate: personnel from World Bank/IISS armed forces, scale from SIPRI military expenditure, kit by main supplier';

const ORDINAL = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Land bases in priority order: capital first, then other cities by population, then the most populous cells. */
function landBases(map: GameMap, iso3: string): Base[] {
  const cities = map.cities
    .filter((c) => c.nation === iso3)
    .sort((a, b) => Number(b.capital) - Number(a.capital) || b.pop - a.pop || a.name.localeCompare(b.name));
  if (cities.length) return cities.map((c) => ({ name: c.name, lat: c.lat, lon: c.lon }));
  const capital = map.data.nations.find((n) => n.iso3 === iso3)?.capital;
  const cells = map.nodesOf(iso3 as never).sort((a, b) => map.popShare[b] - map.popShare[a] || a - b);
  return cells.slice(0, 3).map((n, i) => ({ name: i === 0 && capital ? capital.name : `${iso3} garrison ${i + 1}`, lat: +map.lat[n].toFixed(2), lon: +map.lon[n].toFixed(2) }));
}

/** Coastal base: the most important coastal city, else the most populous coastal cell. */
function coastalBase(map: GameMap, iso3: string, bases: Base[]): Base | undefined {
  for (const b of bases) if (map.isCoastal(map.nodeAt(b.lat, b.lon))) return b;
  const cells = map.nodesOf(iso3 as never).filter((n) => map.isCoastal(n)).sort((a, b) => map.popShare[b] - map.popShare[a] || a - b);
  return cells.length ? { name: `${iso3} naval base`, lat: +map.lat[cells[0]].toFixed(2), lon: +map.lon[cells[0]].toFixed(2) } : undefined;
}

const add = (kit: Kit, id: KitId, n: number) => {
  if (n > 0) kit[id] = (kit[id] ?? 0) + n;
};

/** One nation's generated order of battle. Pure and deterministic. */
export function generateOrbat(iso3: string, stats: NationStats, map: GameMap): OrbatEntry[] {
  const bases = landBases(map, iso3);
  if (!bases.length) return [];
  const supplier: Supplier = SUPPLIER[iso3] ?? 'light';
  const personnel = stats.armedForces && stats.armedForces > 0 ? stats.armedForces : Math.max(100, Math.round((stats.population ?? 0) * 0.001));
  const milexB = (stats.milexUsd ?? 0) / 1e9;
  const perSoldier = (stats.milexUsd ?? 0) / personnel;
  const tier: Tier = perSoldier >= 40_000 && milexB >= 3 ? 'high' : 'low';
  const wealth = clamp(perSoldier / 25_000, 0.25, 1.5);
  const kit = supplier === 'light' ? undefined : KITS[supplier][tier];
  const port = coastalBase(map, iso3, bases);
  const readiness = tier === 'high' ? 0.7 : 0.5;
  const experience = EXPERIENCE[iso3] ?? 0.3;
  const entry = (kind: OrbatEntry['kind'], echelon: Echelon, name: string, at: Base, equipment: Kit, men: number): OrbatEntry => ({
    nation: iso3, name, kind, echelon, base: at, equipment: equipment as Record<string, number>, personnel: men, readiness, experience, source: SOURCE,
  });

  const combatAircraft = milexB >= 0.15 && kit ? Math.round(14 * milexB ** 0.7) : 0;
  const hasAirWing = milexB >= 0.05;
  const hasAirDefense = milexB >= 0.5 && !!kit;
  const airMen = hasAirWing ? Math.round(personnel * 0.12) : 0;
  const navyMen = port ? Math.round(personnel * 0.08) : 0;
  const adMen = hasAirDefense ? Math.round(personnel * 0.05) : 0;
  const groundMen = personnel - airMen - navyMen - adMen;
  const out: OrbatEntry[] = [];

  // Ground: brigades of ~3,500, divisions of ~12,000 for large armies, at most 24 formations.
  const big = groundMen >= 60_000;
  const echelon: Echelon = big ? 'division' : groundMen < 2_000 ? 'battalion' : 'brigade';
  const units = clamp(Math.round(groundMen / (big ? 12_000 : 3_500)), 1, 24);
  const tanks = Math.round((groundMen / 1000) * TANKS_PER_K[supplier] * wealth);
  const armoured = Math.round((groundMen / 1000) * 3 * wealth);
  for (let i = 0; i < units; i++) {
    const men = Math.floor(groundMen / units) + (i < groundMen % units ? 1 : 0);
    const share = (total: number) => Math.floor(total / units) + (i < total % units ? 1 : 0);
    const equipment: Kit = { infantry_squad: Math.max(1, Math.round(men * 0.03)), truck: Math.max(1, Math.round(men / 25)) };
    if (kit) {
      add(equipment, kit.mbt, share(tanks));
      add(equipment, kit.ifv, share(Math.round(armoured * (tier === 'high' ? 0.4 : 0.15))));
      add(equipment, kit.apc, share(Math.round(armoured * (tier === 'high' ? 0.6 : 0.85))));
      add(equipment, kit.gun, Math.round((men / 1000) * 1.5));
      add(equipment, kit.mlrs, Math.round((men / 1000) * 0.3));
    } else {
      add(equipment, 'technical', Math.round(men / 200));
    }
    const label = echelon === 'battalion' ? 'Security Battalion' : `${share(tanks) >= 30 ? 'Mechanised' : 'Infantry'} ${big ? 'Division' : 'Brigade'}`;
    out.push(entry('maneuver', echelon, `${ORDINAL(i + 1)} ${label}`, bases[i % bases.length], equipment, men));
  }

  if (hasAirWing) {
    const air: Kit = {};
    if (kit) {
      const fighters = Math.round(combatAircraft * (tier === 'high' ? 0.75 : 0.5));
      add(air, kit.fighter, fighters);
      add(air, kit.attack, combatAircraft - fighters);
      add(air, kit.helo, Math.round(combatAircraft * 0.6) + 2);
    } else {
      add(air, 'uh1h', 2);
    }
    add(air, kit?.transport ?? 'c130h', clamp(Math.round(2 * milexB ** 0.5), 1, 20));
    out.push(entry('air_wing', 'wing', 'Air Force', bases[0], air, airMen));
  }

  if (hasAirDefense && kit) {
    out.push(entry('air_defense', 'brigade', 'Air Defence Command', bases[0], { [kit.sam]: Math.round(4 * milexB ** 0.6), [kit.shorad]: Math.round(8 * milexB ** 0.6) }, adMen));
  }

  if (port) {
    const naval: Kit = { patrol_craft: clamp(Math.round(2 + 6 * milexB ** 0.5), 2, 40) };
    if (kit && milexB >= 2) add(naval, kit.frigate, Math.min(8, Math.round(1.2 * milexB ** 0.6)));
    out.push(entry('surface_group', 'flotilla', milexB >= 2 ? 'Navy' : 'Coast Guard', port, naval, navyMen));
  }
  return placeOnOwnLand(map, out);
}

/**
 * Generated forces for every nation in the map that is not hand-modelled, in map order.
 * `handModelled` defaults to this folder's nations plus the ones other ORBAT workers own.
 */
export function generatedOrbat(map: GameMap, handModelled: ReadonlySet<string> = new Set([...REST_NATIONS, ...HAND_MODELLED_ELSEWHERE])): OrbatEntry[] {
  return map.data.nations.flatMap((n) => (handModelled.has(n.iso3) ? [] : generateOrbat(n.iso3, n.stats as NationStats, map)));
}
