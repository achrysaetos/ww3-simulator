import type { NationId } from '../../core/types';
import type { AirDefencePledge, Alliance, PeaceTreaty } from './types';

const ids = (s: string) => s.split(' ') as NationId[];

const NATO = ids(
  'ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR USA',
);
const EU = ids('AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE');
const AU = ids(
  'DZA AGO BEN BWA BFA BDI CPV CMR CAF TCD COM COD COG CIV DJI EGY GNQ ERI SWZ ETH GAB GMB GHA GIN GNB KEN LSO LBR LBY MDG ' +
    'MWI MLI MRT MUS MAR MOZ NAM NER NGA RWA STP SEN SYC SLE SOM ZAF SSD SDN TZA TGO TUN UGA ZMB ZWE',
);
/**
 * "The Pacific area" of the US treaties in Asia, which none of them bounds. Judgment: East and
 * Southeast Asia, Oceania and the Pacific Ocean to the US west coast, Alaska and Hawaii.
 */
const PACIFIC = [{ lonMin: 95 }, { lonMax: -115 }];
const ARAB_LEAGUE = ids('DZA BHR COM DJI EGY IRQ JOR KWT LBN LBY MRT MAR OMN PSE QAT SAU SOM SDN SYR TUN ARE YEM');

/**
 * Treaties and groupings, current to late 2025. Diplomacy reads `obligation`, `triggers` and
 * `commitment` to decide who joins a war; `blocs` on each nation is derived from this table.
 * Commitment values are estimates calibrated on treaty wording and observed behavior.
 */
export const alliances: Alliance[] = [
  {
    id: 'NATO', name: 'North Atlantic Treaty Organization', members: NATO, obligation: 'collective_defense',
    triggers: ['attack_on_territory', 'attack_on_forces'], commitment: 0.85, nuclearGuarantors: ids('USA GBR FRA'),
    // Art. 6 limits Art. 5 to members' territory and forces in Europe, North America, Turkey, the Mediterranean
    // and the North Atlantic north of the Tropic of Cancer: not Hawaii, Guam or the Gulf.
    area: { boxes: [{ latMin: 23.44, lonMax: 45 }] },
    source: 'North Atlantic Treaty Arts. 4-6; Finland joined Apr 2023, Sweden Mar 2024',
  },
  {
    id: 'EU', name: 'European Union', members: EU, obligation: 'collective_defense', triggers: ['attack_on_territory'],
    // Art. 42(7) TEU obliges "aid and assistance by all the means in their power" but defers to NATO and to neutrals' policies.
    commitment: 0.45,
    // The Irish clause: Art. 42(7) "shall not prejudice the specific character" of neutral members' policy,
    // so the neutrals are covered without being bound to fight for others.
    protectedOnly: ids('AUT CYP IRL MLT'),
    source: 'Treaty on European Union Art. 42(7); invoked once (France, Nov 2015)',
  },
  {
    id: 'CSTO', name: 'Collective Security Treaty Organization', members: ids('RUS BLR KAZ KGZ TJK'),
    obligation: 'collective_defense', triggers: ['attack_on_territory'], commitment: 0.4, nuclearGuarantors: ids('RUS'),
    // Armenia froze participation in Feb 2024 after the CSTO declined to help in 2021-22; it is left out.
    // CSTO deployed only once (Kazakhstan, Jan 2022), and for an internal crisis.
    source: 'Collective Security Treaty Art. 4; Pashinyan statements Feb and Jun 2024',
  },
  {
    id: 'RUS-BLR', name: 'Union State security guarantees', members: ids('RUS BLR'), obligation: 'collective_defense',
    triggers: ['attack_on_territory', 'threat_to_security'], commitment: 0.9, nuclearGuarantors: ids('RUS'),
    inForce: '2024-12-06', source: 'Treaty on Security Guarantees within the Union State, Dec 2024; Russian nuclear doctrine Nov 2024 covers Belarus',
  },
  {
    id: 'RUS-PRK', name: 'Treaty on Comprehensive Strategic Partnership', members: ids('RUS PRK'),
    obligation: 'bilateral_defense', triggers: ['attack_on_territory'], commitment: 0.7,
    // Art. 4: immediate military assistance "with all means at its disposal". DPRK troops fought in Kursk, late 2024.
    inForce: '2024-06-19', source: 'Russia-DPRK treaty, Pyongyang, 19 Jun 2024, Art. 4',
  },
  {
    id: 'RUS-IRN', name: 'Russia-Iran Comprehensive Strategic Partnership', members: ids('RUS IRN'),
    // No mutual defense clause: each only pledges not to aid an aggressor against the other.
    obligation: 'consultation', triggers: ['threat_to_security'], commitment: 0.15,
    inForce: '2025-01-17', source: 'Treaty signed Moscow, 17 Jan 2025, Art. 3; Russia stayed out of the June 2025 Israel-Iran war',
  },
  {
    id: 'CHN-PRK', name: 'Sino-North Korean Mutual Aid and Cooperation Friendship Treaty', members: ids('CHN PRK'),
    obligation: 'bilateral_defense', triggers: ['attack_on_territory'],
    // Art. II reads as automatic, but Beijing has signalled it would not back a DPRK-initiated war.
    commitment: 0.55, source: '1961 treaty Art. II, renewed 2021; CSIS Korea Chair commentary',
  },
  {
    id: 'US-JPN', name: 'US-Japan Treaty of Mutual Cooperation and Security', members: ids('USA JPN'),
    obligation: 'bilateral_defense', triggers: ['attack_on_territory'], commitment: 0.85, nuclearGuarantors: ids('USA'),
    // Art. V covers "territories under the administration of Japan", which US presidents have said includes the Senkakus.
    // Japan owes nothing for an attack on the US elsewhere: its 2015 security laws allow collective self-defence only
    // in a "survival-threatening situation", decided case by case.
    protectedOnly: ids('JPN'),
    source: '1960 treaty Art. V; Obama 2014 and Biden 2022 Senkaku statements',
  },
  {
    id: 'US-KOR', name: 'US-ROK Mutual Defense Treaty', members: ids('USA KOR'), obligation: 'bilateral_defense',
    triggers: ['attack_on_territory', 'attack_on_forces'], commitment: 0.85, nuclearGuarantors: ids('USA'),
    // Art. III: "an armed attack in the Pacific area on either of the Parties".
    area: { boxes: PACIFIC },
    source: '1953 treaty Art. III; Washington Declaration 2023 (Nuclear Consultative Group); ~28,500 US troops',
  },
  {
    id: 'US-PHL', name: 'US-Philippines Mutual Defense Treaty', members: ids('USA PHL'), obligation: 'bilateral_defense',
    // Art. IV/V cover public vessels, aircraft and coast guard "anywhere in the South China Sea" (2019, 2023 US statements).
    triggers: ['attack_on_territory', 'attack_on_forces'], commitment: 0.7, nuclearGuarantors: ids('USA'),
    // Art. V: the metropolitan territory of either party, its Pacific islands, and its forces in the Pacific.
    area: { homeland: true, boxes: PACIFIC },
    source: '1951 treaty Arts. IV-V; Pompeo 2019, Blinken 2023; EDCA sites',
  },
  {
    id: 'ANZUS', name: 'ANZUS Treaty', members: ids('AUS USA'), obligation: 'bilateral_defense',
    // US obligations to New Zealand have been suspended since 1986, so NZL is not a party here.
    triggers: ['attack_on_territory', 'attack_on_forces'], commitment: 0.85, nuclearGuarantors: ids('USA'),
    // Art. V: the metropolitan territory of either party (so 9/11 counted), its Pacific islands, and its forces in the Pacific.
    area: { homeland: true, boxes: PACIFIC },
    source: 'ANZUS 1951 Arts. IV-V; invoked by Australia Sept 2001',
  },
  {
    id: 'US-TWN-TRA', name: 'Taiwan Relations Act', members: ids('USA TWN'), obligation: 'ambiguous',
    triggers: ['attack_on_territory'], protectedOnly: ids('TWN'),
    // Strategic ambiguity: the TRA requires arms sales and treating coercion as "of grave concern", not intervention.
    // Biden said four times (2021-22) the US would defend Taiwan; the administration walked each back.
    commitment: 0.55, source: 'Taiwan Relations Act 1979, 22 USC 3301; CRS IF10275',
  },
  {
    id: 'US-ISR', name: 'US-Israel strategic partnership', members: ids('USA ISR'), obligation: 'ambiguous',
    triggers: ['attack_on_territory'], protectedOnly: ids('ISR'),
    // No treaty, but US forces intercepted Iranian strikes in Apr and Oct 2024 and struck Fordow in Jun 2025.
    commitment: 0.75, source: '2016 MOU; US-Israel Strategic Partnership Act 2014; CRS RL33222',
  },
  {
    id: 'US-COFA', name: 'Compacts of Free Association', members: ids('USA FSM MHL PLW'), obligation: 'bilateral_defense',
    triggers: ['attack_on_territory'], protectedOnly: ids('FSM MHL PLW'), commitment: 0.95, nuclearGuarantors: ids('USA'),
    source: 'Compacts of Free Association, renewed 2023-24: US holds full defense authority',
  },
  {
    id: 'US-THA', name: 'Manila Pact / Thanat-Rusk communique', members: ids('USA THA'), obligation: 'consultation',
    triggers: ['threat_to_security'], commitment: 0.25, source: 'Southeast Asia Collective Defense Treaty 1954; Thanat-Rusk 1962',
  },
  {
    id: 'AUKUS', name: 'AUKUS', members: ids('AUS GBR USA'), obligation: 'consultation', triggers: ['threat_to_security'],
    commitment: 0.3, source: 'AUKUS joint statements 2021, 2023 (technology partnership, no defense clause)',
  },
  {
    id: 'Quad', name: 'Quadrilateral Security Dialogue', members: ids('USA JPN IND AUS'), obligation: 'consultation',
    triggers: ['threat_to_security'], commitment: 0.15, source: 'Quad Leaders joint statements 2021-2024',
  },
  {
    id: 'Five Eyes', name: 'Five Eyes intelligence alliance', members: ids('USA GBR CAN AUS NZL'), obligation: 'consultation',
    triggers: ['threat_to_security'], commitment: 0.3, source: 'UKUSA Agreement 1946',
  },
  {
    id: 'FPDA', name: 'Five Power Defence Arrangements', members: ids('GBR AUS NZL MYS SGP'), obligation: 'consultation',
    triggers: ['attack_on_territory', 'threat_to_security'], commitment: 0.3, source: 'FPDA 1971: consult on attack on Malaysia or Singapore',
  },
  {
    id: 'Rio Treaty', name: 'Inter-American Treaty of Reciprocal Assistance', obligation: 'collective_defense',
    // Mexico left 2004; Bolivia, Ecuador, Nicaragua 2012-14; Venezuela 2013.
    members: ids('ARG BHS BRA CHL COL CRI DOM SLV GTM HTI HND PAN PRY PER TTO URY USA'),
    triggers: ['attack_on_territory'], commitment: 0.3,
    source: 'TIAR 1947 Art. 3; organ of consultation decides measures; not honored for Argentina in 1982',
  },
  {
    id: 'GCC', name: 'Gulf Cooperation Council', members: ids('SAU ARE QAT KWT BHR OMN'), obligation: 'collective_defense',
    triggers: ['attack_on_territory'], commitment: 0.45,
    source: 'GCC Joint Defence Agreement 2000; Peninsula Shield deployment to Bahrain 2011',
  },
  {
    id: 'SAU-PAK', name: 'Strategic Mutual Defence Agreement', members: ids('SAU PAK'), obligation: 'bilateral_defense',
    triggers: ['attack_on_territory'], commitment: 0.5,
    // Whether Pakistan's nuclear umbrella extends to Saudi Arabia is unstated; not modeled as a guarantee.
    inForce: '2025-09-17', source: 'Saudi-Pakistan SMDA, Riyadh, 17 Sep 2025',
  },
  {
    id: 'TUR-AZE', name: 'Shusha Declaration', members: ids('TUR AZE'), obligation: 'bilateral_defense',
    triggers: ['attack_on_territory'], commitment: 0.6, inForce: '2021-06-15', source: 'Shusha Declaration on Allied Relations, Jun 2021',
  },
  {
    id: 'FRA-ARE', name: 'France-UAE defence agreement', members: ids('FRA ARE'), obligation: 'bilateral_defense',
    triggers: ['attack_on_territory'], commitment: 0.5, source: 'France-UAE defence agreement 2009; French base in Abu Dhabi',
  },
  {
    id: 'FRA-GRC', name: 'France-Greece strategic partnership', members: ids('FRA GRC'), obligation: 'bilateral_defense',
    // Mutual assistance clause matters mainly against Turkey, a NATO ally Art. 5 does not cover.
    triggers: ['attack_on_territory'], commitment: 0.5, inForce: '2021-09-28', source: 'Franco-Greek agreement Sep 2021, Art. 2',
  },
  {
    id: 'Arab League', name: 'League of Arab States', members: ARAB_LEAGUE, obligation: 'collective_defense',
    triggers: ['attack_on_territory'], commitment: 0.1,
    source: 'Joint Defence and Economic Cooperation Treaty 1950 Art. 2; never invoked as a bloc since 1973',
  },
  {
    id: 'SCO', name: 'Shanghai Cooperation Organisation', members: ids('CHN RUS IND PAK KAZ KGZ TJK UZB IRN BLR'),
    obligation: 'none', triggers: [], commitment: 0, source: 'SCO Charter 2002; Iran 2023, Belarus 2024',
  },
  {
    id: 'BRICS', name: 'BRICS', members: ids('BRA RUS IND CHN ZAF EGY ETH IRN ARE IDN'), obligation: 'none', triggers: [],
    // Saudi Arabia was invited in 2024 but has not confirmed membership.
    commitment: 0, source: 'BRICS Kazan declaration 2024; Indonesia joined Jan 2025',
  },
  { id: 'AU', name: 'African Union', members: AU, obligation: 'none', triggers: [], commitment: 0, source: 'Constitutive Act 2000' },
  {
    id: 'ASEAN', name: 'Association of Southeast Asian Nations', members: ids('BRN KHM IDN LAO MYS MMR PHL SGP THA VNM TLS'),
    obligation: 'none', triggers: [], commitment: 0, source: 'ASEAN Charter; Timor-Leste admitted Oct 2025',
  },
];

export const allianceById: Record<string, Alliance> = Object.fromEntries(alliances.map((a) => [a.id, a]));

/** Treaties that oblige `nation` to fight (not merely consult) when `ally` is attacked. */
export function defenseObligations(nation: NationId, ally: NationId): Alliance[] {
  return alliances.filter(
    (a) =>
      (a.obligation === 'collective_defense' || a.obligation === 'bilateral_defense' || a.obligation === 'ambiguous') &&
      a.members.includes(nation) && a.members.includes(ally) && nation !== ally && !a.protectedOnly?.includes(nation),
  );
}

const pair = (s: string) => ids(s) as [NationId, NationId];

/** Peace treaties and normalisation agreements that keep a party out of alliance wars against the other. */
export const peaceTreaties: PeaceTreaty[] = [
  { between: pair('EGY ISR'), source: 'Egypt-Israel Peace Treaty, 26 Mar 1979; Egypt stayed out of the 1982, 2006 and 2023-25 wars' },
  { between: pair('JOR ISR'), source: 'Israel-Jordan Treaty of Peace (Wadi Araba), 26 Oct 1994' },
  { between: pair('ARE ISR'), inForce: '2020-09-15', source: 'Abraham Accords, 15 Sep 2020' },
  { between: pair('BHR ISR'), inForce: '2020-09-15', source: 'Abraham Accords, 15 Sep 2020' },
  { between: pair('MAR ISR'), inForce: '2020-12-22', source: 'Israel-Morocco normalisation, 22 Dec 2020' },
  { between: pair('SDN ISR'), inForce: '2021-01-06', source: 'Sudan signed the Abraham Accords declaration, 6 Jan 2021' },
];

/**
 * Air defence given to a state under attack without joining its war. On 13-14 Apr 2024 the US,
 * the UK, France and Jordan intercepted most of about 300 Iranian drones and missiles aimed at
 * Israel, none of them at war with Iran (US DoD and UK MoD statements, 14 Apr 2024); US forces did
 * so again on 1 Oct 2024. Jordan engaged what crossed its own airspace.
 */
export const airDefencePledges: AirDefencePledge[] = [
  { donor: 'USA' as NationId, recipient: 'ISR' as NationId, source: 'CENTCOM intercepts, 13-14 Apr and 1 Oct 2024' },
  { donor: 'GBR' as NationId, recipient: 'ISR' as NationId, source: 'RAF Typhoons from Akrotiri, 13-14 Apr 2024 (UK MoD)' },
  { donor: 'FRA' as NationId, recipient: 'ISR' as NationId, source: 'French air force intercepts, 13-14 Apr 2024 (Elysee)' },
  { donor: 'JOR' as NationId, recipient: 'ISR' as NationId, source: 'Jordanian air force over Jordan, 13-14 Apr 2024 (Jordanian government)' },
];
