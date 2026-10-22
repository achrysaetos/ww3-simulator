import { atWar } from '../../core/engine';
import type { NationId } from '../../core/types';
import type { ValidationCase } from '../types';
import { civiliansKilled, crewedAircraftLost, joiners, strikesOn } from './measure';
import { sessionOn } from './setup';

const WIKI = 'Wikipedia, "Twelve-Day War" (accessed 2026-10-21), infobox and lead';
const MD = 'Israel\'s defence establishment, reported a week after the war (via Calcalist, Ynet 2025)';

/** The Israel-Iran war of 13-24 June 2025, with the US strikes on Fordow, Natanz and Isfahan on 22 June. */
export const twelveDayWar2025: ValidationCase = {
  id: 'twelve-day-war-2025',
  name: 'Twelve-Day War, Israel-Iran',
  period: '13-24 June 2025',
  provenance: 'partly-tuned',
  contamination: [
    'The stand-off fire horizon and salvo cadence (src/systems/ai/strikes.ts) cite ~550 ballistic missiles in 12 days, and the gulf-2027 band asks for at least 300 in 30 days, so the missile count is tuned on.',
    'Interceptor kill probabilities (src/data/catalog/munitions/air_defense.ts) are calibrated on the April and October 2024 exchanges, not on June 2025.',
    "Iran's order of battle (src/data/orbat/east/irn.ts) already has the June 2025 losses taken off, so the model refights the war with Iran's post-war remnant.",
    "The US support entry (src/data/nations/alliances.ts) cites the Fordow strike, so US entry is tuned on.",
  ].join(' '),
  representation:
    'gulf-2027 opened on 13 June 2025 and run 12 days. Iran declares war in the scenario where Israel struck first in 2025; the US joins by the engine\'s own rules. No ceasefire is imposed, so day 12 is read as the end of the war.',
  days: 12,
  setup: (seed) => sessionOn('gulf-2027', seed, '2025-06-13T00:00:00Z'),
  questions: [
    {
      id: 'irn_bm_fired',
      label: 'Iranian ballistic missiles fired at Israel',
      unit: 'missiles',
      provenance: 'tuned-on',
      observed: {
        lo: 500,
        hi: 600,
        sources: [
          { cite: `${WIKI}: "over 550 ballistic missiles"`, tag: 'independent' },
          { cite: 'JINSA, US interceptor use in the Israel-Iran war (2025): 574 missiles', tag: 'independent' },
        ],
      },
      baseline: { value: 0, label: 'persistence: no war' },
      measure: (r) => strikesOn(r, 'IRN', 'ISR', ['ballistic_missile']).fired,
    },
    {
      id: 'bm_intercepted',
      label: 'share of Iranian ballistic missiles at Israel shot down',
      unit: 'share',
      observed: {
        lo: 0.8,
        hi: 0.9,
        sources: [
          { cite: `${MD}: 86%`, tag: 'combatant' },
          { cite: 'The Telegraph, radar and satellite analysis (2025): about 16% not downed by day seven', tag: 'independent' },
          { cite: 'Ynet (2025), Israeli, US and outside estimates: 84-87%', tag: 'independent' },
        ],
      },
      baseline: { value: 0.99, label: "last exchange's headline: IDF, April 2024, 99% of ~300 drones and missiles" },
      measure: (r) => {
        const s = strikesOn(r, 'IRN', 'ISR', ['ballistic_missile']);
        return s.fired ? s.intercepted / s.fired : NaN;
      },
    },
    {
      id: 'isr_aircraft_lost',
      label: 'Israeli crewed aircraft lost',
      unit: 'aircraft',
      observed: {
        lo: 0,
        hi: 0,
        sources: [
          { cite: `${WIKI}: two Hermes 900 drones lost, no crewed aircraft (Israel)`, tag: 'official' },
          { cite: 'Iranian claims of downed F-35s, unsupported by any imagery or wreckage', tag: 'combatant' },
        ],
      },
      baseline: { value: 0, label: 'persistence: no air losses' },
      measure: (r) => crewedAircraftLost(r, 'ISR'),
    },
    {
      id: 'usa_aircraft_lost',
      label: 'US crewed aircraft lost',
      unit: 'aircraft',
      observed: { lo: 0, hi: 0, sources: [{ cite: `${WIKI}: no US aircraft losses`, tag: 'official' }] },
      baseline: { value: 0, label: 'persistence: no air losses' },
      measure: (r) => crewedAircraftLost(r, 'USA'),
    },
    {
      id: 'isr_civilians_killed',
      label: 'Israeli civilians killed',
      unit: 'people',
      observed: {
        lo: 16,
        hi: 64,
        sources: [{ cite: `${WIKI}: 32 civilians and one off-duty soldier killed (Israel); band is a factor of two either side`, tag: 'official' }],
      },
      baseline: { value: 0, label: 'persistence: no war' },
      measure: (r) => civiliansKilled(r.end, 'ISR'),
    },
    {
      id: 'us_enters',
      label: 'the US is at war with Iran by day 12',
      unit: 'yes=1',
      provenance: 'tuned-on',
      observed: { lo: 1, hi: 1, sources: [{ cite: `${WIKI}: US strikes on Fordow, Natanz and Isfahan, 22 June; Iranian reply on Al Udeid, 23 June`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: the US stays out' },
      measure: (r) => (atWar(r.end, 'IRN' as NationId, 'USA' as NationId) ? 1 : 0),
    },
    {
      id: 'others_join',
      label: 'other states at war, beyond Iran, Israel and the US',
      unit: 'states',
      observed: { lo: 0, hi: 0, sources: [{ cite: `${WIKI}: Jordan and others intercepted overflights without entering the war`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: nobody else joins' },
      measure: (r) => joiners(r.end, ['IRN', 'ISR', 'USA']).length,
    },
  ],
};
