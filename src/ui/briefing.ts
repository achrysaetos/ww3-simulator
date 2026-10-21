/**
 * Scenario briefings, objectives and the end of the game. Objectives are read off the
 * client's mirror of the World each tick: who holds a handful of named places, and which
 * nations have capitulated. The game ends in defeat when the player's nation capitulates
 * or collapses, and in victory when every nation it fought has capitulated to it or made
 * peace while the player holds its objectives.
 */
import type { GameMap } from '../core/map';
import type { NationId, NodeId } from '../core/types';
import { NO_NATION, type ClientState } from './snapshot';

interface Place { name: string; lat: number; lon: number }
interface SideBrief {
  /** The situation and the player's aims, in a few sentences. */
  text: string;
  hold?: Place[];
  take?: Place[];
}

const P = (name: string, lat: number, lon: number): Place => ({ name, lat, lon });
const KYIV = P('Kyiv', 50.45, 30.52), KHARKIV = P('Kharkiv', 49.99, 36.23), ZAPORIZHZHIA = P('Zaporizhzhia', 47.84, 35.14), KRAMATORSK = P('Kramatorsk', 48.72, 37.56), ODESA = P('Odesa', 46.48, 30.72);
const TAIPEI = P('Taipei', 25.03, 121.56), KAOHSIUNG = P('Kaohsiung', 22.63, 120.3);
const TALLINN = P('Tallinn', 59.44, 24.75), RIGA = P('Riga', 56.95, 24.11), VILNIUS = P('Vilnius', 54.69, 25.28), WARSAW = P('Warsaw', 52.23, 21.01), NARVA = P('Narva', 59.38, 28.19);
const SEOUL = P('Seoul', 37.57, 126.98), PYONGYANG = P('Pyongyang', 39.03, 125.75);
const TEL_AVIV = P('Tel Aviv', 32.08, 34.78), JERUSALEM = P('Jerusalem', 31.77, 35.21);
const DELHI = P('Delhi', 28.61, 77.21), LAHORE = P('Lahore', 31.55, 74.34), ISLAMABAD = P('Islamabad', 33.68, 73.05);

const NO_FIRST_USE = 'Nuclear weapons are under your control alone; their first use invites retaliation from every nuclear power allied to the target.';

/** Briefings by scenario, then by the nation played; `*` covers every other nation. */
const BRIEFINGS: Record<string, Record<string, SideBrief>> = {
  'ukraine-2026': {
    UKR: { text: 'Russia keeps attacking along the late-2025 line, heaviest in the Donbas and toward Zaporizhzhia. Your army is outnumbered and short of shells. Hold the cities, keep the front from breaking, and make the war too costly for Russia to continue.', hold: [KYIV, KHARKIV, ZAPORIZHZHIA, KRAMATORSK, ODESA] },
    RUS: { text: 'The war of attrition goes on with no ceasefire. Take the rest of Donetsk oblast and Zaporizhzhia, and push Ukraine toward capitulation before your own war economy runs down.', take: [KRAMATORSK, ZAPORIZHZHIA] },
  },
  'taiwan-2027': {
    CHN: { text: 'The PLA moves to take Taiwan by force. Win the strait, land, and take Taipei before the United States and Japan decide to intervene. Every lodgement has to be supplied across the strait.', take: [TAIPEI, KAOHSIUNG] },
    TWN: { text: 'China has begun the invasion. Hold the beaches and the capital until help arrives, if it arrives.', hold: [TAIPEI, KAOHSIUNG] },
    '*': { text: 'China moves on Taiwan. Whether you intervene is your government\'s decision: a treaty call will pause the game and ask you.', hold: [TAIPEI] },
  },
  'baltic-2027': {
    RUS: { text: 'Strike the Baltic states before NATO reinforces them, and hold what you take. Article 5 will bring the alliance in.', take: [TALLINN, RIGA, VILNIUS] },
    '*': { text: 'Russia has attacked the Baltic states. Hold the capitals and decide how far the alliance goes.', hold: [TALLINN, RIGA, VILNIUS, NARVA] },
  },
  'korea-2027': {
    PRK: { text: 'Attack across the DMZ under your nuclear umbrella and take Seoul before the US reinforces the peninsula.', take: [SEOUL], hold: [PYONGYANG] },
    '*': { text: 'North Korea has attacked across the DMZ. Seoul is 50 km from the border. Hold it.', hold: [SEOUL] },
  },
  'gulf-2027': {
    IRN: { text: 'Open war with Israel, with the Strait of Hormuz as your lever over everyone else.' },
    '*': { text: 'Iran and Israel are at open war, and the Strait of Hormuz is in play.', hold: [TEL_AVIV, JERUSALEM] },
  },
  'south-asia-2027': {
    PAK: { text: 'India has gone to war after a terror attack. Hold Lahore and the capital; both sides have nuclear weapons.', hold: [LAHORE, ISLAMABAD] },
    '*': { text: 'A terror attack has escalated into full war between two nuclear powers.', hold: [DELHI] },
  },
  'ww3-2027': {
    USA: { text: 'China, Russia, North Korea and Iran have attacked at once: Taiwan, the Baltics and Poland, South Korea and Israel. Treaty calls will pause the game for your answer. Decide where to fight, move forces across two oceans, and keep the allies standing.', hold: [TALLINN, RIGA, VILNIUS, WARSAW, SEOUL, TAIPEI] },
    CHN: { text: 'Take Taiwan while the United States is pulled in four directions.', take: [TAIPEI] },
    RUS: { text: 'Strike the Baltics and Poland while NATO is split between theatres.', take: [TALLINN, RIGA, VILNIUS] },
    '*': { text: 'Coordinated offensives on four fronts test every alliance at once.' },
  },
  'peace-2027': {
    '*': { text: 'Every military in the world at its 2025-26 order of battle, at peace. Declare any war you like from the Nation tab; nothing happens until you do.' },
  },
};

export interface Objective { label: string; met: boolean }
export type Outcome = { kind: 'victory' | 'defeat' | 'peace'; text: string };

export interface Briefing { text: string; reminder: string; hold: { place: Place; node: NodeId }[]; take: { place: Place; node: NodeId }[] }

export function briefingFor(map: GameMap, scenario: string, nation: NationId): Briefing {
  const side = BRIEFINGS[scenario]?.[nation] ?? BRIEFINGS[scenario]?.['*'] ?? { text: 'Command your nation through the crisis.' };
  const at = (p: Place) => ({ place: p, node: map.nodeAt(p.lat, p.lon) });
  return { text: side.text, reminder: NO_FIRST_USE, hold: (side.hold ?? []).map(at), take: (side.take ?? []).map(at) };
}

/** Who holds a node, by nation id. */
function holder(state: ClientState, nationIds: readonly NationId[], node: NodeId): NationId | null {
  const i = state.control[node];
  return i === NO_NATION ? null : nationIds[i];
}

/** Objectives and their state now. A held place counts while it is in the hands of the player or anyone not at war with them. */
export function objectives(state: ClientState, nationIds: readonly NationId[], b: Briefing, nation: NationId, enemies: readonly NationId[], everEnemies: ReadonlySet<NationId>): Objective[] {
  const out: Objective[] = [];
  for (const { place, node } of b.hold) {
    const h = holder(state, nationIds, node);
    out.push({ label: `Hold ${place.name}`, met: h !== null && !enemies.includes(h) });
  }
  for (const { place, node } of b.take) out.push({ label: `Take ${place.name}`, met: holder(state, nationIds, node) === nation });
  for (const e of everEnemies) {
    const s = state.nations.get(e)?.status;
    out.push({ label: `Force ${state.nations.get(e)?.name ?? e} to capitulate or make peace`, met: s === 'capitulated' || s === 'collapsed' || !enemies.includes(e) });
  }
  return out;
}

/** The game's end, once reached; null while it is still being decided. */
export function outcome(state: ClientState, nation: NationId, enemies: readonly NationId[], everEnemies: ReadonlySet<NationId>, met: readonly Objective[]): Outcome | null {
  const me = state.nations.get(nation);
  if (!me) return null;
  if (me.status === 'capitulated' || me.status === 'collapsed') return { kind: 'defeat', text: `${me.name} has ${me.status === 'collapsed' ? 'collapsed' : 'capitulated'}.` };
  if (!everEnemies.size || enemies.length) return null;
  const beaten = [...everEnemies].filter((e) => ['capitulated', 'collapsed'].includes(state.nations.get(e)?.status ?? ''));
  const names = (ids: NationId[]) => ids.map((e) => state.nations.get(e)?.name ?? e).join(', ');
  const placesHeld = met.filter((o) => !o.label.startsWith('Force ')).every((o) => o.met);
  if (beaten.length === everEnemies.size || (beaten.length && placesHeld)) return { kind: 'victory', text: beaten.length ? `${names(beaten)} capitulated.` : 'Your enemies have made peace on your terms.' };
  return { kind: 'peace', text: placesHeld ? 'The war is over, and you hold your objectives.' : 'The war ended in a negotiated peace short of your objectives.' };
}
