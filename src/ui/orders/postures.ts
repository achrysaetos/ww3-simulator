import type { Formation, FormationKind, Posture, TargetClass } from '../../core/types';

export const GROUND_KINDS: ReadonlySet<FormationKind> = new Set(['maneuver', 'artillery', 'air_defense', 'missile', 'logistics']);

/** Which postures make sense for each formation kind, in button order. */
export const POSTURES_BY_KIND: Record<FormationKind, readonly Posture[]> = {
  maneuver: ['move', 'attack', 'defend', 'reserve'],
  artillery: ['move', 'strike', 'defend', 'reserve'],
  air_defense: ['move', 'defend', 'reserve'],
  missile: ['move', 'strike', 'defend', 'reserve'],
  air_wing: ['move', 'strike', 'air_superiority', 'patrol', 'defend', 'reserve'],
  surface_group: ['move', 'attack', 'strike', 'patrol', 'blockade', 'defend', 'reserve'],
  submarine: ['move', 'strike', 'patrol', 'blockade', 'reserve'],
  strategic: ['defend', 'reserve'],
  logistics: ['move', 'defend', 'reserve'],
  space: ['patrol', 'reserve'],
};

/** A posture in the player's words: an air wing's move is a rebase to another airfield. */
export const postureLabel = (kind: FormationKind, p: Posture): string => (kind === 'air_wing' && p === 'move' ? 'rebase' : p.replace(/_/g, ' '));

export const NEEDS_TARGET: ReadonlySet<Posture> = new Set(['move', 'attack', 'strike', 'air_superiority', 'patrol', 'blockade', 'air_assault']);

/** Postures a formation can be given: its kind's, plus an air assault for airborne troops. */
export const posturesOf = (f: Pick<Formation, 'kind' | 'airborne'>): readonly Posture[] => (f.airborne ? [...POSTURES_BY_KIND[f.kind], 'air_assault'] : POSTURES_BY_KIND[f.kind]);

/** Every target class the engine strikes, in the player's words (BB-10: power and missile targets were missing). */
export const STRIKE_CLASS_LABEL: Record<TargetClass, string> = {
  structure: 'Buildings and depots', hardened: 'Hardened sites', power: 'Power grid', missile: 'Missile launchers', soft: 'Trucks and soft vehicles',
  armor: 'Armour', infantry: 'Infantry', aircraft: 'Aircraft on the ground', helicopter: 'Helicopters', ship: 'Ships', submarine: 'Submarines',
};
