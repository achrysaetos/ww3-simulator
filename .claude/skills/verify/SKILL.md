---
name: verify
description: Builds, launches and plays the ww3-simulator browser game (Vite + React, simulation in a web worker) through the real UI with Playwright, and runs its headless checks (sim, realism, validate, perf). This skill should be used to "verify", "playtest", "screenshot the game", "prove this change works in the game", or check any change to the map, orders, clock, panels or simulation before a PR.
---

# Verify ww3-simulator

The player surface is the browser game: a start screen, then a world map with a top bar, a dock of drawers and order menus. A second surface is the headless CLI and test suites, which prove simulation behaviour without a browser. Prove UI changes on the game and engine changes headlessly, and run both when a change crosses the worker boundary.

Paths below are relative to the repo root. Evidence goes to `/tmp/ww3-verify/runs/<run>/` and survives cleanup. Instance state (pid, logs) lives in `/tmp/ww3-verify/state/`; set `VERIFY_STATE` to run a second instance with its own `PORT`.

## Launch

```bash
.claude/skills/verify/scripts/launch.sh            # npm ci if needed, npm run build, vite preview on PORT (4650)
PORT=4651 VERIFY_STATE=/tmp/ww3-verify/state-b .claude/skills/verify/scripts/launch.sh   # a second, isolated instance
SKIP_BUILD=1 .claude/skills/verify/scripts/launch.sh   # reuse dist/ when src is unchanged
```

It is ready when it prints `ready http://localhost:4650/`. It refuses to start when the port already answers: run the doctor, and never drive a server it did not start (the user may have `npm run dev` on 5173). The preview serves the production build, so rebuild after every source change: `cleanup.sh`, then `launch.sh`.

## Doctor

```bash
.claude/skills/verify/scripts/doctor.sh
```

Read-only. Checks the recorded pid is alive, the port answers 200, `dist/` is newer than `src/`, and Chromium exists. A `WARN src changed after the build` means the instance shows stale code. Run it first whenever a drive misbehaves.

## Drive

`scripts/play.mjs` starts a game the way a returning player does (tour skipped, crisis screens left to the Daily Brief), runs the clock, opens drawers and writes `summary.json`:

```bash
node .claude/skills/verify/scripts/play.mjs --play ukraine-2026:UKR --role cinc --ticks 8 --drawers forces,nation,log,cost --run smoke
```

`--play` is `<scenario>:<NATION>` (scenarios: peace-2027, ukraine-2026, taiwan-2027, baltic-2027, korea-2027, gulf-2027, south-asia-2027, ww3-2027). `--role` is cinc (the AI runs the war), marshal, or brigade (the player commands every unit; use it for order tests). It exits non-zero on page errors or a drawer that does not open.

For a feature-specific drive, import it:

```js
import { open } from './.claude/skills/verify/scripts/play.mjs';
const s = await open({ play: 'ukraine-2026:UKR', role: 'brigade', run: 'orders' });
await s.runTo(8);              // ticks are 6 game hours; closes each Daily Brief that pauses the clock
await s.flyTo(node, -0.5);     // waits for the camera to settle
const p = await s.at(node);    // page coordinates of a map node
await s.page.mouse.click(p.x, p.y, { button: 'right' });
await s.shot('wheel.png');
await s.close();
```

The Daily Brief opens by itself whenever an urgent decision arrives, even with the clock stopped. `newGame` installs a Playwright locator handler that closes it before any click, but keyboard shortcuts are ignored under it: call `s.closeBrief()` before `page.keyboard.press`.

Handles: every control has a `data-testid` (grep `data-testid` in `src/ui`). The page exposes `window.__client` (the sim client: `state`, `meta.nationIds`, `setSpeed`, `step`, `options(ids, node)`, `tracks`) and `window.__map` (the renderer: `flyTo`, `screenOf`, `hits`, `animating`, `cam`, `map`). Read state through these; give orders only through clicks, drags and keys. The feature map in `features/` names the handles and gotchas per feature.

The older suites in `tests/*.e2e.mjs` still run: `node tests/ui-orders.e2e.mjs http://localhost:4650/ /tmp/ww3-verify/runs/orders [scenario:NATION]` (also ui-shell, ui-contacts, ui-drama, ui-outputs; `TICKS=n` sets the run length).

Headless checks need no server:

```bash
npm run typecheck && npm test                     # vitest, about 1,100 tests, several minutes
npm run sim -- --scenario ukraine-2026 --days 3 --quiet --report
npm run realism                                   # REALISM=1 calibration suite
npm run validate -- --cases kursk-2024 --runs 4   # held-out historical cases
npm run perf                                      # PERF=1 timing budgets
```

## Evidence

A proof is the before and after of a player action on the real path: start a game from the start screen, act with mouse or keyboard, then screenshot and read the resulting state from `__client` (the formation's order track, the tick, control of the cell). Calling `__client` command methods directly proves the engine, not the UI. Capture `summary.json` with `errors`; a run with page errors is a failed proof even when the screenshot looks right. For engine changes, keep the CLI output (`--report`) or the vitest summary in the run directory. Name the run after the feature (`--run drag-attack`) and cite its path in the PR. Reusing a run name replaces that directory.

## Cleanup

```bash
.claude/skills/verify/scripts/cleanup.sh   # stops only the pid launch.sh recorded; keeps /tmp/ww3-verify/runs
```

Run it after every drive, including failed ones. It never kills by process name.

## Helpers

| Script | Does |
|---|---|
| `scripts/launch.sh` | Build, serve the bundle on `PORT`, record the pid, wait until it answers |
| `scripts/doctor.sh` | Read-only health check of that instance |
| `scripts/play.mjs` | CLI smoke playthrough, and an importable `open()` session with `runTo`, `flyTo`, `at`, `settle`, `shot`, `summary` |
| `scripts/cleanup.sh` | Stop our instance, keep the evidence |

Feature map: `features/README.md`. When a change adds, moves or removes a user-facing feature, update its file in the same PR.
