import { describe, expect, it, vi } from 'vitest';
import type { NationId, World } from '../src/core/types';
import { createSession } from '../src/scenarios';

/**
 * Civilians and domestic politics on whole scenarios. Bands cite their reference; "judgment"
 * marks bounds set by hand around a point estimate.
 */
vi.setConfig({ testTimeout: 900_000 });

interface Day {
  day: number;
  warSupport: Record<string, number>;
  losses: Record<string, number>;
}

function run(scenario: string, days: number): { world: World; daily: Day[] } {
  const s = createSession(scenario, 1);
  const daily: Day[] = [];
  const perDay = 24 / s.world.dtHours;
  for (let d = 1; d <= days; d++) {
    s.engine.run(s.world, perDay);
    const p = s.world.slices.politics.nations;
    daily.push({
      day: d,
      warSupport: Object.fromEntries(Object.values(s.world.nations).filter((n) => n.status === 'war').map((n) => [n.id, n.warSupport])),
      losses: Object.fromEntries(Object.entries(p).map(([n, x]) => [n, x.drivers.losses])),
    });
  }
  return { world: s.world, daily };
}

const UKRAINE_DAYS = 90;
let ukraine: ReturnType<typeof run> | undefined;
const ua = () => (ukraine ??= run('ukraine-2026', UKRAINE_DAYS));
const UKR = 'UKR' as NationId, RUS = 'RUS' as NationId;

describe('ukraine-2026 civilians, 90 days', () => {
  it('Poland, Romania and Moldova shelter Ukrainians in UNHCR numbers (late 2025: ~1M, ~180k, ~130k; judgment: x0.7 to x1.5)', () => {
    const h = ua().world.slices.civil.hosted;
    expect(h['UKR>POL']).toBeGreaterThan(700_000);
    expect(h['UKR>POL']).toBeLessThan(1_500_000);
    expect(h['UKR>ROU']).toBeGreaterThan(120_000);
    expect(h['UKR>ROU']).toBeLessThan(300_000);
    expect(h['UKR>MDA']).toBeGreaterThan(90_000);
    expect(h['UKR>MDA']).toBeLessThan(220_000);
  });

  it('new refugees cross first into Poland, then Romania, then Moldova, in the thousands a month (UNHCR 2025 border data; judgment)', () => {
    const c = ua().world.slices.civil.crossed;
    const month = (k: string) => ((c[k] ?? 0) / UKRAINE_DAYS) * 30;
    expect(month('UKR>POL')).toBeGreaterThan(month('UKR>ROU'));
    expect(month('UKR>ROU')).toBeGreaterThan(month('UKR>MDA'));
    expect(month('UKR>MDA')).toBeGreaterThan(500);
    expect(month('UKR>POL')).toBeGreaterThan(2_000);
    expect(month('UKR>POL')).toBeLessThan(60_000);
  });

  it('the front displaces tens of thousands a month, not the millions of 2022 (IOM 2025: IDPs steady near 3.7M; judgment: 5k-200k a month)', () => {
    const n = ua().world.slices.civil.nations[UKR];
    const newly = ((n.idps - 3_700_000 + n.refugees - 5_850_000) / UKRAINE_DAYS) * 30;
    expect(newly).toBeGreaterThan(5_000);
    expect(newly).toBeLessThan(200_000);
  });

  it('kills Ukrainian civilians at the OHCHR order of magnitude (2024-25: ~170-210 verified deaths a month; judgment: 60-1,500)', () => {
    const killed = (ua().world.slices.civil.nations[UKR].killed / UKRAINE_DAYS) * 30;
    expect(killed).toBeGreaterThan(60);
    expect(killed).toBeLessThan(1_500);
  });

  it('partisans in occupied Ukraine sabotage the Russian rail network (Atesh and HUR claims: several acts a month, 2023-25)', () => {
    const sabotage = ua().world.slices.civil.nations[RUS].sabotage;
    expect((sabotage / UKRAINE_DAYS) * 30).toBeGreaterThan(2);
    expect((sabotage / UKRAINE_DAYS) * 30).toBeLessThan(60);
  });
});

describe('taiwan-2027 politics, 120 days', () => {
  let taiwan: ReturnType<typeof run> | undefined;
  const tw = () => (taiwan ??= run('taiwan-2027', 120));

  it('heavy US losses erode US war support over the following months (Mueller 1973; Gartner and Segura 1998: the casualty rate itself costs support)', () => {
    const { daily } = tw();
    const us = daily.filter((d) => d.warSupport.USA !== undefined);
    expect(us.length).toBeGreaterThan(100);
    const early = Math.max(...us.slice(0, 15).map((d) => d.warSupport.USA));
    const later = us.filter((d) => d.day >= 75).map((d) => d.warSupport.USA);
    expect(Math.max(...later)).toBeLessThan(early - 0.08);
    // The casualty rate weighs on support for months, then fades as losses slow.
    expect(Math.min(...daily.filter((d) => d.day >= 30 && d.day <= 75).map((d) => d.losses.USA))).toBeLessThan(-0.03);
  });
});
