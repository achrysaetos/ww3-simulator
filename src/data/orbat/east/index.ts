import type { OrbatEntry } from '../types';
import { blr } from './blr';
import { chnPlaa } from './chn-plaa';
import { chnPlaaf } from './chn-plaaf';
import { chnPlan } from './chn-plan';
import { chnPlarf } from './chn-plarf';
import { csto } from './csto';
import { irn } from './irn';
import { prk } from './prk';
import { rusAerospace } from './rus-aerospace';
import { rusAirDefense } from './rus-airdefense';
import { rusGround } from './rus-ground';
import { rusNavy } from './rus-navy';
import { rusStrategic } from './rus-strategic';

/**
 * Russia, China, North Korea, Iran, Belarus and the other CSTO members as fielded in late 2025.
 * Base coordinates are the real garrisons, nudged where needed into the nearest 1-degree map
 * cell that is land of the right country (e.g. Grodno, Kaesong, Sevastopol, the Kurils),
 * because the map resolves a point to its cell.
 */
export const east: OrbatEntry[] = [
  ...rusGround, ...rusAirDefense, ...rusAerospace, ...rusNavy, ...rusStrategic,
  ...chnPlaa, ...chnPlaaf, ...chnPlan, ...chnPlarf,
  ...prk, ...irn, ...blr, ...csto,
];
