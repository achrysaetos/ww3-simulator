# ww3-simulator feature map

One file per player-facing feature. Each says what the feature is, how a player reaches it, how to drive it with `scripts/play.mjs` (Playwright), and what end state proves it. Update the file in the same PR that changes the feature.

| Feature | File | Existing suite |
|---|---|---|
| Start a game: scenario, nation, role, opening | `start-game.md` | `tests/ui-drama.e2e.mjs` |
| The clock: pause, step, speeds | `clock.md` | `tests/ui-shell.e2e.mjs` |
| Orders: selecting units, drag orders and the pill, order tracking | `orders.md` | `tests/ui-drag.e2e.mjs` |
| The front line: side tints, the line, pushes inside a cell | `front-line.md` | `tests/ui-front.e2e.mjs` |
| Drawers and panels: forces, nation, log, war cost, contacts, menus | `drawers-and-panels.md` | `tests/ui-shell.e2e.mjs`, `ui-outputs`, `ui-contacts` |
| Headless simulation checks | `headless-checks.md` | `npm test`, `realism`, `validate`, `perf` |
