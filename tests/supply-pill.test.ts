import { describe, expect, it } from 'vitest';
import { id, testWorld } from '../src/testkit';
import { logistics } from '../src/systems/logistics';
import { checkCommand } from '../src/ui/commands';
import { supplyWords } from '../src/ui/drag/supply';

describe('supply priority on the page', () => {
  it('passes a priority or a clear through the command boundary, rebuilt, and refuses a bad node', () => {
    const w = testWorld([logistics]);
    const check = (c: unknown) => checkCommand(w.world, w.map, w.catalog, id.nation('UKR'), c);
    expect(check({ type: 'supply_priority', nation: 'UKR', node: 12.7, extra: 1 })).toEqual({ ok: true, command: { type: 'supply_priority', nation: 'UKR', node: 12 } });
    expect(check({ type: 'supply_priority', nation: 'UKR', node: null })).toEqual({ ok: true, command: { type: 'supply_priority', nation: 'UKR', node: null } });
    expect(check({ type: 'supply_priority', nation: 'UKR', node: w.map.size + 1 })).toMatchObject({ ok: false });
    expect(check({ type: 'supply_priority', nation: 'RUS', node: 12 })).toMatchObject({ ok: false });
  });

  it('words the pill from the preview', () => {
    const e = { here: 3, rest: 20, short: 3000, before: 1000, after: 2000, restCut: 0.1 };
    expect(supplyWords(e, 'Pokrovsk')).toEqual({
      kicker: 'Supply priority · Pokrovsk', primary: 'Refilled in 1.5 days, not 3.0 days', secondary: '+1.0k t a day to 3 units here · 10% less lift for 20 units elsewhere', tone: 'good',
    });
    expect(supplyWords({ ...e, short: 900 }, 'x')).toMatchObject({ primary: 'Units here refill within a day already', tone: 'even' });
    expect(supplyWords({ ...e, after: 1200 }, 'x')).toMatchObject({ primary: 'Little to gain: units here take what they can', tone: 'even' });
    expect(supplyWords({ ...e, short: 0 }, 'x')).toMatchObject({ primary: 'Units here are full: nothing to send', tone: 'even' });
    expect(supplyWords(null, 'x')).toMatchObject({ tone: 'refused' });
    expect(supplyWords(undefined, 'x')).toMatchObject({ tone: 'wait' });
  });
});
