# The clock

## Sub-features

- Pause and speeds in the top bar: `speed-0`, `speed-1`, `speed-5`, `speed-20` (ticks per second). Keys: Space toggles pause and 1x, `1` to `3` pick 1, 5, 20.
- Step one turn: the `step` button or `.`.
- The date and turn in `clock`. One tick is `world.dtHours` (6 game hours today).
- The Daily Brief (`daily-brief`) opens on its cadence and pauses the clock; `b` opens it by hand; `brief-close`, `brief-approve`, `brief-approve-all`.

## How to get to it (user POV)

In a running game, press Space or a speed button and watch the date advance in the top bar. The clock stops by itself when the Daily Brief comes up.

## Driving it with Playwright

`s.runTo(tick, speed)` sets the speed, waits for the tick, closes each brief that stops it, then pauses. To prove the controls themselves, click `speed-5` and wait on `window.__client.state.tick` increasing, then click `speed-0` and assert the tick holds for two seconds. Read `[data-testid="clock"]` text before and after for the visible date.

## Gotchas

- `setSpeed` through `__client` is fine for getting somewhere fast, but a proof of the speed controls must click them.
- Speed 20 on ww3-2027 is bound by tick cost (about 0.5 s per tick on the world), not by the setting.
- Keyboard shortcuts are ignored while a brief, crisis, opening or coach is open, and inside inputs.
