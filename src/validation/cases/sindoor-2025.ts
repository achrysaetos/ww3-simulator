import type { ValidationCase } from '../types';
import { crewedAircraftLost, STRIKE_WEAPONS, strikesOn, territoryChanged } from './measure';
import { sessionOn } from './setup';

const WIKI = 'Wikipedia, "2025 India-Pakistan conflict" (accessed 2026-10-21), compiling the sources named';

/**
 * Operation Sindoor and Pakistan's answer, 7-10 May 2025: four days of Indian missile, drone and air
 * strikes, Pakistani drone and missile replies, artillery duels on the Line of Control, an air
 * battle on the first night, and a ceasefire on 10 May.
 */
export const sindoor2025: ValidationCase = {
  id: 'sindoor-2025',
  name: 'Operation Sindoor, India-Pakistan',
  period: '7-10 May 2025',
  provenance: 'partly-tuned',
  contamination:
    "India's strategic profile (src/data/nations/strategic.ts) and the IND-PAK opinion (src/data/nations/opinions.ts) cite Sindoor. No outcome band, land or air constant cites it.",
  representation:
    'south-asia-2027 opened on 7 May 2025 and run for the four days the fighting lasted. The engine has no limited war: both sides mobilise and the AI fights a full war, so the case asks whether its first four days look like a strike exchange that stays limited. It cannot represent the political decision to stop on day 4.',
  days: 4,
  setup: (seed) => sessionOn('south-asia-2027', seed, '2025-05-07T00:00:00Z'),
  questions: [
    {
      id: 'territory',
      label: 'territory that changed hands',
      unit: '1-degree cells',
      observed: { lo: 0, hi: 0, sources: [{ cite: `${WIKI}: no territorial change; ceasefire 10 May after DGMO talks`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: the Line of Control stays put' },
      measure: territoryChanged,
    },
    {
      id: 'land_casualties',
      label: 'Indian and Pakistani military casualties in land battles',
      unit: 'people',
      observed: {
        lo: 0,
        hi: 300,
        sources: [
          { cite: `${WIKI}: 8 Indian military and paramilitary killed (Government of India)`, tag: 'official' },
          { cite: `${WIKI}: 13 Pakistani military killed (ISPR); India claimed 35-40, Pakistan claimed 25-50 Indian soldiers`, tag: 'combatant' },
          { cite: 'Wounded not fully reported; 300 allows ten wounded per death on top of the claims (judgment)', tag: 'independent' },
        ],
      },
      baseline: { value: 0, label: 'persistence: no ground war' },
      measure: (r) => (r.metrics.nations.IND?.casualties ?? 0) + (r.metrics.nations.PAK?.casualties ?? 0),
    },
    {
      id: 'ind_aircraft_lost',
      label: 'Indian crewed aircraft lost',
      unit: 'aircraft',
      observed: {
        lo: 2,
        hi: 5,
        sources: [
          { cite: `${WIKI}: US officials to Reuters, "high confidence" J-10s downed at least two Indian jets`, tag: 'independent' },
          { cite: `${WIKI}: French Air and Space Force chief saw evidence of three (Rafale, Mirage 2000, Sukhoi); Washington Quarterly: at least three, likely four or five`, tag: 'independent' },
          { cite: `${WIKI}: Pakistan claimed six`, tag: 'combatant' },
          { cite: `${WIKI}: CDS Gen. Chauhan acknowledged losses without a number, 31 May`, tag: 'official' },
        ],
      },
      baseline: { value: 0, label: 'persistence: no air losses' },
      measure: (r) => crewedAircraftLost(r, 'IND'),
    },
    {
      id: 'ind_strikes_land',
      label: 'Indian strike weapons on Pakistan not shot down',
      unit: 'weapons',
      observed: {
        lo: 1,
        hi: Infinity,
        sources: [
          { cite: `${WIKI}: satellite imagery shows craters at Mushaf and Rahim Yar Khan (NYT) and hangar damage at Bholari and Shahbaz (Washington Post)`, tag: 'independent' },
          { cite: `${WIKI}: Pakistan confirmed strikes on six of the nine 7 May sites`, tag: 'combatant' },
        ],
      },
      baseline: { value: 0, label: 'persistence: no strikes' },
      measure: (r) => {
        const s = strikesOn(r, 'IND', 'PAK', STRIKE_WEAPONS);
        return s.fired - s.intercepted;
      },
    },
    {
      id: 'warships_lost',
      label: 'warships and patrol craft lost, both sides',
      unit: 'hulls',
      observed: { lo: 0, hi: 0, sources: [{ cite: `${WIKI}: no naval engagement; India moved its Western Fleet toward Karachi on 9 May`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence: no naval losses' },
      measure: (r) => ['IND', 'PAK'].reduce((a, n) => a + (r.metrics.nations[n]?.lossesByDomain.sea ?? 0) + (r.metrics.nations[n]?.lossesByDomain.subsurface ?? 0), 0),
    },
    {
      id: 'nuclear_use',
      label: 'nuclear detonations',
      unit: 'detonations',
      observed: { lo: 0, hi: 0, sources: [{ cite: `${WIKI}`, tag: 'independent' }] },
      baseline: { value: 0, label: 'persistence' },
      measure: (r) => r.metrics.nuclearDetonations.length,
    },
  ],
};
