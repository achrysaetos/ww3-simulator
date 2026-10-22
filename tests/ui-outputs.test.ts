import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { OutputsRecorder, sampleOutputs, type Outputs, type OutputSample } from '../src/outputs';
import { createSession } from '../src/scenarios';
import { Race } from '../src/ui/outputs/OutputsPanel';
import { outputsView, type OutputsView } from '../src/ui/outputs/view';

const IRN = 'IRN' as NationId;

describe('War Cost drawer for Iran at day 10 of gulf-2027', () => {
  let outputs: Outputs, view: OutputsView, first: OutputSample, last: OutputSample;

  beforeAll(() => {
    const s = createSession('gulf-2027', 1);
    s.world.nations[IRN].controlledBy = 'human';
    const rec = new OutputsRecorder(s.catalog);
    rec.observe(s.world);
    first = sampleOutputs(s.world, s.catalog);
    for (let i = 0; i < 40; i++) {
      s.engine.step(s.world);
      rec.observe(s.world);
    }
    last = sampleOutputs(s.world, s.catalog);
    outputs = rec.outputs(s.world, s.map);
    view = outputsView(s.world, outputs, IRN);
  }, 300_000);

  it("lists where the viewer's own refugees went, not the world's largest hosts", () => {
    const abroad = outputs.nations[IRN].humanitarian.refugees;
    const shown = view.hosts.reduce((a, h) => a + h.refugees, 0);
    expect(outputs.hosts.reduce((a, h) => a + h.refugees, 0)).toBeGreaterThan(abroad + 1e5);
    expect(shown).toBeLessThanOrEqual(abroad + 1);
  });

  it('reads the burn as a rate over the days actually elapsed, and says so', () => {
    const cruise = view.nations[IRN].race.find((r) => r.item === 'cruise')!;
    const usedInTenDays = (first.nations[IRN].stock.cruise ?? 0) + (last.nations[IRN].produced.cruise ?? 0) - (first.nations[IRN].produced.cruise ?? 0) - (last.nations[IRN].stock.cruise ?? 0);
    expect(usedInTenDays).toBeGreaterThan(10);
    expect(cruise.usedPerMonth! / 3).toBeCloseTo(usedInTenDays, -1);
    const net = (cruise.usedPerMonth! - cruise.producedPerMonth - cruise.aidPerMonth) / 30;
    expect(cruise.zeroDay! - view.day).toBeCloseTo(cruise.stock! / net, 0);

    const html = renderToStaticMarkup(createElement(Race, { view }));
    expect(html).toContain(`used ${Math.round(cruise.usedPerMonth!)}<small>/mo</small>`);
    expect(html).toContain('from the last 10 days');
  });
});
