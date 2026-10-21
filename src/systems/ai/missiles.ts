import type { Formation, Munition, MunitionId, PlatformClass, PlatformId } from '../../core/types';
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
 * Direct-ascent ASAT units engage the enemy space formation most worth a kill with the interceptor
 * that reaches it: a formation's worth is the chance a kill takes out a satellite that matters, as
 * the strategic system picks the victim at random among the satellites below the interceptor's
 * ceiling. The cheaper interceptor wins a tie.
 */
function planAsat(p: Plan, f: Formation, stock: readonly Munition[]): void {
  let best: { t: Formation; m: Munition; worth: number } | undefined;
  for (const e of p.enemies)
    for (const t of p.index.byNation.get(e) ?? []) {
      if (t.kind !== 'space' || t.status !== 'active') continue;
      for (const m of stock) {
        let worth = 0, sats = 0;
        for (const [pid, n] of Object.entries(t.equipment)) {
          if (n <= 0 || (ORBIT_KM[pid] ?? 0) > m.rangeKm) continue;
          sats += n;
          worth += n * (SATELLITE_WORTH[p.ctx.catalog.platform(pid as PlatformId).class] ?? 0);
        }
        if (!sats) continue;
        worth /= sats;
        if (!best || worth > best.worth || (worth === best.worth && m.unitCostUsdM < best.m.unitCostUsdM)) best = { t, m, worth };
      }
    }
  if (best && best.worth > 0) issue(p, f, { posture: 'strike', target: best.t.node, targetFormation: best.t.id, munition: best.m.id });
  else if (f.order.posture === 'strike') issue(p, f, { posture: 'defend' });
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
 * Ground-launched missile brigades fire at the most valuable target any of
 * their conventional munitions can reach and kill. Nuclear rounds are never
 * used here; release goes through the strategic layer. Precision rounds are
 * rationed by the national fire budget, so a brigade holds fire on some days.
 */
export function planMissiles(p: Plan, targets: TargetGrid): void {
  const { map } = p.ctx;
  const budget = new FireBudget(p);
  for (const f of p.index.byNation.get(p.nation) ?? []) {
    if (f.kind !== 'missile' || f.status !== 'active') continue;
    const stock = arsenal(p, f);
    if (!stock.length) continue;
    if (Object.keys(f.equipment).some((pid) => p.ctx.catalog.platform(pid as PlatformId).class === 'asat')) {
      planAsat(p, f, stock);
      continue;
    }
    const reach = Math.max(...stock.map((m) => m.rangeKm));
    const t = pickTarget(targets.near(f.node, reach), (t) => withinKm(map, f.node, t.at ?? t.node, reach) && volleyMunition(p, f, stock, t, map.distanceKm(f.node, t.at ?? t.node)) !== undefined);
    if (!t) continue;
    const munition = volleyMunition(p, f, stock, t, map.distanceKm(f.node, t.at ?? t.node))!;
    budget.propose(f, [p.ctx.catalog.munition(munition)], t, { posture: 'strike', target: t.node, targetClass: t.cls, targetFormation: t.formation, munition });
  }
  budget.settle();
}
