import type { Formation, Munition, MunitionId, NationId, PlatformClass, PlatformId } from '../../core/types';
import { ORBIT_KM } from '../../data/catalog/space';
import { dailyRounds } from '../air';
import { issue } from './forces';
import { arsenal, FireBudget, pickTarget, pkAgainst, withinKm, type StrikeTarget, type TargetGrid } from './strikes';
import type { Plan } from './types';

/**
 * What an enemy satellite is worth shooting down, by class: reconnaissance first, which finds mobile
 * targets and carriers for the enemy's long-range fires, and navigation, which guides them (the
 * strategic system's spaceSupport), well before communications relays. Satellites of the US
 * proliferated layers (hundreds of cheap Starshield buses) are hardly worth a 20-40 USD m
 * interceptor each. Weights are judgment, after the targeting logic of CSIS Space Threat
 * Assessment 2025 and DIA "Challenges to Security in Space" (2022).
 */
const SATELLITE_WORTH: Partial<Record<PlatformClass, number>> = { recon_satellite: 1, nav_satellite: 0.8, comms_satellite: 0.2 };

/**
 * Direct-ascent ASAT units engage the enemy space formation where a salvo is worth most, with the
 * interceptor that reaches it. The strategic system fires one interceptor per launcher, at most one
 * per satellite below the ceiling, and picks each victim at random among those satellites; so a
 * salvo is worth its shots times the mean worth of the satellites in reach. A constellation shot
 * down to its last imager is worth less than a full one. The cheaper interceptor wins a tie.
 */
function planAsat(p: Plan, f: Formation, stock: readonly Munition[]): void {
  const { catalog } = p.ctx;
  let best: { t: Formation; m: Munition; worth: number } | undefined;
  for (const e of p.enemies)
    for (const t of p.index.byNation.get(e) ?? []) {
      if (t.kind !== 'space' || t.status !== 'active') continue;
      for (const m of stock) {
        let worth = 0, sats = 0, launchers = 0;
        for (const [pid, n] of Object.entries(t.equipment)) {
          if (n <= 0 || (ORBIT_KM[pid] ?? 0) > m.rangeKm) continue;
          sats += n;
          worth += n * (SATELLITE_WORTH[catalog.platform(pid as PlatformId).class] ?? 0);
        }
        if (!sats) continue;
        for (const [pid, n] of Object.entries(f.equipment)) if (n > 0 && catalog.platform(pid as PlatformId).loadout.some((l) => l.munition === m.id)) launchers += n;
        worth *= Math.min(launchers, sats) / sats;
        if (!best || worth > best.worth || (worth === best.worth && m.unitCostUsdM < best.m.unitCostUsdM)) best = { t, m, worth };
      }
    }
  if (best && best.worth > 0) issue(p, f, { posture: 'strike', target: best.t.node, targetFormation: best.t.id, munition: best.m.id });
  else if (f.order.posture === 'strike') issue(p, f, { posture: 'defend' });
}

/**
 * Nations whose war plan holds the enemy's capital hostage under artillery fire from the first hours, whatever else
 * the guns could hit: North Korea's long-range guns and rockets dug in north of the DMZ exist to put a "sea of fire" on
 * Seoul, 40-60 km away (KPA statements since 1994; Barnett et al., "North Korean Conventional Artillery", RAND, 2020).
 */
const HOSTAGE_FIRE: ReadonlySet<NationId> = new Set(['PRK' as NationId]);

/** An enemy capital the formation's deep rounds reach, as a strike target, if one is on the list. */
function hostageCapital(p: Plan, f: Formation, stock: readonly Munition[], targets: TargetGrid): StrikeTarget | undefined {
  for (const e of p.enemies) {
    const cap = p.world.nations[e].capital;
    const t = targets.targets.find((x) => x.node === cap && x.cls === 'structure' && !x.formation);
    if (t && volleyMunition(p, f, stock, t, p.ctx.map.distanceKm(f.node, cap))) return t;
  }
  return undefined;
}

/**
 * Rounds an artillery formation the land plan left in place this tick fires deep: those reaching DEEP_FIRE_KM, past the
 * guns' fight in the next cells. HIMARS fired GMLRS 70-80 km into the Russian rear from June 2022 (ISW).
 */
const DEEP_FIRE_KM = 50;

function deepRounds(p: Plan, f: Formation): Munition[] {
  const sent = p.ai.sent[f.id];
  if (sent?.tick === p.world.tick && sent.posture !== 'defend' && sent.posture !== 'strike') return [];
  return arsenal(p, f).filter((m) => m.rangeKm >= DEEP_FIRE_KM);
}

/**
 * The munition in reach that kills most per day: kill probability times the rounds the
 * formation's launchers for it put up. A unit with one Lyutyi and two Bober launch sites
 * flies Bobers at targets both reach.
 */
function volleyMunition(p: Plan, f: Formation, stock: readonly Munition[], t: StrikeTarget, km: number): MunitionId | undefined {
  let best: MunitionId | undefined, bestKills = 0;
  for (const m of stock) {
    const kills = m.rangeKm >= km ? pkAgainst(m, t) * dailyRounds(f, m.id, p.ctx.catalog) : 0;
    if (kills > bestKills) { bestKills = kills; best = m.id; }
  }
  return best;
}

/**
 * Ground-launched missile brigades, and artillery with deep rounds, fire at the most valuable target any of
 * their conventional munitions can reach and kill. Nuclear rounds are never
 * used here; release goes through the strategic layer. Precision rounds are
 * rationed by the national fire budget, so a brigade holds fire on some days.
 */
export function planMissiles(p: Plan, targets: TargetGrid): void {
  const { map } = p.ctx;
  const budget = new FireBudget(p);
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if ((f.kind !== 'missile' && f.kind !== 'artillery') || f.status !== 'active') continue;
    const stock = f.kind === 'missile' ? arsenal(p, f) : deepRounds(p, f);
    if (!stock.length) continue;
    if (Object.keys(f.equipment).some((pid) => p.ctx.catalog.platform(pid as PlatformId).class === 'asat')) {
      planAsat(p, f, stock);
      continue;
    }
    const reach = Math.max(...stock.map((m) => m.rangeKm));
    const hostage = f.kind === 'artillery' && HOSTAGE_FIRE.has(p.nation) ? hostageCapital(p, f, stock, targets) : undefined;
    const t = hostage ?? pickTarget(targets.near(f.node, reach), (t) => {
      const m = withinKm(map, f.node, t.at ?? t.node, reach) ? volleyMunition(p, f, stock, t, map.distanceKm(f.node, t.at ?? t.node)) : undefined;
      return m ? pkAgainst(p.ctx.catalog.munition(m), t) : 0;
    });
    if (!t) continue;
    const munition = volleyMunition(p, f, stock, t, map.distanceKm(f.node, t.at ?? t.node))!;
    budget.propose(f, [p.ctx.catalog.munition(munition)], t, { posture: 'strike', target: t.node, targetClass: t.cls, targetFormation: t.formation, munition });
  }
  budget.settle();
}
