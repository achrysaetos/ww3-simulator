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

Measured with `npm run validate -- --cases ukraine-2026-60d,kursk-2024,baltic-2027-21d,karabakh-2020 --workers 2` (8 runs, seeds 1-4 with tagged params by Latin hypercube), on integration e934827 before and after:

| Case | Question | Observed | Before p10 / p50 / p90 | After p10 / p50 / p90 |
| --- | --- | --- | --- | --- |
| `ukraine-2026-60d` | `rus_km2_per_year` | 3,500-5,000 | 57,881 / 84,647 / 203,809 | 10,081 / 14,212 / 27,980 |
| `ukraine-2026-60d` | `rus_net_cells` | 0-2 | 0.18 / 0.75 / 3.1 | 0.00 / 0.00 / 0.25 |
| `ukraine-2026-60d` | `rus_tanks_per_day` | 2-8 | 5.3 / 7.9 / 8.7 | 5.3 / 7.7 / 9.1 |
| `kursk-2024` | `ukr_ground_km2` | 800-1,300 | 1,279 / 1,939 / 2,889 | 1,940 / 2,632 / 3,503 |
| `baltic-2027-21d` | `baltic_cells` | 1-6 | 2.1 / 3.6 / 5.5 | 1.0 / 1.9 / 3.1 |
| `karabakh-2020` | `armenia_taken` | 0 | 12 / 13 / 13 | 11 / 12 / 12 |

The ukraine-2026 median is still about three times the record. The causes found so far are not the width of an assault:

- On the earlier base (786c2c1), three of eight runs had Ukraine's AI move most of its line into Russian-held ground after about day 35, leaving up to 27 front cells empty for Russia to march through at road speed (a 150,000-350,000 km2 tail). On e934827 the p90 is 27,980 km2, so that tail did not appear in these eight runs; why it went away is not measured. When it occurs it is the operational AI (`ai/land.ts`), not the front law.
- Where the line holds, Russia keeps a whole-force ratio of 10-20:1 on every cell it presses, because Ukraine spreads ~100 exposed platforms over each 45 km cell. At that ratio every axis moves at the best-massed drive pace, 1.2 km a day through a belt, for 60 days. The record's sustained axis pace was nearer 0.1-0.5 km a day. The next lever is that pace or the force ratio, and it is a calibration choice, left for a separate change.
- Ammunition never throttles an assault: every formation in a contested cell held a full ammunition load for the whole of a 60-day probe. Logistics refills the front as fast as it fires.

Kursk moved further from the record. Before the change, Ukraine took two or three cells in a week and Russia's full-width counterattack took them back by day 21 in some runs, so the median was right for the wrong reason. Now the counterattack is as narrow as any other assault, which matches the months Russia needed to retake Kursk, and the overshoot that remains comes from Ukraine's exploitation through the border cells the case setup empties of Russian troops.

## L1: the ground war starts on the right side of the line

This section covers the L1 land calibration on integration 2216910. The three tuning levers tried first (breach mass, a penetration floor and AI reinforcement rules) each moved the ukraine-2026 median, and each either broke `tests/land-maneuver.test.ts` or left collapse runs in the tail. So the premise came first: is Russia advancing against the line the scenario describes?

It was not. `baseCell` in `src/scenarios/build.ts` placed each formation at its cited base point. Where Russia had since taken that point (Pokrovsk, Kupiansk, Siversk and Velyka Novosilka), the formation started inside a Russian-held cell. On seed 1, 41 Ukrainian formations started on Russian-held ground. They held 36% of Ukraine's exposed front force (about 3,850 platforms) in four cells for 60 days. The Ukrainian cells they should have manned held token garrisons. For example, cell 6995 held 55 Ukrainian platforms against 1,675 Russian, a whole-force ratio of 18.9:1, and penetration ran at the best-massed drive pace on every such cell. `nearSideOfLine` now starts a formation whose base point lies across a hostile line in the adjacent cell its own side holds, nearest the base point. `tests/ukraine-start-line.test.ts` fails on main@4058e6e (41 formations) and passes now.

Two measurement and case fixes followed:

- `groundKm2On` in `src/validation/cases/measure.ts` counted a cell the attacker owned at full area even after the defender had pushed most of the way back across it. It now counts a held cell as 1 minus the enemy's contest share (`tests/validation/measure.test.ts`).
- `karabakh-2020` gave the four Armenian corps no armour of the Artsakh Defence Army's own. They now share 186 T-72s, 68 BMP-1s and 98 D-30s (DeRouen and Heo 2007; Schmidt 2009; through Wikipedia, "Artsakh Defence Army").
- `kursk-2024`: the placement fix freed Ukrainian formations along the border. Ukraine's land AI then attacked across it, and the day-21 p90 rose to 10,300 km2. Ukraine widened the incursion nowhere else in those three weeks (ISW, August 2024), so the case now hands Ukraine's land domain to the player and only the Kursk grouping attacks.

Measured with `npm run validate`, 8 runs, seeds 1-4, tagged params by Latin hypercube, on 2216910 and on the L1 branch:

| Case | Question | Observed | 2216910 p10 / p50 / p90 | L1 p10 / p50 / p90 |
| --- | --- | --- | --- | --- |
| `ukraine-2026-60d` | `rus_km2_per_year` | 3,500-5,000 | 8,119 / 21,035 / 31,446 | 7,549 / 13,173 / 18,146 |
| `ukraine-2026-60d` | `rus_tanks_per_day` | 2-8 | 3.8 / 4.8 / 13.2 | 3.1 / 4.7 / 6.7 |
| `ukraine-2026-60d` | `ukr_minus_rus_tanks` | below 0 | -8.3 / -0.52 / 0.72 | -1.1 / -0.14 / 0.97 |
| `kursk-2024` | `ukr_ground_km2` | 800-1,300 | 983 / 1,920 / 3,674 | 1,153 / 1,779 / 2,364 |
| `karabakh-2020` | `cells_taken` | 1 | 0 / 2.5 / 4.3 | 0 / 2.5 / 5 |
| `karabakh-2020` | `casualty_ratio` | 1.3-1.7 | 0.63 / 1.1 / 1.8 | 0.62 / 1.3 / 1.7 |
| `karabakh-2020` | `tank_ratio` | 3.3-4.9 | 3.8 / 6.7 / 11.8 | 11 / 16 / 42 |
| `baltic-2027-21d` | `baltic_cells` | 1-6 | 0.18 / 1.4 / 2.1 | 0.18 / 1.4 / 2.1 |

On the held-out questions of these two cases the model beats the baseline on 2 of 8, against 3 of 8 on 2216910. Kursk area and the tank ratio stopped beating it, and the casualty ratio started. The tank ratio on 2216910 was right for the wrong reason. In seed 1 Armenia lost 62 tanks to Azerbaijan's 12, because it had few to lose. With the Artsakh armour it loses 149 to 8, where Oryx counts 255 to 62. Armenian losses moved toward the record. Azerbaijani losses are five to eight times too low on both branches, and that is the remaining defect.

Levers tried and reverted:

| Lever | ukraine p50 km2/yr | Why reverted |
| --- | --- | --- |
| Count the defender's cover in the breach mass ratio | 13,200 | Fails the `land-maneuver` fortified 9:1 floor (0.3 km against 0.5) even at a quarter weight |
| A 0.5 km/day floor on drive penetration | 13,300 | Pins fortified assaults at 0.5 km or more, also failing the floor |
| Scale `holdTheLine` per cell and keep sending newcomers | 12,500 | Two runs of eight collapse at 82,000-88,000 |
| Release units idle in enemy-held cells | about -20,000 | Ukraine counterattacks into emptied Russian cells |
| Form the main effort before manning the line (Baltic) | no change | BB-8 still 0 of 6 seeds |

The remaining Ukraine gap is in `holdTheLine` (`src/systems/ai/land.ts`). It stops sending newcomers once a sector's total requirement is met (481 required, 568 sent on seed 1), even when single cells in that sector hold a tenth of what they need. A per-cell allocation with hysteresis is the next lever. It is a change to the AI, not to the front law.

BB-8 (Russia at or next to Tallinn by day 18) fails on every seed 1-6, on 2216910 as well as on this branch. The forces near Narva sit where the scenario places them: the 69th Motor Rifle Division 156 km away and the 25th Motor Rifle Brigade 110 km away. The AI builds its main effort from Kola, Moscow and the Ukraine front instead, and those formations arrive on about days 7-8. The near units hold the quiet border. Once moving, the lead crosses a ~40 km cell in 4-5 days, about 9-11 km a day. That pace matches Kharkiv in September 2022 (about 12 km a day) and Kursk in August 2024 (about 8 km a day). Reaching Tallinn by day 18 needs about 15 km a day through six cells. Neither the placement nor the front law disagrees with the record. The bound and the AI's choice of formations for the main effort are the follow-ups.

## L2: what holds the ground war at its current pace

Measured on integration 6f449c3 with `npm run validate`, 8 runs, seeds 1-4, tagged params by Latin hypercube. ukraine-2026 runs at 4,680 / 11,010 / 23,880 km2 a year (p10 / p50 / p90), against 3,500-5,000.

**Ukraine: a quarter of the army waits in reserve.** On seed 1 at day 30, Russia's assault groups stand inside cell 6995 (1,657 exposed platforms against Ukraine's 53) and cell 6737 (984 against 67). Those two cells give nearly all the area. Meanwhile 21 Ukrainian brigades, about a quarter of the manoeuvre force, sit in reserve at 6991, 145 km behind them. `holdTheLine` stops feeding a sector once its total requirement is met, and the line's thick stretches meet it. `meetMainEffort` commits only the small reserve `keepReserve` set aside, and `holdReserve` parks everything else.

A second pass after every sector has its share fixes the mechanism. It sends formations from behind the line, never units already on it, to any line cell where the enemy stands at more than 3:1. It feeds each such cell until it holds the 1:3 a prepared defence needs (FM 6-0, historical minimum planning ratios). Because line units are never moved, the line cannot shuttle units between cells. Results:

| Variant | km2/yr p10 / p50 / p90 | Russian casualties/day p50 | Kept? |
| --- | --- | --- | --- |
| 6f449c3 | 4,680 / 11,010 / 23,880 | 1,811 | base |
| Feed to 1:3 against the enemy in the cell | 332 / 2,394 / 7,268 | 2,005 | no: fails the 500-2,000 band |
| Feed to the sector's pressure/3 (counts adjacent enemies) | 664 / 1,180 / 9,795 | 1,949 | no: overshoots |
| Same, only cells pressed 2x the line mean | 821 / 1,220 / 19,608 | 1,952 | no: same median, worse tail |
| Same, plus 1.5x hysteresis before a line cell gives units up | seed 2: 32,000 | | no: starves the screens of empty cells; two cells fell |

The 1:3 feed removes the idle reserve. A full-scenario test shows it: on 6f449c3, 24% of Ukraine's force sits in reserve while three cells are outnumbered 3:1; with the feed it is under 5%. It has no collapse runs, and the tank bands hold. But it puts the Russian casualty median 5 a day over the tuned 2,000 ceiling. The fed brigades kill more of the assault groups. The casualty band was tuned while those brigades sat idle, and its knobs (`KILL_ZONE_COMMIT`, `ASSAULT_EXPOSURE`) are tagged and sampled across their whole range in the ensemble, so moving their defaults does not move the ensemble. The change and its test are kept as `reports/L2-feed-pass.patch` in the orchestration folder, for a unit that can recalibrate the assault-casualty knobs together with it.

**Baltic: the near divisions garrison the border, and a battalion holds an army.** On seed 1 Operation Zenith forms on day 2 from formations 678-1,169 km away (Moscow, Kola and the Ukraine front). The 69th Motor Rifle Division and 25th Motor Rifle Brigade, 110-156 km from Narva, are posted to Russia's own quiet line. The aggressor runs `holdTheLine` before `mainEffort`, and both take the nearest units first. Mounting the aggressor's main effort first puts the near divisions at its head; they reach 80 km past Narva by day 6. Then they stall:

- From day 6 to day 14, 15 Russian formations (2,826 exposed) push 31 km into cell 4388 against one Estonian unit of 52.
- With a dug-in defender, `committed` falls to the kill-zone share, so the penetration term runs at the covered pace. `HASTY_BARRIER` (its source: "tuned to a thin dug-in NATO line in baltic-2027") closes most of the gaps.
- BB-8 stayed 0 of 6 either way. The same reordering sends Russia's main efforts through the Ukrainian line: ukraine-2026 went to 110,503 km2 a year at the median.

So the reordering was not kept. The stall is in the kill-zone call site (`combat.ts`, `committed`), which this unit may not change.

**BB-8's day-18 bound holds.** Touching Tallinn means taking the shortest chain of Estonian cells from the border to a neighbour of Tallinn: five quarter-degree cells, 148 km, 1.25 one-degree units. That is well inside the 1-6 cells in three weeks the same test file asserts, so BB-8 does not contradict that file's "ground taken but no collapse" premise. Recorded paces through a defended but unbroken line run about 8-12 km a day:

- Kursk, August 2024: about 8 km a day in the first week.
- Kharkiv, September 2022: about 12-17 km a day against a hollowing line.
- RAND's 36-60 hours (Shlapak and Johnson 2016) was against a 2016 posture with nothing in the way.

After about 3 days of assembly, 148 km at 8-12 km a day puts Tallinn's neighbour at day 15-22. Day 18 is the middle of that range, so the bound is unchanged.

**Karabakh: Armenia has no anti-tank missiles.** On seed 1, Azerbaijan brings 437 MBTs into the contested cells and loses 8 to Oryx's 62. Armenian fire on armour is 11 against 37 on infantry. That is because the corps carry no ATGM teams: their infantry squad does 0.003 against armour. The catalog has Konkurs, Metis and Kornet teams, and the 2020 Artsakh defence used them heavily. But no source found gives a count: Wikipedia's "Artsakh Defence Army" lists the Konkurs from IISS without a number, and Oryx excludes ATGMs. So no kit was added. A sourced count of Armenian or Artsakh ATGM launchers is the next step.

**Forecast `ground_km2`** now nets ground pushed back, through the same `progress` function the validation measure uses (`tests/forecast-ground.test.ts`).

## Long horizons are out of reach today

The bands and cases run 4 to 90 days. Questions about production races need runs of three to five years, since warships and new production lines take years. Nothing in the repository runs or checks that long, and a year of ukraine-2026 is about 1,460 ticks, five to ten minutes a run on a four-core machine. Treat any output past 90 days as unvalidated.
