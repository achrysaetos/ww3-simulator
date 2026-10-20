import type { ItemId, Nation } from '../../core/types';
import { ITEMS, type ItemKey } from './items';

/**
 * Military fuel use per USD 1M of annual defence spending, tons per year. The US DoD
 * burns ~85M barrels (~11.6 Mt) a year on ~USD 950B (DLA Energy FY2019), ~12 t per USD 1M.
 */
export const MIL_FUEL_TONS_PER_USD_M = 12;
/** Rations and water treatment per soldier per day, tons (US Army ~2 kg field ration planning factor). */
export const RATION_TONS_PER_DAY = 0.002;

/**
 * Warehoused inventories at the start of 2027. These are all estimates: no
 * government publishes munition inventories, so each figure is cumulative
 * procurement minus known expenditure and transfers, or a published analyst range.
 */
const STOCKS: Record<string, Partial<Record<ItemKey, number>>> = {
  USA: {
    // CSIS (2023-24): ~4,000 Tomahawks built for the US and ~3,500-4,000 in inventory.
    tomahawk: 3_500,
    // CSIS/CRS: a few thousand PAC-3 rounds after transfers to Ukraine and Israel use.
    pac3_mse: 2_500,
    // ~125/yr since 2013 minus tests and Red Sea use (est.).
    sm6: 900,
    thaad: 400,
    // Lockheed has delivered >4,000 JASSM since 2001; est. inventory.
    jassm: 4_000,
    lrasm: 200,
    gmlrs: 20_000,
    aim120: 8_000,
    javelin: 20_000,
    stinger: 3_000,
    // US 155 mm stocks after >3M rounds sent to Ukraine (est.).
    shell_155: 1_500_000,
    m1a2: 2_500,
  },
  RUS: {
    // Pre-2022 stocks were est. ~15-17M rounds (Estonian intelligence); by 2027 mostly
    // spent and replaced by production, so est. ~3M on hand.
    shell_152: 3_000_000,
    kh101: 150,
    iskander_m: 400,
    kalibr: 150,
    shahed_136: 3_000,
    s400_48n6: 2_000,
    // Stored tank hulls remaining for refurbishment (est., IISS/Oryx-based counts).
    t72b3: 1_500,
  },
  CHN: {
    // DoD China Military Power Report 2024: ~1,000 SRBM, ~1,300 MRBM, ~500 IRBM missiles, ~300 GLCM.
    df15: 1_000,
    df21d: 1_300,
    df26: 500,
    cj10: 300,
    pl15: 3_000,
    hq9: 3_000,
    shell_155: 10_000_000,
  },
  UKR: { shell_155: 300_000, fpv_drone: 150_000 },
  KOR: { shell_155: 2_000_000 },
  // North Korean stocks before 2023 transfers were est. in the tens of millions of rounds.
  PRK: { shell_152: 8_000_000, kn23: 100 },
  IRN: { shahed_136: 2_000, fateh_110: 1_500 },
  ISR: { tamir: 1_500 },
  JPN: { pac3_mse: 300 },
  TWN: { shell_155: 500_000 },
};

/** Estimated warehoused items and national bulk stocks for a nation at the scenario start. */
export function initialStockpiles(nation: Nation): Pick<Nation, 'stockpile' | 'bulk'> {
  const stockpile: Record<ItemId, number> = {};
  let ammo = 0;
  for (const [key, count] of Object.entries(STOCKS[nation.id] ?? {}) as [ItemKey, number][]) {
    const spec = ITEMS[key];
    if (spec.sink.kind === 'bulk_ammo') ammo += count * spec.sink.tonsPerUnit;
    else stockpile[spec.id] = count;
  }
  const milexUsdM = (nation.stats.milexUsd ?? (nation.stats.gdp ?? 0) * 0.02) / 1e6;
  const underArms = nation.stats.armedForces ?? nation.population * 0.003;
  return {
    stockpile,
    bulk: {
      // Three months of peacetime military fuel use; IEA stocks are counted by the energy buffer instead.
      fuel: Math.round((milexUsdM * MIL_FUEL_TONS_PER_USD_M) / 4),
      // Plus about one month of generic ammunition at peacetime war-reserve norms (est.).
      ammo: Math.round(ammo + underArms * 0.05),
      food: Math.round(underArms * RATION_TONS_PER_DAY * 90),
    },
  };
}
