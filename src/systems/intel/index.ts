/**
 * Intelligence: what each nation at war believes about its enemies' formations. Each tick the
 * nation's sensors fix some enemy formations: their bases (peacetime intelligence), anything on
 * friendly ground or next to friendly troops, what airborne ISR and reconnaissance satellites
 * image, and the warships the naval system tracks. A fix records where the formation was, what
 * it was and roughly how strong. Co-belligerents pool fixes, as US, Japanese and Taiwanese
 * sensors would feed one picture. Between fixes the belief goes stale: the position error grows
 * with how fast that kind of formation moves, and confidence decays with it.
 *
 * Sole writer of slices.intel. Readers: AI targeting and naval planning, and the UI. A world run
 * without this system (unit tests of other systems) has no slice, and readers treat that as
 * perfect intelligence.
 */
import type { System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, NationId, NodeId, PlatformClass, PlatformId, World } from '../../core/types';
import { isrJammed } from '../c2';

export type IntelSource = 'base' | 'territory' | 'contact' | 'airborne' | 'satellite' | 'naval';

/** One nation's belief about one enemy formation, as of its last fix. */
export interface Contact {
  /** Cell where the formation was fixed. */
  node: NodeId;
  /** Tick of the fix. */
  tick: number;
  kind: FormationKind;
  /** Estimated platform count at the fix; the true count within the source's error. */
  strength: number;
  source: IntelSource;
}

export interface IntelState {
  /** Per observer, its contacts by enemy formation id. */
  pictures: Record<NationId, Record<FormationId, Contact>>;
}

declare module '../../core/types' {
  interface Slices {
    intel: IntelState;
  }
}

/** A contact as it stands now: how old, how far off it may be, and how much it is still worth. */
export interface Estimate extends Contact {
  ageHours: number;
  /** Radius within which the formation probably is now. */
  errorKm: number;
  /** 0..1: 1 at a fresh fix, halving every `halfLifeHours` of the kind. */
  confidence: number;
}

/**
 * How fast a belief about each kind goes stale: km of drift per hour since the fix (a share of
 * road or cruise speed: units do not move all the time), and the confidence half-life. Fixed
 * sites keep for weeks; ships at sea and dispersed missile TELs for hours (the 1991 Scud hunt
 * found almost no TELs; CSIS 2023 assumed PLA ocean surveillance re-acquires carriers within a
 * day). Judgment.
 */
export const STALENESS: Record<FormationKind, { driftKph: number; halfLifeHours: number }> = {
  maneuver: { driftKph: 4, halfLifeHours: 48 },
  artillery: { driftKph: 3, halfLifeHours: 36 },
  air_defense: { driftKph: 2, halfLifeHours: 72 },
  missile: { driftKph: 8, halfLifeHours: 12 },
  air_wing: { driftKph: 0, halfLifeHours: 24 * 14 },
  surface_group: { driftKph: 20, halfLifeHours: 12 },
  submarine: { driftKph: 15, halfLifeHours: 6 },
  strategic: { driftKph: 2, halfLifeHours: 24 * 7 },
  logistics: { driftKph: 3, halfLifeHours: 72 },
  space: { driftKph: 0, halfLifeHours: 24 * 30 },
};

/** Position error at the fix, km, and strength error (share of the true count, either way) by source. Judgment. */
export const SOURCE_ERROR: Record<IntelSource, { km: number; strength: number }> = {
  base: { km: 10, strength: 0.3 },
  territory: { km: 30, strength: 0.4 },
  contact: { km: 10, strength: 0.25 },
  airborne: { km: 20, strength: 0.3 },
  satellite: { km: 5, strength: 0.2 },
  naval: { km: 50, strength: 0.3 },
};

/** Contacts below this confidence are forgotten. */
const FORGET = 0.05;

/**
 * Chance per tick that reconnaissance satellites image a formation in the open, per satellite
 * alive, and how visible each kind is to them: dispersed TELs and dived boats hardly at all,
 * a fleet at sea about half the time it is overhead (ocean area; China's Yaogan triplets are
 * built for it). Judgment.
 */
const SAT_FIX_PER_SATELLITE = 0.02;
const SAT_VISIBILITY: Partial<Record<FormationKind, number>> = {
  maneuver: 0.5, artillery: 0.4, air_defense: 0.4, missile: 0.05, logistics: 0.5, surface_group: 0.5, strategic: 0.2,
};

/** Reach of airborne ISR over land and sea: AWACS and maritime patrol radar, JSTARS-class and drone sensors. Judgment. */
const AIRBORNE_ISR_KM = 300;
const ISR_CLASSES: ReadonlySet<PlatformClass> = new Set(['awacs', 'maritime_patrol', 'isr_drone']);

export const intel: System = {
  id: 'intel',
  init(world) {
    world.slices.intel = { pictures: {} };
  },
  step(world, ctx) {
    const { map } = ctx;
    const pictures = world.slices.intel.pictures;
    const enemies = new Map<NationId, Set<NationId>>();
    for (const [key, r] of Object.entries(world.relations)) {
      if (!r.atWar) continue;
      const [a, b] = key.split('|') as [NationId, NationId];
      (enemies.get(a) ?? enemies.set(a, new Set()).get(a)!).add(b);
      (enemies.get(b) ?? enemies.set(b, new Set()).get(b)!).add(a);
    }
    for (const n of Object.keys(pictures) as NationId[]) if (!enemies.has(n)) delete pictures[n];
    if (!enemies.size) return;
    const formations = Object.values(world.formations);

    const watchers = new Map<number, Set<NationId>>();
    const watch = (node: number, n: NationId) => (watchers.get(node) ?? watchers.set(node, new Set()).get(node)!).add(n);
    const isr: { node: NodeId; nation: NationId }[] = [];
    for (const f of formations) {
      if (f.status !== 'active' || !enemies.has(f.nation)) continue;
      if (f.kind === 'air_wing') {
        if (Object.entries(f.equipment).some(([pid, k]) => k > 0 && ISR_CLASSES.has(ctx.catalog.platform(pid as PlatformId).class))) isr.push({ node: f.node, nation: f.nation });
        continue;
      }
      if (map.isSea(f.node) || f.kind === 'space') continue;
      watch(f.node, f.nation);
      for (const m of map.neighbors(f.node)) watch(m, f.nation);
    }
    const sats = new Map<NationId, number>();
    for (const n of enemies.keys()) {
      const alive = world.slices.strategic?.space?.[n]?.recon_satellite?.alive ?? 0;
      if (alive > 0) sats.set(n, 1 - Math.exp(-alive * SAT_FIX_PER_SATELLITE));
    }
    const tracks = world.slices.naval?.tracks ?? {};
    const fix = (o: NationId, f: Formation, source: IntelSource) => {
      const known = pictures[o]?.[f.id];
      // The same sensor seeing it in the same place again only refreshes the fix.
      if (known && known.node === f.node && known.source === source) {
        known.tick = world.tick;
        return;
      }
      let count = 0;
      for (const k of Object.values(f.equipment)) count += k;
      const strength = Math.max(0, Math.round(count * (1 + SOURCE_ERROR[source].strength * (2 * draw(f.id, world.tick, o) - 1))));
      const p = (pictures[o] ??= {});
      const c = p[f.id];
      if (c) Object.assign(c, { node: f.node, tick: world.tick, kind: f.kind, strength, source });
      else p[f.id] = { node: f.node, tick: world.tick, kind: f.kind, strength, source };
    };

    for (const f of formations) {
      const observers = f.status === 'active' || f.status === 'routed' ? enemies.get(f.nation) : undefined;
      if (!observers) continue;
      if (atBase(map, f)) {
        for (const o of observers) fix(o, f, 'base');
        continue;
      }
      // Sensing nations: the formation's enemies, each with the first sensor that fixed it.
      const seen = new Map<NationId, IntelSource>();
      const see = (n: NationId, s: IntelSource) => {
        if (observers.has(n) && !seen.has(n)) seen.set(n, s);
      };
      if (!map.isSea(f.node)) {
        const holder = world.control[f.node];
        if (holder) see(holder, 'territory');
        for (const n of watchers.get(f.node) ?? []) see(n, 'contact');
      }
      if (f.kind !== 'submarine')
        for (const s of isr) if (!seen.has(s.nation) && observers.has(s.nation) && map.distanceKm(s.node, f.node) <= AIRBORNE_ISR_KM && !isrJammed(world, f.node, s.nation, f.id)) see(s.nation, 'airborne');
      const vis = SAT_VISIBILITY[f.kind] ?? 0;
      if (vis > 0) for (const [n, p] of sats) if (observers.has(n) && !seen.has(n) && draw(f.id, world.tick, n) < p * vis) see(n, 'satellite');
      for (const n of tracks[f.id] ?? []) see(n, 'naval');
      if (!seen.size) continue;
      // Co-belligerents pool what they see: an observer takes a fix from any sensing nation it is not at war with.
      for (const o of observers) {
        let source = seen.get(o);
        if (!source) for (const [n, s] of seen) if (!enemies.get(n)!.has(o)) { source = s; break; }
        if (source) fix(o, f, source);
      }
    }

    for (const p of Object.values(pictures))
      for (const [id, c] of Object.entries(p)) if (world.formations[id as FormationId]?.status === 'destroyed' || confidenceAt(world, c) < FORGET) delete p[id as FormationId];
  },
};

/** A formation sitting where peacetime intelligence placed it: its garrison, an air base, a port. Dispersed TELs are not. */
export function atBase(map: GameMap, f: Formation): boolean {
  if (f.kind === 'missile') return false;
  if (f.node === f.home) return true;
  return !map.isSea(f.node) && ((f.kind === 'air_wing' && map.airports[f.node] > 0) || ((f.kind === 'surface_group' || f.kind === 'submarine') && map.ports[f.node] > 0));
}

/** A deterministic draw in [0, 1) per formation, tick and observer, so intelligence never moves the shared RNG stream. */
function draw(id: string, tick: number, n: string): number {
  let h = 2166136261 ^ tick;
  for (const s of [id, n]) for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function confidenceAt(world: World, c: Contact): number {
  const hours = (world.tick - c.tick) * world.dtHours;
  return 0.5 ** (hours / STALENESS[c.kind].halfLifeHours);
}

/**
 * `observer`'s contacts: undefined in a world run without the intel system (perfect intelligence),
 * 'peacetime' for a nation at war with no one, which knows only what sits at its bases (atBase).
 */
export function picture(world: World, observer: NationId): Readonly<Record<FormationId, Contact>> | 'peacetime' | undefined {
  const s = world.slices.intel;
  if (!s) return undefined;
  return s.pictures[observer] ?? 'peacetime';
}

/** What `observer` believes now about formation `id`: undefined when it has no contact. */
export function estimate(world: World, observer: NationId, id: FormationId): Estimate | undefined {
  const c = world.slices.intel?.pictures[observer]?.[id];
  if (!c) return undefined;
  const ageHours = (world.tick - c.tick) * world.dtHours;
  return { ...c, ageHours, errorKm: SOURCE_ERROR[c.source].km + STALENESS[c.kind].driftKph * ageHours, confidence: confidenceAt(world, c) };
}

/** Every contact `observer` holds, as it stands now, freshest first. */
export function estimates(world: World, observer: NationId): (Estimate & { formation: FormationId })[] {
  const p = world.slices.intel?.pictures[observer] ?? {};
  return (Object.keys(p) as FormationId[]).map((id) => ({ formation: id, ...estimate(world, observer, id)! })).sort((a, b) => a.ageHours - b.ageHours || (a.formation < b.formation ? -1 : 1));
}
