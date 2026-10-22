# Outputs: what a war costs and where it is heading

A run reports three things beside the front line. These are the humanitarian toll, the production race, and how well each side's economic workarounds are holding. The same record feeds the game's War Cost drawer, the `npm run sim -- --report` after-action report, and the war-cost table that `npm run ensemble` prints.

## The record

`src/outputs` builds an `Outputs` record (`src/outputs/types.ts`) from daily samples of the World. It is plain JSON. It never writes to the World and never draws on the RNG, so a run that is read gives exactly the same result as one that is not (`tests/outputs.test.ts` checks this).

```ts
Outputs { tick, day, nations: Record<NationId, NationOutputs>, hosts: { nation, refugees }[] }
NationOutputs { humanitarian: Humanitarian, race: ItemRace[], workarounds: Workaround[], edges: Edges, ladder: CutoffCoverage[] }
```

- `OutputsRecorder.observe(world)` takes a sample (`sampleOutputs`) at most once a game day. `outputs(world, map)` turns the samples into the record.
- The record covers every nation a war touches. That means belligerents, nations whose people were killed in it, and arms donors that have shipped.

### Humanitarian

| Field | Source in the engine | Compare with |
| --- | --- | --- |
| `militaryCasualties` | `civil.nations[n].military`: killed and wounded from every battle event | UK Defence Intelligence daily estimates (Russia ~1,000-1,500 a day in 2024-25) |
| `civiliansKilled`, `civiliansInjured` | civil system (fighting in a cell, warheads that get through, nuclear detonations) | UN OHCHR verified counts (2,088 killed in Ukraine in 2024) |
| `idps`, `refugees`, `hosting`, `underOccupation` | civil system | UNHCR (~6.9M refugees from Ukraine, 2025), IOM (~3.7M IDPs) |
| `infrastructure`, `power` | `theater.infrastructure` and `theater.power` over the nation's home cells, weighted by population | |
| `food`, `energy`, `fuel` | economy: the share of need met after drawing on stocks | |

The engine kept no tally of military casualties, so this unit added one counter, `CivilNation.military`. It is written where the civil system already reads each tick's battle events.

### The production race

Each `ItemRace` row covers one key item for one nation:

- `shells` counts gun artillery rounds made, shipped in, and fired. Shells are stocked as tons of `ammo`, so this row has no stock.
- `ammo` is the national depots' ammunition in tons.
- `interceptors`, `cruise`, `ballistic` and `drones` count rounds in magazines and warehouses. `drones` covers long-range one-way drones only.

The rates (`producedPerMonth`, `aidPerMonth`, `usedPerMonth`) are per 30 days over the trailing month. `zeroDay` is the day the stock would reach zero at those rates. Treat it as an early warning, not a forecast. Air-defence fire comes in bursts, the AI holds reserves back, and a stock can empty at once when its last launcher is destroyed. On seeds 1-3 of ukraine-2026, `zeroDay` flagged every stock that ran dry within 30 days. It was never more than 10 days after the actual day, and many flagged stocks lasted well past it. Rounds in a magazine or warehouse that no living launcher can fire do not count as stock. `ranOutDay` is the day it actually fell below one unit in this run. `monthly` gives the month-by-month history.

The figures to compare against are these:

- Russia made ~3-4M rounds a year in 2024-25 (Estonian intelligence, CSIS). North Korea shipped it ~2-3M a year (South Korean NIS).
- The US made ~40k rounds of 155 mm a month in early 2025 (US Army). Europe's ramp aims at 1-2M a year.
- Partners and the Czech initiative supplied most of Ukraine's shells (Kiel Institute Ukraine Support Tracker; Czech government, January 2025).

The rates themselves are B4's industry data (`src/data/industry`).

### Workarounds

Each workaround reads the economy model and is graded `holding`, `strained` or `failing`.

| Id | Applies when | `level` | Source |
| --- | --- | --- | --- |
| `trade_rerouting` | sanctioned: its sanctions partners hold at least 10% of its trade partners' GDP | 1 − `tradeLoss` | Bank of Russia balance of payments: goods imports near 2021 levels by 2023 |
| `dual_use_imports` | sanctioned or blockaded | semiconductor need met; strained under 3 months of stock | KSE Institute 2023-24; Conflict Armament Research |
| `shadow_fleet` | a sanctioned energy exporter | export capacity left after blockade, war damage and strikes on export sites | KSE Institute: ~70% of Russian seaborne crude moved on shadow-fleet tankers in 2024 |
| `foreign_arms` | a recipient of an arms pipeline (`AID_FLOWS`) | deliveries over the last month against the planned rate | `src/data/industry/aid.ts` |

`shadow_fleet` reads only the exporter's side: blockade, war damage and strikes on export sites. What a cut-off buyer gets back is the workaround ladder below.

### Edges

`edges` says who leads two races, separately, because a side can win one and lose the other (issue #2, section 3). Each runs from -1 through 0 (even) to 1.

- `adaptation` is the mean log effect of the nation's measures against its enemies' counters, less theirs against it, across the duels of `src/systems/adaptation`, squashed by `tanh`. It is 0 at the calibrated opening. With one enemy, the two sides' values are equal and opposite.
- `production` is the catalog value its production lines delivered over the trailing month against its current enemies' together: (own − theirs) / (own + theirs).

### The workaround ladder

`ladder` has one `CutoffCoverage` row per cut-off the nation is climbing out of: a partner that sanctions it or fights it, or `sea` for a blockade of its own ports. `coverage` is the share of the supply lost to the cut-off that the ladder makes good so far, for a traded commodity, and `rungs` splits it into `reroute`, `ration`, `neutral`, `overland` and `substitute`. `months` is how long the nation has been climbing. Cut-offs the 2024 baseline already carries (the Western sanctions on Russia, Belarus and Iran; the Russia-Ukraine war) start mature, at 80% made good. The ladder itself is described in [adaptation.md](adaptation.md).

### Rows

`outputRows` adds `adaptation_edge` and `production_edge` per nation, and `coverage_<cutoff>` per cut-off (`RUS coverage_USA`, `TWN coverage_sea`).

The ally-and-enemy view in `src/ui/outputs/view.ts` predates these fields. `production_edge` reads the enemy's delivered output, which a real staff knows only as an assessment, and an enemy's `ladder` is its own economy. A fogged view should show the enemy's edges and ladder as assessed values or leave them out.

## In the game

Press **C**, or choose **War cost** on the dock, to open the drawer. It has three tabs:

- **Human cost** sets your side against the enemy, shows your home-front meters, and lists where the refugees went.
- **Production** compares supply per month on each side, shows how your consumption compares, and gives each stock's runway with the day it runs out.
- **Lifelines** shows each side's workarounds.

The snapshot carries the reading once a game day (`Snapshot.outputs`, built by `src/ui/outputs/view.ts`). For the enemy it keeps only what reaches a real staff from outside: battle reports and public counts, damage seen from above, assessed industrial output, counter-battery tallies of shells fired, and open-source sanctions tracking. It never sends the enemy's stocks or its rationing.

## On the command line

```sh
npm run sim -- --scenario ukraine-2026 --days 60 --quiet --report
npm run ensemble -- --scenario ukraine-2026 --days 30 --runs 16
```

`--report` ends a run with the after-action report. The ensemble reads Outputs in the same pass as its metrics and prints p10, p50 and p90 for the nations in the opening wars. A run-out day of `never` means the stock is not falling. `--json` adds the ranges under `outputs`.
