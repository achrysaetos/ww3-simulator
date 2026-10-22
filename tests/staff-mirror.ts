import type { Command, FormationId, NationId } from '../src/core/types';
import { loadMap } from '../src/data/load';
import { profiles } from '../src/data/nations';
import { PlaceNamer, type Namer } from '../src/ui/events';
import { SimHost } from '../src/ui/host';
import { applySnapshot, emptyClientState, nationCards, type FromWorker, type SessionMeta } from '../src/ui/snapshot';
import { StaffDesk } from '../src/ui/staff/desk';
import type { RoleId } from '../src/ui/staff/roles';

const map = loadMap();
const places = new PlaceNamer(map);
const cards = new Map(nationCards(map, profiles).map((c) => [c.id, c]));

/**
 * A real scenario driven through the worker host, mirrored the way the page's SimClient mirrors
 * it, with the player's staff desk fed from every snapshot.
 */
export function playWithStaff(scenario: string, nation: string, seed = 1, role?: RoleId) {
  const host = new SimHost((m) => receive(m));
  const state = emptyClientState(map.size);
  let meta: SessionMeta | null = null;
  let desk: StaffDesk | null = null;
  const names = new Map<FormationId, string>();
  const namer: Namer = {
    nation: (id) => cards.get(id)?.name ?? id,
    formation: (id) => names.get(id),
    item: (id) => namer.known(id) ?? id.replace(/_/g, ' '),
    known: (id) => meta?.platforms[id]?.name ?? meta?.munitions[id]?.name,
    place: places,
  };
  function receive(m: FromWorker) {
    if (m.type !== 'ready' && m.type !== 'snapshot') return;
    if (m.type === 'ready') {
      meta = m.meta;
      desk = new StaffDesk(map, m.meta, m.playing, namer);
    }
    applySnapshot(state, m.snapshot, meta!.nationIds, cards);
    for (const f of state.formations) names.set(f.entry.id, f.entry.name);
    desk!.observe(state, m.snapshot.events, state.focusNation);
  }
  host.handle({ type: 'start', scenario, nation: nation as NationId, seed, role });
  return {
    host,
    state,
    get desk() { return desk!; },
    get world() { return host.world!; },
    namer,
    send: (command: Command) => host.handle({ type: 'command', command }),
    step: (n = 1) => {
      for (let i = 0; i < n; i++) {
        host.handle({ type: 'ack' });
        host.handle({ type: 'step' });
      }
    },
    quit: () => host.handle({ type: 'quit' }),
  };
}
