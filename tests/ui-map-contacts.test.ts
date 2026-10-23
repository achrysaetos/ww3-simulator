import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { CURRENT_CONFIDENCE } from '../src/systems/intel/view';
import { ContactPanel } from '../src/ui/map/ContactPanel';
import { AGE_TAG_HOURS, contactAlpha, contactLabel, contactRing, isStale } from '../src/ui/map/contacts';
import { playWithStaff } from './staff-mirror';

const N = (s: string) => s as NationId;
const palette = { of: () => ({ css: '#c33' }) } as never;
const open: ReturnType<typeof playWithStaff>[] = [];
afterEach(() => {
  for (const g of open.splice(0)) g.quit();
});

describe('contacts on the map: where intelligence last fixed a foreign formation, how far off, and how long ago', () => {
  it('rings a fix by its error radius, always for the selected contact, and greys it once intel would no longer plan on it', () => {
    const fresh = { ageHours: 6, confidence: 0.9, errorKm: 40 };
    expect(contactRing(fresh, 2, false)?.radiusPx).toBe(20);
    expect(contactRing(fresh, 10, false), 'a 4 px ring would hide under its counter').toBeNull();
    expect(contactRing(fresh, 10, true)!.radiusPx).toBeGreaterThanOrEqual(18);
    const old = { ageHours: 96, confidence: CURRENT_CONFIDENCE - 0.01, errorKm: 300 };
    expect(isStale(old)).toBe(true);
    expect(isStale({ ...old, confidence: CURRENT_CONFIDENCE })).toBe(false);
    expect(contactRing(old, 2, false)!.stroke).not.toBe(contactRing(fresh, 2, false)!.stroke);
    expect(contactLabel(old, false)).toBe('4d old');
    expect(contactLabel(fresh, true)).toBe('seen 6h ago · ±40 km');
  });

  it('fades a contact as its fix ages and names its age on the map only once it is a day old; the selected one always', () => {
    const fresh = { ageHours: 6, confidence: 0.92, errorKm: 30 };
    expect(contactLabel(fresh, false), 'a fix from the last pass is the normal state of a front').toBeNull();
    expect(contactLabel({ ...fresh, ageHours: AGE_TAG_HOURS - 1 }, false)).toBeNull();
    expect(contactLabel({ ...fresh, ageHours: AGE_TAG_HOURS }, false)).toBe('24h old');
    expect(contactLabel(fresh, true)).toBe('seen 6h ago · ±30 km');
    const day = { ...fresh, ageHours: 24, confidence: 0.7 }, week = { ...fresh, ageHours: 168, confidence: 0.1 };
    expect(contactAlpha({ ...fresh, confidence: 1 })).toBe(1);
    expect(contactAlpha(fresh)).toBeGreaterThan(contactAlpha(day));
    expect(contactAlpha(day)).toBeGreaterThan(contactAlpha(week));
    expect(contactAlpha(week), 'an old contact is a ghost, still there to see').toBeGreaterThan(0.3);
  });

  it('picking a Russian contact as Ukraine shows its fix, error and age, never its orders or true position (ukraine-2026)', () => {
    const g = playWithStaff('ukraine-2026', 'UKR');
    open.push(g);
    g.step(8);
    const view = g.state.formations.find((f) => f.entry.nation === 'RUS' && f.entry.kind === 'maneuver' && f.contact && f.contact.ageHours > 0)
      ?? g.state.formations.find((f) => f.entry.nation === 'RUS' && f.contact)!;
    expect(view.posture).toBeNull();
    g.host.handle({ type: 'focus', nation: N('UKR'), formation: view.entry.id });
    g.step();
    const c = g.state.focusContact;
    expect(c?.id).toBe(view.entry.id);
    expect(g.state.focusFormation).toBeUndefined();
    const html = renderToStaticMarkup(createElement(ContactPanel, { contact: c!, nationName: 'Russia', palette, places: g.namer.place, onFocus: () => {}, onClose: () => {} }));
    expect(html).toContain(c!.name);
    expect(html).toContain(`within about ${Math.round(c!.errorKm)} km of that fix`);
    expect(html).toMatch(/Last fixed \d+[hd] ago/);
    expect(html).not.toMatch(/Order|Personnel|Supply/);
    const truth = g.world.formations[view.entry.id];
    const [trueName, fixName] = [g.namer.place.name(truth.node), g.namer.place.name(c!.node)];
    if (trueName !== fixName && !fixName.includes(trueName)) expect(html).not.toContain(trueName);
  }, 180_000);
});
