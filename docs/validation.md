# Validation status

This page says what the simulator's numbers have been checked against, and how far to trust each kind of output. It covers issue #2, sections 2 and 8. For how params and ensembles work, see [Calibration knobs and ensembles](calibration.md).

## Tuned is not validated

A realism band (`tests/*.realism.test.ts`) is a check that the model lands near a published figure. Almost every ground band was also used to set the constants that make it pass: the front law, kill-zone and firepower constants were adjusted until Ukraine 2022-25 came out right. A band that passes therefore means "tuned". It does not mean the model would have predicted the outcome.

A model is validated on a case only when three things hold:

1. Nothing in the engine was fitted to the case.
2. The outcome is compared with what happened, with sources.
3. The model does better than a naive forecast, such as "nothing changes".

`npm run validate` does this for four modern cases. The model beats the naive forecast on 5 of their 19 untuned questions today (see [Current scores](#current-scores)).

## What each kind of output is worth

| Output | Status | Why |
| --- | --- | --- |
| Ground war in Ukraine, 21-90 days: cells taken, casualty and tank loss rates | Tuned | The ground constants are fitted to Ukraine 2022-25. Since this unit the bands are checked over an 8-run ensemble, not single seeds. |
| Russian ground gained in Ukraine, km2 | Tuned and off | The 0-2 cell band passes, but the model moves 20-30 times more ground than ISW and DeepState report. See `rus_km2_per_year` below. |
| Missile and drone volumes, interception rates, Ukraine and Iran-Israel | Tuned | Interceptor kill probabilities and the salvo rules cite the 2022-25 Ukrainian tallies and the April and October 2024 Iran-Israel exchanges. |
| A full Israel-Iran war, 12 days | Held out, fails | The Twelve-Day War case misses interception, aircraft losses and civilian deaths. It is right only that nobody else joins. |
| A short India-Pakistan crisis | Held out, fails | The engine has no limited war. It opens a full war and sinks Pakistan's navy in four days. |
| A breakthrough against a thin defence (Kursk 2024) | Held out, overshoots | The median run takes about 1.5 to 2.5 times the ground Ukraine took, and the spread is wide. |
| A frontal offensive against a fortified line (Karabakh 2020) | Held out, mostly fails | The model gets the southern collapse and roughly the loss ratios, but also takes Stepanakert, the north, and part of Armenia proper. |
| Baltic, Korea and Taiwan war outcomes | Judgment only | No historical case exists. The bands come from wargames (RAND, CSIS) and set the AI's culmination and attack ratio. |
| Multi-theatre and world-war outcomes | Never validated | No case, no band. |
| Nuclear escalation | Never validated | Thresholds come from doctrine. No case has tested the ladder. |
| Diplomacy beyond who joins a war | Never validated | Coalition entry has bands. Peace terms, war aims and settlements have none. |
| Anything past 90 days | Never validated | No band or case runs longer than 90 days. Production races need 3-5 year runs; see [Calibration knobs and ensembles](calibration.md#long-horizons-are-out-of-reach-today). |
| Economy, GDP and energy prices | Tuned | The elasticities are hand-fit and tagged `judgment` or `contested`. |

## The held-out cases

Each case lives in `src/validation/cases/`. A case builds a probe world from an existing scenario, moved to the event's date. It names every engine constant, band or AI rule that cites the event, and it lists the questions it scores. Each question carries an observed range with its sources.

| Case | Provenance | Built from | What the engine cannot represent |
| --- | --- | --- | --- |
| `karabakh-2020`, Second Nagorno-Karabakh War, 44 days | Held out. Only a catalog comment on the TB2 mentions it. | `peace-2027` with the 1994-2020 line drawn and four Armenian corps dug in | 2025 orders of battle, half-degree cells (Shusha and Stepanakert share one), and the 2021 Turkey-Azerbaijan pact in static alliance data |
| `kursk-2024`, Kursk incursion, 21 days | Partly tuned. The breakthrough rate and culmination depth cite Kursk's first days. | `ukraine-2026` with the 2025 Russian reinforcements moved off and six Ukrainian brigades ordered across | The 2025 front everywhere else. The plan is given, not chosen by the AI. |
| `sindoor-2025`, Operation Sindoor, 4 days | Partly tuned. India's strategic profile and the India-Pakistan opinion cite it. | `south-asia-2027` | A limited war and the political decision to stop |
| `twelve-day-war-2025`, Israel-Iran, 12 days | Partly tuned. The missile count, the salvo rules and US entry cite it. Iran's order of battle has the war's losses taken off already. | `gulf-2027` | Israel striking first, and the ceasefire |

These cases were left out:

- **Red Sea 2023-25.** `NEUTRAL_DISRUPTION` in `src/systems/naval/blockade.ts` is fitted to the two-thirds drop in Suez transits, so the case is tuned on. The Houthis are also not an actor: Yemen gets a generated state army.
- **Iran-Israel, April and October 2024.** Interceptor kill probabilities cite both salvos and `raidWindowS` cites October. A single salvo is also not something the war-scale AI does.
- **WWII cases.** The catalog has no period weapons (decided in the plan for this work).

Every question records which observable it tests. A question marked `[T]` in the table tests an observable the engine was tuned on, and it does not count as validation. Questions are also not "known at the time": each case starts from 2025 orders of battle and today's data, so none is a true out-of-sample forecast.

## How a question is scored

Each case runs 8 times: seeds 1-4 across a Latin hypercube of every `estimated`, `judgment` and `contested` param. Each question asks whether the outcome lands in the observed range, which by definition it did.

- The model's probability is the share of runs in the range, smoothed to (k + 0.5) / (n + 1). Eight runs say at most 94% and at least 6%.
- The baseline is a point forecast scored as an ensemble of the same size that always gives that point. Usually it is persistence: the front stays put, nobody dies, nobody joins. Where persistence has no meaning, the case states its naive forecast, for example "an even exchange" for a loss ratio.
- Both are scored by Brier score, (1 - p)^2, and log score. The model "beats" the baseline only with a strictly lower Brier score, so it must land more runs in range than the baseline does.

The scores are printed, never asserted. Other units are changing the engine, and a hard-coded pass mark would block them or rot. Rerun `npm run validate` and compare with the table below.

## Current scores

Measured on 2026-10-22 at commit 7ddb19b, which includes integration commit 6323589 (A1, B3, B4 and D3 merged). Command: `npx tsx src/cli/validate.ts --cases karabakh-2020,kursk-2024,sindoor-2025,twelve-day-war-2025,ukraine-2026-60d,baltic-2027-21d --workers 2 --json`, 8 runs per case, seeds 1-4, tagged params by Latin hypercube with sample seed 1.

`[T]` marks an observable the engine was tuned on. `[C]` would mark a range only combatant claims back; no question needs it yet. Brier 0.003 means all 8 runs landed in range, 0.892 means none did.

| Case | Question | Observed | Model p10 / p50 / p90 | Baseline Brier | Model Brier | Beats baseline |
| --- | --- | --- | --- | --- | --- | --- |
| `karabakh-2020` | `cells_taken` | 1.0 | 5.0 / 5.0 / 5.0 | 0.892 | 0.892 | no |
| `karabakh-2020` | `armenia_taken` | 0.00 | 12 / 12 / 13 | 0.003 | 0.892 | no |
| `karabakh-2020` | `south_taken` | 1.0 | 1.0 / 1.0 / 1.0 | 0.892 | 0.003 | yes |
| `karabakh-2020` | `stepanakert_held` | 1.0 | 0.00 / 0.00 / 0.00 | 0.003 | 0.892 | no |
| `karabakh-2020` | `casualty_ratio` | 1.3-1.7 | 1.3 / 2.0 / 4.8 | 0.892 | 0.522 | yes |
| `karabakh-2020` | `tank_ratio` | 3.3-4.9 | 2.7 / 5.5 / 27 | 0.892 | 0.522 | yes |
| `karabakh-2020` | `others_join` | 0.00 | 0.00 / 0.00 / 1.0 | 0.003 | 0.077 | no |
| `kursk-2024` | `ukr_ground_km2` | 800-1,300 | 710 / 1,959 / 3,453 | 0.892 | 0.694 | yes |
| `kursk-2024` | `nuclear_use` [T] | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `sindoor-2025` | `territory` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `sindoor-2025` | `land_casualties` | 0.00-300 | 5,173 / 6,541 / 10,841 | 0.003 | 0.892 | no |
| `sindoor-2025` | `ind_aircraft_lost` | 2.0-5.0 | 0.00 / 0.00 / 0.00 | 0.892 | 0.892 | no |
| `sindoor-2025` | `ind_strikes_land` | 1.0 or more | 0.00 / 0.00 / 1.3 | 0.892 | 0.373 | yes |
| `sindoor-2025` | `warships_lost` | 0.00 | 15 / 16 / 16 | 0.003 | 0.892 | no |
| `sindoor-2025` | `nuclear_use` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `twelve-day-war-2025` | `irn_bm_fired` [T] | 500-600 | 214 / 227 / 234 | 0.892 | 0.892 | no |
| `twelve-day-war-2025` | `bm_intercepted` | 0.80-0.90 | 0.41 / 0.41 / 0.44 | 0.892 | 0.892 | no |
| `twelve-day-war-2025` | `isr_aircraft_lost` | 0.00 | 3.0 / 4.5 / 7.6 | 0.003 | 0.892 | no |
| `twelve-day-war-2025` | `usa_aircraft_lost` | 0.00 | 30 / 42 / 47 | 0.003 | 0.892 | no |
| `twelve-day-war-2025` | `isr_civilians_killed` | 16-64 | 294 / 314 / 345 | 0.892 | 0.892 | no |
| `twelve-day-war-2025` | `us_enters` [T] | 1.0 | 1.0 / 1.0 / 1.0 | 0.892 | 0.003 | yes |
| `twelve-day-war-2025` | `others_join` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `ukraine-2026-60d` | `rus_net_cells` [T] | 0.00-2.0 | 0.25 / 1.1 / 3.1 | 0.003 | 0.077 | no |
| `ukraine-2026-60d` | `rus_km2_per_year` [T] | 3,500-5,000 | 47,594 / 113,790 / 227,303 | 0.892 | 0.892 | no |
| `ukraine-2026-60d` | `rus_casualties_per_day` [T] | 500-2,000 | 791 / 1,681 / 2,251 | 0.892 | 0.077 | yes |
| `ukraine-2026-60d` | `ukr_minus_rus_casualties` [T] | below 0 | -1,335 / -780 / -228 | 0.892 | 0.003 | yes |
| `ukraine-2026-60d` | `rus_tanks_per_day` [T] | 2.0-8.0 | 2.1 / 7.1 / 15 | 0.892 | 0.250 | yes |
| `ukraine-2026-60d` | `ukr_tanks_per_day` [T] | 0.50-8.0 | 2.6 / 3.6 / 4.2 | 0.892 | 0.003 | yes |
| `ukraine-2026-60d` | `ukr_minus_rus_tanks` [T] | below 0 | -12 / -3.3 / 0.42 | 0.892 | 0.077 | yes |
| `ukraine-2026-60d` | `capitulations` [T] | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `baltic-2027-21d` | `baltic_cells` [T] | 1.0-6.0 | 2.4 / 3.2 / 3.9 | 0.892 | 0.003 | yes |

Of the 19 questions not tuned on, the model beats the naive baseline on 5 and ties on 7. On the other 7 the baseline wins.

## What the scores say

Each finding is an engine result, not a harness choice. Units that own the engine should treat them as leads. None was tuned away here.

- **Ground advances run 20-30 times too fast in area** (`ukraine-2026-60d`, `rus_km2_per_year`). The median run takes Ukrainian ground at 113,790 km2 a year, against 3,500-5,000 km2 in 2024-25. A default run (seed 1) after 30 days has Russia pushing into 16 Ukrainian cells at once, 7.8 km deep on average and 20-33 km deep on the busiest three. A half-degree cell is about 45 km wide, so each push stands for 45 km of front. This answers the calibration lead in A3's report: the `ground_km2` metric reads the model correctly, and the model is wrong. The 0-2 cell band misses it because a cell changes hands only when a push crosses all of it.
- **Kursk 2024 overshoots** (`kursk-2024`). Ukraine holds or has pushed across 1,959 km2 by day 21 in the median run (p10 710, p90 3,453) against 800-1,300 km2. One run of eight took nothing. The Russian reaction is slow and the advance does not culminate.
- **The Karabakh defence collapses everywhere** (`karabakh-2020`). Azerbaijan takes all five cells of the 1994 line in every run, Stepanakert included, and 12 cells of Armenia proper, where the real war took the south and Shusha and stopped. The engine has no war aim smaller than conquest. Turkey joins under the 2021 pact in two runs of eight. The loss ratios land near the observed ones in a quarter of the runs.
- **A limited war cannot be represented** (`sindoor-2025`). In four days the model fights a ground war with about 6,500 casualties, sinks about 16 warships and patrol craft (mostly Pakistan's), and loses no Indian aircraft. The real crisis had 21 military dead, no naval action and two to five Indian jets lost.
- **Iranian ballistic missiles get through four times too often** (`twelve-day-war-2025`). Israel and its partners shoot down 41% of Iran's ballistic missiles, against 80-90%. The model also loses 4-5 Israeli and about 40 US crewed aircraft where none were lost, and kills about 310 Israeli civilians against 32. Iran fires 227 ballistic missiles in 12 days against about 550, even though the salvo rules cite the 550; the order of battle has Iran's war losses removed already.
- **The tuned bands hold over the ensemble, but with wide tails.** Every converted band passes at the median. The tails show what single seeds hid: Russian tank losses run 2.1-15 a day (p10-p90) against a 2-8 band, and Russian casualties reach 2,251 a day at p90 against a 2,000 ceiling.

## False precision

- Outputs such as "3,000,000 shells", Exocet-equivalent hits, per-class loss shares and casualty counts to the person look exact. They rest on estimates and judgment params. Quote a spread from `npm run ensemble`, never one run.
- Eight runs is a small ensemble. A p10 or p90 from 8 runs moves a lot when a run is added. Treat it as "about this wide".
- Wide bands are easy to pass. A band such as 500-2,000 casualties a day is met by many wrong models. The km2 question above is an example: the cell band passes while the area is off by a factor of ten.
- Cells are half a degree on the hot fronts and a full degree elsewhere, about 1,900 to 12,000 km2. A front that moved 5 km is inside one cell. Read `ground_km2` and `advance_km` for small moves, and remember that they read contest progress as an advance across the full cell width.

## Combatant claims

Many anchors are claims by a party to the war. The cases tag every source `independent`, `official` or `combatant`, and the table marks a question `[C]` when only combatant claims back its range.

- Ukrainian and Russian interception rates, drone-loss shares and enemy-casualty counts are combatant claims. The Ukraine missile and drone bands in `tests/realism-air.realism.test.ts` rest on Ukrainian Air Force tallies.
- The Israeli 86% interception rate in June 2025 is a combatant claim. The Telegraph's radar and satellite analysis (about 84%) agrees with it.
- Pakistani claims of six Indian jets and Indian claims about Pakistani losses in May 2025 are combatant claims. The `sindoor-2025` range for Indian losses (2-5) rests on US and French officials and the Washington Quarterly instead.
- Azerbaijani claims of over 5,000 Armenian dead are a combatant claim. They set the top of the `karabakh-2020` casualty-ratio range. Each side's count of its own dead is tagged `official`.

## Rerun the scores

To score every held-out case, run:

```sh
npm run validate -- --workers 2
```

The four held-out cases took 146 seconds on two workers. With both band cases added, through `--cases karabakh-2020,kursk-2024,sindoor-2025,twelve-day-war-2025,ukraine-2026-60d,baltic-2027-21d`, the run took 16 minutes on a loaded four-core machine. Add `--json` for every run's value. To check the ensemble bands as tests, run `REALISM=1 npx vitest run tests/realism-ground.realism.test.ts`.

To add a case, write a `ValidationCase` in `src/validation/cases/`, list it in `CASES` in `src/validation/cases/index.ts`, and cite a source for every observed range. `tests/validation/cases.test.ts` checks that every question has a source and a baseline.
