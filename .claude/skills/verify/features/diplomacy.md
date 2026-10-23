# Diplomacy and the two needles

## Sub-features

- The flag row (`flag-row`) under the top bar's left side. Each flag is `flag-<NATION>` with `data-flag` and `data-stance`: enemy (red underline), ally fighting beside you (blue), pending (a treaty member still deciding whether to join you), and neutral (the largest nuclear powers outside your wars). Enemies come first, the side leaders you can make peace with ahead of the rest. At most 9 flags. A dot on a flag marks an open peace offer: gold is yours, green is theirs.
- The diplomacy drag: press your own flag (`own-flag`, top left), move past 4 px, and release on a flag in the row. The pill (`pill`, the same component as the order drag, fixed to the page) follows the cursor.
  - Onto an enemy flag: offer peace. The pill gives the enemy's answer by the engine's rule (`peaceAnswer` in `src/systems/diplomacy/support.ts`), weighed on the player's beliefs: "They accept: the war ends" (good), "They refuse for now" with the war support it turns on and the line below which it takes terms (bad), or "They offered: the war ends" when their offer stands (Accept peace). Release sends one `offer_peace`. A refused offer stays on the table and the engine weighs it again each day.
  - Refused drops send nothing: your offer is already on the table, peace in that war is made by the side leaders, or a coalition member cannot make a separate peace while its allies fight on.
  - Onto an ally, pending or neutral flag: ask for help. The engine has no command for it (allies join by treaty when the call falls due, neutrals by their own choice), so the pill always refuses and says which, and release sends nothing.
- Esc or a pointer cancel drops the drag and sends nothing.
- The peace needle (`peace-needle`, in the top bar's stats): the main enemy's war support against the line below which it takes terms. The dial fills from 0 (full support) to 1 (would take terms now); the text says "N pts off", "They'd sign", or "Their call" for a human opponent. Its `title` says the terms in words and `data-value` holds the dial value.
- The nukes needle (`defcon`) sits beside it: DEFCON 5 at peace, 3 at war, 2 once warheads are on alert, 1 after a nuclear detonation.
- The nation drawer keeps declare war, sanctions, passage and aid. It no longer offers peace; it points to the drag.

## How to get to it (user POV)

Start any war scenario as C-in-C (strategic decisions stay yours). Read the needle in the top bar. Press your flag, drag it onto the enemy's flag under the top bar, and read the pill. Let go to send the offer. Step a day and see whether the enemy flag gets a gold dot (refused, on the table) or the war ends.

## Driving it with Playwright

`tests/ui-diplomacy.e2e.mjs` is the walk-through: `node tests/ui-diplomacy.e2e.mjs http://localhost:4661/ decide [scenario:NATION ...]` (default ukraine-2026:UKR and ww3-2027:USA, both as cinc; evidence in `/tmp/ww3-verify/runs/decide/<scenario-NATION>/`). It counts every `__client.command` call, drags with `page.mouse.down`, stepped `page.mouse.move` and `page.mouse.up` between the centres of `own-flag` and `flag-<NATION>`, and checks Esc, the peace pill and the one `offer_peace` it sends, the engine's answer after two steps (`__client.state.focusNation.peaceOffers`, `__client.state.wars`), the second drop refused, and an ally or neutral drop that sends nothing.

Proof: `pill-peace.png` (the pill over the enemy flag), `topbar.png` and `after-offer.png` (the needle and the offer dot), `pill-ally.png`, and `summary.json`.

## Gotchas

- A war flash (`moment`) or a crisis card hides the top bar (`.ww-shell.hud-off`) and swallows the press. Click the moment and wait for it to clear before dragging.
- Under ww3-2027 the row fills with enemies and allies; neutrals drop off the end.
- The pill is deterministic: the engine's rule has no dice in it, so "They accept" means the offer ends the war when the next tick runs.
