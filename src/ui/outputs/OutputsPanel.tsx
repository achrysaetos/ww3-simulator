import { useState } from 'react';
import type { NationId } from '../../core/types';
import type { RaceItem, Workaround, WorkaroundId } from '../../outputs';
import type { NationOutputsView, OutputsView, RaceView } from './view';
import './outputs.css';

const TABS = [
  { id: 'cost', label: 'Human cost' },
  { id: 'race', label: 'Production' },
  { id: 'lifelines', label: 'Lifelines' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const ITEM_LABEL: Record<RaceItem, string> = {
  shells: 'Artillery shells',
  ammo: 'Ammunition depots',
  interceptors: 'Air-defence interceptors',
  cruise: 'Cruise missiles',
  ballistic: 'Ballistic missiles',
  drones: 'Long-range attack drones',
};

const WORKAROUND_LABEL: Record<WorkaroundId, { name: string; what: string }> = {
  trade_rerouting: { name: 'Trade rerouting', what: 'Sanctioned goods arriving through third countries' },
  dual_use_imports: { name: 'Dual-use imports', what: 'Export-controlled chips smuggled in or drawn from stock' },
  shadow_fleet: { name: 'Shadow fleet', what: 'Oil and gas exports sailing despite sanctions' },
  foreign_arms: { name: 'Foreign arms', what: 'Partner shells and missiles against their planned rate' },
};

/** A stock with more runway than this reads as safe; the runway bar spans it. */
const RUNWAY_DAYS = 180;

function num(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e6) return `${(x / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(x / 1e3)}k`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(1)}k`;
  return `${Math.round(x)}`;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const levelTone = (x: number) => (x >= 0.9 ? 'green' : x >= 0.6 ? 'gold' : 'red');

const sum = (v: OutputsView, side: readonly NationId[], f: (n: NationOutputsView) => number) => side.reduce((a, id) => a + (v.nations[id] ? f(v.nations[id]) : 0), 0);

interface Props {
  view: OutputsView | undefined;
  name(n: NationId): string;
}

export function OutputsPanel({ view, name }: Props) {
  const [tab, setTab] = useState<Tab>('cost');
  if (!view) return <div className="panel-scroll ww-cost"><p className="ww-cost-empty">The first reading of the war's cost arrives at the end of the first day.</p></div>;
  const sides = (side: readonly NationId[]) => side.map(name).join(', ') || 'none';
  return (
    <div className="panel-scroll ww-cost" data-testid="outputs-panel">
      <div className="ww-cost-tabs" role="tablist" aria-label="War cost">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} data-testid={`outputs-tab-${t.id}`}>{t.label}</button>
        ))}
      </div>
      <div className="ww-cost-sides">
        <div><span className="ww-chip blue">Your side</span><span className="ww-cost-names">{sides(view.mine)}</span></div>
        <div><span className="ww-chip red">Enemy</span><span className="ww-cost-names">{sides(view.enemies)}</span></div>
        <span className="ww-mono ww-cost-day">Day {Math.round(view.day)}</span>
      </div>
      {tab === 'cost' && <HumanCost view={view} name={name} />}
      {tab === 'race' && <Race view={view} />}
      {tab === 'lifelines' && <Lifelines view={view} name={name} />}
    </div>
  );
}

function Versus({ label, mine, enemy, note }: { label: string; mine: number; enemy: number; note?: string }) {
  const total = mine + enemy;
  return (
    <div className="ww-cost-vs" data-testid="outputs-row">
      <div className="ww-cost-vs-head">
        <span className="ww-label">{label}</span>
        {note && <span className="ww-cost-note">{note}</span>}
      </div>
      <div className="ww-cost-vs-nums">
        <span className="ww-mono blue">{num(mine)}</span>
        <span className="ww-cost-split" aria-hidden="true">
          <i className="blue" style={{ width: total ? `${(mine / total) * 100}%` : '50%' }} />
          <i className="red" style={{ width: total ? `${(enemy / total) * 100}%` : '50%' }} />
        </span>
        <span className="ww-mono red">{num(enemy)}</span>
      </div>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="ww-cost-meter">
      <span className="ww-label">{label}</span>
      <span className={`ww-bar ${levelTone(value)}`}><i style={{ width: pct(Math.max(0, Math.min(1, value))) }} /></span>
      <span className="ww-mono">{pct(value)}</span>
    </div>
  );
}

function HumanCost({ view, name }: { view: OutputsView; name(n: NationId): string }) {
  const h = (f: (x: NationOutputsView['humanitarian']) => number) => [sum(view, view.mine, (n) => f(n.humanitarian)), sum(view, view.enemies, (n) => f(n.humanitarian))] as const;
  const rows: [string, readonly [number, number], string?][] = [
    ['Military killed and wounded', h((x) => x.militaryCasualties), 'battle reports'],
    ['Civilians killed', h((x) => x.civiliansKilled)],
    ['Civilians injured', h((x) => x.civiliansInjured)],
    ['Displaced at home', h((x) => x.idps)],
    ['Refugees abroad', h((x) => x.refugees)],
    ['Living under occupation', h((x) => x.underOccupation)],
  ];
  const you = view.nations[view.mine[0]]?.humanitarian;
  return (
    <>
      <section className="ww-cost-section">
        {rows.map(([label, [m, e], note]) => <Versus key={label} label={label} mine={m} enemy={e} note={note} />)}
      </section>
      {you && (
        <section className="ww-cost-section">
          <h4 className="ww-label">Home front, {name(view.mine[0])}</h4>
          <Meter label="Infrastructure" value={you.infrastructure} />
          <Meter label="Power grid" value={you.power} />
          {you.needs && (
            <>
              <Meter label="Food" value={you.needs.food} />
              <Meter label="Energy" value={you.needs.energy} />
              <Meter label="Fuel" value={you.needs.fuel} />
            </>
          )}
        </section>
      )}
      {view.hosts.length > 0 && (
        <section className="ww-cost-section">
          <h4 className="ww-label">Where the refugees went</h4>
          <ul className="ww-cost-hosts">
            {view.hosts.map((x) => <li key={x.nation}><span>{name(x.nation)}</span><span className="ww-mono">{num(x.refugees)}</span></li>)}
          </ul>
        </section>
      )}
      <p className="ww-cost-source">Casualties count killed and wounded, as UK Defence Intelligence does. Civilian tolls compare with UN OHCHR verified counts, displacement with UNHCR and IOM. Enemy losses are what battle reports and public counts give your staff.</p>
    </>
  );
}

function Race({ view }: { view: OutputsView }) {
  const items = new Map<RaceItem, { mine: RaceView[]; enemy: RaceView[] }>();
  const collect = (side: readonly NationId[], key: 'mine' | 'enemy') => {
    for (const id of side)
      for (const r of view.nations[id]?.race ?? []) {
        const e = items.get(r.item) ?? items.set(r.item, { mine: [], enemy: [] }).get(r.item)!;
        e[key].push(r);
      }
  };
  collect(view.mine, 'mine');
  collect(view.enemies, 'enemy');
  const you = view.nations[view.mine[0]]?.race ?? [];
  const order: RaceItem[] = ['shells', 'ammo', 'interceptors', 'drones', 'cruise', 'ballistic'];
  const shown = order.filter((i) => items.has(i));
  if (!shown.length) return <p className="ww-cost-empty">No side is making or spending munitions yet.</p>;
  return (
    <section className="ww-cost-section">
      {shown.map((item) => <RaceCard key={item} item={item} {...items.get(item)!} you={you.find((r) => r.item === item)} day={view.day} />)}
      <p className="ww-cost-source">Rates are the last month's, per 30 days. Enemy output is an industrial assessment (CSIS, IISS, national intelligence estimates); its stocks are not observed. Shells fired are counter-battery tallies.</p>
    </section>
  );
}

function RaceCard({ item, mine, enemy, you, day }: { item: RaceItem; mine: RaceView[]; enemy: RaceView[]; you?: RaceView; day: number }) {
  const supply = (rs: RaceView[]) => rs.reduce((a, r) => a + r.producedPerMonth + Math.max(0, r.aidPerMonth), 0);
  const made = (rs: RaceView[]) => rs.reduce((a, r) => a + r.producedPerMonth, 0);
  const aid = (rs: RaceView[]) => rs.reduce((a, r) => a + Math.max(0, r.aidPerMonth), 0);
  const ours = supply(mine), theirs = supply(enemy);
  const max = Math.max(ours, theirs, 1);
  const ratio = ours && theirs ? ours / theirs : null;
  const verdict = !enemy.length || ratio === null ? null : ratio >= 1.1 ? { tone: 'green', text: `You out-supply them ${ratio.toFixed(1)}x` } : ratio <= 0.9 ? { tone: 'red', text: `Out-supplied ${(1 / ratio).toFixed(1)}x` } : { tone: 'gold', text: 'Even' };
  const unit = item === 'ammo' ? ' t' : '';
  const firedEnemy = item === 'shells' ? enemy.reduce((a, r) => a + (r.usedPerMonth ?? 0), 0) : null;
  const usedMine = mine.reduce((a, r) => a + (r.usedPerMonth ?? 0), 0);
  return (
    <article className="ww-cost-race ww-corners" data-testid={`race-${item}`}>
      <header>
        <span className="ww-title">{ITEM_LABEL[item]}</span>
        {verdict && <span className={`ww-chip ${verdict.tone}`}>{verdict.text}</span>}
      </header>
      <div className="ww-cost-race-row">
        <span className="ww-label">You</span>
        <span className="ww-bar"><i style={{ width: pct(ours / max) }} /></span>
        <span className="ww-mono">{num(ours)}{unit}<small>/mo</small></span>
      </div>
      <div className="ww-cost-race-sub">made {num(made(mine))}{unit}{aid(mine) ? ` + aid ${num(aid(mine))}${unit}` : ''} · {item === 'shells' ? 'fired' : 'used'} {num(usedMine)}{unit}</div>
      {enemy.length > 0 && (
        <>
          <div className="ww-cost-race-row">
            <span className="ww-label">Enemy</span>
            <span className="ww-bar red"><i style={{ width: pct(theirs / max) }} /></span>
            <span className="ww-mono">{num(theirs)}{unit}<small>/mo</small></span>
          </div>
          <div className="ww-cost-race-sub">assessed: made {num(made(enemy))}{unit}{aid(enemy) ? ` + aid ${num(aid(enemy))}${unit}` : ''}{firedEnemy !== null ? ` · fired ${num(firedEnemy)}` : ''}</div>
        </>
      )}
      {you && you.stock !== null && <Runway r={you} day={day} unit={unit} />}
    </article>
  );
}

function Runway({ r, day, unit }: { r: RaceView; day: number; unit: string }) {
  if (r.ranOutDay !== null && (r.stock ?? 0) < 1) {
    return <div className="ww-cost-runway out" data-testid="runway"><span className="ww-chip red">Ran out day {Math.round(r.ranOutDay)}</span><span className="ww-muted">Nothing left in depots or magazines.</span></div>;
  }
  const left = r.zeroDay === null ? null : r.zeroDay - day;
  const tone = left === null ? 'green' : left < 30 ? 'red' : left < 90 ? 'gold' : 'green';
  return (
    <div className={`ww-cost-runway ${tone}`} data-testid="runway">
      <span className="ww-label">Stock</span>
      <span className="ww-mono">{num(r.stock ?? 0)}{unit}</span>
      <span className={`ww-bar ${tone}`}><i style={{ width: pct(left === null ? 1 : Math.min(1, left / RUNWAY_DAYS)) }} /></span>
      <span className={`ww-cost-left ${tone}`}>{left === null ? 'Holding' : `Empty in ${Math.max(0, Math.round(left))} days`}</span>
    </div>
  );
}

const STATUS_TONE: Record<Workaround['status'], string> = { holding: 'green', strained: 'gold', failing: 'red' };

function Lifelines({ view, name }: { view: OutputsView; name(n: NationId): string }) {
  const rows = [...view.mine.map((id) => [id, 'blue'] as const), ...view.enemies.map((id) => [id, 'red'] as const)].filter(([id]) => view.nations[id]?.workarounds.length);
  if (!rows.length) return <p className="ww-cost-empty">Neither side depends on a workaround yet: no sanctions or blockade bite, and no arms pipeline feeds the war.</p>;
  return (
    <section className="ww-cost-section">
      {rows.map(([id, tone]) => (
        <div key={id} className="ww-cost-life-nation">
          <h4><span className={`ww-cost-dot ${tone}`} />{name(id)}</h4>
          {view.nations[id].workarounds.map((w) => (
            <div key={w.id} className="ww-cost-life" data-testid={`workaround-${w.id}`}>
              <div className="ww-cost-life-head">
                <span className="ww-title">{WORKAROUND_LABEL[w.id].name}</span>
                <span className={`ww-chip ${STATUS_TONE[w.status]}`}>{w.status}</span>
              </div>
              <span className={`ww-bar ${STATUS_TONE[w.status]}`}><i style={{ width: pct(w.level) }} /></span>
              <p>{WORKAROUND_LABEL[w.id].what}. {w.detail}.</p>
            </div>
          ))}
        </div>
      ))}
      <p className="ww-cost-source">Sanctions evasion and shadow-fleet levels follow open-source tracking (KSE Institute, Bank of Russia balance of payments, Conflict Armament Research). Arms pipelines are rated against 2024-25 delivery rates.</p>
    </section>
  );
}
