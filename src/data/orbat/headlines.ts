import type { Catalog } from '../../core/catalog';
import type { NationId, PlatformClass, PlatformId, World } from '../../core/types';

export const HEADLINE_FIELDS = ['tanks', 'combatAircraft', 'surfaceCombatants', 'submarines', 'personnel'] as const;
export type HeadlineField = (typeof HEADLINE_FIELDS)[number];
export type Headline = Record<HeadlineField, number>;

/**
 * IISS categories by catalog class. Combat aircraft are combat-capable fixed-wing types without
 * EW aircraft or unarmed trainers; principal surface combatants are carriers, cruisers,
 * destroyers and frigates (corvettes and amphibious ships excluded); submarines include SSBNs.
 */
const CLASSES: Record<Exclude<HeadlineField, 'personnel'>, readonly PlatformClass[]> = {
  tanks: ['mbt'],
  combatAircraft: ['fighter', 'multirole', 'attack_aircraft', 'bomber', 'stealth_bomber'],
  surfaceCombatants: ['carrier', 'cruiser', 'destroyer', 'frigate'],
  submarines: ['ssk', 'ssn', 'ssgn', 'ssbn'],
};
const FIELD_OF: Partial<Record<PlatformClass, HeadlineField>> = Object.fromEntries(
  Object.entries(CLASSES).flatMap(([field, classes]) => classes.map((c) => [c, field])),
);
/** Ships the catalog classes as corvettes that IISS lists as frigates (FFGHM/FFG): Steregushchiy, Moudge/Jamaran. */
const IISS_FRIGATES: ReadonlySet<string> = new Set(['steregushchiy', 'jamaran']);

const h = (tanks: number, combatAircraft: number, surfaceCombatants: number, submarines: number, personnel: number): Headline => ({ tanks, combatAircraft, surfaceCombatants, submarines, personnel });

/**
 * Personnel outside the active force that an ORBAT module fields as formations: IISS
 * "paramilitary" or "reserve" headlines for militias, home guards and wartime reserve brigades.
 */
export const AUXILIARIES: Record<string, { personnel: number; what: string }> = {
  IRQ: { personnel: 330_000, what: 'Popular Mobilisation Forces and Kurdistan Peshmerga (est.)' },
  MEX: { personnel: 130_000, what: 'Guardia Nacional (IISS paramilitary)' },
  BRA: { personnel: 395_000, what: 'state military police (IISS paramilitary, public security forces)' },
  NOR: { personnel: 40_000, what: 'Home Guard (Heimevernet)' },
  EST: { personnel: 17_000, what: 'Defence League (Kaitseliit)' },
  LVA: { personnel: 10_000, what: 'National Guard (Zemessardze)' },
  FIN: { personnel: 238_000, what: 'reservists filling the wartime brigades (IISS reserve)' },
  SWE: { personnel: 10_000, what: 'conscript reservists filling the wartime brigades (IISS reserve)' },
  AZE: { personnel: 15_000, what: 'State Border Service and internal troops (IISS paramilitary)' },
  VEN: { personnel: 100_000, what: 'Bolivarian Militia, the part fielded as a formation (IISS lists about 220,000)' },
  LBN: { personnel: 34_500, what: 'Hezbollah fighters and reservists (IISS, CSIS est.)' },
};

/**
 * Headline inventories and active personnel, IISS Military Balance 2025 (data as of late
 * 2024), adjusted where noted for deliveries, retirements and war losses through 2025.
 * Equipment figures are the ones each ORBAT module was built against; active personnel are
 * rounded. Estimates: POL and UKR equipment (fast-changing), Syria (IISS 2025 predates the
 * Assad regime's fall; the row describes the new army), Ethiopia personnel.
 */
export const IISS_HEADLINES: Record<string, Headline> = {
  // United States, Canada, European NATO, Ukraine
  USA: h(2640, 2900, 99, 68, 1_315_600), // MBT: Army holdings incl. ARNG and APS; aircraft all services
  CAN: h(74, 76, 12, 4, 63_300),
  GBR: h(213, 160, 16, 10, 141_100),
  FRA: h(200, 230, 22, 9, 202_200),
  DEU: h(310, 220, 11, 6, 179_850),
  ITA: h(200, 195, 18, 8, 161_850),
  ESP: h(327, 155, 9, 3, 122_200),
  PRT: h(34, 28, 4, 2, 24_850),
  NLD: h(18, 45, 6, 3, 33_600),
  BEL: h(0, 44, 2, 0, 23_200),
  LUX: h(0, 0, 0, 0, 410),
  DNK: h(44, 38, 5, 0, 15_400),
  NOR: h(36, 40, 4, 6, 25_400),
  SWE: h(110, 90, 0, 4, 14_850),
  FIN: h(200, 60, 0, 0, 24_000),
  POL: h(850, 90, 2, 1, 216_100), // equipment est.: K2 and M1A2 SEPv3 deliveries through 2026
  CZE: h(44, 30, 0, 0, 27_350),
  SVK: h(45, 12, 0, 0, 17_850),
  HUN: h(56, 14, 0, 0, 32_150),
  ROU: h(370, 40, 3, 0, 69_900),
  BGR: h(90, 25, 3, 0, 36_950),
  GRC: h(1240, 210, 13, 11, 132_000),
  TUR: h(2240, 290, 16, 12, 355_200),
  ALB: h(0, 0, 0, 0, 6_600),
  MKD: h(0, 0, 0, 0, 8_000),
  MNE: h(0, 0, 0, 0, 2_350),
  HRV: h(30, 12, 0, 0, 15_200),
  SVN: h(0, 0, 0, 0, 6_350),
  EST: h(0, 0, 0, 0, 7_700),
  LVA: h(0, 0, 0, 0, 6_600),
  LTU: h(0, 0, 0, 0, 23_000),
  UKR: h(1100, 90, 0, 0, 730_000), // equipment est.: wartime, incl. donated Western types
  // Russia, China, North Korea, Iran, Belarus, CSTO
  RUS: h(2700, 1150, 31, 50, 1_134_000), // MBT in active units after 2022-25 losses
  CHN: h(4800, 2400, 98, 60, 2_035_000), // combat aircraft per DoD CMPR 2024 (PLAAF + PLAN)
  PRK: h(3500, 545, 4, 71, 1_280_000),
  IRN: h(1513, 265, 7, 19, 610_000), // aircraft less June 2025 losses
  BLR: h(500, 58, 0, 0, 48_600),
  KAZ: h(350, 100, 0, 0, 39_000), // aircraft est.
  KGZ: h(150, 0, 0, 0, 10_900),
  TJK: h(37, 0, 0, 0, 8_800),
  ARM: h(100, 17, 0, 0, 42_900),
  // Asia-Pacific
  JPN: h(365, 320, 54, 24, 247_150),
  KOR: h(2150, 410, 29, 19, 500_000),
  TWN: h(1010, 420, 22, 4, 169_000),
  AUS: h(59, 96, 9, 6, 58_600),
  IND: h(3740, 620, 31, 19, 1_475_750), // aircraft without the MiG-21s retired in 2025
  PAK: h(2540, 450, 10, 5, 660_000),
  PHL: h(0, 20, 2, 0, 146_250),
  VNM: h(1334, 74, 4, 6, 482_000),
  IDN: h(103, 100, 6, 4, 404_500),
  SGP: h(96, 100, 6, 4, 51_000),
  THA: h(370, 110, 7, 0, 360_850),
  // Middle East and North Africa
  ISR: h(400, 310, 0, 5, 169_500),
  SAU: h(910, 300, 7, 0, 257_000),
  ARE: h(340, 137, 0, 0, 63_000),
  EGY: h(2500, 550, 11, 8, 438_500),
  SYR: h(150, 0, 0, 0, 169_000), // equipment est. for the post-Assad army; personnel is the IISS 2025 headline
  IRQ: h(390, 85, 0, 0, 193_000),
  JOR: h(180, 45, 0, 0, 100_500),
  LBN: h(334, 6, 0, 0, 60_000),
  QAT: h(62, 96, 0, 0, 16_500),
  DZA: h(1500, 150, 5, 6, 139_000),
  MAR: h(650, 88, 6, 0, 195_800),
  // Americas, sub-Saharan Africa, Caucasus and Balkans
  BRA: h(290, 150, 5, 6, 366_500),
  ARG: h(230, 30, 4, 2, 72_100),
  MEX: h(0, 35, 1, 0, 216_000),
  VEN: h(173, 44, 0, 0, 123_000), // surface and subs 0: the one frigate and one submarine are not fielded
  NGA: h(150, 45, 0, 0, 143_000),
  ZAF: h(34, 50, 4, 3, 73_650),
  ETH: h(400, 19, 0, 0, 138_000), // personnel est.: the pre-2020 IISS figure; the army grew in the Tigray war
  AZE: h(445, 31, 1, 0, 64_050),
  GEO: h(120, 3, 0, 0, 20_650),
  SRB: h(230, 29, 0, 0, 28_150),
};

/**
 * Whether a merged-world total is consistent with the headline. Each ORBAT module holds its
 * own equipment to 10-15% under its own type list; the catalog files a few types differently
 * (an armed Yak-130 is an attack aircraft here, a trainer to IISS), so the merged gate allows
 * 25%, with two platforms of slack for small forces. Formation personnel leave out
 * headquarters, schools, depots and staff, so they run from under a fifth of active strength
 * (Bulgaria) to all of it (DPRK), plus any militia the module fields; above 1.2 times that the
 * nation is loaded twice or its kits are inflated.
 */
export function withinHeadline(field: HeadlineField, actual: number, nation: string): boolean {
  const ref = IISS_HEADLINES[nation][field];
  if (field === 'personnel') return actual >= 0.15 * ref && actual <= 1.2 * (ref + (AUXILIARIES[nation]?.personnel ?? 0));
  return Math.abs(actual - ref) <= Math.max(2, 0.25 * ref);
}

export type NationTotals = Headline & { formations: number };

/** Headline totals of every nation's formations in a world, with equipment classed by the catalog. */
export function nationTotals(world: World, catalog: Catalog): Map<NationId, NationTotals> {
  const out = new Map<NationId, NationTotals>();
  for (const f of Object.values(world.formations)) {
    let t = out.get(f.nation);
    if (!t) out.set(f.nation, (t = { formations: 0, ...h(0, 0, 0, 0, 0) }));
    t.formations++;
    t.personnel += f.personnel;
    for (const [pid, n] of Object.entries(f.equipment)) {
      const field = IISS_FRIGATES.has(pid) ? 'surfaceCombatants' : FIELD_OF[catalog.platform(pid as PlatformId).class];
      if (field) t[field] += n;
    }
  }
  for (const t of out.values()) t.personnel = Math.round(t.personnel);
  return out;
}
