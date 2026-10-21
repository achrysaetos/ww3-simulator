import { atWar, relation, type SimContext } from '../../core/engine';
import { ESCALATION, type NationId, type World } from '../../core/types';
import type { AlertSpec, NuclearThreshold } from '../../data/nations';
import type { DiplomacyState } from '../diplomacy/types';

/** How a state with stored warheads alerts: its mating timeline and the doctrine thresholds that trigger it. */
export interface AlertDoctrine {
  spec: AlertSpec;
  threshold: NuclearThreshold | null;
}

/**
 * Share of a use threshold at which a state alerts. Alerting is a signal and a precaution that
 * comes well before use: Israel alerted in 1973 on the second day of the Golan collapse, long
 * before any loss of its core; Pakistan raised readiness in the 1999 and 2019 crises with no
 * territory lost at all. Estimate.
 */
const ALERT_AT_THRESHOLD_SHARE = 0.5;
const STRATEGIC_RUNG = ESCALATION.indexOf('strategic_conventional');

/** Why `n` would order its warheads mated now, per its doctrine thresholds; undefined while none is crossed. */
function alertReason(world: World, n: NationId, threshold: NuclearThreshold | null, d: DiplomacyState | undefined): string | undefined {
  if (world.nations[n].status !== 'war') return undefined;
  const rec = d?.records[n], a = d?.assessment[n];
  if (rec?.nuclearStruckBy.length) return `nuclear attack by ${rec.nuclearStruckBy[0]}`;
  let strategic = false;
  for (const e of Object.keys(world.nations) as NationId[]) {
    if (e === n || !atWar(world, n, e)) continue;
    if (world.nations[e].nuclear.warheads > 0) return `war with nuclear-armed ${e}`;
    strategic ||= ESCALATION.indexOf(relation(world, n, e).escalation) >= STRATEGIC_RUNG;
  }
  if (a?.capitalThreatened) return 'capital threatened';
  if (a && threshold?.coreLossShare != null && a.popLost >= ALERT_AT_THRESHOLD_SHARE * threshold.coreLossShare) return 'homeland overrun';
  if (threshold?.onStrategicAttack && (strategic || (rec?.ssbnLost ?? 0) > 0)) return 'strategic attack on the homeland';
  return undefined;
}

/** Share of the stored warheads mated `hours` after the order. */
export function matedShare(spec: AlertSpec, hours: number): number {
  if (hours < spec.firstHours) return 0;
  if (hours >= spec.fullHours) return 1;
  return spec.firstShare + ((1 - spec.firstShare) * (hours - spec.firstHours)) / (spec.fullHours - spec.firstHours);
}

/**
 * Order and progress nuclear alerts. A state that keeps warheads apart from its launchers orders
 * them mated once a doctrine threshold is crossed; each step mates the warheads its timeline
 * allows, raising `nuclear.deployed`, the ceiling on what it can release. Reads the diplomacy
 * assessment of the previous tick.
 */
export function stepAlerts(world: World, ctx: SimContext, doctrines: Readonly<Record<string, AlertDoctrine>>): void {
  const s = world.slices.strategic;
  const d = world.slices.diplomacy as DiplomacyState | undefined;
  for (const [n, doc] of Object.entries(doctrines) as [NationId, AlertDoctrine][]) {
    const nuclear = world.nations[n]?.nuclear;
    if (!nuclear || (nuclear.warheads <= nuclear.deployed && !s.alerts[n])) continue;
    let alert = s.alerts[n];
    if (!alert) {
      const reason = alertReason(world, n, doc.threshold, d);
      if (!reason) continue;
      alert = s.alerts[n] = { orderedTick: world.tick, stored: nuclear.warheads - nuclear.deployed, mated: 0, reason };
      ctx.emit({ type: 'nuclear_alert', tick: world.tick, nation: n, stage: 'ordered', ready: nuclear.deployed, of: nuclear.warheads, reason });
    }
    if (alert.mated >= alert.stored) continue;
    const want = Math.round(alert.stored * matedShare(doc.spec, (world.tick - alert.orderedTick) * world.dtHours));
    const add = Math.min(want - alert.mated, nuclear.warheads - nuclear.deployed);
    if (add <= 0) continue;
    const first = alert.mated === 0;
    alert.mated += add;
    nuclear.deployed += add;
    const complete = alert.mated >= alert.stored || nuclear.deployed >= nuclear.warheads;
    if (first || complete) ctx.emit({ type: 'nuclear_alert', tick: world.tick, nation: n, stage: complete ? 'complete' : 'ready', ready: nuclear.deployed, of: nuclear.warheads, reason: alert.reason });
    if (complete) alert.mated = alert.stored;
  }
}
