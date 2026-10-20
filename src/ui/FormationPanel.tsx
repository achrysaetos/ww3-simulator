import { useState } from 'react';
import type { Formation, FormationKind, NationId, NodeId, Posture, TargetClass } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { PlaceNamer } from './events';
import { Bar, Section, Stat, fmtNum } from './widgets';

/** Which postures make sense for each formation kind, in button order. */
export const POSTURES_BY_KIND: Record<FormationKind, readonly Posture[]> = {
  maneuver: ['move', 'attack', 'defend', 'reserve'],
  artillery: ['move', 'strike', 'defend', 'reserve'],
  air_defense: ['move', 'defend', 'reserve'],
  missile: ['move', 'strike', 'defend', 'reserve'],
  air_wing: ['strike', 'air_superiority', 'patrol', 'defend', 'reserve'],
  surface_group: ['move', 'strike', 'patrol', 'blockade', 'defend', 'reserve'],
  submarine: ['move', 'strike', 'patrol', 'blockade', 'reserve'],
  strategic: ['defend', 'reserve'],
  logistics: ['move', 'defend', 'reserve'],
  space: ['patrol', 'reserve'],
};

export const NEEDS_TARGET: ReadonlySet<Posture> = new Set(['move', 'attack', 'strike', 'air_superiority', 'patrol', 'blockade']);
const STRIKE_CLASSES: TargetClass[] = ['structure', 'hardened', 'soft', 'armor', 'ship', 'aircraft'];

interface Props {
  client: SimClient;
  palette: Palette;
  places: PlaceNamer;
  playAs: NationId;
  pending: Posture | null;
  onPickPosture(p: Posture | null, targetClass?: TargetClass): void;
  onImmediate(p: Posture): void;
  onClose(): void;
  onFocus(node: NodeId): void;
}

export function FormationPanel({ client, palette, places, playAs, pending, onPickPosture, onImmediate, onClose, onFocus }: Props) {
  const f: Formation | undefined = client.state.focusFormation;
  const [tc, setTc] = useState<TargetClass>('structure');
  if (!f) return <div className="panel-scroll"><p className="muted">Loading formation…</p></div>;
  const meta = client.meta;
  const own = f.nation === playAs;
  const nation = client.state.nations.get(f.nation);
  const damaged = f.damaged as Record<string, number>;
  const equipment = Object.entries(f.equipment).filter(([id, v]) => v > 0 || (damaged[id] ?? 0) > 0);
  const magazine = Object.entries(f.magazine).filter(([, v]) => v > 0);
  const frac = (k: 'fuel' | 'ammo' | 'food') => (f.supplyCapacity[k] ? f.supply[k] / f.supplyCapacity[k] : 0);

  return (
    <div className="panel-scroll">
      <div className="nation-head">
        <span className="swatch" style={{ background: palette.of(f.nation).css }} />
        <div style={{ flex: 1 }}>
          <div className="nation-name" data-testid="formation-name">{f.name}</div>
          <div className="nation-sub">{nation?.name ?? f.nation} · {f.kind.replace(/_/g, ' ')} {f.echelon.replace(/_/g, ' ')} · <span className={`status ${f.status}`}>{f.status}</span></div>
        </div>
        <button className="ghost" onClick={onClose} title="Deselect">✕</button>
      </div>

      <Section title="Situation">
        <div className="stat-grid">
          <Stat label="Location"><a onClick={() => onFocus(f.node)}>{places.name(f.node)}</a></Stat>
          <Stat label="Order">{f.order.posture.replace(/_/g, ' ')}{f.order.target !== undefined ? ` → ${places.name(f.order.target)}` : ''}</Stat>
          <Stat label="Personnel">{fmtNum(f.personnel)}</Stat>
          <Stat label="Route">{f.order.path?.length ? `${f.order.path.length} cells, ${Math.round(f.progressKm)} km into leg` : '—'}</Stat>
        </div>
      </Section>

      <Section title="Condition">
        <Bar label="Readiness" value={f.readiness} tone="auto" />
        <Bar label="Morale" value={f.morale} tone="auto" />
        <Bar label="Experience" value={f.experience} tone="good" />
        <Bar label="Fatigue" value={f.fatigue} tone={f.fatigue > 0.6 ? 'bad' : 'warn'} />
        <Bar label="Entrenchment" value={f.entrenchment} tone="good" />
      </Section>

      <Section title="Supply">
        <Bar label="Fuel" value={frac('fuel')} tone="auto" detail={`${fmtNum(f.supply.fuel)} / ${fmtNum(f.supplyCapacity.fuel)} t`} />
        <Bar label="Ammunition" value={frac('ammo')} tone="auto" detail={`${fmtNum(f.supply.ammo)} / ${fmtNum(f.supplyCapacity.ammo)} t`} />
        <Bar label="Food" value={frac('food')} tone="auto" detail={`${fmtNum(f.supply.food)} / ${fmtNum(f.supplyCapacity.food)} t`} />
      </Section>

      <Section title="Equipment">
        <table className="tbl">
          <thead><tr><th>Platform</th><th>Class</th><th className="num">Ready</th><th className="num">Repair</th></tr></thead>
          <tbody>
            {equipment.map(([id, v]) => (
              <tr key={id}>
                <td>{meta?.platforms[id]?.name ?? id}</td>
                <td className="muted">{meta?.platforms[id]?.class.replace(/_/g, ' ')}</td>
                <td className="num">{v}</td>
                <td className="num muted">{damaged[id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {magazine.length > 0 && (
          <table className="tbl">
            <thead><tr><th>Munition</th><th>Kind</th><th className="num">Held</th></tr></thead>
            <tbody>
              {magazine.map(([id, v]) => (
                <tr key={id}><td>{meta?.munitions[id]?.name ?? id}</td><td className="muted">{meta?.munitions[id]?.kind.replace(/_/g, ' ')}</td><td className="num">{fmtNum(v)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {own && f.status !== 'destroyed' ? (
        <Section title="Issue orders">
          <div className="posture-grid">
            {POSTURES_BY_KIND[f.kind].map((p) => (
              <button
                key={p}
                data-testid={`posture-${p}`}
                className={pending === p ? 'active' : f.order.posture === p ? 'current' : ''}
                onClick={() => (NEEDS_TARGET.has(p) ? onPickPosture(pending === p ? null : p, p === 'strike' ? tc : undefined) : onImmediate(p))}
              >
                {p.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          {POSTURES_BY_KIND[f.kind].includes('strike') && (
            <label className="field inline">
              <span>Strike target class</span>
              <select value={tc} onChange={(e) => { setTc(e.target.value as TargetClass); if (pending === 'strike') onPickPosture('strike', e.target.value as TargetClass); }}>
                {STRIKE_CLASSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          )}
          {pending && <p className="hint">Click a map cell to {pending.replace(/_/g, ' ')}. Esc cancels.</p>}
        </Section>
      ) : (
        <p className="muted small pad">{own ? 'Formation destroyed.' : `Foreign formation. Play as ${f.nation} to command it.`}</p>
      )}
    </div>
  );
}

export function FormationList({ client, palette, places, playAs, onSelect }: { client: SimClient; palette: Palette; places: PlaceNamer; playAs: NationId; onSelect(f: Formation['id'], node: NodeId): void }) {
  const mine = client.state.formations.filter((f) => f.entry.nation === playAs && f.status !== 'destroyed');
  return (
    <div className="panel-scroll">
      <Section title={`Order of battle · ${mine.length}`}>
        {!mine.length && <p className="muted">This nation fields no formations in the scenario. Pick another nation, or watch the war unfold.</p>}
        <ul className="oob">
          {mine.map((f) => (
            <li key={f.entry.id} onClick={() => onSelect(f.entry.id, f.node)} data-testid="oob-item">
              <span className="swatch sm" style={{ background: palette.of(f.entry.nation).css }} />
              <span className="oob-name">{f.entry.name}</span>
              <span className="oob-meta">{f.posture.replace(/_/g, ' ')} · {places.name(f.node)}</span>
              <span className="oob-str"><i style={{ width: `${Math.round(f.strength * 100)}%` }} /></span>
            </li>
          ))}
        </ul>
        <p className="muted small">Click a counter on the map, or a row here, to inspect and command it.</p>
      </Section>
    </div>
  );
}
