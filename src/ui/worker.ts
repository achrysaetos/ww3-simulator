/// <reference lib="webworker" />
import type { FormationId, NationId } from '../core/types';
import { createSession, type Session } from './session';
import { SnapshotEncoder, sessionMeta, type FromWorker, type ToWorker } from './snapshot';

let session: Session | null = null;
let encoder: SnapshotEncoder | null = null;
let focus: { nation?: NationId; formation?: FormationId } = {};

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function snapshot(stepMs?: number) {
  if (!session || !encoder) return;
  post({ type: 'snapshot', snapshot: encoder.encode(session.world, session.engine.map, focus), stepMs });
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init': {
        session = createSession(msg.scenario);
        const { world, engine } = session;
        encoder = new SnapshotEncoder(engine.map.nationIds);
        post({ type: 'ready', meta: sessionMeta(msg.scenario, world, engine.map, engine.catalog), snapshot: encoder.encode(world, engine.map, focus) });
        return;
      }
      case 'step': {
        if (!session || !encoder) return;
        const t0 = performance.now();
        for (let i = 0; i < msg.n; i++) encoder.collect(session.engine.step(session.world));
        snapshot((performance.now() - t0) / Math.max(1, msg.n));
        return;
      }
      case 'command':
        session?.world.pending.push(msg.command);
        return;
      case 'play_as': {
        if (!session) return;
        for (const n of Object.values(session.world.nations)) n.controlledBy = n.id === msg.nation ? 'human' : 'ai';
        snapshot();
        return;
      }
      case 'focus':
        focus = { nation: msg.nation, formation: msg.formation };
        snapshot();
        return;
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
  }
};
