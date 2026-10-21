import type { Echelon, MunitionKind, NationId } from '../../core/types';
import type { Band, HqLevel } from './state';

/**
 * What one electronic-warfare system jams: the radius it reaches and how much of each band it denies
 * inside it (0..1). Bands: satellite navigation, communications (tactical radio, satellite phones
 * and drone datalinks), and radar. Airborne jammers' effect on SAM engagements is the air system's
 * escort model; here they jam only communications.
 */
export interface EmitterSpec {
  radiusKm: number;
  gnss: number;
  comms: number;
  radar: number;
}

export const EMITTERS: Readonly<Record<string, EmitterSpec>> = {
  // 1RL257 Krasukha-4: X/Ku-band against airborne and LEO imaging radars, 150-300 km (Army Recognition; McDermott, ICDS 2017).
  krasukha4: { radiusKm: 300, gnss: 0, comms: 0, radar: 0.5 },
  // R-340RP Pole-21: GNSS L1/L2 jammer on masts, ~25 km per station (manufacturer; RUSI "Stormbreak", 2023).
  pole21: { radiusKm: 25, gnss: 0.9, comms: 0, radar: 0 },
  // R-330Zh Zhitel: GPS, Iridium/Inmarsat terminals and GSM, 100-2000 MHz, 20-25 km on the ground (Protek; McDermott 2017).
  zhitel: { radiusKm: 25, gnss: 0.7, comms: 0.3, radar: 0 },
  // RB-301B Borisoglebsk-2: HF/VHF tactical radio and drone control links (McDermott 2017). Radius estimate.
  borisoglebsk2: { radiusKm: 25, gnss: 0, comms: 0.35, radar: 0 },
  // RB-341V Leer-3: Orlan-10 airborne GSM jammers, 6 km each, worked up to 120 km out (McDermott 2017). Area estimate.
  leer3: { radiusKm: 30, gnss: 0, comms: 0.2, radar: 0 },
  // Bukovel-AD: counter-UAS control-link and GNSS jamming (Proximus; Ukrainian MoD), built to protect a position
  // from drones rather than deny an area; Ukraine's EW stayed far thinner than Russia's through 2023-25 (RUSI). Radius estimate.
  bukovel: { radiusKm: 15, gnss: 0.3, comms: 0.3, radar: 0 },
  // TLS-BCT: US Army brigade signals-intelligence and EW system, fielded from 2024. Radius estimate.
  tls_bct: { radiusKm: 30, gnss: 0.3, comms: 0.3, radar: 0 },
  // EC-37B / EC-130H Compass Call: stand-off communications jamming. Radius estimate.
  ec37b: { radiusKm: 150, gnss: 0, comms: 0.5, radar: 0 },
  // EA-18G Growler and J-16D: ALQ-227 communications countermeasures; their radar jamming is the air system's escort model.
  ea18g: { radiusKm: 150, gnss: 0, comms: 0.25, radar: 0 },
  j16d: { radiusKm: 150, gnss: 0, comms: 0.25, radar: 0 },
};

/**
 * Electronic-warfare systems a nation's formations carry organically when the order of battle does not
 * list them, by echelon. Russian density follows RUSI's count of one major EW system per ~10 km of
 * front, sited ~7 km behind the line (Watling and Reynolds, "Stormbreak", Sept 2023): a division's EW
 * battalion holds ~3 GNSS jammers plus radio and GSM jammers; each army's EW brigade adds strategic sets
 * such as Krasukha-4 (McDermott, "Russia's Electronic Warfare Capabilities to 2025", ICDS 2017).
 * Ukrainian brigades field fewer, smaller counter-UAS sets (RUSI 2023). Counts are estimates.
 */
export const ORGANIC_EW: Readonly<Record<string, Partial<Record<Echelon | 'hq', Record<string, number>>>>> = {
  RUS: {
    division: { pole21: 3, zhitel: 1, borisoglebsk2: 1, leer3: 1 },
    brigade: { pole21: 2, zhitel: 1, leer3: 1 },
    hq: { krasukha4: 1, borisoglebsk2: 2, zhitel: 2 },
  },
  UKR: { brigade: { bukovel: 1 } },
  USA: { brigade: { tls_bct: 1 }, division: { tls_bct: 2 } },
};

/** Formation kinds that carry the organic EW of their echelon: manoeuvre forces and their fire support. */
export const ORGANIC_KINDS: ReadonlySet<string> = new Set(['maneuver', 'artillery']);

/**
 * Share of a weapon's effect lost inside full GNSS jamming, and inside full datalink jamming for
 * weapons flown by an operator over radio. Excalibur's success rate fell from ~70% to ~6% under
 * Russian jamming (Ukrainian assessment reported by the Washington Post, 24 May 2024); GMLRS and
 * JDAM-ER also lost much of their accuracy (RUSI "Stormbreak" 2023; leaked Pentagon assessment, April
 * 2023). Cruise and ballistic missiles fall back on INS, terrain matching or terminal seekers.
 * Ukraine lost ~10,000 drones a month in 2023, mostly to Russian EW (Watling and Reynolds,
 * "Meatgrinder", RUSI, May 2023). Estimates beyond those cases.
 */
export interface Vulnerability { gnss: number; link: number }
export const VULN: Partial<Record<MunitionKind, Vulnerability>> = {
  guided_shell: { gnss: 0.9, link: 0 },
  guided_rocket: { gnss: 0.6, link: 0 },
  glide_bomb: { gnss: 0.75, link: 0 },
  guided_bomb: { gnss: 0.6, link: 0 },
  drone_oneway: { gnss: 0.5, link: 0 },
  loitering: { gnss: 0, link: 0.7 },
  cruise: { gnss: 0.15, link: 0 },
  srbm: { gnss: 0.25, link: 0 },
  mrbm: { gnss: 0.15, link: 0 },
  irbm: { gnss: 0.1, link: 0 },
  hgv: { gnss: 0.1, link: 0 },
};

/**
 * Weapons that differ from their kind: laser-guided bombs, rockets and shells ignore GNSS jamming;
 * controlled-reception-pattern antennas (Kometa-M on UMPK glide kits and Geran/Shahed drones; Conflict
 * Armament Research 2023) shrug off most of it; FPV drones are flown over a radio link, unless they
 * trail a fibre-optic cable.
 */
export const VULN_OVERRIDE: Readonly<Record<string, Vulnerability>> = {
  gbu12: { gnss: 0, link: 0 }, kab500l: { gnss: 0, link: 0 }, apkws: { gnss: 0, link: 0 }, krasnopol: { gnss: 0, link: 0 },
  paveway4: { gnss: 0.3, link: 0 }, kab1500: { gnss: 0.3, link: 0 },
  fab500_umpk: { gnss: 0.25, link: 0 }, fab1500_umpk: { gnss: 0.25, link: 0 }, fab3000_umpk: { gnss: 0.25, link: 0 },
  shahed136: { gnss: 0.2, link: 0 }, shahed238: { gnss: 0.2, link: 0 },
  fpv: { gnss: 0, link: 0.75 }, fpv_fiber: { gnss: 0, link: 0 },
};

/** Kinds counted as drones in the EW loss tally. */
export const DRONE_KINDS: ReadonlySet<MunitionKind> = new Set(['loitering', 'drone_oneway']);

/**
 * The most each band can be denied however many jammers overlap: some GNSS fixes still get through
 * (Excalibur kept ~6% of hits, above), frequency-hopping radios and satellite terminals mostly
 * work through jamming, and radars burn through near their targets. Estimates.
 */
export const BAND_MAX: Readonly<Record<Band, number>> = { gnss: 0.95, comms: 0.5, radar: 0.6 };

/** Chance a full radar-band jam denies an airborne ISR fix. Estimate. */
export const RADAR_DENIAL = 0.6;
/**
 * Share of a SAM site's fire-control channels a full radar-band jam takes away. Ground-based jammers
 * work against airborne sensors; a SAM's fire-control radar mostly burns through. Estimate.
 */
export const SAM_RADAR_DENIAL = 0.15;
/** Chance a full comms-band jam cuts an ISR drone's video link before it fixes a target. Estimate. */
export const ISR_LINK_DENIAL = 0.7;

/**
 * Share of a force's command traffic on each bearer. US expeditionary forces lean hardest on
 * satellites; Ukraine's front has run on Starlink terminals since 2022, as widely reported. All
 * shares are estimates.
 */
export interface Bearers { satcom: number; radio: number; fibre: number }
export const BEARERS: Readonly<Record<string, Bearers>> = {
  USA: { satcom: 0.5, radio: 0.35, fibre: 0.15 },
  GBR: { satcom: 0.35, radio: 0.45, fibre: 0.2 },
  FRA: { satcom: 0.35, radio: 0.45, fibre: 0.2 },
  UKR: { satcom: 0.4, radio: 0.45, fibre: 0.15 },
  RUS: { satcom: 0.1, radio: 0.6, fibre: 0.3 },
  CHN: { satcom: 0.2, radio: 0.5, fibre: 0.3 },
};
export const DEFAULT_BEARERS: Bearers = { satcom: 0.15, radio: 0.55, fibre: 0.3 };

/** Whose military comms satellites a nation without its own uses: Ukraine runs on Starlink. */
export const SATCOM_PROVIDER: Readonly<Record<string, NationId>> = { UKR: 'USA' as NationId };

/** Fire a formation keeps with no communications at all: units fight on their last orders (mission command). Estimate. */
export const COMMS_FLOOR = 0.85;
/** Hours an order waits when communications are wholly cut. Estimate. */
export const COMMS_DELAY_H = 12;

/**
 * Per HQ level: share of subordinate fire lost with the HQ gone, hours its orders wait, days to
 * stand up a replacement, and the share of strike hits it shrugs off (bunkers, dispersal). Ukraine's
 * 2022 HIMARS strikes on Russian army command posts disrupted those armies for days and pushed HQs out
 * of range (Watling and Reynolds, "Preliminary Lessons", RUSI, Nov 2022). Estimates.
 */
export const HQ: Readonly<Record<HqLevel, { fire: number; delayH: number; recoverDays: number; hardness: number }>> = {
  army: { fire: 0.3, delayH: 48, recoverDays: 5, hardness: 0 },
  front: { fire: 0.25, delayH: 36, recoverDays: 7, hardness: 0.3 },
  national: { fire: 0.1, delayH: 24, recoverDays: 10, hardness: 0.9 },
};

/**
 * Chance one precision weapon that reaches an HQ's cell hits the HQ (an imprecise one, a third of that):
 * a strike on something else in the cell, where a dispersed command post is a few km² of a cell of
 * thousands, and a strike aimed at the command bunkers there (target class 'hardened'), as Ukraine's
 * 2022 HIMARS raids on Russian command posts located by their emissions were. Estimates.
 */
export const HQ_HIT_PER_WEAPON = 0.002;
export const HQ_AIMED_HIT_PER_WEAPON = 0.15;
/** Integrity a strike hit takes off an HQ. */
export const HQ_HIT_DAMAGE = 0.6;
/** CEP, m, at or under which a weapon counts as precision against a command post. */
export const PRECISION_CEP_M = 30;

/** Side of the square, degrees, that groups formations with no named higher HQ under one derived front HQ. */
export const FRONT_CELL_DEG = 6;

export const BANDS: readonly Band[] = ['gnss', 'comms', 'radar'];
