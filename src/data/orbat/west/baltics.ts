/*
 * Estonia, Latvia and Lithuania, 2025-26. No tanks, combat aircraft or major warships.
 * Sources: IISS Military Balance 2025 (Estonia: CV9035EE, K9EE, HIMARS on order; Latvia:
 * CVR(T), M109A5Ö, Patria 6x6, HIMARS on order; Lithuania: Boxer Vilkas, PzH 2000, CAESAR,
 * NASAMS, HIMARS on order); mil.ee, mod.gov.lv, kariuomene.lt. HIMARS and IRIS-T deliveries
 * by late 2026 are estimates from the published contracts. Volunteer forces are aggregated.
 */
import { base, forNation } from './build';

const ee = forNation('EST', 'IISS Military Balance 2025; mil.ee');
const lv = forNation('LVA', 'IISS Military Balance 2025; mod.gov.lv');
const lt = forNation('LTU', 'IISS Military Balance 2025; kariuomene.lt');

const ACTIVE = { readiness: 0.75 };

export const baltics = [
  ee('1st Infantry Brigade', 'maneuver', 'brigade', base('Tapa Army Base', 59.26, 25.96), { cv90: 44, k9_thunder: 24, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  ee('2nd Infantry Brigade', 'maneuver', 'brigade', base('Võru', 57.83, 27.02), { patria_amv: 40, k9_thunder: 12, infantry_squad: 54, truck: 150 }, { readiness: 0.6, personnel: 3500 }),
  ee('Estonian Division Artillery (HIMARS)', 'artillery', 'battalion', base('Tapa Army Base', 59.26, 25.96), { m142_himars: 6 }, { ...ACTIVE, personnel: 200, extraMagazine: { gmlrs: 72, atacms: 6 } }),
  ee('Air Defence Battalion (IRIS-T SLM)', 'air_defense', 'battalion', base('Rakvere', 59.35, 26.36), { iris_t_slm: 3, rbs70: 12 }, { ...ACTIVE, personnel: 300 }),
  ee('Estonian Defence League (aggregate)', 'maneuver', 'division', base('Tallinn', 59.44, 24.75), { infantry_squad: 300, truck: 200 }, { readiness: 0.4, personnel: 17000 }),

  lv('Mechanized Infantry Brigade', 'maneuver', 'brigade', base('Ādaži, Latvia', 57.08, 24.32), { cvrt: 60, patria_6x6: 80, m109a5: 30, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3000 }),
  lv('2nd Infantry Brigade (Latgale)', 'maneuver', 'brigade', base('Daugavpils', 55.87, 26.52), { patria_6x6: 30, infantry_squad: 40, truck: 100 }, { readiness: 0.5, personnel: 2000 }),
  lv('Latvian artillery (HIMARS)', 'artillery', 'battalion', base('Ādaži, Latvia', 57.08, 24.32), { m142_himars: 6 }, { ...ACTIVE, personnel: 200, extraMagazine: { gmlrs: 72 } }),
  lv('Air Defence Battalion (IRIS-T SLM)', 'air_defense', 'battalion', base('Lielvārde Air Base', 56.78, 24.85), { iris_t_slm: 4, rbs70: 12 }, { ...ACTIVE, personnel: 300 }),
  lv('Latvian National Guard (Zemessardze, aggregate)', 'maneuver', 'division', base('Riga', 56.95, 24.1), { infantry_squad: 200, truck: 150 }, { readiness: 0.4, personnel: 10000 }),

  lt('Mechanized Infantry Brigade "Iron Wolf"', 'maneuver', 'brigade', base('Rukla', 55.06, 24.38), { vilkas: 91, m113: 100, pzh2000: 21, infantry_squad: 54, truck: 250 }, { readiness: 0.8, personnel: 4000 }),
  lt('Motorized Infantry Brigade "Žemaitija"', 'maneuver', 'brigade', base('Klaipėda', 55.71, 21.13), { jltv: 100, m113: 60, infantry_squad: 54, truck: 200 }, { ...ACTIVE, personnel: 3500 }),
  lt('Infantry Brigade "Aukštaitija"', 'maneuver', 'brigade', base('Ukmergė', 55.25, 24.76), { infantry_squad: 40, truck: 100 }, { readiness: 0.5, personnel: 2000 }),
  lt('General Romualdas Giedraitis Artillery Battalion', 'artillery', 'battalion', base('Rukla', 55.06, 24.38), { caesar: 18, m142_himars: 8 }, { ...ACTIVE, personnel: 600, extraMagazine: { gmlrs: 96, atacms: 8 } }),
  lt('Air Defence Battalion (NASAMS)', 'air_defense', 'battalion', base('Vilnius', 54.69, 25.28), { nasams: 8 }, { ...ACTIVE, personnel: 400 }),
  lt('National Defence Volunteer Forces (aggregate)', 'maneuver', 'division', base('Kaunas', 54.9, 23.9), { infantry_squad: 300, truck: 200 }, { readiness: 0.4, personnel: 12000 }),
];
