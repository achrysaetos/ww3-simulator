import { useEffect, useState } from 'react';
import type { Command, NationId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { MunitionGroup, NationDetail, WarEntry, WarView } from './snapshot';
import { Bar, Section, Stat, fmtNum, fmtUsdB } from './widgets';

interface Props {
  client: SimClient;
  palette: Palette;
  playAs: NationId;
  onCommand(c: Command): void;
  onNuclear(): void;
}

const GROUP_LABEL: Record<MunitionGroup, string> = {
  interceptor: 'SAM / ABM interceptors',
  aam: 'Air-to-air missiles',
  cruise: 'Cruise and anti-ship missiles',
  ballistic: 'Ballistic missiles',
  rocket: 'Artillery rockets',
  atgm: 'ATGMs and MANPADS',
  drone: 'One-way attack drones',
  bomb: 'Guided and glide bombs',
  torpedo: 'Torpedoes and mines',
  nuclear: 'Nuclear warheads (loaded)',
};

const RESOURCE_LABEL: Record<string, string> = {
  energy: 'Energy', food: 'Food', semiconductors: 'Semiconductors', rare_earths: 'Rare earths', energetics: 'Explosives / propellant', steel: 'Steel',
};

export function NationPanel({ client, palette, playAs, onCommand, onNuclear }: Props) {
  const nations = client.state.nations;
  const n = nations.get(playAs);
  const d = client.state.focusNation?.id === playAs ? client.state.focusNation : undefined;
  const [target, setTarget] = useState<NationId | ''>('');
  const [mob, setMob] = useState(n?.mobilization ?? 0);
  useEffect(() => setMob(n?.mobilization ?? 0), [playAs, n?.mobilization]);
  if (!n) return null;

  const name = (id: NationId) => nations.get(id)?.name ?? id;
  const enemies = d?.enemies ?? [];
  const atWarWithTarget = target !== '' && enemies.includes(target);
  const sortedNations = [...nations.values()].filter((o) => o.id !== n.id).sort((a, b) => a.name.localeCompare(b.name));
  const eco = d?.economy;

  return (
    <div className="panel-scroll" data-testid="nation-panel">
      <div className="nation-head">
        <span className="swatch" style={{ background: palette.of(n.id).css }} />
        <div>
          <div className="nation-name">{n.name}</div>
          <div className="nation-sub">{n.id} · {n.blocs.slice(0, 4).join(', ') || 'non-aligned'} · <span className={`status ${n.status}`}>{n.status}</span></div>
        </div>
      </div>

      <Section title="Wars">
        {d ? <Wars d={d} name={name} palette={palette} tick={client.state.tick} dtHours={client.meta?.dtHours ?? 6} /> : <p className="muted">Loading…</p>}
      </Section>

      <Section title="War economy">
        <div className="stat-grid">
          <Stat label="GDP (pre-war)">{fmtUsdB(n.gdpUsdB)}</Stat>
          <Stat label="Output now">{eco ? `${Math.round(eco.gdpIndex * 100)}%` : '—'}</Stat>
          <Stat label="Treasury">{fmtUsdB(n.treasuryUsdB)}</Stat>
          <Stat label="War deficit">{eco ? `${(eco.deficitPctGdp * 100).toFixed(1)}% GDP` : '—'}</Stat>
          <Stat label="Trained reserves">{fmtNum(n.reserves)}</Stat>
          <Stat label="In training">{eco ? fmtNum(eco.inTraining) : '—'}</Stat>
          {d && <Stat label="Territory held">{d.nodesHeld} / {d.nodesHome} cells</Stat>}
          {d && <Stat label="Formations">{d.formations} · {fmtNum(d.personnel)} pers.</Stat>}
        </div>
        <Bar label="Mobilization" value={n.mobilization} tone="warn" />
        <Bar label="War support" value={n.warSupport} tone="auto" />
        {eco && <Bar label="Industry intact and held" value={eco.integrity} tone="auto" />}
        {eco && <Bar label="Foreign trade lost" value={eco.tradeLoss} tone={eco.tradeLoss > 0.4 ? 'bad' : 'warn'} />}
      </Section>

      {eco && (
        <Section title="Strategic resources" right={eco.short.length ? <span className="chip enemy">short: {eco.short.length}</span> : undefined}>
          <table className="tbl" data-testid="resources">
            <thead><tr><th>Input</th><th className="num">Stock</th><th className="num">Need met</th></tr></thead>
            <tbody>
              {Object.keys(eco.buffers).map((r) => (
                <tr key={r} className={eco.short.includes(r) ? 'short' : ''}>
                  <td>{RESOURCE_LABEL[r] ?? r}{eco.short.includes(r) ? ' · SHORTAGE' : ''}</td>
                  <td className="num">{eco.buffers[r].toFixed(1)} mo</td>
                  <td className="num">{Math.round((eco.supply[r] ?? 1) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Munitions and stocks">
        {d ? (
          <>
            <div className="stat-grid">
              <Stat label="Ammunition incl. shells">{fmtNum(d.bulk.ammo)} t</Stat>
              <Stat label="Fuel">{fmtNum(d.bulk.fuel)} t</Stat>
              <Stat label="Food">{fmtNum(d.bulk.food)} t</Stat>
            </div>
            <table className="tbl" data-testid="munitions">
              <thead><tr><th>Family</th><th className="num">Depots</th><th className="num">Loaded</th><th className="num">+/mo</th></tr></thead>
              <tbody>
                {d.munitions.map((m) => (
                  <tr key={m.group}>
                    <td>{GROUP_LABEL[m.group]}</td>
                    <td className="num">{fmtNum(m.warehoused)}</td>
                    <td className="num">{fmtNum(m.loaded)}</td>
                    <td className="num muted">{m.perMonth ? fmtNum(m.perMonth) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {eco && eco.lines.length > 0 && (
              <table className="tbl">
                <thead><tr><th>Production line</th><th className="num">Rate /mo</th><th className="num">Built</th></tr></thead>
                <tbody>
                  {eco.lines.map((l) => (
                    <tr key={l.item}><td>{itemName(client, l.item)}</td><td className="num">{fmtNum(l.perMonth)}</td><td className="num">{fmtNum(l.built)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : <p className="muted">Loading…</p>}
      </Section>

      <Section title="Nuclear forces">
        <div className="stat-grid">
          <Stat label="Stockpile">{fmtNum(n.warheads)}</Stat>
          <Stat label="Deployed">{fmtNum(n.deployed)}</Stat>
          <Stat label="Doctrine">{n.doctrine.replace(/_/g, ' ')}</Stat>
          <Stat label="Posture">{d?.nuclear.posture?.replace(/_/g, ' ') ?? '—'}</Stat>
          {d && <Stat label="Strategic launchers">{fmtNum(d.nuclear.launchers)}</Stat>}
          {d && <Stat label="Satellites">{fmtNum(d.nuclear.satellites)}</Stat>}
        </div>
        {d && Object.keys(d.nuclear.bmd).length > 0 && (
          <table className="tbl">
            <thead><tr><th>Missile defence</th><th className="num">Interceptors</th></tr></thead>
            <tbody>{Object.entries(d.nuclear.bmd).map(([id, v]) => <tr key={id}><td className="mono">{id}</td><td className="num">{fmtNum(v)}</td></tr>)}</tbody>
          </table>
        )}
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

function itemName(client: SimClient, id: string): string {
  return client.meta?.platforms[id]?.name ?? client.meta?.munitions[id]?.name ?? id.replace(/_/g, ' ');
}

/** A treaty entry reads "NATO: defence of POL"; anything else is the nation's own casus belli. */
function treatyOf(e: WarEntry): string | null {
  const m = /^([^:]+): defence of /.exec(e.reason);
  return m ? m[1] : null;
}

function Wars({ d, name, palette, tick, dtHours }: { d: NationDetail; name: (id: NationId) => string; palette: Palette; tick: number; dtHours: number }) {
  if (!d.wars.length) return <p className="muted">At peace.</p>;
  const day = (t: number) => `D+${Math.floor((t * dtHours) / 24)}`;
  const side = (w: WarView, s: 0 | 1) => (
    <ul className="war-side">
      {w.sides[s].map((e) => {
        const treaty = treatyOf(e);
        return (
          <li key={e.nation} title={e.reason}>
            <i style={{ background: palette.of(e.nation).css }} />
            <b>{name(e.nation)}</b>
            {treaty ? <span className="chip treaty">{treaty}</span> : <span className="muted small">{e.nation === w.aggressor ? 'aggressor' : e.reason}</span>}
          </li>
        );
      })}
      {w.pending.filter((j) => j.side === s).map((j) => (
        <li key={`p-${j.nation}`} className="pending">
          <i style={{ background: palette.of(j.nation).css }} />
          <span>{name(j.nation)}</span>
          <span className="muted small">{j.treaty} decision {j.dueTick > tick ? `due ${day(j.dueTick)}` : 'now'}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="wars" data-testid="wars">
      {d.wars.map((w) => {
        const mine: 0 | 1 = w.sides[0].some((e) => e.nation === d.id) ? 0 : 1;
        return (
          <div key={w.id} className="war">
            <div className="war-head">{name(w.aggressor)}'s war · since {day(w.startTick)}</div>
            <div className="war-cols">
              <div><div className="war-label">With us</div>{side(w, mine)}</div>
              <div><div className="war-label enemy">Against us</div>{side(w, (1 - mine) as 0 | 1)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
