import type { NodeId } from '../../core/types';
import type { Operation } from './operations';

/** Offensives, sectors under pressure, and the line held, each a click away on the map. */
export function OperationsPanel({ ops, inTransit, onShow, onForces }: { ops: readonly Operation[]; inTransit: number; onShow(node: NodeId): void; onForces(): void }) {
  return (
    <section className="ww-glass ww-corners ww-panel ww-ops" aria-label="Operations" data-testid="operations">
      <div className="ww-panel-head"><span className="ww-label">Operations</span><span className="ww-kbd" title="Forces drawer">F</span></div>
      {ops.map((o) => (
        <button key={o.key} type="button" className={`ww-op ${o.kind}`} onClick={() => onShow(o.node)} data-testid="operation">
          <span className="ww-op-top"><span className="ww-title">{o.name}</span><span className={`ww-chip ${o.status.tone}`}>{o.status.label}</span></span>
          <span className={`ww-bar ${o.kind === 'pressure' ? 'red' : o.kind === 'offensive' ? 'gold' : ''}`}><i style={{ width: `${Math.round(o.meter * 100)}%` }} /></span>
          <span className="ww-op-sub">{o.detail}</span>
        </button>
      ))}
      {!ops.length && <p className="ww-muted ww-op-empty">No front yet. Your forces hold their peacetime posts.</p>}
      <button type="button" className="ww-op-foot" onClick={onForces}>
        {inTransit > 0 ? <><i className="ww-pulse" aria-hidden="true" />{inTransit} {inTransit === 1 ? 'order' : 'orders'} in transit · </> : null}
        Every unit is under Forces
      </button>
    </section>
  );
}
