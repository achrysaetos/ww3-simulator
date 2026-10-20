import type { OrbatEntry } from '../types';
import { usaAir } from './usa-air';
import { usaArmy } from './usa-army';
import { usaMarines } from './usa-marines';
import { usaNavy } from './usa-navy';
import { usaStrategic } from './usa-strategic';

/** United States, Canada, European NATO members and Ukraine, as fielded in 2025-26. */
export const west: OrbatEntry[] = [...usaArmy, ...usaAir, ...usaNavy, ...usaMarines, ...usaStrategic];
