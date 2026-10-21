import type { NationId } from '../../core/types';

/** The seats at the player's table. Every advisor card comes from one of them. */
export const ROLES = ['chief', 'intel', 'air', 'navy', 'economy', 'foreign', 'security'] as const;
export type Role = (typeof ROLES)[number];

export interface Look {
  skin: string;
  hair: string;
  /** Uniform or suit colour. */
  coat: string;
  /** Officers wear a peaked cap; ministers do not. */
  cap: boolean;
}

export interface Advisor {
  role: Role;
  name: string;
  title: string;
  look: Look;
}

const TITLE: Record<Role, string> = {
  chief: 'Chief of the General Staff',
  intel: 'Head of Military Intelligence',
  air: 'Air Force Commander',
  navy: 'Commander of the Navy',
  economy: 'Minister of Finance',
  foreign: 'Foreign Minister',
  security: 'National Security Adviser',
};

const RANK: Partial<Record<Role, string>> = { chief: 'Gen.', intel: 'Maj. Gen.', air: 'Lt. Gen.', navy: 'Adm.' };
const MILITARY: ReadonlySet<Role> = new Set(['chief', 'intel', 'air', 'navy']);

/**
 * Fictional people, never real officials: one invented name per seat, in ROLES order, for each
 * naming tradition. A nation without its own list borrows the closest one.
 */
const NAMES: Record<string, readonly string[]> = {
  ua: ['Taras Melnyk', 'Iryna Kovalenko', 'Andriy Savchuk', 'Oleh Tkachenko', 'Oksana Bondar', 'Dmytro Hnatyuk', 'Larysa Moroz'],
  ru: ['Viktor Sokolov', 'Yelena Orlova', 'Pavel Gromov', 'Arkady Volkov', 'Marina Zhuravleva', 'Konstantin Rudnev', 'Gennady Pankratov'],
  en: ['Margaret Hale', 'Daniel Okafor', 'Ryan Castellano', 'Susan Whitfield', 'Thomas Brandt', 'Elena Marsh', 'Robert Kincaid'],
  pl: ['Tomasz Wrona', 'Agnieszka Kalinowska', 'Marek Zielak', 'Piotr Sadowy', 'Ewa Nowicka', 'Krzysztof Bednarek', 'Joanna Lis'],
  zh: ['Zhao Liming', 'Chen Yuhua', 'Wang Jiancheng', 'Liu Haifeng', 'Sun Meiling', 'Xu Guowei', 'Lin Qiao'],
  ko: ['Park Jae-won', 'Kim Seo-yeon', 'Lee Dong-hyun', 'Choi Min-ho', 'Han Ji-woo', 'Jung Sung-min', 'Yoon Hae-jin'],
  ja: ['Takeda Hiroshi', 'Mori Ayaka', 'Sato Kenji', 'Ishikawa Ren', 'Nakamura Yui', 'Fujita Daisuke', 'Ogawa Mai'],
  in: ['Arjun Mehra', 'Kavita Rao', 'Vikram Sethi', 'Rohan Nair', 'Priya Deshpande', 'Sanjay Kulkarni', 'Meera Iyer'],
  pk: ['Farhan Qureshi', 'Ayesha Malik', 'Bilal Siddiqui', 'Usman Raza', 'Hina Baig', 'Tariq Hussain', 'Nadia Rehman'],
  he: ['Avi Ben-Haim', 'Noa Shalev', 'Eitan Rosen', 'Yoav Mizrahi', 'Tamar Levin', 'Daniel Peretz', 'Michal Adler'],
  fa: ['Reza Karimi', 'Leila Moradi', 'Hossein Tavakoli', 'Amir Rostami', 'Shirin Ahmadi', 'Mehdi Farahani', 'Parisa Nouri'],
  de: ['Klaus Brenner', 'Anja Vogt', 'Stefan Kessler', 'Jens Hartmann', 'Claudia Reuter', 'Matthias Lorenz', 'Sabine Krause'],
  fr: ['Hugo Marchand', 'Claire Dufresne', 'Julien Moreau', 'Antoine Lefèvre', 'Camille Roux', 'Mathieu Garnier', 'Élise Bonnet'],
  ar: ['Khalid Al-Hamdan', 'Rania Haddad', 'Faisal Nasser', 'Omar Saleh', 'Lina Mansour', 'Yusuf Karam', 'Huda Barakat'],
  tr: ['Murat Aksoy', 'Elif Demirtaş', 'Kerem Yalçın', 'Emre Kaplan', 'Zeynep Arslan', 'Selim Doğan', 'Ayla Korkmaz'],
};

const TRADITION: Record<string, string> = {
  UKR: 'ua', RUS: 'ru', BLR: 'ru', KAZ: 'ru',
  USA: 'en', GBR: 'en', CAN: 'en', AUS: 'en', NZL: 'en', IRL: 'en',
  POL: 'pl', CZE: 'pl', SVK: 'pl',
  CHN: 'zh', TWN: 'zh', SGP: 'zh',
  KOR: 'ko', PRK: 'ko', JPN: 'ja',
  IND: 'in', PAK: 'pk', AFG: 'pk', BGD: 'in',
  ISR: 'he', IRN: 'fa',
  DEU: 'de', AUT: 'de', CHE: 'de', NLD: 'de', DNK: 'de', NOR: 'de', SWE: 'de', FIN: 'de', EST: 'de', LVA: 'de', LTU: 'de',
  FRA: 'fr', BEL: 'fr',
  SAU: 'ar', ARE: 'ar', QAT: 'ar', IRQ: 'ar', SYR: 'ar', JOR: 'ar', LBN: 'ar', EGY: 'ar', YEM: 'ar', OMN: 'ar', KWT: 'ar', BHR: 'ar',
  TUR: 'tr', AZE: 'tr',
};

const SKINS = ['#ecc9ab', '#e2b896', '#d7a98a', '#c49a7c', '#a87a5c', '#8a5f45', '#6b4632'];
/** Which of SKINS each naming tradition draws from, as [first, count]. */
const SKIN_RANGE: Record<string, readonly [number, number]> = {
  en: [0, 7], ua: [0, 3], ru: [0, 3], pl: [0, 3], de: [0, 3], fr: [0, 5], zh: [1, 3], ko: [1, 3], ja: [1, 3],
  in: [3, 4], pk: [3, 3], he: [1, 4], fa: [2, 3], ar: [3, 3], tr: [2, 3],
};
const HAIR = ['#2b2420', '#4a3527', '#6e5a48', '#9a8c80', '#c8c2ba', '#1c1c1f'];
const UNIFORM = ['#3c4a3a', '#2f3d4f', '#3a4250', '#445038'];
const SUIT = ['#23262d', '#2d3644', '#3b3140', '#2a3a3a'];

/** A small stable hash, so a nation's table looks the same every game. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function advisorOf(nation: NationId, role: Role): Advisor {
  const tradition = TRADITION[nation] ?? 'en';
  const names = NAMES[tradition];
  const [first, count] = SKIN_RANGE[tradition];
  const i = ROLES.indexOf(role);
  const h = hash(`${nation}:${role}`);
  const military = MILITARY.has(role);
  const rank = RANK[role];
  return {
    role,
    name: rank ? `${rank} ${names[i]}` : names[i],
    title: TITLE[role],
    look: {
      skin: SKINS[first + (h % count)],
      hair: HAIR[(h >>> 4) % HAIR.length],
      coat: (military ? UNIFORM : SUIT)[(h >>> 8) % 4],
      cap: military,
    },
  };
}
