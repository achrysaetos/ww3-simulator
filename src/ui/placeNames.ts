/**
 * Display spellings for city names the map data carries in an older or misspelled form. Ukrainian
 * places use the official romanisation the Ukrainian government adopted in 2010 (Kyiv, not Kiev),
 * as Natural Earth's own Ukrainian labels and the press now do.
 */
const SPELLING: Readonly<Record<string, string>> = {
  Kiev: 'Kyiv',
  Lvov: 'Lviv',
  Odessa: 'Odesa',
  Kharkov: 'Kharkiv',
  Nikolayev: 'Mykolaiv',
  Zaporozhye: 'Zaporizhzhia',
  Dnepropetrovsk: 'Dnipro',
  Lugansk: 'Luhansk',
  Chernigov: 'Chernihiv',
  Rovno: 'Rivne',
  Zhitomir: 'Zhytomyr',
  Vinnitsa: 'Vinnytsia',
  Ternopol: 'Ternopil',
  Kirovograd: 'Kropyvnytskyi',
  Sevastapol: 'Sevastopol',
};

export const cityName = (raw: string): string => SPELLING[raw] ?? raw;

/** Everyday names for nations whose ISO name reads like a form field: "South Korea", not "Korea, Republic of". */
const NATION: Readonly<Record<string, string>> = {
  KOR: 'South Korea', PRK: 'North Korea', MDA: 'Moldova', SYR: 'Syria', LAO: 'Laos', FSM: 'Micronesia', VAT: 'Vatican', BRN: 'Brunei',
};

export const nationName = (id: string, iso: string | undefined): string => NATION[id] ?? iso ?? id;
