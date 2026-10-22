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
