# Calibration knobs and ensembles

This page explains how the simulator separates what the evidence pins down from what a modeller chose, and how one run differs from an ensemble. For what has been checked against history, see [Validation status](validation.md).

## Every outcome-deciding knob is a tagged param

A knob that decides outcomes is declared once in its system with `defineParam` (or `tableParam` for a table such as the air `TUNING` entries). Each declaration carries a default, a plausible range, a source, and one tag from `ParamTag` in `src/core/params.ts`:

| Tag | Meaning |
| --- | --- |
| `observed` | Measured directly in the cited source. |
| `estimated` | Derived from published figures with stated arithmetic. |
| `judgment` | Set by the modeller, usually to land a realism band. |
| `contested` | Published sources or schools disagree. |
| `scenario` | An assumption about the situation, not about how war works. |

`paramRegistry()` lists every param. `tests/params.test.ts` checks that each one has a source and that its range brackets its default. Run `npm run ensemble -- --scenario peace-2027 --runs 1 --json` and read the `swept` list to see the current set; it held 66 params at integration commit 6735bc9, of which 35 were judgment.

A run carries its overrides in `World.params`. The engine wraps every step in `withParams(world.params)`, so a saved run replays with the same values. Code that reads a param outside `Engine.step` sees the defaults unless it wraps itself the same way.

Many knobs are not tagged yet: the press-ratio scale in `ai/land.ts`, morale and fatigue rates, and the logistics, naval and strategic constants. A sweep cannot show their effect until they are.

## One seed is an anecdote

A single run is one draw of the RNG with every knob at its default. The realism bands used to be checked that way on one to three seeds. That hid two kinds of luck. Seed luck: baltic-2027 met its 1-6 cell band on seed 1 and took half a cell on seed 2. Knob luck: A3's 16-run sweep of ukraine-2026 put Russian casualties at 1,100-2,200 a day (p10-p90), across the top of the 500-2,000 band, with nothing but judgment params moving.

An ensemble runs many draws: seeds crossed with a Latin hypercube over every `estimated`, `judgment` and `contested` param (`sampleRuns` in `src/forecast/sample.ts`). The report is a spread (p10, p50, p90), not a number.

## Forecast mode and stress-test mode answer different questions

- **Forecast mode** (`--method lhs`, the default) draws every uncertain param together. Read ranges and probabilities from it, and only for narrow questions that can be scored later.
- **Stress-test mode** (`--method oat`) moves one param across its range with the rest at their defaults. Read tipping points from it: what must be true for an outcome. Do not read probabilities from it.

`npm run ensemble` prints which mode a report is in, and names the three params that matter most, outcome flips first. `npm run validate` and the ensemble realism bands use forecast mode only.

## Ensemble realism bands

`tests/realism-ground.realism.test.ts` checks its Ukraine and Baltic bands over an ensemble of 8 runs (seeds 1-4, tagged params by Latin hypercube) through `ensemble` and `bandProblem` in `src/validation/ensemble.ts`. A band holds when the median run lands inside it. The failure message lists every run's value, so a reader sees whether the miss is the median or a tail. The bands and their sources are defined once, as tuned-on cases in `src/validation/cases/bands.ts`.

Eight runs is a floor, chosen for a shared four-core machine. With 8 runs a significant param effect needs |r| above 0.7, so read an 8-run spread as a range, not as a ranking of knobs. Use 64 or more runs to rank knobs.

## The front law moves the sector an assault fills, not the whole cell

A3's report flagged that ukraine-2026 gained ground about 30 times too fast by area. The `ground_km2` metric multiplies each cell's contest progress (km pushed across the cell) by the cell's area, so contest progress has to mean the advance averaged over the cell's width, as the front-law comment in `src/systems/land/tables.ts` says. The front law did not deliver that. Its paces (1-4 km a day for Russia's best-massed drives in 2024-25, 25 km a day for a breakthrough) are cited from single axes, and `advanceKm` applied them to the whole ~45 km width of a half-degree cell. A probe of seed 1 showed where the area came from. Russia pressed 16 Ukrainian cells at once, three quarters of the area came from penetration at 1.2 km a day, and each push counted as 45 km of front.

Each opposed pace is now multiplied by `sector` (`combat.ts`), the share of the cell's front the attacker's platforms in contact fill at `FRONTAGE_PLATFORMS` density. Against a prepared line only the first echelon is in contact (`KILL_ZONE_COMMIT`), so a Russian brigade of ~130 exposed platforms fills about 1.3 km of a 45 km cell. A force spread over many cells now opens many narrow axes, and its total area per day is bounded by its total committed frontage, not by how many cells it presses. A routed or absent defender confines nothing, so exploitation and the road march still run the cell's full width. A cell still changes hands only once the whole cell has been pushed across.

Measured with `npm run validate -- --cases ukraine-2026-60d,kursk-2024,baltic-2027-21d,karabakh-2020 --workers 2` (8 runs, seeds 1-4 with tagged params by Latin hypercube), before and after:

| Case | Question | Observed | Before p10 / p50 / p90 | After p10 / p50 / p90 |
| --- | --- | --- | --- | --- |
| `ukraine-2026-60d` | `rus_km2_per_year` | 3,500-5,000 | 46,075 / 148,738 / 296,941 | 12,238 / 37,815 / 210,284 |
| `ukraine-2026-60d` | `rus_net_cells` | 0-2 | 0.18 / 1.9 / 4.2 | 0.00 / 0.38 / 3.9 |
| `ukraine-2026-60d` | `rus_tanks_per_day` | 2-8 | 4.3 / 6.3 / 9.6 | 4.5 / 6.6 / 10.4 |
| `kursk-2024` | `ukr_ground_km2` | 800-1,300 | 0 / 1,811 / 3,479 | 1,489 / 3,009 / 3,810 |
| `baltic-2027-21d` | `baltic_cells` | 1-6 | 2.1 / 3.7 / 5.0 | 0.99 / 1.6 / 2.4 |
| `karabakh-2020` | `armenia_taken` | 0 | 11 / 12 / 13 | 11 / 12 / 13 |

The ukraine-2026 median is still about eight times the record. Three causes remain, none of them the width of an assault:

- In three of the eight runs Ukraine's AI moves most of its line into Russian-held ground after about day 35 and leaves up to 27 front cells empty. Russia then marches through them at road speed, which gives the 150,000-350,000 km2 tail. That is the operational AI (`ai/land.ts`), not the front law.
- Where the line holds, Russia keeps a whole-force ratio of 10-20:1 on every cell it presses, because Ukraine spreads ~100 exposed platforms over each 45 km cell. At that ratio every axis moves at the best-massed drive pace, 1.2 km a day through a belt, for 60 days. The record's sustained axis pace was nearer 0.1-0.5 km a day. The next lever is that pace or the force ratio, and it is a calibration choice, left for a separate change.
- Ammunition never throttles an assault: every formation in a contested cell held a full ammunition load for the whole of a 60-day probe. Logistics refills the front as fast as it fires.

Kursk moved further from the record. Before the change, Ukraine took two or three cells in a week and Russia's full-width counterattack took them back by day 21 in some runs, so the median was right for the wrong reason. Now the counterattack is as narrow as any other assault, which matches the months Russia needed to retake Kursk, and the overshoot that remains comes from Ukraine's exploitation through the border cells the case setup empties of Russian troops.

## Long horizons are out of reach today

The bands and cases run 4 to 90 days. Questions about production races need runs of three to five years, since warships and new production lines take years. Nothing in the repository runs or checks that long, and a year of ukraine-2026 is about 1,460 ticks, five to ten minutes a run on a four-core machine. Treat any output past 90 days as unvalidated.
