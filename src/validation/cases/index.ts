import type { ValidationCase } from '../types';
import { karabakh2020 } from './karabakh-2020';
import { kursk2024 } from './kursk-2024';
import { sindoor2025 } from './sindoor-2025';
import { twelveDayWar2025 } from './twelve-day-war-2025';

/** Historical cases scored against a naive baseline by `npm run validate`, oldest first. */
export const CASES: readonly ValidationCase[] = [karabakh2020, kursk2024, sindoor2025, twelveDayWar2025];

export function caseById(id: string): ValidationCase {
  const c = CASES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown validation case ${id}; try ${CASES.map((x) => x.id).join(', ')}`);
  return c;
}
