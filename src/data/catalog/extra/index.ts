import * as air from './air';
import * as landArmor from './land_armor';
import * as landFires from './land_fires';
import * as naval from './naval';

const slices = [landArmor, landFires, air, naval];
export const extraPlatforms = slices.flatMap((s) => s.platforms);
export const extraMunitions = slices.flatMap((s) => s.munitions);
