# Orders

## Sub-features

- Selecting a unit: click its counter on the map (stacks zoom open first, `__map.hits` lists the boxes) or pick it from the Forces drawer (`oob-item`). The panel shows `formation-name`, who commands it (`command-line`, with `take` or `release`) and `drag-hint`. It has no order buttons.
- The drag: press on one of your own counters, move past 4 px, and release on the target. A press on anything else pans the map. A press with no movement is a click and selects. Pressing a stack drags every unit of yours in it, unless one of them is selected: then it drags alone.
- The pill (`pill`, with `data-tone` good, even, bad, refused, or wait until the kit arrives): beside the cursor while dragging. The first line names the order (attack, strike, move and hold, hold the front, patrol, blockade, rebase). Then come the odds ("64% to take it", "holds 6 cells · weakest 1-2 weeks", "7 of 12 get through") and the caveats and units that stay. A refused drop gives the reason ("ground troops cannot go to sea") and sends nothing. Rest 400 ms on an attack and the staff's war-game adds "staff check N%".
- The map overlay while dragging: an arrow from the counter to the cursor in the pill's tone, the target cell outlined, the frontage cells for hold the front, and the strike reach as a dashed ring.
- Esc or a pointer cancel drops the drag and sends nothing.
- Order tracking on the unit: `__client.tracks.get(id).state` goes sent, then accepted, refused or relayed. A player order holds the unit (`__client.state.focusNation.authority.held`) until the engine ends it: an attack that takes the cell, is beaten off or breaks. A move that arrives stays the player's until Hand to AI.
- Nuclear release keeps its own picker: Nation drawer, nuclear button, then click the aim point (a toast says so; Esc cancels).

## How to get to it (user POV)

Start with the brigade role. Find one of your units on the front, press its counter, drag it onto the enemy cell in front of it, and read the pill. Let go to order the attack. Step a turn or two and see the unit's answer over its counter.

## Driving it with Playwright

`tests/ui-drag.e2e.mjs` is the full walk-through: `node tests/ui-drag.e2e.mjs http://localhost:4650/ drag`. It picks weak brigades facing defended enemy cells (from `__client.state` and `__client.dragKit(ids)`). It clicks one until it is selected, drags it onto its target with `page.mouse.down`, stepped `page.mouse.move`, and `page.mouse.up`, and checks the pill, the track, the stamp clearing, a refusal, Esc, a pan, and ticks per second during a wiggle. It writes `summary.json` with the pill texts, `window.__drag` timings and the tick rates. Reuse `open`, `at`, `flyTo`, `settle` from `scripts/play.mjs`.

Proof: the pill text before release (`pill-attack.png`), the order track reaching accepted or relayed, and later the unit missing from `authority.held` with its posture no longer attack.

## Gotchas

- Use `role: 'brigade'`; under cinc the staff owns most units.
- Wait for `!__map.animating` after any camera move before computing screen positions. The drag itself never moves the camera.
- Press in the middle of the screen: the top bar, the dock and an open drawer sit over the map's edges and swallow the press.
- At front zoom a coastal land cell covers the water near it. Zoom out (`flyTo(node, -1.5)`) to drop on a sea zone.
- The 2026 Ukrainian front is locked: an empty enemy cell next to a lone brigade is crawled through over weeks, so the attack (and its stamp) runs on. Weak attacks on defended cells end soonest, beaten off.
- `window.__drag.maxAimMs` is usually the first, unwarmed call or a GC pause; `lastAimMs` and `totalAimMs / aims` are the steady cost.
