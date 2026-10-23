/**
 * What one nation can know about the world's forces: its own and its friends' formations in
 * full, everyone else's only as its intelligence picture holds them. Every decision-maker (AI
 * planners, diplomacy's assessments, the player's client) reads foreign forces through a View;
 * only physics reads the true formations of another nation.
 */
import type { Catalog } from '../../core/catalog';
import { hostility } from '../../core/engine';
import { personnelOf, supplyCapacityOf } from '../../core/forces';
import type { GameMap } from '../../core/map';
import type { Formation, FormationId, NationId, NodeId, PlatformId, World } from '../../core/types';
import { estimate, pictureStamp, type Contact, type Estimate } from '.';

export type ContactView = Estimate & { id: FormationId; nation: NationId };

/** Below this confidence a contact is too stale to plan against or strike: the formation is somewhere else by now (STALENESS). */
export const CURRENT_CONFIDENCE = 0.25;

export interface View {
  nation: NationId;
  tick: number;
  /** Self plus nations whose forces this nation sees in full: co-belligerents and treaty allies sharing intel. */
  friends: ReadonlySet<NationId>;
  /** Formations of `friends`, true state. */
  friendly(): readonly Formation[];
  /** Everything else this nation believes, as current Estimates keyed by formation id. */
  contacts: ReadonlyMap<FormationId, ContactView>;
  /** Contacts believed to be at a node. */
  contactsAt(node: NodeId): readonly ContactView[];
  /** Believed hostile strength near a node, for planners: platforms of contacts there (of one nation when given), weighted by confidence. */
  believedStrengthAt(node: NodeId, of?: NationId): number;
  /** Minefields in the sea zones `friends` have charted (naval/state.ts), as they lie now. Rebuilt on each call: mines change within a tick. */
  minefields(): Readonly<Record<number, Readonly<Record<NationId, number>>>>;
}

/** Self, everyone fighting one of its enemies and not it, and treaty allies it is not at war with. */
export function friendsOf(world: World, nation: NationId): Set<NationId> {
  const { foes } = hostility(world);
  const mine = foes.get(nation) ?? new Set<NationId>();
  const out = new Set<NationId>([nation]);
  for (const [n, theirs] of foes) {
    if (n === nation || mine.has(n)) continue;
    for (const f of theirs) if (mine.has(f)) { out.add(n); break; }
  }
  const blocs = world.nations[nation]?.blocs ?? [];
  if (blocs.length) for (const n of Object.values(world.nations)) if (!mine.has(n.id) && n.blocs.some((b) => blocs.includes(b))) out.add(n.id);
  return out;
}

const live = (f: Formation) => f.status === 'active' || f.status === 'routed';

/**
 * world.formations as a list, kept within a tick while no formation is added (formations are never
 * removed, only destroyed, and every one added in a run takes its id from newId, which advances
 * nextId). Object.values over a dictionary of thousands of ids costs about a millisecond, and every
 * View, belief and AI planner would otherwise pay it. Shared: callers must not change it.
 */
const lists = new WeakMap<World['formations'], { tick: number; nextId: number; list: Formation[] }>();
export function formationList(world: World): readonly Formation[] {
  let l = lists.get(world.formations);
  if (!l || l.tick !== world.tick || l.nextId !== world.nextId) lists.set(world.formations, (l = { tick: world.tick, nextId: world.nextId, list: Object.values(world.formations) }));
  return l.list;
}

/**
 * Views are reused only while everything they are built from is unchanged: the tick, the picture
 * (intel's stamp), who is at war, and the set of formations (world.nextId grows with each new one).
 * Otherwise a View built by an outside reader between ticks (the client) would be served stale to
 * the next tick's planners after a declaration or a mobilisation, and a run with a client attached
 * would diverge from a headless one.
 */
const views = new WeakMap<World, { key: string; byNation: Map<NationId, View>; truth?: Truth }>();

function viewKey(world: World): string {
  let wars = '';
  for (const p of hostility(world).pairs) if (p.war) wars += `${p.a}${p.b}`;
  return `${world.tick}/${pictureStamp(world)}/${world.nextId}/${wars}`;
}

export function viewOf(world: World, map: GameMap, nation: NationId): View {
  const key = viewKey(world);
  let memo = views.get(world);
  if (!memo || memo.key !== key) views.set(world, (memo = { key, byNation: new Map() }));
  let v = memo.byNation.get(nation);
  if (!v) {
    const m = memo;
    memo.byNation.set(nation, (v = world.slices.intel ? pictureView(world, nation) : truthView(world, nation, () => (m.truth ??= truthOf(world)))));
  }
  return v;
}

/** Every live formation as a perfect contact, shared by all nations' Views of one tick. */
interface Truth {
  byId: Map<FormationId, ContactView>;
  atNode: Map<NodeId, ContactView[]>;
}

function truthOf(world: World): Truth {
  const byId = new Map<FormationId, ContactView>();
  const atNode = new Map<NodeId, ContactView[]>();
  for (const f of formationList(world)) {
    if (!live(f) && f.status !== 'embarked') continue;
    let strength = 0;
    for (const k of Object.values(f.equipment)) strength += k;
    const c: ContactView = { id: f.id, nation: f.nation, node: f.node, tick: world.tick, kind: f.kind, strength, equipment: f.equipment, source: 'contact', ageHours: 0, errorKm: 0, confidence: 1 };
    if (f.embarkedOn) c.embarkedOn = f.embarkedOn;
    byId.set(c.id, c);
    (atNode.get(c.node) ?? atNode.set(c.node, []).get(c.node)!).push(c);
  }
  return { byId, atNode };
}

/** A world run without the intel system: perfect intelligence of every live formation. */
function truthView(world: World, nation: NationId, truth: () => Truth): View {
  const friends = friendsOf(world, nation);
  let contacts: Map<FormationId, ContactView> | undefined;
  const all = () => {
    if (contacts) return contacts;
    contacts = new Map();
    for (const [id, c] of truth().byId) if (!friends.has(c.nation)) contacts.set(id, c);
    return contacts;
  };
  return assemble(world, nation, friends, all, (node) =>
    (truth().atNode.get(node) ?? []).filter((c) => !friends.has(c.nation)),
  );
}


function pictureView(world: World, nation: NationId): View {
  const friends = friendsOf(world, nation);
  let contacts: Map<FormationId, ContactView> | undefined;
  const all = () => {
    if (contacts) return contacts;
    contacts = new Map();
    const pic = world.slices.intel.pictures[nation] ?? {};
    for (const id of Object.keys(pic).sort() as FormationId[]) {
      const of = world.formations[id]?.nation;
      if (!of || friends.has(of)) continue;
      contacts.set(id, { id, nation: of, ...estimate(world, nation, id)! });
    }
    return contacts;
  };
  let atNode: Map<NodeId, ContactView[]> | undefined;
  return assemble(world, nation, friends, all, (node) => {
    if (!atNode) {
      atNode = new Map();
      for (const c of all().values()) (atNode.get(c.node) ?? atNode.set(c.node, []).get(c.node)!).push(c);
    }
    return atNode.get(node) ?? [];
  });
}

function assemble(world: World, nation: NationId, friends: Set<NationId>, contacts: () => ReadonlyMap<FormationId, ContactView>, contactsAt: (node: NodeId) => readonly ContactView[]): View {
  let friendly: Formation[] | undefined;
  return {
    nation,
    tick: world.tick,
    friends,
    friendly: () => (friendly ??= formationList(world).filter((f) => friends.has(f.nation))),
    get contacts() {
      return contacts();
    },
    contactsAt,
    believedStrengthAt(node, of) {
      let s = 0;
      for (const c of contactsAt(node)) if (of === undefined || c.nation === of) s += c.strength * c.confidence;
      return s;
    },
    minefields: () => (world.slices.intel ? chartedFields(world, friends) : world.slices.naval?.mines ?? {}),
  };
}

function chartedFields(world: World, friends: ReadonlySet<NationId>): Record<number, Record<NationId, number>> {
  const out: Record<number, Record<NationId, number>> = {};
  const naval = world.slices.naval;
  if (!naval) return out;
  for (const n of friends) for (const z of naval.charted?.[n] ?? []) if (naval.mines[z]) out[z] = naval.mines[z];
  return out;
}

const believedWorlds = new WeakMap<View, World>();

/**
 * Believed formations built from a fix taken this tick, by the picture's Contact. A fix that is
 * only refreshed keeps its Contact object and everything a belief is built from, so most garrisons
 * and tracked units are rebuilt only when sensors see them change. A belief at full confidence
 * depends on nothing else, so a cache miss builds the same formation.
 */
const settled = new WeakMap<Contact, Formation>();

/**
 * A runnable World clone in which non-friendly formations are replaced by their estimates: at the
 * estimated cell, with the estimated platforms scaled by confidence, and unknown ones absent.
 * What intelligence cannot see is filled in as a planner would: the readiness and morale a
 * formation is raised with (core/forces addFormation), a full basic load and magazine, on the defence. Everything else is shared with
 * `world` by reference, so it is for reading. Identity (name, echelon, garrison) comes from the
 * order of battle, which open sources publish. A world without the intel system is its own belief.
 */
export function believedWorld(world: World, map: GameMap, nation: NationId, catalog: Catalog): World {
  if (!world.slices.intel) return world;
  const view = viewOf(world, map, nation);
  let out = believedWorlds.get(view);
  if (out) return out;
  const pic = world.slices.intel.pictures[nation] ?? {};
  // Null-prototype: a dictionary of thousands of ids builds several times faster.
  const formations: World['formations'] = Object.create(null);
  const list: Formation[] = [];
  // Object.values lists keys in insertion order unless one reads as an array index, which goes first.
  let inOrder = true;
  const put = (b: Formation) => {
    formations[b.id] = b;
    list.push(b);
    const c = b.id.charCodeAt(0);
    if (c >= 48 && c <= 57) inOrder = false;
  };
  for (const f of formationList(world)) {
    if (view.friends.has(f.nation)) put(f);
    else {
      const c = view.contacts.get(f.id);
      if (!c) continue;
      if (c.confidence < 1) put(believedFormation(catalog, f, c));
      else {
        const fix = pic[f.id];
        let b = settled.get(fix);
        if (!b) settled.set(fix, (b = believedFormation(catalog, f, c)));
        put(b);
      }
    }
  }
  if (inOrder) lists.set(formations, { tick: world.tick, nextId: world.nextId, list });
  believedWorlds.set(view, (out = { ...world, formations }));
  return out;
}

function believedFormation(catalog: Catalog, truth: Formation, c: ContactView): Formation {
  const equipment: Record<PlatformId, number> = {};
  for (const [pid, k] of Object.entries(c.equipment) as [PlatformId, number][]) equipment[pid] = k * c.confidence;
  const cap = supplyCapacityOf(catalog, equipment);
  const magazine: Formation['magazine'] = {};
  for (const [pid, n] of Object.entries(equipment) as [PlatformId, number][])
    for (const l of catalog.platform(pid).loadout) magazine[l.munition] = (magazine[l.munition] ?? 0) + l.count * n;
  const f: Formation = {
    id: truth.id,
    nation: truth.nation,
    name: truth.name,
    kind: c.kind,
    echelon: truth.echelon,
    node: c.node,
    home: truth.home,
    equipment,
    damaged: {},
    personnel: personnelOf(catalog, equipment),
    magazine,
    supply: { ...cap },
    supplyCapacity: cap,
    readiness: 0.8,
    morale: 0.7,
    experience: 0.5,
    fatigue: 0,
    entrenchment: 0,
    progressKm: 0,
    // When enemy orders were given is not seen.
    order: { posture: 'defend', issuedTick: 0 },
    status: c.embarkedOn ? 'embarked' : 'active',
  };
  if (c.embarkedOn) f.embarkedOn = c.embarkedOn;
  if (truth.territorial) f.territorial = true;
  if (truth.airborne) f.airborne = true;
  return f;
}
