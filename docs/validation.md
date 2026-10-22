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

Measured on 2026-10-22 on the L1 branch, which is integration commit 2216910 plus the L1 land calibration (commits 3499151, ec2ae5e and d2dfb9d). Command: `npx tsx src/cli/validate.ts --cases karabakh-2020,kursk-2024,sindoor-2025,twelve-day-war-2025,ukraine-2026-60d,baltic-2027-21d --workers 2 --json`, 8 runs per case, seeds 1-4, tagged params by Latin hypercube with sample seed 1. The six-case run is from ec2ae5e. The `kursk-2024` rows are from a rerun of that case at d2dfb9d, which changes only that case's setup.

`[T]` marks an observable the engine was tuned on. `[C]` would mark a range only combatant claims back; no question needs it yet. Brier 0.003 means all 8 runs landed in range, 0.892 means none did.

| Case | Question | Observed | Model p10 / p50 / p90 | Baseline Brier | Model Brier | Beats baseline |
| --- | --- | --- | --- | --- | --- | --- |
| `karabakh-2020` | `cells_taken` | 1.0 | 0.00 / 2.5 / 5.0 | 0.892 | 0.892 | no |
| `karabakh-2020` | `armenia_taken` | 0.00 | 0.00 / 0.00 / 0.30 | 0.003 | 0.028 | no |
| `karabakh-2020` | `south_taken` | 1.0 | 0.00 / 0.00 / 1.0 | 0.892 | 0.373 | yes |
| `karabakh-2020` | `stepanakert_held` | 1.0 | 0.00 / 0.00 / 1.0 | 0.003 | 0.373 | no |
| `karabakh-2020` | `casualty_ratio` | 1.3-1.7 | 0.62 / 1.3 / 1.7 | 0.892 | 0.373 | yes |
| `karabakh-2020` | `tank_ratio` | 3.3-4.9 | 11 / 16 / 42 | 0.892 | 0.892 | no |
| `karabakh-2020` | `others_join` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `kursk-2024` | `ukr_ground_km2` | 800-1,300 | 1,153 / 1,779 / 2,364 | 0.892 | 0.892 | no |
| `kursk-2024` | `nuclear_use` [T] | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `sindoor-2025` | `territory` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `sindoor-2025` | `land_casualties` | 0.00-300 | 42 / 89 / 252 | 0.003 | 0.028 | no |
| `sindoor-2025` | `ind_aircraft_lost` | 2.0-5.0 | 0.00 / 0.00 / 1.0 | 0.892 | 0.892 | no |
| `sindoor-2025` | `ind_strikes_land` | 1.0 or more | 122 / 196 / 228 | 0.892 | 0.003 | yes |
| `sindoor-2025` | `warships_lost` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `sindoor-2025` | `nuclear_use` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `twelve-day-war-2025` | `irn_bm_fired` [T] | 500-600 | 317 / 360 / 405 | 0.892 | 0.892 | no |
| `twelve-day-war-2025` | `bm_intercepted` | 0.80-0.90 | 0.90 / 0.96 / 0.97 | 0.892 | 0.694 | yes |
| `twelve-day-war-2025` | `isr_aircraft_lost` | 0.00 | 10 / 16 / 22 | 0.003 | 0.892 | no |
| `twelve-day-war-2025` | `usa_aircraft_lost` | 0.00 | 0.70 / 5.0 / 16 | 0.003 | 0.694 | no |
| `twelve-day-war-2025` | `isr_civilians_killed` | 16-64 | 15 / 22 / 80 | 0.892 | 0.077 | yes |
| `twelve-day-war-2025` | `us_enters` [T] | 1.0 | 1.0 / 1.0 / 1.0 | 0.892 | 0.003 | yes |
| `twelve-day-war-2025` | `others_join` | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `ukraine-2026-60d` | `rus_net_cells` [T] | 0.00-2.0 | 0.00 / 0.00 / 0.25 | 0.003 | 0.003 | no |
| `ukraine-2026-60d` | `rus_km2_per_year` [T] | 3,500-5,000 | 7,549 / 13,173 / 18,146 | 0.892 | 0.892 | no |
| `ukraine-2026-60d` | `rus_casualties_per_day` [T] | 500-2,000 | 1,248 / 1,564 / 1,873 | 0.892 | 0.003 | yes |
| `ukraine-2026-60d` | `ukr_minus_rus_casualties` [T] | below 0 | -884 / -666 / -371 | 0.892 | 0.003 | yes |
| `ukraine-2026-60d` | `rus_tanks_per_day` [T] | 2.0-8.0 | 3.1 / 4.7 / 6.7 | 0.892 | 0.003 | yes |
| `ukraine-2026-60d` | `ukr_tanks_per_day` [T] | 0.50-8.0 | 3.7 / 4.4 / 6.3 | 0.892 | 0.003 | yes |
| `ukraine-2026-60d` | `ukr_minus_rus_tanks` [T] | below 0 | -1.1 / -0.14 / 0.97 | 0.892 | 0.250 | yes |
| `ukraine-2026-60d` | `capitulations` [T] | 0.00 | 0.00 / 0.00 / 0.00 | 0.003 | 0.003 | no |
| `baltic-2027-21d` | `baltic_cells` [T] | 1.0-6.0 | 0.18 / 1.4 / 2.1 | 0.892 | 0.077 | yes |

Of the 19 questions not tuned on, the model beats the naive baseline on 5 and ties on 9. On the other 5 the baseline wins.

## What the scores say

Each finding is an engine result, not a harness choice. Units that own the engine should treat them as leads. None was tuned away here.

- **Ground advances still run about three times too fast in area** (`ukraine-2026-60d`, `rus_km2_per_year`). The median run takes Ukrainian ground at 13,173 km2 a year (p10 7,549, p90 18,146), against 3,500-5,000 km2 in 2024-25. On integration 2216910 the median was 21,035 (p10 8,119, p90 31,446). Most of that drop came from a setup bug: 41 Ukrainian formations started inside Russian-held cells, so the line they should have held was a token garrison. The rest of the gap is Ukraine's land AI, which stops sending reinforcements to a sector once the sector's total is met, even when single cells stay far short of it. See [Calibration](calibration.md#l1-the-ground-war-starts-on-the-right-side-of-the-line).
- **Kursk 2024 overshoots** (`kursk-2024`). Ukraine holds or has pushed across 1,779 km2 by day 21 in the median run (p10 1,153, p90 2,364) against 800-1,300 km2. On 2216910 it was 1,920 (p10 983, p90 3,674). The spread narrowed because the case no longer lets Ukraine's land AI attack across the rest of the border. The advance itself still does not culminate early enough.
- **The Karabakh line holds too well, and Azerbaijan loses too few tanks** (`karabakh-2020`). Azerbaijan takes 0-5 cells of the 1994 line (median 2.5) and none of Armenia proper. The real war took the south and Shusha. Stepanakert falls in most runs. With the Artsakh army's own armour added, the casualty ratio lands in the observed range at the median (1.3 against 1.3-1.7). The tank ratio is now 16 against 4.1. In seed 1, Armenia loses 149 tanks against Oryx's 255, and Azerbaijan loses 8 against Oryx's 62. The tank ratio on 2216910 (6.7) was nearer the record only because Armenia had too few tanks to lose (62 lost, against 12 Azerbaijani).
- **India loses no aircraft in a limited war** (`sindoor-2025`). The four-day ground war now stays within the casualty range (median 89), and no warships are lost. India loses no aircraft, where it lost two to five.
- **The Twelve-Day War loses too many aircraft and fires too few missiles** (`twelve-day-war-2025`). Interception now runs 90-97%, just above the 80-90% range. The model loses 10-22 Israeli crewed aircraft where none were lost, and Iran fires about 360 ballistic missiles against about 550.
- **The tuned bands hold at the median.** Russian tank losses run 3.1-6.7 a day (p10-p90), inside the 2-8 band. Russian casualties run 1,248-1,873 a day, inside 500-2,000. The `rus_km2_per_year` band is the one tuned band the ensemble misses.

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
