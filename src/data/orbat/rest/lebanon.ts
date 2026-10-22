// Lebanon: the Lebanese Armed Forces and Hezbollah. The simulation has no non-state actors, so
// Hezbollah fights under Lebanon's flag, as territorial formations that fight only on Lebanese soil:
// a war with Lebanon is a war with Hezbollah, which is what every Israel-Lebanon war since 1982 has been.
// LAF: IISS Military Balance 2025 (some 60,000 active; 334 tanks, many of them old and few serviceable;
// six A-29 Super Tucanos; M113s and towed guns).
// Hezbollah: IISS (2025) and CSIS (2024) put it at 30,000-50,000 fighters with reservists, and its
// arsenal before October 2023 at about 150,000 rockets and missiles, a few hundred of them guided
// (Fateh-110/M-600). The IDF claimed 70-80% of that destroyed by the November 2024 ceasefire, which
// also cost the Radwan Force much of its strength; the 2027 force here is that remnant, rearmed in part.
// Unit names follow the regional commands open sources give (Nasr, Aziz, Badr); sizes are estimates.
import { base, nation } from './build';

const laf = nation('LBN', 'IISS Military Balance 2025 (Lebanon)', { readiness: 0.45, experience: 0.3 });
const hez = nation('LBN', 'IISS Military Balance 2025; CSIS, "Hezbollah\'s Rocket Force" (2024); IDF statements, Nov 2024 (estimates)', { readiness: 0.6, experience: 0.5, territorial: true });

export const lebanon = [
  laf('maneuver', 'division', 'Lebanese Armed Forces (land brigades)', base('Yarze, Beirut', 33.85, 35.55), { m48a5: 92, m60a3: 185, t55: 57, m113: 600, m198: 60, m114: 40, infantry_squad: 1800, truck: 1500 }, { personnel: 55000, territorial: true }),
  laf('air_wing', 'wing', 'Lebanese Air Force', base('Hamat', 34.28, 35.68), { a29: 6 }),

  // Fighters of the regional units, dug into the villages, valleys and tunnels south of the Litani and in the Bekaa.
  hez('maneuver', 'brigade', 'Hezbollah Radwan Force', base('Nabatieh', 33.38, 35.48), { infantry_squad_pro: 150, kornet_team: 30, truck: 40 }, { personnel: 1500 }),
  hez('maneuver', 'division', 'Hezbollah Nasr Unit', base('Bint Jbeil', 33.12, 35.43), { infantry_squad: 400, kornet_team: 40, toophan_team: 30, truck: 80 }, { personnel: 4000 }),
  hez('maneuver', 'division', 'Hezbollah Aziz Unit', base('Tyre', 33.27, 35.2), { infantry_squad: 400, kornet_team: 40, toophan_team: 30, truck: 80 }, { personnel: 4000 }),
  hez('maneuver', 'division', 'Hezbollah Badr Unit', base('Jezzine', 33.54, 35.58), { infantry_squad: 300, kornet_team: 20, toophan_team: 20, truck: 60 }, { personnel: 3000 }),
  hez('maneuver', 'division', 'Hezbollah reservists (Bekaa and Dahiyeh)', base('Baalbek', 34.0, 36.2), { militia_squad: 1200, truck: 150 }, { personnel: 12000, readiness: 0.4 }),

  // The rocket force: Grad-class and heavier rockets on light launchers, and guided Fateh-110 / M-600.
  hez('artillery', 'brigade', 'Hezbollah rocket force (south)', base('Wadi Saluki', 33.2, 35.5), { bm21: 120, fajr5_launcher: 30, truck: 150 }, { extraMagazine: { rocket_122: 30000, fajr5: 2000 } }),
  hez('missile', 'battalion', 'Hezbollah precision missile units', base('Hermel, Bekaa', 34.39, 36.38), { fateh_tel: 20, truck: 40 }, { extraMagazine: { fateh110: 150 } }),
];
