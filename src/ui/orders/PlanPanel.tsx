import { paramDef } from '../../core/params';
import type { FormationKind, Operation } from '../../core/types';
import type { OperationForecast } from '../../forecast/operation';
import type { FormationView } from '../snapshot';
import { UnitGlyph } from './UnitGlyph';
import type { Planning } from './plan';

const pct = (p: number) => `${Math.round(p * 100)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const hours = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);

/** The first day on which at least half the runs hold the objective, or null. */
const likelyDay = (f: OperationForecast) => {
  const i = f.pObjectiveByDay.findIndex((p) => p >= 0.5);
  return i < 0 ? null : i + 1;
};

/** The staff's forecast in numbers: odds by day as a chart, the spread of losses and ground, what it hinges on, and how old its picture of the enemy is. */
export function ForecastView({ forecast: f, objective, dayOf }: { forecast: OperationForecast; objective: string; dayOf(d: number): string }) {
  const end = f.pObjectiveByDay[f.days - 1] ?? 0;
  const likely = likelyDay(f);
  const drivers = f.drivers.map((d) => ({ ...d, what: paramDef(d.param)?.affects ?? d.param }));
  return (
    <div className="ww-forecast" data-testid="forecast">
      <div className="ww-forecast-head">
        <span className={`ww-forecast-odds ww-mono ${end >= 0.5 ? 'good' : end >= 0.25 ? 'warn' : 'bad'}`} data-testid="forecast-odds">{pct(end)}</span>
        <span className="ww-forecast-of">chance to take {objective} by {dayOf(f.days)}</span>
      </div>
      <div className="ww-forecast-chart" role="img" aria-label={`Odds of holding ${objective} by day: ${f.pObjectiveByDay.map(pct).join(', ')}`}>
        {f.pObjectiveByDay.map((p, i) => (
          <span key={i} className="ww-forecast-bar" data-day={i + 1} title={`${dayOf(i + 1)}: ${pct(p)}`}>
            <i style={{ height: `${Math.max(3, p * 100)}%` }} className={likely === i + 1 ? 'first' : ''} />
          </span>
        ))}
      </div>
      <ul className="ww-forecast-lines">
        <li><i className="dot blue" />{likely ? <>{objective} likely by <b className="ww-mono">{dayOf(likely)}</b></> : <>{objective} not taken in most runs within {f.days} days</>}</li>
        <li data-testid="forecast-losses"><i className="dot gold" />Losses <b className="ww-mono">{n0(f.losses.p10)}–{n0(f.losses.p90)}</b> platforms, likely <b className="ww-mono">{n0(f.losses.p50)}</b>; about <b className="ww-mono">{n0(f.casualties.p50)}</b> casualties</li>
        <li><i className="dot gold" />Ground <b className="ww-mono">{f.advance.p50.toFixed(1)}</b> of {Math.max(0, f.axis.length - 1)} cells on the axis (p10 {f.advance.p10.toFixed(1)}, p90 {f.advance.p90.toFixed(1)})</li>
        {drivers.length > 0 && <li><i className="dot muted" />Hinges on {drivers.map((d, i) => <span key={d.param}>{i ? ', ' : ''}<span title={`${d.param} (${d.tag}), r = ${d.r.toFixed(2)} with ${d.metric}`}>{d.what}</span></span>)}</li>}
        <li data-testid="forecast-intel"><i className="dot muted" />{f.intelAgeHours ? <>Intel <b className="ww-mono">{hours(f.intelAgeHours.min) === hours(f.intelAgeHours.max) ? hours(f.intelAgeHours.max) : `${hours(f.intelAgeHours.min)}–${hours(f.intelAgeHours.max)}`}</b> old</> : 'No fix on the enemy here'} · {f.enemyContacts} enemy {f.enemyContacts === 1 ? 'contact' : 'contacts'} known</li>
        {f.beyondWarAims && <li className="ww-forecast-warn" data-testid="forecast-aims"><i className="dot red" />Past the war aims: {f.beyondWarAims.why}. Launching it makes the war total.</li>}
      </ul>
      <p className="ww-forecast-foot">{f.runs} war-games from your intelligence picture, not the truth. Forces you have not found are not in it.</p>
    </div>
  );
}

interface PanelProps {
  planning: Planning;
  /** The operation it adjusts, when it adjusts one. */
  op: Operation | undefined;
  units: readonly FormationView[];
  from: string;
  objective: string | null;
  via: readonly string[];
  dayOf(d: number): string;
  onLaunch(): void;
  onSave(): void;
  onRedraw(): void;
  onCancelOperation(): void;
  onClose(): void;
  onRemove(id: FormationView['entry']['id']): void;
}

const PHASE_LABEL: Record<Operation['phase'], string> = { draft: 'Draft', launched: 'Under way', stalled: 'Stalled', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' };
const KIND_SHOWN = 5;

/** The battle plan at the foot of the map (redesign main.png): the plan, the staff's forecast, and Launch. */
export function PlanPanel({ planning, op, units, from, objective, via, dayOf, onLaunch, onSave, onRedraw, onCancelOperation, onClose, onRemove }: PanelProps) {
  const { draft, forecast, stage } = planning;
  const running = op && (op.phase === 'launched' || op.phase === 'stalled');
  const ready = draft.objective !== null && draft.formations.length > 0;
  const status = op ? PHASE_LABEL[op.phase] : 'Draft';
  const odds = forecast.status === 'done' ? forecast.forecast.pObjectiveByDay[forecast.forecast.days - 1] ?? 0 : null;
  const strength = units.length ? units.reduce((t, u) => t + u.strength, 0) / units.length : 0;
  return (
    <section className="ww-glass ww-corners ww-plan" aria-label="Battle plan" data-testid="plan-panel">
      <div className="ww-plan-col ww-plan-what">
        <span className="ww-label">Battle plan · <span className={running ? 'ww-blue' : 'ww-gold'}>{status}</span></span>
        <span className="ww-title ww-plan-name" data-testid="plan-name">{draft.name ?? 'New operation'}</span>
        <p className="ww-plan-route">
          {objective ? <>{from} → {via.length ? `${via.join(' → ')} → ` : ''}<b>{objective}</b></> : <>From {from}. Click the objective on the map.</>}
        </p>
        {op?.progress.note && <p className={`ww-plan-note ${op.phase === 'stalled' ? 'red' : ''}`} data-testid="plan-note">{op.progress.note}</p>}
        {units.length > 0 && (
          <div className="ww-plan-force" data-testid="plan-force">
            <span className="ww-label">Force</span>
            <span className="ww-mono">{units.length} {units.length === 1 ? 'formation' : 'formations'} · {pct(strength)} strength</span>
            <span className="ww-bar"><i style={{ width: pct(strength) }} /></span>
            <ul>{units.slice(0, 3).map((u) => <li key={u.entry.id}>{u.entry.name}</li>)}{units.length > 3 && <li className="ww-muted">and {units.length - 3} more</li>}</ul>
          </div>
        )}
        <div className="ww-plan-units" data-testid="plan-units">
          {units.slice(0, KIND_SHOWN).map((u) => (
            <button key={u.entry.id} type="button" className="ww-plan-unit" title={`${u.entry.name}. Click to take it out of the plan.`} onClick={() => onRemove(u.entry.id)} disabled={!!running}>
              <UnitGlyph kind={u.entry.kind as FormationKind} />
              <span className="ww-mono">{u.entry.name.match(/\d+/)?.[0] ?? u.entry.name.slice(0, 3)}</span>
            </button>
          ))}
          {units.length > KIND_SHOWN && <span className="ww-plan-more ww-mono">+{units.length - KIND_SHOWN}</span>}
          {!running && <span className="ww-plan-hint">Click your units on the map to add or drop them</span>}
        </div>
      </div>
      <div className="ww-plan-col ww-plan-staff">
        <span className="ww-label">Staff forecast</span>
        {forecast.status === 'done' && objective ? <ForecastView forecast={forecast.forecast} objective={objective} dayOf={dayOf} />
          : forecast.status === 'running' ? (
            <div className="ww-forecast-wait" data-testid="forecast-running">
              <p>War-gaming the plan from your intelligence picture…</p>
              <span className="ww-bar gold"><i style={{ width: `${forecast.total ? (100 * forecast.done) / forecast.total : 0}%` }} /></span>
              <span className="ww-mono ww-muted">{forecast.done} of {forecast.total} runs</span>
            </div>
          ) : forecast.status === 'failed' ? <p className="ww-forecast-warn" data-testid="forecast-failed">The staff cannot forecast this plan: {forecast.reason}</p>
            : <p className="ww-muted">{stage === 'drawing' ? 'Draw the axis: click the objective. Shift-click a cell first to route through it.' : 'Give the plan a force and an objective.'}</p>}
      </div>
      <div className="ww-plan-col ww-plan-act">
        {running ? (
          <>
            <button type="button" className="ww-btn" onClick={onRedraw} data-testid="plan-adjust">Adjust <span className="ww-kbd">R</span></button>
            <button type="button" className="ww-btn ghost" onClick={onCancelOperation} data-testid="plan-cancel-op">Call it off</button>
          </>
        ) : (
          <>
            <button type="button" className={`ww-btn ${odds !== null && odds < 0.25 ? 'ww-plan-risky' : 'gold'} ww-plan-launch`} disabled={!ready} onClick={onLaunch} data-testid="plan-launch">Launch <span className="ww-kbd" aria-label="Enter">↵</span></button>
            {odds !== null && odds < 0.25 && <p className="ww-plan-advice" data-testid="plan-advice">Staff advise against: {pct(odds)} odds in {forecast.status === 'done' ? forecast.forecast.days : 0} days. Add force or pick a nearer objective.</p>}
            <button type="button" className="ww-btn" onClick={onRedraw} data-testid="plan-adjust">Redraw <span className="ww-kbd">R</span></button>
            {!op && <button type="button" className="ww-btn ghost" disabled={!ready} onClick={onSave} data-testid="plan-save">Save draft</button>}
            {op?.phase === 'draft' && <button type="button" className="ww-btn ghost" onClick={onCancelOperation} data-testid="plan-cancel-op">Scrap it</button>}
          </>
        )}
        <button type="button" className="ww-link" onClick={onClose} data-testid="plan-close">Close <span className="ww-kbd">Esc</span></button>
        <p className="ww-plan-fine">Your staff runs it. Take any brigade yourself at any time.</p>
      </div>
    </section>
  );
}
