# Supply priority

## Sub-features

- The supply handle (`supply-handle`): a small chip over the map's bottom-right corner, above the zoom control. It reads "Supply no priority" or "Supply priority <place>" (`supply-priority`). Its crate and label are the grip (`supply-grip`). A × button (`supply-clear`) shows only while a priority is set, and clears it.
- The drag: press the grip, move past 4 px, and release on a cell. Over a land cell the pill (`pill`) waits ("Reading the supply lines…") while the worker previews the cell (`__client.supplyEffect(node)`, logistics `priorityEffect`), then reads one of:
  - "Refilled in 2.4 days, not 4.4 days" (good), with "+31 t a day to 11 units here · 5% less lift for 155 units elsewhere".
  - "Little to gain", "Units here refill within a day already", "Units here are full: nothing to send", "No lift to spare elsewhere" or "None of your units is near here" (even). Release still sets the priority.
  - "Only ground you hold can have supply priority" (refused) on enemy, neutral or sea cells. Release sends nothing.
- The map while dragging: a bright dotted gold ring of PRIORITY_KM (100 km) around the cell under the cursor, the sector that would get priority. Once given, the same ring stays faint around the priority cell.
- One priority at a time: a second drag moves it. Esc or a pointer cancel drops the drag and sends nothing.
- The engine side: `supply_priority { nation, node | null }` (logistics). Formations within PRIORITY_KM get up to twice the usual push ceiling, out of the rest's, which lose at most 30%; total lift is unchanged. The AI never sets one, so validation does not move.

## How to get to it (user POV)

Any role. Play a nation at war, find a stretch of your front whose units are short (Russia's northern front in ukraine-2026 is thinly supplied; Ukraine's units sit on their railways and are mostly full). Press the Supply chip, drag it onto that stretch, read the pill, let go. The chip names the place; a faint gold ring marks the sector.

## Driving it with Playwright

`tests/ui-supply.e2e.mjs` is the walk-through: `node tests/ui-supply.e2e.mjs http://localhost:4650/ supply`. It plays ukraine-2026:RUS under cinc, runs to tick 16, and picks the front cell where priority saves the most days by asking `__client.supplyEffect` (the preview the pill reads). It drags the grip with `page.mouse.down`, stepped `page.mouse.move` and `page.mouse.up`, then checks the pill, the priority in `__client.state.supplyPriority`, the move to a second cell, the refusal on enemy ground, Esc, and the clear button.

Proof: `supply-pill.png` (the pill before release) and `supply-given.png` (the handle naming the place), with `summary.json` holding the pill text.

## Gotchas

- The grip is DOM, not the canvas: drive it with page mouse events from its bounding box, not from `__map.hits`.
- The preview is asynchronous. Wait for the pill text, not a fixed delay.
- `state.supplyPriority` updates on the next snapshot, so step the clock after release before reading it.
