import { defineParam } from '../../core/params';
import type { Echelon, MunitionKind, NationId } from '../../core/types';
import type { Band, HqLevel } from './state';

/**
 * What one electronic-warfare system jams: the radius it reaches and how much of each band it denies
 * inside it (0..1). Bands: satellite navigation, communications (tactical radio and satellite
 * phones), radar, and the control and video links of drones flown at the cell. Airborne jammers'
 * effect on SAM engagements is the air system's escort model; here they jam only communications.
 * A `point` system protects the positions of the troops carrying it, in their own cell and against
 * drones flown at them from the cells around it, instead of denying an area.
 */
export interface EmitterSpec {
  radiusKm: number;
  gnss: number;
  comms: number;
  radar: number;
  drone: number;
  point?: true;
}

export const EMITTERS: Readonly<Record<string, EmitterSpec>> = {
  // 1RL257 Krasukha-4: X/Ku-band against airborne and LEO imaging radars, 150-300 km (Army Recognition; McDermott, ICDS 2017).
  krasukha4: { radiusKm: 300, gnss: 0, comms: 0, radar: 0.5, drone: 0 },
  // R-340RP Pole-21: GNSS L1/L2 jammer on masts, ~25 km per station (manufacturer; RUSI "Stormbreak", 2023).
  pole21: { radiusKm: 25, gnss: 0.9, comms: 0, radar: 0, drone: 0 },
  // R-330Zh Zhitel: GPS, Iridium/Inmarsat terminals and GSM, 100-2000 MHz, 20-25 km on the ground (Protek; McDermott 2017).
  zhitel: { radiusKm: 25, gnss: 0.7, comms: 0.3, radar: 0, drone: 0.2 },
  // RB-301B Borisoglebsk-2: HF/VHF tactical radio and drone control links (McDermott 2017). Radius estimate.
  borisoglebsk2: { radiusKm: 25, gnss: 0, comms: 0.35, radar: 0, drone: 0.35 },
  // RB-341V Leer-3: Orlan-10 airborne GSM jammers, 6 km each, worked up to 120 km out (McDermott 2017). Area estimate.
  leer3: { radiusKm: 30, gnss: 0, comms: 0.2, radar: 0, drone: 0 },
  // Bukovel-AD: counter-UAS control-link and GNSS jamming (Proximus; Ukrainian MoD), built to protect a position
  // from drones rather than deny an area; Ukraine's EW stayed far thinner than Russia's through 2023-25 (RUSI). Radius estimate.
  bukovel: { radiusKm: 15, gnss: 0.3, comms: 0.3, radar: 0, drone: 0.4 },
  // TLS-BCT: US Army brigade signals-intelligence and EW system, fielded from 2024. Radius estimate.
  tls_bct: { radiusKm: 30, gnss: 0.3, comms: 0.3, radar: 0, drone: 0.2 },
  // EC-37B / EC-130H Compass Call: stand-off communications jamming. Radius estimate.
  ec37b: { radiusKm: 150, gnss: 0, comms: 0.5, radar: 0, drone: 0 },
  // EA-18G Growler and J-16D: ALQ-227 communications countermeasures; their radar jamming is the air system's escort model.
  ea18g: { radiusKm: 150, gnss: 0, comms: 0.25, radar: 0, drone: 0 },
  j16d: { radiusKm: 150, gnss: 0, comms: 0.25, radar: 0, drone: 0 },
  // Trench and vehicle counter-FPV jammers (Russian Silok, Piranha and Volnorez; Ukrainian Harpoon and
  // Kvertus sets): each covers a platoon position against drones' control and video links. Fielded
  // in the tens of thousands on both sides by 2024 (RUSI, "Stormbreak" and "Protecting the Force from
  // Uncrewed Aerial Systems", 2023-24). Denial is the share of a brigade's positions one set covers. Estimate.
  trench_ew: { radiusKm: 2, gnss: 0, comms: 0, radar: 0, drone: 0.12, point: true },
  // GNSS jammers and spoofers ringing a city against one-way attack drones: Ukraine's air force reports
  // a share of every Shahed wave "lost locally" to EW (2024-25 daily reports); Russia rings Moscow and
  // Kaliningrad, whose GNSS jamming has disrupted Baltic aviation since 2023 (Estonian, Finnish and
  // Lithuanian aviation authorities). Radius and denial are estimates.
  city_gnss: { radiusKm: 40, gnss: 0.6, comms: 0, radar: 0, drone: 0 },
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
    division: { pole21: 3, zhitel: 1, borisoglebsk2: 1, leer3: 1, trench_ew: 16 },
    brigade: { pole21: 2, zhitel: 1, leer3: 1, trench_ew: 10 },
    hq: { krasukha4: 1, borisoglebsk2: 2, zhitel: 2 },
  },
  UKR: { brigade: { bukovel: 1, trench_ew: 8 } },
  USA: { brigade: { tls_bct: 1 }, division: { tls_bct: 2 } },
};

/**
 * Fixed EW sites a nation at war runs around its cities and bases, by the cell they stand in:
 * GNSS denial against one-way attack drones and cruise missiles (see city_gnss).
 */
export const SITE_EW: readonly { nation: string; name: string; lat: number; lon: number; kit: Record<string, number> }[] = [
  { nation: 'UKR', name: 'Kyiv', lat: 50.45, lon: 30.52, kit: { city_gnss: 3 } },
  { nation: 'UKR', name: 'Kharkiv', lat: 50.0, lon: 36.23, kit: { city_gnss: 2 } },
  { nation: 'UKR', name: 'Odesa', lat: 46.48, lon: 30.73, kit: { city_gnss: 2 } },
  { nation: 'UKR', name: 'Dnipro', lat: 48.46, lon: 35.05, kit: { city_gnss: 2 } },
  { nation: 'UKR', name: 'Zaporizhzhia', lat: 47.84, lon: 35.14, kit: { city_gnss: 2 } },
  { nation: 'UKR', name: 'Lviv', lat: 49.84, lon: 24.03, kit: { city_gnss: 1 } },
  { nation: 'RUS', name: 'Moscow', lat: 55.75, lon: 37.62, kit: { city_gnss: 3 } },
  { nation: 'RUS', name: 'Kaliningrad', lat: 54.71, lon: 20.51, kit: { city_gnss: 3, pole21: 4 } },
  { nation: 'RUS', name: 'Sevastopol', lat: 44.6, lon: 33.52, kit: { city_gnss: 2 } },
];

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
  fpv_fiber: { gnss: 0, link: 0 },
};

/**
 * Share of radio-flown FPV strikes a full drone-band jam defeats. At the 2023-24 peak Ukraine lost
 * some 10,000 drones a month, mostly to Russian EW (Watling and Reynolds, "Meatgrinder", RUSI, May
 * 2023), and both sides' operators claim 60-90% of radio FPVs fail against dense trench EW. These
 * are combatant claims. The measure-countermeasure cycle (frequency hopping, autonomous terminal
 * guidance, fibre-optic control) moves it over the war: the seam for issue #2, section 3.
 */
export const FPV_LINK_VULN = defineParam({
  id: 'c2.FPV_LINK_VULN', value: 0.75, range: [0.3, 0.95], tag: 'contested',
  source: 'RUSI Meatgrinder (May 2023); Ukrainian and Russian operator claims 2023-25',
  affects: 'share of radio FPV strikes lost under full counter-drone jamming',
});

/** Kinds counted as drones in the EW loss tally. */
export const DRONE_KINDS: ReadonlySet<MunitionKind> = new Set(['loitering', 'drone_oneway']);

/**
 * The most each band can be denied however many jammers overlap: some GNSS fixes still get through
 * (Excalibur kept ~6% of hits, above), frequency-hopping radios and satellite terminals mostly
 * work through jamming, and radars burn through near their targets. Estimates.
 */
export const BAND_MAX: Readonly<Record<Exclude<Band, 'drone'>, number>> = { gnss: 0.95, comms: 0.5, radar: 0.6 };
/**
 * The most counter-drone jamming over a position denies: some links hop past it and some drones
 * strike on their last command or with terminal autonomy. Judgment.
 */
export const DRONE_BAND_MAX = defineParam({
  id: 'c2.DRONE_BAND_MAX', value: 0.8, range: [0.5, 0.95], tag: 'judgment',
  source: 'judgment: frequency hopping and terminal autonomy let some drones through any jamming (RUSI 2024)',
  affects: 'the strongest counter-drone jamming over a position',
});

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
  // A front (Russian grouping of forces, Ukrainian operational-strategic group) directs its armies and corps, which fight on without it for a while.
  front: { fire: 0.1, delayH: 12, recoverDays: 7, hardness: 0.3 },
  national: { fire: 0.1, delayH: 24, recoverDays: 10, hardness: 0.9 },
};

/**
 * Share of a field HQ's lost function its alternate command post takes back. Doctrine keeps a
 * main, an alternate and a tactical CP so that losing one does not stop the battle (US FM 6-0,
 * ch. 1; Russian practice since 2022 of dispersed and duplicated CPs, RUSI "Preliminary Lessons",
 * Nov 2022). Judgment.
 */
export const ALTERNATE_CP = defineParam({
  id: 'c2.ALTERNATE_CP', value: 0.5, range: [0, 0.8], tag: 'judgment',
  source: 'US FM 6-0 main/alternate/tactical CPs; RUSI Preliminary Lessons (Nov 2022)',
  affects: 'how much of an HQ hit its subordinates feel',
});

/**
 * Most formations one army or corps HQ commands before a new one stands up. Ukraine's 2025 corps
 * reform puts five to eight brigades under each army corps (Ukrainian MoD, Feb-Jun 2025); NATO
 * and Russian corps and combined-arms armies command two to four divisions plus a few brigades.
 */
export const CORPS_SPAN = 8;
/** Furthest a formation stands from a corps HQ it joins, km: a corps sector is some 100-200 km of front. Judgment. */
export const CORPS_REACH_KM = 200;
/**
 * Km of extra distance to its troops an HQ accepts rather than share a cell with another of its
 * nation's HQs. After Ukraine's HIMARS raids of summer 2022 Russia dispersed its command posts
 * and pulled them back beyond 80 km (RUSI, Nov 2022). Judgment.
 */
export const HQ_SPACING_KM = 100;
/** Days a struck HQ stays out of the cell it was hit in: it displaces and does not come back while the enemy watches it. Judgment. */
export const DISPLACE_DAYS = 3;

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

/**
 * What each deception measure (Order.deception) costs the enemy's sensors and the formation itself.
 * Russia's 2021-22 build-up was watched for months on commercial imagery and intercepts because it
 * massed in the open and talked on the radio; Ukraine's Kharkiv counter-offensive (Sept 2022) and
 * Kursk incursion (Aug 2024) achieved surprise through radio silence, dispersal and camouflage, and
 * feints in the south (RUSI, "Preliminary Lessons", Nov 2022; ISW, Aug 2024). Values are judgment.
 */
export const DECEPTION = {
  /** Multiplier on the chance overhead and across-the-line sensors fix a dispersed, camouflaged formation in a tick. */
  dispersedSeen: defineParam({ id: 'c2.DISPERSED_SEEN', value: 0.25, range: [0.1, 0.5], tag: 'judgment', source: 'judgment: Kharkiv Sept 2022, Kursk Aug 2024 (RUSI; ISW)', affects: 'detection of dispersed formations' }),
  /** The same for a formation under radio silence: emissions are how most units are first found. */
  emconSeen: defineParam({ id: 'c2.EMCON_SEEN', value: 0.5, range: [0.2, 0.8], tag: 'judgment', source: 'judgment: signals intercepts located most Russian units in 2022 (RUSI)', affects: 'detection of formations under emission control' }),
  /** Strength a feinting formation shows to the enemy's sensors, as a multiple of its own. */
  feintScale: defineParam({ id: 'c2.FEINT_SCALE', value: 3, range: [1.5, 5], tag: 'judgment', source: 'judgment: a battalion simulating a brigade by its radio nets and vehicle movement', affects: 'apparent strength of feinting formations' }),
  /** A dispersed formation's fire: its weapons cannot all bear on one place. */
  dispersedFire: defineParam({ id: 'c2.DISPERSED_FIRE', value: 0.8, range: [0.6, 0.95], tag: 'judgment', source: 'judgment', affects: 'fire of dispersed formations' }),
  /** A dispersed formation's march speed: it moves by bounds between hides. */
  dispersedMarch: defineParam({ id: 'c2.DISPERSED_MARCH', value: 0.5, range: [0.3, 0.8], tag: 'judgment', source: 'judgment', affects: 'march speed of dispersed formations' }),
};

/**
 * A nation attacked without warning of the attacker's build-up in the days before: its forces are
 * caught in garrison, half-manned and without orders, as Israel's on 6 October 1973 (reserves took
 * 48-72 hours to reach the Golan and the canal) and the Soviet Union's in June 1941. For the hours
 * below its formations' fire and order delay suffer. Judgment.
 */
export const SURPRISE = {
  hours: defineParam({ id: 'c2.SURPRISE_HOURS', value: 72, range: [24, 120], tag: 'judgment', source: 'judgment: Israeli reserve mobilisation, Oct 1973 (48-72 h)', affects: 'how long a nation attacked without warning stays unready' }),
  fire: defineParam({ id: 'c2.SURPRISE_FIRE', value: 0.6, range: [0.4, 0.9], tag: 'judgment', source: 'judgment: units caught in garrison and under-manned', affects: 'fire of a surprised nation\'s formations' }),
  delayH: defineParam({ id: 'c2.SURPRISE_DELAY_H', value: 12, range: [4, 24], tag: 'judgment', source: 'judgment: plans unready, commanders away', affects: 'extra order delay in a surprised nation' }),
  /** Days a warning counts: one older than this was dismissed or forgotten by the time the blow fell. */
  memoryDays: 14,
};

/** Side of the square, degrees, of the region one derived front HQ directs. */
export const FRONT_CELL_DEG = 6;

export const BANDS: readonly Band[] = ['gnss', 'comms', 'radar', 'drone'];
