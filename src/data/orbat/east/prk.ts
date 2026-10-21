import type { OrbatEntry } from '../types';
import { at, merge, mix, unit, type Base, type Kit } from './build';

/*
 * Korean People's Army, 2025. Totals per IISS Military Balance 2025 (MBT 3,500+; artillery
 * ~21,600, of which ~8,600 towed and self-propelled guns, ~5,500 MRL and ~7,500 mortars;
 * ~545 combat-capable aircraft; ~71 submarines). Mortars are not modelled, so the corps hold
 * about 14,000 guns and rocket launchers between them; D-30 and Grad stand in for the KPA's
 * 122-152 mm tube and rocket types. Nuclear stockpile
 * ~50 warheads (SIPRI Yearbook 2025); missile TEL counts are estimates from CSIS Missile
 * Threat and 38 North, as no official figures exist. Corps garrisons are approximate.
 * Squad counts stand in for the ~1.1 million-strong infantry-heavy ground force.
 */

const PRK = 'PRK';
const KPA = { readiness: 0.5, experience: 0.2 };

const OLD_TANKS: Kit = { chonma_ho: 0.5, t55: 0.4, t62m: 0.1 };
const NEW_TANKS: Kit = { pokpung_ho: 0.45, chonma_ho: 0.35, chonma_20: 0.1, t55: 0.1 };

const FORWARD_CORPS: Kit = merge(mix(150, OLD_TANKS), { vtt323: 80, koksan: 120, mrl_240mm: 72, bm21_grad: 400, d30: 800, infantry_squad: 3000, truck: 1500 });
const REAR_CORPS: Kit = merge(mix(120, OLD_TANKS), { vtt323: 40, bm21_grad: 220, d30: 500, infantry_squad: 2600, truck: 1000 });
const MECH_CORPS: Kit = merge(mix(400, NEW_TANKS), { vtt323: 300, koksan: 48, bm21_grad: 200, d30: 300, infantry_squad: 900, truck: 1200 });

const corps = (name: string, base: Base, kit: Kit): OrbatEntry => unit(PRK, name, 'maneuver', 'corps', base, kit, KPA);

const ground: OrbatEntry[] = [
  corps('I Corps', at('Hoeyang', 38.7, 127.6), FORWARD_CORPS),
  corps('II Corps', at('Pyongsan', 38.33, 126.4), FORWARD_CORPS),
  corps('IV Corps', at('Haeju', 38.04, 125.7), FORWARD_CORPS),
  corps('V Corps', at('Kumgang', 38.6, 128.0), FORWARD_CORPS),
  corps('III Corps', at('Nampo', 38.75, 125.45), REAR_CORPS),
  corps('VII Corps', at('Hamhung', 39.9, 127.55), REAR_CORPS),
  corps('IX Corps', at('Chongjin', 41.8, 129.78), REAR_CORPS),
  corps('X Corps', at('Hyesan', 41.4, 128.18), REAR_CORPS),
  corps('XII Corps', at('Kanggye', 40.97, 126.6), REAR_CORPS),
  corps('108th Mechanised Corps', at('Pyongyang east', 39.05, 125.95), MECH_CORPS),
  corps('425th Mechanised Corps', at('Kaechon', 39.7, 125.9), MECH_CORPS),
  corps('806th Mechanised Corps', at('Yonsan', 38.87, 126.25), MECH_CORPS),
  corps('815th Mechanised Corps', at('Hwangju', 38.67, 125.75), MECH_CORPS),
  corps('820th Tank Corps', at('Sariwon', 38.5, 125.76), merge(mix(550, NEW_TANKS), { vtt323: 200, koksan: 24, bm21_grad: 36, infantry_squad: 400, truck: 900 })),
  corps('Pyongyang Defence Command', at('Pyongyang', 39.03, 125.75), merge(mix(150, NEW_TANKS), { vtt323: 100, bm21_grad: 150, d30: 300, infantry_squad: 2000, truck: 800 })),
  unit(PRK, '11th Storm Corps', 'maneuver', 'corps', at('Tokchon', 39.75, 126.3), { infantry_squad: 4000, truck: 400 }, { readiness: 0.65, experience: 0.3 }),
  // Deployed to Russia from October 2024; ~4,000 casualties by spring 2025 (South Korean NIS).
  unit(PRK, 'KPA Expeditionary Force (Kursk)', 'maneuver', 'division', at('Kursk oblast (KPA)', 51.45, 35.6), { infantry_squad: 900, koksan: 30, mrl_240mm: 15, truck: 150 }, { readiness: 0.6, experience: 0.6 }),
];

// Long-range artillery able to reach Seoul from hardened sites north of the DMZ.
const artillery: OrbatEntry[] = [
  unit(PRK, '620th Artillery Corps', 'artillery', 'corps', at('Kaesong', 38.1, 126.55), { koksan: 500, mrl_240mm: 400, kn09_tel: 30, infantry_squad: 300, truck: 900 }, KPA),
  unit(PRK, 'Forward Artillery Group East', 'artillery', 'corps', at('Chorwon north', 38.4, 127.2), { koksan: 150, mrl_240mm: 100, kn25_tel: 16, infantry_squad: 150, truck: 400 }, KPA),
  unit(PRK, 'Forward Artillery Group West', 'artillery', 'corps', at('Kaepung', 38.1, 126.4), { koksan: 150, mrl_240mm: 100, kn25_tel: 16, infantry_squad: 150, truck: 400 }, KPA),
];

const SF = { readiness: 0.75, experience: 0.2 };
const missile = (name: string, base: Base, equipment: Kit, strategic = false): OrbatEntry =>
  unit(PRK, name, strategic ? 'strategic' : 'missile', 'brigade', base, { ...equipment, truck: 40 }, SF);
const strategicForce: OrbatEntry[] = [
  missile('Strategic Force Sakkanmol Missile Base', at('Sakkanmol', 38.6, 126.17), { hwasong_5_tel: 18, kn23_tel: 10 }),
  missile('Strategic Force Kalgol-dong Missile Base', at('Kalgol-dong', 38.84, 125.6), { hwasong_5_tel: 18, kn24_tel: 12 }),
  missile('Strategic Force Kumchon-ri Missile Base', at('Kumchon-ri', 38.75, 126.5), { hwasong_5_tel: 18, kn23_tel: 20 }),
  missile('Strategic Force Sino-ri Missile Base', at('Sino-ri', 39.53, 125.43), { nodong_tel: 12 }),
  missile('Strategic Force Yongjo-ri Missile Base', at('Yongjo-ri', 40.95, 127.9), { hwasong_12_tel: 8 }, true),
  missile('Strategic Force Hoejung-ri Missile Base', at('Hoejung-ri', 40.9, 126.9), { hwasong_15_tel: 6, hwasong_17_tel: 6 }, true),
  missile('Strategic Force Sangnam-ni Missile Base', at('Sangnam-ni', 40.6, 128.5), { hwasong_18_tel: 6, hwasong_19_tel: 4 }, true),
];

const KPAF = { readiness: 0.4, experience: 0.15 };
const air = (name: string, base: Base, equipment: Kit): OrbatEntry => unit(PRK, name, 'air_wing', 'wing', base, equipment, KPAF);
const airForce: OrbatEntry[] = [
  air('1st Air Division Sunchon', at('Sunchon', 39.4, 125.89), { mig29: 35, su25: 34 }),
  air('1st Air Division Pukchang', at('Pukchang', 39.5, 125.97), { mig23ml: 56 }),
  air('1st Air Division Kaechon', at('Kaechon air', 39.75, 125.9), { j6: 50 }),
  air('2nd Air Division Toksan', at('Toksan', 39.99, 127.61), { mig21: 50 }),
  air('2nd Air Division Wonsan', at('Wonsan Kalma', 39.17, 127.48), { mig21: 50 }),
  air('3rd Air Division Hwangju', at('Hwangju air', 38.65, 125.79), { mig21: 50 }),
  air('3rd Air Division Taetan', at('Taetan', 38.13, 125.25), { j5: 55 }),
  air('3rd Air Division Onchon', at('Onchon', 38.9, 125.23), { j5: 52, j6: 50 }),
  air('8th Air Division Uiju', at('Uiju', 40.15, 125.1), { h5: 80 }),
  unit(PRK, 'Air and Anti-Air Force SAM Belt', 'air_defense', 'corps', at('Pyongyang SAM belt', 39.1, 125.6), { s200_launcher: 24, s75_launcher: 120, s125_launcher: 80, pongae5_launcher: 24 }, KPAF),
];

const KPN = { readiness: 0.4, experience: 0.15 };
const navy: OrbatEntry[] = [
  unit(PRK, 'West Sea Fleet Surface Group', 'surface_group', 'flotilla', at('Nampo naval base', 38.73, 125.4), { choe_hyon: 1, missile_boat: 20, fast_attack_craft: 100 }, KPN),
  unit(PRK, 'East Sea Fleet Surface Group', 'surface_group', 'flotilla', at('Toejo-dong', 40.1, 128.1), { najin: 2, choe_hyon: 1, missile_boat: 20, fast_attack_craft: 100 }, KPN),
  unit(PRK, 'West Sea Fleet Submarine Group', 'submarine', 'flotilla', at('Pipa-got', 38.74, 125.33), { romeo: 8, sang_o: 20, yono: 5 }, KPN),
  unit(PRK, 'East Sea Fleet Submarine Group', 'submarine', 'flotilla', at('Mayang-do', 40.0, 128.18), { romeo: 12, sang_o: 20, yono: 5 }, KPN),
  // Sinpo-B (Gorae) and the Hero Kim Kun Ok (Sinpo-C), launched 2023: ballistic-missile submarines.
  unit(PRK, 'Sinpo SLBM Submarine Group', 'strategic', 'flotilla', at('Sinpo', 40.03, 128.18), { gorae: 1, sinpo_c: 1 }, KPN),
];

export const prk: OrbatEntry[] = [...ground, ...artillery, ...strategicForce, ...airForce, ...navy];
