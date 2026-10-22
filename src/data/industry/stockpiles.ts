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
    // Boeing has built over 500,000 JDAM kits since 1998 and ~45,000 a year at the 2017 peak; inventory est.
    gbu31: 30_000,
    gbu38: 20_000,
    gbu12: 20_000,
    // CRS/CSIS 2023: ATACMS was out of production from 2019 to 2023 with ~1,000-2,000 in US stocks before transfers to Ukraine (est.).
    atacms: 1_000,
    // Lockheed delivered the first PrSM Increment 1 rounds in Dec 2023; est. a few hundred by 2027.
    prsm: 300,
    // AGM-88 HARM and AARGM: tens of thousands of HARMs were built; the AARGM upgrade line has converted ~2,000 (est.).
    harm: 2_000,
    // Raytheon delivered its 2,400th MALD by 2019 at ~300-500 a year (Raytheon); est.
    mald: 3_000,
    // MDA: ~400 SM-3 delivered by 2024, a few dozen fired at Iranian missiles in 2024-25 (est.).
    sm3_ib: 250,
    sm3_iia: 60,
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
    // Ukrainian GUR 2024-25: Kh-59/69 ~40 a month made, mostly fired as made (est.).
    kh59: 200,
    iskander_k: 150,
    kh31p: 500,
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
  // Hyunmoo-2/3: South Korea's Kill Chain was reported at ~1,000+ ballistic and cruise missiles in 2017-20 (est.).
  KOR: { shell_155: 2_000_000, hyunmoo2c: 400, hyunmoo3c: 300, gbu31: 3_000, gbu12: 3_000 },
  // North Korean stocks before 2023 transfers were est. in the tens of millions of rounds.
  PRK: { shell_152: 8_000_000, kn23: 100, kn25: 100 },
  // IDF (June 2025): ~2,500-3,000 ballistic missiles before the 12-day war, about half able to reach Israel.
  // The ORBAT's launch brigades hold ~900 MRBMs; the rest of the long-range force is stocked here (est. split).
  IRN: { shahed_136: 2_000, fateh_110: 1_500, kheibar_shekan: 150, emad: 150, fattah1: 50, zolfaghar: 300 },
  // Arrow and David's Sling: no published count. Israel fired ~100-150 Arrow and ~70 Stunner rounds in the
  // April and October 2024 attacks and ran short in June 2025 (WSJ, CSIS 2025), so a few hundred in reserve (est.).
  // JDAMs: the US sent 14,000+ Mk 84 bombs and thousands of JDAM kits from Oct 2023 (Reuters, 2024); est.
  ISR: { tamir: 1_500, arrow2: 100, arrow3: 100, stunner: 150, gbu31: 3_000, gbu12: 2_000, rampage: 200, rocks: 100, air_lora: 50, lora: 50 },
  JPN: { pac3_mse: 300, sm3_ib: 40, sm3_iia: 16 },
  // Storm Shadow/SCALP and Taurus: the UK bought ~900 and France ~500 (Storm Shadow/SCALP), Germany ~600 Taurus (est. after transfers).
  GBR: { storm_shadow: 500, paveway4: 2_000 },
  FRA: { storm_shadow: 300 },
  DEU: { taurus: 450 },
  IND: { storm_shadow: 100 },
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
