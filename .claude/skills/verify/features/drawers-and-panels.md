# Drawers and panels

## Sub-features

- Dock drawers, each a button `drawer-<id>` and a key, opening `drawer-panel-<id>`: forces (F, order of battle with `oob-item`, `oob-search`), nation (N, `nation-panel`, the "AI runs" row `delegation` with toggles `staff-<domain>`, mobilization and production), log (L, `event-log`), cost (C, `outputs-panel` with `outputs-row`, `race-shells`, `runway`, `workaround-*`). Esc or the same key closes.
- Over the map only the top bar, the dock, the View switch and the ticker (`ticker`) stand. Live alerts (a raid, a unit lost, a war declared on us) arrive as a `toast`.
- The unit panel (Forces drawer with a unit selected): `formation-name`, `command-line` (`take` Take command, `release` Hand to AI), `drag-hint`, situation, a describe-only Deploy overseas section for ground units (`deploy`, `deploy-status`), condition, supply, equipment, magazines. Orders are given by dragging on the map (see `orders.md`), not from the panel.
- Enemy contacts: each foreign counter is drawn at its last fix and fades with the fix's confidence (`contactAlpha` in `src/ui/map/contacts.ts`: whole at a fresh fix, 0.35 at none); below intel's planning confidence it also turns grey. A text tag ("30h old") shows only once a fix is 24 h old (`AGE_TAG_HOURS`): intel refixes contacts in touch every 6 h tick, so most read 6 h. The hover tooltip, the selected contact's label and `contact-panel` always give the exact age and error. Clicking a ghost opens `contact-panel`, with no orders.
- Game menu (`game-menu`): `menu-quicksave`, `menu-quickload`, `menu-briefing`, `menu-quit`. Layers popover (`layers`) with checkboxes. View switch `zoom-world`, `zoom-theatre`, `zoom-front`.

## How to get to it (user POV)

In a running game, press F, N, L or C, or click the dock buttons at the bottom. Press Esc to close.

## Driving it with Playwright

`node .claude/skills/verify/scripts/play.mjs --drawers forces,nation,log,cost --run drawers` opens each drawer by its button, screenshots it, and fails if a panel does not appear. Content checks live in `tests/ui-shell.e2e.mjs`, `tests/ui-outputs.e2e.mjs` and `tests/ui-contacts.e2e.mjs`.

Proof: `summary.json` lists every drawer with `shown: true`, the screenshots show the panel content, and `errors` is empty.

## Gotchas

- Opening one drawer closes the other; click the same button again to close it.
- A toast lasts 3.5 s (9 s for an error) and a newer one replaces it; read it right after the tick that raised it.
