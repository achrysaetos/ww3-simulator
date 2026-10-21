import { describe, expect, it } from 'vitest';
import { loadMap } from '../src/data/load';
import { east } from '../src/data/orbat/east';
import { EAST_PLATFORM_CLASS, type ScaleClass } from '../src/data/orbat/east/platform-classes';
import type { OrbatEntry } from '../src/data/orbat/types';

const map = loadMap();
const nodeOf = (e: OrbatEntry) => map.nodeAt(e.base.lat, e.base.lon);
const NAVAL = new Set<OrbatEntry['kind']>(['surface_group', 'submarine']);
const isNaval = (e: OrbatEntry) => NAVAL.has(e.kind) || (e.kind === 'strategic' && e.echelon === 'flotilla');

function total(nation: string, cls: ScaleClass | ((id: string) => boolean)): number {
  const match = typeof cls === 'function' ? cls : (id: string) => EAST_PLATFORM_CLASS[id] === cls;
  let n = 0;
  for (const e of east) if (e.nation === nation) for (const [id, c] of Object.entries(e.equipment)) if (match(id)) n += c;
  return n;
}

// Published totals. IISS = The Military Balance 2025; CMPR = DoD China Military Power Report 2024;
// FAS = Nuclear Notebook 2025. Figures are as recalled from those sources and rounded; the
// orbat must land within 15% of each.
const REFERENCE: [nation: string, cls: ScaleClass, ref: number, source: string][] = [
  ['RUS', 'tank', 2700, 'IISS: active-unit MBT holdings after 2022-25 losses'],
  ['RUS', 'combat_aircraft', 1150, 'IISS: VKS + naval aviation combat-capable, less 2024-25 losses'],
  ['RUS', 'major_surface', 31, 'IISS: principal surface combatants incl. Steregushchiy-class'],
  ['RUS', 'submarine', 50, 'IISS'],
  ['RUS', 'icbm_launcher', 330, 'FAS: deployed ICBMs'],
  ['CHN', 'tank', 4800, 'IISS: MBT incl. reserve ZTZ-59 family'],
  ['CHN', 'combat_aircraft', 2400, 'CMPR: PLAAF + PLAN combat aircraft'],
  ['CHN', 'major_surface', 98, 'IISS: carriers, cruisers, destroyers, frigates'],
  ['CHN', 'submarine', 60, 'CMPR: 6 SSBN, 6 SSN, 48 SSK'],
  ['CHN', 'icbm_launcher', 550, 'CMPR: ICBM launchers incl. new silos'],
  ['PRK', 'tank', 3500, 'IISS'],
  ['PRK', 'combat_aircraft', 545, 'IISS'],
  ['PRK', 'submarine', 71, 'IISS'],
  ['PRK', 'major_surface', 4, 'IISS 2 Najin + 2 Choe Hyon launched 2025'],
  ['IRN', 'tank', 1513, 'IISS'],
  ['IRN', 'combat_aircraft', 265, 'IISS less June 2025 losses'],
  ['IRN', 'submarine', 19, 'IISS'],
  ['IRN', 'major_surface', 7, 'IISS'],
  ['BLR', 'tank', 500, 'IISS'],
  ['BLR', 'combat_aircraft', 58, 'IISS'],
  ['KAZ', 'tank', 350, 'IISS'],
  ['KGZ', 'tank', 150, 'IISS'],
  ['TJK', 'tank', 37, 'IISS'],
];

// CMPR 2024 launcher counts for the PLARF's theater-range missiles.
const PLARF: [label: string, tels: string[], ref: number][] = [
  ['IRBM', ['df26_tel'], 250],
  ['MRBM', ['df21_tel', 'df21d_tel', 'df17_tel'], 300],
  ['SRBM', ['df16_tel', 'df15_tel', 'df11_tel'], 200],
  ['GLCM', ['cj10_tel'], 150],
];

describe('eastern order of battle', () => {
  it('uses only platform ids in the class registry, and the registry lists nothing unused', () => {
    const used = new Set(east.flatMap((e) => Object.keys(e.equipment)));
    expect([...used].filter((id) => !(id in EAST_PLATFORM_CLASS))).toEqual([]);
    expect(Object.keys(EAST_PLATFORM_CLASS).filter((id) => !used.has(id))).toEqual([]);
  });

  it.each(REFERENCE)('%s %s total within 15 percent of %d (%s)', (nation, cls, ref) => {
    const n = total(nation, cls);
    expect(n).toBeGreaterThanOrEqual(ref * 0.85);
    expect(n).toBeLessThanOrEqual(ref * 1.15);
  });

  it.each(PLARF)('PLARF %s launchers within 15 percent of %d', (_, tels, ref) => {
    const n = total('CHN', (id) => tels.includes(id));
    expect(n).toBeGreaterThanOrEqual(ref * 0.85);
    expect(n).toBeLessThanOrEqual(ref * 1.15);
  });

  it('places every land and air formation on a land cell and every naval one at a coast', () => {
    const misplaced = east.filter((e) => {
      const n = nodeOf(e);
      return isNaval(e) ? !(map.isSea(n) || map.isCoastal(n)) : map.isSea(n);
    });
    expect(misplaced.map((e) => `${e.nation} ${e.name} @ ${e.base.lat},${e.base.lon}`)).toEqual([]);
  });

  it('keeps each force in its own territory, or where it is really deployed', () => {
    const allowed: Record<string, string[]> = {
      RUS: ['RUS', 'UKR', 'BLR', 'ARM', 'GEO', 'TJK', 'KGZ'], // occupied Ukraine, Abkhazia/S. Ossetia, foreign bases
      PRK: ['PRK', 'RUS'], // Kursk expeditionary force
      CHN: ['CHN'],
      IRN: ['IRN'], BLR: ['BLR'], KAZ: ['KAZ'], KGZ: ['KGZ'], TJK: ['TJK'],
    };
    const wrong = east.filter((e) => !isNaval(e) && !allowed[e.nation].includes(map.owner[nodeOf(e)]));
    expect(wrong.map((e) => `${e.nation} ${e.name} in ${map.owner[nodeOf(e)]}`)).toEqual([]);
  });

  it('commits most Russian manoeuvre strength to Ukraine and the Kursk border, not to garrisons', () => {
    const tanksIn = (pred: (owner: string) => boolean) =>
      east.filter((e) => e.nation === 'RUS' && e.kind === 'maneuver' && pred(map.owner[nodeOf(e)]))
        .reduce((s, e) => s + Object.entries(e.equipment).filter(([id]) => EAST_PLATFORM_CLASS[id] === 'tank').reduce((a, [, c]) => a + c, 0), 0);
    const atFront = tanksIn((o) => o === 'UKR');
    const kursk = east.filter((e) => e.nation === 'RUS' && e.base.name.startsWith('Kursk-Sumy'));
    expect(kursk.length).toBeGreaterThanOrEqual(8);
    expect(atFront).toBeGreaterThan(tanksIn((o) => o !== 'UKR'));
    const kaliningrad = east.find((e) => e.name.startsWith('18th Guards Motor Rifle Division'))!;
    expect(map.owner[nodeOf(kaliningrad)]).toBe('RUS');
  });

  it('has unique formation names within each nation', () => {
    const seen = new Set<string>();
    const dupes = east.filter((e) => {
      const key = `${e.nation}|${e.name}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    expect(dupes.map((e) => e.name)).toEqual([]);
  });

  it('holds positive whole-number equipment and in-range readiness and experience', () => {
    const bad = east.filter((e) =>
      Object.keys(e.equipment).length === 0 ||
      Object.values(e.equipment).some((n) => !Number.isInteger(n) || n <= 0) ||
      [e.readiness, e.experience].some((v) => v !== undefined && (v < 0 || v > 1)));
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it('models the strategic triads: Russian and Chinese SSBNs, Russian heavy bombers, no deployed Sarmat', () => {
    expect(total('RUS', (id) => ['borei', 'borei_a', 'delta_iv'].includes(id))).toBe(13);
    expect(total('CHN', (id) => id === 'type094')).toBe(6);
    expect(total('RUS', (id) => id === 'tu160' || id === 'tu95ms')).toBeGreaterThan(50);
    expect(total('RUS', (id) => id === 'sarmat_silo')).toBe(0);
  });
});
