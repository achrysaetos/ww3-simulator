/**
 * Who a state can call up in war. The economy sizes each nation's draft pool from these:
 * men in the liable age band, less those it cannot take, less those it already has or lost.
 */
export interface DraftLaw {
  /** Youngest and oldest men liable to wartime call-up. */
  ages: [number, number];
  /** Share of liable men who cannot be taken: unfit, reserved for war industry, deferred, abroad, evading. */
  unavailable: number;
  /** Men taken from the pool before the scenario opens and lost to it for good: killed, invalided out. */
  priorLosses: number;
  source: string;
}

/**
 * A general mobilization law: men 18-50, as the USSR (to 55) and Germany (17-50) reached
 * in WWII. About 30% are unfit or reserved: the US rejected ~30% of men examined for WWII
 * service and deferred war workers on top (Selective Service, 1948; est.).
 */
export const DEFAULT_DRAFT_LAW: DraftLaw = { ages: [18, 50], unavailable: 0.3, priorLosses: 0, source: 'est.' };

export const DRAFT_LAWS: Record<string, DraftLaw> = {
  UKR: {
    // Law 3633-IX (April 2024) lowered the mobilization age from 27 to 25; liability ends at 60.
    ages: [25, 60],
    // Judgment fitted to the ~25-35k a month the MoD calls up: workers reserved for critical
    // industry and the state, adult men among the ~4.3M Ukrainians under EU temporary
    // protection (Eurostat 2025), the unfit, deferments for families and carers, and evasion.
    unavailable: 0.53,
    // Judgment: WSJ (Sept 2024) put Ukraine at ~80k killed and ~400k wounded; most wounded return.
    priorLosses: 300_000,
    source: 'Law of Ukraine 3633-IX; Ukrainian MoD 2024; Eurostat; WSJ Sept 2024',
  },
};
