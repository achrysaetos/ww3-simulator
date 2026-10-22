import { defineParam, paramTable, tableParam } from '../../core/params';
import type { AccessStage, CyberSector } from './state';

// ---------------------------------------------------------------- cyber access

/**
 * Days of intrusion work to advance one access stage. Operations against hardened OT networks are
 * slow: Volt Typhoon held US critical-infrastructure networks for "at least five years" before
 * discovery (CISA, Feb 2024), and the Sandworm grid intrusions were prepared over many months.
 */
export const ACCESS_DAYS = paramTable('nonkinetic', {
  foothold: tableParam({ value: 60, range: [20, 120], tag: 'estimated', source: 'Volt Typhoon pre-positioning (CISA 2024); Sandworm grid campaigns 2015-16', affects: 'time to first access into a sector' }),
  persistent: tableParam({ value: 150, range: [60, 300], tag: 'estimated', source: 'Volt Typhoon "at least five years" undiscovered (CISA 2024)', affects: 'time to deep, firing-ready access' }),
});

/** Per-day chance an intrusion is discovered and evicted, scaled by the defender's cyber capability. Higher while actively building. */
export const DISCOVERY_PER_DAY = defineParam({ id: 'nonkinetic.DISCOVERY_PER_DAY', value: 0.002, range: [0.001, 0.02], tag: 'judgment',
  source: 'Judgment: Volt Typhoon undetected for years implies a low daily discovery hazard against a capable defender', affects: 'how long cyber access survives' });
export const BUILD_DISCOVERY_MULT = defineParam({ id: 'nonkinetic.BUILD_DISCOVERY_MULT', value: 1.5, range: [1, 6], tag: 'judgment',
  source: 'Judgment: active intrusion is noisier than dwelling', affects: 'discovery risk while building access' });

// ---------------------------------------------------------------- cyber payloads

/**
 * What firing a sector payload does, by the access stage it is fired from. A foothold yields a brief
 * disruption; persistent access yields a Sandworm-scale hit. Grid and telecom cuts apply to the
 * target's populated cells; satcom degrades its space bandwidth. `recoverDays` is the e-folding
 * recovery once the attack is spent.
 */
export interface Payload {
  /** Share of the sector's capacity taken down when fired. */
  hit: Record<AccessStage, number>;
  recoverDays: number;
  /** Firing is overt and usually burns the access. */
  burnsAccess: boolean;
}

export const PAYLOAD: Record<CyberSector, Payload> = {
  // Industroyer2 (2022) and the 2015 attack cut power to hundreds of thousands for hours; done from deep access.
  grid: { hit: { none: 0, foothold: 0.1, persistent: 0.45 }, recoverDays: 4, burnsAccess: true },
  // Viasat KA-SAT (24 Feb 2022) and Kyivstar (Dec 2023, ~24M subscribers down for days) degraded comms for days.
  telecom: { hit: { none: 0, foothold: 0.15, persistent: 0.5 }, recoverDays: 6, burnsAccess: true },
};

/** How many of the target's most-populated cells a grid payload hits. */
export const PAYLOAD_CELLS = defineParam({ id: 'nonkinetic.PAYLOAD_CELLS', value: 8, range: [3, 20], tag: 'judgment',
  source: 'Judgment: a national-scale cyber attack reaches the main load centres, not every cell', affects: 'reach of a cyber grid/telecom attack' });

// ---------------------------------------------------------------- cables

/** Months for a cable-repair ship to reach a region, mobilise and splice one cable. Estlink 2 (Dec 2024) was out ~7 months. */
export const CABLE_REPAIR_MONTHS = defineParam({ id: 'nonkinetic.CABLE_REPAIR_MONTHS', value: 4, range: [1, 9], tag: 'estimated',
  source: 'Estlink 2 out ~7 months (2025); Baltic data cables weeks to months; global fleet of ~60 repair ships', affects: 'how long a cut cable stays down' });

/** Share of GDP lost per unit of a nation\'s lost external data connectivity (cables + telecom cyber). */
export const DIGITAL_GDP_ELASTICITY = defineParam({ id: 'nonkinetic.DIGITAL_GDP_ELASTICITY', value: 0.08, range: [0.02, 0.2], tag: 'judgment',
  source: 'Judgment: digital services are a slice of GDP; a total connectivity loss is damaging but not economy-wide', affects: 'GDP under cable cuts and telecom attacks' });

// ---------------------------------------------------------------- maritime risk

/**
 * Shipping fear in a sea zone. Attacks on shipping leave "heat" that decays as underwriters forget;
 * mines and belligerent presence add standing risk. Red Sea 2024: a sustained campaign cut
 * Suez/Bab-el-Mandeb transits by about two thirds and pushed war-risk premiums from ~0.05% to
 * ~1% of hull value (Lloyd's List, UNCTAD, Feb-Jul 2024).
 */
export const ATTACK_HEAT = defineParam({ id: 'nonkinetic.ATTACK_HEAT', value: 0.5, range: [0.2, 1], tag: 'judgment',
  source: 'Judgment: each attack on shipping in a zone raises its remembered risk', affects: 'how much one attack scares shipping' });
/**
 * Heat an attack on warships leaves, as a share of an attack on merchant ships. Navies fighting
 * each other deter merchants far less than a campaign against them: Ukraine sank or disabled about
 * a third of the Black Sea Fleet in 2023-24, yet its grain corridor through the same sea was back to
 * near pre-war monthly volumes in 2024; Gulf tanker traffic kept sailing through the 1987 Stark attack
 * and the 1988 Praying Mantis battle, while the Red Sea 2024 campaign aimed at merchants cut transits by two thirds.
 * At a tenth, a zone takes about ten warship attacks within a few weeks to scare shipping as much as two attacks on merchants.
 */
export const WARSHIP_ATTACK_SHARE = defineParam({ id: 'nonkinetic.WARSHIP_ATTACK_SHARE', value: 0.1, range: [0.02, 0.4], tag: 'judgment',
  source: 'Ukraine grain corridor near pre-war volumes in 2024 despite the Black Sea Fleet campaign (Ukrainian Sea Ports Authority); Tanker War 1987-88 vs Red Sea 2024 (UNCTAD)', affects: 'how much fighting between navies scares merchant shipping' });
export const HEAT_HALF_DAYS = defineParam({ id: 'nonkinetic.HEAT_HALF_DAYS', value: 20, range: [7, 60], tag: 'estimated',
  source: 'Red Sea traffic stayed depressed for months after attacks eased (UNCTAD 2024)', affects: 'how long shipping stays scared' });
export const MINE_RISK = defineParam({ id: 'nonkinetic.MINE_RISK', value: 0.01, range: [0.002, 0.03], tag: 'judgment',
  source: 'Judgment: a mined zone deters shipping (Tanker War 1987-88; Black Sea 2022)', affects: 'shipping deterrence per mine' });
/** War-risk premium at full zone risk, percent of hull value. */
export const MAX_PREMIUM_PCT = defineParam({ id: 'nonkinetic.MAX_PREMIUM_PCT', value: 1, range: [0.3, 3], tag: 'observed',
  source: 'Red Sea war-risk premiums reached ~0.7-1% of hull value, from ~0.05% (Lloyd\'s List 2024)', affects: 'cost of transiting a dangerous zone' });
/** Share of ships refusing to sail at full risk: the Red Sea campaign deterred up to ~2/3 of transits. */
export const MAX_REFUSING = defineParam({ id: 'nonkinetic.MAX_REFUSING', value: 0.67, range: [0.3, 0.9], tag: 'observed',
  source: 'Suez/Bab-el-Mandeb transits fell ~2/3 (UNCTAD, Feb-Jul 2024)', affects: 'how many ships avoid a dangerous zone' });

// ---------------------------------------------------------------- occupation resistance

/**
 * Armed resistance in occupied territory, as attacks per million residents a day, rising when the
 * occupier is thin on the ground. Iraq 2003-07: an under-garrisoned occupation (~1 soldier per ~160
 * residents at the 2003 low) faced a growing insurgency; the RAND/Quinlivan "20 per 1,000" rule of
 * thumb marks the density that holds one down. Ukraine's occupied south stayed quieter under a dense
 * garrison and heavy filtration (ISW). Modelled on unmet security demand, not on partisan sabotage,
 * which civil already handles.
 */
export const RESISTANCE_PER_MILLION_DAY = defineParam({ id: 'nonkinetic.RESISTANCE_PER_MILLION_DAY', value: 0.3, range: [0.05, 1], tag: 'estimated',
  source: 'Iraq 2003-07 insurgent attack rates (SIGIR); Ukraine occupied south quieter under dense garrison (ISW)', affects: 'intensity of armed resistance under occupation' });
/** Troops per 1,000 residents at which resistance is held down (Quinlivan/RAND). Below it, resistance grows. */
export const GARRISON_PER_1000 = defineParam({ id: 'nonkinetic.GARRISON_PER_1000', value: 20, range: [10, 40], tag: 'estimated',
  source: 'Quinlivan 1995 / RAND "20 per 1,000" counterinsurgency force ratio', affects: 'garrison needed to suppress resistance' });
/** Readiness an occupying garrison loses per day at full resistance (ambushes, IEDs, no rest). */
export const GARRISON_READINESS_PER_DAY = defineParam({ id: 'nonkinetic.GARRISON_READINESS_PER_DAY', value: 0.01, range: [0.002, 0.03], tag: 'judgment',
  source: 'Judgment: a contested rear wears a garrison down, as Iraq rotations showed', affects: 'readiness of garrisons in restive territory' });
/** USD millions a day the occupier spends per full-resistance occupied cell: security operations, reconstruction, payoffs. */
export const OCCUPATION_COST_USD_M_DAY = defineParam({ id: 'nonkinetic.OCCUPATION_COST_USD_M_DAY', value: 0.5, range: [0.1, 2], tag: 'judgment',
  source: 'Judgment: occupation is costly; US spent billions a month in Iraq (CRS)', affects: 'treasury cost of holding restive territory' });
