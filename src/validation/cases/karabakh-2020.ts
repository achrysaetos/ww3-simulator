import { personnelOf, supplyCapacityOf } from '../../core/forces';
import type { NationId, PlatformId } from '../../core/types';
import type { CaseRun, ValidationCase } from '../types';
import { battleLosses, holderAt, joiners, ratio } from './measure';
import { formationNamed, occupy, sessionOn, station } from './setup';

const WIKI = 'Wikipedia, "Second Nagorno-Karabakh War" (accessed 2026-10-21)';
const ORYX = 'Oryx, "The Fight For Nagorno-Karabakh: Documenting Losses" (2020), visually confirmed';

/**
 * Ground Armenian forces held from 1994 to September 2020: Nagorno-Karabakh and the seven districts
 * around it, coarse [lon, lat]. Only Azerbaijani-owned cells change hands, so the ring can run
 * generously over Armenia proper on the west.
 */
const HELD_1994: [number, number][] = [
  [45.9, 40.45], [46.6, 40.35], [47.0, 40.15], [47.0, 39.5], [47.05, 39.3], [46.5, 38.85], [46.2, 39.1], [45.9, 39.9],
];

/** Armenian corps standing in for the Artsakh Defence Army and the Armenian units with it, by sector. */
const DEFENDERS: [name: string, lat: number, lon: number][] = [
  ['1st Army Corps', 39.82, 46.75], // Stepanakert and Shusha
  ['2nd Army Corps', 39.3, 46.75], // the southern districts: Jabrayil, Zangilan, Qubadli, Hadrut
  ['5th Army Corps', 40.2, 46.75], // Martakert and the Aghdam front
  ['4th Army Corps', 40.2, 46.25], // Kalbajar
];

/**
 * The Artsakh Defence Army's heavy equipment, which the 2025 Armenian corps above lack: 186 tanks, 68 armoured vehicles
 * and 98 guns over 122 mm (DeRouen and Heo 2007, p. 151; Schmidt 2009, p. 12, via Wikipedia "Artsakh Defence Army").
 * Oryx confirmed 255 Armenian tanks lost in 2020, more than the corps' 80 alone could lose. Shared evenly over the corps.
 */
const ARTSAKH_KIT = { t72m1: 186, bmp1: 68, d30: 98 };

const ARM = 'ARM' as NationId, AZE = 'AZE' as NationId;

/** Land cells a nation owns on the map, whoever holds them. */
const cellsOf = (r: CaseRun, owner: NationId) => Array.from({ length: r.map.landCount }, (_, n) => n).filter((n) => r.map.owner[n] === owner);

/** The 44-day war over Nagorno-Karabakh, 27 September to 10 November 2020. */
export const karabakh2020: ValidationCase = {
  id: 'karabakh-2020',
  name: 'Second Nagorno-Karabakh War',
  period: '27 Sep - 10 Nov 2020',
  provenance: 'held-out',
  contamination:
    'No constant, band or AI rule cites this war. The TB2 catalog entry (src/data/catalog/air.ts) mentions 2020 in a comment without a number.',
  representation: [
    'peace-2027 moved to 27 September 2020, with the 1994-2020 line drawn by handing Armenia the Azerbaijani cells inside it, four Armenian corps fully dug in across its sectors, and Azerbaijan declaring war after mobilising.',
    'The region is five half-degree cells, so Shusha and Stepanakert share one; a cell counts as taken only when the whole of it falls.',
    'Both orders of battle are IISS 2025, not 2020: Azerbaijan is somewhat stronger and the Armenian corps carry fewer tanks than the 2020 Artsakh Defence Army.',
    'The engine treats the war as an attack on Armenia itself, so treaty calls can bring others in. The 2021 Turkey-Azerbaijan Shusha Declaration sits in static alliance data a run cannot remove, so a Turkish entry under it is an anachronism the others_join question counts against the model.',
  ].join(' '),
  days: 44,
  setup(seed) {
    const s = sessionOn('peace-2027', seed, '2020-09-27T00:00:00Z');
    const { world, map } = s;
    occupy(world, map, ARM, AZE, HELD_1994);
    for (const [name, lat, lon] of DEFENDERS) {
      const f = station(world, map, ARM, name, lat, lon);
      f.entrenchment = 1;
      const kit = Object.fromEntries(Object.entries(ARTSAKH_KIT).map(([pid, n]) => [pid, Math.round(n / DEFENDERS.length)])) as Record<PlatformId, number>;
      for (const [pid, n] of Object.entries(kit) as [PlatformId, number][]) f.equipment[pid] = (f.equipment[pid] ?? 0) + n;
      f.personnel += personnelOf(s.catalog, kit);
      f.supplyCapacity = supplyCapacityOf(s.catalog, f.equipment);
      f.supply = { ...f.supplyCapacity };
    }
    // Azerbaijan's present-day Shusha garrison stands on the 2020 eastern front instead, at Barda.
    formationNamed(world, AZE, 'Karabakh Garrison (Shusha, Khankendi)').node = map.nodeAt(40.37, 47.13);
    // Armenia under martial law from the first day, its reservists barred from leaving on 28 Sep; Azerbaijan's partial mobilisation decree, 28 Sep (the Wikipedia article above).
    world.pending.push(
      { type: 'set_mobilization', nation: ARM, level: 0.8 },
      { type: 'set_mobilization', nation: AZE, level: 0.5 },
      { type: 'declare_war', nation: AZE, target: ARM, reason: 'restore territorial integrity' },
    );
    return s;
  },
  questions: [
    {
      id: 'cells_taken',
      label: 'half-degree cells of the 1994 line Azerbaijan holds at the end',
      unit: 'cells',
      observed: {
        lo: 1,
        hi: 1,
        sources: [{ cite: `${WIKI}: by the ceasefire Azerbaijan had taken Jabrayil (9 Oct), Fuzuli (17 Oct), Agbend (22 Oct) and Shusha (8 Nov), about a third of Nagorno-Karabakh, mostly in the south; Kalbajar, Aghdam and Lachin were handed over afterwards. At this grid that is the southern cell only`, tag: 'independent' }],
      },
      baseline: { value: 0, label: 'persistence: the 1994 line holds' },
      measure: (r) => cellsOf(r, AZE).filter((n) => r.start.control[n] === ARM && r.end.control[n] === AZE).length,
    },
    {
      id: 'armenia_taken',
      label: 'cells of Armenia proper in foreign hands at the end',
      unit: 'cells',
      observed: {
        lo: 0,
        hi: 0,
        sources: [
          { cite: `${WIKI}: the fighting was over Nagorno-Karabakh and the districts around it, inside Azerbaijan's recognised borders`, tag: 'independent' },
          { cite: "Armenian government statements on the later incursions: ~40 km2 of Syunik (May 2021) and ~50 km2 in all by September 2022, far under one cell", tag: 'official' },
        ],
      },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => cellsOf(r, ARM).filter((n) => r.end.control[n] !== ARM).length,
    },
    {
      id: 'south_taken',
      label: 'the southern cell (Zangilan, Qubadli, Jabrayil) is Azerbaijani at the end',
      unit: 'yes=1',
      observed: { lo: 1, hi: 1, sources: [{ cite: `${WIKI}: Jabrayil 9 Oct, Agbend 22 Oct`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => (holderAt(r, 39.25, 46.75) === AZE ? 1 : 0),
    },
    {
      id: 'stepanakert_held',
      label: 'Stepanakert is still Armenian-held at the end',
      unit: 'yes=1',
      observed: { lo: 1, hi: 1, sources: [{ cite: `${WIKI}: Shusha fell on 8 Nov; Stepanakert stayed under Armenian control under the 10 Nov statement`, tag: 'independent' }] },
      baseline: { value: 1, label: 'persistence' },
      measure: (r) => (holderAt(r, 39.82, 46.75) === ARM ? 1 : 0),
    },
    {
      id: 'casualty_ratio',
      label: 'Armenian to Azerbaijani military casualties',
      unit: 'ratio',
      observed: {
        lo: 1.32,
        hi: 1.72,
        sources: [
          { cite: `${WIKI}: 3,825 Armenian and Artsakh servicemen killed (Armenia) against 2,906 Azerbaijani (Azerbaijan), 1.32`, tag: 'official' },
          { cite: `${WIKI}: Azerbaijan claimed over 5,000 Armenian dead by 28 Oct, 1.72`, tag: 'combatant' },
        ],
      },
      baseline: { value: 1, label: 'naive: an even exchange' },
      measure: (r) => ratio(r.metrics.nations.ARM?.casualties ?? 0, r.metrics.nations.AZE?.casualties ?? 0),
    },
    {
      id: 'tank_ratio',
      label: 'Armenian to Azerbaijani tanks knocked out',
      unit: 'ratio',
      observed: {
        lo: 3.3,
        hi: 4.9,
        sources: [{ cite: `${ORYX}: 255 Armenian tanks (146 destroyed, 6 damaged, 103 captured) against 62 Azerbaijani, 4.1; band is a fifth either side for what open sources missed`, tag: 'independent' }],
      },
      baseline: { value: 1, label: 'naive: an even exchange' },
      measure: (r) => ratio(battleLosses(r, ARM, ['mbt']), battleLosses(r, AZE, ['mbt'])),
    },
    {
      id: 'others_join',
      label: 'other states at war, beyond Azerbaijan and Armenia',
      unit: 'states',
      observed: { lo: 0, hi: 0, sources: [{ cite: `${WIKI}: Russia and the CSTO did not intervene; Turkey backed Azerbaijan without entering the war`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: nobody else joins' },
      measure: (r) => joiners(r.end, [AZE, ARM]).length,
    },
  ],
};
