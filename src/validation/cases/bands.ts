import { createSession } from '../../scenarios';
import type { CaseRun, ValidationCase } from '../types';
import { battleLosses, groundKm2On, netCellsTaken } from './measure';

const perDay = (r: CaseRun, x: number) => x / r.days;
const tanksPerDay = (n: string) => (r: CaseRun) => perDay(r, battleLosses(r, n, ['mbt']));

/**
 * Realism bands the ground model was tuned on, run as ensembles over seeds and the tagged params
 * (tests/realism-ground.realism.test.ts asserts them). They are scored like the held-out cases so a
 * reader sees them side by side, marked tuned-on.
 */
export const ukraine2026Bands: ValidationCase = {
  id: 'ukraine-2026-60d',
  name: 'Russo-Ukrainian War, ground bands',
  period: '60 days from the late-2025 line',
  provenance: 'tuned-on',
  contamination: 'The calibration case for ground combat: the front law, kill-zone and firepower constants are fitted to these bands.',
  representation: 'ukraine-2026 as published, 60 days.',
  days: 60,
  setup: (seed) => createSession('ukraine-2026', seed),
  questions: [
    {
      id: 'rus_net_cells',
      label: 'cells of Ukraine Russia takes, net',
      unit: '1-degree cells',
      observed: { lo: 0, hi: 2, sources: [{ cite: 'ISW, DeepState: 3,500-5,000 km2 a year in 2024-25, under one 1-degree cell in 60 days; 0-2 allows for a cell boundary inside a slow advance', tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => netCellsTaken(r, 'RUS', ['UKR'], true),
    },
    {
      id: 'rus_km2_per_year',
      label: 'Russian gains in Ukraine at the 60-day pace, counting partial advances (reported, not asserted)',
      unit: 'km2/year',
      observed: { lo: 3500, hi: 5000, sources: [{ cite: 'ISW, DeepState: 3,500-5,000 km2 a year in 2024-25', tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => (groundKm2On(r, 'RUS', 'UKR') * 365) / r.days,
    },
    {
      id: 'rus_casualties_per_day',
      label: 'Russian personnel casualties a day',
      unit: 'people/day',
      observed: {
        lo: 500,
        hi: 2000,
        sources: [
          { cite: 'UK MoD 2024-25: ~1,000-1,500 killed and wounded a day; band widened for crew and dismount casualties', tag: 'official' },
          { cite: 'Ukrainian General Staff daily tallies', tag: 'combatant' },
        ],
      },
      baseline: { value: 0, label: 'persistence: no fighting' },
      measure: (r) => perDay(r, r.metrics.nations.RUS?.casualties ?? 0),
    },
    {
      id: 'ukr_minus_rus_casualties',
      label: 'Ukrainian minus Russian casualties a day (below 0: Russia loses more)',
      unit: 'people/day',
      observed: { lo: -Infinity, hi: -Number.MIN_VALUE, sources: [{ cite: 'UK MoD 2024-25: the attacker loses more', tag: 'official' }] },
      baseline: { value: 0, label: 'naive: an even exchange' },
      measure: (r) => perDay(r, (r.metrics.nations.UKR?.casualties ?? 0) - (r.metrics.nations.RUS?.casualties ?? 0)),
    },
    {
      id: 'rus_tanks_per_day',
      label: 'Russian tanks knocked out a day',
      unit: 'tanks/day',
      observed: { lo: 2, hi: 8, sources: [{ cite: 'Oryx 2024: about 3-5 Russian tanks a day, visually confirmed', tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: no fighting' },
      measure: tanksPerDay('RUS'),
    },
    {
      id: 'ukr_tanks_per_day',
      label: 'Ukrainian tanks knocked out a day',
      unit: 'tanks/day',
      observed: { lo: 0.5, hi: 8, sources: [{ cite: 'Oryx 2024: roughly a quarter of the Russian rate', tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: no fighting' },
      measure: tanksPerDay('UKR'),
    },
    {
      id: 'ukr_minus_rus_tanks',
      label: 'Ukrainian minus Russian tanks knocked out a day (below 0: Russia loses more)',
      unit: 'tanks/day',
      observed: { lo: -Infinity, hi: -Number.MIN_VALUE, sources: [{ cite: 'Oryx 2024: Ukraine, defending, lost about a quarter as many', tag: 'independent' }] },
      baseline: { value: 0, label: 'naive: an even exchange' },
      measure: (r) => tanksPerDay('UKR')(r) - tanksPerDay('RUS')(r),
    },
    {
      id: 'capitulations',
      label: 'capitulations',
      unit: 'nations',
      observed: { lo: 0, hi: 0, sources: [{ cite: 'Neither side was near collapse in 2024-25 (ISW)', tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => r.metrics.capitulations.length,
    },
  ],
};

export const baltic2027Bands: ValidationCase = {
  id: 'baltic-2027-21d',
  name: 'Baltic gambit, ground band',
  period: '21 days from the opening',
  provenance: 'tuned-on',
  contamination: 'A judgment band from RAND 2016 adjusted for the 2027 posture; the AI culmination depth and attack ratio were set with it in view.',
  representation: 'baltic-2027 as published, 21 days.',
  days: 21,
  setup: (seed) => createSession('baltic-2027', seed),
  questions: [
    {
      id: 'baltic_cells',
      label: 'Baltic cells Russia and Belarus take',
      unit: '1-degree cells',
      observed: {
        lo: 1,
        hi: 6,
        sources: [{ cite: 'RAND (Shlapak and Johnson, 2016): Tallinn or Riga in 36-60 hours against 2016 posture; judgment band for the thicker 2027 defence: ground taken but no collapse', tag: 'independent' }],
      },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => netCellsTaken(r, 'RUS', ['EST', 'LVA', 'LTU'], true) + netCellsTaken(r, 'BLR', ['EST', 'LVA', 'LTU'], true),
    },
  ],
};
