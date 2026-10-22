/**
 * The workaround ladder (issue #2, section 3): a nation cut off from a supplier, by sanctions, war or a
 * naval blockade of its ports, does not sit at a fixed share of what still arrives. It climbs rungs that
 * each ramp in after their own delay: rerouting through third countries, rationing and price-driven
 * demand cuts, new and neutral suppliers and shadow fleets, the overland routes it has, and substitution
 * at home. Drawing down stocks, the first rung, is the economy's buffers (drawSupply, drawOil).
 *
 * New and neutral suppliers come out of one pool of spare neutral supply that every cut-off nation
 * competes for, so in a world war the rung shrinks for all. A sanctioning or blockading side tightens
 * as the shadow trade grows, boarding tankers and designating fronts: a race of leak rates.
 *
 * Pure functions over NationEconomy.cuts and EconomyState.neutralPool, which the economy writes.
 */
import type { GameMap } from '../../core/map';
import type { NationId } from '../../core/types';
import { paramTable, tableParam } from '../../core/params';
import { BASELINE_SANCTIONS } from '../../data/industry';

export type CutKind = 'sanctions' | 'war' | 'blockade';
/**
 * What a coverage share is of: all traded goods (for output), a traded commodity, one whose stock
 * draw already restrains demand (ResourceSpec.rationing, so the ration rung would count it twice),
 * or an export-controlled input.
 */
export type FlowKind = 'goods' | 'commodity' | 'rationed' | 'controlled';
export const RUNGS = ['reroute', 'ration', 'neutral', 'overland', 'substitute'] as const;
export type RungId = (typeof RUNGS)[number];

/** One cut-off a nation is climbing out of: why it was cut, and how many months it has been working on it. */
export interface Cut {
  kind: CutKind;
  months: number;
}
/** The cut-off key of a naval blockade of the nation's own ports; other cut-offs are keyed by the partner nation. */
export const SEA = 'sea';

const L = paramTable('economy.ladder', {
  rerouteFromMonths: tableParam({ value: 0.25, range: [0, 0.5], tag: 'estimated', affects: 'how fast sanctioned trade reroutes',
    source: 'Issue #2 s.3: rerouting takes days to 4 weeks (Russian imports via China, Turkey, Central Asia from spring 2022; KSE)' }),
  rerouteToMonths: tableParam({ value: 1, range: [0.5, 3], tag: 'estimated', affects: 'how fast sanctioned trade reroutes',
    source: 'Issue #2 s.3: rerouting takes days to 4 weeks (Russian imports via China, Turkey, Central Asia from spring 2022; KSE)' }),
  rerouteSanctions: tableParam({ value: 0.55, range: [0.4, 0.7], tag: 'estimated', affects: 'trade a sanctioned nation recovers by rerouting',
    source: 'Bank of Russia BoP: goods imports -15% in 2022, near 2021 levels by 2023; with the other rungs, 80% of goods arrive once mature' }),
  rationFromMonths: tableParam({ value: 1, range: [0.5, 2], tag: 'estimated', affects: 'how fast demand adjusts to a supply cut',
    source: 'Issue #2 s.3: ration and price-driven demand cuts take 1-6 months (EU gas demand -15% by winter 2022-23)' }),
  rationToMonths: tableParam({ value: 6, range: [3, 9], tag: 'estimated', affects: 'how fast demand adjusts to a supply cut',
    source: 'Issue #2 s.3: ration and price-driven demand cuts take 1-6 months (EU gas demand -15% by winter 2022-23)' }),
  rationWar: tableParam({ value: 0.1, range: [0.05, 0.2], tag: 'estimated', affects: 'shortfall met by cutting demand under a war cut-off',
    source: 'EU Council Regulation 2022/1369: 15% gas demand cut target, ~18% achieved Aug 2022-Mar 2023 (Eurostat)' }),
  rationBlockade: tableParam({ value: 0.15, range: [0.05, 0.25], tag: 'estimated', affects: 'shortfall met by cutting demand under blockade',
    source: 'EU Council Regulation 2022/1369: 15% gas demand cut target, ~18% achieved Aug 2022-Mar 2023 (Eurostat)' }),
  neutralFromMonths: tableParam({ value: 3, range: [1, 6], tag: 'estimated', affects: 'how fast new and neutral suppliers and shadow fleets appear',
    source: 'Issue #2 s.3: new or neutral suppliers and shadow fleets take 3-12 months (Russia shadow fleet from Dec 2022 price cap)' }),
  neutralToMonths: tableParam({ value: 12, range: [6, 18], tag: 'estimated', affects: 'how fast new and neutral suppliers and shadow fleets appear',
    source: 'Issue #2 s.3: new or neutral suppliers and shadow fleets take 3-12 months (Russia shadow fleet from Dec 2022 price cap)' }),
  neutralSanctions: tableParam({ value: 0.3, range: [0.15, 0.45], tag: 'judgment', affects: 'trade a sanctioned nation wins from new suppliers',
    source: 'Judgment: KSE 2024 put ~70% of Russian seaborne crude on shadow tankers; halved by enforcement at maturity' }),
  neutralWar: tableParam({ value: 0.3, range: [0.1, 0.5], tag: 'judgment', affects: 'lost enemy supply replaced from neutral suppliers',
    source: 'Judgment: neutral suppliers replace part of a lost enemy supplier, as Asian buyers replaced Europe for Russian oil in 2023 (IEA OMR)' }),
  neutralBlockade: tableParam({ value: 0.25, range: [0.05, 0.4], tag: 'judgment', affects: 'blockaded trade that runs the blockade',
    source: 'Judgment: blockade runners and shadow fleets get part of a blockaded trade through (Wise, Lifeline of the Confederacy, 1988)' }),
  neutralIslandBlockade: tableParam({ value: 0.03, range: [0, 0.1], tag: 'estimated', affects: 'blockaded trade that runs the blockade into a nation with no land border',
    source: 'USSBS, Oil in Japan\'s War (1946): no neutral shipping reached Japan under the 1944-45 blockade and its oil imports fell to nothing by April 1945' }),
  overlandBlockade: tableParam({ value: 0.05, range: [0, 0.15], tag: 'judgment', affects: 'blockaded trade moved over land borders',
    source: 'Issue #2 s.3: existing overland routes are fixed and usually small (rail and pipelines vs sea volumes, UNCTAD 2024)' }),
  substituteFromMonths: tableParam({ value: 12, range: [6, 18], tag: 'estimated', affects: 'how fast home substitution replaces imports',
    source: 'Issue #2 s.3: process substitution takes 1-3 years (Russian import substitution 2014-17; CBR)' }),
  substituteToMonths: tableParam({ value: 36, range: [24, 48], tag: 'estimated', affects: 'how fast home substitution replaces imports',
    source: 'Issue #2 s.3: process substitution takes 1-3 years (Russian import substitution 2014-17; CBR)' }),
  substituteSanctions: tableParam({ value: 0.1, range: [0.05, 0.2], tag: 'judgment', affects: 'imports a sanctioned nation replaces at home',
    source: 'Judgment: Russian import substitution replaced a small share of Western imports in 2014-17 (CBR; Connolly 2018)' }),
  substituteWar: tableParam({ value: 0.15, range: [0.05, 0.3], tag: 'judgment', affects: 'lost enemy supply replaced at home',
    source: 'Judgment: wartime substitution (synthetic fuel and rubber in WWII Germany and the US) took 1-3 years (Harrison 1998)' }),
  substituteBlockade: tableParam({ value: 0.1, range: [0.05, 0.3], tag: 'judgment', affects: 'blockaded imports replaced at home',
    source: 'Judgment: wartime substitution (synthetic fuel and rubber in WWII Germany and the US) took 1-3 years (Harrison 1998)' }),
  controlledLeak: tableParam({ value: 0.375, range: [0.2, 0.6], tag: 'estimated', affects: 'export-controlled inputs that reach a cut-off nation',
    source: 'KSE 2023-24: Western chips reach Russia via China, Turkey, Central Asia; set so 30% arrive once mature, as before' }),
  enforceMax: tableParam({ value: 0.5, range: [0.2, 0.8], tag: 'judgment', affects: 'how much a blockader or sanctioner closes the shadow trade',
    source: 'Judgment: OFAC and EU tanker designations from late 2023 idled part of the shadow fleet (KSE 2024; S&P Global)' }),
  enforceFromMonths: tableParam({ value: 6, range: [3, 12], tag: 'estimated', affects: 'how fast the blockader tightens',
    source: 'G7 price cap Dec 2022, first OFAC shadow-tanker designations Oct 2023 (~10 months; US Treasury)' }),
  enforceToMonths: tableParam({ value: 18, range: [12, 30], tag: 'estimated', affects: 'how fast the blockader tightens',
    source: 'G7 price cap Dec 2022, first OFAC shadow-tanker designations Oct 2023 (~10 months; US Treasury)' }),
  neutralSpare: tableParam({ value: 0.05, range: [0.02, 0.15], tag: 'judgment', affects: 'how much new supply neutral exporters can offer all cut-off nations',
    source: 'Judgment: spare exporting capacity of ~5%; OPEC+ spare oil capacity ran 3-5% of world supply in 2023-24 (IEA OMR)' }),
  unwindPerMonth: tableParam({ value: 2, range: [1, 4], tag: 'judgment', affects: 'how fast workarounds lapse once a cut-off ends',
    source: 'Judgment: rerouted and shadow trade lapses faster than it was built once normal trade reopens' }),
});

/** Months after which a cut-off has climbed every rung; cut-offs the 2024 baseline already carries start here. */
const MATURE_MONTHS = 60;

/**
 * Wars whose cut-offs the 2024 baseline already carries: Russia and Ukraine have not traded since
 * February 2022 (State Statistics Service of Ukraine), so their workarounds are mature at any 2026 start.
 */
const BASELINE_WARS: readonly (readonly [string, string])[] = [['RUS', 'UKR']];

interface RungSpec {
  from: () => number;
  to: () => number;
  cap: Partial<Record<CutKind, (landBorder: boolean) => number>>;
  /** Demand cuts make up a shortfall in what a nation needs, not trade that arrives. */
  needsOnly?: true;
  /** Draws on the shared neutral pool, and is what a sanctioner or blockader tightens against. */
  neutral?: true;
  /** Only for a nation with a land border. */
  overland?: true;
}

const RUNG: Readonly<Record<RungId, RungSpec>> = {
  reroute: { from: () => L.rerouteFromMonths, to: () => L.rerouteToMonths, cap: { sanctions: () => L.rerouteSanctions } },
  ration: { from: () => L.rationFromMonths, to: () => L.rationToMonths, cap: { war: () => L.rationWar, blockade: () => L.rationBlockade }, needsOnly: true },
  neutral: { from: () => L.neutralFromMonths, to: () => L.neutralToMonths, cap: { sanctions: () => L.neutralSanctions, war: () => L.neutralWar, blockade: (landBorder) => (landBorder ? L.neutralBlockade : L.neutralIslandBlockade) }, neutral: true },
  overland: { from: () => 0, to: () => 0, cap: { blockade: () => L.overlandBlockade }, overland: true },
  substitute: { from: () => L.substituteFromMonths, to: () => L.substituteToMonths, cap: { sanctions: () => L.substituteSanctions, war: () => L.substituteWar, blockade: () => L.substituteBlockade } },
};

const ramp = (months: number, from: number, to: number): number => (months >= to ? 1 : months <= from ? 0 : (months - from) / (to - from));

/** Share of the neutral and shadow trade the sanctioner or blockader has not yet shut, 0..1; war cut-offs have no enforcer. */
const unenforced = (cut: Cut): number => (cut.kind === 'war' ? 1 : 1 - L.enforceMax * ramp(cut.months, L.enforceFromMonths, L.enforceToMonths));

/** Each rung's share of the lost flow it has won back, before the shared pool rations the neutral rung. */
export function rungShares(cut: Cut, flow: FlowKind, landBorder: boolean, pool: number): Record<RungId, number> {
  const out = {} as Record<RungId, number>;
  for (const id of RUNGS) {
    const r = RUNG[id];
    const cap = r.cap[cut.kind];
    let x = cap && !(r.needsOnly && (flow === 'goods' || flow === 'rationed')) && !(r.overland && !landBorder) ? cap(landBorder) * ramp(cut.months, r.from(), r.to()) : 0;
    if (r.neutral) x *= unenforced(cut) * pool;
    if (flow === 'controlled') x *= L.controlledLeak;
    out[id] = x;
  }
  return out;
}

/** Share of the flow lost to a cut-off that the ladder has won back so far, 0..1. */
export function coverage(cut: Cut, flow: FlowKind, landBorder: boolean, pool: number): number {
  const r = rungShares(cut, flow, landBorder, pool);
  return Math.min(1, r.reroute + r.ration + r.neutral + r.overland + r.substitute);
}

/** What the cut-off asks of the shared neutral pool: its neutral rung's share before rationing. */
export const neutralAsk = (cut: Cut, landBorder: boolean): number => (RUNG.neutral.cap[cut.kind]?.(landBorder) ?? 0) * ramp(cut.months, RUNG.neutral.from(), RUNG.neutral.to()) * unenforced(cut);

/** Spare neutral supply on offer, as a share of what neutral economies trade. */
export const neutralSpare = (): number => L.neutralSpare;

/** Moves a nation's cut-offs on by a tick: present ones climb, ended ones unwind and are dropped. Starts new ones at the bottom, or mature for those the baseline carries. */
export function advanceCuts(cuts: Record<string, Cut>, nation: NationId, present: ReadonlyMap<string, CutKind>, dtMonths: number): void {
  for (const [key, kind] of present) {
    const cut = cuts[key];
    if (cut) {
      cut.kind = kind;
      cut.months += dtMonths;
    } else cuts[key] = { kind, months: inBaseline(nation, key, kind) ? MATURE_MONTHS : dtMonths };
  }
  for (const key of Object.keys(cuts)) {
    if (present.has(key)) continue;
    cuts[key].months -= L.unwindPerMonth * dtMonths;
    if (cuts[key].months <= 0) delete cuts[key];
  }
}

function inBaseline(nation: NationId, partner: string, kind: CutKind): boolean {
  if (kind === 'sanctions') return !!BASELINE_SANCTIONS[nation]?.includes(partner) || !!BASELINE_SANCTIONS[partner]?.includes(nation);
  return kind === 'war' && BASELINE_WARS.some(([a, b]) => (a === nation && b === partner) || (b === nation && a === partner));
}

const borderCache = new WeakMap<GameMap, Set<NationId>>();
/** Nations with a land border: some home cell next to another nation's land. */
export function hasLandBorder(map: GameMap, nation: NationId): boolean {
  let set = borderCache.get(map);
  if (!set) {
    set = new Set();
    for (let n = 0; n < map.landCount; n++)
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
        const m = map.adj[k];
        if (m < map.landCount && map.owner[m] && map.owner[n] && map.owner[m] !== map.owner[n]) set.add(map.owner[n] as NationId);
      }
    borderCache.set(map, set);
  }
  return set.has(nation);
}
