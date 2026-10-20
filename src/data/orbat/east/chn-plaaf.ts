import type { OrbatEntry } from '../types';
import { at, unit, type Base, type Kit } from './build';

/*
 * PLA Air Force and PLA Navy aviation, 2025, by theater command.
 *
 * Totals by type are calibrated to the DoD China Military Power Report 2024 (~2,400 combat
 * aircraft across PLAAF and PLAN aviation, excluding trainers and UAVs) and IISS Military
 * Balance 2025 type breakdowns; J-20 strength (~300) follows 2025 open-source production
 * estimates. Brigade numbers and home airbases follow open-source compilations (e.g. CASI,
 * "PLA Aerospace Power" 2nd ed.) and are approximate; per-brigade counts are estimates
 * (a fighter brigade fields roughly 24-32 aircraft).
 */

const CHN = 'CHN';
const PLAAF = { readiness: 0.75, experience: 0.3 };
const bde = (name: string, base: Base, equipment: Kit): OrbatEntry => unit(CHN, name, 'air_wing', 'wing', base, equipment, PLAAF);

const easternTC: OrbatEntry[] = [
  bde('9th Air Brigade', at('Wuhu', 31.39, 118.41), { j20a: 28 }),
  bde('41st Air Brigade', at('Wuyishan', 27.7, 118.0), { j20a: 26 }),
  bde('8th Air Brigade', at('Changxing', 31.0, 119.9), { j16: 28 }),
  bde('85th Air Brigade', at('Quzhou', 28.97, 118.9), { j16: 26 }),
  bde('95th Air Brigade', at('Lianyungang', 34.57, 119.25), { j10c: 26 }),
  bde('93rd Air Brigade', at('Jiaxing', 30.7, 120.68), { j10c: 26 }),
  bde('3rd Air Brigade', at('Zhangzhou', 24.56, 117.66), { j10c: 26 }),
  bde('40th Air Brigade', at('Nanchang Xiangtang', 28.6, 115.95), { j10a: 26 }),
  bde('42nd Air Brigade', at('Rugao', 32.27, 120.5), { j10a: 26 }),
  bde('78th Air Brigade', at('Shuimen', 26.9, 119.9), { j11b: 26 }),
  bde('83rd Air Brigade', at('Luqiao', 28.56, 121.43), { j11b: 24 }),
  bde('7th Air Brigade', at('Longtian', 25.68, 119.53), { su30mkk: 24 }),
  bde('94th Air Brigade', at('Jinjiang', 25.1, 118.59), { j7: 24 }),
  bde('10th Bomber Division', at('Anqing', 30.6, 117.05), { h6k: 42 }),
  bde('20th Air Brigade', at('Huangshan Tunxi', 29.73, 118.25), { jh7a: 24 }),
  bde('Eastern TC Special Mission Brigade', at('Shanghai Dachang', 31.32, 121.42), { kj500: 8, kj2000: 2 }),
];

const southernTC: OrbatEntry[] = [
  bde('6th Air Brigade', at('Suixi', 21.4, 110.2), { su35s: 24 }),
  bde('131st Air Brigade', at('Luliang', 24.99, 103.65), { j20a: 26 }),
  bde('5th Air Brigade', at('Liuzhou', 24.2, 109.4), { j20a: 24 }),
  bde('2nd Air Brigade', at('Guilin Lijiacun', 25.22, 110.08), { j16: 26 }),
  bde('Foshan Air Brigade', at('Foshan', 23.08, 113.07), { su30mkk: 24 }),
  bde('4th Air Brigade', at('Shantou Waisha', 23.43, 116.76), { j10c: 26 }),
  bde('70th Air Brigade', at('Nanning Wuxu', 22.6, 108.17), { j10c: 26 }),
  bde('44th Air Brigade', at('Mengzi', 23.39, 103.33), { j16: 26 }),
  bde('124th Air Brigade', at('Zhanjiang Potou', 21.2, 110.4), { jh7a: 24 }),
  bde('126th Air Brigade', at('Kunming Wujiaba', 25.0, 102.75), { j7: 24 }),
  bde('130th Air Brigade', at('Huizhou', 23.05, 114.6), { j10a: 26 }),
  bde('8th Bomber Division', at('Leiyang', 26.6, 112.86), { h6k: 42 }),
  bde('54th Air Brigade', at('Ledong', 18.5, 109.0), { j11b: 24 }),
];

const westernTC: OrbatEntry[] = [
  bde('Flight Test and Training Centre', at('Dingxin', 40.3, 99.5), { j20a: 12, j16: 10, j10c: 10 }),
  bde('97th Air Brigade', at('Chongqing Dazu', 29.65, 105.8), { j16: 26 }),
  bde('98th Air Brigade', at('Chongqing Baishiyi', 29.5, 106.35), { j16: 26 }),
  bde('99th Air Brigade', at('Mianyang Nanjiao', 31.42, 104.74), { j20a: 24 }),
  bde('109th Air Brigade', at('Chengdu Qionglai', 30.4, 103.47), { j10c: 26 }),
  bde('110th Air Brigade', at('Hotan', 37.04, 79.86), { j11b: 24 }),
  bde('111th Air Brigade', at('Korla', 41.7, 86.12), { j11b: 24 }),
  bde('112th Air Brigade', at('Urumqi Diwopu', 43.9, 87.47), { j16: 24 }),
  bde('16th Air Brigade', at('Lhasa Gonggar air', 29.25, 90.85), { j10c: 18 }),
  bde('Ngari Detachment', at('Ngari Gunsa', 32.1, 80.05), { j11b: 12 }),
  bde('Shigatse Detachment', at('Shigatse Peace', 29.35, 89.31), { j10a: 12 }),
  bde('36th Bomber Division', at("Xi'an Lintong", 34.37, 109.2), { h6k: 36 }),
  bde('106th Air Brigade', at('Wugong', 34.25, 108.25), { h6n: 30 }),
  bde('100th Air Brigade', at('Lanzhou Zhongchuan', 36.52, 103.62), { j7: 24 }),
  bde('Yinchuan Hedong Air Brigade', at('Yinchuan Hedong', 38.3, 106.4), { j20a: 24 }),
  bde('Chengdu Shuangliu Air Brigade', at('Chengdu Shuangliu', 30.58, 103.95), { j10a: 24 }),
  bde('Yulin (Shaanxi) Air Brigade', at('Yulin Yuyang', 38.28, 109.73), { j7: 24 }),
  bde('Xinjin Air Brigade', at('Xinjin', 30.42, 103.85), { jh7a: 24 }),
  bde('Western TC Strike Brigade', at('Golmud', 36.4, 94.8), { jh7a: 24 }),
  // Brigades below are known by home base; their unit numbers are not confirmed in open sources.
  bde('Hangzhou Jianqiao Air Brigade', at('Hangzhou Jianqiao', 30.33, 120.24), { j20a: 26 }),
  bde('Yiwu Air Brigade', at('Yiwu', 29.35, 120.03), { j16: 26 }),
  bde('Hefei Air Brigade', at('Hefei', 31.98, 117.3), { j16: 26 }),
  bde('Wuxi Shuofang Air Brigade', at('Wuxi Shuofang', 31.5, 120.3), { j7: 24 }),
  bde('Nanjing Air Brigade', at('Nanjing air', 32.0, 118.8), { j7: 24 }),
];

const northernTC: OrbatEntry[] = [
  bde('1st Air Brigade', at('Anshan', 41.1, 122.85), { j20a: 28 }),
  bde('88th Air Brigade', at('Qiqihar', 47.24, 123.9), { j11b: 26 }),
  bde('63rd Air Brigade', at('Changchun Dafangshen', 43.9, 125.2), { j16: 26 }),
  bde('61st Air Brigade', at('Siping', 43.1, 124.4), { j10c: 26 }),
  bde('31st Air Brigade', at('Weifang air', 36.65, 119.12), { j10a: 26 }),
  bde('34th Air Brigade', at('Jining', 35.3, 116.35), { j11b: 26 }),
  bde('89th Air Brigade', at('Dalian Zhoushuizi', 39.1, 121.54), { j16: 26 }),
  bde('90th Air Brigade', at('Chifeng', 42.25, 118.9), { j7: 24 }),
  bde('91st Air Brigade', at('Mudanjiang Hailang', 44.53, 129.57), { j7: 24 }),
  bde('92nd Air Brigade', at('Gongzhuling', 43.5, 124.8), { jh7a: 24 }),
  bde('Changchun Air Brigade', at('Changchun Longjia', 44.0, 125.7), { j16: 26 }),
  bde('Northern TC Special Mission Brigade', at('Shenyang Yuhong', 41.88, 123.35), { kj500: 6, y20: 6 }),
  bde('Tangshan Air Brigade', at('Tangshan air', 39.65, 118.1), { j7: 24 }),
];

const centralTC: OrbatEntry[] = [
  bde('172nd Air Brigade', at('Cangzhou', 38.33, 116.85), { j20a: 26 }),
  bde('56th Air Brigade', at('Zhengzhou air', 34.6, 113.85), { j20a: 26 }),
  bde('19th Air Brigade', at('Zunhua', 40.2, 117.97), { j16: 26 }),
  bde('43rd Air Brigade', at('Yangcun', 39.37, 117.1), { j10c: 26 }),
  bde('24th Air Brigade', at('Shangqiu', 34.45, 115.65), { j10c: 26 }),
  bde('72nd Air Brigade', at('Datong Huairen', 40.06, 113.48), { j11b: 24 }),
  bde('21st Air Brigade', at('Huairou', 40.35, 116.6), { j7: 24 }),
  bde('39th Air Brigade', at('Wuhan Shanpo', 30.3, 114.3), { j10a: 26 }),
  bde('Changsha Datuopu Air Brigade', at('Changsha Datuopu', 28.07, 113.07), { j20a: 26 }),
  bde('Zhangjiakou Ningyuan Air Brigade', at('Zhangjiakou Ningyuan', 40.7, 114.93), { j10c: 24 }),
  bde('Hengyang Air Brigade', at('Hengyang', 26.9, 112.6), { j7: 24 }),
  bde('15th Bomber Brigade', at('Neixiang', 33.05, 111.85), { h6k: 20, h6n: 6 }),
  bde('Strategic Airlift Division', at('Kaifeng air', 34.75, 114.35), { y20: 50, il76: 15 }),
  bde('Air Force Early Warning Division', at('Wuhan Wangjiadun', 30.6, 114.27), { kj500: 20, kj2000: 3 }),
  bde('Central TC Strike Brigade', at('Luoyang air', 34.68, 112.4), { jh7a: 20 }),
];

// PLAN aviation: carrier air wings ashore, maritime strike and fighter brigades.
const NAVY_AIR = { readiness: 0.7, experience: 0.3 };
const plan: OrbatEntry[] = [
  unit(CHN, '1st Naval Shipborne Air Brigade', 'air_wing', 'wing', at('Huangdicun, Xingcheng', 40.65, 120.69), { j15: 32, z18: 8, z9: 6 }, NAVY_AIR),
  unit(CHN, '2nd Naval Shipborne Air Brigade', 'air_wing', 'wing', at('Ledong naval air', 18.55, 109.1), { j15: 32, z18: 8 }, NAVY_AIR),
  unit(CHN, 'Fujian Air Wing (forming)', 'air_wing', 'wing', at('Sanya Fenghuang naval air', 18.3, 109.42), { j15t: 12, kj600: 4 }, { readiness: 0.5, experience: 0.15 }),
  unit(CHN, 'Northern TC Navy Strike Brigade', 'air_wing', 'wing', at('Laiyang naval air', 36.97, 120.6), { jh7a: 24, h6j: 10 }, NAVY_AIR),
  unit(CHN, 'Eastern TC Navy Air Brigade', 'air_wing', 'wing', at('Ningbo Zhuangqiao', 29.82, 121.46), { j11b: 24, j10a: 12 }, NAVY_AIR),
  unit(CHN, 'Eastern TC Navy Strike Brigade', 'air_wing', 'wing', at('Taizhou naval air', 28.6, 121.3), { jh7a: 24, h6j: 10 }, NAVY_AIR),
  unit(CHN, 'Southern TC Navy Air Brigade', 'air_wing', 'wing', at('Lingshui', 18.5, 109.9), { j11b: 24, kj500: 4, y8q: 6 }, NAVY_AIR),
  unit(CHN, 'Southern TC Navy Strike Brigade', 'air_wing', 'wing', at('Jialaishi', 19.9, 109.8), { h6j: 12, jh7a: 24 }, NAVY_AIR),
];

// PLAAF surface-to-air missile brigades: HQ-9/9B (~24 launchers each), S-400 and S-300PMU2 (IISS MB 2025).
const SAM = { readiness: 0.8, experience: 0.2 };
const sam = (name: string, base: Base, equipment: Kit): OrbatEntry => unit(CHN, name, 'air_defense', 'brigade', base, equipment, SAM);
const airDefence: OrbatEntry[] = [
  sam('Beijing SAM Brigade North', at('Beijing Changping', 40.22, 116.23), { hq9_launcher: 24, hq22_launcher: 8 }),
  sam('Beijing SAM Brigade South', at('Beijing Daxing', 39.7, 116.35), { hq9_launcher: 24, s400_launcher: 16 }),
  sam('Shanghai SAM Brigade', at('Shanghai Songjiang', 31.03, 121.23), { hq9_launcher: 24, hq22_launcher: 8 }),
  sam('Fujian Coast SAM Brigade North', at('Fuzhou SAM', 26.0, 119.5), { hq9_launcher: 24, s300pmu2_launcher: 16 }),
  sam('Fujian Coast SAM Brigade South', at('Xiamen SAM', 24.6, 117.9), { hq9_launcher: 24, s400_launcher: 16 }),
  sam('Guangdong SAM Brigade', at('Guangzhou SAM', 23.2, 113.4), { hq9_launcher: 24, s300pmu2_launcher: 16 }),
  sam('Hainan SAM Brigade', at('Haikou SAM', 19.95, 110.3), { hq9_launcher: 24 }),
  sam('Shenyang SAM Brigade', at('Shenyang SAM', 41.7, 123.3), { hq9_launcher: 24, s300pmu2_launcher: 16 }),
  sam('Qingdao SAM Brigade', at('Qingdao SAM', 36.25, 120.2), { hq9_launcher: 24, s300pmu2_launcher: 16 }),
  sam('Chengdu SAM Brigade', at('Chengdu SAM', 30.75, 104.0), { hq9_launcher: 24, hq22_launcher: 8 }),
  sam('Xinjiang SAM Brigade', at('Urumqi SAM', 43.95, 87.6), { hq9_launcher: 24 }),
  sam('Tibet SAM Brigade', at('Lhasa SAM', 29.6, 91.0), { hq9_launcher: 16 }),
  sam('Wuhan SAM Brigade', at('Wuhan SAM', 30.5, 114.4), { hq9_launcher: 24, hq22_launcher: 8 }),
];

export const chnPlaaf: OrbatEntry[] = [...easternTC, ...southernTC, ...westernTC, ...northernTC, ...centralTC, ...plan, ...airDefence];
