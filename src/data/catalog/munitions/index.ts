import type { Munition } from '../../../core/types';
import { toMunition } from '../build';
import { airMunitions } from './air';
import { airDefenseMunitions } from './air_defense';
import { landMunitions } from './land';
import { navalMunitions } from './naval';
import { strategicMunitions } from './strategic';
import { strikeMunitions } from './strike';

const specs = [...strategicMunitions, ...strikeMunitions, ...airDefenseMunitions, ...airMunitions, ...landMunitions, ...navalMunitions] as const;

/** Every munition id in the catalog; platform loadouts are typed against it. */
export type MunitionKey = (typeof specs)[number]['id'];

export const munitions: Munition[] = specs.map(toMunition);
