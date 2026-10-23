# Headless simulation checks

## Sub-features

- Types and unit/integration tests: `npm run typecheck`, `npm test` (vitest).
- One headless run with a daily line per belligerent and an after-action report: `npm run sim -- --scenario <id> --days N [--seed 1] [--quiet] [--report] [--save run.json]`; `--resume run.json` continues one; `--list` lists scenarios.
- Ensembles: `npm run ensemble`.
- Calibration: `npm run realism` (REALISM=1 vitest).
- Held-out history: `npm run validate -- [--cases karabakh-2020,kursk-2024,sindoor-2025,twelve-day-war-2025] [--runs 8] [--json]`.
- Timing budgets: `npm run perf` (PERF=1 vitest).

## How to get to it (user POV)

These are the developer's view of the same world the player sees. A player never runs them, but every engine change must keep them green.

## Driving it with Playwright

No browser. Run the commands from the repo root and save output in the run directory:

```bash
mkdir -p /tmp/ww3-verify/runs/headless
npm run sim -- --scenario ukraine-2026 --days 3 --quiet --report | tee /tmp/ww3-verify/runs/headless/sim.txt
npm test 2>&1 | tail -20 | tee /tmp/ww3-verify/runs/headless/test.txt
```

Proof: exit code 0, and for sim the report's numbers move the way the change predicts (compare with a run on the base commit and the same `--seed`).

## Gotchas

- A 3-day Ukraine run takes a few seconds (about 180 ms mean per tick); ww3-2027 is several times slower.
- Runs are deterministic per seed, so before/after comparisons need the same seed and scenario.
- The full `npm test` takes several minutes (95 files, 1,108 tests; 15 min when sharing the CPU with browser runs). While iterating, run the touched files: `npx vitest run tests/land.test.ts`.
- realism, validate and perf take minutes too; run them for engine changes, not for pure UI work.
