# Orders

## Sub-features

- Selecting a unit: click its counter on the map (stacks zoom open first, `__map.hits` lists the boxes) or pick it from the Forces drawer (`oob-item`). The panel shows `formation-name` and posture buttons `posture-<p>`.
- The radial wheel: right-click a cell with a unit selected. Slots are `radial-<option>` (attack, move, defend, ...), greyed ones carry `aria-disabled="true"`; hover shows `radial-detail` with the engine's reason or arrival time. Esc closes it.
- Order tracking on the unit: `__client.tracks.get(id).state` goes sent, then accepted, refused or relayed.
- Battle plans from a bare enemy cell: `plan-panel`, `plan-force`, `plan-units`, `plan-launch`, `plan-save`, `plan-cancel-op`; the forecast `forecast`, `forecast-odds`, `forecast-losses`.

## How to get to it (user POV)

Start with the brigade role. Click one of your units near the front, then right-click the enemy ground in front of it and pick Attack. Step a turn or two and see the unit's answer.

## Driving it with Playwright

`tests/ui-orders.e2e.mjs` is the full walk-through: find a brigade with enemy ground next to it from `__client.state`, `zoom-front`, frame both, click until the brigade is selected, right-click the target, compare the wheel slots with `__client.options([id], node)`, click `radial-attack`, step, read the track. Reuse `open`, `at`, `flyTo`, `settle` from `scripts/play.mjs`.

Proof: the order track reaches accepted (or refused with a reason shown on the card), and after a few turns the unit's node or the cell's control changed in `__client.state`.

## Gotchas

- Use `role: 'brigade'`; under cinc the staff owns most units and plans may find no free brigades.
- Wait for `!__map.animating` after any camera move before computing screen positions.
- The unit panel renders a beat after the click. Wait for `formation-name` before asserting on it.
- This feature is the first target of the playtest loop (drag orders and the win-chance pill replace the wheel and plans). Rewrite this file when that lands.
