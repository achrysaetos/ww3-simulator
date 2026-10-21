import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { createWorld } from '../src/core/world';
import worldJson from '../src/data/generated/world.json';
import { loadMap } from '../src/data/load';
import { alliances, defenseObligations, nuclearForces, opinions, profiles, strategicProfile } from '../src/data/nations';
import { governmentListings } from '../src/data/nations/government';
import { opinionPairs } from '../src/data/nations/opinions';

const ISO3 = worldJson.nations.map((n) => n.iso3);
const n = (s: string) => s as NationId;

// FAS Status of World Nuclear Forces 2025, written out independently of src/data/nations/nuclear.ts.
const FAS_2025: Record<string, { stockpile: number; inventory: number; deployed: number }> = {
  RUS: { stockpile: 4309, inventory: 5459, deployed: 1718 },
  USA: { stockpile: 3700, inventory: 5177, deployed: 1770 },
  CHN: { stockpile: 600, inventory: 600, deployed: 24 },
  FRA: { stockpile: 290, inventory: 290, deployed: 280 },
  GBR: { stockpile: 225, inventory: 225, deployed: 120 },
  IND: { stockpile: 180, inventory: 180, deployed: 0 },
  PAK: { stockpile: 170, inventory: 170, deployed: 0 },
  ISR: { stockpile: 90, inventory: 90, deployed: 0 },
  PRK: { stockpile: 50, inventory: 50, deployed: 0 },
};

const NATO_32 =
  'ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR USA'.split(' ');

describe('nation profiles', () => {
  it('cover exactly the nations in world.json, each listed under one regime type', () => {
    expect(Object.keys(profiles).sort()).toEqual([...ISO3].sort());
    expect(Object.keys(strategicProfile).sort()).toEqual([...ISO3].sort());
    expect(new Set(governmentListings).size).toBe(governmentListings.length);
  });

  it('give the nine nuclear states their FAS 2025 arsenals and everyone else none', () => {
    const total = Object.values(FAS_2025).reduce((s, f) => s + f.inventory, 0);
    expect(total).toBe(12_241); // FAS 2025 global inventory
    for (const id of ISO3) {
      const fas = FAS_2025[id];
      const p = profiles[id].nuclear!;
      if (fas) {
        expect(p.warheads, id).toBe(fas.stockpile);
        expect(p.deployed, id).toBe(fas.deployed);
        expect(nuclearForces[id].inventory, id).toBe(fas.inventory);
        expect(p.doctrine, id).not.toBe('none');
      } else {
        expect(p, id).toEqual({ warheads: 0, deployed: 0, doctrine: 'none' });
      }
    }
    expect(profiles.CHN.nuclear!.doctrine).toBe('no_first_use');
    expect(profiles.IND.nuclear!.doctrine).toBe('no_first_use');
  });

  it('put all 32 NATO members, and only them, in NATO', () => {
    const inNato = ISO3.filter((id) => profiles[id].blocs!.includes('NATO')).sort();
    expect(inNato).toEqual([...NATO_32].sort());
    expect(inNato).toContain('FIN');
    expect(inNato).toContain('SWE');
    for (const outsider of ['UKR', 'GEO', 'AUT', 'IRL', 'CYP', 'MLT', 'CHE']) expect(profiles[outsider].blocs).not.toContain('NATO');
  });

  it('list only real nations in every alliance, without duplicates', () => {
    const ids = new Set(ISO3);
    expect(new Set(alliances.map((a) => a.id)).size).toBe(alliances.length);
    for (const a of alliances) {
      expect(new Set(a.members).size, a.id).toBe(a.members.length);
      for (const m of a.members) expect(ids.has(m), `${a.id}: ${m}`).toBe(true);
      for (const p of a.protectedOnly ?? []) expect(a.members, a.id).toContain(p);
      for (const g of a.nuclearGuarantors ?? []) expect(FAS_2025[g], `${a.id} guarantor ${g}`).toBeDefined();
      expect(a.commitment).toBeGreaterThanOrEqual(0);
      expect(a.commitment).toBeLessThanOrEqual(1);
      if (a.obligation !== 'none') expect(a.triggers.length, a.id).toBeGreaterThan(0);
    }
  });

  it('bind defenders according to each treaty, not to bare membership', () => {
    const ids = (nation: string, ally: string) => defenseObligations(n(nation), n(ally)).map((a) => a.id);
    expect(ids('USA', 'JPN')).toEqual(['US-JPN']);
    expect(ids('USA', 'TWN')).toEqual(['US-TWN-TRA']);
    expect(ids('TWN', 'USA')).toEqual([]); // the TRA protects Taiwan; Taiwan owes the US nothing
    expect(ids('PLW', 'USA')).toEqual([]);
    expect(ids('FRA', 'GRC').sort()).toEqual(['EU', 'FRA-GRC', 'NATO']);
    expect(ids('RUS', 'PRK')).toEqual(['RUS-PRK']);
    expect(ids('CHN', 'PRK')).toEqual(['CHN-PRK']);
    expect(ids('RUS', 'IRN')).toEqual([]); // 2025 partnership has no defense clause
    expect(ids('RUS', 'ARM')).toEqual([]); // Armenia froze CSTO participation
    expect(ids('USA', 'NZL')).toEqual([]); // ANZUS obligations to NZ suspended 1986
    expect(ids('CHN', 'RUS')).toEqual([]); // SCO and BRICS carry no defense duty
    expect(ids('PAK', 'SAU')).toEqual(['SAU-PAK']);
  });
});

describe('opinions', () => {
  const op = (a: string, b: string) => opinions[a]?.[b];

  it('are bounded integers toward real nations, never toward oneself', () => {
    const ids = new Set(ISO3);
    for (const [a, row] of Object.entries(opinions)) {
      expect(ids.has(a), a).toBe(true);
      expect(row[a], a).toBeUndefined();
      for (const [b, v] of Object.entries(row)) {
        expect(ids.has(b), `${a}->${b}`).toBe(true);
        expect(Number.isInteger(v)).toBe(true);
        expect(Math.abs(v), `${a}->${b}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('name each pair at most once in the source table', () => {
    const keys = opinionPairs.map(([a, b]) => [a, b].sort().join('|'));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]);
  });

  it('are symmetric within 35 points for every pair', () => {
    for (const [a, row] of Object.entries(opinions))
      for (const [b, v] of Object.entries(row)) {
        const back = op(b, a);
        expect(back, `${b}->${a} missing`).toBeDefined();
        expect(Math.abs(v - back!), `${a}<->${b}`).toBeLessThanOrEqual(35);
      }
  });

  it('are positive both ways between treaty allies, except named intra-alliance rivals', () => {
    const rivals = new Set(['GRC|TUR']);
    for (const a of alliances.filter((x) => ['NATO', 'Five Eyes', 'GCC'].includes(x.id) || x.obligation === 'bilateral_defense' || x.obligation === 'ambiguous'))
      for (const x of a.members)
        for (const y of a.members) {
          if (x === y || rivals.has([x, y].sort().join('|'))) continue;
          expect(op(x, y), `${a.id}: ${x}->${y}`).toBeGreaterThan(0);
        }
  });

  it('are negative both ways between regional rivals', () => {
    const pairs = 'IND-PAK IND-CHN ISR-IRN KOR-PRK GRC-TUR ARM-AZE SAU-IRN USA-RUS USA-CHN USA-IRN USA-PRK RUS-UKR CHN-TWN CHN-JPN ETH-ERI VEN-GUY RWA-COD DZA-MAR SRB-XKX';
    for (const p of pairs.split(' ')) {
      const [a, b] = p.split('-');
      expect(op(a, b), p).toBeLessThan(0);
      expect(op(b, a), p).toBeLessThan(0);
    }
  });
});

describe('strategic profiles', () => {
  it('keep every knob in 0..1 and every objective target real', () => {
    const ids = new Set(ISO3);
    for (const [id, s] of Object.entries(strategicProfile)) {
      for (const k of ['riskTolerance', 'casualtyTolerance', 'escalationPropensity', 'regimeStability', 'allianceReliability'] as const) {
        expect(s[k], `${id}.${k}`).toBeGreaterThanOrEqual(0);
        expect(s[k], `${id}.${k}`).toBeLessThanOrEqual(1);
      }
      expect(Object.keys(s.warAims).length, id).toBeGreaterThan(0);
      for (const ob of s.objectives) for (const t of ob.targets) expect(ids.has(t), `${ob.id}: ${t}`).toBe(true);
    }
  });

  it('give nuclear thresholds to the nine nuclear states only, with NFU states never using first', () => {
    for (const id of ISO3) expect(strategicProfile[id].nuclearThreshold !== null, id).toBe(id in FAS_2025);
    expect(strategicProfile.CHN.nuclearThreshold!.firstUse).toBe(false);
    expect(strategicProfile.IND.nuclearThreshold!.firstUse).toBe(false);
    expect(strategicProfile.RUS.nuclearThreshold!.firstUse).toBe(true);
    expect(strategicProfile.PAK.nuclearThreshold!.firstUse).toBe(true);
    // Pakistan and Russia threaten use over conventional territorial loss; the US declares no such threshold.
    expect(strategicProfile.RUS.nuclearThreshold!.coreLossShare).not.toBeNull();
    expect(strategicProfile.PAK.nuclearThreshold!.coreLossShare).not.toBeNull();
    expect(strategicProfile.USA.nuclearThreshold!.coreLossShare).toBeNull();
  });

  it('carry the named core objectives of the main actors', () => {
    const has = (id: string, kind: string, target?: string) =>
      strategicProfile[id].objectives.some((o) => o.kind === kind && o.priority === 1 && (!target || o.targets.includes(n(target))));
    expect(has('CHN', 'unify', 'TWN')).toBe(true);
    expect(has('RUS', 'annex', 'UKR')).toBe(true);
    expect(has('PRK', 'regime_survival')).toBe(true);
    expect(has('IRN', 'regime_survival')).toBe(true);
    expect(strategicProfile.IRN.objectives.some((o) => o.kind === 'proxy_influence')).toBe(true);
    expect(strategicProfile.RUS.objectives.some((o) => o.kind === 'buffer' && o.targets.includes(n('POL')))).toBe(true);
  });

  it('rate fragile and junta states less stable than consolidated democracies', () => {
    expect(strategicProfile.SOM.regimeStability).toBeLessThan(0.3);
    expect(strategicProfile.MLI.regimeStability).toBeLessThan(strategicProfile.NOR.regimeStability);
    expect(strategicProfile.PRK.casualtyTolerance).toBeGreaterThan(strategicProfile.JPN.casualtyTolerance);
  });
});

describe('military blocs', () => {
  const share = (a: string, b: string) => profiles[a].blocs!.filter((x) => profiles[b].blocs!.includes(x));
  it('open no doors through political or economic groupings', () => {
    expect(share('RUS', 'PAK')).toEqual([]);
    expect(share('RUS', 'UZB')).toEqual([]);
    expect(share('IND', 'PAK')).toEqual([]);
    expect(share('EGY', 'IRQ')).toEqual([]);
    for (const p of Object.values(profiles)) for (const b of ['SCO', 'BRICS', 'AU', 'ASEAN', 'Quad']) expect(p.blocs).not.toContain(b);
  });
  it('keep the defence treaties', () => {
    expect(share('RUS', 'KAZ')).toContain('CSTO');
    expect(share('USA', 'JPN')).toContain('US-JPN');
    expect(share('CHN', 'PRK')).toContain('CHN-PRK');
  });
});

describe('createWorld with nation profiles', () => {
  it('seeds governments, blocs, arsenals and hostile relations', () => {
    const world = createWorld(loadMap(), { profiles });
    expect(world.nations[n('USA')].nuclear.warheads).toBe(3700);
    expect(world.nations[n('DEU')].nuclear.warheads).toBe(0);
    expect(world.nations[n('PRK')].government).toBe('totalitarian');
    expect(world.nations[n('SWE')].blocs).toContain('NATO');
    expect(world.relations['RUS|USA'].opinion).toBeLessThan(-50);
    expect(world.relations['JPN|USA'].opinion).toBeGreaterThan(50);
    expect(world.relations['IND|PAK'].opinion).toBeLessThan(-50);
  });
});
