import { beforeAll, describe, expect, it } from 'vitest';
import type { FormationId, NodeId, World } from '../src/core/types';
import { scale } from '../src/forecast/calibrate-quick';
import { resumeRun, saveRun } from '../src/scenarios/save';
import { estimate } from '../src/systems/intel';
import { pillText } from '../src/ui/drag/estimate';
import { aim } from '../src/ui/drag/gesture';
import { SUBJECT_OF_KIND } from '../src/ui/drag/kit';
import { controlOf, donbas, kitOf, russia, RUS, UKR, type Session } from './drag.fixture';

let s: Session;
let saved: string;
let force: FormationId[];
/** Cells the stack is aimed at: enemy ground next to it, its own cell, and the cells behind. */
let aims: NodeId[];

beforeAll(() => {
  s = russia();
  saved = saveRun('ukraine-2026', s.world);
  const fires = Object.values(s.world.formations).find((f) => f.nation === RUS && f.status === 'active' && SUBJECT_OF_KIND[f.kind] === 'fires')!;
  force = [...donbas(s), fires.id];
  const home = s.world.formations[force[0]].node;
  aims = [home, ...s.map.neighbors(home)];
}, 120_000);

/** Every byte of the kit: typed arrays as their raw bytes, the rest as JSON (V8's serializer would also record how the engine happens to store each number). */
const bytesOf = (kit: object) =>
  JSON.stringify(kit, (_k, v) => (ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') : v));

/** The game as saved, changed as if the war had gone that way, then the kit and the pill words for every aim. */
function seen(change: (w: World) => void = () => {}) {
  const r = resumeRun(saved);
  change(r.world);
  const kit = kitOf(s, force, r.world);
  const control = controlOf(r.world, s.map);
  return { bytes: bytesOf(kit), pills: aims.map((n) => aim(kit, { node: n, contact: null }, s.map, control).pill), words: aims.map((n) => pillText(aim(kit, { node: n, contact: null }, s.map, control).pill)) };
}

const unseenUkrainians = (w: World) => Object.values(w.formations).filter((f) => f.nation === UKR && f.status === 'active' && !estimate(w, RUS, f.id));

describe('the drag kit and pill under fog of war', () => {
  it('stay byte for byte the same when the enemy’s true forces differ from the picture: unseen ones moved, every one grown', () => {
    const before = seen();
    let unseen = 0, grown = 0;
    const after = seen((w) => {
      for (const f of unseenUkrainians(w)) {
        unseen++;
        f.node = aims[1];
      }
      for (const f of Object.values(w.formations)) {
        if (f.nation !== UKR || f.status !== 'active') continue;
        grown++;
        for (const k of Object.keys(f.equipment) as (keyof typeof f.equipment)[]) f.equipment[k] *= 3;
        f.morale = 1;
        f.readiness = 1;
        f.entrenchment = 1;
      }
    });
    expect(unseen).toBeGreaterThan(0);
    expect(grown).toBeGreaterThan(50);
    expect(after.bytes === before.bytes).toBe(true);
    expect(after.words).toEqual(before.words);
  }, 120_000);

  it('change when a contact at the target is lost or revealed', () => {
    const target = aims.findIndex((n) => s.world.control[n] === UKR && s.world.formations[force[0]].node === n);
    expect(target, 'the stack stands in contested Ukrainian ground, the one enemy cell it can fight for at once').toBe(0);
    const node = aims[target];
    // Own forces are the player's own truth; grown until the odds at the cell are open, so belief can move them either way.
    const grow = (k: number) => (w: World) => force.forEach((id) => scale(w.formations[id], k));
    const take = (x: ReturnType<typeof seen>) => x.pills[target] as Extract<ReturnType<typeof seen>['pills'][number], { kind: 'take' }>;
    const k = [2, 4, 8, 16, 32, 64, 128].find((k) => {
      const p = take(seen(grow(k))).p.mid;
      return p > 0 && p < 1;
    })!;
    expect(k).toBeDefined();
    const before = seen(grow(k));

    const known = Object.entries(s.world.slices.intel!.pictures[RUS]!).filter(([id, c]) => c!.node === node && s.world.formations[id as FormationId]?.nation === UKR);
    expect(known.length).toBeGreaterThan(0);
    const lost = seen((w) => {
      grow(k)(w);
      for (const [id] of known) delete w.slices.intel!.pictures[RUS]![id as FormationId];
    });
    expect(take(lost).p.mid).toBeGreaterThan(take(before).p.mid);

    const revealed = seen((w) => {
      grow(k)(w);
      // A brigade the picture placed far away is found standing at the target.
      const pic = w.slices.intel!.pictures[RUS]!;
      const f = Object.values(w.formations).find((x) => x.nation === UKR && x.kind === 'maneuver' && x.status === 'active' && pic[x.id] && s.map.distanceKm(pic[x.id]!.node, node) > 500)!;
      f.node = node;
      pic[f.id] = { node, tick: w.tick, kind: f.kind, strength: 400, equipment: { ...f.equipment }, source: 'contact' };
    });
    expect(revealed.bytes === before.bytes).toBe(false);
    expect(take(revealed).p.mid).toBeLessThan(take(before).p.mid);
  }, 120_000);
});
