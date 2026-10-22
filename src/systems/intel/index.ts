/**
 * Intelligence: what each nation believes about foreign formations it watches: its enemies', its
 * rivals' (RIVAL_OPINION) and any within WATCH_KM of its ground. Each tick the nation's sensors fix
 * some of them: their bases (peacetime intelligence), anything on its ground or next to its
 * troops, what airborne ISR and reconnaissance satellites image, and the warships the naval
 * system tracks. A fix records where the formation was, what
 * it was and roughly how strong. Treaty allies pool fixes, as US and Japanese sensors feed
 * one picture; other co-belligerents and supporting powers pass on only some sources (sharing.ts). Between fixes the belief goes stale: the position error grows
 * with how fast that kind of formation moves, and confidence decays with it.
 *
 * A daily indications-and-warning pass (WARN_RISE) warns a nation of a build-up on its border.
 *
 * Sole writer of slices.intel. Decision-makers read it through `viewOf` (view.ts). A world run
 * without this system (unit tests of other systems) has no slice, and readers treat that as
 * perfect intelligence.
 */
import { atWar, hostility, type SimContext, type System } from '../../core/engine';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, FormationKind, NationId, NodeId, PlatformClass, PlatformId, World } from '../../core/types';
import { isrJammed } from '../c2';
import { conditionsAt, sortieFactorAt } from '../weather/effects';
import { COMMERCIAL_IMAGERY, LIAISON_SOURCES, SUPPORT_SHARE, supportSources } from './sharing';
import { seaNeighbour } from '../naval/geography';

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
  /** Estimated platforms by type at the fix, with the same error as `strength`. */
  equipment: Record<PlatformId, number>;
  source: IntelSource;
  /** Seen aboard this ship at the fix: troops and vehicles loading on a lift are watched with it. */
  embarkedOn?: FormationId;
  /** A ship seen standing inshore off this coastal cell (naval navalPosition), not out in its sea zone. */
  inshore?: NodeId;
  /** A ship seen under way, though still in its home port. */
  underway?: true;
}

/** A build-up on a nation's border that its intelligence has read as warning. */
export interface Warning {
  from: NationId;
  /** Tick the build-up last met the threshold. */
  tick: number;
  /** Believed platforms of `from` in or next to the nation's ground, and the lowest level of the week before. */
  strength: number;
  baseline: number;
}

export interface IntelState {
  /** Per observer, its contacts by foreign formation id. */
  pictures: Record<NationId, Record<FormationId, Contact>>;
  /** Per observer and foreign nation, the believed platforms on its border on each of the last WARN_DAYS days. */
  levels: Record<NationId, Record<NationId, number[]>>;
  /** Per observer, the build-up it is warned of. */
  warnings: Record<NationId, Warning>;
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
/**
 * Satellite visibility of a missile formation at its home garrison in wartime: its launchers have
 * dispersed, but to hides around a known base or tunnel complex, a small search area against a
 * country-wide TEL hunt. Israel struck about a third to half of Iran's ~400 launchers within the
 * first week of June 2025, largely around known bases (IDF statements; ISW). Judgment.
 */
const SAT_VISIBILITY_MISSILE_BASE = 0.3;

/** Furthest reach of airborne ISR from its orbit: AEW and maritime patrol radar, and long-endurance drones' sensors. Judgment. */
const AIRBORNE_ISR_KM = 300;
/**
 * What each airborne ISR class can fix. An AEW radar is built to track aircraft and sees ships on
 * the sea's flat surface, not ground forces among terrain clutter; maritime patrol aircraft hunt
 * ships; ISR drones carry EO/IR and SAR/GMTI sensors that find ground units (Predator, Heron and
 * Orlan-10 work over the battle area). Ground-moving-target radar is what tracks a ground force
 * from the air (JSTARS, Sentinel R1).
 */
const ISR_SEES: Partial<Record<PlatformClass, { ground: boolean; sea: boolean }>> = {
  awacs: { ground: false, sea: true },
  maritime_patrol: { ground: false, sea: true },
  isr_drone: { ground: true, sea: true },
};
/** Postures that put a wing over its order target; otherwise its ISR orbits near its base. */
const ORBIT_POSTURES: ReadonlySet<string> = new Set(['patrol', 'strike', 'air_superiority', 'escort']);
/** Enemy air control over its orbit at which a high-value ISR aircraft stands off and fixes nothing. Judgment: A-50 losses in 2024 pushed Russian AEW back from the front. */
const ISR_STANDOFF_AIR = 0.5;
/**
 * Share of reconnaissance-satellite collection that is radar (SAR), which sees through cloud and
 * darkness; the rest is electro-optical and needs a clear sky in daylight. US Topaz, China's Yaogan
 * SAR, Japan's IGS radar and Korea's 425 SAR satellites, against KH-11 and the optical constellations.
 * Judgment.
 */
const SAT_SAR_SHARE = 0.4;

/**
 * Who watches a nation's forces in peacetime besides its enemies. Foreign troops within this
 * reach of a state's ground are watched by that state: the depth of border surveillance and
 * stand-off ISR along a frontier (AIRBORNE_ISR_KM; US and NATO tracked Russia's 2021 build-up
 * at Yelnya and Voronezh, 250-300 km from Ukraine). Bounding the watch to neighbours and
 * declared rivals keeps the pictures small and the tick cheap. Judgment.
 */
const WATCH_KM = 300;
/**
 * Opinion at or below which a state treats another as a main threat and keeps its whole
 * order of battle under watch (garrisons, satellite passes) wherever it is: US on Russia
 * and North Korea, Israel on Iran, India on Pakistan, South Korea on the North. Judgment,
 * set below the -50s of merely hostile pairs (the Nordics on Russia) so the watch stays bounded.
 */
const RIVAL_OPINION = -75;

/**
 * Indications and warning: once a day each nation sums the believed strength of foreign ground
 * forces in or next to its ground (contact strength times confidence). A rise to WARN_RISE times
 * the lowest level of the past WARN_DAYS, by at least WARN_MIN_PLATFORMS, warns it. The 2021-22
 * Russian build-up around Ukraine and the Egyptian and Syrian concentrations of 1973 were each
 * read from a rise in forces at the border over days to weeks. Thresholds are judgment.
 */
const WARN_DAYS = 7;
const WARN_RISE = 1.5;
const WARN_MIN_PLATFORMS = 150;
/** A warning lapses this long after the build-up last met the threshold. */
const WARNING_HOLD_DAYS = 7;
const WARN_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'missile']);

const nearMemo = new WeakMap<GameMap, Map<NodeId, Int32Array>>();

/** Land cells within WATCH_KM of a node (a sea zone also reaches its own coast), by a walk over adjacency. */
function landNear(map: GameMap, node: NodeId): Int32Array {
  let m = nearMemo.get(map);
  if (!m) nearMemo.set(map, (m = new Map()));
  let out = m.get(node);
  if (out) return out;
  const cells: number[] = [];
  const seen = new Set<number>([node]);
  const queue = [node as number];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    if (n < map.landCount) cells.push(n);
    for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) {
      const j = map.adj[k];
      if (seen.has(j)) continue;
      seen.add(j);
      if (map.distanceKm(node, j as NodeId) <= WATCH_KM || (n === node && map.isSea(node))) queue.push(j);
    }
  }
  m.set(node, (out = Int32Array.from(cells)));
  return out;
}

export const intel: System = {
  id: 'intel',
  init(world) {
    world.slices.intel = { pictures: {}, levels: {}, warnings: {} };
  },
  step(world, ctx) {
    const { map } = ctx;
    const s = world.slices.intel;
    const pictures = s.pictures;
    const enemies = hostility(world).foes;
    const rivals = new Map<NationId, Set<NationId>>();
    for (const [key, r] of Object.entries(world.relations)) {
      if (r.atWar || r.opinion > RIVAL_OPINION) continue;
      const [a, b] = key.split('|') as [NationId, NationId];
      (rivals.get(a) ?? rivals.set(a, new Set()).get(a)!).add(b);
      (rivals.get(b) ?? rivals.set(b, new Set()).get(b)!).add(a);
    }
    /** Where a ship is seen to stand and whether it is moving: the physical state its orders put it in. */
    const observeShip = (c: Contact, f: Formation) => {
      const t = f.order.target;
      if (t !== undefined && !map.isSea(t) && map.isSea(f.node) && seaNeighbour(map, t) === f.node) c.inshore = t;
      else delete c.inshore;
      if (f.order.path?.length) c.underway = true;
      else delete c.underway;
    };
    const formations = Object.values(world.formations);
    const aboard = new Map<FormationId, Formation[]>();
    for (const f of formations) if (f.status === 'embarked' && f.embarkedOn) (aboard.get(f.embarkedOn) ?? aboard.set(f.embarkedOn, []).get(f.embarkedOn)!).push(f);

    const holdersNear = new Map<NodeId, Set<NationId>>();
    const observing = new Map<string, Set<NationId>>();
    /** The formation's enemies, its rivals, and the foreign states whose ground lies within WATCH_KM, treaty allies excepted. */
    const observersOf = (f: Formation): Set<NationId> => {
      const key = f.kind === 'space' ? f.nation : `${f.nation}|${f.node}`;
      let out = observing.get(key);
      if (out) return out;
      out = new Set([...(enemies.get(f.nation) ?? []), ...(rivals.get(f.nation) ?? [])]);
      if (f.kind !== 'space') {
        let near = holdersNear.get(f.node);
        if (!near) {
          holdersNear.set(f.node, (near = new Set()));
          for (const c of landNear(map, f.node)) if (world.control[c]) near.add(world.control[c]);
        }
        for (const h of near) if (h !== f.nation && !out.has(h) && !sharesBloc(world, h, f.nation)) out.add(h);
      }
      observing.set(key, out);
      return out;
    };

    const watchers = new Map<number, Set<NationId>>();
    const watch = (node: number, n: NationId) => (watchers.get(node) ?? watchers.set(node, new Set()).get(node)!).add(n);
    const isr: { node: NodeId; nation: NationId; ground: boolean; sea: boolean; reachKm: number }[] = [];
    for (const f of formations) {
      if (f.status !== 'active') continue;
      if (f.kind === 'air_wing') {
        const orbit = isrOrbit(world, map, ctx, f);
        if (orbit) isr.push(orbit);
        continue;
      }
      if (map.isSea(f.node) || f.kind === 'space') continue;
      watch(f.node, f.nation);
      for (let k = map.adjStart[f.node]; k < map.adjStart[f.node + 1]; k++) watch(map.adj[k], f.nation);
    }
    const sats = new Map<NationId, number>();
    const space = world.slices.strategic?.space ?? {};
    for (const n of new Set([...Object.keys(space), ...Object.keys(COMMERCIAL_IMAGERY)]) as Set<NationId>) {
      const alive = (space[n]?.recon_satellite?.alive ?? 0) + (COMMERCIAL_IMAGERY[n] ?? 0);
      if (alive > 0) sats.set(n, 1 - Math.exp(-alive * SAT_FIX_PER_SATELLITE));
    }
    const imaging = new Map<number, number>();
    /** Share of satellite passes over a cell that image it: radar always, optical under a clear daytime sky. */
    const imagingAt = (node: NodeId) => {
      let v = imaging.get(node);
      if (v === undefined) {
        const c = conditionsAt(world, map, node);
        imaging.set(node, (v = c ? SAT_SAR_SHARE + (1 - SAT_SAR_SHARE) * (1 - c.cloud) * (1 - c.nightHours / 24) : 1));
      }
      return v;
    };
    const tracks = world.slices.naval?.tracks ?? {};
    const fix = (o: NationId, f: Formation, source: IntelSource) => {
      const known = pictures[o]?.[f.id];
      // The same sensor seeing it in the same place again only refreshes the fix.
      if (known && known.node === f.node && known.source === source && known.embarkedOn === f.embarkedOn) {
        known.tick = world.tick;
        if (f.kind === 'surface_group') observeShip(known, f);
        return;
      }
      const scale = 1 + SOURCE_ERROR[source].strength * (2 * draw(f.id, world.tick, o) - 1);
      let count = 0;
      const equipment: Record<PlatformId, number> = {};
      for (const [pid, k] of Object.entries(f.equipment) as [PlatformId, number][]) {
        count += k;
        if (k > 0) equipment[pid] = Math.round(k * scale);
      }
      const strength = Math.max(0, Math.round(count * scale));
      const c: Contact = { node: f.node, tick: world.tick, kind: f.kind, strength, equipment, source };
      if (f.embarkedOn) c.embarkedOn = f.embarkedOn;
      if (f.kind === 'surface_group') observeShip(c, f);
      (pictures[o] ??= {})[f.id] = c;
    };
    /** Whether `o` takes `n`'s fix by `src` on formation `f` (see sharing.ts). */
    const shares = (o: NationId, n: NationId, f: Formation, src: IntelSource) => {
      if (enemies.get(o)?.has(n)) return false;
      if (sharesBloc(world, o, n)) return true;
      const foes = enemies.get(f.nation);
      if (foes?.has(o) && foes.has(n)) return LIAISON_SOURCES.has(src);
      if (!supportSources(n, o)?.has(src)) return false;
      const share = SUPPORT_SHARE();
      return share >= 1 || draw(f.id, world.tick, `${n}>${o}`) < share;
    };
    /** Nations that pass collection to a state that is not their ally or co-belligerent (sharing.ts), by recipient. */
    const supporters = new Map<NationId, NationId[]>();
    for (const n of Object.keys(world.nations) as NationId[])
      for (const o of Object.keys(world.nations) as NationId[]) if (n !== o && supportSources(n, o)) (supporters.get(o) ?? supporters.set(o, []).get(o)!).push(n);

    for (const f of formations) {
      if (f.status !== 'active' && f.status !== 'routed') continue;
      const observers = observersOf(f);
      if (!observers.size) continue;
      const fixWith = (o: NationId, source: IntelSource) => {
        fix(o, f, source);
        for (const g of aboard.get(f.id) ?? []) fix(o, g, source);
      };
      if (atBase(map, f)) {
        for (const o of observers) fixWith(o, 'base');
        continue;
      }
      // A missile brigade in its garrison is known in peace; at war its launchers disperse around it.
      const garrisoned = f.kind === 'missile' && f.node === f.home;
      if (garrisoned) for (const o of observers) if (!enemies.get(f.nation)?.has(o)) fixWith(o, 'base');
      // Sensing nations: the formation's observers and their supporters, each with the first sensor that fixed it.
      let extra: Set<NationId> | undefined;
      for (const o of observers) for (const n of supporters.get(o) ?? []) if (!observers.has(n)) (extra ??= new Set(observers)).add(n);
      const sensors: ReadonlySet<NationId> = extra ?? observers;
      const seen = new Map<NationId, IntelSource>();
      const see = (n: NationId, src: IntelSource) => {
        if (sensors.has(n) && !seen.has(n)) seen.set(n, src);
      };
      if (!map.isSea(f.node)) {
        const holder = world.control[f.node];
        if (holder) see(holder, 'territory');
        for (const n of watchers.get(f.node) ?? []) see(n, 'contact');
      }
      if (f.kind !== 'submarine') {
        const sea = f.kind === 'surface_group';
        for (const w of isr) if (!seen.has(w.nation) && sensors.has(w.nation) && (sea ? w.sea : w.ground) && map.distanceKm(w.node, f.node) <= w.reachKm && !isrJammed(world, f.node, w.nation, f.id)) see(w.nation, 'airborne');
      }
      const vis = (garrisoned ? SAT_VISIBILITY_MISSILE_BASE : (SAT_VISIBILITY[f.kind] ?? 0)) * (map.isSea(f.node) ? 1 : imagingAt(f.node));
      if (vis > 0) for (const [n, p] of sats) if (sensors.has(n) && !seen.has(n) && draw(f.id, world.tick, n) < p * vis) see(n, 'satellite');
      for (const n of tracks[f.id] ?? []) see(n, 'naval');
      if (!seen.size) continue;
      for (const o of observers) {
        if (garrisoned && !enemies.get(f.nation)?.has(o)) continue;
        let source = seen.get(o);
        if (!source) for (const [n, src] of seen) if (shares(o, n, f, src)) { source = src; break; }
        if (source) fixWith(o, source);
      }
    }

    for (const o in pictures) {
      const p = pictures[o as NationId];
      for (const id in p) {
        const c = p[id as FormationId];
        // A loss is learnt by troops in or beside the cell where the formation died; elsewhere its contact only goes stale.
        const lost = world.formations[id as FormationId]?.status === 'destroyed' && !!watchers.get(world.formations[id as FormationId].node)?.has(o as NationId);
        if ((c.tick !== world.tick && confidenceAt(world, c) < FORGET) || lost) delete p[id as FormationId];
      }
    }
    if (world.tick % ticksPerDay(world) === 0) indications(world, map, ctx);
    orbits.set(world, { tick: world.tick, isr });
    stamps.set(world, pictureStamp(world) + 1);
  },
};

/**
 * Bumped each step, so a View built earlier in a tick (diplomacy runs before intel) is not
 * reused once the picture has changed. Runtime only: a resumed run starts with no Views either.
 */
const stamps = new WeakMap<World, number>();
export const pictureStamp = (world: World): number => stamps.get(world) ?? 0;

/** The airborne ISR flying in the tick intel last stepped. Runtime only: it is rebuilt by the next step. */
const orbits = new WeakMap<World, { tick: number; isr: { node: NodeId; nation: NationId; ground: boolean; reachKm: number }[] }>();

/**
 * Whether `observer`'s ground-watching ISR (drones over the battle area) covered `node` this tick and
 * kept its link through the jamming there: what finds a command post or a launcher, rather than
 * a formation somewhere in a cell. Without the intel system, everything is watched.
 */
export function isrOverwatch(world: World, map: GameMap, observer: NationId, node: NodeId, key: string): boolean {
  if (!world.slices.intel) return true;
  const o = orbits.get(world);
  if (!o || o.tick !== world.tick) return false;
  for (const w of o.isr) if (w.nation === observer && w.ground && map.distanceKm(w.node, node) <= w.reachKm) return !isrJammed(world, node, observer, key as FormationId);
  return false;
}

const ticksPerDay = (world: World) => Math.max(1, Math.round(24 / world.dtHours));

/** The daily indications-and-warning pass (see WARN_RISE). */
function indications(world: World, map: GameMap, ctx: SimContext): void {
  const s = world.slices.intel;
  for (const o of Object.keys(s.pictures).sort() as NationId[]) {
    const near = (n: NodeId) => {
      if (world.control[n] === o) return true;
      for (let k = map.adjStart[n]; k < map.adjStart[n + 1]; k++) if (map.adj[k] < map.landCount && world.control[map.adj[k]] === o) return true;
      return false;
    };
    const today = new Map<NationId, number>();
    for (const [id, c] of Object.entries(s.pictures[o]) as [FormationId, Contact][]) {
      const of = world.formations[id]?.nation;
      if (!of || !WARN_KINDS.has(c.kind) || atWar(world, o, of) || !near(c.node)) continue;
      today.set(of, (today.get(of) ?? 0) + c.strength * confidenceAt(world, c));
    }
    const levels = (s.levels[o] ??= {});
    for (const of of Object.keys(levels) as NationId[]) if (!today.has(of)) today.set(of, 0);
    let worst: Warning | undefined;
    for (const [of, level] of [...today].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const past = levels[of] ?? [];
      if (past.length) {
        const baseline = Math.min(...past);
        if (level >= WARN_RISE * baseline && level - baseline >= WARN_MIN_PLATFORMS && (!worst || level - baseline > worst.strength - worst.baseline))
          worst = { from: of, tick: world.tick, strength: Math.round(level), baseline };
      }
      past.push(Math.round(level));
      if (past.length > WARN_DAYS) past.shift();
      if (past.some((v) => v > 0)) levels[of] = past;
      else delete levels[of];
    }
    if (!Object.keys(levels).length) delete s.levels[o];
    const held = s.warnings[o];
    if (worst) {
      if (held?.from !== worst.from) ctx.emit({ type: 'message', tick: world.tick, nation: o, text: `warning: ${worst.from} forces massing on the border of ${o}, about ${worst.strength} platforms against ${worst.baseline} in the week before` });
      s.warnings[o] = worst;
    } else if (held && (atWar(world, o, held.from) || world.tick - held.tick >= WARNING_HOLD_DAYS * ticksPerDay(world))) delete s.warnings[o];
  }
}

function sharesBloc(world: World, a: NationId, b: NationId): boolean {
  const x = world.nations[a]?.blocs, y = world.nations[b]?.blocs;
  return !!x && !!y && x.some((bloc) => y.includes(bloc));
}

/**
 * Where an air wing's ISR aircraft fly this tick and what they can fix, or undefined when it has
 * none or they are grounded: by the weather at base, or by enemy air control over their orbit.
 */
function isrOrbit(world: World, map: GameMap, ctx: SimContext, f: Formation): { node: NodeId; nation: NationId; ground: boolean; sea: boolean; reachKm: number } | undefined {
  let ground = false, sea = false, reachKm = 0;
  for (const pid in f.equipment) {
    if (f.equipment[pid as PlatformId] <= 0) continue;
    const p = ctx.catalog.platform(pid as PlatformId);
    const sees = ISR_SEES[p.class];
    if (!sees) continue;
    ground ||= sees.ground;
    sea ||= sees.sea;
    reachKm = Math.max(reachKm, Math.min(AIRBORNE_ISR_KM, p.mobility.rangeKm));
  }
  if (!reachKm) return undefined;
  const node = ORBIT_POSTURES.has(f.order.posture) && f.order.target !== undefined ? f.order.target : f.node;
  const air = world.theater.airControl[node];
  if (air && air.level >= ISR_STANDOFF_AIR && atWar(world, f.nation, air.nation)) return undefined;
  if (draw(f.id, world.tick, 'sortie') >= sortieFactorAt(world, map, f.node)) return undefined;
  return { node, nation: f.nation, ground, sea, reachKm };
}

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

export function confidenceAt(world: World, c: Contact): number {
  const hours = (world.tick - c.tick) * world.dtHours;
  return 0.5 ** (hours / STALENESS[c.kind].halfLifeHours);
}

/** The build-up `nation` is warned of, if any. */
export function warningOf(world: World, nation: NationId): Warning | undefined {
  return world.slices.intel?.warnings[nation];
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
