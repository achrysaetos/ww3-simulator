import type { OrbatEntry } from '../types';
import { at, merge, mix, unit, type Base, type Kit } from './build';

/*
 * PLA Ground Force, 2025: 13 group armies of six combined-arms brigades each plus
 * artillery, air-defence and army-aviation brigades, by theater command, and the Xinjiang
 * and Tibet military districts. Brigade numbers and garrisons follow open-source
 * compilations of the 2017 reform (e.g. Blasko, "The Chinese Army Today", 3rd ed.) and are
 * approximate; brigade establishments are estimates. Totals are calibrated against IISS
 * Military Balance 2025 (see tests/orbat-east.test.ts).
 */

const CHN = 'CHN';
const PLA = { readiness: 0.75, experience: 0.25 };

type Tanks = Kit;
const NORTH: Tanks = { type99a: 0.6, type96b: 0.4 };
const SOUTH: Tanks = { type96b: 0.9, type99a: 0.1 };

// Combined-arms brigade establishments (4 CA battalions, artillery, AD, recon, support).
const HEAVY = (t: Tanks): Kit => merge(mix(120, t), { zbd04a: 100, plz05: 18, phl11: 9, hq17: 6, pgz09: 6, infantry_squad: 90, truck: 400 });
const MEDIUM: Kit = { type96b: 31, zbl08: 140, ztl11: 30, pcl181: 18, phl11: 9, hq17: 6, pgz09: 6, infantry_squad: 110, truck: 400 };
const LIGHT: Kit = { type15: 20, zbl08: 40, csk181: 60, pcl181: 12, hq17: 4, infantry_squad: 130, truck: 450 };
const AMPHIB: Kit = { zbd05: 100, ztd05: 30, plz07: 18, hq17: 6, infantry_squad: 90, truck: 300 };
const ARTY: Kit = { phl16: 24, plz05: 36, pcl181: 18, infantry_squad: 10, truck: 300 };
const AIR_DEF: Kit = { hq16_launcher: 12, hq17: 12, pgz09: 12, truck: 100 };
const AVN: Kit = { z10: 24, z19: 12, z20: 12, mi171: 12 };

type BdeType = 'H' | 'M' | 'L' | 'A';
const LABEL: Record<BdeType, string> = { H: 'Heavy', M: 'Medium', L: 'Light', A: 'Amphibious' };
type Bde = [num: string, type: BdeType, base: Base];

function groupArmy(ga: string, hq: Base, tanks: Tanks, brigades: Bde[]): OrbatEntry[] {
  const kit: Record<BdeType, Kit> = { H: HEAVY(tanks), M: MEDIUM, L: LIGHT, A: AMPHIB };
  const near = (dLat: number, dLon: number, what: string) => at(`${hq.name} ${what}`, hq.lat + dLat, hq.lon + dLon);
  return [
    ...brigades.map(([num, type, base]) => unit(CHN, `${num} ${LABEL[type]} Combined Arms Brigade (${ga})`, 'maneuver', 'brigade', base, kit[type], PLA)),
    unit(CHN, `${ga} Artillery Brigade`, 'artillery', 'brigade', near(0.15, 0.1, 'artillery garrison'), ARTY, PLA),
    unit(CHN, `${ga} Air Defence Brigade`, 'air_defense', 'brigade', near(-0.1, 0.15, 'AD garrison'), AIR_DEF, PLA),
    unit(CHN, `${ga} Army Aviation Brigade`, 'air_wing', 'wing', near(0.1, -0.15, 'army airfield'), AVN, PLA),
    unit(CHN, `${ga} Special Operations Brigade`, 'maneuver', 'brigade', near(-0.15, -0.1, 'SOF garrison'), { infantry_squad: 80, csk181: 40, truck: 60 }, { readiness: 0.85, experience: 0.3 }),
  ];
}

const eastern = [
  ...groupArmy('71st GA', at('Xuzhou', 34.26, 117.18), SOUTH, [
    ['2nd', 'H', at('Xuzhou', 34.26, 117.18)], ['35th', 'H', at("Huai'an", 33.6, 119.0)], ['160th', 'M', at('Jiawang', 34.4, 117.45)],
    ['178th', 'M', at('Suzhou (Anhui)', 33.64, 116.98)], ['179th', 'L', at('Nanjing', 32.06, 118.79)], ['235th', 'L', at('Bengbu', 32.92, 117.39)],
  ]),
  ...groupArmy('72nd GA', at('Huzhou', 30.87, 120.09), SOUTH, [
    ['5th', 'A', at('Hangzhou', 30.27, 120.15)], ['10th', 'H', at('Wuxi', 31.49, 120.31)], ['34th', 'M', at('Huzhou', 30.87, 120.09)],
    ['85th', 'M', at('Ningbo', 29.87, 121.54)], ['90th', 'L', at('Jinhua', 29.08, 119.65)], ['124th', 'A', at('Wenzhou', 28.0, 120.67)],
  ]),
  ...groupArmy('73rd GA', at('Xiamen', 24.48, 117.75), SOUTH, [
    ['3rd', 'A', at('Zhangzhou', 24.51, 117.65)], ['14th', 'A', at('Xiamen', 24.48, 117.75)], ['86th', 'H', at('Fuzhou', 26.07, 119.3)],
    ['91st', 'M', at('Quanzhou', 25.1, 118.68)], ['145th', 'M', at('Longyan', 25.08, 117.02)], ['92nd', 'L', at('Putian', 25.43, 119.0)],
  ]),
];

const southern = [
  ...groupArmy('74th GA', at('Huizhou', 23.11, 114.42), SOUTH, [
    ['1st', 'A', at('Huizhou', 23.11, 114.42)], ['16th', 'H', at('Guangzhou', 23.13, 113.26)], ['125th', 'M', at('Shaoguan', 24.81, 113.6)],
    ['132nd', 'M', at('Zhaoqing', 23.05, 112.47)], ['154th', 'L', at('Shantou', 23.35, 116.68)], ['163rd', 'L', at('Jieyang', 23.55, 116.37)],
  ]),
  ...groupArmy('75th GA', at('Kunming', 25.04, 102.71), SOUTH, [
    ['31st', 'H', at('Kunming', 25.04, 102.71)], ['32nd', 'M', at('Dali', 25.6, 100.27)], ['37th', 'L', at('Wenshan', 23.37, 104.25)],
    ['42nd', 'L', at('Mengzi', 23.37, 103.38)], ['122nd', 'M', at('Nanning', 22.82, 108.37)], ['123rd', 'M', at('Guilin', 25.27, 110.29)],
  ]),
];

const western = [
  ...groupArmy('76th GA', at('Xining', 36.62, 101.78), NORTH, [
    ['12th', 'H', at('Xining', 36.62, 101.78)], ['17th', 'M', at('Lanzhou', 36.06, 103.83)], ['56th', 'L', at('Zhangye', 38.93, 100.45)],
    ['62nd', 'M', at('Yinchuan', 38.47, 106.27)], ['149th', 'L', at('Jiuquan', 39.73, 98.49)], ['182nd', 'H', at('Wuwei', 37.93, 102.64)],
  ]),
  ...groupArmy('77th GA', at('Chongqing', 29.56, 106.55), SOUTH, [
    ['39th', 'H', at('Chongqing', 29.56, 106.55)], ['40th', 'M', at('Chengdu', 30.66, 104.06)], ['55th', 'L', at('Mianyang', 31.47, 104.68)],
    ['139th', 'M', at('Leshan', 29.55, 103.77)], ['150th', 'L', at('Guiyang', 26.65, 106.63)], ['181st', 'H', at('Nanchong', 30.84, 106.11)],
  ]),
];

const northern = [
  ...groupArmy('78th GA', at('Harbin', 45.8, 126.53), NORTH, [
    ['8th', 'H', at('Harbin', 45.8, 126.53)], ['48th', 'H', at('Qiqihar', 47.35, 123.92)], ['68th', 'M', at('Mudanjiang', 44.55, 129.63)],
    ['115th', 'M', at('Jiamusi', 46.8, 130.32)], ['202nd', 'L', at('Jilin', 43.84, 126.55)], ['204th', 'L', at('Changchun', 43.88, 125.32)],
  ]),
  ...groupArmy('79th GA', at('Liaoyang', 41.27, 123.17), NORTH, [
    ['46th', 'H', at('Liaoyang', 41.27, 123.17)], ['116th', 'H', at('Siping', 43.17, 124.35)], ['119th', 'M', at('Shenyang', 41.8, 123.43)],
    ['190th', 'M', at('Dandong', 40.12, 124.38)], ['191st', 'L', at('Fuxin', 42.02, 121.67)], ['200th', 'L', at('Tonghua', 41.73, 125.93)],
  ]),
  ...groupArmy('80th GA', at('Weifang', 36.7, 119.1), NORTH, [
    ['47th', 'H', at('Weifang', 36.7, 119.1)], ['118th', 'H', at('Jinan', 36.65, 117.12)], ['138th', 'M', at("Tai'an", 36.2, 117.1)],
    ['199th', 'M', at('Linyi', 35.1, 118.35)], ['201st', 'L', at('Laiyang', 36.98, 120.71)], ['203rd', 'L', at('Yantai', 37.46, 121.45)],
  ]),
];

const central = [
  ...groupArmy('81st GA', at('Zhangjiakou', 40.77, 114.88), NORTH, [
    ['7th', 'H', at('Zhangjiakou', 40.77, 114.88)], ['70th', 'H', at('Xuanhua', 40.6, 115.05)], ['189th', 'M', at('Datong', 40.08, 113.3)],
    ['194th', 'M', at('Chengde', 40.97, 117.93)], ['195th', 'L', at('Beijing west', 39.9, 116.0)], ['196th', 'L', at('Tianjin', 39.13, 117.2)],
  ]),
  ...groupArmy('82nd GA', at('Baoding', 38.87, 115.46), NORTH, [
    ['6th', 'H', at('Baoding', 38.87, 115.46)], ['80th', 'H', at('Shijiazhuang', 38.04, 114.5)], ['112th', 'M', at('Tangshan', 39.63, 118.18)],
    ['127th', 'M', at('Xingtai', 37.07, 114.5)], ['151st', 'L', at('Hengshui', 37.74, 115.67)], ['188th', 'L', at('Taiyuan', 37.87, 112.55)],
  ]),
  ...groupArmy('83rd GA', at('Xinxiang', 35.3, 113.92), NORTH, [
    ['11th', 'H', at('Xinxiang', 35.3, 113.92)], ['58th', 'M', at('Kaifeng', 34.8, 114.31)], ['60th', 'M', at('Zhengzhou', 34.75, 113.62)],
    ['113th', 'H', at('Luoyang', 34.62, 112.45)], ['193rd', 'L', at('Pingdingshan', 33.73, 113.3)], ['22nd', 'L', at('Xinyang', 32.12, 114.07)],
  ]),
];

// Xinjiang and Tibet military districts: high-altitude divisions and mountain brigades.
const HIGHLAND_DIV: Kit = { type96b: 150, type15: 40, zbd04a: 120, zbl08: 80, plz05: 36, phl16: 12, pcl181: 18, hq17: 12, infantry_squad: 260, truck: 1200 };
const MOUNTAIN_BDE: Kit = { type15: 40, zbl08: 60, csk181: 60, pcl181: 18, hq17: 6, infantry_squad: 130, truck: 450 };
const districts: OrbatEntry[] = [
  unit(CHN, '4th Highland Motorised Infantry Division (Xinjiang MD)', 'maneuver', 'division', at('Kashgar', 39.47, 75.99), HIGHLAND_DIV, PLA),
  unit(CHN, '6th Highland Mechanised Infantry Division (Xinjiang MD)', 'maneuver', 'division', at('Hotan', 37.11, 79.92), HIGHLAND_DIV, PLA),
  unit(CHN, '8th Highland Motorised Infantry Division (Xinjiang MD)', 'maneuver', 'division', at('Tacheng', 46.75, 83.1), HIGHLAND_DIV, PLA),
  unit(CHN, '11th Highland Motorised Infantry Division (Xinjiang MD)', 'maneuver', 'division', at('Urumqi', 43.83, 87.62), HIGHLAND_DIV, PLA),
  unit(CHN, '52nd Mountain Infantry Brigade (Tibet MD)', 'maneuver', 'brigade', at('Nyingchi', 29.65, 94.36), MOUNTAIN_BDE, PLA),
  unit(CHN, '53rd Mountain Infantry Brigade (Tibet MD)', 'maneuver', 'brigade', at('Shannan', 29.24, 91.77), MOUNTAIN_BDE, PLA),
  unit(CHN, '54th Mechanised Infantry Brigade (Tibet MD)', 'maneuver', 'brigade', at('Shigatse', 29.27, 88.88), MOUNTAIN_BDE, PLA),
  unit(CHN, 'Western TC Army Aviation Brigade (Tibet)', 'air_wing', 'wing', at('Lhasa Gonggar', 29.3, 90.91), { z20: 16, z10: 12, z8: 12 }, PLA),
];

// IISS lists ~1,000+ older ZTZ-59/79/88 still on PLA strength, mostly in reserve formations.
const RESERVE_ARMOR: Kit = { type59d: 220, zsd89: 80, infantry_squad: 60, truck: 300 };
const reserve: OrbatEntry[] = [
  unit(CHN, 'Northern TC Reserve Armoured Division', 'maneuver', 'division', at('Changchun reserve depot', 43.95, 125.5), RESERVE_ARMOR, { readiness: 0.3, experience: 0.1 }),
  unit(CHN, 'Central TC Reserve Armoured Division', 'maneuver', 'division', at('Shijiazhuang reserve depot', 38.1, 114.8), RESERVE_ARMOR, { readiness: 0.3, experience: 0.1 }),
  unit(CHN, 'Eastern TC Reserve Armoured Division', 'maneuver', 'division', at('Nanjing reserve depot', 32.2, 118.5), RESERVE_ARMOR, { readiness: 0.3, experience: 0.1 }),
];

// PLA Navy Marine Corps: six combined-arms brigades plus SOF and aviation (CMPR 2024).
const MARINE: Kit = { zbd05: 90, ztd05: 30, plz07: 12, zbl08: 20, infantry_squad: 100, truck: 250 };
const marines: OrbatEntry[] = [
  unit(CHN, '1st Marine Brigade', 'maneuver', 'brigade', at('Zhanjiang', 21.27, 110.36), MARINE, { readiness: 0.8, experience: 0.3 }),
  unit(CHN, '2nd Marine Brigade', 'maneuver', 'brigade', at('Zhanjiang Donghai', 21.05, 110.4), MARINE, { readiness: 0.8, experience: 0.3 }),
  unit(CHN, '3rd Marine Brigade', 'maneuver', 'brigade', at('Jinjiang', 25.1, 118.58), MARINE, { readiness: 0.8, experience: 0.3 }),
  unit(CHN, '4th Marine Brigade', 'maneuver', 'brigade', at('Jieyang marine base', 23.4, 116.2), MARINE, { readiness: 0.8, experience: 0.3 }),
  unit(CHN, '5th Marine Brigade', 'maneuver', 'brigade', at('Qingdao marine base', 36.15, 120.2), MARINE, { readiness: 0.8, experience: 0.3 }),
  unit(CHN, '6th Marine Brigade', 'maneuver', 'brigade', at('Yantai marine base', 37.4, 121.0), MARINE, { readiness: 0.8, experience: 0.3 }),
  unit(CHN, 'Marine Corps Special Operations Brigade', 'maneuver', 'brigade', at('Sanya marine base', 18.3, 109.6), { infantry_squad: 70, csk181: 30, truck: 50 }, { readiness: 0.85, experience: 0.3 }),
  unit(CHN, 'Marine Corps Aviation Brigade', 'air_wing', 'wing', at('Zhanjiang air', 21.2, 110.2), { z8: 12, z9: 12 }, { readiness: 0.75, experience: 0.25 }),
];

export const chnPlaa: OrbatEntry[] = [...eastern, ...southern, ...western, ...northern, ...central, ...districts, ...reserve, ...marines];
