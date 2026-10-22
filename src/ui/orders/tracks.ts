/**
 * Every order the player gives, from sent to answered (Orders.dc.html "Order, and see the answer"):
 * sent, relayed down a slow chain of command with an ETA, then accepted with when it gets there or
 * refused with the engine's reason. The map draws each on its unit; the card follows it.
 */
import type { FormationId, NodeId, SimEvent } from '../../core/types';

export type TrackState = 'sent' | 'relayed' | 'accepted' | 'refused';

export interface OrderTrack {
  formation: FormationId;
  /** The order in the player's words, such as "Attack Robotyne". */
  label: string;
  target: NodeId | null;
  sentTick: number;
  state: TrackState;
  /** Tick of the latest answer. */
  answeredTick: number | null;
  /** Relayed: hours until it reaches the unit, from the answer's tick. Accepted: hours until the unit gets there. */
  etaHours: number | null;
  /** The engine's reason for a refusal, or its caveat on an acceptance. */
  reason: string | null;
}

/** Ticks an answered order stays on the map before it fades. */
export const SHOW_ANSWER_TICKS = 6;

export class OrderTracks {
  private readonly byFormation = new Map<FormationId, OrderTrack>();
  version = 0;

  sent(formation: FormationId, label: string, target: NodeId | null, tick: number): void {
    this.byFormation.set(formation, { formation, label, target, sentTick: tick, state: 'sent', answeredTick: null, etaHours: null, reason: null });
    this.version++;
  }

  /** Takes in a snapshot's answers to the player's orders, and lets old answers fade. */
  observe(events: readonly SimEvent[], tick: number): void {
    for (const e of events) {
      if (e.type !== 'command_result' || e.command !== 'order' || !e.formation || !e.byPlayer) continue;
      const t = this.byFormation.get(e.formation);
      if (!t || e.tick < t.sentTick) continue;
      t.answeredTick = e.tick;
      if (!e.ok) Object.assign(t, { state: 'refused', reason: e.reason, etaHours: null });
      else Object.assign(t, { state: e.code === 'relayed' ? 'relayed' : 'accepted', etaHours: e.etaHours ?? null, reason: e.note ?? null });
      this.version++;
    }
    for (const [id, t] of this.byFormation) {
      if (t.state !== 'sent' && t.state !== 'relayed' && t.answeredTick !== null && tick - t.answeredTick > SHOW_ANSWER_TICKS) {
        this.byFormation.delete(id);
        this.version++;
      }
    }
  }

  get(formation: FormationId): OrderTrack | undefined {
    return this.byFormation.get(formation);
  }

  list(): OrderTrack[] {
    return [...this.byFormation.values()];
  }
}
