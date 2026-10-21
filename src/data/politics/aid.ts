/**
 * The domestic politics of each arms donor in src/data/industry/aid.ts. Aid is voted in
 * packages: it runs until the money appropriated for it runs out, then a new vote must pass.
 *
 * `support` is the share of the public and legislature behind the aid when the scenarios open
 * (late 2025), 0..1; a renewal passes at RENEW_AT in src/systems/politics. Estimates from
 * polling and parliamentary arithmetic:
 * - USA: Pew and Gallup 2025 put those wanting the same or more aid for Ukraine near half,
 *   and the House let the 2023 request lapse from October 2023 to April 2024.
 * - CZE: Andrej Babis won the October 2025 election promising to wind down the Czech
 *   ammunition initiative.
 * - DEU, FRA, GBR, POL: governing coalitions and majorities back continued aid (Eurobarometer
 *   and national polling, 2025).
 * - PRK: the regime decides; it ships while it is stable.
 *
 * `renews` is the budget day on which the next package must pass: the US fiscal year starts
 * on 1 October, European budgets on 1 January.
 */
export interface DonorPolitics {
  support: number;
  renews: { month: number; day: number };
}

export const DONOR_POLITICS: Record<string, DonorPolitics> = {
  USA: { support: 0.5, renews: { month: 10, day: 1 } },
  DEU: { support: 0.62, renews: { month: 1, day: 1 } },
  CZE: { support: 0.42, renews: { month: 1, day: 1 } },
  FRA: { support: 0.6, renews: { month: 1, day: 1 } },
  POL: { support: 0.6, renews: { month: 1, day: 1 } },
  GBR: { support: 0.68, renews: { month: 4, day: 1 } },
  PRK: { support: 1, renews: { month: 1, day: 1 } },
};
