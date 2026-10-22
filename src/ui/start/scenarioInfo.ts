/**
 * What the start screen says about a scenario before any world is built: its title and year,
 * a one-line premise, how dangerous it is, who fights whom, and where on the globe it happens.
 * Pure; reads only the scenario cards the worker sends and the static map.
 */
import type { GameMap } from '../../core/map';
import type { NationId, NodeId } from '../../core/types';
import type { NationCard, ScenarioCard } from '../snapshot';

export const THREAT_LABELS = ['Tension', 'Elevated', 'High', 'Severe', 'Critical'] as const;
export interface Threat { level: 1 | 2 | 3 | 4 | 5; label: (typeof THREAT_LABELS)[number] }

export interface ScenarioInfo {
  title: string;
  year: number;
  premise: string;
  threat: Threat;
  /** "RUS ▸ UKR" per opening war, aggressor first. */
  sides: string[];
  /** Where the opening war is fought (the first target's capital), or the suggested nation's capital in peacetime. */
  theatre: { node: NodeId; name: string } | null;
}

const SHORT: Record<string, string> = { KOR: 'South Korea', PRK: 'North Korea', MDA: 'Moldova', SYR: 'Syria', LAO: 'Laos', FSM: 'Micronesia', VAT: 'Vatican', BRN: 'Brunei' };
/** A nation's everyday name, for tight labels: "South Korea", not "Korea, Republic of". */
export const shortName = (id: NationId, cards: ReadonlyMap<NationId, NationCard>) => SHORT[id] ?? cards.get(id)?.name ?? id;

const capital = (map: GameMap, id: NationId): NodeId | null => {
  const i = map.nationIds.indexOf(id);
  const cell = i < 0 ? undefined : map.data.nations[i].capital?.cell;
  return cell === undefined ? null : (cell as NodeId);
};

export function threatOf(s: Pick<ScenarioCard, 'wars' | 'belligerents'>, cards: ReadonlyMap<NationId, NationCard>): Threat {
  if (!s.wars.length) return { level: 1, label: THREAT_LABELS[0] };
  const nuclear = s.belligerents.filter((n) => (cards.get(n)?.doctrine ?? 'none') !== 'none').length;
  const level = Math.min(5, 2 + (s.wars.length > 1 ? 1 : 0) + (nuclear > 0 ? 1 : 0) + (nuclear > 1 ? 1 : 0)) as Threat['level'];
  return { level, label: THREAT_LABELS[level - 1] };
}

export function scenarioInfo(s: ScenarioCard, map: GameMap, cards: ReadonlyMap<NationId, NationCard>): ScenarioInfo {
  const year = new Date(s.startDate).getUTCFullYear();
  const title = s.name.replace(new RegExp(`,?\\s*${year}$`), '');
  const premise = s.summary.split(/(?<=\.)\s/)[0];
  const at = s.wars[0]?.[1] ?? s.suggestedNation;
  const node = capital(map, at);
  return {
    title,
    year,
    premise,
    threat: threatOf(s, cards),
    sides: s.wars.map(([a, b]) => `${a} ▸ ${b}`),
    theatre: node === null ? null : { node, name: s.wars.length ? shortName(at, cards) : 'The world' },
  };
}

/** The player's place in the opening wars, for the line under the nation picker. */
export function standing(s: Pick<ScenarioCard, 'wars'>, nation: NationId): 'Attacker' | 'Defender' | 'Not at war' {
  if (s.wars.some(([a]) => a === nation)) return 'Attacker';
  if (s.wars.some(([, t]) => t === nation)) return 'Defender';
  return 'Not at war';
}

const MAJOR_POWERS = ['USA', 'CHN', 'RUS', 'IND', 'GBR', 'FRA', 'DEU', 'JPN'] as NationId[];

/** Six nations worth offering first: the suggested one, the nations at war, then the great powers. */
export function featuredNations(s: Pick<ScenarioCard, 'suggestedNation' | 'belligerents'>, cards: ReadonlyMap<NationId, NationCard>, chosen: NationId | null, n = 6): NationId[] {
  const list = [...new Set([s.suggestedNation, ...s.belligerents, ...MAJOR_POWERS])].filter((id) => cards.has(id)).slice(0, n);
  if (chosen && cards.has(chosen) && !list.includes(chosen)) list[n - 1] = chosen;
  return list;
}

export const lonLatLabel = (lon: number, lat: number) => `${Math.abs(lat).toFixed(1)}${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}${lon >= 0 ? 'E' : 'W'}`;
