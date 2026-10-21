/**
 * Torpedoes, ASW weapons and naval mines. Heavyweight torpedo pk against
 * surface ships is high because a keel-break detonation sinks or disables
 * nearly any warship (Belgrano 1982, Dong Hae 2010 Cheonan, SINKEX results);
 * pk against submarines is lower to reflect counter-measures and target motion.
 * Mine pk is per mine encountered by a ship transiting the field.
 */
import { defineMunitions } from '../build';

export const navalMunitions = defineMunitions([
  // Mk 48 Mod 7 ADCAP FY2024 ~$4.2M (Navy WPN P-1).
  { id: 'mk48', name: 'Mk 48 Mod 7 ADCAP', kind: 'torpedo', producers: ['USA'], rangeKm: 50, speedMach: 0.08, warheadKg: 295, cepM: 5, pk: { ship: 0.8, submarine: 0.6 }, interceptDifficulty: 0.9, unitCostUsdM: 4.2, weightKg: 1676 },
  { id: 'mk54', name: 'Mk 54 Mod 0/1 lightweight', kind: 'torpedo', producers: ['USA'], rangeKm: 9, speedMach: 0.06, warheadKg: 44, cepM: 5, pk: { submarine: 0.45, ship: 0.25 }, interceptDifficulty: 0.9, unitCostUsdM: 1.4, weightKg: 276 },
  { id: 'spearfish', name: 'Spearfish Mod 1', kind: 'torpedo', producers: ['GBR'], rangeKm: 54, speedMach: 0.09, warheadKg: 300, cepM: 5, pk: { ship: 0.8, submarine: 0.6 }, interceptDifficulty: 0.9, unitCostUsdM: 4, weightKg: 1850 },
  { id: 'sting_ray', name: 'Sting Ray Mod 1', kind: 'torpedo', producers: ['GBR'], rangeKm: 11, speedMach: 0.06, warheadKg: 45, cepM: 5, pk: { submarine: 0.45, ship: 0.25 }, interceptDifficulty: 0.9, unitCostUsdM: 1.5, weightKg: 267 },
  { id: 'f21', name: 'F21 Artemis', kind: 'torpedo', producers: ['FRA'], rangeKm: 50, speedMach: 0.07, warheadKg: 300, cepM: 5, pk: { ship: 0.8, submarine: 0.6 }, interceptDifficulty: 0.9, unitCostUsdM: 3.5, weightKg: 1550 },
  { id: 'mu90', name: 'MU90 Impact', kind: 'torpedo', producers: ['FRA', 'ITA'], rangeKm: 12, speedMach: 0.05, warheadKg: 32, cepM: 5, pk: { submarine: 0.45, ship: 0.2 }, interceptDifficulty: 0.9, unitCostUsdM: 1.5, weightKg: 304 },
  { id: 'dm2a4', name: 'DM2A4 SeaHake', kind: 'torpedo', producers: ['DEU'], rangeKm: 50, speedMach: 0.08, warheadKg: 260, cepM: 5, pk: { ship: 0.8, submarine: 0.55 }, interceptDifficulty: 0.9, unitCostUsdM: 3, weightKg: 1370 },
  { id: 'black_shark', name: 'Black Shark Advanced', kind: 'torpedo', producers: ['ITA'], rangeKm: 50, speedMach: 0.08, warheadKg: 250, cepM: 5, pk: { ship: 0.8, submarine: 0.55 }, interceptDifficulty: 0.9, unitCostUsdM: 3, weightKg: 1500 },
  { id: 'type89', name: 'Type 89 / Type 18 heavyweight', kind: 'torpedo', producers: ['JPN'], rangeKm: 50, speedMach: 0.09, warheadKg: 267, cepM: 5, pk: { ship: 0.8, submarine: 0.55 }, interceptDifficulty: 0.9, unitCostUsdM: 3.5, weightKg: 1760 },
  { id: 'type12_lwt', name: 'Type 12 lightweight', kind: 'torpedo', producers: ['JPN'], rangeKm: 10, speedMach: 0.06, warheadKg: 45, cepM: 5, pk: { submarine: 0.45, ship: 0.2 }, interceptDifficulty: 0.9, unitCostUsdM: 1.5, weightKg: 300 },
  { id: 'baekeo', name: 'Tiger Shark (K731 Baekeo)', kind: 'torpedo', producers: ['KOR'], rangeKm: 45, speedMach: 0.07, warheadKg: 300, cepM: 5, pk: { ship: 0.75, submarine: 0.5 }, interceptDifficulty: 0.9, unitCostUsdM: 2.5, weightKg: 1700 },
  { id: 'k745', name: 'K745 Blue Shark lightweight', kind: 'torpedo', producers: ['KOR'], rangeKm: 19, speedMach: 0.07, warheadKg: 45, cepM: 5, pk: { submarine: 0.45, ship: 0.2 }, interceptDifficulty: 0.9, unitCostUsdM: 1, weightKg: 280 },
  { id: 'type53', name: 'Type 53 heavyweight (UGST Fizik-1 / 53-65K)', kind: 'torpedo', producers: ['RUS'], rangeKm: 50, speedMach: 0.07, warheadKg: 300, cepM: 5, pk: { ship: 0.75, submarine: 0.5 }, interceptDifficulty: 0.9, unitCostUsdM: 2, weightKg: 2200 },
  { id: 'futlyar', name: 'UGST-M Futlyar', kind: 'torpedo', producers: ['RUS'], rangeKm: 50, speedMach: 0.08, warheadKg: 300, cepM: 5, pk: { ship: 0.8, submarine: 0.55 }, interceptDifficulty: 0.9, unitCostUsdM: 3, weightKg: 2200 },
  { id: 'type65_76', name: '65-76A heavy wake-homing (650 mm)', kind: 'torpedo', producers: [], rangeKm: 50, speedMach: 0.06, warheadKg: 450, cepM: 10, pk: { ship: 0.8 }, interceptDifficulty: 0.85, unitCostUsdM: 2, weightKg: 4450 },
  { id: 'apr3', name: 'APR-3E / Paket-NK anti-torpedo', kind: 'torpedo', producers: ['RUS'], rangeKm: 5, speedMach: 0.05, warheadKg: 74, cepM: 5, pk: { submarine: 0.4, ship: 0.15 }, interceptDifficulty: 0.9, unitCostUsdM: 0.8, weightKg: 525 },
  { id: 'shkval', name: 'VA-111 Shkval', kind: 'torpedo', producers: ['RUS'], rangeKm: 11, speedMach: 0.3, warheadKg: 210, cepM: 30, pk: { ship: 0.5, submarine: 0.3 }, interceptDifficulty: 0.95, unitCostUsdM: 1, weightKg: 2700 },
  { id: 'yu6', name: 'Yu-6', kind: 'torpedo', producers: ['CHN'], rangeKm: 45, speedMach: 0.07, warheadKg: 300, cepM: 5, pk: { ship: 0.75, submarine: 0.5 }, interceptDifficulty: 0.9, unitCostUsdM: 2, weightKg: 1700 },
  { id: 'yu7', name: 'Yu-7 lightweight', kind: 'torpedo', producers: ['CHN'], rangeKm: 14, speedMach: 0.06, warheadKg: 45, cepM: 5, pk: { submarine: 0.4, ship: 0.2 }, interceptDifficulty: 0.9, unitCostUsdM: 1, weightKg: 235 },
  { id: 'varunastra', name: 'Varunastra', kind: 'torpedo', producers: ['IND'], rangeKm: 40, speedMach: 0.07, warheadKg: 250, cepM: 5, pk: { ship: 0.7, submarine: 0.45 }, interceptDifficulty: 0.9, unitCostUsdM: 2, weightKg: 1500 },
  { id: 'valfajr', name: 'Valfajr / Hoot', kind: 'torpedo', producers: ['IRN'], rangeKm: 20, speedMach: 0.06, warheadKg: 200, cepM: 10, pk: { ship: 0.55, submarine: 0.2 }, interceptDifficulty: 0.85, unitCostUsdM: 0.5, weightKg: 1200 },
  { id: 'asroc', name: 'RUM-139 VL-ASROC (Mk 54)', kind: 'torpedo', producers: ['USA'], rangeKm: 22, speedMach: 0.9, warheadKg: 44, cepM: 5, pk: { submarine: 0.45 }, interceptDifficulty: 0.9, unitCostUsdM: 2.5, weightKg: 750 },
  { id: 'otvet', name: '91R Otvet (Kalibr ASW)', kind: 'torpedo', producers: ['RUS'], rangeKm: 40, speedMach: 2, warheadKg: 76, cepM: 5, pk: { submarine: 0.45 }, interceptDifficulty: 0.9, unitCostUsdM: 3, weightKg: 1300 },
  { id: 'yu8', name: 'Yu-8 rocket-assisted ASW', kind: 'torpedo', producers: ['CHN'], rangeKm: 30, speedMach: 1, warheadKg: 45, cepM: 5, pk: { submarine: 0.4 }, interceptDifficulty: 0.9, unitCostUsdM: 2, weightKg: 700 },
  // ---- mines
  { id: 'quickstrike', name: 'Mk 65 Quickstrike / QS-ER', kind: 'mine', producers: ['USA'], rangeKm: 70, speedMach: 0.8, warheadKg: 900, cepM: 50, pk: { ship: 0.4, submarine: 0.2 }, interceptDifficulty: 0.7, unitCostUsdM: 0.1, weightKg: 1000 },
  { id: 'mk67_slmm', name: 'Mk 67 submarine-launched mobile mine', kind: 'mine', producers: ['USA'], rangeKm: 16, speedMach: 0.05, warheadKg: 230, cepM: 50, pk: { ship: 0.35, submarine: 0.15 }, interceptDifficulty: 0.8, unitCostUsdM: 0.5, weightKg: 754 },
  { id: 'em52', name: 'EM-52 rocket-rising mine', kind: 'mine', producers: ['CHN'], rangeKm: 0.2, speedMach: 0.2, warheadKg: 140, cepM: 30, pk: { ship: 0.45, submarine: 0.25 }, interceptDifficulty: 0.8, unitCostUsdM: 0.05, weightKg: 620 },
  { id: 'pmk2', name: 'PMK-2 encapsulated torpedo mine', kind: 'mine', producers: ['RUS'], rangeKm: 1, speedMach: 0.06, warheadKg: 110, cepM: 30, pk: { submarine: 0.35, ship: 0.3 }, interceptDifficulty: 0.8, unitCostUsdM: 0.2, weightKg: 1800 },
  // Contact and influence mines held in large numbers by Iran (~5,000) and North Korea (DIA estimates).
  { id: 'sea_mine', name: 'Moored/bottom influence mine (generic)', kind: 'mine', producers: ['RUS', 'CHN', 'IRN', 'PRK', 'USA', 'GBR', 'FRA', 'ITA', 'SWE', 'FIN', 'KOR', 'TUR', 'UKR', 'POL', 'IND', 'PAK', 'JPN'], rangeKm: 0.1, speedMach: 0, warheadKg: 200, cepM: 20, pk: { ship: 0.35, submarine: 0.1 }, interceptDifficulty: 0.7, unitCostUsdM: 0.015, weightKg: 1000 },
]);
