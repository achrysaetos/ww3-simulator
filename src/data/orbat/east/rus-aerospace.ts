import type { OrbatEntry } from '../types';
import { at, unit, type Base, type Kit } from './build';

/*
 * Russian Aerospace Forces (VKS) aviation, Long Range Aviation, Naval Aviation and Army
 * Aviation at their airbases, late 2025.
 *
 * Fleet sizes per type follow IISS Military Balance 2025, less losses documented by Oryx
 * through 2025 (notably ~35 Su-34, ~30 Su-25, ~40 Ka-52, two A-50s in January-February
 * 2024) and the 1 June 2025 Operation Spiderweb drone strike on Olenya and Belaya, which
 * open-source imagery shows destroyed roughly 10-12 Tu-95MS/Tu-22M3. Regiment-to-base
 * assignments are from open-source compilations; per-regiment counts are estimates.
 */

const RUS = 'RUS';
const VKS = { readiness: 0.65, experience: 0.65 };
const air = (name: string, base: Base, equipment: Kit, extra = VKS): OrbatEntry => unit(RUS, name, 'air_wing', 'wing', base, equipment, extra);
const heli = (name: string, base: Base, equipment: Kit): OrbatEntry => unit(RUS, name, 'air_wing', 'wing', base, equipment, { readiness: 0.6, experience: 0.7 });

const fighters: OrbatEntry[] = [
  air('159th Guards Fighter Aviation Regiment', at('Besovets, Petrozavodsk', 61.88, 34.15), { su35s: 28 }),
  air('790th Fighter Aviation Regiment', at('Khotilovo', 57.66, 34.1), { su35s: 14, mig31bm: 12 }),
  air('28th Guards Fighter Aviation Regiment', at('Andreapol', 56.65, 32.3), { mig31bm: 18 }),
  air('14th Guards Fighter Aviation Regiment', at('Khalino, Kursk', 51.75, 36.3), { su30sm: 18, mig29smt: 10 }),
  air('31st Guards Fighter Aviation Regiment', at('Millerovo', 48.95, 40.3), { su30sm: 24 }),
  air('3rd Guards Fighter Aviation Regiment', at('Krymsk', 44.96, 38.0), { su30sm: 24, su27sm: 6 }),
  air('38th Fighter Aviation Regiment', at('Belbek, Crimea', 45.1, 33.58), { su27sm: 14, su30sm: 4 }),
  air('689th Guards Fighter Aviation Regiment (Baltic Fleet)', at('Chkalovsk, Kaliningrad', 54.77, 20.4), { su27sm: 14, su35s: 6 }),
  air('23rd Fighter Aviation Regiment', at('Dzemgi, Komsomolsk-on-Amur', 50.6, 137.08), { su35s: 28, su57: 12 }),
  air('22nd Guards Fighter Aviation Regiment', at('Tsentralnaya Uglovaya', 43.38, 132.1), { su35s: 12, su30sm: 12, su27sm: 8 }),
  air('120th Guards Composite Aviation Regiment', at('Domna, Chita', 51.92, 113.13), { su30sm: 28 }),
  air('712th Guards Fighter Aviation Regiment', at('Kansk', 56.13, 95.66), { mig31bm: 24 }),
  air('3958th Air Base (Kinzhal carriers)', at('Savasleyka', 55.44, 42.31), { mig31bm: 20 }),
  air('929th State Flight Test Centre', at('Akhtubinsk', 48.31, 46.2), { su57: 10, su35s: 6, su34: 4 }),
  air('4th Combat Training Centre', at('Lipetsk', 52.63, 39.45), { su35s: 10, su34: 10, su30sm: 6, mig29smt: 8, su57: 4 }),
  air('Grouping of Russian Forces in Armenia (3624th Air Base)', at('Erebuni', 40.12, 44.47), { mig29: 16 }),
  // Training and conversion units hold a large share of the older fleet (IISS MB 2025).
  air('Borisoglebsk Training Centre', at('Borisoglebsk', 51.37, 42.18), { su25sm: 20 }),
  air('Armavir Fighter Training Regiment', at('Armavir', 44.97, 41.1), { mig29: 20, su27sm: 16 }),
  air('116th Air Defence Aviation Combat Training Centre', at('Astrakhan Privolzhsky', 46.4, 47.9), { mig29: 12, mig31bm: 10 }),
  air('859th Naval Aviation Training Centre', at('Yeysk', 46.68, 38.21), { su25sm: 10, mig29kr: 6, su24m: 6 }),
];

const strike: OrbatEntry[] = [
  air('47th Guards Bomber Aviation Regiment', at('Baltimor, Voronezh', 51.61, 39.24), { su34: 24 }),
  air('559th Guards Bomber Aviation Regiment', at('Morozovsk', 48.31, 41.79), { su34: 24 }),
  air('2nd Guards Bomber Aviation Regiment', at('Shagol, Chelyabinsk', 55.26, 61.29), { su34: 24 }),
  air('277th Bomber Aviation Regiment', at('Khurba', 50.4, 136.98), { su34: 22 }),
  air('455th Bomber Aviation Regiment', at('Marinovka', 48.64, 43.79), { su24m: 26, su34: 8 }),
  air('37th Composite Aviation Regiment', at('Gvardeyskoye, Crimea', 45.12, 33.98), { su24m: 14, su25sm: 12 }),
  air('960th Assault Aviation Regiment', at('Primorsko-Akhtarsk', 46.05, 38.18), { su25sm: 24 }),
  air('368th Assault Aviation Regiment', at('Budyonnovsk', 44.8, 44.0), { su25sm: 24 }),
  air('18th Guards Assault Aviation Regiment', at('Chernigovka', 44.3, 132.57), { su25sm: 22 }),
  air('266th Assault Aviation Regiment', at('Step, Zabaykalsky', 50.9, 115.2), { su25sm: 22 }),
  air('999th Air Base (Kant)', at('Kant, Kyrgyzstan', 42.85, 74.85), { su25sm: 10 }),
];

// Long Range Aviation. Tu-160 and Tu-95MS regiments are the air leg of the triad.
const lra: OrbatEntry[] = [
  unit(RUS, '121st Guards Heavy Bomber Aviation Regiment', 'strategic', 'wing', at('Engels', 51.48, 46.21), { tu160: 16 }, VKS),
  unit(RUS, '184th Guards Heavy Bomber Aviation Regiment', 'strategic', 'wing', at('Engels dispersal', 51.45, 46.3), { tu95ms: 14 }, VKS),
  unit(RUS, '182nd Guards Heavy Bomber Aviation Regiment', 'strategic', 'wing', at('Ukrainka', 51.17, 128.45), { tu95ms: 20 }, VKS),
  air('40th Composite Aviation Regiment', at('Olenya', 68.15, 33.46), { tu22m3: 8, tu95ms: 6 }),
  air('52nd Guards Heavy Bomber Aviation Regiment', at('Shaykovka', 54.23, 34.37), { tu22m3: 18 }),
  air('200th Guards Heavy Bomber Aviation Regiment', at('Belaya', 52.92, 103.57), { tu22m3: 14 }),
  air('840th Heavy Bomber Aviation Regiment', at('Soltsy', 58.14, 30.33), { tu22m3: 6 }),
  air('203rd Guards Air Refuelling Regiment', at('Dyagilevo, Ryazan', 54.64, 39.57), { il78: 15 }),
  air('144th AEW&C Regiment', at('Ivanovo-Severny', 57.06, 40.98), { a50u: 6 }),
];

const transport: OrbatEntry[] = [
  air('12th Military Transport Aviation Division', at('Migalovo, Tver', 56.82, 35.76), { il76: 40, an124: 10 }),
  air('334th Military Transport Aviation Regiment', at('Pskov Kresty', 57.78, 28.4), { il76: 22 }),
  air('117th Military Transport Aviation Regiment', at('Orenburg', 51.8, 55.46), { il76: 20 }),
];

const naval: OrbatEntry[] = [
  air('279th Shipborne Fighter Aviation Regiment', at('Severomorsk-3', 69.03, 33.42), { su33: 14 }),
  air('100th Shipborne Fighter Aviation Regiment', at('Severomorsk-3 dispersal', 69.01, 33.3), { mig29kr: 18 }),
  air('98th Composite Aviation Regiment', at('Monchegorsk', 67.99, 33.02), { mig31bm: 12, su24m: 8 }),
  air('403rd Composite Aviation Regiment', at('Severomorsk-1', 69.03, 33.45), { il38n: 6, tu142m: 4 }),
  air('7050th Naval Aviation Base', at('Kipelovo', 59.37, 39.03), { tu142m: 10 }),
  air('4th Guards Naval Assault Aviation Regiment', at('Chkalovsk naval', 54.75, 20.45), { su30sm: 10, su24m: 10 }),
  air('43rd Naval Assault Aviation Regiment', at('Saki, Crimea', 45.09, 33.6), { su30sm: 8, su24m: 6 }),
  air('317th Composite Aviation Regiment', at('Yelizovo, Kamchatka', 53.17, 158.45), { mig31bm: 12, il38n: 6 }),
  air('865th Fighter Aviation Regiment (Pacific Fleet)', at('Kamenny Ruchey', 49.23, 140.2), { mig31bm: 12, su30sm: 6 }),
];

const army: OrbatEntry[] = [
  heli('15th Army Aviation Brigade', at('Ostrov', 57.3, 28.43), { ka52: 12, mi28: 12, mi8amtsh: 20 }),
  heli('344th Army Aviation Combat Training Centre', at('Torzhok', 57.05, 34.95), { ka52: 6, mi28: 6, mi8amtsh: 6 }),
  heli('39th Helicopter Regiment', at('Dzhankoi heliport, Crimea', 45.7, 34.42), { ka52: 10, mi28: 6, mi24p: 10, mi8amtsh: 12 }),
  heli('55th Helicopter Regiment', at('Korenovsk', 45.45, 39.45), { ka52: 12, mi28: 12, mi24p: 8, mi8amtsh: 16 }),
  heli('487th Helicopter Regiment', at('Budyonnovsk heliport', 44.78, 43.95), { mi28: 12, mi24p: 8, mi8amtsh: 12 }),
  heli('16th Army Aviation Brigade', at('Zernograd', 46.85, 40.3), { ka52: 12, mi28: 12, mi8amtsh: 16 }),
  heli('Forward helicopter group Kursk', at('Kursk forward heliport', 51.5, 35.9), { ka52: 10, mi28: 8, mi8amtsh: 10 }),
  heli('18th Army Aviation Brigade', at('Khabarovsk Bolshoy', 48.52, 135.18), { ka52: 12, mi24p: 6, mi8amtsh: 20 }),
  heli('112th Helicopter Regiment', at('Chita Cheryomushki', 52.05, 113.4), { mi24p: 12, mi8amtsh: 12 }),
  heli('337th Helicopter Regiment', at('Berdsk', 54.75, 83.1), { mi28: 12, mi24p: 8, mi8amtsh: 12 }),
];

// Geran-2 is the licence-built Shahed-136 (Alabuga plant); launch rates reached ~5,000 a month in
// mid-2025 (Ukrainian Air Force daily reports). Stocks per launch site are estimates.
const drones: OrbatEntry[] = [
  unit(RUS, 'Geran-2 Launch Group Primorsko-Akhtarsk', 'missile', 'battalion', at('Primorsko-Akhtarsk drone site', 46.0, 38.25), { shahed_136: 500, truck: 30 }, VKS),
  unit(RUS, 'Geran-2 Launch Group Navlya', 'missile', 'battalion', at('Navlya, Bryansk', 52.83, 34.5), { shahed_136: 400, truck: 25 }, VKS),
  unit(RUS, 'Geran-2 Launch Group Shatalovo', 'missile', 'battalion', at('Shatalovo, Smolensk', 54.35, 32.47), { shahed_136: 400, truck: 25 }, VKS),
  unit(RUS, 'Geran-2 Launch Group Kursk', 'missile', 'battalion', at('Kursk Khalino drone site', 51.8, 36.35), { shahed_136: 400, truck: 25 }, VKS),
  unit(RUS, 'Geran-2 Launch Group Crimea', 'missile', 'battalion', at('Hvardiiske, Crimea', 45.1, 34.0), { shahed_136: 300, truck: 20 }, VKS),
  unit(RUS, 'Rubikon Centre for Advanced Unmanned Technologies', 'artillery', 'brigade', at('Pokrovsk drone line', 48.35, 37.35), { lancet: 150, orlan10: 30, infantry_squad: 60, truck: 80 }, { readiness: 0.8, experience: 0.8 }),
];

export const rusAerospace: OrbatEntry[] = [...fighters, ...strike, ...lra, ...transport, ...naval, ...army, ...drones];
