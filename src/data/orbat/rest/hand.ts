import { loadMap } from '../../load';
import type { OrbatEntry } from '../types';
import { algeria, ethiopia, morocco, nigeria, southAfrica } from './africa';
import { argentina, brazil, mexico } from './americas';
import { australia } from './australia';
import { armenia, azerbaijan, georgia, serbia } from './caucasus-balkans';
import { india } from './india';
import { israel } from './israel';
import { japan } from './japan';
import { southKorea } from './korea';
import { egypt, iraq, jordan, qatar, saudiArabia, syria, uae } from './middle-east';
import { pakistan } from './pakistan';
import { placeOnOwnLand } from './place';
import { indonesia, philippines, singapore, thailand, vietnam } from './southeast-asia';
import { taiwan } from './taiwan';

/** Hand-modelled forces for Asia-Pacific, the Middle East, Latin America, Africa, the Caucasus and Serbia. Turkey is in west/tur.ts. */
export const rest: OrbatEntry[] = placeOnOwnLand(loadMap(), [
  ...japan, ...southKorea, ...taiwan, ...australia, ...india, ...pakistan,
  ...philippines, ...vietnam, ...indonesia, ...singapore, ...thailand,
  ...israel, ...saudiArabia, ...uae, ...egypt, ...syria, ...iraq, ...jordan, ...qatar,
  ...brazil, ...argentina, ...mexico,
  ...algeria, ...morocco, ...nigeria, ...southAfrica, ...ethiopia,
  ...azerbaijan, ...armenia, ...georgia, ...serbia,
]);

export const REST_NATIONS: ReadonlySet<string> = new Set(rest.map((e) => e.nation));
