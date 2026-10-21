import type { OrbatEntry } from '../types';
import { balkans } from './balkans';
import { baltics } from './baltics';
import { benelux } from './benelux';
import { can } from './can';
import { centralEurope } from './central-europe';
import { deu } from './deu';
import { fra } from './fra';
import { gbr } from './gbr';
import { grc } from './grc';
import { iberia } from './iberia';
import { ita } from './ita';
import { nordic } from './nordic';
import { pol } from './pol';
import { tur } from './tur';
import { ukr } from './ukr';
import { usaAir } from './usa-air';
import { usaArmy } from './usa-army';
import { usaMarines } from './usa-marines';
import { usaNavy } from './usa-navy';
import { usaStrategic } from './usa-strategic';

/** United States, Canada, European NATO members and Ukraine, as fielded in 2025-26. */
export const west: OrbatEntry[] = [
  ...usaArmy,
  ...usaAir,
  ...usaNavy,
  ...usaMarines,
  ...usaStrategic,
  ...can,
  ...gbr,
  ...fra,
  ...deu,
  ...ita,
  ...iberia,
  ...pol,
  ...ukr,
  ...nordic,
  ...benelux,
  ...baltics,
  ...centralEurope,
  ...balkans,
  ...grc,
  ...tur,
];
