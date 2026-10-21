import { memo, useState } from 'react';
import type { Formation, FormationId, FormationKind, NationId, NodeId, Order, Posture, TargetClass } from '../core/types';
import type { SimClient } from './client';
import type { Palette } from './colors';
import type { PlaceNamer } from './events';
import type { DeployView, FormationDetail } from './snapshot';
import type { Routes } from './routes';
import { Bar, Section, Stat, fmtNum } from './widgets';

export const GROUND_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'missile', 'logistics']);

/** Which postures make sense for each formation kind, in button order. */
export const POSTURES_BY_KIND: Record<FormationKind, readonly Posture[]> = {
  maneuver: ['move', 'attack', 'defend', 'reserve'],
  artillery: ['move', 'strike', 'defend', 'reserve'],
  air_defense: ['move', 'defend', 'reserve'],
  missile: ['move', 'strike', 'defend', 'reserve'],
  air_wing: ['strike', 'air_superiority', 'patrol', 'defend', 'reserve'],
  surface_group: ['move', 'attack', 'strike', 'patrol', 'blockade', 'defend', 'reserve'],
  submarine: ['move', 'strike', 'patrol', 'blockade', 'reserve'],
  strategic: ['defend', 'reserve'],
  logistics: ['move', 'defend', 'reserve'],
  space: ['patrol', 'reserve'],
};

export const NEEDS_TARGET: ReadonlySet<Posture> = new Set(['move', 'attack', 'strike', 'air_superiority', 'patrol', 'blockade', 'air_assault']);

/** Postures a formation can be given: its kind's, plus an air assault for airborne troops. */
export const posturesOf = (f: Formation): readonly Posture[] => (f.airborne ? [...POSTURES_BY_KIND[f.kind], 'air_assault'] : POSTURES_BY_KIND[f.kind]);
const STRIKE_CLASSES: TargetClass[] = ['structure', 'hardened', 'soft', 'armor', 'ship', 'aircraft'];

/** Who commands a formation of the player's nation. */
export type Command = 'player' | 'delegate' | 'none';

interface Props {
  client: SimClient;
  palette: Palette;
  places: PlaceNamer;
  routes: Routes;
  playAs: NationId;
  /** 'delegate' while the AI runs it, 'player' once held, 'none' when its domain is not delegated and it is not held. */
  command: Command;
  domainLabel: string;
  pending: Posture | null;
  /** The lift chosen for a pending overseas deployment. */
  pendingLift: 'air' | 'sea' | null;
  onPickPosture(p: Posture | null, targetClass?: TargetClass, lift?: 'air' | 'sea'): void;
  onImmediate(p: Posture): void;
  /** Send an order to any formation of the player's (embark, sail a lift group, march to a port). */
  onOrder(formation: FormationId, order: Omit<Order, 'issuedTick'>, label: string): void;
  onHold(held: boolean): void;
  onClose(): void;
  onFocus(node: NodeId): void;
}

export function FormationPanel({ client, palette, places, routes, playAs, command, domainLabel, pending, pendingLift, onPickPosture, onImmediate, onOrder, onHold, onClose, onFocus }: Props) {
  const detail = client.state.focusFormation;
  const [tc, setTc] = useState<TargetClass>('structure');
  if (!detail) return <div className="panel-scroll"><p className="muted">Loading formation…</p></div>;
  const f = detail.formation;
  const report = latestReport(client, f);
  const meta = client.meta;
  const own = f.nation === playAs;
  const nation = client.state.nations.get(f.nation);
  const damaged = f.damaged as Record<string, number>;
  const equipment = Object.entries(f.equipment).filter(([id, v]) => v > 0 || (damaged[id] ?? 0) > 0);
  const magazine = Object.entries(f.magazine).filter(([, v]) => v > 0);
  const frac = (k: 'fuel' | 'ammo' | 'food') => (f.supplyCapacity[k] ? f.supply[k] / f.supplyCapacity[k] : 0);
  const ground = GROUND_KINDS.has(f.kind);
  const port = detail.deploy && f.status === 'active' && detail.portZone === null ? routes.nearestPort(f.node, (p) => client.state.control[p] === client.state.control[f.node]) : null;

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

      {own && f.status !== 'destroyed' && (
        <div className={`command-line ${command}`} data-testid="command-line">
          {command === 'player' && <><span><b>Under your command.</b> The AI delegate leaves it alone.</span><button onClick={() => onHold(false)} data-testid="release">Hand to AI</button></>}
          {command === 'delegate' && <><span><b>AI-managed.</b> The delegate commands your {domainLabel}. Any order you give takes it over.</span><button onClick={() => onHold(true)} data-testid="take">Take command</button></>}
          {command === 'none' && <span><b>Awaiting your orders.</b> You have not delegated {domainLabel} to the AI.</span>}
        </div>
      )}

      <Section title="Situation">
        <p className="activity" data-testid="activity">{activity(detail, (n) => places.name(n), (id) => client.state.nations.get(id)?.name ?? id)}</p>
        {report && <p className="tt-warn small" data-testid="report">Latest report: {report}</p>}
        <div className="stat-grid">
          <Stat label="Location"><a onClick={() => onFocus(f.node)}>{places.name(f.node)}</a></Stat>
          <Stat label="Order">{f.order.posture.replace(/_/g, ' ')}{f.order.target !== undefined ? ` → ${places.name(f.order.target)}` : ''}</Stat>
          <Stat label="Personnel">{fmtNum(f.personnel)}</Stat>
          <Stat label="Route">{f.order.path?.length ? `${f.order.path.length} cells, ${Math.round(f.progressKm)} km into leg` : '—'}</Stat>
        </div>
      </Section>

      {own && f.status !== 'destroyed' ? (
        <Section title="Issue orders">
          <div className="posture-grid">
            {posturesOf(f).map((p) => (
              <button
                key={p}
                data-testid={`posture-${p}`}
                className={pending === p && !pendingLift ? 'active' : f.order.posture === p ? 'current' : ''}
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
        <p className="muted small pad">{own ? 'Formation destroyed.' : `Foreign formation. Play as ${nation?.name ?? f.nation} to command it.`}</p>
      )}

      {own && detail.deploy && f.status === 'active' && (
        <Deploy d={detail.deploy} name={f.name} place={(n) => places.name(n)} pendingLift={pending === 'move' ? pendingLift : null} onPick={(lift) => onPickPosture(pending === 'move' && pendingLift === lift ? null : 'move', undefined, lift)} />
      )}

      {own && detail.deploy && f.status === 'active' && (
        <Section title="Amphibious lift">
          <p className="muted small">To land under fire, or where no friendly port is open, board an amphibious group in a port, then order the group to Attack a coast or Move to a friendly port to unload.</p>
          {detail.portZone === null && (port !== null
            ? <p className="small">Not in a port. Nearest port: <a onClick={() => onFocus(port)}>{places.name(port)}</a> <button data-testid="move-to-port" onClick={() => onOrder(f.id, { posture: 'move', target: port }, `${f.name} marching to ${places.name(port)} to embark`)}>March there</button></p>
            : <p className="small tt-warn">No friendly port on this land mass.</p>)}
          {detail.lifts.length ? (
            <ul className="lift-list" data-testid="lifts">
              {detail.lifts.map((l) => (
                <li key={l.id}>
                  <span><b>{l.name}</b> <span className="muted">{places.name(l.node)} · carries {l.share >= 1 ? 'all' : `${Math.round(l.share * 100)}%`} of this unit</span></span>
                  {l.boardNow
                    ? <button data-testid="embark-on" onClick={() => onOrder(f.id, { posture: 'embark', targetFormation: l.id }, `${f.name} embarking on ${l.name}`)}>Embark</button>
                    : detail.portZone !== null && <button data-testid="call-lift" onClick={() => onOrder(l.id, { posture: 'move', target: detail.portZone! }, `${l.name} sailing to ${places.name(f.node)} to load ${f.name}`)}>Sail here</button>}
                </li>
              ))}
            </ul>
          ) : <p className="small muted">No amphibious group has room for this unit.</p>}
        </Section>
      )}

      {detail.aboard.length > 0 && (
        <Section title={`Aboard · ${detail.aboard.length}`}>
          <ul className="lift-list" data-testid="aboard">{detail.aboard.map((a) => <li key={a.id}>{a.name}</li>)}</ul>
          {own && <p className="muted small">Order Move to a friendly port to unload them, or Attack a coastal cell to land under fire.</p>}
        </Section>
      )}

      <Section title="Condition">
        <Bar label="Readiness" value={f.readiness} tone="auto" />
        <Bar label="Morale" value={f.morale} tone="auto" />
        <Bar label="Experience" value={f.experience} tone="good" />
        <Bar label="Fatigue" value={f.fatigue} tone={f.fatigue > 0.6 ? 'bad' : 'warn'} />
        <Bar label="Entrenchment" value={f.entrenchment} tone="good" />
      </Section>

      <Section title="Supply">
        {detail.supplyFlow !== null && <Bar label="Supply line throughput here" value={detail.supplyFlow} tone="auto" />}
        {detail.isolatedDays > 0 && <p className="tt-warn">Cut off from friendly supply for {detail.isolatedDays.toFixed(1)} days.</p>}
        <Bar label="Fuel" value={frac('fuel')} tone="auto" detail={`${fmtNum(f.supply.fuel)} / ${fmtNum(f.supplyCapacity.fuel)} t`} />
        <Bar label="Ammunition" value={frac('ammo')} tone="auto" detail={`${fmtNum(f.supply.ammo)} / ${fmtNum(f.supplyCapacity.ammo)} t`} />
        <Bar label="Food" value={frac('food')} tone="auto" detail={`${fmtNum(f.supply.food)} / ${fmtNum(f.supplyCapacity.food)} t`} />
      </Section>

      <Section title={`Equipment · ${fmtNum(Object.values(f.equipment).reduce((a, b) => a + b, 0))} platforms`}>
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
      </Section>

      <Section title="Magazines">
        {magazine.length > 0 ? (
          <table className="tbl" data-testid="magazine">
            <thead><tr><th>Munition</th><th>Kind</th><th className="num">Held</th></tr></thead>
            <tbody>
              {magazine.map(([id, v]) => (
                <tr key={id}><td>{meta?.munitions[id]?.name ?? id}</td><td className="muted">{meta?.munitions[id]?.kind.replace(/_/g, ' ')}</td><td className="num">{fmtNum(v)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No guided munitions held; fights with bulk ammunition only.</p>}
      </Section>

    </div>
  );
}

const days = (d: number) => (d < 1 ? `${Math.max(1, Math.round(d * 24))} hours` : `${d.toFixed(d < 10 ? 1 : 0)} days`);

/** Strategic deployment overseas: by the nation's airlift or by its cargo ships, to a friendly port or airfield on the far shore. */
function Deploy({ d, name, place, pendingLift, onPick }: { d: DeployView; name: string; place(n: NodeId): string; pendingLift: 'air' | 'sea' | null; onPick(lift: 'air' | 'sea'): void }) {
  const canFly = d.airPortable && d.airliftTonsPerDay > 0;
  const flyDays = d.airliftTonsPerDay > 0 ? d.airTons / d.airliftTonsPerDay : Infinity;
  const job = d.deploying;
  return (
    <Section title="Deploy overseas">
      <p className="muted small">Order a move to a cell across the sea. {name} marches to a port or airfield, waits for lift, and is put down at the friendly port or airfield nearest the destination.</p>
      {job && (
        <p className="small" data-testid="deploy-status">
          <b>Deploying to {place(job.target)} by {job.mode === 'air' ? 'airlift' : 'sealift'}</b>: {job.waiting
            ? job.mode === 'air' ? `at the airfield, ${fmtNum(job.flownTons)} of ${fmtNum(d.airTons)} t flown.` : d.atWar ? 'at the port, waiting for cargo ships.' : 'at the port. Cargo ships sail only once your nation is at war.'
            : `marching to its ${job.mode === 'air' ? 'airfield' : 'port'}.`}
        </p>
      )}
      <table className="tbl deploy-tbl" data-testid="deploy">
        <tbody>
          <tr>
            <td><b>Airlift</b></td>
            <td className="small">{!d.airPortable ? 'Too heavy to fly: tanks and tracked vehicles go by sea.' : d.airliftTonsPerDay <= 0 ? 'Your nation has no transport aircraft.' : `${fmtNum(d.airTons)} t to fly; your airlift moves ${fmtNum(d.airliftTonsPerDay)} t a day for land forces, about ${days(flyDays)} if nothing else is queued.`}</td>
            <td><button disabled={!canFly} className={pendingLift === 'air' ? 'active' : ''} onClick={() => onPick('air')} data-testid="deploy-air">By air…</button></td>
          </tr>
          <tr>
            <td><b>Sealift</b></td>
            <td className="small">{d.sealiftGroups === 0 ? 'Your nation has no cargo-ship groups.' : `${fmtNum(d.deckSlots)} deck slots to load; ${d.sealiftGroups} cargo-ship group${d.sealiftGroups > 1 ? 's' : ''} with ${fmtNum(d.sealiftSlots)} slots.${d.atWar ? '' : ' Ships sail once your nation is at war.'}`}</td>
            <td><button disabled={d.sealiftGroups === 0} className={pendingLift === 'sea' ? 'active' : ''} onClick={() => onPick('sea')} data-testid="deploy-sea">By sea…</button></td>
          </tr>
        </tbody>
      </table>
      {pendingLift && <p className="hint">Click the destination across the sea. Esc cancels.</p>}
    </Section>
  );
}

/** Refused or failed orders, as the log words them: prefixed with the formation's name. */
function latestReport(client: SimClient, f: Formation): string | null {
  const prefix = `${f.name}: `;
  const rows = client.feed.rows.messages;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.event.type === 'message' && r.event.nation === f.nation && r.text.startsWith(prefix)) return r.text.slice(prefix.length);
  }
  return null;
}

const DOING: Record<Posture, (target: string) => string> = {
  reserve: () => 'Regenerating in reserve at home base',
  defend: (t) => `Holding ${t}`,
  attack: (t) => `Attacking toward ${t}`,
  move: (t) => `Moving to ${t}`,
  strike: (t) => `Striking ${t}`,
  air_superiority: (t) => `Flying counter-air over ${t}`,
  patrol: (t) => `Patrolling ${t}`,
  blockade: (t) => `Blockading ${t}`,
  escort: (t) => `Escorting near ${t}`,
  embark: () => 'Embarking on sealift',
  air_assault: (t) => `Air assault onto ${t}`,
};

/** One line on what the unit is doing now and what is happening to it. */
export function activity(d: FormationDetail, place: (n: NodeId) => string, nationName: (id: NationId) => string): string {
  const f = d.formation;
  if (f.status === 'destroyed') return 'Destroyed.';
  if (f.status === 'embarked') return `Embarked${f.embarkedOn ? ` on ${f.embarkedOn}` : ''}, at sea.`;
  const parts = [DOING[f.order.posture](place(f.order.target ?? f.node))];
  if (f.order.targetClass && f.order.posture === 'strike') parts[0] += ` (${f.order.targetClass} targets)`;
  if (f.order.path?.length) parts.push(`${f.order.path.length} cells to go`);
  if (f.status === 'routed') parts.push('routed and falling back');
  if (d.engaged) parts.push('in contact with the enemy');
  if (f.order.posture === 'defend' && f.entrenchment > 0.05) parts.push(`${Math.round(f.entrenchment * 100)}% dug in`);
  if (d.trackedBy.length) parts.push(`tracked by ${d.trackedBy.map(nationName).join(', ')}`);
  return `${parts.join('; ')}.`;
}

interface ListProps {
  client: SimClient;
  palette: Palette;
  places: PlaceNamer;
  playAs: NationId;
  commandOf(id: FormationId, kind: FormationKind): Command;
  onSelect(f: FormationId, node: NodeId): void;
  onReleaseAll(): void;
}

const COMMAND_TAG: Record<Command, string> = { player: 'You', delegate: 'AI', none: 'You' };
const COMMAND_TITLE: Record<Command, string> = { player: 'Under your command', delegate: 'Commanded by the AI delegate', none: 'Not delegated; waiting for your orders' };

const OobRow = memo(function OobRow({ id, name, color, posture, place, strength, command, node, onSelect }: {
  id: FormationId; name: string; color: string; posture: string; place: string; strength: number; command: Command; node: NodeId; onSelect(f: FormationId, node: NodeId): void;
}) {
  return (
    <li onClick={() => onSelect(id, node)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id, node); } }} tabIndex={0} role="button" data-testid="oob-item">
      <span className="swatch sm" style={{ background: color }} />
      <span className="oob-name">{name}<span className={`cmd-tag ${command}`} title={COMMAND_TITLE[command]}>{COMMAND_TAG[command]}</span></span>
      <span className="oob-meta">{posture} · {place}</span>
      <span className="oob-str"><i style={{ width: `${strength}%` }} /></span>
    </li>
  );
});

/** Order-of-battle groups, by the domain that commands them. */
const OOB_GROUPS: { label: string; kinds: readonly FormationKind[] }[] = [
  { label: 'Land', kinds: ['maneuver', 'artillery', 'air_defense', 'missile', 'logistics'] },
  { label: 'Air', kinds: ['air_wing'] },
  { label: 'Naval', kinds: ['surface_group', 'submarine'] },
  { label: 'Strategic and space', kinds: ['strategic', 'space'] },
];

export function FormationList({ client, palette, places, playAs, commandOf, onSelect, onReleaseAll }: ListProps) {
  const [query, setQuery] = useState('');
  const mine = client.state.formations.filter((f) => f.entry.nation === playAs && f.status !== 'destroyed');
  const held = mine.filter((f) => commandOf(f.entry.id, f.entry.kind) === 'player').length;
  const color = palette.of(playAs).css;
  const q = query.trim().toLowerCase();
  const shown = q ? mine.filter((f) => f.entry.name.toLowerCase().includes(q) || places.name(f.node).toLowerCase().includes(q) || f.posture.replace(/_/g, ' ').includes(q)) : mine;
  return (
    <div className="panel-scroll">
      <Section title={`Order of battle · ${mine.length}`} right={held > 0 ? <button className="small-btn" onClick={onReleaseAll} data-testid="release-all">Hand {held} to AI</button> : undefined}>
        {!mine.length && <p className="muted">This nation fields no formations in the scenario. Pick another nation, or watch the war unfold.</p>}
        {mine.length > 0 && (
          <input className="oob-search" type="search" placeholder="Search by name, place or order…" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="oob-search" aria-label="Search the order of battle" />
        )}
        {OOB_GROUPS.map((g) => {
          const rows = shown.filter((f) => g.kinds.includes(f.entry.kind));
          if (!rows.length) return null;
          return (
            <details key={g.label} className="oob-group" open={!!q || g.label === 'Land' || rows.length <= 40} data-testid={`oob-group-${g.label.split(' ')[0].toLowerCase()}`}>
              <summary>{g.label} <span className="muted">· {rows.length}</span></summary>
              <ul className="oob">
                {rows.map((f) => (
                  <OobRow
                    key={f.entry.id}
                    id={f.entry.id}
                    name={f.entry.name}
                    color={color}
                    posture={f.posture.replace(/_/g, ' ')}
                    place={places.name(f.node)}
                    strength={Math.round(f.strength * 100)}
                    command={commandOf(f.entry.id, f.entry.kind)}
                    node={f.node}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </details>
          );
        })}
        {q && !shown.length && <p className="muted small">No formation matches “{query}”.</p>}
        <p className="muted small">Click a counter on the map, or a row here (Tab and Enter work too), to inspect and command it.</p>
      </Section>
    </div>
  );
}
