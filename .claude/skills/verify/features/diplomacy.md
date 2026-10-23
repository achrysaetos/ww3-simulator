# Diplomacy and the two needles

## Sub-features

- The flag row (`flag-row`) under the top bar's left side. Each flag is `flag-<NATION>` with `data-flag` and `data-stance`: enemy (red underline), ally fighting beside you (blue), pending (a treaty member still deciding whether to join you), friend (dashed blue: up to 3 states outside the war that would help if asked, those that would fight first, then the largest economies, then those you asked this week), and neutral (the largest nuclear powers outside your wars). Enemies come first, the side leaders you can make peace with ahead of the rest. At most 9 flags. A dot on a flag marks an open peace offer: gold is yours, green is theirs.
- The diplomacy drag: press your own flag (`own-flag`, top left), move past 4 px, and release on a flag in the row. The pill (`pill`, the same component as the order drag, fixed to the page) follows the cursor.
  - Onto an enemy flag: offer peace. The pill gives the enemy's answer by the engine's rule (`peaceAnswer` in `src/systems/diplomacy/support.ts`), weighed on the player's beliefs: "They accept: the war ends" (good), "They refuse for now" with the war support it turns on and the line below which it takes terms (bad), or "They offered: the war ends" when their offer stands (Accept peace). Release sends one `offer_peace`. A refused offer stays on the table and the engine weighs it again each day.
  - Refused drops send nothing: your offer is already on the table, peace in that war is made by the side leaders, or a coalition member cannot make a separate peace while its allies fight on.
  - Onto an ally, pending, friend or neutral flag: ask for help. The pill gives the answer by the engine's rule (`helpAnswer` in `src/systems/diplomacy/help.ts`, weighed on the player's beliefs, no dice): "They join the war" (good), "Air defence, not troops" (even), or "Their call" for a human-run state, each with why (bound by treaty, the enemy is nuclear-armed and no treaty binds them, your side started the war, their public would not back a war). Release sends one `request_help`; the AI answers at once, joins your side or covers you with its air defence while you fight, and the log says so ("Ukraine asks United States for help: ..."). Allies are only ever asked, never commanded.
  - Asks that send nothing: they refuse (tied to your enemy, no stake, fighting a war of their own), you asked them this week ("ask again from D+n"), a state already fighting beside you ("already fights beside you against China"), a pending treaty member ("answers its NATO call by D+n", which an ask cannot hasten), or you are at peace.
- Esc or a pointer cancel drops the drag and sends nothing.
- The peace needle (`peace-needle`, in the top bar's stats): the main enemy's war support against the line below which it takes terms. The dial fills from 0 (full support) to 1 (would take terms now); the text says "N pts off", "They'd sign", or "Their call" for a human opponent. Its `title` says the terms in words and `data-value` holds the dial value.
- The nukes needle (`defcon`) sits beside it: DEFCON 5 at peace, 3 at war, 2 once the player's or an enemy's warheads are on alert, 1 after a nuclear detonation.
- The nation drawer keeps declare war, sanctions, passage and aid. It no longer offers peace; it points to the drag.

## How to get to it (user POV)

Start any war scenario as C-in-C (strategic decisions stay yours). Read the needle in the top bar. Press your flag, drag it onto the enemy's flag under the top bar, and read the pill. Let go to send the offer. Step a day and see whether the enemy flag gets a gold dot (refused, on the table) or the war ends.

## Driving it with Playwright

`tests/ui-diplomacy.e2e.mjs` is the walk-through: `node tests/ui-diplomacy.e2e.mjs http://localhost:4661/ decide [scenario:NATION ...]` (default ukraine-2026:UKR and ww3-2027:USA, both as cinc; evidence in `/tmp/ww3-verify/runs/decide/<scenario-NATION>/`). It counts every `__client.command` call, drags with `page.mouse.down`, stepped `page.mouse.move` and `page.mouse.up` between the centres of `own-flag` and `flag-<NATION>`, and checks Esc, the peace pill and the one `offer_peace` it sends, the engine's answer after two steps (`__client.state.focusNation.peaceOffers`, `__client.state.wars`), the second drop refused, an ally or pending drop that sends nothing, and a friend drop: its pill, the one `request_help` it sends, the engine doing what the pill said (`__client.state.wars`), and a second ask within the week refused.

Proof: `pill-peace.png` (the pill over the enemy flag), `topbar.png` and `after-offer.png` (the needle and the offer dot), `pill-ally.png`, `pill-friend.png` and `pill-friend-again.png`, and `summary.json`.

## Gotchas

- A crisis card hides the top bar (`.ww-shell.hud-off`), and a war flash (`moment`, the `.mo-root` overlay) covers it; either swallows the press. Click the moment and wait for it to clear before dragging.
- Under ww3-2027 the row fills with enemies and allies; neutrals drop off the end.
- The pill is deterministic: the engine's rules have no dice in them, so "They accept" means the offer ends the war when the next tick runs, and "They join the war" means the helper is at war when it does.
- Under ukraine-2026 as UKR the friends are USA, DEU and JPN, all "Air defence, not troops" (Russia is nuclear-armed); FRA and GBR say the same as neutrals. Under ww3-2027 as USA most states are already in the war, so there may be no friend flag.
