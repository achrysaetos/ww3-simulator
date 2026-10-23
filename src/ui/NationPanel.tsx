import { useMemo, useState } from 'react';
import { COMMAND_DOMAINS, type Command, type CommandDomain, type ItemId, type NationId } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { EconomyView, HomeFrontView, NuclearAlertView, MunitionGroup, NationDetail, WarEntry, WarView } from './snapshot';
import type { Objective } from './briefing';
import { ObjectiveList } from './GameFlow';
import { delegateCommands, type Delegation } from './staff/roles';
import { Bar, Section, Stat, fmtNum, fmtUsdB } from './widgets';

interface Props {
  client: SimClient;
  palette: Palette;
  playAs: NationId;
  objectives: Objective[];
  /** Send a command; `label` is what the toast says was done. */
  onCommand(c: Command, label: string): void;
  onNuclear(): void;
  /** Which domains the AI staff runs, as the engine last confirmed. */
  ai: Delegation;
  /** Domains the player has just switched and the engine has not confirmed yet. */
  delegating: Partial<Delegation>;
  onDelegate(commands: Command[]): void;
}

export const DOMAIN_LABEL: Record<CommandDomain, { name: string; what: string }> = {
  land: { name: 'Land forces', what: 'land forces' },
  air: { name: 'Air and missile forces', what: 'air and missile forces' },
  naval: { name: 'Naval forces', what: 'naval forces' },
  homefront: { name: 'Home front', what: 'mobilisation and war production' },
  strategic: { name: 'Strategic decisions', what: 'war, peace, treaty calls and nuclear release' },
};

const AI_RUNS: Record<CommandDomain, string> = { land: 'Land', air: 'Air', naval: 'Navy', homefront: 'Home front', strategic: 'War & peace' };

/** "AI runs": one toggle per domain, lit while the AI staff decides it. */
function Delegate({ me, ai, delegating, onDelegate }: { me: NationId } & Pick<Props, 'ai' | 'delegating' | 'onDelegate'>) {
  const want = { ...ai, ...delegating };
  return (
    <div className="nation-ai" role="group" aria-label="AI runs" data-testid="delegation">
      <span className="ww-label">AI runs</span>
      {COMMAND_DOMAINS.map((k) => (
        <button
          key={k}
          type="button"
          className={`${want[k] ? 'on' : ''} ${delegating[k] !== undefined ? 'waiting' : ''}`}
          aria-pressed={want[k]}
          title={want[k] ? `Your AI staff decides ${DOMAIN_LABEL[k].what}. Click to take it yourself.` : `You decide ${DOMAIN_LABEL[k].what}. Click to hand it to your AI staff.`}
          onClick={() => onDelegate(delegateCommands(me, want, { ...want, [k]: !want[k] }))}
          data-testid={`staff-${k}`}
        >
          {AI_RUNS[k]}
        </button>
      ))}
    </div>
  );
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

export function NationPanel({ client, palette, playAs, objectives, onCommand, onNuclear, ai, delegating, onDelegate }: Props) {
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
  const letsIn = target !== '' && !!d?.access.includes(target);
  const letsUsIn = target !== '' && !!d?.accessFrom.includes(target);
  const aiding = target !== '' && !!d?.aid.includes(target);
  const targetAtWar = target !== '' && client.state.wars.some(([a, b]) => a === target || b === target);
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
      <Delegate me={playAs} ai={ai} delegating={delegating} onDelegate={onDelegate} />

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
          <Stat label="War borrowing">{n.treasuryUsdB < -0.05 ? fmtUsdB(-n.treasuryUsdB) : n.treasuryUsdB > 0.05 ? `none, ${fmtUsdB(n.treasuryUsdB)} surplus` : 'None yet'}</Stat>
          <Stat label="War deficit">{eco ? (eco.deficitPctGdp >= 0.0005 ? `${(eco.deficitPctGdp * 100).toFixed(1)}% GDP` : 'None') : '—'}</Stat>
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

      {d && <HomeFront h={d.homeFront} />}

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
            {d.bulk && (
              <div className="stat-grid">
                <Stat label="Ammunition incl. shells">{fmtNum(d.bulk.ammo)} t</Stat>
                <Stat label="Fuel">{fmtNum(d.bulk.fuel)} t</Stat>
                <Stat label="Food">{fmtNum(d.bulk.food)} t</Stat>
              </div>
            )}
            <table className="tbl" data-testid="munitions">
              <thead><tr><th>Family</th><th className="num">Depots</th><th className="num">Loaded</th><th className="num">+/mo</th></tr></thead>
              <tbody>
                {d.munitions.map((m) => (
                  <tr key={m.group}>
                    <td>{GROUP_LABEL[m.group]}</td>
                    <td className="num">{m.warehoused === null ? '—' : fmtNum(m.warehoused)}</td>
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
        {d && <NuclearAlert alert={d.nuclear.alert} nation={n.id} dtHours={client.meta?.dtHours ?? 6} tick={client.state.tick} onCommand={onCommand} />}
        {d && Object.keys(d.nuclear.bmd).length > 0 && (
          <table className="tbl">
            <thead><tr><th>Missile defence</th><th className="num">Interceptors</th></tr></thead>
            <tbody>{Object.entries(d.nuclear.bmd).map(([id, v]) => <tr key={id}><td className="mono">{id}</td><td className="num">{fmtNum(v)}</td></tr>)}</tbody>
          </table>
        )}
      </Section>

      <Section title="Command authority">
        {d && <HeldByHand d={d} />}
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
          <button disabled={!target || atWarWithTarget} onClick={() => target && onCommand({ type: 'sanction', nation: n.id, target, on: !sanctioned }, `${sanctioned ? 'Sanctions lifted on' : 'Sanctions imposed on'} ${name(target)}`)} data-testid="sanction">{sanctioned ? 'Lift sanctions' : 'Sanction'}</button>
        </div>
        <div className="row gap">
          <button
            disabled={!target || (atWarWithTarget && !letsIn)}
            title={target ? (letsIn ? `Close your land to ${name(target)}'s troops` : `Let ${name(target)}'s troops cross your land`) : undefined}
            onClick={() => target && onCommand({ type: 'grant_access', nation: n.id, target, on: !letsIn }, letsIn ? `Your land is closed to ${name(target)}'s troops` : `${name(target)}'s troops may now cross your land`)}
            data-testid="grant-access"
          >{letsIn ? 'Close borders' : 'Grant passage'}</button>
          <button
            disabled={!target || atWarWithTarget || (!aiding && !targetAtWar)}
            title={target && !aiding && !targetAtWar ? `${name(target)} is not at war: there is nothing to aid it in` : undefined}
            onClick={() => target && onCommand({ type: 'set_aid', nation: n.id, target, on: !aiding }, aiding ? `Aid to ${name(target)} stopped` : `Your air defence now covers ${name(target)}`)}
            data-testid="set-aid"
          >{aiding ? 'Stop aid' : 'Give aid'}</button>
        </div>
        {target && (letsIn || letsUsIn || aiding) && (
          <p className="small muted" data-testid="access-status">
            {[letsIn && `${name(target)}'s troops may cross your land.`, letsUsIn && `${name(target)} lets your troops cross its land.`, aiding && `Your air defence covers ${name(target)}, short of joining its war.`].filter(Boolean).join(' ')}
          </p>
        )}
        {target && atWarWithTarget && <p className="small muted">To offer {name(target)} peace, drag your flag onto theirs in the top bar.</p>}
        {target && sanctioned && <p className="small muted">Sanctions in force: most trade between you stops, a share leaks through third countries.</p>}
        <button className="nuke" disabled={n.deployed <= 0} onClick={onNuclear} data-testid="nuclear-release">
          ☢ Nuclear release…
        </button>
        {n.deployed <= 0 && <p className="muted small">No deployed warheads.</p>}
      </Section>

      <Section title="War production">
        <Production client={client} nation={n.id} eco={eco} treasuryUsdB={n.treasuryUsdB} onCommand={onCommand} />
      </Section>
    </div>
  );
}

const DRIVER_LABEL: Record<string, string> = {
  economy: 'Cost of living', losses: 'Casualty rate', rally: 'Rally after strikes', refugees: 'Refugee burden',
  mobilization: 'Mobilisation strain', unrest: 'Elite defection', election: 'Election verdict',
};

function HomeFront({ h }: { h: HomeFrontView }) {
  const drivers = Object.entries(h.drivers ?? {}).filter(([, v]) => Math.abs(v) >= 0.005);
  return (
    <Section title="Home front" right={h.protesting ? <span className="chip enemy">protests</span> : undefined}>
      <div className="stat-grid" data-testid="home-front">
        <Stat label="Displaced at home">{fmtNum(h.idps)}</Stat>
        <Stat label="Refugees abroad">{fmtNum(h.refugees)}</Stat>
        <Stat label="Sheltering">{fmtNum(h.sheltering)}</Stat>
        <Stat label="Under occupation">{fmtNum(h.underOccupation)}</Stat>
        <Stat label="Civilians killed">{fmtNum(h.civiliansKilled)}</Stat>
        <Stat label="Civilians injured">{fmtNum(h.civiliansInjured)}</Stat>
        {h.sabotage > 0 && <Stat label="Partisan sabotage">{fmtNum(h.sabotage)}</Stat>}
        {h.aid && <Stat label="Arms aid">{h.aid.continues ? 'funded' : 'lapsed'} · {Math.round(h.aid.support * 100)}% back it</Stat>}
        {h.nextElection && <Stat label="Next election">{h.nextElection.date.slice(0, 10)} ({h.nextElection.kind})</Stat>}
        {h.lastElection && <Stat label="Last election">{h.lastElection.incumbentWon ? 'government held' : 'government lost'}</Stat>}
      </div>
      {h.mobilizationTolerance !== null && <Bar label="Mobilisation the public bears" value={h.mobilizationTolerance} tone="warn" />}
      {h.stability !== null && <Bar label="Regime stability" value={h.stability} tone="auto" />}
      {drivers.length > 0 && (
        <table className="tbl">
          <tbody>
            {drivers.map(([k, v]) => (
              <tr key={k}><td>{DRIVER_LABEL[k] ?? k}</td><td className="num">{v > 0 ? '+' : ''}{Math.round(v * 100)} pts</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/** Who runs which domain is set on the staff panel; the drawer only says what the player holds by hand. */
function HeldByHand({ d }: { d: NationDetail }) {
  if (!d.authority.held.length) return null;
  return <p className="muted small" data-testid="held-by-hand">{d.authority.held.length} formations under your personal command. Your staff panel sets which domains the AI runs.</p>;
}

function NuclearAlert({ alert, nation, tick, dtHours, onCommand }: { alert: NuclearAlertView; nation: NationId; tick: number; dtHours: number; onCommand: Props['onCommand'] }) {
  const { stored, mated, ordered } = alert;
  if (!ordered && stored <= 0) return null;
  return (
    <div className="alert-status small" data-testid="nuclear-alert">
      <p className="muted" data-testid="alert-status">
        {fmtNum(mated)} warheads mated to launchers, {fmtNum(stored)} in storage.
        {ordered && ` Alert ordered ${Math.max(0, Math.floor(((tick - ordered.tick) * dtHours) / 24))}d ago: ${fmtNum(ordered.mated)} of ${fmtNum(ordered.of)} stored warheads mated so far.`}
        {!ordered && !alert.canOrder && ' No alert timeline is on record for this state.'}
      </p>
      {alert.canOrder && (
        <button className="danger" onClick={() => onCommand({ type: 'nuclear_alert', nation }, 'Nuclear alert ordered: stored warheads are being mated')} data-testid="nuclear-alert-order">
          Order nuclear alert
        </button>
      )}
    </div>
  );
}

function Production({ client, nation, eco, treasuryUsdB, onCommand }: { client: SimClient; nation: NationId; eco: EconomyView | null | undefined; treasuryUsdB: number; onCommand: Props['onCommand'] }) {
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
  const line = item ? eco?.capacity[item] : undefined;
  const ceiling = item && !line ? eco?.greenfield[item] : undefined;
  const max = line ? Math.max(0, Math.floor(line.surge)) : ceiling !== undefined ? Math.max(0, Math.floor(ceiling)) : undefined;
  const ordered = max === undefined ? rate : Math.min(rate, max);
  const unitUsdM = meta?.platforms[item]?.costUsdM ?? meta?.munitions[item]?.costUsdM ?? 0;
  const monthlyB = (ordered * unitUsdM) / 1000;
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
        <input type="number" min={0} max={max} step={1} value={rate} onChange={(e) => setRate(Math.max(0, Math.min(max ?? Infinity, Math.floor(+e.target.value) || 0)))} className="num-input" data-testid="produce-rate" />
        <span className="muted small">per month{max !== undefined ? ` (max ${fmtNum(max)})` : ''}</span>
        <button disabled={!item} onClick={() => onCommand({ type: 'produce', nation, item: item as ItemId, ratePerMonth: ordered }, `${itemName(client, item)}: ${fmtNum(ordered)} a month ordered`)} data-testid="produce">Order</button>
      </div>
      {item && (
        <div className="small" data-testid="produce-info">
          <p className="muted">
            {fmtUsd(unitUsdM)} each; {fmtNum(ordered)} a month costs {fmtUsdB(monthlyB)} a month{treasuryUsdB > 0 && monthlyB > 0 ? `, ${monthlyB >= treasuryUsdB ? 'more than' : `${Math.max(1, Math.round((monthlyB / treasuryUsdB) * 100))}% of`} the treasury` : ''}.
          </p>
          <p className="muted">
            {line
              ? `Your line makes ${fmtNum(line.perMonth)} a month now and can surge to ${fmtNum(line.surge)}; the order raises it toward that over months.`
              : `No line builds this yet. A new line takes months to tool up${ceiling !== undefined ? ` and can reach at most ${fmtNum(ceiling)} a month, set by your industry` : ', and its size is limited by your industry'}.`}
          </p>
        </div>
      )}
    </div>
  );
}

const fmtUsd = (usdM: number) => (usdM >= 1000 ? fmtUsdB(usdM / 1000) : usdM >= 1 ? `$${usdM.toFixed(usdM >= 10 ? 0 : 1)}M` : `$${Math.round(usdM * 1000)}k`);

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
