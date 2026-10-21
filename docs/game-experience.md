# Game experience: command, don't administer

The simulator is deep. The interface should not make the player carry that depth. The player should feel like a head of government and supreme commander: they look at a map, see what matters, point at things, and say what they want. Staff work (bookkeeping, routine unit moves, production lines) runs itself unless the player chooses to open it.

This document sets the interaction model. It is grounded in the current UI (three fixed columns of statistics around a squeezed map, see `src/ui/App.tsx` at 4058e6e) and in the friction recorded by three review panels and two playtests (`review-panel*/`, `playtest/` in the project files).

## What good strategy games do

| Game | What we take |
| --- | --- |
| Total War, Supreme Commander, StarCraft | Left click selects, right click does the obvious thing. Drag a box to select a group. The cursor tells you what a right click will do before you click. |
| Civilization | A small set of clear notifications that you click to jump to the place. A one-line answer to "what should I look at next". Detail lives in separate screens you open on purpose. |
| Hearts of Iron IV | Alerts along the top for problems (no supply, idle units, pending decisions). Decisions pause the game. Deep economy screens are a key press away, never on screen by default. |
| Command: Modern Operations | Units carry real data, and the unit sheet shows it all, but only when you open it. Orders have plain names. |

The common shape: the map is the game; the interface stays out of the way until you ask; one interaction grammar works for every unit.

## Three layers of attention

1. **Glance (no clicks).** The map fills the screen. A slim top bar holds the date, the clock controls, and four vitals with a trend arrow: the front (ground gained or lost this week), war support, the economy, and forces (combat strength). An alert stack on the right edge shows at most five things that need attention, each one click from the place it concerns. Decisions that only the player can take (treaty calls, peace offers, nuclear warnings) arrive as cards and pause the game.
2. **Touch (one click).** Click anything on the map and a compact card appears. A unit card says what the unit is doing in one sentence, shows three bars (strength, supply, morale), who commands it (you or the AI), and its orders as buttons with hotkeys. A cell shows its owner, terrain, weather and who is there.
3. **Dig (opt in).** Staff screens open as drawers from a slim icon rail or a hotkey and close again: Forces (order of battle, search), Nation (economy, home front, resources, munitions, production), Strategy (war, peace, sanctions, delegation, nuclear) and Log (the full event log). A unit card's "Details" expands to the full sheet (equipment, magazines, condition, weather, lift). Nothing here is required to play.

## Orders: one grammar for every unit

- **Select.** Left click a counter. Shift-click adds to the selection. Shift-drag draws a box that selects all your units inside it. Plain drag pans. Esc clears.
- **Right click does the obvious thing.** With units selected, hovering the map shows a line from the selection to the cursor and a label such as "Attack Kharkiv", "Move to Lviv", "Deploy by sea to Gdańsk", "Strike targets at Engels" or "Patrol the Baltic". Right click issues it to every selected unit that can do it.
- **Left click on the map offers choices.** With units selected, a left click on a cell opens a small menu at the cursor with every order that makes sense there. The obvious one is first and marked. This makes the right click discoverable and gives access to the rarer orders (blockade, air assault, sealift instead of airlift).
- **Hotkeys.** A attack, M move, D defend, R reserve, S strike, P patrol, B blockade. A posture that needs a target arms the cursor; the next click sets the target.
- **The smart default is a table, not a set of special cases.** It maps the unit kind and the target cell (own, allied, enemy, neutral, across the sea, sea zone, the unit's own cell) to an order. It lives in one pure module with tests (`src/ui/orders/smart.ts`).
- **Every order gets an honest answer.** The unit card shows the order's state: sent, under way, or refused with the engine's reason. A refusal also becomes an alert. Nothing says "done" before the engine says so.

## Automation by default

The AI delegate already runs land, air, naval and the home front, and leaves strategic decisions to the player. That stays the default. Ordering a unit takes it from the delegate; its counter gets a ring and its card a "You" badge. "Return to AI" on the card (or on a multi-selection) gives it back. Delegation by domain lives in the Strategy drawer. A player who never opens a drawer can still play a whole war by watching the alerts, answering decision cards, and right-clicking the few units they care about.

## Honesty

- **Fog of war.** The player sees enemy forces only where their intelligence has contacts, at the believed position, faded by confidence. An enemy card shows what is believed (kind, rough strength, age of the report), not the enemy's magazine. This closes Red Team III CE-1.
- **One side per game.** The nation is chosen on the start screen. The in-game "Playing" switcher is removed, which closes the exploit of acting as the enemy (Red Team III BA-1, BB-1).
- **No developer numbers.** Engine timing (ms per tick, ticks per second) shows only with `?debug`.

## What we deliberately leave out

- No new engine orders or behaviours. This is a change to how the player reaches the engine, not to what the engine does. Engine-side findings (delegate escalation, C2 delay, strike execution) stay with the build.
- No tutorial wizard. The briefing card, alerts, hover labels and hotkey hints teach the game in place.
