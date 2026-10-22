import { atWar, relation, relationKey, relationMut, type SimContext } from '../../core/engine';
import { defineParam } from '../../core/params';
import type { EscalationLevel, NationId, NodeId, PlatformId, World } from '../../core/types';
import { isOverseas } from '../../data/territories';
import type { DiplomacyState, OutwardStep, WarRecord } from './types';
import { declareWar, raiseEscalation, sideOf } from './wars';

/**
 * Escalation pressure added per event. A dyad moves from 'conventional' to
 * 'strategic_conventional' once pressure reaches STRATEGIC_CONVENTIONAL_AT.
 * Weights are estimates ordered by how directly each event threatens the
 * state itself, following the triggers in Posen, "Inadvertent Escalation"
 * (1991) and the 2020 Russian "Basic Principles" (attacks on critical state
 * and strategic-force sites): a lone deep strike barely registers, a strike on
 * the capital or the loss of an SSBN counts like a dozen of them.
 */
const PRESSURE = {
  homelandStrike: 0.5,
  capitalStrike: 3,
  capitalThreatened: 4,
  ssbnLost: 6,
  /** Per unit of homeland population share occupied by the other party. */
  territoryLost: 10,
  /**
   * A conventional strike that destroys nuclear-capable launchers, SSBNs or early-warning assets: the entanglement
   * of Acton, "Escalation through Entanglement" (International Security 2018), and Russia's 2020 Basic Principles
   * para. 19(d) on attacks undermining the nuclear response. Four homeland strikes' worth, an estimate.
   */
  dualUseStrike: 2,
  /** A satellite shot down: space is a step outward few states have taken in war. Estimate. */
  spaceStrike: 2,
} as const;
const STRATEGIC_CONVENTIONAL_AT = 6;
/**
 * Pressure fades when the strikes behind it stop, and a dyad at the strategic conventional rung steps back down to
 * conventional once it falls below half the threshold, while the war goes on: Russia and Ukraine's strikes on each
 * other's energy systems paused and resumed over 2022-25. The half-life is a judgment.
 */
const PRESSURE_HALF_LIFE_DAYS = defineParam({
  id: 'diplomacy.PRESSURE_HALF_LIFE_DAYS', value: 21, range: [7, 60], tag: 'judgment',
  source: 'judgment: lulls in the 2022-25 Russia-Ukraine strike campaigns lasted weeks', affects: 'how fast a dyad steps back down from strategic conventional war',
});
const STEP_DOWN_SHARE = 0.5;

/** Platforms whose loss to a conventional strike touches the nuclear forces or their warning: nuclear-capable launchers, SSBNs and radars. */
function dualUse(catalog: SimContext['catalog'], pid: PlatformId): boolean {
  const p = catalog.platforms.get(pid);
  return !!p && (p.nuclearCapable === true || p.class === 'ssbn' || p.class === 'radar');
}

function stepOutward(world: World, s: DiplomacyState, by: NationId, on: NationId, step: OutwardStep): void {
  const steps = ((s.outward ??= {})[`${by}>${on}`] ??= {});
  const r = (steps[step] ??= { first: world.tick, count: 0 });
  r.count++;
}

/**
 * A detonation is strategic when it is large or lands on a population centre.
 * 150 kt sits between tactical (B61 low settings, Iskander 10-50 kt) and
 * strategic warheads (W76-2 aside, 100-800 kt); 2% of national population in
 * one cell is roughly a large metropolitan area.
 */
export const STRATEGIC_YIELD_KT = 150;
export const CITY_POP_SHARE = 0.02;

function addPressure(s: DiplomacyState, a: NationId, b: NationId, amount: number): void {
  const k = relationKey(a, b);
  s.pressure[k] = (s.pressure[k] ?? 0) + amount;
}

/**
 * War support a nuclear-armed state gains when its homeland or forces are struck by nuclear weapons:
 * the public rallies behind retaliation rather than surrender. Press, Sagan and Valentino (APSR
 * 2013) and Sagan and Valentino (International Security 2017) find large majorities for answering a
 * nuclear attack in kind. Matches the rally of being attacked (wars.ts).
 */
const NUCLEAR_RALLY = 0.2;

/** One nuclear attack in this tick's events: a warhead that detonated, or a salvo shot down whole on its way. */
export interface NuclearAttack {
  by: NationId;
  node: NodeId;
  /** Detonations; 0 for a salvo the defences stopped. */
  detonations: number;
  casualties: number;
  /** A large weapon, or one aimed at a population centre. */
  strategic: boolean;
  /** Nations it struck (see nuclearVictims). */
  victims: NationId[];
}

const fightsBeside = (s: DiplomacyState, a: NationId, b: NationId) => s.wars.some((w) => sideOf(w, a) !== -1 && sideOf(w, a) === sideOf(w, b));

/**
 * Nations a nuclear weapon aimed at `node` attacks: whoever holds the cell, its owner if the owner holds it or is at war
 * with the attacker, and every nation with forces there. A war is not required. Every doctrine answers a nuclear attack
 * whether or not war was declared (Russia's 2024 Fundamentals para. 19; China's 2019 white paper), and a launch of
 * nuclear-armed missiles is nuclear use under US declaratory policy (NPR 2022) even if all are shot down. The
 * attacker's co-belligerents are never its victims. Each victim reads the attack from its own territory and forces,
 * which it observes directly.
 */
function nuclearVictims(world: World, map: SimContext['map'], s: DiplomacyState, by: NationId, node: NodeId, forcesAt: ReadonlyMap<number, ReadonlySet<NationId>>): NationId[] {
  const out = new Set<NationId>();
  if (!map.isSea(node)) {
    const holder = world.control[node], owner = map.owner[node];
    if (holder) out.add(holder);
    if (owner && (owner === holder || atWar(world, by, owner))) out.add(owner);
  }
  for (const n of forcesAt.get(node) ?? []) out.add(n);
  return [...out].filter((n) => n !== by && world.nations[n] && !fightsBeside(s, by, n));
}

/** This tick's nuclear attacks: one per detonation, and one per nuclear salvo intercepted before any warhead arrived. */
export function nuclearAttacks(world: World, ctx: Pick<SimContext, 'map' | 'catalog'>, s: DiplomacyState): NuclearAttack[] {
  const { map } = ctx;
  const raw: Omit<NuclearAttack, 'victims'>[] = [];
  for (const e of world.events) {
    if (e.type === 'nuclear_detonation') {
      const strategic = e.yieldKt >= STRATEGIC_YIELD_KT || (!map.isSea(e.node) && map.popShare[e.node] >= CITY_POP_SHARE);
      raw.push({ by: e.by, node: e.node, detonations: 1, casualties: e.casualties, strategic });
    } else if (e.type === 'strike' && e.fired > 0 && e.intercepted >= e.fired) {
      const yieldKt = ctx.catalog.munitions.get(e.munition)?.yieldKt;
      if (!yieldKt) continue;
      const strategic = yieldKt >= STRATEGIC_YIELD_KT || (!map.isSea(e.target) && map.popShare[e.target] >= CITY_POP_SHARE);
      raw.push({ by: e.by, node: e.target, detonations: 0, casualties: 0, strategic });
    }
  }
  if (!raw.length) return [];
  const forcesAt = new Map<number, Set<NationId>>();
  const wanted = new Set(raw.map((a) => a.node));
  for (const f of Object.values(world.formations)) {
    if (f.status === 'destroyed' || !wanted.has(f.node)) continue;
    const here = forcesAt.get(f.node) ?? forcesAt.set(f.node, new Set()).get(f.node)!;
    here.add(f.nation);
  }
  return raw.map((a) => ({ ...a, victims: nuclearVictims(world, map, s, a.by, a.node, forcesAt) }));
}

function record(s: DiplomacyState, n: NationId): WarRecord {
  return (s.records[n] ??= { baseline: 0.6, rally: 0, rallyTick: 0, enteredTick: -1, casualties: 0, nuclearHits: 0, nuclearStruckBy: [], ssbnLost: 0 });
}

/**
 * Opinion at or below which a nation treats a strike on its soil as an act of
 * war rather than a provocation. Estimate: Qatar (opinion of Iran ~+20) absorbed
 * Iran's telegraphed strike on Al Udeid in June 2025 without entering the war.
 */
export const HOSTILE_OPINION = -30;

/**
 * Fold this tick's events into escalation pressure and war records, then climb
 * the ladder where warranted. Returns strikes that landed on the homeland of a
 * nation the striker was not at war with: an armed attack on that nation, as a
 * Chinese strike on US bases in Okinawa would be on Japan (US-Japan treaty Art. V).
 */
export function processEvents(world: World, ctx: SimContext, s: DiplomacyState, enemies: Map<NationId, Set<NationId>>, lostTo: Map<string, number>, prevThreatened: Set<NationId>): [by: NationId, on: NationId][] {
  const { map } = ctx;
  const attacks: [NationId, NationId][] = [];
  const ssbn = new Set<string>(s.ssbnFormations);
  for (const e of world.events) {
    switch (e.type) {
      case 'strike': {
        if (map.isSea(e.target)) break;
        const victim = map.owner[e.target];
        // An ASAT round kills satellites in orbit; nothing lands on the operations centre the constellation is placed at.
        if (e.effects.some((x) => x.kind === 'satellites_destroyed')) {
          if (victim && victim !== e.by && atWar(world, e.by, victim)) {
            stepOutward(world, s, e.by, victim, 'space');
            addPressure(s, e.by, victim, PRESSURE.spaceStrike);
          }
          break;
        }
        if (!atWar(world, e.by, victim)) {
          const bystander = victim !== e.by && world.control[e.target] === victim && e.fired > e.intercepted
            && relation(world, victim, e.by).opinion <= HOSTILE_OPINION;
          if (bystander && !fightsBeside(s, e.by, victim)) {
            attacks.push([e.by, victim]);
            stepOutward(world, s, e.by, victim, 'third_country');
          }
          break;
        }
        // Bases in an overseas territory (Guam) are part of the theatre; striking them does not threaten the state itself.
        if (isOverseas(map, e.target)) break;
        const capital = e.target === world.nations[victim].capital;
        addPressure(s, e.by, victim, capital ? PRESSURE.capitalStrike : PRESSURE.homelandStrike);
        stepOutward(world, s, e.by, victim, capital ? 'capital' : 'homeland');
        if (world.nations[victim].nuclear.warheads > 0) stepOutward(world, s, e.by, victim, 'nuclear_homeland');
        if (e.effects.some((x) => x.kind === 'grid' || x.kind === 'infrastructure')) stepOutward(world, s, e.by, victim, 'civilian');
        if (e.effects.some((x) => x.kind === 'losses' && (Object.keys(x.platforms) as PlatformId[]).some((pid) => dualUse(ctx.catalog, pid)))) {
          stepOutward(world, s, e.by, victim, 'dual_use');
          addPressure(s, e.by, victim, PRESSURE.dualUseStrike);
        }
        break;
      }
      case 'battle':
        for (const [n, c] of Object.entries(e.casualties) as [NationId, number][]) record(s, n).casualties += c;
        break;
      case 'formation_destroyed':
        if (!ssbn.has(e.formation)) break;
        record(s, e.nation).ssbnLost++;
        for (const foe of enemies.get(e.nation) ?? []) addPressure(s, e.nation, foe, PRESSURE.ssbnLost);
        break;
    }
  }

  for (const atk of nuclearAttacks(world, ctx, s)) {
    const land = !map.isSea(atk.node);
    const firstUse = !Object.values(s.records).some((r) => r.nuclearStruckBy.includes(atk.by));
    const level: EscalationLevel = atk.strategic ? 'strategic_nuclear' : 'tactical_nuclear';
    for (const v of atk.victims) {
      // At war before the record is written, so the victim's war record opens with this attack in it.
      if (!atWar(world, atk.by, v)) declareWar(world, ctx, s, atk.by, v, `nuclear attack on ${v}`);
      raiseEscalation(world, ctx, atk.by, v, level);
      const rec = record(s, v);
      if (!rec.nuclearStruckBy.includes(atk.by)) rec.nuclearStruckBy.push(atk.by);
      rec.lastNuclearNode = atk.node;
      const armed = world.nations[v].nuclear.warheads > 0;
      if (armed) {
        rec.rally = Math.max(rec.rally, NUCLEAR_RALLY);
        rec.rallyTick = world.tick;
      }
      if (land && map.owner[atk.node] === v && atk.detonations > 0) {
        rec.nuclearHits += atk.detonations;
        if (atk.strategic && !rec.strategicStruckBy?.includes(atk.by)) (rec.strategicStruckBy ??= []).push(atk.by);
        // A nuclear-armed state's will rests on its deterrent, not the Mueller casualty curve (see NUCLEAR_RALLY).
        if (!armed) rec.casualties += atk.casualties;
      }
    }
    // First use shocks every third party that held a view of the user; its co-belligerents stand by it.
    if (!firstUse) continue;
    for (const n of Object.keys(world.nations) as NationId[]) {
      if (n === atk.by || !world.relations[relationKey(n, atk.by)] || fightsBeside(s, n, atk.by)) continue;
      const r = relationMut(world, n, atk.by);
      r.opinion = Math.max(-100, r.opinion - 40);
    }
  }

  for (const [n, a] of Object.entries(s.assessment) as [NationId, (typeof s.assessment)[NationId]][]) {
    if (!a.capitalThreatened || prevThreatened.has(n)) continue;
    for (const foe of enemies.get(n) ?? []) addPressure(s, n, foe, PRESSURE.capitalThreatened);
  }

  const fade = 0.5 ** (world.dtHours / (24 * PRESSURE_HALF_LIFE_DAYS()));
  for (const [k, r] of Object.entries(world.relations)) {
    if (!r.atWar) continue;
    const effective = (s.pressure[k] ?? 0) + PRESSURE.territoryLost * (lostTo.get(k) ?? 0);
    const [a, b] = k.split('|') as NationId[];
    if (effective >= STRATEGIC_CONVENTIONAL_AT) raiseEscalation(world, ctx, a, b, 'strategic_conventional');
    else if (r.escalation === 'strategic_conventional' && effective < STEP_DOWN_SHARE * STRATEGIC_CONVENTIONAL_AT) {
      relationMut(world, a, b).escalation = 'conventional';
      ctx.emit({ type: 'message', tick: world.tick, nation: a, text: `${a} and ${b} step back down from strategic to conventional war` });
    }
    if (s.pressure[k]) s.pressure[k] *= fade;
  }
  return attacks;
}
