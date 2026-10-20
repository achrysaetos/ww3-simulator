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
