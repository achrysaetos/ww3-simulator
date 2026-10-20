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
