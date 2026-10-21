import { useState } from 'react';
import type { Command, NationId, NodeId } from '../core/types';
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

/** The nation's loaded nuclear weapons, with how many rounds sit on launchers that reach `target`. */
export function nuclearOptions(client: SimClient, target: NodeId) {
  const weapons = client.state.focusNation?.nuclear.weapons ?? [];
  return weapons
    .map((w) => {
      const m = client.meta?.munitions[w.munition];
      const held = w.sites.reduce((a, s) => a + s.rounds, 0);
      const inRange = w.sites.reduce((a, s) => a + (client.map.distanceKm(s.node, target) <= s.reachKm ? s.rounds : 0), 0);
      const nearestKm = Math.min(...w.sites.map((s) => client.map.distanceKm(s.node, target) - s.reachKm));
      return { id: w.munition, name: m?.name ?? w.munition, yieldKt: m?.yieldKt ?? 0, held, inRange, shortKm: Math.max(0, nearestKm) };
    })
    .sort((a, b) => Number(b.inRange > 0) - Number(a.inRange > 0) || b.inRange - a.inRange || a.name.localeCompare(b.name));
}

/** Two-step release: choose one of the nation's own weapons that reaches the target and a salvo, then type the authentication phrase. */
export function NuclearDialog({ client, places, nation, target, onCancel, onRelease }: Props) {
  const n = client.state.nations.get(nation)!;
  const options = nuclearOptions(client, target);
  const [munition, setMunition] = useState<string>(options.find((o) => o.inRange > 0)?.id ?? '');
  const [warheads, setWarheads] = useState(1);
  const [stage, setStage] = useState<'configure' | 'authenticate'>('configure');
  const [code, setCode] = useState('');
  const phrase = `RELEASE ${nation}`;
  const chosen = options.find((o) => o.id === munition);
  const maxSalvo = Math.max(1, Math.min(20, n.deployed, chosen?.inRange ?? 0));
  const salvo = Math.min(warheads, maxSalvo);
  const yieldKt = (chosen?.yieldKt ?? 0) * salvo;
  const ownerIdx = client.state.control[target];
  const ids = client.meta?.nationIds ?? [];
  const victim = ownerIdx === NO_NATION ? null : client.state.nations.get(ids[ownerIdx]);
  const near = client.map.cities.filter((c) => Math.hypot(c.lat - client.map.lat[target], (c.lon - client.map.lon[target]) * Math.cos((c.lat * Math.PI) / 180)) * 111 < 100);
  const exposedPop = near.reduce((a, c) => a + c.pop, 0);
  const ready = !!chosen && chosen.inRange > 0 && n.deployed > 0;

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
            {options.length ? (
              <label className="field">
                <span>Delivery system</span>
                <select value={munition} onChange={(e) => setMunition(e.target.value)} data-testid="nuclear-weapon">
                  {!munition && <option value="">No weapon reaches this target</option>}
                  {options.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.inRange === 0}>
                      {o.name} · {fmtNum(o.yieldKt)} kt · {o.inRange ? `${fmtNum(o.inRange)} of ${fmtNum(o.held)} in range` : `out of range by ${fmtNum(o.shortKm)} km`}
                    </option>
                  ))}
                </select>
              </label>
            ) : <p className="tt-warn" data-testid="nuclear-none">No nuclear weapons are loaded on {n.name}'s launchers.</p>}
            {options.length > 0 && !munition && <p className="tt-warn" data-testid="nuclear-none">None of your loaded weapons reaches {places.name(target)}. Pick a closer aim point.</p>}
            {n.deployed <= 0 && <p className="tt-warn">No warheads are mated to launchers; raise the nuclear alert first.</p>}
            <label className="field">
              <span>Warheads in salvo</span>
              <div className="row">
                <input type="range" min={1} max={maxSalvo} value={salvo} disabled={!ready} onChange={(e) => setWarheads(+e.target.value)} />
                <span className="mono w4">{salvo}</span>
              </div>
            </label>
            <p className="warn-text">Total yield {fmtNum(yieldKt)} kt. A first use will almost certainly trigger retaliation and strategic escalation by every nuclear power allied to the target.</p>
            <div className="row gap end">
              <button onClick={onCancel}>Stand down</button>
              <button className="danger" disabled={!ready} onClick={() => setStage('authenticate')}>Proceed to authentication</button>
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
                disabled={code !== phrase || !chosen}
                onClick={() => chosen && onRelease({ type: 'nuclear_release', nation, target, warheads: salvo, munition: chosen.id })}
                data-testid="nuclear-confirm"
              >
                Release {salvo} warhead{salvo > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
