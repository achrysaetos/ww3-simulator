// Sources: IISS Military Balance 2025 (Israel); SIPRI Yearbook 2025 and Kristensen & Korda,
// "Israeli nuclear weapons, 2021" (Bulletin of the Atomic Scientists): ~90 warheads, of which
// ~50 for Jericho II/III, ~30 gravity bombs for F-15I/F-16I, and possibly ~10 for
// submarine-launched cruise missiles. Missile-defence battery counts from IDF/MoD statements
// (Iron Dome 10+ batteries, David's Sling 2, Arrow 2/3 several). Patriot retired April 2024.
// Active tank fleet only; Merkava III/IV in store for reserve brigades are excluded, as in IISS.
import { base, nation } from './build';

const u = nation('ISR', 'IISS Military Balance 2025', { readiness: 0.85, experience: 0.8 });
const NUKE = 'SIPRI Yearbook 2025; Kristensen & Korda 2021 (estimates; Israel does not confirm)';
const AMD = 'IISS Military Balance 2025; IDF and MoD statements on battery counts (launchers per battery estimated)';

export const israel = [
  // ---- Ground forces.
  u('maneuver', 'division', '36th Division (Ga\'ash)', base('Golan Heights (Nafah)', 33.05, 35.75), { merkava4: 200, namer: 120, m113: 120, m109: 36, infantry_squad: 150, truck: 600 }, { personnel: 15000 }),
  u('maneuver', 'division', '162nd Division (Steel)', base('Negev (Tze\'elim)', 31.2, 34.53), { merkava4: 100, namer: 120, eitan: 50, m113: 100, m109: 36, infantry_squad: 150, truck: 600 }, { personnel: 15000 }),
  u('maneuver', 'division', '98th Paratroopers Division', base('Central Israel', 31.9, 34.85), { infantry_squad: 250, truck: 400, m113: 60 }, { personnel: 12000 }),
  u('maneuver', 'division', '91st Galilee Division', base('Biranit', 33.07, 35.3), { infantry_squad: 180, truck: 300, m113: 50 }, { personnel: 9000 }),
  u('maneuver', 'division', '143rd Gaza Division', base('Re\'im', 31.39, 34.46), { infantry_squad: 180, truck: 300, m113: 60 }, { personnel: 9000 }),
  u('maneuver', 'division', '877th Judea and Samaria Division', base('Beit El', 31.94, 35.22), { infantry_squad: 200, truck: 300 }, { personnel: 9000 }),
  u('maneuver', 'brigade', '460th Armored Brigade (training)', base('Shizafon', 30.04, 35.03), { merkava4: 100, namer: 20, infantry_squad: 10, truck: 150 }, { personnel: 3000, readiness: 0.7 }),
  u('maneuver', 'division', 'Reserve Divisions (146th, 252nd, 99th, 210th)', base('Northern Israel', 32.7, 35.3), { m113: 300, infantry_squad: 600, truck: 1200 }, { personnel: 40000, readiness: 0.6 }),
  u('artillery', 'brigade', '215th and 282nd Artillery Brigades', base('Shivta', 30.88, 34.64), { m109: 140, pulse_mlrs: 30, truck: 300 }),
  u('missile', 'battalion', 'Precision Strike (LORA, Predator Hawk)', base('Central Israel', 31.85, 34.9), { lora_launcher: 8 }),

  // ---- Air Force: F-35I 39, F-15I 25, F-15A-D ~58, F-16I 98, F-16C/D ~80.
  u('air_wing', 'wing', 'Nevatim AB (140, 116, 117 Sqn)', base('Nevatim', 31.21, 35.01), { f35i: 39, kc707: 7 }),
  u('air_wing', 'wing', 'Hatzerim AB (69, 107 Sqn)', base('Hatzerim', 31.23, 34.66), { f15i: 25, f16i: 25 }, { extraMagazine: { nuclear_gravity_bomb: 30 }, source: NUKE }),
  u('air_wing', 'wing', 'Tel Nof AB (106, 133 Sqn)', base('Tel Nof', 31.84, 34.82), { f15c: 58, ch53d: 20 }),
  u('air_wing', 'wing', 'Ramon AB (119, 201, 253 Sqn)', base('Ramon', 30.78, 34.67), { f16i: 73, ah64d: 30 }),
  u('air_wing', 'wing', 'Ramat David AB (101, 105, 109 Sqn)', base('Ramat David', 32.67, 35.18), { f16c: 80 }),
  u('air_wing', 'wing', 'Palmachim AB (UAV and helicopters)', base('Palmachim', 31.9, 34.69), { hermes900: 20, heron_tp: 15, uh60: 40 }),

  // ---- Missile defence (Air Defense Array).
  u('air_defense', 'brigade', 'Iron Dome North (Haifa, Kiryat Shmona)', base('Haifa', 32.79, 35.0), { iron_dome_launcher: 12 }, { source: AMD, extraMagazine: { tamir: 240 } }),
  u('air_defense', 'brigade', 'Iron Dome Center (Tel Aviv, Gush Dan)', base('Tel Aviv', 32.08, 34.8), { iron_dome_launcher: 12 }, { source: AMD, extraMagazine: { tamir: 240 } }),
  u('air_defense', 'brigade', 'Iron Dome South (Ashkelon, Be\'er Sheva, Sderot)', base('Be\'er Sheva', 31.25, 34.79), { iron_dome_launcher: 12 }, { source: AMD, extraMagazine: { tamir: 240 } }),
  u('air_defense', 'battalion', 'Iron Dome Eilat', base('Eilat', 29.56, 34.95), { iron_dome_launcher: 4 }, { source: AMD, extraMagazine: { tamir: 80 } }),
  u('air_defense', 'battalion', 'Iron Beam (laser) Battery', base('Southern Israel', 31.4, 34.6), { iron_beam: 2 }, { source: 'Israel MoD, Iron Beam delivered to the IDF in late 2025 (estimate: first battery)' }),
  u('air_defense', 'brigade', 'David\'s Sling Batteries', base('Hatzor', 31.76, 34.73), { davids_sling_launcher: 8 }, { source: AMD, extraMagazine: { stunner: 48 } }),
  u('air_defense', 'brigade', 'Arrow Battery Palmachim', base('Palmachim', 31.9, 34.69), { arrow2_launcher: 4, arrow3_launcher: 4, green_pine_radar: 1 }, { source: AMD, extraMagazine: { arrow3: 24, arrow2: 24 } }),
  u('air_defense', 'brigade', 'Arrow Battery Ein Shemer', base('Ein Shemer', 32.45, 35.0), { arrow2_launcher: 4, arrow3_launcher: 4, green_pine_radar: 1 }, { source: AMD, extraMagazine: { arrow3: 24, arrow2: 24 } }),

  // ---- Strategic forces.
  u('strategic', 'wing', 'Wing 2 (Jericho II/III)', base('Sdot Micha (Zekharia)', 31.71, 34.92), { jericho3_silo: 25, jericho2_tel: 25 }, { source: NUKE, readiness: 0.95 }),

  // ---- Navy.
  u('surface_group', 'flotilla', '3rd Flotilla (Sa\'ar 5/6)', base('Haifa', 32.82, 35.0), { saar6: 4, saar5: 3, saar45: 8 }),
  u('surface_group', 'flotilla', 'Red Sea Flotilla', base('Eilat', 29.55, 34.95), { saar45: 2, patrol_craft: 10 }),
  u('submarine', 'flotilla', '7th Flotilla (Dolphin)', base('Haifa', 32.82, 35.0), { dolphin1: 2, dolphin2: 3 }, { source: NUKE, extraMagazine: { popeye_turbo_slcm: 10 } }),
];
