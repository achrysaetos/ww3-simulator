import { useEffect, useState } from 'react';
import type { Command, NationId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import { Bar, Section, Stat, fmtNum, fmtUsdB } from './widgets';

interface Props {
  client: SimClient;
  palette: Palette;
  playAs: NationId;
  onCommand(c: Command): void;
  onNuclear(): void;
}

export function NationPanel({ client, palette, playAs, onCommand, onNuclear }: Props) {
  const nations = client.state.nations;
  const n = nations.get(playAs);
  const d = client.state.focusNation?.id === playAs ? client.state.focusNation : undefined;
  const [target, setTarget] = useState<NationId | ''>('');
  const [mob, setMob] = useState(n?.mobilization ?? 0);
  useEffect(() => setMob(n?.mobilization ?? 0), [playAs, n?.mobilization]);
  if (!n) return null;

  const name = (id: NationId) => nations.get(id)?.name ?? id;
  const allies = [...nations.values()].filter((o) => o.id !== n.id && o.blocs.some((b) => n.blocs.includes(b)));
  const enemies = d?.enemies ?? [];
  const meta = client.meta;
  const stock = d ? Object.entries(d.stockpile).filter(([, v]) => v > 0) : [];
  const atWarWithTarget = target !== '' && enemies.includes(target);
  const sortedNations = [...nations.values()].filter((o) => o.id !== n.id).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="panel-scroll">
      <div className="nation-head">
        <span className="swatch" style={{ background: palette.of(n.id).css }} />
        <div>
          <div className="nation-name">{n.name}</div>
          <div className="nation-sub">{n.id} · {n.blocs.join(', ') || 'non-aligned'} · <span className={`status ${n.status}`}>{n.status}</span></div>
        </div>
      </div>

      <Section title="Economy and society">
        <div className="stat-grid">
          <Stat label="GDP (pre-war)">{fmtUsdB(n.gdpUsdB)}</Stat>
          <Stat label="Treasury">{fmtUsdB(n.treasuryUsdB)}</Stat>
          <Stat label="Population">{fmtNum(n.population)}</Stat>
          <Stat label="Trained reserves">{fmtNum(n.reserves)}</Stat>
          {d && <Stat label="Territory held">{d.nodesHeld} / {d.nodesHome} cells</Stat>}
          {d && <Stat label="Formations">{d.formations} · {fmtNum(d.personnel)} pers.</Stat>}
        </div>
        <Bar label="Mobilization" value={n.mobilization} tone="warn" />
        <Bar label="War support" value={n.warSupport} tone="auto" />
      </Section>

      <Section title="Stockpiles">
        {d ? (
          <>
            <div className="stat-grid">
              <Stat label="Fuel">{fmtNum(d.bulk.fuel)} t</Stat>
              <Stat label="Ammunition">{fmtNum(d.bulk.ammo)} t</Stat>
              <Stat label="Food">{fmtNum(d.bulk.food)} t</Stat>
            </div>
            {stock.length ? (
              <table className="tbl">
                <tbody>
                  {stock.slice(0, 14).map(([id, v]) => (
                    <tr key={id}><td>{meta?.platforms[id]?.name ?? meta?.munitions[id]?.name ?? id}</td><td className="num">{fmtNum(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">No warehoused platforms or munitions.</p>}
          </>
        ) : <p className="muted">Loading…</p>}
      </Section>

      <Section title="Nuclear forces">
        <div className="stat-grid">
          <Stat label="Warheads">{fmtNum(n.warheads)}</Stat>
          <Stat label="Deployed">{fmtNum(n.deployed)}</Stat>
          <Stat label="Doctrine">{n.doctrine.replace(/_/g, ' ')}</Stat>
        </div>
      </Section>

      <Section title="Wars and alliances">
        <div className="chips">
          {enemies.length ? enemies.map((e) => <span key={e} className="chip enemy">at war: {name(e)}</span>) : <span className="muted">At peace</span>}
        </div>
        <div className="chips">
          {allies.slice(0, 40).map((a) => <span key={a.id} className="chip ally" title={a.name}><i style={{ background: palette.of(a.id).css }} />{a.id}</span>)}
          {!allies.length && <span className="muted">No formal allies</span>}
        </div>
      </Section>

      <Section title="Command authority">
        <label className="field">
          <span>Mobilization target</span>
          <div className="row">
            <input type="range" min={0} max={1} step={0.05} value={mob} onChange={(e) => setMob(+e.target.value)} />
            <span className="mono w4">{Math.round(mob * 100)}%</span>
            <button disabled={Math.abs(mob - n.mobilization) < 0.01} onClick={() => onCommand({ type: 'set_mobilization', nation: n.id, level: mob })}>Set</button>
          </div>
        </label>
        <label className="field">
          <span>Diplomacy</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as NationId)} data-testid="diplo-target">
            <option value="">Select a nation…</option>
            {sortedNations.map((o) => <option key={o.id} value={o.id}>{o.name}{enemies.includes(o.id) ? ' (at war)' : ''}</option>)}
          </select>
        </label>
        <div className="row gap">
          <button className="danger" disabled={!target || atWarWithTarget} onClick={() => target && onCommand({ type: 'declare_war', nation: n.id, target, reason: 'declared by national command authority' })}>Declare war</button>
          <button disabled={!target || !atWarWithTarget} onClick={() => target && onCommand({ type: 'offer_peace', nation: n.id, target })}>Offer peace</button>
        </div>
        <button className="nuke" disabled={n.deployed <= 0} onClick={onNuclear} data-testid="nuclear-release">
          ☢ Nuclear release…
        </button>
        {n.deployed <= 0 && <p className="muted small">No deployed warheads.</p>}
      </Section>
    </div>
  );
}
