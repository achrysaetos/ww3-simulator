import type { NuclearForces } from './types';

/**
 * FAS, Status of World Nuclear Forces 2025 (Kristensen, Korda, Johns, Knight; March 2025):
 * 12,241 warheads worldwide.
 * stockpile = deployed + reserve, i.e. warheads assigned to the military. inventory adds
 * retired warheads awaiting dismantlement; only USA and RUS hold a meaningful number.
 * Deployed: USA 1,670 strategic + 100 B61 in Europe; RUS 1,718 strategic (non-strategic
 * warheads held in central storage); CHN 24 assessed on alert; FRA on SSBNs and ASMPA-R
 * squadrons; GBR on SSBNs; IND, PAK, ISR and PRK hold warheads separate from launchers in peacetime.
 *
 * Doctrine sources: US 2022 Nuclear Posture Review (no sole-purpose pledge); Russia,
 * "Fundamentals of State Policy on Nuclear Deterrence" (Nov 2024 revision); China's 1964
 * no-first-use pledge restated in the 2019 white paper; India's 2003 doctrine (NFU with a
 * chemical/biological caveat); Pakistan's full-spectrum deterrence (Kidwai, 2015);
 * France's "ultime avertissement" (Macron, Ecole de Guerre 2020); UK 2021 Integrated
 * Review; Israel's policy of opacity; DPRK 2022 Law on the State Policy on Nuclear Forces
 * (preemptive use when leadership or NC3 is attacked).
 */
export const nuclearForces: Record<string, NuclearForces> = {
  RUS: { stockpile: 4309, inventory: 5459, deployed: 1718, doctrine: 'escalate_to_deescalate' },
  USA: { stockpile: 3700, inventory: 5177, deployed: 1770, doctrine: 'calculated_ambiguity' },
  CHN: { stockpile: 600, inventory: 600, deployed: 24, doctrine: 'no_first_use' },
  FRA: { stockpile: 290, inventory: 290, deployed: 280, doctrine: 'calculated_ambiguity' },
  GBR: { stockpile: 225, inventory: 225, deployed: 120, doctrine: 'calculated_ambiguity' },
  IND: { stockpile: 180, inventory: 180, deployed: 0, doctrine: 'no_first_use' },
  PAK: { stockpile: 170, inventory: 170, deployed: 0, doctrine: 'escalate_to_deescalate' },
  ISR: { stockpile: 90, inventory: 90, deployed: 0, doctrine: 'calculated_ambiguity' },
  PRK: { stockpile: 50, inventory: 50, deployed: 0, doctrine: 'escalate_to_deescalate' },
};

/**
 * How fast a state with warheads held apart from its launchers can mate them once it orders an
 * alert. `firstHours` brings `firstShare` of the stockpile to the launchers; the rest follows
 * evenly until `fullHours`. Times are estimates from open assessments, since no state publishes
 * them:
 * - PAK: warheads kept unassembled near their delivery units and mated "within hours" (FAS
 *   Nuclear Notebook 2023; Kidwai's Strategic Plans Division). 1999 Kargil and 2019 Balakot
 *   crises reportedly saw readiness raised within a day.
 * - IND: Agni-P and Agni-V ride in sealed canisters with the warhead mated (FAS Nuclear Notebook
 *   2024), so a first share is ready in hours; aircraft bombs and older missiles take longer.
 * - ISR: on 8-9 October 1973 Jericho missiles and nuclear-capable F-4s were readied within about a
 *   day of the Golan front collapsing (Cohen, "The Worst-Kept Secret", 2010).
 * - PRK: warheads believed stored separately from road-mobile launchers; dispersal and mating
 *   over days (FAS Nuclear Notebook 2024; 38 North).
 * - CHN: most warheads held in central storage under the Central Military Commission; DoD CMPR
 *   2024 assesses a move to "early warning counterstrike" with some on high alert, the rest
 *   loaded over days.
 * - RUS: about 1,550 non-strategic warheads sit in the 12th GUMO's central storage sites, with
 *   base-level stores next to Iskander brigades, naval bases and bomber bases (FAS Nuclear
 *   Notebook 2024, "Russian nuclear weapons"). Moving them out and loading them takes days; the
 *   May-June 2024 non-strategic exercise practised "issuing" and loading warheads at Iskander and
 *   Kinzhal units over the exercise's first phase. Dual-capable launchers: Iskander-M TELs, one
 *   9M723 round ready each; Yasen-M and Akula submarines, Kalibr land-attack rounds (FAS counts
 *   about 820 naval non-strategic warheads, Kalibr among them). Estimates.
 */
export interface AlertSpec {
  firstHours: number;
  firstShare: number;
  fullHours: number;
  /**
   * Dual-capable launchers that take a nuclear round from storage once it is mated: per platform,
   * the round and how many each launcher carries. Without it, mated warheads join launchers that
   * already carry the nuclear round in their loadout.
   */
  loads?: Record<string, { munition: string; perLauncher: number }>;
}

export const NUCLEAR_ALERT: Record<string, AlertSpec> = {
  PAK: { firstHours: 12, firstShare: 0.25, fullHours: 72 },
  IND: { firstHours: 6, firstShare: 0.2, fullHours: 48 },
  ISR: { firstHours: 24, firstShare: 0.3, fullHours: 72 },
  PRK: { firstHours: 24, firstShare: 0.2, fullHours: 96 },
  CHN: { firstHours: 24, firstShare: 0.25, fullHours: 168 },
  RUS: {
    firstHours: 24, firstShare: 0.2, fullHours: 120,
    loads: {
      iskander_mk_tel: { munition: 'iskander_m_nuc', perLauncher: 1 },
      yasen_m: { munition: 'kalibr_nuc', perLauncher: 4 },
      akula: { munition: 'kalibr_nuc', perLauncher: 2 },
    },
  },
};
