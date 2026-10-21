import { useMemo, useState } from 'react';
import { COMMAND_DOMAINS, type Command, type CommandDomain, type ItemId, type NationId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { MunitionGroup, NationDetail, WarEntry, WarView } from './snapshot';
import type { Objective } from './briefing';
import { ObjectiveList } from './GameFlow';
import { Bar, Section, Stat, fmtNum, fmtUsdB } from './widgets';

interface Props {
  client: SimClient;
  palette: Palette;
  playAs: NationId;
  objectives: Objective[];
  /** Send a command; `label` is what the toast says was done. */
  onCommand(c: Command, label: string): void;
  onNuclear(): void;
}

export const DOMAIN_LABEL: Record<CommandDomain, { name: string; what: string }> = {
  land: { name: 'Land forces', what: 'land forces' },
  air: { name: 'Air and missile forces', what: 'air and missile forces' },
  naval: { name: 'Naval forces', what: 'naval forces' },
  homefront: { name: 'Home front', what: 'mobilisation and war production' },
  strategic: { name: 'Strategic decisions', what: 'war, peace, treaty calls and nuclear release' },
};

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

export function NationPanel({ client, palette, playAs, objectives, onCommand, onNuclear }: Props) {
  const nations = client.state.nations;
  const n = nations.get(playAs);
  const d = client.state.focusNation?.id === playAs ? client.state.focusNation : undefined;
  const [target, setTarget] = useState<NationId | ''>('');
  const [mobDraft, setMobDraft] = useState<number | null>(null);
  // Option lists are rebuilt only when their labels change, not on every tick.
  const tagsKey = `${d?.enemies.join() ?? ''}|${d?.sanctions.join() ?? ''}`;
  const targetOptions = useMemo(() => {
    const [enemies, sanctions] = tagsKey.split('|').map((l) => l.split(','));
    return [...nations.values()].filter((o) => o.id !== playAs).sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => <option key={o.id} value={o.id}>{o.name}{enemies.includes(o.id) ? ' (at war)' : sanctions.includes(o.id) ? ' (sanctioned)' : ''}</option>);
  }, [client.meta, playAs, tagsKey]);
  if (!n) return null;

  const name = (id: NationId) => nations.get(id)?.name ?? id;
  const enemies = d?.enemies ?? [];
  const atWarWithTarget = target !== '' && enemies.includes(target);
  const eco = d?.economy;
  const sanctions = d?.sanctions ?? [];
  const sanctioned = target !== '' && sanctions.includes(target);
  const myOffer = target !== '' && !!d?.peaceOffers.some((o) => o.from === n.id && o.to === target);
  const theirOffer = target !== '' && !!d?.peaceOffers.some((o) => o.from === target && o.to === n.id);
  const mobTarget = d?.mobilizationTarget ?? null;
  const mob = mobDraft ?? mobTarget ?? n.mobilization;

  return (
    <div className="panel-scroll" data-testid="nation-panel">
      <div className="nation-head">
        <span className="swatch" style={{ background: palette.of(n.id).css }} />
        <div>
          <div className="nation-name">{n.name}</div>
          <div className="nation-sub">{n.id} · {n.blocs.slice(0, 4).join(', ') || 'non-aligned'} · <span className={`status ${n.status}`}>{n.status}</span></div>
        </div>
      </div>

      <Section title={`Objectives · ${objectives.filter((o) => o.met).length} of ${objectives.length} met`}>
        <ObjectiveList items={objectives} />
      </Section>

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
                <tbody data-testid="lines">
                  {eco.lines.map((l) => (
                    <tr key={l.item}>
                      <td>{itemName(client, l.item)}</td>
                      <td className="num" title={l.ordered !== null ? `Ordered ${fmtNum(l.ordered)} a month` : undefined}>{fmtNum(l.perMonth)}{l.ordered !== null && l.ordered > l.perMonth ? ` → ${fmtNum(l.ordered)}` : ''}</td>
                      <td className="num">{fmtNum(l.built)}</td>
                    </tr>
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
        {d && <Delegation d={d} onCommand={onCommand} />}
        <label className="field">
          <span>Mobilization {mobTarget !== null && Math.abs(mobTarget - n.mobilization) > 0.01 ? `· now ${Math.round(n.mobilization * 100)}%, rising to ${Math.round(mobTarget * 100)}%` : `· now ${Math.round(n.mobilization * 100)}%`}</span>
          <div className="row">
            <input type="range" min={0} max={1} step={0.05} value={mob} onChange={(e) => setMobDraft(+e.target.value)} data-testid="mobilization" />
            <span className="mono w4">{Math.round(mob * 100)}%</span>
            <button disabled={mobDraft === null} onClick={() => { onCommand({ type: 'set_mobilization', nation: n.id, level: mob }, `Mobilisation target set to ${Math.round(mob * 100)}%`); setMobDraft(null); }} data-testid="mobilization-set">Set</button>
          </div>
        </label>
        <label className="field">
          <span>Diplomacy</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as NationId)} data-testid="diplo-target">
            <option value="">Select a nation…</option>
            {targetOptions}
          </select>
        </label>
        <div className="row gap">
          <button className="danger" disabled={!target || atWarWithTarget} onClick={() => target && onCommand({ type: 'declare_war', nation: n.id, target, reason: 'declared by national command authority' }, `War declared on ${name(target)}`)}>Declare war</button>
          <button disabled={!target || !atWarWithTarget || myOffer} onClick={() => target && onCommand({ type: 'offer_peace', nation: n.id, target }, `Peace offered to ${name(target)}`)} data-testid="offer-peace">{myOffer ? 'Offer pending' : theirOffer ? 'Accept peace' : 'Offer peace'}</button>
          <button disabled={!target || atWarWithTarget} onClick={() => target && onCommand({ type: 'sanction', nation: n.id, target, on: !sanctioned }, `${sanctioned ? 'Sanctions lifted on' : 'Sanctions imposed on'} ${name(target)}`)} data-testid="sanction">{sanctioned ? 'Lift sanctions' : 'Sanction'}</button>
        </div>
        {target && myOffer && <p className="small tt-warn" data-testid="peace-status">{name(target)} has not accepted your offer. It stays on the table; they may take it if the war turns against them.</p>}
        {target && theirOffer && <p className="small tt-hint">{name(target)} has offered peace. Accepting ends the war on current lines.</p>}
        {target && sanctioned && <p className="small muted">Sanctions in force: most trade between you stops, a share leaks through third countries.</p>}
        <button className="nuke" disabled={n.deployed <= 0} onClick={onNuclear} data-testid="nuclear-release">
          ☢ Nuclear release…
        </button>
        {n.deployed <= 0 && <p className="muted small">No deployed warheads.</p>}
      </Section>

      <Section title="War production">
        <Production client={client} nation={n.id} lines={eco?.lines ?? []} onCommand={onCommand} />
      </Section>
    </div>
  );
}

function Delegation({ d, onCommand }: { d: NationDetail; onCommand: Props['onCommand'] }) {
  const ai = d.authority.ai;
  const all = COMMAND_DOMAINS.every((k) => ai[k]);
  const none = COMMAND_DOMAINS.every((k) => !ai[k]);
  const set = (domain: CommandDomain, on: boolean) => onCommand({ type: 'delegate', nation: d.id, domain, ai: on }, `${DOMAIN_LABEL[domain].name}: ${on ? 'delegated to the AI' : 'under your command'}`);
  const setAll = (on: boolean) => COMMAND_DOMAINS.forEach((k) => ai[k] !== on && onCommand({ type: 'delegate', nation: d.id, domain: k, ai: on }, on ? 'Everything delegated to the AI' : 'You command everything yourself'));
  return (
    <div className="delegation" data-testid="delegation">
      <div className="field-label">AI delegate <span className="muted">commands what you hand it, except formations you have ordered</span></div>
      {COMMAND_DOMAINS.map((k) => (
        <label key={k} className="chk deleg" title={`The AI decides ${DOMAIN_LABEL[k].what}`}>
          <input type="checkbox" checked={ai[k]} onChange={(e) => set(k, e.target.checked)} data-testid={`delegate-${k}`} />
          <span>{DOMAIN_LABEL[k].name}</span>
          <span className={`deleg-who ${ai[k] ? 'ai' : 'you'}`}>{ai[k] ? 'AI' : 'You'}</span>
        </label>
      ))}
      <div className="row gap">
        <button disabled={all} onClick={() => setAll(true)} data-testid="delegate-all">Delegate all</button>
        <button disabled={none} onClick={() => setAll(false)} data-testid="delegate-none">Command all myself</button>
      </div>
      {d.authority.held.length > 0 && <p className="muted small">{d.authority.held.length} formations under your personal command.</p>}
    </div>
  );
}

function Production({ client, nation, lines, onCommand }: { client: SimClient; nation: NationId; lines: { item: ItemId; perMonth: number; built: number }[]; onCommand: Props['onCommand'] }) {
  const [item, setItem] = useState('');
  const [rate, setRate] = useState(10);
  const meta = client.meta;
  const options = useMemo(() => {
    if (!meta) return null;
    const buildable = (rec: Record<string, { name: string; producers: NationId[] }>) =>
      Object.entries(rec).filter(([, v]) => v.producers.includes(nation)).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, v]) => <option key={id} value={id}>{v.name}</option>);
    const platforms = buildable(meta.platforms), munitions = buildable(meta.munitions);
    return platforms.length || munitions.length ? { platforms, munitions } : null;
  }, [meta, nation]);
  if (!options) return <p className="muted small">No domestic arms industry: this nation cannot open production lines.</p>;
  const current = lines.find((l) => l.item === item);
  return (
    <div className="production" data-testid="production">
      <label className="field">
        <span>Order production</span>
        <select value={item} onChange={(e) => setItem(e.target.value)} data-testid="produce-item">
          <option value="">Choose a platform or munition…</option>
          <optgroup label="Platforms">{options.platforms}</optgroup>
          <optgroup label="Munitions">{options.munitions}</optgroup>
        </select>
      </label>
      <div className="row">
        <input type="number" min={0} step={1} value={rate} onChange={(e) => setRate(Math.max(0, +e.target.value))} className="num-input" data-testid="produce-rate" />
        <span className="muted small">per month</span>
        <button disabled={!item} onClick={() => onCommand({ type: 'produce', nation, item: item as ItemId, ratePerMonth: rate }, `${itemName(client, item)}: ${rate} a month ordered`)} data-testid="produce">Order</button>
      </div>
      {item && <p className="muted small">{current ? `Line running at ${fmtNum(current.perMonth)} a month; the order changes its target.` : 'A new line takes months to tool up before it reaches the ordered rate.'}</p>}
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
