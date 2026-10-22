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

## The front law moves the whole front at the pace of its busiest axes

A3's report flagged that ukraine-2026 gains about 3,600 km2 in 30 days (p50 over 16 runs) against 3,500-5,000 km2 a year in 2024-25 (ISW, DeepState). The `ground_km2` metric multiplies each cell's contest progress (km pushed across the cell) by the cell's area. A default run (seed 1, after merging B3) shows where the area comes from: after 30 days Russia is pushing into 16 Ukrainian cells at once, 7.8 km deep on average and 20-33 km deep on the busiest three. A half-degree cell is about 45 km wide, so each push stands for 45 km of front. The real front moved on a few narrow axes at 0.1-1 km a day and barely elsewhere.

So the metric reads the model correctly, and the model is wrong: over 60 days the median run gains at 113,790 km2 a year (the `rus_km2_per_year` row in [Validation status](validation.md)). The 0-2 cell band does not catch it, because a cell changes hands only once a push crosses all of it. Fixing it is an engine change for the land unit, for example limiting how many cells a side can press at once or scaling the front law by the share of a cell's width under attack.

## Long horizons are out of reach today

The bands and cases run 4 to 90 days. Questions about production races need runs of three to five years, since warships and new production lines take years. Nothing in the repository runs or checks that long, and a year of ukraine-2026 is about 1,460 ticks, five to ten minutes a run on a four-core machine. Treat any output past 90 days as unvalidated.
