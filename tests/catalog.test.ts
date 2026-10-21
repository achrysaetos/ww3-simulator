import { describe, expect, it } from 'vitest';
import { CLASS_FIREPOWER, DOMAIN_OF } from '../src/data/catalog/build';
import { catalogIndex, loadCatalog, munitions, platforms } from '../src/data/catalog';
import type { Munition, MunitionId, Platform, PlatformId } from '../src/core/types';

const catalog = loadCatalog();
const P = (id: string): Platform => catalog.platform(id as PlatformId);
const M = (id: string): Munition => catalog.munition(id as MunitionId);
const load = (p: Platform, m: string) => p.loadout.find((l) => l.munition === m)?.count ?? 0;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('catalog structure', () => {
  it('builds the Catalog with the required breadth', () => {
    expect(catalog.platforms.size).toBe(platforms.length);
    expect(platforms.length).toBeGreaterThanOrEqual(300);
    expect(munitions.length).toBeGreaterThanOrEqual(200);
  });

  it('uses snake_case ids that are unique across platforms and munitions (stockpiles key both by ItemId)', () => {
    const ids = [...platforms.map((p) => p.id), ...munitions.map((m) => m.id)];
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(_[a-z0-9]+)*$/);
  });

  it('loads only munitions that exist, in positive whole numbers', () => {
    for (const p of platforms)
      for (const l of p.loadout) {
        expect(catalog.munitions.has(l.munition), `${p.id} -> ${l.munition}`).toBe(true);
        expect(Number.isInteger(l.count) && l.count > 0, `${p.id} ${l.munition} x${l.count}`).toBe(true);
      }
  });

  it('gives every nuclear-capable platform a munition with a yield', () => {
    const nuclear = platforms.filter((p) => p.nuclearCapable);
    expect(nuclear.length).toBeGreaterThan(40);
    for (const p of nuclear) expect(p.loadout.some((l) => M(l.munition).yieldKt), p.id).toBe(true);
  });

  it('lists producers as ISO3 codes', () => {
    for (const x of [...platforms, ...munitions]) for (const n of x.producers) expect(n, x.id).toMatch(/^[A-Z]{3}$/);
  });

  it('puts every platform in its class domain, except ground-launched ASAT', () => {
    for (const p of platforms) if (!(p.class === 'asat' && p.domain === 'land')) expect(p.domain, p.id).toBe(DOMAIN_OF[p.class]);
  });

  it('indexes every id for other workers', () => {
    for (const x of [...platforms, ...munitions]) expect(catalogIndex).toContain(`| ${x.id} |`);
  });
});

describe('physical bounds', () => {
  it('keeps platform numbers plausible', () => {
    for (const p of platforms) {
      const ctx = p.id;
      expect(p.unitCostUsdM, ctx).toBeGreaterThan(0);
      expect(p.unitCostUsdM, ctx).toBeLessThan(15_000);
      expect(Number.isInteger(p.crew) && p.crew >= 0 && p.crew <= 3500, ctx).toBe(true);
      expect(p.inService, ctx).toBeGreaterThanOrEqual(1954);
      expect(p.inService, ctx).toBeLessThanOrEqual(2035);
      expect(p.mobility.speedKph, ctx).toBeGreaterThanOrEqual(0);
      expect(p.mobility.speedKph, ctx).toBeLessThanOrEqual(p.domain === 'space' ? 30_000 : 2_500);
      expect(p.mobility.rangeKm, ctx).toBeGreaterThanOrEqual(0);
      expect(p.mobility.fuelTonsPerHour, ctx).toBeGreaterThanOrEqual(0);
      expect(p.mobility.fuelTonsPerHour, ctx).toBeLessThan(15);
      for (const v of [p.protection.armor, p.protection.stealth]) expect(v >= 0 && v <= 1, ctx).toBe(true);
      expect(p.sensors.detectionKm, ctx).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(p.firepower)) expect(v! >= 0 && v! <= 1, ctx).toBe(true);
    }
  });

  it('keeps land vehicles slower than aircraft and ships slower than land vehicles on roads', () => {
    for (const p of platforms) {
      if (p.domain === 'land') expect(p.mobility.speedKph, p.id).toBeLessThanOrEqual(100);
      if (p.domain === 'sea' || p.domain === 'subsurface') expect(p.mobility.speedKph, p.id).toBeLessThanOrEqual(100);
      if (p.domain === 'air') expect(p.mobility.speedKph, p.id).toBeGreaterThanOrEqual(100);
    }
  });

  it('keeps munition numbers plausible', () => {
    for (const m of munitions) {
      const ctx = m.id;
      expect(m.rangeKm, ctx).toBeGreaterThan(0);
      expect(m.rangeKm, ctx).toBeLessThanOrEqual(40_000);
      expect(m.speedMach, ctx).toBeGreaterThanOrEqual(m.kind === 'mine' ? 0 : 0.05);
      expect(m.speedMach, ctx).toBeLessThanOrEqual(25);
      expect(m.warheadKg, ctx).toBeGreaterThanOrEqual(0);
      expect(m.warheadKg, ctx).toBeLessThanOrEqual(m.weightKg);
      expect(m.cepM, ctx).toBeGreaterThanOrEqual(0);
      expect(m.unitCostUsdM, ctx).toBeGreaterThan(0);
      expect(m.weightKg, ctx).toBeGreaterThan(0);
      expect(m.interceptDifficulty >= 0 && m.interceptDifficulty <= 1, ctx).toBe(true);
      expect(Object.keys(m.pk).length, ctx).toBeGreaterThan(0);
      for (const v of Object.values(m.pk)) expect(v! >= 0 && v! <= 1, ctx).toBe(true);
      if (m.yieldKt !== undefined) expect(m.yieldKt > 0 && m.yieldKt <= 2_000, ctx).toBe(true);
    }
  });
});

describe('spot-checked facts', () => {
  it('matches published ranges and kill figures', () => {
    expect(M('minuteman3').rangeKm).toBeGreaterThan(10_000);
    expect(M('sarmat').rangeKm).toBeGreaterThan(M('yars').rangeKm);
    expect(M('javelin').pk.armor!).toBeGreaterThan(0.5);
    expect(M('nlaw').rangeKm).toBeLessThan(M('javelin').rangeKm);
    expect(M('df21d').pk.ship!).toBeGreaterThan(0);
    expect(M('excalibur').cepM).toBeLessThan(M('shell_155').cepM / 10);
    expect(M('thaad_int').pk.missile!).toBeGreaterThan(M('gbi').pk.missile!);
  });

  it('orders stealth: F-22 and B-2 above F-35 above Su-57 above Su-35 and B-52', () => {
    expect(P('f22a').protection.stealth).toBeGreaterThan(P('su35s').protection.stealth);
    expect(P('f35a').protection.stealth).toBeGreaterThan(P('su57').protection.stealth);
    expect(P('su57').protection.stealth).toBeGreaterThan(P('su35s').protection.stealth);
    expect(P('b2a').protection.stealth).toBeGreaterThan(P('b52h').protection.stealth);
    expect(P('seawolf').protection.stealth).toBeGreaterThan(P('type094a').protection.stealth);
  });

  it('orders interception difficulty: hypersonic glide > ballistic > supersonic > subsonic cruise > drones', () => {
    expect(M('avangard').interceptDifficulty).toBeGreaterThan(M('minuteman3').interceptDifficulty);
    expect(M('df17').interceptDifficulty).toBeGreaterThan(M('iskander_m').interceptDifficulty);
    expect(M('zircon').interceptDifficulty).toBeGreaterThan(M('oniks').interceptDifficulty);
    expect(M('oniks').interceptDifficulty).toBeGreaterThan(M('kalibr').interceptDifficulty);
    expect(M('kalibr').interceptDifficulty).toBeGreaterThan(M('shahed136').interceptDifficulty);
  });

  it('gives heavier, more accurate warheads a better chance against silos', () => {
    expect(M('trident2_d5_w88').pk.hardened!).toBeGreaterThan(0.85);
    expect(M('trident2_d5_w88').pk.hardened!).toBeGreaterThan(M('trident2_d5').pk.hardened!);
    expect(M('hwasong15').pk.hardened!).toBeLessThan(0.2);
  });

  it('fills an Arleigh Burke Flight III to its 96 Mk 41 cells (ESSM quad-packed)', () => {
    const ddg = P('burke_flt3');
    const cells = load(ddg, 'sm2_iiic') + load(ddg, 'sm6') + load(ddg, 'essm2') / 4 + load(ddg, 'tomahawk') + load(ddg, 'sm3_iia') + load(ddg, 'asroc');
    expect(cells).toBe(96);
  });

  it('arms PLARF DF-21D and DF-26 brigades with seeker-guided anti-ship rounds, and keeps the DF-26 land-attack round off ships at sea (DoD CMPR 2024)', () => {
    for (const tel of ['df21d_tel', 'df26_tel']) {
      const rounds = P(tel).loadout.map((l) => M(l.munition));
      expect(rounds.some((m) => m.kind === 'antiship_ballistic' && (m.pk.ship ?? 0) > 0), tel).toBe(true);
    }
    expect(M('df26').pk.ship ?? 0).toBe(0);
  });

  it('carries four missiles on an S-400 launcher and twelve PAC-3 MSE on a Patriot launcher', () => {
    expect(P('s400').loadout.reduce((n, l) => n + l.count, 0)).toBe(4);
    expect(load(P('patriot_pac3'), 'pac3_mse')).toBe(12);
  });
});

describe('firepower calibration', () => {
  const byClass = (cls: Platform['class'], tc: keyof Platform['firepower']) => median(platforms.filter((p) => p.class === cls).map((p) => p.firepower[tc] ?? 0));

  it('makes an MBT far deadlier to armor than an IFV, and an IFV than an APC', () => {
    expect(byClass('mbt', 'armor')).toBeGreaterThan(2 * byClass('ifv', 'armor'));
    expect(byClass('ifv', 'armor')).toBeGreaterThan(byClass('apc', 'armor'));
    expect(P('m1a2_sepv3').firepower.armor!).toBeGreaterThan(P('m2a4_bradley').firepower.armor!);
    expect(P('m1a2_sepv3').firepower.armor!).toBeGreaterThan(P('t72b3').firepower.armor!);
    expect(P('t72b3').firepower.armor!).toBeGreaterThan(P('t55').firepower.armor!);
  });

  it('lets artillery dominate infantry', () => {
    expect(byClass('sp_artillery', 'infantry')).toBeGreaterThan(2 * byClass('mbt', 'infantry'));
    expect(byClass('mlrs', 'infantry')).toBeGreaterThan(byClass('sp_artillery', 'infantry'));
    expect(byClass('sp_artillery', 'infantry')).toBeGreaterThan(4 * byClass('infantry', 'infantry'));
  });

  it('gives fighters strong air-to-air and ground units none', () => {
    expect(P('f22a').firepower.aircraft!).toBeGreaterThan(P('su35s').firepower.aircraft!);
    expect(byClass('fighter', 'aircraft')).toBeGreaterThan(5 * byClass('mbt', 'armor'));
    for (const p of platforms) if (p.domain === 'land' && p.class !== 'shorad' && p.class !== 'usv') expect(p.firepower.aircraft ?? 0, p.id).toBeLessThan(0.05);
  });

  it('leaves logistics and strategic launchers without organic firepower', () => {
    for (const cls of ['truck', 'fuel_truck', 'icbm_silo', 'tel_srbm', 'tanker', 'cargo_ship'] as const) expect(CLASS_FIREPOWER[cls]).toEqual({});
    expect(P('hemtt_m977').firepower).toEqual({});
  });
});

describe('coverage', () => {
  // Ids that orders of battle and scenarios are expected to reference.
  const required = [
    'm1a2_sepv3', 'leopard2a7', 't90m', 't72b3', 'type99a', 'k2', 'merkava4', 'challenger3', 'leclerc', 'arjun_mk1a',
    'm2a4_bradley', 'cv90', 'bmp3', 'puma', 'zbd04a', 'm109a7', 'pzh2000', '2s19m2', 'k9a1', 'caesar', 'pcl181',
    'himars', 'm270a2', 'bm21', 'bm30', 'phl16', 'chunmoo', 'javelin_team', 'nlaw_team', 'kornet_team',
    'patriot_pac3', 'thaad', 's400', 's500', 's300pmu2', 'hq9b_launcher', 'hq19_launcher', 'iron_dome', 'davids_sling', 'arrow3_launcher',
    'iris_t_slm', 'nasams', 'samp_t', 'pantsir_s1', 'tor_m2', 'gepard',
    'f35a', 'f35b', 'f35c', 'f22a', 'f15ex', 'f16v', 'f18e', 'su35s', 'su57', 'su34', 'su30sm2', 'j20a', 'j16', 'j10c', 'rafale', 'typhoon', 'gripen_e', 'kf21',
    'b2a', 'b21', 'b52h', 'b1b', 'tu160m', 'tu95ms', 'tu22m3', 'h6k', 'h6n', 'e3g', 'e7a', 'kj500', 'a50u', 'kc46a', 'il78m', 'c17a', 'y20',
    'mq9', 'tb2', 'shahed_launcher', 'orion', 'wing_loong2', 'gj11', 'ah64e', 'ka52m', 'z10',
    'gerald_r_ford', 'nimitz', 'fujian', 'shandong', 'liaoning', 'kuznetsov', 'queen_elizabeth', 'charles_de_gaulle',
    'burke_flt3', 'ticonderoga', 'type055', 'type052d', 'kirov', 'slava', 'admiral_gorshkov', 'sejong', 'kongo', 'maya', 'type45', 'fremm', 'constellation',
    'virginia', 'seawolf', 'columbia', 'ohio_ssbn', 'ohio_ssgn', 'yasen_m', 'borei_a', 'kilo636', 'type093b', 'type094a', 'type096', 'astute', 'dreadnought', 'soryu', 'taigei', 'dosan_ahn_changho',
    'minuteman3_silo', 'sentinel_silo', 'yars_tel', 'sarmat_silo', 'df41_tel', 'df31ag_tel', 'df5b_silo', 'df21d_tel', 'df26_tel', 'df17_tel', 'iskander_tel', 'ssc8_launcher',
    'hwasong15_tel', 'hwasong17_tel', 'hwasong18_tel', 'kn23_tel', 'fateh_tel', 'shahab3_tel', 'kheibar_tel', 'agni5_tel', 'shaheen3_tel',
    'nudol', 'sc19_tel', 'gps3', 'hemtt_m977', 'm978_tanker', 'lmsr', 'product_tanker', 'john_lewis', 'infantry_squad', 'engineer_squad',
  ];
  const requiredMunitions = [
    'minuteman3', 'sentinel', 'trident2_d5', 'yars', 'sarmat', 'bulava', 'df41', 'df31ag', 'df5b', 'jl3', 'df21d', 'df26', 'df17', 'kinzhal', 'zircon', 'avangard',
    'iskander_m', 'r9m729', 'kalibr', 'kh101', 'tomahawk', 'jassm_er', 'lrasm', 'nsm', 'storm_shadow', 'taurus', 'harpoon', 'yj12', 'yj18', 'oniks',
    'hwasong15', 'hwasong17', 'hwasong18', 'kn23', 'fateh110', 'shahab3', 'kheibar_shekan', 'agni5', 'shaheen3',
    'gbu31', 'gbu39', 'fab500_umpk', 'kab500l', 'aim120d', 'aim9x', 'meteor', 'r77_1', 'pl15', 'pl17', 'shell_155', 'shell_152', 'excalibur', 'gmlrs',
    'mk48', 'type53', 'mk54', 'pac3_mse', 'thaad_int', 'sm3_iia', 'sm6', 'sm3_asat', 'nudol_int', 'sc19_int', 'javelin', 'nlaw', 'kornet', 'shahed136',
  ];

  it('includes every system the scenarios rely on', () => {
    expect(required.filter((id) => !catalog.platforms.has(id as PlatformId))).toEqual([]);
    expect(requiredMunitions.filter((id) => !catalog.munitions.has(id as MunitionId))).toEqual([]);
  });

  it('covers every platform class with at least one platform', () => {
    const missing = Object.keys(DOMAIN_OF).filter((cls) => !platforms.some((p) => p.class === cls));
    expect(missing).toEqual([]);
  });
});
