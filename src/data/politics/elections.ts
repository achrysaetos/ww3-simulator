/**
 * National elections between 2026 and 2028 that can change who decides on war and aid: the
 * vote that forms the government, or for a president-led state the presidential vote and the
 * legislature that funds it. Local and second-chamber elections that cannot remove the
 * executive are left out. Dates fixed by law or already announced are given as such; dates
 * marked (est.) follow the constitutional calendar and may move by weeks.
 *
 * Ukraine holds no elections under martial law (Law 389-VIII, Art. 19), so it has no entry.
 */
export interface Election {
  nation: string;
  /** Polling day, UTC midnight. */
  date: string;
  kind: 'presidential' | 'legislative' | 'general';
  note: string;
}

const E = (nation: string, date: string, kind: Election['kind'], note: string): Election => ({ nation, date: `${date}T00:00:00Z`, kind, note });

export const ELECTIONS: readonly Election[] = [
  E('HUN', '2026-04-12', 'legislative', 'National Assembly; date set by President Sulyok'),
  E('SWE', '2026-09-13', 'legislative', 'Riksdag; second Sunday of September'),
  E('LVA', '2026-10-03', 'legislative', 'Saeima; first Saturday of October'),
  E('ISR', '2026-10-27', 'legislative', 'Knesset; statutory date at the end of the term'),
  E('USA', '2026-11-03', 'legislative', 'midterms: all House seats and a third of the Senate, which fund aid'),
  E('DNK', '2026-10-31', 'legislative', 'Folketing; latest date of the four-year term (est.)'),
  E('EST', '2027-03-07', 'legislative', 'Riigikogu; first Sunday of March'),
  E('FIN', '2027-04-18', 'legislative', 'Eduskunta; third Sunday of April'),
  E('FRA', '2027-04-25', 'presidential', 'second round (est.; first round two weeks earlier)'),
  E('ITA', '2027-09-26', 'legislative', 'Parliament at the end of its term (est.)'),
  E('SVK', '2027-09-25', 'legislative', 'National Council at the end of its term (est.)'),
  E('POL', '2027-10-17', 'legislative', 'Sejm and Senate, autumn 2027 (est.)'),
  E('TWN', '2028-01-15', 'general', 'president and Legislative Yuan, held together in January (est.)'),
  E('KOR', '2028-04-12', 'legislative', 'National Assembly (est.)'),
  E('PHL', '2028-05-08', 'general', 'president and Congress, second Monday of May'),
  E('AUS', '2028-05-20', 'legislative', 'federal election due by mid-2028 (est.)'),
  E('LTU', '2028-10-08', 'legislative', 'Seimas (est.)'),
  E('USA', '2028-11-07', 'presidential', 'president, House and a third of the Senate'),
  E('ROU', '2028-12-06', 'legislative', 'Parliament (est.)'),
];
