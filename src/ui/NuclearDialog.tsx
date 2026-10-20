import { useState } from 'react';
import type { Command, MunitionId, NationId, NodeId } from '../core/types';
import type { SimClient } from './client';
import type { PlaceNamer } from './events';
import { NO_NATION } from './snapshot';
import { fmtNum } from './widgets';

interface Props {
  client: SimClient;
  places: PlaceNamer;
  nation: NationId;
  target: NodeId;
  onCancel(): void;
  onRelease(c: Command): void;
}

/** Two-step release: choose weapon and salvo, then type the authentication phrase. */
export function NuclearDialog({ client, places, nation, target, onCancel, onRelease }: Props) {
  const n = client.state.nations.get(nation)!;
  const weapons = Object.entries(client.meta?.munitions ?? {}).filter(([, m]) => m.yieldKt);
  const [munition, setMunition] = useState<string>(weapons[0]?.[0] ?? '');
  const [warheads, setWarheads] = useState(1);
  const [stage, setStage] = useState<'configure' | 'authenticate'>('configure');
  const [code, setCode] = useState('');
  const phrase = `RELEASE ${nation}`;
  const yieldKt = (client.meta?.munitions[munition]?.yieldKt ?? 0) * warheads;
  const ownerIdx = client.state.control[target];
  const ids = client.meta?.nationIds ?? [];
  const victim = ownerIdx === NO_NATION ? null : client.state.nations.get(ids[ownerIdx]);
  const near = client.map.cities.filter((c) => Math.hypot(c.lat - client.map.lat[target], (c.lon - client.map.lon[target]) * Math.cos((c.lat * Math.PI) / 180)) * 111 < 100);
  const exposedPop = near.reduce((a, c) => a + c.pop, 0);

  return (
    <div className="modal-back" role="dialog" aria-modal="true">
      <div className="modal nuclear" data-testid="nuclear-dialog">
        <h2>☢ Nuclear release authorization</h2>
        <div className="stat-grid">
          <div className="stat"><div className="stat-label">Target</div><div className="stat-value">{places.name(target)}</div></div>
          <div className="stat"><div className="stat-label">Territory of</div><div className="stat-value">{victim?.name ?? 'open sea'}</div></div>
          <div className="stat"><div className="stat-label">Urban pop. within 100 km</div><div className="stat-value mono">{fmtNum(exposedPop)}</div></div>
          <div className="stat"><div className="stat-label">Deployed warheads</div><div className="stat-value mono">{fmtNum(n.deployed)}</div></div>
        </div>
        {stage === 'configure' ? (
          <>
            {weapons.length ? (
              <label className="field">
                <span>Delivery system</span>
                <select value={munition} onChange={(e) => setMunition(e.target.value)}>
                  {weapons.map(([id, m]) => <option key={id} value={id}>{m.name} · {m.yieldKt} kt · {fmtNum(m.rangeKm)} km</option>)}
                </select>
              </label>
            ) : <p className="tt-warn">No nuclear-armed munitions in the catalog.</p>}
            <label className="field">
              <span>Warheads in salvo</span>
              <div className="row">
                <input type="range" min={1} max={Math.max(1, Math.min(20, n.deployed))} value={warheads} onChange={(e) => setWarheads(+e.target.value)} />
                <span className="mono w4">{warheads}</span>
              </div>
            </label>
            <p className="warn-text">Total yield {fmtNum(yieldKt)} kt. A first use will almost certainly trigger retaliation and strategic escalation by every nuclear power allied to the target.</p>
            <div className="row gap end">
              <button onClick={onCancel}>Stand down</button>
              <button className="danger" disabled={!munition} onClick={() => setStage('authenticate')}>Proceed to authentication</button>
            </div>
          </>
        ) : (
          <>
            <p>Type <b className="mono">{phrase}</b> to transmit the emergency action message.</p>
            <input className="code-input mono" autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={phrase} data-testid="nuclear-code" />
            <div className="row gap end">
              <button onClick={onCancel}>Abort</button>
              <button
                className="nuke"
                disabled={code !== phrase}
                onClick={() => onRelease({ type: 'nuclear_release', nation, target, warheads, munition: munition as MunitionId })}
                data-testid="nuclear-confirm"
              >
                Release {warheads} warhead{warheads > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
