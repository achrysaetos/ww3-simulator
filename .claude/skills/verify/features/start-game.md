# Start a game

## Sub-features

- Scenario list (eight cards, `scenario-<id>`), nation picks on each card (`pick-<NATION>`), and a search for any other nation (`nation-search-open`, `nation-search`, `search-<NATION>`).
- Command role: `start-role-cinc` (AI runs the war), `start-role-marshal`, `start-role-brigade` (player runs every domain).
- `start`, then the opening: a title beat (`opening-title`), the situation report (`briefing`, closed by `briefing-close`).
- The coach tour on a first session (`coach`, `coach-skip`), remembered in `localStorage['ww3.coach']`.

## How to get to it (user POV)

Load the page. Click a scenario card, pick a nation, pick a role, press Start. Watch the title, read the report, close it. The map shell (`shell`) appears.

## Driving it with Playwright

`open({ play: 'ukraine-2026:UKR', role })` in `scripts/play.mjs` does all of this through clicks via `tests/e2e-start.mjs`, with the tour and crisis screens pre-dismissed in localStorage. To test the tour or crises themselves, drive the page without that init script (see `tests/ui-drama.e2e.mjs`).

Proof: `[data-testid="shell"]` visible, `window.__client.state.tick >= 1` (the first turn runs under the title), `__client.state.formations.length > 0`, and no page errors.

## Gotchas

- The scenario load is slow on first visit (map and orbat data); waits use 60 to 120 s timeouts.
- A nation not on the card needs the search path; `newGame` falls back to it automatically.
- `ww3.crises='off'` has the staff answer each crisis (treaty call, peace offer, nuclear alert, capital threat) with its recommended option and say so in a toast, instead of a blocking crisis screen. Remember this when a crisis-related change seems to do nothing.
- `tests/ui-drama.e2e.mjs` covers the tour, the opening, crises and moments (it installs a fake clock; drive moments with `page.clock.runFor`).
