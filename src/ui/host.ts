import type { Command, CommandResult, FormationId, NationId, NodeId, SimEvent, World } from '../core/types';
import { loadMap } from '../data/load';
import { profiles } from '../data/nations';
import { createSession, SCENARIOS } from '../scenarios';
import { resumeRun, saveRun, type ResumedSession } from '../scenarios/save';
import { authority, isOperationCommand } from '../systems/orders';
import { checkCommand } from './commands';
import { COMMAND_LABEL } from './events';
import { forecastInput } from '../forecast/operation';
import { priorityEffect } from '../systems/logistics';
import { beliefOf, buildKit, buffersOf, type Belief } from './drag/kit';
import { delegateCommands, roleById } from './staff/roles';
import { nationCards, sessionMeta, SnapshotEncoder, type FromWorker, type ScenarioCard, type ToWorker } from './snapshot';

export const SCENARIO_CARDS: ScenarioCard[] = SCENARIOS.map((s) => {
  const belligerents = new Set<NationId>();
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.nation);
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.target);
  const wars = s.opening.flatMap((m): [NationId, NationId][] => (m.type === 'declare_war' ? [[m.nation, m.target]] : []));
  const ongoing = wars.filter(([a, b]) => s.mobilized?.[a] !== undefined && s.mobilized?.[b] !== undefined).map(([a, b]) => `${a}>${b}`);
  return { id: s.id, name: s.name, summary: s.summary, startDate: s.startDate, suggestedNation: s.suggestedNation as NationId, belligerents: [...belligerents], wars, ongoing };
});

/** Most formations one drag carries. */
const MAX_DRAG = 24;
/** Longest forecast the staff runs: two weeks covers an operation's first bounds (A2b's checks use 7 days). */
export const MAX_FORECAST_DAYS = 14;

const setPlayer = (world: World, nation: NationId) => {
  for (const n of Object.values(world.nations)) n.controlledBy = n.id === nation ? 'human' : 'ai';
};

/**
 * The simulation side of the worker: owns the running World, steps it when the page's clock
 * asks, and treats every message from the page as untrusted input. The player commands one
 * nation, chosen at start or by the save, for the whole session.
 */
export class SimHost {
  private session: ResumedSession | null = null;
  private encoder: SnapshotEncoder | null = null;
  private player: NationId | null = null;
  private focus: { nation?: NationId; formation?: FormationId } = {};
  /** The player's believed world as of one tick: every press in that tick aims from it, and the kit's field is cached on it. */
  private belief: { tick: number; world: Belief } | null = null;

  constructor(private readonly post: (m: FromWorker, transfer?: Transferable[]) => void) {
    post({ type: 'hello', scenarios: SCENARIO_CARDS, nations: nationCards(loadMap(), profiles) });
  }

  get world(): World | null {
    return this.session?.world ?? null;
  }

  handle(msg: ToWorker): void {
    try {
      this.dispatch(msg);
    } catch (e) {
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
        return this.open(session, human, true);
      }
      case 'save':
        if (!this.session) return;
        this.post({ type: 'saved', text: saveRun(this.session.scenario.id, this.session.world), scenario: this.session.scenario.id, tick: this.session.world.tick });
        return;
      case 'quit':
        this.session = null;
        this.encoder = null;
        this.player = null;
        this.post({ type: 'closed' });
        return;
      case 'step':
        return this.step();
      case 'command':
        return this.command(msg.command);
      case 'focus':
        this.focus = { nation: msg.nation, formation: msg.formation };
        this.send();
        return;
      case 'drag_kit':
        return this.dragKit(msg.seq, msg.formations);
      case 'forecast':
        return this.forecast(msg.seq, msg.plan, msg.days);
      case 'supply_effect':
        return this.supplyEffect(msg.seq, msg.node);
    }
  }

  /** The kit for a drag of the player's own active formations, built from what the player believes and transferred, not copied. */
  private dragKit(seq: unknown, raw: unknown): void {
    const { session, player } = this;
    if (!session || !player || typeof seq !== 'number') return;
    const { world } = session;
    const own = (Array.isArray(raw) ? raw : [])
      .filter((id): id is FormationId => typeof id === 'string' && Object.hasOwn(world.formations, id) && world.formations[id as FormationId].nation === player && world.formations[id as FormationId].status === 'active')
      .slice(0, MAX_DRAG);
    if (!own.length) {
      this.post({ type: 'drag_kit', seq, kit: null, reason: 'none of those formations is yours to order' });
      return;
    }
    if (this.belief?.tick !== world.tick) this.belief = { tick: world.tick, world: beliefOf(world, session.map, player, session.catalog) };
    const kit = buildKit(this.belief.world, session.engine, player, own);
    this.post({ type: 'drag_kit', seq, kit, ...(kit ? {} : { reason: 'nothing there can be dragged' }) }, kit ? buffersOf(kit) : []);
  }

  /** What a supply priority at `raw` would move for the player's own forces; null for a cell the player does not hold. */
  private supplyEffect(seq: unknown, raw: unknown): void {
    const { session, player } = this;
    if (!session || !player || typeof seq !== 'number') return;
    const ok = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < session.map.landCount && session.world.control[raw] === player;
    this.post({ type: 'supply_effect', seq, effect: ok ? priorityEffect(session.world, session.map, player, raw as NodeId) : null });
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

  /** One tick, when the page's clock asks for it: the page holds one request at a time, so nothing queues. */
  private step(): void {
    const { session, encoder } = this;
    if (!session || !encoder) return;
    encoder.collect(session.engine.step(session.world).filter((e) => this.forPlayer(e)), session.world, session.engine.map);
    this.send();
  }

  private open(session: ResumedSession, nation: NationId, resumed = false): void {
    this.session = session;
    this.player = nation;
    this.belief = null;
    const { world, engine, scenario } = session;
    this.encoder = new SnapshotEncoder(engine.map.nationIds, engine.catalog, engine.map.size);
    this.focus = { nation };
    const card = SCENARIO_CARDS.find((c) => c.id === scenario.id)!;
    const history = resumed ? this.encoder.resumed(world, engine.map) : [];
    const snapshot = this.encoder.encode(world, engine.map, this.focus);
    if (history.length) snapshot.history = history;
    this.post({ type: 'ready', meta: sessionMeta(card, world, engine.map, engine.catalog), playing: nation, snapshot });
  }

  private send(): void {
    const { session, encoder } = this;
    if (!session || !encoder) return;
    this.post({ type: 'snapshot', snapshot: encoder.encode(session.world, session.engine.map, this.focus) });
  }
}
