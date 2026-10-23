# Drawers and panels

## Sub-features

- Dock drawers, each a button `drawer-<id>` and a key, opening `drawer-panel-<id>`: forces (F, order of battle with `oob-item`, `oob-search`), nation (N, `nation-panel`, the "AI runs" row `delegation` with toggles `staff-<domain>`, mobilization and production), log (L, `event-log`), cost (C, `outputs-panel` with `outputs-row`, `race-shells`, `runway`, `workaround-*`). Esc or the same key closes.
- Over the map only the top bar, the flag row under it (`flag-row`), the dock, the View switch and the ticker (`ticker`) stand. Live alerts (a raid, a unit lost, a war declared on us) arrive as a `toast`.
- The unit panel (Forces drawer with a unit selected): `formation-name`, `command-line` (`take` Take command, `release` Hand to AI), `drag-hint`, situation, a describe-only Deploy overseas section for ground units (`deploy`, `deploy-status`), condition, supply, equipment, magazines. Orders are given by dragging on the map (see `orders.md`), not from the panel.
- Enemy contacts: each foreign counter is drawn at its last fix and fades with the fix's confidence (`contactAlpha` in `src/ui/map/contacts.ts`: whole at a fresh fix, 0.35 at none); below `CURRENT_CONFIDENCE` it also turns grey. A text tag ("30h old") shows only once a fix is 24 h old (`AGE_TAG_HOURS`): intel refixes contacts in touch every 6 h tick, so most read 6 h. The hover tooltip, the selected contact's label and `contact-panel` always give the exact age and error. Clicking a ghost opens `contact-panel`, with no orders.
- Game menu (`game-menu`): `menu-quicksave`, `menu-quickload`, `menu-download`, `menu-load-file`, `menu-briefing`, `menu-quit`. The war-cost drawer opens on its cost tab; `race-*`, `runway` and `workaround-*` live on `outputs-tab-race` and `outputs-tab-lifelines`, so click the tab first. Layers popover (`layers`) with checkboxes. View switch `zoom-world`, `zoom-theatre`, `zoom-front` (`__map.viewCamera`). World zooms out over where you look. Theatre and Front stay where you look if a land cell you see being fought over (`state.contest`) is within that view, and otherwise fly to the nearest such cell; with none anywhere they stay. Air and sea battles do not count. So as the United States in ww3-2027, Front from over Kyushu goes to the Korean DMZ, and Front again there stays put. Tests that need a particular cell still frame it with `__map.flyTo` after the click.

## How to get to it (user POV)

In a running game, press F, N, L or C, or click the dock buttons at the bottom. Press Esc to close.

## Driving it with Playwright

`node .claude/skills/verify/scripts/play.mjs --drawers forces,nation,log,cost --run drawers` opens each drawer by its button, screenshots it, and fails if a panel does not appear. Content checks live in `tests/ui-shell.e2e.mjs`, `tests/ui-outputs.e2e.mjs` and `tests/ui-contacts.e2e.mjs`.

Proof: `summary.json` lists every drawer with `shown: true`, the screenshots show the panel content, and `errors` is empty.

## Gotchas

- Opening one drawer closes the other; click the same button again to close it.
- A toast lasts 3.5 s (9 s for an error) and a newer one replaces it; read it right after the tick that raised it.
