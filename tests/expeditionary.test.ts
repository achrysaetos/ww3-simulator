import { describe, expect, it } from 'vitest';
import { atWar } from '../src/core/engine';
import type { NationId, NodeId } from '../src/core/types';
import { createSession, type Session } from '../src/scenarios';
import { seaPath } from '../src/systems/naval/movement';

const nation = (n: string) => n as NationId;

/** Steps a session `days` days, handing each tick's events to `on`. */
function runDays(s: Session, days: number, on?: (events: ReturnType<Session['engine']['step']>) => void): void {
  const perDay = Math.round(24 / s.world.dtHours);
  for (let i = 0; i < days * perDay; i++) {
    const events = s.engine.step(s.world);
    on?.(events);
  }
}

/** Sea km from the zone holding one point to the zone holding another, or -1 with no route. */
function routeKm(s: Session, by: string, from: [number, number], to: [number, number]): number {
  const { map, world } = s;
  const zone = (p: [number, number]) => map.nodesWithin(map.nodeAt(...p), 250).filter((n) => map.isSea(n)).sort((a, b) => map.distanceKm(a, map.nodeAt(...p)) - map.distanceKm(b, map.nodeAt(...p)))[0];
  const a = zone(from), b = zone(to);
  const path = seaPath(world, map, nation(by), a, b);
  if (!path) return -1;
  let km = 0;
  for (let i = 0, at: NodeId = a; i < path.length; at = path[i++]) km += map.distanceKm(at, path[i]);
  return km;
}

describe('straits on the sea map (EX-4, EX-10)', () => {
  // On main Lisbon to Algiers went round Africa (22,406 km) and the Aegean had no sea route to the Black Sea.
  it('ships pass Gibraltar and, at peace, the Turkish Straits', () => {
    const s = createSession('peace-2027', 1);
    expect(routeKm(s, 'USA', [38.7, -9.6], [36.8, 3.1])).toBeLessThan(1600);
    expect(routeKm(s, 'USA', [36.9, -76.3], [32.8, 35.0]), 'Norfolk to Haifa is about 10,000 km by Gibraltar').toBeLessThan(11_000);
    const aegeanToBlackSea = routeKm(s, 'TUR', [37.5, 25.5], [43.5, 31.5]);
    expect(aegeanToBlackSea).toBeGreaterThan(0);
    expect(aegeanToBlackSea).toBeLessThan(1500);
  }, 60_000);

  it('Montreux shuts the Turkish Straits to belligerents Turkey is not fighting beside', () => {
    const s = createSession('ukraine-2026', 1);
    runDays(s, 1);
    expect(atWar(s.world, nation('RUS'), nation('UKR'))).toBe(true);
    expect(routeKm(s, 'RUS', [37.5, 25.5], [43.5, 31.5])).toBe(-1);
    expect(routeKm(s, 'UKR', [37.5, 25.5], [43.5, 31.5])).toBe(-1);
    expect(routeKm(s, 'USA', [37.5, 25.5], [43.5, 31.5])).toBeGreaterThan(0);
  }, 60_000);

  // On main the Chennai zone joined an inland "sea" zone over Kerala, so India's Eastern Fleet crossed the peninsula.
  it('ships from the Bay of Bengal to the Arabian Sea round Sri Lanka', () => {
    const s = createSession('south-asia-2027', 1);
    expect(routeKm(s, 'IND', [13.1, 80.3], [12.9, 74.8]), 'Chennai to Mangaluru is about 1,900 km by sea').toBeGreaterThan(1800);
    expect(routeKm(s, 'IND', [17.7, 83.3], [24.8, 66.9]), 'Vizag to Karachi is about 3,300 km by sea').toBeGreaterThan(3200);
  }, 60_000);
});
