import { aliases as air } from './aliases/air';
import { aliases as landArmor } from './aliases/land_armor';
import { aliases as landFires } from './aliases/land_fires';
import { aliases as naval } from './aliases/naval';

/** ORBAT equipment ids that name a catalog entry differently. */
export const ALIASES: Record<string, string> = { ...landArmor, ...landFires, ...air, ...naval };
