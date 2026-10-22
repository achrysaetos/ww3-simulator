/**
 * Moments of dread and triumph: a nuclear detonation, a capital changing hands, a new war on us
 * or by us, a carrier or a whole naval group lost, a breakthrough. Each is read from one turn's
 * events and only when the player would know it: a detonation is seen by the whole world, the
 * rest only where the player or its enemies are party to it. Pure; the overlay decides when to
 * show them.
 */
import type { FormationId, NationId, NodeId, SimEvent } from '../../core/types';

export type MomentKind = 'nuclear' | 'capital' | 'war' | 'carrier' | 'fleet' | 'breakthrough';

export interface Moment {
  key: string;
  kind: MomentKind;
  tone: 'dread' | 'triumph';
  title: string;
  sub: string;
  /** The line the ticker runs. */
  headline: string;
  node: NodeId;
  tick: number;
}

export interface MomentContext {
  me: NationId;
  enemies: ReadonlySet<NationId>;
  /** Capital cells, by the nation whose capital it is. */
  capitals: ReadonlyMap<NodeId, NationId>;
  isSea(node: NodeId): boolean;
  platformClass(id: string): string | undefined;
  /** A place's bare name: "Kyiv". */
  place(node: NodeId): string;
  /** A place as a phrase: "at Kyiv", "near Pokrovsk", "off Sevastopol". */
  at(node: NodeId): string;
  name(id: NationId): string;
  /** A formation as the player sees it now, if the player knows of it. */
  formation(id: FormationId): { name: string; nation: NationId; kind: string; strength: number; node: NodeId } | undefined;
  /** The scenario's opening wars as "BY>ON": the opening cinematic covers them. */
  opening: ReadonlySet<string>;
  /** A nation's capital cell, to frame a declaration of war on the map. */
  capitalOf(id: NationId): NodeId | undefined;
}

/** A naval group whose strength falls this low is sunk as a fighting force, whether or not the engine has struck it off. */
export const SUNK_STRENGTH = 0.05;
const NAVAL: ReadonlySet<string> = new Set(['surface_group', 'submarine']);

/** Land cells taken in one turn that make a breakthrough. */
export const BREAKTHROUGH_CELLS = 3;
const RANK: Record<MomentKind, number> = { nuclear: 0, capital: 1, war: 2, carrier: 3, fleet: 4, breakthrough: 5 };
const kt = (y: number) => (y >= 1000 ? `${(y / 1000).toFixed(1)} Mt` : `${Math.round(y)} kt`);

export function momentsOf(events: readonly SimEvent[], c: MomentContext): Moment[] {
  const out: Moment[] = [];
  const mine = (n: NationId) => n === c.me;
  const party = (n: NationId) => mine(n) || c.enemies.has(n);
  const gained: NodeId[] = [], lost: NodeId[] = [];
  const sunk = new Set<FormationId>();
  const fleetLost = (id: FormationId, tick: number, fallback: NodeId) => {
    const f = c.formation(id);
    if (!f || !NAVAL.has(f.kind) || sunk.has(id) || (!mine(f.nation) && !c.enemies.has(f.nation))) return;
    sunk.add(id);
    const ours = mine(f.nation);
    const node = c.isSea(f.node) || !c.isSea(fallback) ? f.node : fallback;
    out.push({
      key: `fleet|${id}`, kind: 'fleet', tone: ours ? 'dread' : 'triumph', node, tick,
      title: ours ? `We have lost the ${f.name}` : `The ${f.name} is sunk`,
      sub: `${c.name(f.nation)} · ${f.name} lost ${c.at(node)}`,
      headline: `${ours ? 'FLEET LOST' : 'ENEMY FLEET SUNK'}: ${c.name(f.nation)} loses the ${f.name} ${c.at(node)}`,
    });
  };
  for (const e of events) {
    if (e.type === 'nuclear_detonation') {
      out.push({
        key: `nuke|${e.node}|${e.tick}`, kind: 'nuclear', tone: mine(e.by) ? 'triumph' : 'dread', node: e.node, tick: e.tick,
        title: 'Nuclear detonation',
        sub: `${c.name(e.by)} · ${kt(e.yieldKt)} ${c.at(e.node)} · about ${e.casualties.toLocaleString('en-US')} casualties`,
        headline: `${c.enemies.has(e.by) ? 'ENEMY NUCLEAR STRIKE' : 'NUCLEAR DETONATION'}: ${c.name(e.by)} detonates ${kt(e.yieldKt)} ${c.at(e.node)}`,
      });
    } else if (e.type === 'node_captured') {
      const owner = c.capitals.get(e.node);
      if (owner && (party(e.from) || party(e.to))) {
        const dread = mine(e.from) || c.enemies.has(e.to);
        const city = c.place(e.node);
        out.push({
          key: `capital|${e.node}|${e.tick}`, kind: 'capital', tone: dread ? 'dread' : 'triumph', node: e.node, tick: e.tick,
          title: mine(e.from) ? 'Our capital has fallen' : mine(e.to) ? `${city} is ours` : `${city} has fallen`,
          sub: `${c.name(e.to)} takes ${city}, capital of ${c.name(owner)}`,
          headline: `${city.toUpperCase()} FALLS: ${c.name(e.to)} takes the capital of ${c.name(owner)}`,
        });
      }
      if (!c.isSea(e.node)) {
        if (mine(e.to) && c.enemies.has(e.from)) gained.push(e.node);
        else if (mine(e.from)) lost.push(e.node);
      }
    } else if (e.type === 'war_declared' && (mine(e.by) || mine(e.on)) && !c.opening.has(`${e.by}>${e.on}`)) {
      const node = c.capitalOf(mine(e.on) ? e.by : e.on);
      if (node === undefined) continue;
      out.push({
        key: `war|${e.by}|${e.on}`, kind: 'war', tone: 'dread', node, tick: e.tick,
        title: mine(e.on) ? `${c.name(e.by)} declares war on us` : `We are at war with ${c.name(e.on)}`,
        sub: `${c.name(e.by)} declares war on ${c.name(e.on)}`,
        headline: `WAR: ${c.name(e.by)} declares war on ${c.name(e.on)}`,
      });
    } else if (e.type === 'formation_destroyed') {
      fleetLost(e.formation, e.tick, 0 as NodeId);
    } else if (e.type === 'strike') {
      for (const x of e.effects) if (x.kind === 'ship_hits' && (c.formation(x.formation)?.strength ?? 1) <= SUNK_STRENGTH) fleetLost(x.formation, e.tick, e.target);
    } else if (e.type === 'battle' && e.domain === 'sea' && (party(e.attacker) || party(e.defender)) && (mine(e.attacker) || mine(e.defender))) {
      for (const [nation, losses] of Object.entries(e.losses) as [NationId, Record<string, number>][]) {
        const sunk = Object.entries(losses).filter(([p, k]) => k >= 1 && c.platformClass(p) === 'carrier').reduce((a, [, k]) => a + Math.floor(k), 0);
        if (!sunk) continue;
        const ours = mine(nation);
        if (!ours && !c.enemies.has(nation)) continue;
        out.push({
          key: `carrier|${nation}|${e.node}|${e.tick}`, kind: 'carrier', tone: ours ? 'dread' : 'triumph', node: e.node, tick: e.tick,
          title: ours ? 'We have lost a carrier' : 'Enemy carrier sunk',
          sub: `${sunk === 1 ? 'An aircraft carrier' : `${sunk} aircraft carriers`} of ${c.name(nation)} lost ${c.at(e.node)}`,
          headline: `CARRIER SUNK: ${c.name(nation)} loses ${sunk === 1 ? 'an aircraft carrier' : `${sunk} carriers`} ${c.at(e.node)}`,
        });
      }
    }
  }
  const tick = events.reduce((a, e) => Math.max(a, e.tick), 0);
  for (const [cells, triumph] of [[gained, true], [lost, false]] as const) {
    if (cells.length < BREAKTHROUGH_CELLS) continue;
    const at = cells[Math.floor(cells.length / 2)];
    out.push({
      key: `break|${triumph ? 'us' : 'them'}|${tick}`, kind: 'breakthrough', tone: triumph ? 'triumph' : 'dread', node: at, tick,
      title: triumph ? 'Breakthrough' : 'The front is broken',
      sub: `${cells.length} cells ${triumph ? 'taken' : 'lost'} in six hours, ${c.at(at)}`,
      headline: triumph ? `BREAKTHROUGH: our forces take ${cells.length} cells ${c.at(at)}` : `FRONT BROKEN: ${cells.length} cells lost ${c.at(at)}`,
    });
  }
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}
