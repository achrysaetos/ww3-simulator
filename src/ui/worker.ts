/// <reference lib="webworker" />
import type { FormationId, NationId } from '../core/types';
import { loadMap } from '../data/load';
import { profiles } from '../data/nations';
import { createSession, SCENARIOS, type Session } from '../scenarios';
import { Pacer } from './pacer';
import { nationCards, sessionMeta, SnapshotEncoder, type FromWorker, type ScenarioCard, type ToWorker } from './snapshot';

let session: Session | null = null;
let encoder: SnapshotEncoder | null = null;
let focus: { nation?: NationId; formation?: FormationId } = {};

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

const pacer = new Pacer(() => {
  if (!session || !encoder) return;
  encoder.collect(session.engine.step(session.world));
  send();
});

function send() {
  if (!session || !encoder) return;
  pacer.sent();
  post({ type: 'snapshot', snapshot: encoder.encode(session.world, session.engine.map, focus), stats: { stepMs: pacer.stepMs, achievedTps: pacer.achievedTps } });
}

const cards: ScenarioCard[] = SCENARIOS.map((s) => {
  const belligerents = new Set<NationId>();
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.nation);
  for (const m of s.opening) if (m.type === 'declare_war') belligerents.add(m.target);
  const wars = s.opening.flatMap((m): [NationId, NationId][] => (m.type === 'declare_war' ? [[m.nation, m.target]] : []));
  return { id: s.id, name: s.name, summary: s.summary, startDate: s.startDate, suggestedNation: s.suggestedNation as NationId, belligerents: [...belligerents], wars };
});
post({ type: 'hello', scenarios: cards, nations: nationCards(loadMap(), profiles) });

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'start': {
        session = createSession(msg.scenario, msg.seed);
        const { world, engine, scenario } = session;
        for (const n of Object.values(world.nations)) n.controlledBy = n.id === msg.nation ? 'human' : 'ai';
        encoder = new SnapshotEncoder(engine.map.nationIds, engine.catalog, engine.map.size);
        focus = { nation: msg.nation };
        pacer.sent();
        post({ type: 'ready', meta: sessionMeta(cards.find((c) => c.id === scenario.id)!, world, engine.map, engine.catalog), snapshot: encoder.encode(world, engine.map, focus) });
        return;
      }
      case 'ack':
        pacer.ack();
        return;
      case 'speed':
        pacer.setSpeed(msg.ticksPerSec);
        return;
      case 'step':
        pacer.step();
        return;
      case 'command':
        session?.world.pending.push(msg.command);
        return;
      case 'play_as':
        if (!session) return;
        for (const n of Object.values(session.world.nations)) n.controlledBy = n.id === msg.nation ? 'human' : 'ai';
        send();
        return;
      case 'focus':
        focus = { nation: msg.nation, formation: msg.formation };
        send();
        return;
    }
  } catch (e) {
    pacer.stop();
    post({ type: 'error', message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
  }
};
