import { describe, expect, it } from 'vitest';
import { HEADLINE_FIELDS, IISS_HEADLINES, nationTotals, withinHeadline } from '../src/data/orbat/headlines';
import { east } from '../src/data/orbat/east';
import { rest } from '../src/data/orbat/rest';
import { west } from '../src/data/orbat/west';
import { createSession } from '../src/scenarios';

/** The merged world every scenario starts from, as the player sees it: all modules together. */
const session = createSession('peace-2027', 1);
const totals = nationTotals(session.world, session.catalog);
const handModelled = [...new Set([...west, ...east, ...rest].map((e) => e.nation))].sort();

describe('merged order of battle against IISS headline figures', () => {
  it('has a headline row for every hand-modelled nation, and none for a generated one', () => {
    expect(Object.keys(IISS_HEADLINES).sort()).toEqual(handModelled);
  });

  it.each(handModelled)('%s fields its tanks, combat aircraft, surface combatants, submarines and personnel', (nation) => {
    const t = totals.get(nation as never)!;
    const off = HEADLINE_FIELDS.filter((f) => !withinHeadline(f, t[f], nation)).map((f) => `${f}: ${t[f]} vs IISS ${IISS_HEADLINES[nation][f]}`);
    expect(off).toEqual([]);
  });

  it('loads Turkey and Armenia once', () => {
    const tur = totals.get('TUR' as never)!, arm = totals.get('ARM' as never)!;
    expect(tur.tanks).toBeLessThan(2800);
    expect(tur.submarines).toBe(12);
    expect(arm.personnel).toBeLessThan(55_000);
  });
});
