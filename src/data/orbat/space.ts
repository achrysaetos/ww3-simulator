import type { OrbatEntry } from './types';

/*
 * Military and dual-use satellite constellations, and the ground-launched ASAT units that can
 * reach them, late 2025. Each constellation is one formation per orbital regime, based at its
 * operations centre, so an ASAT that reaches low orbit engages a low-orbit formation. Counts:
 * Union of Concerned Scientists Satellite Database (May 2023 release, updated with 2024-25
 * launches); US Space Force and SDA fact sheets; DoD China Military Power Report 2024 ("more than
 * 500 ISR-capable satellites" of ~1,060 PRC satellites); DIA "Challenges to Security in Space"
 * (2022). Classified constellations (KH-11, Topaz, Yaogan, Persona) are open estimates. Each
 * catalog type stands for its whole family: gps3 for GPS IIR/IIF/III, beidou3 for BeiDou-3
 * MEO/IGSO/GEO, glonass_k2 for the GLONASS-M/K fleet.
 */

const SPACE = { readiness: 0.95, experience: 0.5 };
const space = (nation: string, name: string, base: OrbatEntry['base'], equipment: Record<string, number>, source: string): OrbatEntry =>
  ({ nation, name, kind: 'space', echelon: 'wing', base, equipment, ...SPACE, source });
const asat = (nation: string, name: string, base: OrbatEntry['base'], equipment: Record<string, number>, reloads: Record<string, number>, source: string): OrbatEntry =>
  ({ nation, name, kind: 'missile', echelon: 'battalion', base, equipment, extraMagazine: reloads, readiness: 0.8, experience: 0.4, source });

const SCHRIEVER = { name: 'Schriever SFB, Colorado', lat: 38.8, lon: -104.53 };
const BUCKLEY = { name: 'Buckley SFB, Colorado', lat: 39.72, lon: -104.75 };
const CHANTILLY = { name: 'NRO, Chantilly, Virginia', lat: 38.88, lon: -77.43 };

export const constellations: OrbatEntry[] = [
  // United States: 31 operational GPS (Space Force, 2025); 6 SBIRS GEO plus Next-Gen OPIR in build;
  // 6 AEHF, 10 WGS; KH-11 and Topaz est. 5 each; SDA Tranche 1 began launching Sept 2025 (21 transport,
  // 4 tracking by end-2025); NRO's proliferated Starshield-based layer passed ~200 satellites in 2025.
  space('USA', 'GPS constellation (MEO), 2nd Space Operations Squadron', SCHRIEVER, { gps3: 31 }, 'US Space Force GPS fact sheet 2025'),
  space('USA', 'NRO imaging constellation (LEO)', CHANTILLY, { kh11: 5, us_sar_sat: 5 }, 'UCS Satellite Database; open estimates'),
  space('USA', 'NRO proliferated architecture and SDA layers (LEO)', CHANTILLY, { starshield: 200, sda_transport: 21, sda_tracking: 4 }, 'NRO statements 2025; SDA Tranche 1 launch schedule'),
  space('USA', 'Missile warning and protected communications (GEO)', BUCKLEY, { sbirs_geo: 6, aehf: 6, wgs: 10 }, 'US Space Force fact sheets 2025'),
  // Russia: GLONASS 24 operational of ~26 in orbit; EKS Tundra 6; Persona and Bars-M est. 4; Meridian 7.
  space('RUS', 'GLONASS constellation (MEO)', { name: 'Krasnoznamensk', lat: 55.6, lon: 37.04 }, { glonass_k2: 24 }, 'GLONASS IAC status 2025'),
  space('RUS', 'Persona and Bars-M imaging (LEO)', { name: 'Krasnoznamensk', lat: 55.6, lon: 37.04 }, { persona: 4 }, 'UCS Satellite Database; open estimates'),
  space('RUS', 'EKS Tundra early warning and Meridian relay (HEO)', { name: 'Serpukhov-15', lat: 55.08, lon: 37.43 }, { tundra_eks: 6, meridian: 7 }, 'UCS Satellite Database'),
  // China: BeiDou-3 30 (24 MEO, 3 IGSO, 3 GEO); Yaogan ELINT triplets est. 30 (90 satellites) and
  // ~150 imaging/SAR of the >500 ISR-capable satellites CMPR 2024 counts (the rest are Jilin and other
  // commercial types the PLA can task); Tianlian relay 6; Shijian-21 tug.
  space('CHN', 'BeiDou-3 constellation (MEO, IGSO, GEO)', { name: "Xi'an Satellite Control Center", lat: 34.27, lon: 108.95 }, { beidou3: 30 }, 'China Satellite Navigation Office 2025'),
  space('CHN', 'Yaogan reconnaissance constellation (LEO)', { name: "Xi'an Satellite Control Center", lat: 34.27, lon: 108.95 }, { yaogan_sar: 150, yaogan_elint: 90 }, 'DoD CMPR 2024; UCS Satellite Database'),
  space('CHN', 'Tianlian relay and Shijian counter-space (GEO)', { name: 'Beijing Aerospace Control Center', lat: 40.07, lon: 116.26 }, { tianlian: 6, shijian21: 1 }, 'UCS Satellite Database; CSIS Space Threat Assessment 2025'),
  // European and Israeli military satellites.
  space('GBR', 'Skynet 5 (GEO)', { name: 'RAF Oakhanger', lat: 51.11, lon: -0.9 }, { skynet5: 4 }, 'UK MoD'),
  space('FRA', 'Syracuse IV (GEO)', { name: 'Toulouse (CMOS)', lat: 43.6, lon: 1.44 }, { syracuse4: 2 }, 'DGA 2024'),
  space('ISR', 'Ofek reconnaissance (LEO)', { name: 'Palmachim', lat: 31.88, lon: 34.69 }, { ofek16: 6 }, 'UCS Satellite Database (Ofek 5, 10, 11, 13, 16, 19)'),
];

/*
 * Ground-launched direct-ascent ASAT units. Each state has hit its own satellite once (CHN SC-19
 * 2007, US SM-3 2008, IND PDV Mk-II 2019, RUS Nudol 2021); inventories are not public, so units
 * are sized as test-programme batteries (CSIS Space Threat Assessment 2025; Secure World
 * Foundation "Global Counterspace Capabilities" 2025).
 */
export const counterspace: OrbatEntry[] = [
  asat('RUS', 'Nudol ASAT battalion', { name: 'Plesetsk', lat: 62.93, lon: 40.58 }, { nudol: 4 }, { nudol_int: 8 }, 'Secure World Foundation 2025'),
  asat('CHN', 'SC-19 and DN-3 ASAT brigade', { name: 'Korla', lat: 41.73, lon: 86.17 }, { sc19_tel: 6, dn3_tel: 3 }, { sc19_int: 12, dn3_int: 6 }, 'Secure World Foundation 2025; DoD CMPR 2024'),
  asat('IND', 'PDV Mk-II ASAT unit', { name: 'Abdul Kalam Island', lat: 20.76, lon: 87.08 }, { pdv_launcher: 2 }, { pdv_mk2: 2 }, 'DRDO Mission Shakti 2019'),
];
