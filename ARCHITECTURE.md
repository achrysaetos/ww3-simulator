# Architecture

The simulator is a deterministic, tick-based model of a global war. One tick is
`world.dtHours` hours (default 6). Everything that changes during a run lives in
one plain-JSON `World` object (`src/core/types.ts`). Static facts live outside it:
the map (`GameMap`, from `src/data/generated/world.json`) and the weapons
`Catalog`.

## Layers

- `src/core/` holds the shared data model, the map graph, the engine loop, the RNG,
  pathfinding, and formation helpers. Every other folder depends on it. It does not
  depend on anything else.
- `src/data/` holds facts about the real world: the generated map, the weapons and
  platforms catalog, nation profiles, orders of battle, and scenarios.
- `src/systems/<name>/` holds one subsystem each. A system exports a `System`
  object. `src/systems/index.ts` lists them in tick order.
- `src/ui/` is the browser client. `src/cli/` runs headless simulations.
- `src/testkit/` gives tests the real map plus a small fixed catalog (`t_*` ids).

## The map

Nodes `0 .. landCount-1` are 1-degree land cells; the rest are 3-degree sea zones.
Land cells connect to their 8 neighbours; coastal cells connect to one sea zone; sea
zones connect to their neighbours. `GameMap` exposes terrain, initial owner, share of
national population and industry (`popShare`), rail km, ports, airports, and CSR
adjacency with edge distances in km. `world.control[node]` is the current controller.

## The tick

1. Queued `Command`s are routed to the system that lists the command type in
   `commands`. The engine refuses two owners for one type.
2. Every system's `step(world, ctx)` runs in `SYSTEMS` order.
3. `ctx.emit(event)` records events. Notable ones also go into `world.history`.

All randomness goes through `ctx.rng`. Never use `Math.random()` or wall-clock time
inside a system, because a seed must replay a run exactly.

## Ownership rules

- A system's private state goes on `world.slices.<name>`, declared by module
  augmentation inside the system's own folder:

  ```ts
  declare module '../../core/types' { interface Slices { economy: EconomyState } }
  ```

  The system initialises its slice in `init`.
- A slice holds only plain JSON: no Sets, Maps, typed arrays or class instances.
  Derived structures (logistics' supply searches, AI front pictures) live in runtime
  caches keyed by the World or slice object, and must come out the same when rebuilt
  from the World alone. `src/scenarios/save.ts` saves and resumes a run on that
  contract, and `tests/save.test.ts` checks it: a run resumed from a save matches the
  uninterrupted run exactly.
- Signals that several systems need live on `world.theater`. Each field has one writer,
  named in its doc comment. Read other fields freely; never write them.
- `Formation` fields are shared. The domain system that moves a formation owns its
  `node`, `order` progress, and `fatigue`. Combat systems remove `equipment` and
  `personnel`. Logistics owns `supply` refills, `damaged` repairs, and replacements.
  Anyone may consume `supply` and `magazine` when they fight.
- Units are real units: tons, km, hours, USD millions for unit costs, USD billions
  for national money.

## Realism stance

Prefer published figures (IISS Military Balance, SIPRI, CSIS, RAND, CRS, manufacturer
data) over invented ones, and cite the source in a comment next to any number a
reader would question. Where the model abstracts (for example, `firepower` as kills
per hour of engaged combat), state the calibration it was tuned against, such as
historical loss rates from 2022 to 2024 in Ukraine, 1991 Iraq, or wargame results.

## Calibration params, ensembles and validation

- Every knob that decides outcomes is a param declared with `defineParam` or `tableParam`
  (`src/core/params.ts`): default, range, source, and a tag (`observed`, `estimated`,
  `judgment`, `contested` or `scenario`). Read it through the getter, never copy its value into
  a module constant, or a sweep cannot move it. A run's overrides live in `World.params`.
- `src/forecast/` runs ensembles: `runOne` steps one draw, `sampleRuns` draws seeds across a Latin
  hypercube (forecast mode) or one param at a time (stress-test mode), `summarize` reports
  spreads and tipping points, and `src/forecast/pool.ts` spreads runs over worker threads.
- `src/validation/` scores the model on historical cases. A case (`ValidationCase`) builds a probe
  world from an existing scenario, says which engine constants cite the event, and lists
  questions with cited observed ranges, each source tagged independent, official or combatant.
  `npm run validate` prints the scores and never fails on them. Tuned-on realism bands are
  defined the same way (`src/validation/cases/bands.ts`) so the realism suite can check them as
  ensembles. See [docs/validation.md](docs/validation.md) and [docs/calibration.md](docs/calibration.md).
