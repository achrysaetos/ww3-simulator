import type { FormationId, NationId, World } from '../core/types';
import { loadMap } from '../data/load';
import { profiles } from '../data/nations';
import { createSession, SCENARIOS } from '../scenarios';
import { resumeRun, saveRun, type ResumedSession } from '../scenarios/save';
import { checkCommand } from './commands';
import { Pacer } from './pacer';
import { nationCards, sessionMeta, SnapshotEncoder, type FromWorker, type ScenarioCard, type ToWorker } from './snapshot';

export const SCENARIO_CARDS: ScenarioCard[] = SCENARIOS.map((s) => {
  const belligerents = new Set<NationId>();
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.nation);
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.target);
  const wars = s.opening.flatMap((m): [NationId, NationId][] => (m.type === 'declare_war' ? [[m.nation, m.target]] : []));
  return { id: s.id, name: s.name, summary: s.summary, startDate: s.startDate, suggestedNation: s.suggestedNation as NationId, belligerents: [...belligerents], wars };
});

const setPlayer = (world: World, nation: NationId) => {
  for (const n of Object.values(world.nations)) n.controlledBy = n.id === nation ? 'human' : 'ai';
};

/**
 * The simulation side of the worker: owns the running World, paces it against the UI's
 * acks, and treats every message from the page as untrusted input.
 */
export class SimHost {
  private session: ResumedSession | null = null;
  private encoder: SnapshotEncoder | null = null;
  private player: NationId | null = null;
  private focus: { nation?: NationId; formation?: FormationId } = {};
  private readonly pacer = new Pacer(() => {
    if (!this.session || !this.encoder) return;
    this.encoder.collect(this.session.engine.step(this.session.world));
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
        return this.open(session, msg.nation);
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
      case 'command': {
        const { session, player } = this;
        if (!session || !player) return;
        const checked = checkCommand(session.world, session.map, session.catalog, player, msg.command);
        if (checked.ok) session.world.pending.push(checked.command);
        else this.post({ type: 'refused', reason: checked.reason });
        return;
      }
      case 'play_as':
        if (!this.session || !this.session.world.nations[msg.nation]) return;
        setPlayer(this.session.world, msg.nation);
        this.player = msg.nation;
        this.send();
        return;
      case 'focus':
        this.focus = { nation: msg.nation, formation: msg.formation };
        this.send();
        return;
    }
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
