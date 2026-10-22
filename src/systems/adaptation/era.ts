import { defineParam } from '../../core/params';

/**
 * Era dials (issue #2, section 3): the drone-and-EW battlefield of 2024-25 Ukraine is a setting, not a
 * law of war. Each dial is 1 at the 2024-25 conditions the land and EW constants were calibrated on, and
 * a run sets them through World.params (a scenario's `params`) to explore other eras. At 1 every wrapped
 * constant reads exactly its calibrated value, so a default run is unchanged.
 */

/**
 * How much of the battlefield the enemy sees and can reach with fire, relative to 2024-25 Ukraine, where
 * drone observation 10-20 km deep made massed assaults suicidal (RUSI, Watling and Reynolds, Feb 2025).
 * 0.25 is near a pre-2022 battlefield; 2 a 2030s one with persistent wide-area sensing. Scales the
 * kill-zone commitment (land.KILL_ZONE_COMMIT ** TRANSPARENCY): the more transparent, the smaller the
 * share of an assault that can be inside the kill zone at once.
 */
export const TRANSPARENCY = defineParam({ id: 'era.TRANSPARENCY', value: 1, range: [0.25, 2], tag: 'scenario',
  source: 'Scenario dial; 1 = 2024-25 Ukraine (RUSI, Watling and Reynolds, Feb 2025: 10-20 km drone-watched depth)',
  affects: 'kill-zone commitment of assaults' });

/**
 * Cost of a precise strike relative to the target it kills, as a multiple of 2024-25 levels, when a
 * USD 500 FPV drone killed USD 1-5M vehicles (RUSI, "Meatgrinder", May 2023; Oryx). 2 means strikes
 * twice as cheap per kill (more drones per km of front); 0.5 back toward the shell-and-tank era.
 * Scales drone-team fire linearly and positional attrition by its square root (drones were roughly
 * half of positional fire in 2024-25; judgment).
 */
export const STRIKE_COST_RATIO = defineParam({ id: 'era.STRIKE_COST_RATIO', value: 1, range: [0.3, 3], tag: 'scenario',
  source: 'Scenario dial; 1 = 2024-25 Ukraine, USD ~500 FPV against USD 1-5M vehicles (RUSI Meatgrinder 2023; Oryx)',
  affects: 'drone fire and positional attrition' });

/**
 * Electronic-warfare density relative to 2024-25 Ukraine, the densest EW battlefield on record (RUSI,
 * "Stormbreak", 2023; McDermott, ICDS 2017). Scales the most counter-drone jamming can deny over a
 * position (c2.DRONE_BAND_MAX), capped at 0.98.
 */
export const EW = defineParam({ id: 'era.EW', value: 1, range: [0.3, 1.5], tag: 'scenario',
  source: 'Scenario dial; 1 = 2024-25 Ukraine EW density (RUSI Stormbreak 2023; McDermott, ICDS 2017)',
  affects: 'strongest counter-drone jamming over a position' });

/** Most a drone-band jam can deny at any EW density: some links always hop through (judgment). */
const MAX_DRONE_DENIAL = 0.98;

/** The kill-zone commitment under the era's transparency; exactly `commit` at 1. */
export const eraKillZoneCommit = (commit: number): number => commit ** TRANSPARENCY();
/** Drone-team fire under the era's strike cost; exactly `fire` at 1. */
export const eraDroneFire = (fire: number): number => fire * STRIKE_COST_RATIO();
/** Positional attrition intensity under the era's strike cost; exactly `intensity` at 1. */
export const eraPositionalIntensity = (intensity: number): number => intensity * Math.sqrt(STRIKE_COST_RATIO());
/** The strongest counter-drone jam under the era's EW density; exactly `denial` at 1. */
export const eraDroneDenial = (denial: number): number => Math.min(MAX_DRONE_DENIAL, denial * EW());
