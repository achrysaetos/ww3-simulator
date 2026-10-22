/*
 * US Air Force, Air National Guard and Air Force Reserve, late 2025 / 2026.
 * Sources: IISS Military Balance 2025 (USAF, ANG, AFRC aircraft holdings); af.mil wing fact
 * sheets and base pages; Air & Space Forces Magazine USAF Almanac 2025 (squadron stationing);
 * USAF FY2026 budget (A-10, F-15C/D and F-15E retirements; F-15EX and F-35A basing). Wing
 * aircraft counts are primary aircraft authorized (about 18-24 per fighter squadron). Kadena
 * F-15EX and Tyndall F-35A counts are estimates of the 2026 build-up. Bombers that carry
 * nuclear weapons (B-2, B-52) are in usa-strategic.ts.
 */
import { base, forNation } from './build';

const u = forNation('USA', 'IISS Military Balance 2025; af.mil wing fact sheets; USAF Almanac 2025');

const ACTIVE = { readiness: 0.8 };
const ANG = { readiness: 0.7 };
const TEST = { readiness: 0.5 };

export const usaAir = [
  // Air Combat Command and PACAF/USAFE fighter wings
  u('1st Fighter Wing (with 192nd Wing ANG)', 'air_wing', 'wing', base('JB Langley-Eustis, VA', 37.08, -76.36), { f22a: 52 }, ACTIVE),
  u('3rd Wing', 'air_wing', 'wing', base('Joint Base Elmendorf-Richardson, AK', 61.25, -149.8), { f22a: 40, e3g: 2, c17a: 8 }, ACTIVE),
  u('15th Wing / 154th Wing (HI ANG)', 'air_wing', 'wing', base('JB Pearl Harbor-Hickam, HI', 21.32, -157.92), { f22a: 20, kc135r: 12, c17a: 8 }, ACTIVE),
  u('4th Fighter Wing', 'air_wing', 'wing', base('Seymour Johnson AFB, NC', 35.34, -77.96), { f15e: 90 }, ACTIVE),
  u('18th Wing', 'air_wing', 'wing', base('Kadena AB, Okinawa', 26.35, 127.77), { f15ex: 12, kc135r: 15, e3g: 2, hh60w: 8 }, ACTIVE),
  u('20th Fighter Wing', 'air_wing', 'wing', base('Shaw AFB, SC', 33.97, -80.47), { f16cm_sead: 72 }, ACTIVE),
  u('23rd Wing', 'air_wing', 'wing', base('Moody AFB, GA', 30.97, -83.19), { a10c: 48, hh60w: 10 }, ACTIVE),
  u('31st Fighter Wing', 'air_wing', 'wing', base('Aviano AB', 46.03, 12.6), { f16c: 42 }, ACTIVE),
  u('33rd Fighter Wing (F-35A schoolhouse)', 'air_wing', 'wing', base('Eglin AFB, FL', 30.48, -86.53), { f35a: 26 }, ACTIVE),
  u('35th Fighter Wing', 'air_wing', 'wing', base('Misawa AB', 40.7, 141.37), { f16cm_sead: 36 }, ACTIVE),
  u('48th Fighter Wing (F-15E squadrons)', 'air_wing', 'wing', base('RAF Lakenheath', 52.41, 0.56), { f15e: 46 }, ACTIVE),
  u('48th Fighter Wing (F-35A squadrons)', 'air_wing', 'wing', base('RAF Lakenheath', 52.41, 0.56), { f35a: 48 }, ACTIVE),
  u('49th Wing', 'air_wing', 'wing', base('Holloman AFB, NM', 32.85, -106.1), { f16c: 48, mq9a: 40 }, ACTIVE),
  u('51st Fighter Wing', 'air_wing', 'wing', base('Osan AB', 37.09, 127.03), { f16c: 48 }, ACTIVE),
  u('8th Fighter Wing', 'air_wing', 'wing', base('Kunsan AB', 35.9, 126.62), { f16c: 48 }, ACTIVE),
  u('52nd Fighter Wing', 'air_wing', 'wing', base('Spangdahlem AB', 49.97, 6.69), { f16cm_sead: 24 }, ACTIVE),
  u('56th Fighter Wing (F-35A training, with 944th FW AFRC)', 'air_wing', 'wing', base('Luke AFB, AZ', 33.54, -112.38), { f35a: 100 }, ACTIVE),
  u('57th Wing (Weapons School and aggressors)', 'air_wing', 'wing', base('Nellis AFB, NV', 36.24, -115.03), { f16c: 24, f35a: 24, f15e: 10, f22a: 10, a10c: 6 }, ACTIVE),
  u('325th Fighter Wing', 'air_wing', 'wing', base('Tyndall AFB, FL', 30.07, -85.58), { f35a: 40 }, ACTIVE),
  u('354th Fighter Wing', 'air_wing', 'wing', base('Eielson AFB, AK', 64.67, -147.1), { f35a: 54, f16c: 18 }, ACTIVE),
  u('355th Wing', 'air_wing', 'wing', base('Davis-Monthan AFB, AZ', 32.17, -110.88), { a10c: 30, ec130h: 6 }, ACTIVE),
  u('366th Fighter Wing', 'air_wing', 'wing', base('Mountain Home AFB, ID', 43.04, -115.87), { f15e: 48 }, ACTIVE),
  u('388th Fighter Wing (with 419th FW AFRC)', 'air_wing', 'wing', base('Hill AFB, UT', 41.12, -111.97), { f35a: 78 }, ACTIVE),
  u('7th Bomb Wing', 'air_wing', 'wing', base('Dyess AFB, TX', 32.42, -99.85), { b1b: 24 }, ACTIVE),
  u('28th Bomb Wing', 'air_wing', 'wing', base('Ellsworth AFB, SD', 44.15, -103.1), { b1b: 20 }, ACTIVE),
  u('432nd Wing', 'air_wing', 'wing', base('Creech AFB, NV', 36.59, -115.67), { mq9a: 60 }, ACTIVE),
  u('53rd Wing (operational test)', 'air_wing', 'wing', base('Eglin AFB, FL', 30.48, -86.53), { f35a: 10, f22a: 6, f15e: 6, f16c: 10, f15ex: 6, a10c: 3 }, TEST),
  u('412th Test Wing', 'air_wing', 'wing', base('Edwards AFB, CA', 34.9, -117.88), { f35a: 10, f22a: 6, f16c: 10, f15e: 4, b1b: 1, kc46a: 2 }, TEST),

  // Air National Guard and Air Force Reserve fighter wings
  u('158th Fighter Wing (VT ANG)', 'air_wing', 'wing', base('Burlington ANGB, VT', 44.47, -73.15), { f35a: 20 }, ANG),
  u('115th Fighter Wing (WI ANG)', 'air_wing', 'wing', base('Truax Field, WI', 43.14, -89.34), { f35a: 20 }, ANG),
  u('187th Fighter Wing (AL ANG)', 'air_wing', 'wing', base('Montgomery ANGB, AL', 32.3, -86.39), { f35a: 20 }, ANG),
  u('125th Fighter Wing (FL ANG)', 'air_wing', 'wing', base('Jacksonville ANGB, FL', 30.49, -81.69), { f35a: 18 }, ANG),
  u('301st Fighter Wing (AFRC)', 'air_wing', 'wing', base('NAS JRB Fort Worth, TX', 32.77, -97.44), { f35a: 24 }, ANG),
  u('142nd Wing (OR ANG)', 'air_wing', 'wing', base('Portland ANGB, OR', 45.59, -122.6), { f15ex: 18 }, ANG),
  u('173rd Fighter Wing (OR ANG, F-15 schoolhouse)', 'air_wing', 'wing', base('Kingsley Field, OR', 42.16, -121.73), { f15ex: 12, f15c: 6 }, ANG),
  u('104th Fighter Wing (MA ANG)', 'air_wing', 'wing', base('Barnes ANGB, MA', 42.16, -72.72), { f15c: 18 }, ANG),
  u('144th Fighter Wing (CA ANG)', 'air_wing', 'wing', base('Fresno ANGB, CA', 36.78, -119.72), { f15c: 18 }, ANG),
  u('159th Fighter Wing (LA ANG)', 'air_wing', 'wing', base('NAS JRB New Orleans, LA', 29.83, -90.03), { f15c: 18 }, ANG),
  u('113th Wing (DC ANG)', 'air_wing', 'wing', base('Joint Base Andrews, MD', 38.81, -76.87), { f16c: 18 }, ANG),
  u('114th Fighter Wing (SD ANG)', 'air_wing', 'wing', base('Joe Foss Field, SD', 43.58, -96.74), { f16c: 18 }, ANG),
  u('138th Fighter Wing (OK ANG)', 'air_wing', 'wing', base('Tulsa ANGB, OK', 36.2, -95.89), { f16c: 18 }, ANG),
  u('140th Wing (CO ANG)', 'air_wing', 'wing', base('Buckley SFB, CO', 39.7, -104.75), { f16c: 18 }, ANG),
  u('148th Fighter Wing (MN ANG)', 'air_wing', 'wing', base('Duluth ANGB, MN', 46.84, -92.19), { f16c: 18 }, ANG),
  u('149th Fighter Wing (TX ANG)', 'air_wing', 'wing', base('JBSA-Lackland, TX', 29.38, -98.58), { f16c: 24 }, ANG),
  u('162nd Wing (AZ ANG, F-16 schoolhouse)', 'air_wing', 'wing', base('Tucson ANGB, AZ', 32.12, -110.94), { f16c: 40 }, ANG),
  u('169th Fighter Wing (SC ANG)', 'air_wing', 'wing', base('McEntire JNGB, SC', 33.92, -80.8), { f16c: 24 }, ANG),
  u('177th Fighter Wing (NJ ANG)', 'air_wing', 'wing', base('Atlantic City ANGB, NJ', 39.46, -74.58), { f16c: 18 }, ANG),
  u('180th Fighter Wing (OH ANG)', 'air_wing', 'wing', base('Toledo ANGB, OH', 41.59, -83.81), { f16c: 18 }, ANG),
  u('482nd Fighter Wing (AFRC)', 'air_wing', 'wing', base('Homestead ARB, FL', 25.49, -80.38), { f16c: 24 }, ANG),
  u('122nd Fighter Wing (IN ANG)', 'air_wing', 'wing', base('Fort Wayne ANGB, IN', 40.98, -85.19), { a10c: 21 }, ANG),
  u('124th Fighter Wing (ID ANG)', 'air_wing', 'wing', base('Gowen Field, ID', 43.56, -116.22), { a10c: 18 }, ANG),
  u('127th Wing (MI ANG)', 'air_wing', 'wing', base('Selfridge ANGB, MI', 42.61, -82.83), { a10c: 18, kc135r: 8 }, ANG),
  u('175th Wing (MD ANG)', 'air_wing', 'wing', base('Martin State ANGB, MD', 39.33, -76.41), { a10c: 18 }, ANG),
  u('442nd Fighter Wing (AFRC)', 'air_wing', 'wing', base('Whiteman AFB, MO', 38.73, -93.55), { a10c: 21 }, ANG),

  // Mobility, C2ISR and special operations
  u('6th Air Refueling Wing', 'logistics', 'wing', base('MacDill AFB, FL', 27.85, -82.52), { kc135r: 24 }, ACTIVE),
  u('22nd Air Refueling Wing', 'logistics', 'wing', base('McConnell AFB, KS', 37.62, -97.27), { kc46a: 36 }, ACTIVE),
  u('92nd Air Refueling Wing', 'logistics', 'wing', base('Fairchild AFB, WA', 47.62, -117.66), { kc135r: 36 }, ACTIVE),
  u('97th Air Mobility Wing (training)', 'logistics', 'wing', base('Altus AFB, OK', 34.67, -99.27), { kc46a: 8, kc135r: 8, c17a: 8 }, TEST),
  u('305th Air Mobility Wing', 'logistics', 'wing', base('JB McGuire-Dix-Lakehurst, NJ', 40.02, -74.59), { kc46a: 24, c17a: 13 }, ACTIVE),
  u('60th Air Mobility Wing', 'logistics', 'wing', base('Travis AFB, CA', 38.26, -121.93), { kc46a: 24, c17a: 13, c5m: 16 }, ACTIVE),
  u('62nd Airlift Wing', 'logistics', 'wing', base('JB Lewis-McChord, WA', 47.14, -122.48), { c17a: 40 }, ACTIVE),
  u('437th Airlift Wing', 'logistics', 'wing', base('JB Charleston, SC', 32.9, -80.04), { c17a: 41 }, ACTIVE),
  u('436th Airlift Wing', 'logistics', 'wing', base('Dover AFB, DE', 39.13, -75.47), { c5m: 18, c17a: 13 }, ACTIVE),
  u('19th Airlift Wing', 'logistics', 'wing', base('Little Rock AFB, AR', 34.92, -92.15), { c130j: 60 }, ACTIVE),
  u('317th Airlift Wing', 'logistics', 'wing', base('Dyess AFB, TX', 32.42, -99.85), { c130j: 28 }, ACTIVE),
  u('100th Air Refueling Wing', 'logistics', 'wing', base('RAF Mildenhall', 52.36, 0.49), { kc135r: 15 }, ACTIVE),
  u('86th Airlift Wing', 'logistics', 'wing', base('Ramstein AB', 49.44, 7.6), { c130j: 14 }, ACTIVE),
  u('374th Airlift Wing', 'logistics', 'wing', base('Yokota AB', 35.75, 139.35), { c130j: 14 }, ACTIVE),
  u('379th Air Expeditionary Wing', 'logistics', 'wing', base('Al Udeid AB, Qatar', 25.12, 51.31), { kc135r: 20, kc46a: 4 }, ACTIVE),
  u('ANG/AFRC air refueling wings, eastern US (aggregate of 101st, 108th, 157th, 171st, 459th, 916th ARW and others)', 'logistics', 'wing', base('Pease ANGB, NH', 43.08, -70.82), { kc135r: 90, kc46a: 24 }, ANG),
  u('ANG/AFRC air refueling wings, central and western US (aggregate of 126th, 128th, 134th, 141st, 151st, 155th, 185th, 190th, 452nd ARW and others)', 'logistics', 'wing', base('Rickenbacker ANGB, OH', 39.81, -82.93), { kc135r: 110 }, ANG),
  u('ANG/AFRC strategic airlift wings (aggregate of 105th, 164th, 167th, 172nd, 445th, 512th AW and others)', 'logistics', 'wing', base('Stewart ANGB, NY', 41.5, -74.1), { c17a: 70, c5m: 18 }, ANG),
  u('ANG/AFRC tactical airlift wings (aggregate)', 'logistics', 'wing', base('Pope Field, NC', 35.17, -79.01), { c130j: 150 }, ANG),
  u('552nd Air Control Wing', 'air_wing', 'wing', base('Tinker AFB, OK', 35.41, -97.39), { e3g: 12 }, ACTIVE),
  u('55th Wing', 'air_wing', 'wing', base('Offutt AFB, NE', 41.12, -95.91), { rc135: 17 }, ACTIVE),
  u('319th Reconnaissance Wing', 'air_wing', 'wing', base('Grand Forks AFB, ND', 47.95, -97.4), { rq4: 9 }, ACTIVE),
  u('1st Special Operations Wing', 'air_wing', 'wing', base('Hurlburt Field, FL', 30.43, -86.69), { ac130j: 15, cv22b: 16 }, ACTIVE),
  u('27th Special Operations Wing', 'air_wing', 'wing', base('Cannon AFB, NM', 34.38, -103.32), { ac130j: 15, cv22b: 10, mq9a: 24 }, ACTIVE),
  u('352nd Special Operations Wing', 'air_wing', 'wing', base('RAF Mildenhall', 52.36, 0.49), { cv22b: 10 }, ACTIVE),
];
