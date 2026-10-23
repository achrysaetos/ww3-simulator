# The clock

## Sub-features

- Pause and speeds in the top bar: `speed-0`, `speed-1`, `speed-5`, `speed-20`, in game hours per real second. Keys: Space toggles pause and 1 h/s, `1` to `3` pick 1, 5 and 20.
- Step one turn: the `step` button or `.`. A turn is one engine tick, `world.dtHours` (6 game hours today).
- The date and hour in `clock`. It advances hour by hour at a constant pace, not a tick at a time.
- The top bar (`topbar`) is a three-track grid: your nation on the left, the clock centred in its own track, the figures on the right. The figures come most important first (nukes needle, peace needle, front, war support, economy, mobilised) and are laid right to left; a figure that does not fit the right track drops out whole, so nothing reaches the clock. At 1280 and 1440 px the right track holds the two needles and the front; at 1920 px all six. Below 1440 px the clock packs tighter.
- Counters glide: a formation that stepped to a neighbouring node in the latest tick is drawn along that edge as the clock runs the tick's hours. New formations and jumps of more than one node snap. At the world zoom nothing glides.

## How it works

The page's clock is the master (`src/ui/clock.ts`, `GameClock`). It runs the hours of the latest applied tick, from the tick before it up to it. One real second (`LEAD_MS`) before it gets there, it asks the worker for the next tick (`{ type: 'step' }`). The client holds that snapshot, and any sent after it, until the shown time reaches the tick it extends, then applies them together. If the worker is late, the clock holds at the tick. The shown time is never past an applied snapshot, and the engine is at most one tick past the applied one, so at most two ticks past the shown time. Paused, nothing new is applied and nothing is asked; a step asks one more tick and shows it with anything held. Focus details and command answers that arrive behind a held tick are shown at once. The worker steps only on request; there is no worker-side pacer.

## How to get to it (user POV)

In a running game, press Space or a speed button and watch the hour advance in the top bar. Zoom to the front and watch your counters slide between cells. The clock stops by itself when a crisis takes the screen (with crises on).

## Driving it with Playwright

- `s.runTo(tick, speed)` sets the speed, waits for the tick, then pauses. The default speed is `Infinity`, which steps the engine as fast as it goes. The shown tick ends at `tick`; the engine may have one more computed and held, so a command given then lands two ticks on, after a step.
- `window.__client.clock` is the clock: `shown` (hours since tick 0 on screen), `tick`, `rate`, `fraction` (0 to 1 through the latest tick). `window.__client.glides` maps each gliding formation to the node it left. `__client.speed` is hours a second; `__client.ticksPerSec` is the same in ticks.
- To prove the pace, click `speed-1` and sample `__client.clock.shown` and the `clock` text over 5 s: expect about 5 game hours. Then click `speed-0` and assert `shown` holds.
- To catch a glide, wait for `clock.fraction < 0.15` with `glides.size > 0`, pause, fly to the glider with `__map.bandCamera('front', …)`, then run to fractions like 0.35 and 0.8 and read the glider's box from `__map.hits`.

## Gotchas

- `setSpeed` through `__client` is fine for getting somewhere fast, but a proof of the speed controls must click them.
- Applying a tick redraws only the terrain the snapshot changed (`GlobeGL` keeps its buffer and stencils the damaged boxes); with a still camera the tick's frame stays near or under 50 ms on ukraine-2026 and ww3-2027 in headless Chromium, and 5 h/s holds about 4.9 h/s. A whole redraw (about 100 to 200 ms there, since Chromium composites WebGL in software and reads the canvas back) still follows a camera move, a tile arriving, or a tick that repaints whole countries, such as ww3-2027's opening war.
- To measure a tick, stub `__map.flyTo` first: dramatic moments fly the camera and stream tiles, which costs whole redraws that are not the tick's.
- The clock runs on `requestAnimationFrame`, so it stops while the tab is hidden.
- Keyboard shortcuts are ignored while a crisis, opening or coach is open, and inside inputs.
