import type { NodeId, OperationId } from '../../core/types';
import type { Operation } from './operations';

interface Props {
  ops: readonly Operation[];
  inTransit: number;
  onShow(node: NodeId): void;
  /** Flies to a battle plan on the map. */
  onOpen(op: OperationId): void;
  onForces(): void;
}

/** Battle plans, offensives, sectors under pressure, and the line held, each a click away on the map. */
export function OperationsPanel({ ops, inTransit, onShow, onOpen, onForces }: Props) {
  return (
    <section className="ww-glass ww-corners ww-panel ww-ops" aria-label="Operations" data-testid="operations">
      <div className="ww-panel-head">
        <span className="ww-label">Operations</span>
        <span className="ww-op-keys">Drag a unit to order it</span>
      </div>
      {ops.map((o) => (
        <button key={o.key} type="button" className={`ww-op ${o.kind}`} onClick={() => (o.op ? onOpen(o.op) : onShow(o.node))} data-testid={o.op ? 'planned-operation' : 'operation'}>
          <span className="ww-op-top"><span className="ww-title">{o.name}</span><span className={`ww-chip ${o.status.tone}`}>{o.status.label}</span></span>
          <span className={`ww-bar ${o.kind === 'pressure' || o.status.tone === 'red' ? 'red' : o.kind === 'holding' ? '' : 'gold'}`}><i style={{ width: `${Math.round(o.meter * 100)}%` }} /></span>
          <span className={`ww-op-sub ${o.kind === 'planned' && o.status.tone === 'red' ? 'red' : ''}`}>{o.detail}</span>
        </button>
      ))}
      {!ops.length && <p className="ww-muted ww-op-empty">No front yet. Your forces hold their peacetime posts.</p>}
      {inTransit > 0 && (
        <button type="button" className="ww-op-foot" onClick={onForces}>
          <i className="ww-pulse" aria-hidden="true" />{inTransit} {inTransit === 1 ? 'order' : 'orders'} in transit
        </button>
      )}
    </section>
  );
}
