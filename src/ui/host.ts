import type { Command, CommandResult, FormationId, NationId, NodeId, SimEvent, World } from '../core/types';
import { loadMap } from '../data/load';
import { profiles } from '../data/nations';
import { createSession, SCENARIOS } from '../scenarios';
import { resumeRun, saveRun, type ResumedSession } from '../scenarios/save';
import { authority, isOperationCommand } from '../systems/orders';
import { checkCommand } from './commands';
import { COMMAND_LABEL } from './events';
import { Pacer } from './pacer';
import { forecastInput } from '../forecast/operation';
import { orderOptions } from './orders/options';
import { delegateCommands, roleById } from './staff/roles';
import { nationCards, sessionMeta, SnapshotEncoder, type FromWorker, type ScenarioCard, type ToWorker } from './snapshot';

export const SCENARIO_CARDS: ScenarioCard[] = SCENARIOS.map((s) => {
  const belligerents = new Set<NationId>();
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.nation);
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.target);
  const wars = s.opening.flatMap((m): [NationId, NationId][] => (m.type === 'declare_war' ? [[m.nation, m.target]] : []));
  return { id: s.id, name: s.name, summary: s.summary, startDate: s.startDate, suggestedNation: s.suggestedNation as NationId, belligerents: [...belligerents], wars };
});

/** Most formations one radial menu works out orders for. */
const MAX_SELECTION = 24;
/** Longest forecast the staff runs: two weeks covers an operation's first bounds (A2b's checks use 7 days). */
export const MAX_FORECAST_DAYS = 14;

const setPlayer = (world: World, nation: NationId) => {
  for (const n of Object.values(world.nations)) n.controlledBy = n.id === nation ? 'human' : 'ai';
};

/**
 * The simulation side of the worker: owns the running World, paces it against the UI's
 * acks, and treats every message from the page as untrusted input. The player commands one
 * nation, chosen at start or by the save, for the whole session.
 */
export class SimHost {
  private session: ResumedSession | null = null;
  private encoder: SnapshotEncoder | null = null;
  private player: NationId | null = null;
  private focus: { nation?: NationId; formation?: FormationId } = {};
  private readonly pacer = new Pacer(() => {
    if (!this.session || !this.encoder) return;
    this.encoder.collect(this.session.engine.step(this.session.world).filter((e) => this.forPlayer(e)));
    this.send();
  });

  constructor(private readonly post: (m: FromWorker) => void) {
    post({ type: 'hello', scenarios: SCENARIO_CARDS, nations: nationCards(loadMap(), profiles) });
  }

  get world(): World | null {
    return this.session?.world ?? null;
  }

  handle(msg: ToWorker): void {
    try {
      this.dispatch(msg);
    } catch (e) {
      this.pacer.stop();
      this.post({ type: 'error', message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
    }
  }

  private dispatch(msg: ToWorker): void {
    switch (msg.type) {
      case 'start': {
        const session = createSession(msg.scenario, msg.seed);
        setPlayer(session.world, msg.nation);
        this.open(session, msg.nation);
        const role = typeof msg.role === 'string' ? roleById(msg.role) : undefined;
        if (role) for (const c of delegateCommands(msg.nation, authority(session.world, msg.nation).ai, role.ai)) this.command(c);
        return;
      }
      case 'load': {
        let session: ResumedSession;
        try {
          session = resumeRun(msg.text);
        } catch (e) {
          this.post({ type: 'load_failed', message: e instanceof Error ? e.message : String(e) });
          return;
        }
        const human = Object.values(session.world.nations).find((n) => n.controlledBy === 'human')?.id ?? (session.scenario.suggestedNation as NationId);
        setPlayer(session.world, human);
        return this.open(session, human);
      }
      case 'save':
        if (!this.session) return;
        this.post({ type: 'saved', text: saveRun(this.session.scenario.id, this.session.world), scenario: this.session.scenario.id, tick: this.session.world.tick });
        return;
      case 'quit':
        this.pacer.setSpeed(0);
        this.session = null;
        this.encoder = null;
        this.player = null;
        this.post({ type: 'closed' });
        return;
      case 'ack':
        this.pacer.ack();
        return;
      case 'speed':
        if (typeof msg.ticksPerSec === 'number' && Number.isFinite(msg.ticksPerSec)) this.pacer.setSpeed(Math.max(0, Math.min(60, msg.ticksPerSec)));
        return;
      case 'step':
        this.pacer.step();
        return;
      case 'command':
        return this.command(msg.command);
      case 'focus':
        this.focus = { nation: msg.nation, formation: msg.formation };
        this.send();
        return;
      case 'options': {
        const { session, player } = this;
        if (!session || !player || !Number.isInteger(msg.node) || msg.node < 0 || msg.node >= session.map.size || !Array.isArray(msg.formations)) return;
        const own = msg.formations.filter((id): id is FormationId => typeof id === 'string' && session.world.formations[id as FormationId]?.nation === player).slice(0, MAX_SELECTION);
        this.post({ type: 'options', seq: msg.seq, tick: session.world.tick, result: orderOptions(session.world, session.engine, player, own, msg.node as NodeId) });
        return;
      }
      case 'forecast':
        return this.forecast(msg.seq, msg.plan, msg.days);
    }
  }

  /** The plan, checked at the command boundary like any order, cut into the forecast's input from the player's beliefs. */
  private forecast(seq: number, raw: unknown, days: unknown): void {
    const { session, player } = this;
    if (!session || !player) return;
    const checked = checkCommand(session.world, session.map, session.catalog, player, { ...(typeof raw === 'object' && raw ? raw : {}), type: 'plan_operation' });
    if (!checked.ok || checked.command.type !== 'plan_operation') {
      this.post({ type: 'forecast_input', seq, input: null, reason: checked.ok ? 'not a plan' : checked.reason });
      return;
    }
    const { type: _t, launch: _l, hHour: _h, byPlayer: _b, ...plan } = checked.command;
    const span = typeof days === 'number' && Number.isInteger(days) ? Math.max(1, Math.min(MAX_FORECAST_DAYS, days)) : MAX_FORECAST_DAYS;
    this.post({ type: 'forecast_input', seq, input: forecastInput(session.world, session.map, session.catalog, plan, span) });
  }

  /** Queue the player's command, or answer at once with the boundary's refusal. */
  private command(raw: unknown): void {
    const { session, player, encoder } = this;
    if (!session || !player || !encoder) return;
    const { world } = session;
    const checked = checkCommand(world, session.map, session.catalog, player, raw);
    if (checked.ok) {
      const c = checked.command;
      world.pending.push(c.type === 'order' || isOperationCommand(c) ? { ...c, byPlayer: true } : c);
      return;
    }
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    if (typeof r.type !== 'string' || !Object.hasOwn(COMMAND_LABEL, r.type)) {
      this.post({ type: 'refused', reason: checked.reason });
      return;
    }
    const formation = typeof r.formation === 'string' && world.formations[r.formation as FormationId] ? (r.formation as FormationId) : undefined;
    const foreign = r.nation !== player || (formation !== undefined && world.formations[formation].nation !== player);
    const result: CommandResult = {
      type: 'command_result', tick: world.tick, nation: player, command: r.type as Command['type'], ...(formation ? { formation } : {}), byPlayer: true,
      ok: false, code: foreign ? 'not_yours' : 'invalid', reason: checked.reason,
    };
    encoder.collect([result]);
    this.send();
  }

  /** The UI hears answers to the player's own commands only, not to the AI's. */
  private forPlayer(e: SimEvent): boolean {
    return e.type !== 'command_result' || (e.nation === this.player && !!e.byPlayer);
  }

  private open(session: ResumedSession, nation: NationId): void {
    this.pacer.setSpeed(0);
    this.session = session;
    this.player = nation;
    const { world, engine, scenario } = session;
    this.encoder = new SnapshotEncoder(engine.map.nationIds, engine.catalog, engine.map.size);
    this.focus = { nation };
    this.pacer.sent();
    const card = SCENARIO_CARDS.find((c) => c.id === scenario.id)!;
    this.post({ type: 'ready', meta: sessionMeta(card, world, engine.map, engine.catalog), playing: nation, snapshot: this.encoder.encode(world, engine.map, this.focus) });
  }

  private send(): void {
    const { session, encoder } = this;
    if (!session || !encoder) return;
    this.pacer.sent();
    this.post({ type: 'snapshot', snapshot: encoder.encode(session.world, session.engine.map, this.focus), stats: { stepMs: this.pacer.stepMs, achievedTps: this.pacer.achievedTps } });
  }
}
