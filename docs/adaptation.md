# Adaptation: how a war changes shape

Wars change shape because both sides adapt. A measure loses effect as the enemy notices it and fields a counter. A cut-off economy climbs a ladder of workarounds. Lost ships and aircraft come back only when factories build new ones. This page covers the four mechanisms that model this (issue #2, section 3) and the era dials that set the battlefield's technology.

## Measures and counter-measures

`src/systems/adaptation` holds one duel per pair, measure user and countering enemy, in `slices.adaptation.duels`. The pairs are listed in `PAIRS` (`src/systems/adaptation/tables.ts`).

| Pair | Measure | Counter | Counter lag | Calibrated with | Hook |
| --- | --- | --- | --- | --- | --- |
| `fpv_jamming` | radio-flown FPV and loitering drones | counter-drone jamming | software | the counter in service | drone-link loss in `c2/index.ts` |
| `jamming_fiber` | counter-drone jamming | fibre-optic FPV drones | industry | the measure fresh | drone-link loss in `c2/index.ts` |
| `jet_drone_interceptor` | one-way attack drones | interceptor drones and mobile fire groups | industry | the counter in service | counter-drone belt in `air/iads.ts` |
| `sea_drone_port` | strike USVs | port defences | tactics | the measure fresh | USV raid in `naval/combat.ts` |
| `cyber_hunting` | pre-placed cyber access | network threat hunting | tactics | the measure fresh | discovery hazard in `nonkinetic/cyber.ts` |
| `base_dispersal` | strikes on clustered air bases | dispersal and hardened shelters | industry | the measure fresh | parked-aircraft kills in `air/strike.ts` |

Each duel is a state machine (`Duel` in `state.ts`):

1. `unnoticed`. The counter side adds up what it lost to the measure's current generation. It notices once the total reaches the pair's `notice` threshold.
2. `developing`. The counter side pays the pair's development cost from its treasury. The counter's delay is drawn from the lag class's range. The counter reaches units over the last `adaptation.FIELDING_SHARE` of that delay, so its effect ramps in.
3. `fielded`. The counter is in service. The first time the measure's side uses the measure against it, that side pays for and starts a new generation, drawn from the measure's lag class. When it fields, the duel goes back to `unnoticed`.

The lag ranges come from issue #2: software and jamming fixes take 2-12 weeks, tactics 1-6 months, and industry 6-24 months. Each range rests on a single case.

A side notices only what it observed itself. That means its own casualties in land battles, in proportion to the enemy's drone share of fire; its own hulls lost to an enemy that fields strike USVs; enemy attack drones that got through to its ground; its own parked aircraft lost; its own front fire lost to jamming; and outages of its own networks.

Hooks read one lookup, `measureEffect(world, pair, user, counter)`. A hook that sees only one side passes `undefined` for the other and gets the mean over that side's duels. The effect is `(1 + swing) ** (opening − fielded)`. Here `opening` is 1 for a pair whose constants were fitted with the counter in service and 0 for one fitted before it. So the effect is exactly 1 at the calibrated point. It stays above 1 while a new generation is unanswered and goes below 1 once a counter the calibration did not include is in service. The amplitudes (`swing`) are judgment, because no source publishes them.

`tests/adaptation.test.ts` runs 180 days of ukraine-2026. It checks that at least one counter fields, that the measure it answers loses at least a fifth of its effect, and that a countered measure returns as a new generation.

## The workaround ladder

`src/systems/economy/ladder.ts` replaces the fixed "still arrives" share. Each nation keeps one `Cut` per cut-off in `NationEconomy.cuts`, keyed by partner or by `sea` for a blockade of its own ports. Each cut-off climbs these rungs, which ramp in linearly between their delays:

| Rung | Delay | Applies to | Notes |
| --- | --- | --- | --- |
| draw stocks | instant | all | the existing national buffers |
| `reroute` | 1 week to 1 month | sanctions | trade through third countries |
| `ration` | 1-6 months | war, blockade | demand cuts; closes a supply gap, so it does not count toward trade loss |
| `neutral` | 3-12 months | all | new and neutral suppliers and shadow fleets, from the shared pool |
| `overland` | instant, fixed | blockade, land borders only | small |
| `substitute` | 1-3 years | all | home production |

Export-controlled inputs get `economy.ladder.controlledLeak` of each rung. Cut-offs the 2024 baseline already carries start mature. At maturity, sanctions give back 80% of goods and 30% of controlled inputs, the shares the old `STILL_ARRIVES` table held.

Neutral supply is one pool: `economy.ladder.neutralSpare` of what nations at war with no one import. Each cut-off asks the pool for the import value it lost, times its neutral rung. When the asks exceed the pool, every ask is cut pro rata (`EconomyState.neutralPool`). In a world war, the belligerents split the pool, so each gets less than in a war of two (`tests/ladder.test.ts`).

A sanctioner or blockader tightens against the neutral rung over 6-18 months (`enforceFromMonths`, `enforceToMonths`, `enforceMax`). So a blockade's shadow trade peaks around a year in and then falls. Once a cut-off ends, its ladder unwinds at `unwindPerMonth`.

## Reconstitution of ships and air wings

`RECONSTITUTE_DAYS` (`src/systems/logistics/tables.ts`) is now a table by formation kind. Air wings re-form after `logistics.RECONSTITUTE_AIR_DAYS` and surface groups and submarines after `logistics.RECONSTITUTE_NAVAL_DAYS`. Like land formations, they need at least half their platforms from the national stockpile. No ships or aircraft are warehoused at the start, so only production lines fill that stockpile. A sunk boat comes back only once its yard has built a new hull. Ships re-form only in their home port.

## Era dials

`src/systems/adaptation/era.ts` lifts the drone-era constants into three scenario params. A scenario sets them with `Scenario.params`.

| Dial | Default | Scales |
| --- | --- | --- |
| `era.TRANSPARENCY` | 1 (2024-25 Ukraine) | `land.KILL_ZONE_COMMIT ** TRANSPARENCY` |
| `era.STRIKE_COST_RATIO` | 1 | `land.DRONE_FIRE` linearly and `land.POSITIONAL_INTENSITY` by its square root |
| `era.EW` | 1 | `c2.DRONE_BAND_MAX`, capped at 0.98 |

At the defaults, each wrapped getter returns its calibrated value exactly. A 30-day ukraine-2026 run with only the dials added hashes the same as one at 470a6c2.
