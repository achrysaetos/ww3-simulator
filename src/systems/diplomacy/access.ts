import { atWar } from '../../core/engine';
import type { NationId, World } from '../../core/types';
import { delegated } from '../orders';
import type { AirDefencePledge, DiplomacyState } from './types';
import { members, sideOf } from './wars';

/**
 * How a state helps a side without joining it: passage for an ally's troops across its land,
 * and air defence over a belligerent it backs.
 */

function setList(s: DiplomacyState, table: 'access' | 'aid', owner: NationId, list: NationId[]): void {
  const before = s[table][owner] ?? [];
  if (before.length === list.length && before.every((n, i) => n === list[i])) return;
  if (list.length) s[table][owner] = list;
  else delete s[table][owner];
  s.rev++;
}

function toggle(s: DiplomacyState, table: 'access' | 'aid', owner: NationId, other: NationId, on: boolean): void {
  const rest = (s[table][owner] ?? []).filter((n) => n !== other);
  setList(s, table, owner, on && other !== owner ? [...rest, other].sort() : rest);
}

export const setAccess = (s: DiplomacyState, host: NationId, guest: NationId, on: boolean) => toggle(s, 'access', host, guest, on);
export const setAid = (s: DiplomacyState, donor: NationId, recipient: NationId, on: boolean) => toggle(s, 'aid', donor, recipient, on);

/** Every pair that shares a defensive treaty, either way round. */
export function treatyPartners(alliances: readonly { members: Record<NationId, unknown> }[]): Map<NationId, Set<NationId>> {
  const out = new Map<NationId, Set<NationId>>();
  for (const t of alliances) {
    const ms = Object.keys(t.members) as NationId[];
    for (const a of ms) for (const b of ms) if (a !== b) (out.get(a) ?? out.set(a, new Set()).get(a)!).add(b);
  }
  return out;
}

/**
 * An AI-run host lets the troops of a treaty ally at war cross its land, unless the other side of
 * that war includes a treaty ally of its own: Germany stayed out of Iraq in 2003 yet let US forces
 * move through it, while NATO's Bulgaria would not open a road for Turkey against Greece. A host
 * fighting in the war needs no grant; its co-belligerents may already enter.
 */
export function grantAccess(world: World, s: DiplomacyState, partners: ReadonlyMap<NationId, ReadonlySet<NationId>>): void {
  for (const host of Object.keys(world.nations) as NationId[]) {
    const nation = world.nations[host];
    if (nation.status === 'capitulated' || nation.status === 'collapsed' || !delegated(world, host, 'strategic')) continue;
    const mine = partners.get(host);
    const guests = new Set<NationId>();
    if (mine)
      for (const war of s.wars) {
        if (sideOf(war, host) !== -1) continue;
        for (const side of [0, 1] as const) {
          if (members(war.sides[1 - side]).some((f) => mine.has(f))) continue;
          for (const g of members(war.sides[side])) if (mine.has(g) && !atWar(world, host, g)) guests.add(g);
        }
      }
    setList(s, 'access', host, [...guests].sort());
  }
}

/** An AI-run donor covers each state it has pledged air defence to while that state is at war, unless the donor fights on the other side. */
export function pledgeAid(world: World, s: DiplomacyState, pledges: readonly Pick<AirDefencePledge, 'donor' | 'recipient'>[]): void {
  const want = new Map<NationId, NationId[]>();
  for (const p of pledges) {
    if (!world.nations[p.donor] || !world.nations[p.recipient] || !delegated(world, p.donor, 'strategic')) continue;
    const list = want.get(p.donor) ?? want.set(p.donor, []).get(p.donor)!;
    const fighting = s.wars.some((w) => sideOf(w, p.recipient) !== -1 && sideOf(w, p.donor) !== 1 - sideOf(w, p.recipient));
    if (fighting && world.nations[p.recipient].status === 'war') list.push(p.recipient);
  }
  for (const [donor, list] of want) setList(s, 'aid', donor, [...new Set(list)].sort());
}
