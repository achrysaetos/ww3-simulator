import type { Government, NationId } from '../../core/types';
import type { NuclearThreshold, ObjectiveKind, StrategicObjective, StrategicProfile } from './types';

type Knobs = Pick<StrategicProfile, 'riskTolerance' | 'casualtyTolerance' | 'escalationPropensity' | 'regimeStability' | 'allianceReliability' | 'warAims'>;

/**
 * Baseline knobs by regime type, used for every nation without an entry in PROFILES.
 * Estimates grounded in the regime-type literature: democracies pick wars they expect to
 * win quickly and lose support as casualties mount (Reiter and Stam, "Democracies at War",
 * 2002; Gelpi, Feaver and Reifler, "Paying the Human Costs of War", 2009); personalist and
 * military regimes initiate conflict more and survive defeat less often (Weeks, "Strongmen
 * and Straw Men", APSR 2012); alliance reliability tracks regime type (Leeds, "Do Alliances
 * Deter Aggression?", 2003: democracies honor treaty obligations more often).
 */
const BY_GOVERNMENT: Record<Government, Knobs> = {
  liberal_democracy: { riskTolerance: 0.3, casualtyTolerance: 0.3, escalationPropensity: 0.25, regimeStability: 0.9, allianceReliability: 0.75, warAims: { territorial_defense: 0.6, alliance_defense: 0.4 } },
  flawed_democracy: { riskTolerance: 0.35, casualtyTolerance: 0.35, escalationPropensity: 0.3, regimeStability: 0.8, allianceReliability: 0.65, warAims: { territorial_defense: 0.6, alliance_defense: 0.4 } },
  hybrid: { riskTolerance: 0.4, casualtyTolerance: 0.45, escalationPropensity: 0.35, regimeStability: 0.6, allianceReliability: 0.5, warAims: { territorial_defense: 0.7, regime_survival: 0.3 } },
  authoritarian: { riskTolerance: 0.45, casualtyTolerance: 0.6, escalationPropensity: 0.45, regimeStability: 0.65, allianceReliability: 0.45, warAims: { regime_survival: 0.5, territorial_defense: 0.5 } },
  totalitarian: { riskTolerance: 0.55, casualtyTolerance: 0.85, escalationPropensity: 0.6, regimeStability: 0.75, allianceReliability: 0.4, warAims: { regime_survival: 0.7, territorial_defense: 0.3 } },
  theocracy: { riskTolerance: 0.5, casualtyTolerance: 0.75, escalationPropensity: 0.5, regimeStability: 0.6, allianceReliability: 0.4, warAims: { regime_survival: 0.6, territorial_defense: 0.4 } },
  military_junta: { riskTolerance: 0.5, casualtyTolerance: 0.6, escalationPropensity: 0.45, regimeStability: 0.35, allianceReliability: 0.35, warAims: { regime_survival: 0.7, territorial_defense: 0.3 } },
  monarchy: { riskTolerance: 0.3, casualtyTolerance: 0.3, escalationPropensity: 0.3, regimeStability: 0.75, allianceReliability: 0.5, warAims: { regime_survival: 0.6, territorial_defense: 0.4 } },
};

/**
 * Regime stability for states the Fund for Peace Fragile States Index 2024 puts on "High
 * Alert" or worse (score above ~100) or under active insurgency. Overrides the regime default.
 */
const FRAGILE: Record<string, number> = {
  SOM: 0.15, YEM: 0.15, SSD: 0.15, COD: 0.2, SYR: 0.25, AFG: 0.35, SDN: 0.15, CAF: 0.2, TCD: 0.3, HTI: 0.1,
  MMR: 0.25, ETH: 0.35, MLI: 0.3, BFA: 0.25, NER: 0.3, LBY: 0.2, NGA: 0.45, CMR: 0.4, MOZ: 0.4, BDI: 0.35,
  ERI: 0.45, LBN: 0.35, IRQ: 0.45, PSE: 0.2, GIN: 0.35, ZWE: 0.4, VEN: 0.35,
};

/**
 * Per-state nuclear use thresholds. See NuclearThreshold for semantics; sources:
 * USA: 2022 NPR ("extreme circumstances to defend the vital interests of the US or its allies").
 * RUS: Fundamentals (Nov 2024) para. 11, 19: conventional aggression posing a "critical threat to
 *   sovereignty and/or territorial integrity" of Russia or Belarus; attack on sites whose loss would
 *   undermine nuclear response. forceLossShare from leaked 2008-14 General Staff training files
 *   (Financial Times, 28 Feb 2024): loss of 20% of SSBNs, 30% of SSNs, or three cruisers. The 2024
 *   Kursk incursion (well under 1% of Russia's population) did not trigger use, hence 5%.
 * CHN: NFU; PLA "Science of Military Strategy" (2013) and Cunningham and Fravel (International
 *   Security, 2015) note conventional strikes on Chinese nuclear forces may be treated as nuclear.
 * IND: 2003 CCS doctrine: NFU, but retains the option against a major chemical or biological attack.
 * PAK: Lt Gen Kidwai's 2002 thresholds (Landau Network interview): loss of a large part of territory
 *   (space), destruction of a large part of land or air forces (military), economic strangulation,
 *   political destabilization. Values are estimates of "large part"; strangulation is read as a
 *   30% fall in output, also an estimate. Political destabilization is not modelled.
 * FRA: Macron, Ecole de Guerre, 7 Feb 2020: vital interests have a European dimension; a single
 *   "final warning" strike precedes general use.
 * GBR: Integrated Review 2021: no NFU; reserves right against emerging technologies of comparable impact.
 * ISR: opacity; assessed last-resort "Samson" posture (Cohen, "The Worst-Kept Secret", 2010); the
 *   Oct 1973 nuclear alert came after early front-line collapse.
 * PRK: 2022 Law on the State Policy on Nuclear Forces, Art. 6: use when leadership or NC3 is attacked,
 *   when important strategic objects are struck, or to "take the initiative" as a war expands.
 *
 * Answers to a nuclear attack (`answer`):
 * USA: NPR 2022 "flexible and tailored" options; counterforce targeting under the 2020 Report on
 *   Nuclear Employment Strategy (no deliberate targeting of civilian populations).
 * RUS: Fundamentals (2024) para. 4 and 18, retaliation "inevitable"; the escalation-control
 *   literature (Kofman, Fink and Edmonds, CNA 2020) has calibrated, rising damage, forces first.
 * CHN: 2019 white paper and Cunningham and Fravel (2015): a limited arsenal for assured retaliation
 *   that can inflict unacceptable damage, with no doctrine of limited nuclear war: cities, at once.
 * IND: 2003 doctrine: "nuclear retaliation to a first strike will be massive and designed to inflict
 *   unacceptable damage".
 * PAK: full-spectrum deterrence (Kidwai 2015): battlefield to strategic rungs, forces first.
 * FRA: a single "final warning" before strikes on "centres of power" (Macron 2020).
 * GBR: a minimum deterrent sized against Moscow (the Moscow criterion), so cities at the top rung.
 * ISR, PRK: last-resort and regime-survival postures assessed as countervalue and massive.
 */
const NUCLEAR_THRESHOLDS: Record<string, NuclearThreshold> = {
  USA: { firstUse: true, coreLossShare: null, forceLossShare: null, economicLossShare: null, onStrategicAttack: true, onChemBio: true, coversAllies: true, answer: { scale: 'tailored', targets: 'counterforce' } },
  RUS: {
    firstUse: true, coreLossShare: 0.05, forceLossShare: 0.25, economicLossShare: null, onStrategicAttack: true, onChemBio: true, coversAllies: true,
    navalLoss: { ssbnShare: 0.2, ssnShare: 0.3, cruisers: 3 }, answer: { scale: 'tailored', targets: 'counterforce' },
  },
  CHN: { firstUse: false, coreLossShare: null, forceLossShare: null, economicLossShare: null, onStrategicAttack: true, onChemBio: false, coversAllies: false, answer: { scale: 'massive', targets: 'countervalue' } },
  IND: { firstUse: false, coreLossShare: null, forceLossShare: null, economicLossShare: null, onStrategicAttack: false, onChemBio: true, coversAllies: false, answer: { scale: 'massive', targets: 'countervalue' } },
  PAK: { firstUse: true, coreLossShare: 0.1, forceLossShare: 0.3, economicLossShare: 0.3, onStrategicAttack: true, onChemBio: true, coversAllies: false, answer: { scale: 'tailored', targets: 'counterforce' } },
  FRA: { firstUse: true, coreLossShare: 0.1, forceLossShare: null, economicLossShare: null, onStrategicAttack: true, onChemBio: false, coversAllies: true, answer: { scale: 'tailored', targets: 'countervalue' } },
  GBR: { firstUse: true, coreLossShare: 0.15, forceLossShare: null, economicLossShare: null, onStrategicAttack: true, onChemBio: true, coversAllies: true, answer: { scale: 'tailored', targets: 'countervalue' } },
  ISR: { firstUse: true, coreLossShare: 0.15, forceLossShare: 0.5, economicLossShare: null, onStrategicAttack: false, onChemBio: true, coversAllies: false, answer: { scale: 'massive', targets: 'countervalue' } },
  PRK: { firstUse: true, coreLossShare: 0.05, forceLossShare: 0.2, economicLossShare: null, onStrategicAttack: true, onChemBio: true, coversAllies: false, answer: { scale: 'massive', targets: 'countervalue' } },
};

/**
 * Any other armed state, such as a scenario or test nation armed by hand: it never uses first, and answers a nuclear
 * attack in kind, which every doctrine above also promises.
 */
const RETALIATION_ONLY: NuclearThreshold = { firstUse: false, coreLossShare: null, forceLossShare: null, economicLossShare: null, onStrategicAttack: false, onChemBio: false, coversAllies: false };

/** The one source of nuclear use thresholds: the sourced entry for `nation`, else retaliation only. */
export function nuclearThreshold(nation: string): NuclearThreshold {
  return NUCLEAR_THRESHOLDS[nation] ?? RETALIATION_ONLY;
}

const o = (id: string, kind: ObjectiveKind, targets: string, priority: 1 | 2 | 3, description: string): StrategicObjective => ({
  id, kind, targets: targets ? (targets.split(' ') as NationId[]) : [], priority, description,
});

const BALTIC_FRONTLINE: Partial<Knobs> = {
  riskTolerance: 0.35, casualtyTolerance: 0.7, escalationPropensity: 0.3, allianceReliability: 0.9,
  warAims: { territorial_defense: 0.6, alliance_defense: 0.4 },
};

/**
 * Hand-built profiles for states that shape a great-power war. Fields left out fall back
 * to the regime default. Knob values are estimates; the cited assessments set their order.
 */
const PROFILES: Record<string, Partial<Omit<StrategicProfile, 'nuclearThreshold'>>> = {
  // CRS IF10485 (Defense Primer: National Defense Strategy); 2022 NDS: China is the "pacing challenge".
  USA: {
    riskTolerance: 0.4, casualtyTolerance: 0.35, escalationPropensity: 0.35, regimeStability: 0.85, allianceReliability: 0.7,
    warAims: { alliance_defense: 0.4, sea_control: 0.3, territorial_defense: 0.2, regime_change: 0.1 },
    objectives: [
      o('usa-deter-china', 'deter', 'CHN', 1, 'Deny a Chinese fait accompli against Taiwan or Japan inside the first island chain'),
      o('usa-nato', 'defend_ally', 'POL EST LVA LTU FIN', 1, 'Uphold Article 5 on NATO\'s eastern flank'),
      o('usa-korea', 'defend_ally', 'KOR JPN', 1, 'Defend South Korea and Japan against North Korea'),
      o('usa-gulf', 'sea_control', 'IRN', 2, 'Keep the Strait of Hormuz and Red Sea open'),
    ],
  },
  // RAND RR-A198-1 (Russia's Military Interventions, 2021); ISW and RUSI assessments of war aims in Ukraine 2022-25.
  RUS: {
    riskTolerance: 0.65, casualtyTolerance: 0.85, escalationPropensity: 0.6, regimeStability: 0.75, allianceReliability: 0.5,
    warAims: { buffer_zone: 0.35, territorial_expansion: 0.3, regime_survival: 0.2, regional_hegemony: 0.15 },
    objectives: [
      o('rus-ukraine', 'annex', 'UKR', 1, 'Hold and extend annexed Donetsk, Luhansk, Zaporizhzhia, Kherson and Crimea; neutralize Ukraine'),
      o('rus-buffer', 'buffer', 'EST LVA LTU POL FIN', 2, 'Push NATO forces back from the western border and Kaliningrad corridor'),
      o('rus-belarus', 'defend_ally', 'BLR', 1, 'Keep Belarus inside the Union State'),
      o('rus-near-abroad', 'buffer', 'GEO MDA ARM KAZ', 3, 'Retain influence over the former Soviet periphery'),
    ],
  },
  // DoD China Military Power Report 2024; CSIS ChinaPower; 2049 "national rejuvenation" goal; Anti-Secession Law 2005.
  CHN: {
    riskTolerance: 0.4, casualtyTolerance: 0.6, escalationPropensity: 0.35, regimeStability: 0.85, allianceReliability: 0.35,
    warAims: { territorial_expansion: 0.35, sea_control: 0.3, regime_survival: 0.2, regional_hegemony: 0.15 },
    objectives: [
      o('chn-taiwan', 'unify', 'TWN', 1, 'Unify Taiwan, by force if peaceful means are exhausted (Anti-Secession Law Art. 8)'),
      o('chn-scs', 'sea_control', 'PHL VNM MYS', 2, 'Control the South China Sea inside the nine-dash line'),
      o('chn-ecs', 'annex', 'JPN', 2, 'Assert sovereignty over the Senkaku/Diaoyu islands'),
      o('chn-border', 'annex', 'IND', 3, 'Hold Aksai Chin and press the Arunachal Pradesh claim'),
      o('chn-deter-usa', 'deter', 'USA', 1, 'Keep US forces out of the first island chain (A2/AD)'),
    ],
  },
  GBR: {
    riskTolerance: 0.35, allianceReliability: 0.85,
    warAims: { alliance_defense: 0.6, sea_control: 0.2, territorial_defense: 0.2 },
    objectives: [
      o('gbr-nato', 'defend_ally', 'EST POL NOR', 1, 'Lead the forward land force in Estonia and secure the North Atlantic'),
      o('gbr-falklands', 'deter', 'ARG', 3, 'Defend the Falklands'),
    ],
  },
  FRA: {
    riskTolerance: 0.4, allianceReliability: 0.8,
    warAims: { alliance_defense: 0.5, territorial_defense: 0.3, sea_control: 0.2 },
    objectives: [
      o('fra-nato', 'defend_ally', 'ROU EST', 1, 'Lead the NATO battlegroup in Romania; reinforce the eastern flank'),
      o('fra-overseas', 'defend_ally', 'ARE GRC', 2, 'Honor bilateral clauses with the UAE and Greece'),
    ],
  },
  DEU: {
    allianceReliability: 0.75,
    objectives: [o('deu-lithuania', 'defend_ally', 'LTU POL', 1, 'Stand up the 45th Panzer Brigade in Lithuania (2027)')],
  },
  POL: {
    riskTolerance: 0.4, casualtyTolerance: 0.65, allianceReliability: 0.9,
    warAims: { territorial_defense: 0.6, alliance_defense: 0.3, buffer_zone: 0.1 },
    objectives: [o('pol-east', 'deter', 'RUS BLR', 1, 'Hold the Suwalki gap and the Belarus border (East Shield)')],
  },
  EST: { ...BALTIC_FRONTLINE, objectives: [o('est-deter', 'deter', 'RUS', 1, 'Survive until NATO reinforcement arrives')] },
  LVA: { ...BALTIC_FRONTLINE, objectives: [o('lva-deter', 'deter', 'RUS', 1, 'Survive until NATO reinforcement arrives')] },
  LTU: { ...BALTIC_FRONTLINE, objectives: [o('ltu-suwalki', 'deter', 'RUS BLR', 1, 'Keep the Suwalki corridor open')] },
  FIN: {
    casualtyTolerance: 0.75, allianceReliability: 0.85,
    objectives: [o('fin-deter', 'deter', 'RUS', 1, 'Total defense of the 1,340 km Russian border')],
  },
  // RUSI and ISW: Ukraine fights for survival; casualty tolerance high, Western support the binding constraint.
  UKR: {
    riskTolerance: 0.6, casualtyTolerance: 0.8, escalationPropensity: 0.5, regimeStability: 0.6, allianceReliability: 0.6,
    warAims: { restore_territory: 0.6, territorial_defense: 0.4 },
    objectives: [o('ukr-recover', 'recover', 'RUS', 1, 'Restore 1991 borders, including Crimea')],
  },
  BLR: {
    riskTolerance: 0.3, casualtyTolerance: 0.4, regimeStability: 0.6, allianceReliability: 0.6,
    objectives: [o('blr-survive', 'regime_survival', '', 1, 'Lukashenko regime survival under Russia\'s umbrella')],
  },
  // CSIS Korea Chair; 38 North; 2022 nuclear forces law; 2024 "two hostile states" doctrine.
  PRK: {
    riskTolerance: 0.7, casualtyTolerance: 0.95, escalationPropensity: 0.75, regimeStability: 0.75, allianceReliability: 0.6,
    warAims: { regime_survival: 0.8, territorial_expansion: 0.2 },
    objectives: [
      o('prk-survive', 'regime_survival', '', 1, 'Kim family regime survival'),
      o('prk-deter', 'deter', 'USA KOR', 1, 'Deter US-ROK attack with a survivable nuclear arsenal'),
      o('prk-south', 'unify', 'KOR', 3, 'Subjugate the South as the "principal enemy" if the opportunity arises'),
    ],
  },
  KOR: {
    casualtyTolerance: 0.55, allianceReliability: 0.8,
    objectives: [o('kor-deter', 'deter', 'PRK', 1, 'Kill-chain and massive retaliation against DPRK attack')],
  },
  // Japan National Security Strategy Dec 2022: counterstrike capability, defense spending to 2% of GDP by FY2027.
  JPN: {
    riskTolerance: 0.25, casualtyTolerance: 0.3, allianceReliability: 0.75,
    objectives: [
      o('jpn-southwest', 'deter', 'CHN', 1, 'Defend the Nansei islands and Senkakus'),
      o('jpn-dprk', 'deter', 'PRK', 1, 'Missile defense and counterstrike against DPRK'),
    ],
  },
  // Taiwan Quadrennial Defense Review 2025; RAND porcupine studies.
  TWN: {
    riskTolerance: 0.25, casualtyTolerance: 0.55, escalationPropensity: 0.2, allianceReliability: 0.6,
    warAims: { territorial_defense: 0.9, alliance_defense: 0.1 },
    objectives: [o('twn-survive', 'deter', 'CHN', 1, 'Deny a PLA landing until US and Japanese intervention')],
  },
  PHL: {
    objectives: [o('phl-scs', 'sea_control', 'CHN', 2, 'Hold Second Thomas Shoal and the exclusive economic zone')],
  },
  AUS: {
    allianceReliability: 0.85,
    warAims: { alliance_defense: 0.5, sea_control: 0.3, territorial_defense: 0.2 },
    objectives: [o('aus-north', 'sea_control', 'CHN', 2, 'Deny the northern approaches (Defence Strategic Review 2023)')],
  },
  VNM: {
    casualtyTolerance: 0.7, allianceReliability: 0.3,
    objectives: [o('vnm-scs', 'sea_control', 'CHN', 2, 'Hold Spratly features against China')],
  },
  // Carnegie and IISS on Indian strategy; Cold Start / proactive operations; Operation Sindoor May 2025.
  IND: {
    riskTolerance: 0.4, casualtyTolerance: 0.55, escalationPropensity: 0.35, allianceReliability: 0.35,
    warAims: { territorial_defense: 0.6, restore_territory: 0.2, regional_hegemony: 0.2 },
    objectives: [
      o('ind-pak', 'deter', 'PAK', 1, 'Punish cross-border terrorism below Pakistan\'s nuclear threshold'),
      o('ind-lac', 'deter', 'CHN', 1, 'Hold the Line of Actual Control in Ladakh and Arunachal Pradesh'),
      o('ind-kashmir', 'recover', 'PAK', 3, 'Recover Pakistan-administered Kashmir'),
    ],
  },
  // Stimson Center and Carnegie on Pakistani full-spectrum deterrence; Army-led state.
  PAK: {
    riskTolerance: 0.55, casualtyTolerance: 0.65, escalationPropensity: 0.6, regimeStability: 0.5, allianceReliability: 0.45,
    warAims: { territorial_defense: 0.6, restore_territory: 0.2, regime_survival: 0.2 },
    objectives: [
      o('pak-india', 'deter', 'IND', 1, 'Deter Indian conventional offensives with tactical nuclear weapons (Nasr)'),
      o('pak-kashmir', 'recover', 'IND', 2, 'Change the status of Indian-administered Kashmir'),
    ],
  },
  // INSS (Tel Aviv) strategic surveys; Begin doctrine; Oct 2023 - 2025 multi-front war.
  ISR: {
    riskTolerance: 0.65, casualtyTolerance: 0.5, escalationPropensity: 0.6, regimeStability: 0.75, allianceReliability: 0.5,
    warAims: { territorial_defense: 0.4, buffer_zone: 0.3, regime_change: 0.15, regional_hegemony: 0.15 },
    objectives: [
      o('isr-iran', 'deter', 'IRN', 1, 'Prevent an Iranian nuclear weapon (Begin doctrine)'),
      o('isr-borders', 'buffer', 'LBN SYR PSE', 1, 'Keep Hezbollah, Hamas and Syrian forces away from its borders'),
    ],
  },
  // IISS "Iran's Networks of Influence" (2019); CSIS Missile Threat; Axis of Resistance degraded 2024-25.
  IRN: {
    riskTolerance: 0.5, casualtyTolerance: 0.75, escalationPropensity: 0.5, regimeStability: 0.55, allianceReliability: 0.35,
    warAims: { regime_survival: 0.45, regional_hegemony: 0.4, territorial_defense: 0.15 },
    objectives: [
      o('irn-survive', 'regime_survival', '', 1, 'Survival of the Islamic Republic'),
      o('irn-proxies', 'proxy_influence', 'IRQ YEM LBN', 2, 'Project power through Hezbollah, the Houthis and Iraqi militias'),
      o('irn-hormuz', 'sea_control', 'USA ARE SAU', 2, 'Threaten closure of the Strait of Hormuz as deterrent'),
      o('irn-israel', 'deter', 'ISR USA', 1, 'Deter Israeli and US strikes on nuclear sites'),
    ],
  },
  SAU: {
    riskTolerance: 0.35, casualtyTolerance: 0.3, allianceReliability: 0.45,
    objectives: [
      o('sau-iran', 'deter', 'IRN', 1, 'Contain Iran and protect Abqaiq-class oil infrastructure'),
      o('sau-yemen', 'buffer', 'YEM', 2, 'Contain the Houthis on the southern border'),
    ],
  },
  ARE: {
    riskTolerance: 0.45, casualtyTolerance: 0.35,
    objectives: [o('are-influence', 'proxy_influence', 'SDN LBY YEM', 3, 'Shape outcomes in Sudan, Libya and Yemen through partners')],
  },
  // SWP and ECFR on Turkish strategy; Blue Homeland doctrine.
  TUR: {
    riskTolerance: 0.5, casualtyTolerance: 0.55, escalationPropensity: 0.4, regimeStability: 0.7, allianceReliability: 0.45,
    warAims: { territorial_defense: 0.4, regional_hegemony: 0.3, buffer_zone: 0.3 },
    objectives: [
      o('tur-syria', 'buffer', 'SYR', 2, 'Keep a buffer against the PKK/YPG in northern Syria'),
      o('tur-aegean', 'sea_control', 'GRC CYP', 3, 'Press Blue Homeland maritime claims'),
      o('tur-azerbaijan', 'defend_ally', 'AZE', 2, 'Back Azerbaijan under the Shusha Declaration'),
    ],
  },
  GRC: {
    casualtyTolerance: 0.5, allianceReliability: 0.6,
    objectives: [o('grc-aegean', 'deter', 'TUR', 1, 'Defend Aegean islands and Cyprus against Turkey')],
  },
  AZE: {
    riskTolerance: 0.55, casualtyTolerance: 0.6,
    warAims: { territorial_expansion: 0.4, territorial_defense: 0.4, regime_survival: 0.2 },
    objectives: [o('aze-zangezur', 'annex', 'ARM', 2, 'Open a corridor to Nakhchivan through Syunik')],
  },
  ARM: {
    riskTolerance: 0.2, allianceReliability: 0.3,
    objectives: [o('arm-defend', 'deter', 'AZE', 1, 'Hold Syunik against Azerbaijan')],
  },
  GEO: { objectives: [o('geo-occupied', 'recover', 'RUS', 3, 'Recover Abkhazia and South Ossetia')] },
  SRB: { objectives: [o('srb-kosovo', 'recover', 'XKX', 3, 'Restore sovereignty over Kosovo')] },
  // Crisis Group on the Essequibo dispute.
  VEN: {
    riskTolerance: 0.5,
    objectives: [o('ven-essequibo', 'annex', 'GUY', 3, 'Annex the Essequibo region of Guyana')],
  },
  EGY: {
    objectives: [o('egy-nile', 'deter', 'ETH', 2, 'Protect Nile water share against GERD')],
  },
  ETH: {
    objectives: [o('eth-sea', 'annex', 'ERI SOM', 3, 'Gain sovereign sea access (Assab or Somaliland)')],
  },
  DZA: { objectives: [o('dza-sahara', 'proxy_influence', 'MAR', 3, 'Back the Polisario in Western Sahara')] },
  HUN: { allianceReliability: 0.4 },
  CAN: { allianceReliability: 0.75 },
  SWE: { allianceReliability: 0.85, objectives: [o('swe-baltic', 'sea_control', 'RUS', 2, 'Secure Gotland and the Baltic Sea')] },
  NOR: { allianceReliability: 0.85, objectives: [o('nor-north', 'deter', 'RUS', 1, 'Watch the Kola Peninsula and the GIUK gap')] },
};

function build(gov: Government, id: string): StrategicProfile {
  const base = BY_GOVERNMENT[gov];
  const p = PROFILES[id] ?? {};
  return {
    ...base,
    regimeStability: FRAGILE[id] ?? base.regimeStability,
    objectives: [],
    nuclearThreshold: NUCLEAR_THRESHOLDS[id] ?? null,
    ...p,
  };
}

export function strategicProfiles(governments: Record<string, Government>): Record<string, StrategicProfile> {
  return Object.fromEntries(Object.entries(governments).map(([id, gov]) => [id, build(gov, id)]));
}
