import { defineParam, paramTable, tableParam } from '../../core/params';

/**
 * How long an adaptation takes, by what it needs changed (issue #2, section 3, each range resting on a
 * single case): a software or jamming fix 2-12 weeks, new tactics 1-6 months, new kit from industry
 * 6-24 months. A counter's delay from notice to fully fielded is drawn uniformly inside its class.
 */
export type LagClass = 'software' | 'tactics' | 'industry';

const LAG = paramTable('adaptation', {
  softwareMinDays: tableParam({ value: 14, range: [7, 28], tag: 'estimated', affects: 'how fast software and jamming fixes arrive',
    source: 'Issue #2 s.3: software and jamming fixes 2-12 weeks (FPV frequency and jammer updates, RUSI 2024-25)' }),
  softwareMaxDays: tableParam({ value: 84, range: [42, 120], tag: 'estimated', affects: 'how fast software and jamming fixes arrive',
    source: 'Issue #2 s.3: software and jamming fixes 2-12 weeks (FPV frequency and jammer updates, RUSI 2024-25)' }),
  tacticsMinDays: tableParam({ value: 30, range: [14, 60], tag: 'estimated', affects: 'how fast new tactics spread',
    source: 'Issue #2 s.3: tactics 1-6 months (Black Sea Fleet port defences after the 2023 USV raids)' }),
  tacticsMaxDays: tableParam({ value: 180, range: [90, 270], tag: 'estimated', affects: 'how fast new tactics spread',
    source: 'Issue #2 s.3: tactics 1-6 months (Black Sea Fleet port defences after the 2023 USV raids)' }),
  industryMinDays: tableParam({ value: 180, range: [120, 270], tag: 'estimated', affects: 'how fast new kit reaches units',
    source: 'Issue #2 s.3: industry 6-24 months (fibre-optic FPVs at scale 2024-25; interceptor drones 2025)' }),
  industryMaxDays: tableParam({ value: 720, range: [365, 900], tag: 'estimated', affects: 'how fast new kit reaches units',
    source: 'Issue #2 s.3: industry 6-24 months (fibre-optic FPVs at scale 2024-25; interceptor drones 2025)' }),
});

export const LAG_DAYS: Readonly<Record<LagClass, () => [number, number]>> = {
  software: () => [LAG.softwareMinDays, LAG.softwareMaxDays],
  tactics: () => [LAG.tacticsMinDays, LAG.tacticsMaxDays],
  industry: () => [LAG.industryMinDays, LAG.industryMaxDays],
};

/** Share of a counter's delay spent fielding it, its effect ramping in as units receive it; the rest is development. Judgment. */
export const FIELDING_SHARE = defineParam({ id: 'adaptation.FIELDING_SHARE', value: 0.35, range: [0.1, 0.6], tag: 'judgment',
  source: 'Judgment: new kit and drills reach front units over weeks to months after the first ones (RUSI 2024-25)',
  affects: 'how gradually a counter takes effect' });

export const PAIR_IDS = ['fpv_jamming', 'jamming_fiber', 'jet_drone_interceptor', 'sea_drone_port', 'cyber_hunting', 'base_dispersal'] as const;
export type PairId = (typeof PAIR_IDS)[number];

/**
 * Where the calibration sits in the pair's cycle. `countered`: the constants were fitted with the
 * counter in service, so a new generation of the measure lifts its effect above 1 until countered
 * again. `fresh`: they were fitted on the measure before a counter, so countering drives it below 1.
 */
export type Opening = 'countered' | 'fresh';

export interface PairSpec {
  measure: string;
  counter: string;
  /** What the counter side changes to field its counter. */
  counterLag: LagClass;
  /** What the measure's side changes to field a new generation once its last one is countered. */
  measureLag: LagClass;
  opening: Opening;
  /** Losses the counter side must observe to the current generation before it notices it, in `unit`. */
  notice: () => number;
  unit: string;
  /**
   * How far the measure's effect moves over one cycle: a fresh generation is 1 + swing times as
   * effective as a countered one. The amplitude is not published for any pair; each is judgment.
   */
  swing: () => number;
  /** Development cost of one counter or one new generation, USD B, paid from the treasury when it starts. */
  costUsdB: () => number;
}

const P = paramTable('adaptation', {
  fpvNotice: tableParam({ value: 3000, range: [1000, 10000], tag: 'judgment', affects: 'how soon a new FPV generation is countered',
    source: 'Judgment: a week of front casualties attributed to drones, at the 2024-25 rates (UK MoD; RUSI)' }),
  fpvSwing: tableParam({ value: 0.3, range: [0.1, 0.6], tag: 'judgment', affects: 'how much a new FPV generation beats jamming',
    source: 'Judgment: RUSI (Watling and Reynolds 2024-25) describe weeks-long swings as frequencies and jammers change; amplitude unpublished' }),
  fpvCost: tableParam({ value: 0.05, range: [0.01, 0.2], tag: 'judgment', affects: 'treasury cost of the FPV-jamming cycle',
    source: 'Judgment: firmware and jammer reprogramming, a small share of either side\'s drone budget' }),
  fiberNotice: tableParam({ value: 5, range: [2, 15], tag: 'judgment', affects: 'how soon a side turns to fibre-optic drones',
    source: 'Judgment: a month or more of 15-20% of front fire lost to jamming, the 2024 trigger for fibre FPVs (RUSI 2025)' }),
  fiberSwing: tableParam({ value: 0.5, range: [0.2, 1], tag: 'judgment', affects: 'how much fibre-optic FPVs blunt jamming',
    source: 'Judgment: fibre FPVs ignore jamming but carry 10-20 km of cable; RUSI 2025 put them at a minority of strikes' }),
  fiberCost: tableParam({ value: 0.5, range: [0.1, 2], tag: 'judgment', affects: 'treasury cost of fielding fibre FPVs',
    source: 'Judgment: new production lines for spooled-fibre drones, cheap per airframe but at scale (RUSI 2025)' }),
  jetNotice: tableParam({ value: 300, range: [100, 1000], tag: 'judgment', affects: 'how soon jet attack drones are countered',
    source: 'Judgment: about a month of leakers at the 2025 Shahed launch rates against Ukraine (UAF daily reports)' }),
  jetSwing: tableParam({ value: 0.5, range: [0.2, 1], tag: 'judgment', affects: 'how much jet attack drones outrun the counter-drone belt',
    source: 'Judgment: jet Geran-3 and Shahed-238 outrun mobile fire groups and piston interceptor drones (UAF 2025)' }),
  jetCost: tableParam({ value: 0.5, range: [0.1, 2], tag: 'judgment', affects: 'treasury cost of the jet drone cycle',
    source: 'Judgment: an interceptor-drone or jet-drone production programme at 2025 scale' }),
  seaNotice: tableParam({ value: 2, range: [1, 5], tag: 'judgment', affects: 'how soon a navy defends its ports against USVs',
    source: 'Judgment: the Black Sea Fleet hardened Sevastopol after its first USV losses in 2022-23 (ISW)' }),
  seaSwing: tableParam({ value: 0.6, range: [0.2, 1.5], tag: 'judgment', affects: 'how much port defences blunt strike USVs',
    source: 'Judgment: booms, gun groups and helicopters made 2024 USV raids rarer and costlier (ISW; Black Sea Fleet losses, Oryx)' }),
  seaCost: tableParam({ value: 0.1, range: [0.02, 0.5], tag: 'judgment', affects: 'treasury cost of the USV cycle',
    source: 'Judgment: booms, patrol craft and gun groups for a fleet\'s main bases' }),
  cyberNotice: tableParam({ value: 3, range: [1, 10], tag: 'judgment', affects: 'how soon a target hunts for hidden access',
    source: 'Judgment: a few days of national outage prompt a hunt, as CISA advisories followed Volt Typhoon finds (CISA AA24-038A)' }),
  cyberSwing: tableParam({ value: 1, range: [0.3, 2], tag: 'judgment', affects: 'how much network hunting speeds discovery of access',
    source: 'Judgment: hunting doubles the discovery rate of pre-placed access (CISA AA24-038A; Volt Typhoon dwell of years)' }),
  cyberCost: tableParam({ value: 0.2, range: [0.05, 1], tag: 'judgment', affects: 'treasury cost of the cyber cycle',
    source: 'Judgment: a national threat-hunting surge or a new access campaign' }),
  baseNotice: tableParam({ value: 10, range: [3, 40], tag: 'judgment', affects: 'how soon an air force disperses and hardens',
    source: 'Judgment: Ukraine dispersed after its first aircraft were caught on the ground in 2022 (Oryx; RUSI)' }),
  baseSwing: tableParam({ value: 0.6, range: [0.2, 1.5], tag: 'judgment', affects: 'how much dispersal and hardening cut losses on the ground',
    source: 'Judgment: CSIS 2023 Taiwan wargames lost most US aircraft on crowded ramps; dispersal and shelters cut that' }),
  baseCost: tableParam({ value: 1, range: [0.2, 5], tag: 'judgment', affects: 'treasury cost of dispersal and hardening',
    source: 'Judgment: dispersal strips and hardened shelters, USD 1B is a few dozen shelters (CSIS 2023)' }),
});

/** The measure and counter-measure pairs, each as a side's effect against the other's counter. */
export const PAIRS: Readonly<Record<PairId, PairSpec>> = {
  fpv_jamming: {
    measure: 'radio-flown FPV and loitering drones', counter: 'counter-drone jamming', counterLag: 'software', measureLag: 'software', opening: 'countered',
    notice: () => P.fpvNotice, unit: 'casualties to drones', swing: () => P.fpvSwing, costUsdB: () => P.fpvCost,
  },
  jamming_fiber: {
    measure: 'counter-drone jamming', counter: 'fibre-optic FPV drones', counterLag: 'industry', measureLag: 'software', opening: 'fresh',
    notice: () => P.fiberNotice, unit: 'days of front fire jammed', swing: () => P.fiberSwing, costUsdB: () => P.fiberCost,
  },
  jet_drone_interceptor: {
    measure: 'one-way attack drones', counter: 'interceptor drones and mobile fire groups', counterLag: 'industry', measureLag: 'industry', opening: 'countered',
    notice: () => P.jetNotice, unit: 'drones through', swing: () => P.jetSwing, costUsdB: () => P.jetCost,
  },
  sea_drone_port: {
    measure: 'strike USVs', counter: 'port defences', counterLag: 'tactics', measureLag: 'tactics', opening: 'fresh',
    notice: () => P.seaNotice, unit: 'hulls lost', swing: () => P.seaSwing, costUsdB: () => P.seaCost,
  },
  cyber_hunting: {
    measure: 'pre-placed cyber access', counter: 'network threat hunting', counterLag: 'tactics', measureLag: 'tactics', opening: 'fresh',
    notice: () => P.cyberNotice, unit: 'outage-days', swing: () => P.cyberSwing, costUsdB: () => P.cyberCost,
  },
  base_dispersal: {
    measure: 'strikes on clustered air bases', counter: 'dispersal and hardened shelters', counterLag: 'industry', measureLag: 'tactics', opening: 'fresh',
    notice: () => P.baseNotice, unit: 'aircraft lost on the ground', swing: () => P.baseSwing, costUsdB: () => P.baseCost,
  },
};
