# The front line

## Sub-features

- Territory is tinted by side (blue yours and friends', red the enemy's, amber someone else's war), occupied ground is hatched, and the front is a glowing red line where the two sides' ground meets. The globe shader draws all of it from the control mask (`src/ui/map/situation.ts`, `src/ui/map/globe.ts`).
- The line moves inside a cell while an attack presses. A contested cell is painted in the attacker's colour from the side it attacks from, as far across as it has got, so the line bulges into the cell and creeps on as the push goes on. The cell changes hands only when the push crosses it.
- A push that stops (its units pulled out, beaten or moved on) is not lost at once: the line slips back about half a km a day across the cell's width until the defender has the cell whole again.
- Fog: a viewer sees the push in a cell its side fights in, holds or borders, or where its intelligence holds a contact. Elsewhere the line stays on the cell boundary.

## How to get to it (user POV)

Play ukraine-2026 as Ukraine with the brigade role. Drag a brigade onto an enemy cell, run the clock, and watch the red line move into that cell. Or zoom to the front and watch a Russian push creep into a Ukrainian cell over a few days.

## Driving it with Playwright

`node tests/ui-front.e2e.mjs http://localhost:4650/ front-progress` drags the 35th Marine Brigade onto an empty Russian-held cell (7697) and the 42nd Mechanized onto 6501, screenshots 7697 before and after the push with the same camera, then finds the Russian push that grew most over four days and screenshots it three times. It writes `summary.json` with each frame's contest share.

Read pushes from `window.__client.state.contest`: flat records of `CONTEST_STRIDE` (5) floats, `(node, nationIndex, share, east, north)`. `share` is how far across, 0..1. `(east, north)` is the unit vector the attack moves along.

Proof: two screenshots of one cell at the same camera, with the share read at each time, and the line visibly further into the cell in the later one.

## Gotchas

- The 2026 front is locked. An empty enemy cell next to a lone brigade, covered by fire from next door, is crawled through at about a tenth of a km a day in January: the 42nd into 6501 (forest, covered by the 72nd Motor Rifle Division and the KPA force) made 0.033 of the cell in 14 days, against 0.013 before `land.SCREEN_DENSITY`. The bulge is just visible at front zoom. Use an uncovered cell or watch a large push for a clear move.
- A push into an uncovered cell jumps by a third of the cell in one tick and can then stall when enemies come up next door. Frame the camera before the drag lands.
- The mask is an eighth of a degree per texel. A half-degree cell is four texels across, so expect a smooth shift of the line, not a sharp salient.
