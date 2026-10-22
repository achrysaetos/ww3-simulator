import type { Command, NationId, NodeId } from '../../core/types';
import type { ValidationCase } from '../types';
import { groundKm2On } from './measure';
import { formationNamed, sessionOn } from './setup';

const RUS = 'RUS' as NationId, UKR = 'UKR' as NationId;
const SUDZHA = { lat: 51.19, lon: 35.27 };
/** Russian manoeuvre units this close to Sudzha in the 2026 world came in after August 2024 to retake Kursk. */
const CLEARED_KM = 60;
/** Ukrainian brigades of the Sumy group sent across the border; the 80th and 82nd fought in Kursk in 2024 (ISW). */
const STRIKE_GROUP = [
  '80th Separate Air Assault Brigade',
  '82nd Separate Air Assault Brigade',
  '47th Separate Mechanized Brigade',
  '158th Separate Mechanized Brigade',
  '161st Separate Mechanized Brigade',
  '71st Separate Jaeger Brigade',
];
/** The two axes of August 2024: west on Korenevo, north-east on Bolshoye Soldatskoye. */
const AXES = [{ lat: 51.41, lon: 34.92 }, { lat: 51.35, lon: 35.52 }];

/** Ukraine's incursion into Kursk oblast, 6 August 2024, to the end of its advance three weeks on. */
export const kursk2024: ValidationCase = {
  id: 'kursk-2024',
  name: 'Kursk incursion',
  period: '6-27 Aug 2024',
  provenance: 'partly-tuned',
  contamination: [
    'The breakthrough rate (land.BREAKTHROUGH_KM_PER_DAY, 25-30 km in the first days) and the culmination depth (ai.MAX_DRIVE_CELLS) cite Kursk, so the speed of the first days is tuned on; the ground held after three weeks is not.',
    "Russia's nuclear threshold (src/data/nations/strategic.ts) is set above the Kursk loss because Kursk did not trigger use, so no nuclear use is tuned on.",
  ].join(' '),
  representation: [
    'ukraine-2026 moved to 6 August 2024. Russian manoeuvre units within 60 km of Sudzha go to Belgorod, about 110 km off, and the Korean expeditionary force goes home: the border was held by conscripts and border guards (ISW, August 2024), which the order of battle has no formation for.',
    'Ukraine is player-commanded with its AI delegate on; six Sumy-group brigades are ordered across on the two historical axes and the delegate runs everything else.',
    'The front from 2025, not 2024, stands everywhere else. Each Kursk cell is half a degree (~1,900 km2), so the score reads contest progress inside cells.',
  ].join(' '),
  days: 21,
  setup(seed) {
    const s = sessionOn('ukraine-2026', seed, '2024-08-06T00:00:00Z');
    const { world, map } = s;
    const sudzha = map.nodeAt(SUDZHA.lat, SUDZHA.lon);
    const belgorod = map.nodeAt(50.6, 36.6);
    for (const f of Object.values(world.formations))
      if (f.nation === RUS && f.kind === 'maneuver' && f.node < map.landCount && map.distanceKm(sudzha, f.node) <= CLEARED_KM) f.node = belgorod;
    formationNamed(world, 'PRK', 'KPA Expeditionary Force (Kursk)').node = map.nodeAt(39.03, 125.75);
    // The land system fortifies the whole Russo-Ukrainian border as the 2024-25 belts; Kursk's were dug after the incursion.
    const { fortified } = world.slices.land;
    for (let n = 0; n < map.landCount; n++) if (map.owner[n] === RUS && map.distanceKm(sudzha, n as NodeId) <= CLEARED_KM * 2) delete fortified[n];
    world.nations[UKR].controlledBy = 'human';
    const orders: Command[] = STRIKE_GROUP.map((name, i) => ({
      type: 'order',
      nation: UKR,
      formation: formationNamed(world, UKR, name).id,
      order: { posture: 'attack', target: map.nodeAt(AXES[i % 2].lat, AXES[i % 2].lon) },
      byPlayer: true,
    }));
    world.pending.push(...orders);
    return s;
  },
  questions: [
    {
      id: 'ukr_ground_km2',
      label: 'Russian ground Ukraine holds or has pushed across',
      unit: 'km2',
      observed: {
        lo: 800,
        hi: 1300,
        sources: [
          { cite: 'ISW, Russian Offensive Campaign Assessment, 12 Aug 2024: claimed Ukrainian advances cover ~800 km2, not all of it held (via Euromaidan Press, 13 Aug 2024)', tag: 'independent' },
          { cite: 'Gen. Syrskyi, 12 Aug 2024: ~1,000 km2; 27 Aug 2024: 1,294 km2 and 100 settlements', tag: 'combatant' },
        ],
      },
      baseline: { value: 0, label: 'persistence: the border holds' },
      measure: (r) => groundKm2On(r, UKR, RUS),
    },
    {
      id: 'nuclear_use',
      label: 'nuclear detonations',
      unit: 'detonations',
      provenance: 'tuned-on',
      observed: { lo: 0, hi: 0, sources: [{ cite: 'No nuclear use; Russia answered with conventional forces (ISW, August-September 2024)', tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => r.metrics.nuclearDetonations.length,
    },
  ],
};
