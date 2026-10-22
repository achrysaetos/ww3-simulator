import { describe, expect, it } from 'vitest';
import type { PlatformClass } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { KIT_CLASS, MUNITION_KIT, rest } from '../src/data/orbat/rest';
import { placeOnOwnLand } from '../src/data/orbat/rest/place';
import type { OrbatEntry } from '../src/data/orbat/types';

const CATEGORY: Partial<Record<PlatformClass, keyof Totals>> = {
  mbt: 'tanks',
  fighter: 'air', multirole: 'air', attack_aircraft: 'air', bomber: 'air',
  // IISS "principal surface combatants" without corvettes.
  carrier: 'surface', cruiser: 'surface', destroyer: 'surface', frigate: 'surface',
  ssk: 'subs', ssn: 'subs', ssgn: 'subs', ssbn: 'subs',
};
type Totals = { tanks: number; air: number; surface: number; subs: number };

/**
 * Active inventories per IISS Military Balance 2025 as read by the author (tanks, combat-
 * capable fixed-wing aircraft incl. armed trainers, carriers+destroyers+frigates, submarines
 * excl. midgets). Exceptions: India's air figure drops the MiG-21s retired in 2025; Syria's
 * row is an estimate for the post-Assad army because IISS 2025 predates the collapse.
 */
const IISS: Record<string, [tanks: number, air: number, surface: number, subs: number]> = {
  JPN: [365, 320, 54, 24],
  KOR: [2150, 410, 29, 19],
  TWN: [1010, 420, 22, 4],
  AUS: [59, 96, 9, 6],
  IND: [3740, 620, 31, 19],
  PAK: [2540, 450, 10, 5],
  PHL: [0, 20, 2, 0],
  VNM: [1334, 74, 4, 6],
  IDN: [103, 100, 6, 4],
  SGP: [96, 100, 6, 4],
  THA: [370, 110, 7, 0],
  ISR: [400, 310, 0, 5],
  SAU: [910, 300, 7, 0],
  ARE: [340, 137, 0, 0],
  EGY: [2500, 550, 11, 8],
  SYR: [150, 0, 0, 0],
  IRQ: [390, 85, 0, 0],
  JOR: [180, 45, 0, 0],
  LBN: [334, 6, 0, 0],
  QAT: [62, 96, 0, 0],
  BRA: [290, 150, 5, 6],
  ARG: [230, 30, 4, 2],
  MEX: [0, 35, 1, 0],
  DZA: [1500, 150, 5, 6],
  MAR: [650, 88, 6, 0],
  NGA: [150, 45, 0, 0],
  ZAF: [34, 50, 4, 3],
  ETH: [400, 19, 0, 0],
  AZE: [445, 31, 1, 0],
  ARM: [100, 17, 0, 0],
  GEO: [120, 3, 0, 0],
  SRB: [230, 29, 0, 0],
};

function totals(entries: OrbatEntry[]): Totals {
  const t: Totals = { tanks: 0, air: 0, surface: 0, subs: 0 };
  for (const e of entries)
    for (const [id, n] of Object.entries(e.equipment)) {
      const cat = CATEGORY[KIT_CLASS[id as keyof typeof KIT_CLASS]];
      if (cat) t[cat] += n;
    }
  return t;
}

const byNation = (iso: string) => rest.filter((e) => e.nation === iso);
const has = (iso: string, id: string) => byNation(iso).some((e) => (e.equipment[id] ?? 0) > 0);
const LAND_AIR = new Set<OrbatEntry['kind']>(['maneuver', 'artillery', 'air_defense', 'missile', 'air_wing', 'strategic', 'logistics']);

describe('hand-modelled ORBAT: Asia-Pacific, Middle East, rest of world', () => {
  it('models exactly the 32 assigned nations (Turkey is in orbat/west)', () => {
    expect(new Set(rest.map((e) => e.nation))).toEqual(new Set(Object.keys(IISS)));
  });

  it.each(Object.keys(IISS))('%s totals are within 15%% of IISS 2025', (iso) => {
    const [tanks, air, surface, subs] = IISS[iso];
    const t = totals(byNation(iso));
    const near = (actual: number, expected: number) => Math.abs(actual - expected) <= Math.max(2, expected * 0.15);
    expect({ iso, ...t, ok: near(t.tanks, tanks) && near(t.air, air) && near(t.surface, surface) && near(t.subs, subs) })
      .toEqual({ iso, ...t, ok: true });
  });

  it('uses only registered platform and munition ids, in positive whole numbers', () => {
    for (const e of rest) {
      for (const [id, n] of Object.entries(e.equipment)) {
        expect(KIT_CLASS, `${e.nation} ${e.name}`).toHaveProperty(id);
        expect(Number.isInteger(n) && n > 0, `${e.name} ${id}=${n}`).toBe(true);
      }
      for (const [id, n] of Object.entries(e.extraMagazine ?? {})) {
        expect(MUNITION_KIT as readonly string[]).toContain(id);
        expect(n).toBeGreaterThan(0);
      }
      expect(e.source, e.name).toBeTruthy();
    }
  });

  it('puts every land and air formation on land its own nation holds', () => {
    const map = loadMap();
    for (const e of rest.filter((x) => LAND_AIR.has(x.kind))) {
      const node = map.nodeAt(e.base.lat, e.base.lon);
      expect({ name: e.name, land: node < map.landCount, owner: map.owner[node] }).toEqual({ name: e.name, land: true, owner: e.nation });
    }
  });

  it('moves an offshore garrison onto its own land but leaves a fleet in its real port', () => {
    const map = loadMap();
    const dongyin: OrbatEntry = { nation: 'TWN', name: 'Dongyin', kind: 'maneuver', echelon: 'brigade', base: { name: 'Dongyin', lat: 26.37, lon: 120.49 }, equipment: { infantry_squad: 1 } };
    const fleet: OrbatEntry = { ...dongyin, name: 'Fleet', kind: 'surface_group', base: { name: 'Zuoying', lat: 22.69, lon: 120.27 } };
    expect(map.owner[map.nodeAt(26.37, 120.49)]).not.toBe('TWN');
    const [moved, kept] = placeOnOwnLand(map, [dongyin, fleet]);
    expect(map.owner[map.nodeAt(moved.base.lat, moved.base.lon)]).toBe('TWN');
    expect(moved.base.name).toBe('Dongyin');
    expect(kept.base).toEqual(fleet.base);
  });

  it('fields nuclear delivery systems only for Israel, India and Pakistan', () => {
    const strategic = new Set(rest.filter((e) => e.kind === 'strategic').map((e) => e.nation));
    expect(strategic).toEqual(new Set(['ISR', 'IND', 'PAK']));
    const nuclearClasses = new Set<PlatformClass>(['icbm_silo', 'icbm_mobile', 'tel_irbm', 'ssbn']);
    const holders = new Set(rest.filter((e) => Object.keys(e.equipment).some((id) => nuclearClasses.has(KIT_CLASS[id as keyof typeof KIT_CLASS]))).map((e) => e.nation));
    expect(holders).toEqual(new Set(['ISR', 'IND', 'PAK']));
  });

  it('includes Israel’s Jericho III, Dolphin SLCMs, air-delivered bombs and layered missile defence', () => {
    expect(has('ISR', 'jericho3_silo')).toBe(true);
    const dolphins = byNation('ISR').find((e) => e.kind === 'submarine')!;
    expect(dolphins.equipment.dolphin1 + dolphins.equipment.dolphin2).toBe(5);
    expect(dolphins.extraMagazine?.popeye_turbo_slcm).toBeGreaterThan(0);
    // ~90 warheads (SIPRI 2025): one per Jericho launcher, plus bombs and SLCMs.
    const isr = byNation('ISR');
    const warheads = isr.reduce((s, e) => s + (e.equipment.jericho3_silo ?? 0) + (e.equipment.jericho2_tel ?? 0) + (e.extraMagazine?.nuclear_gravity_bomb ?? 0) + (e.extraMagazine?.popeye_turbo_slcm ?? 0), 0);
    expect(warheads).toBeGreaterThanOrEqual(80);
    expect(warheads).toBeLessThanOrEqual(100);
    for (const id of ['iron_dome_launcher', 'davids_sling_launcher', 'arrow3_launcher', 'arrow2_launcher']) expect(has('ISR', id), id).toBe(true);
    expect(has('ISR', 'patriot_pac3')).toBe(false); // retired April 2024
  });

  it('includes India’s Agni-V and Arihant SSBNs and Pakistan’s Shaheen-III, Ababeel, Babur and Nasr', () => {
    for (const id of ['agni5_tel', 'arihant', 'brahmos_tel', 's400_launcher']) expect(has('IND', id), id).toBe(true);
    for (const id of ['shaheen3_tel', 'ababeel_tel', 'babur_tel', 'nasr_tel']) expect(has('PAK', id), id).toBe(true);
  });

  it('leaves post-Assad Syria without an air force, navy or strategic missiles', () => {
    const syr = byNation('SYR');
    expect(syr.some((e) => ['air_wing', 'surface_group', 'submarine', 'missile', 'strategic'].includes(e.kind))).toBe(false);
    expect(syr.reduce((s, e) => s + (e.personnel ?? 0), 0)).toBeGreaterThan(100_000);
  });
});
