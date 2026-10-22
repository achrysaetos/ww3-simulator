/**
 * Undersea cables and pipelines whose severance has a real strategic effect, with their real
 * landing points. Routes and incidents from TeleGeography's Submarine Cable Map and public
 * reporting. A cut is a covert act (a dragged anchor, a cut pipeline): the holder is plausibly
 * deniable, and repair waits for one of the world's ~60 cable-repair ships, which are few and
 * far between, so a Baltic or Red Sea cut is out for weeks to months.
 *
 * Incidents the routes are drawn from:
 * - Baltic: Balticconnector gas pipeline and an Estonia-Finland data cable dragged by an anchor,
 *   8 Oct 2023 (repaired Apr 2024). C-Lion1 (Finland-Germany) and BCS East-West (Lithuania-Sweden)
 *   cut 17-18 Nov 2024. Estlink 2 power cable and four data cables cut 25 Dec 2024.
 * - Red Sea: Seacom, AAE-1, EIG and TGN-EA cut near Yemen, Feb 2024, degrading Europe-Asia and
 *   East-Africa traffic for months (anchor of the sinking Rubymar, widely reported).
 * - Taiwan: both cables to the Matsu islands cut within days, Feb 2023, leaving ~14k residents on
 *   degraded microwave backup for weeks.
 */

export type CableKind = 'data' | 'power' | 'gas';

export interface Cable {
  id: string;
  name: string;
  kind: CableKind;
  /** The two (or more) landing points, [lat, lon], in the nations they land in. */
  landings: { lat: number; lon: number; nation: string }[];
  /**
   * Nations whose external connectivity (data), grid import (power) or gas import (gas) this cable
   * carries, with the share of that service it provides, 0..1. A cut takes that share until repair.
   */
  serves: Record<string, number>;
  /**
   * Repair region, which sets how long a ship takes to arrive. Few cable ships cover each ocean,
   * so a region already repairing one cable queues the next.
   */
  region: 'baltic' | 'north_sea' | 'red_sea' | 'west_pacific' | 'atlantic' | 'med' | 'indian';
  source: string;
}

export const CABLES: readonly Cable[] = [
  {
    id: 'c_lion1', name: 'C-Lion1', kind: 'data',
    landings: [{ lat: 60.17, lon: 24.94, nation: 'FIN' }, { lat: 54.17, lon: 13.78, nation: 'DEU' }],
    serves: { FIN: 0.5 }, region: 'baltic',
    source: 'TeleGeography; cut 17 Nov 2024',
  },
  {
    id: 'bcs_ew', name: 'BCS East-West Interlink', kind: 'data',
    landings: [{ lat: 55.9, lon: 21.07, nation: 'LTU' }, { lat: 57.76, lon: 16.64, nation: 'SWE' }],
    serves: { LTU: 0.4 }, region: 'baltic',
    source: 'TeleGeography; cut 18 Nov 2024',
  },
  {
    id: 'estlink2', name: 'Estlink 2', kind: 'power',
    landings: [{ lat: 59.46, lon: 24.64, nation: 'EST' }, { lat: 60.4, lon: 26.1, nation: 'FIN' }],
    serves: { EST: 0.3 }, region: 'baltic',
    source: 'Fingrid/Elering; cut 25 Dec 2024, out for months',
  },
  {
    id: 'balticconnector', name: 'Balticconnector', kind: 'gas',
    landings: [{ lat: 59.49, lon: 24.55, nation: 'EST' }, { lat: 60.2, lon: 24.96, nation: 'FIN' }],
    serves: { EST: 0.4, FIN: 0.2 }, region: 'baltic',
    source: 'Gasgrid/Elering; damaged 8 Oct 2023, repaired Apr 2024',
  },
  {
    id: 'seacom', name: 'SEACOM / AAE-1', kind: 'data',
    landings: [{ lat: 29.0, lon: 32.55, nation: 'EGY' }, { lat: 12.8, lon: 45.0, nation: 'YEM' }, { lat: -4.05, lon: 39.67, nation: 'KEN' }],
    serves: { KEN: 0.3, TZA: 0.3, EGY: 0.1 }, region: 'red_sea',
    source: 'TeleGeography; cut near Yemen Feb 2024',
  },
  {
    id: 'eig', name: 'Europe India Gateway', kind: 'data',
    landings: [{ lat: 29.0, lon: 32.55, nation: 'EGY' }, { lat: 12.8, lon: 45.0, nation: 'YEM' }, { lat: 19.08, lon: 72.88, nation: 'IND' }],
    serves: { IND: 0.1, EGY: 0.1 }, region: 'red_sea',
    source: 'TeleGeography; cut near Yemen Feb 2024',
  },
  {
    id: 'matsu', name: 'Taiwan-Matsu Nos. 2 and 3', kind: 'data',
    landings: [{ lat: 26.15, lon: 119.95, nation: 'TWN' }, { lat: 25.17, lon: 121.44, nation: 'TWN' }],
    serves: { TWN: 0.05 }, region: 'west_pacific',
    source: 'Chunghwa Telecom; both cut Feb 2023',
  },
];

export const CABLE_BY_ID = new Map(CABLES.map((c) => [c.id, c]));
