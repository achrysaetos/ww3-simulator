/*
 * US strategic nuclear forces, 2025-26.
 * Sources: US State Department New START aggregate data (400 deployed ICBMs, 14 SSBNs with
 * 20 active tubes each); FAS Nuclear Notebook "United States nuclear weapons, 2025"
 * (Kristensen, Korda, Johns), which gives ~300 bomber weapons stored at bomber bases and
 * typically 4-5 SSBNs at sea; af.mil fact sheets for the 90th, 91st and 341st Missile Wings;
 * IISS Military Balance 2025 (B-2A 19, B-52H 76). The at-sea / in-port split is the usual
 * peacetime posture, not a reported daily figure.
 * Magazines count reentry vehicles. A boat's load is one per tube; FAS assesses about four W76 or
 * W88 per Trident II (some 970 SLBM warheads), so the other three per missile go in extraMagazine.
 */
import { base, forNation } from './build';

const u = forNation('USA', 'New START data 2025; FAS Nuclear Notebook 2025; IISS Military Balance 2025');

const bangor = base('Naval Base Kitsap-Bangor, WA', 47.72, -122.71);
const kingsBay = base('Naval Submarine Base Kings Bay, GA', 30.8, -81.52);
/** Reentry vehicles beyond one per tube for `boats` Ohio-class SSBNs: 16 W76-1 and 2 W88 missiles at four each. */
const mirv = (boats: number) => ({ trident2_d5: 48 * boats, trident2_d5_w88: 6 * boats });

export const usaStrategic = [
  u('341st Missile Wing', 'strategic', 'wing', base('Malmstrom AFB, MT', 47.5, -111.18), { minuteman3_silo: 134 }, { readiness: 0.95, personnel: 3300 }),
  u('91st Missile Wing', 'strategic', 'wing', base('Minot AFB, ND', 48.42, -101.36), { minuteman3_silo: 133 }, { readiness: 0.95, personnel: 3200 }),
  u('90th Missile Wing', 'strategic', 'wing', base('F.E. Warren AFB, WY', 41.15, -104.86), { minuteman3_silo: 133 }, { readiness: 0.95, personnel: 3300 }),

  u('Submarine Group 9 SSBNs on deterrent patrol (Pacific)', 'strategic', 'flotilla', base('North Pacific patrol area', 40, -160), { ssbn_ohio: 3 }, { readiness: 1, personnel: 3 * 155, extraMagazine: mirv(3) }),
  u('Submarine Group 9 SSBNs in port (Bangor)', 'strategic', 'flotilla', bangor, { ssbn_ohio: 5 }, { readiness: 0.5, personnel: 5 * 155, extraMagazine: mirv(5) }),
  u('Submarine Group 10 SSBNs on deterrent patrol (Atlantic)', 'strategic', 'flotilla', base('North Atlantic patrol area', 45, -40), { ssbn_ohio: 2 }, { readiness: 1, personnel: 2 * 155, extraMagazine: mirv(2) }),
  u('Submarine Group 10 SSBNs in port (Kings Bay)', 'strategic', 'flotilla', kingsBay, { ssbn_ohio: 4 }, { readiness: 0.5, personnel: 4 * 155, extraMagazine: mirv(4) }),
  u('Strategic Weapons Facility Pacific (Trident II D5LE reloads)', 'logistics', 'battalion', bangor, { truck: 40 }, { readiness: 0.9, personnel: 800, extraMagazine: { trident2_d5: 60 } }),

  u('509th Bomb Wing (with 131st Bomb Wing ANG)', 'strategic', 'wing', base('Whiteman AFB, MO', 38.73, -93.55), { b2a: 19 }, { readiness: 0.75, extraMagazine: { b61_12: 100 } }),
  u('2nd Bomb Wing (with 307th Bomb Wing AFRC)', 'strategic', 'wing', base('Barksdale AFB, LA', 32.5, -93.66), { b52h: 48 }, { readiness: 0.75, extraMagazine: { agm86b_alcm: 120 } }),
  u('5th Bomb Wing', 'strategic', 'wing', base('Minot AFB, ND', 48.42, -101.36), { b52h: 26 }, { readiness: 0.75, extraMagazine: { agm86b_alcm: 80 } }),
];
