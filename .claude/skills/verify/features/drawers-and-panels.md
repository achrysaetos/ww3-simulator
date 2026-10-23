# Drawers and panels

## Sub-features

- Dock drawers, each a button `drawer-<id>` and a key, opening `drawer-panel-<id>`: forces (F, order of battle with `oob-item`, `oob-search`), nation (N, `nation-panel`, staff toggles `staff-<domain>`, mobilization and production), log (L, `event-log`), cost (C, `outputs-panel` with `outputs-row`, `race-shells`, `runway`, `workaround-*`). Esc or the same key closes.
- Right side: War Room cards (`war-room`, `war-card`, `card-primary`, `card-secondary`), staff panel (`staff-panel`), operations (`operations`; a row flies the map to its front or its plan's objective), ticker (`ticker`).
- The unit panel (Forces drawer with a unit selected): `formation-name`, `command-line` (`take` Take command, `release` Hand to AI), `drag-hint`, situation, a describe-only Deploy overseas section for ground units (`deploy`, `deploy-status`), condition, supply, equipment, magazines. Orders are given by dragging on the map (see `orders.md`), not from the panel.
- Enemy contacts: clicking a ghost opens `contact-panel` with the fix age and error, and no orders.
- Game menu (`game-menu`): `menu-quicksave`, `menu-quickload`, `menu-briefing`, `menu-quit`. Layers popover (`layers`) with checkboxes. View switch `zoom-world`, `zoom-theatre`, `zoom-front`.
- Daily Brief (`daily-brief`), see `clock.md`.

## How to get to it (user POV)

In a running game, press F, N, L or C, or click the dock buttons at the bottom. Press Esc to close.

## Driving it with Playwright

`node .claude/skills/verify/scripts/play.mjs --drawers forces,nation,log,cost --run drawers` opens each drawer by its button, screenshots it, and fails if a panel does not appear. Content checks live in `tests/ui-shell.e2e.mjs`, `tests/ui-outputs.e2e.mjs` and `tests/ui-contacts.e2e.mjs`.

Proof: `summary.json` lists every drawer with `shown: true`, the screenshots show the panel content, and `errors` is empty.

## Gotchas

- Opening one drawer closes the other; click the same button again to close it.
- The War Room, staff and operations panels cover about 45% of the map. The playtest loop plans to remove most of them; update this file as they go.
