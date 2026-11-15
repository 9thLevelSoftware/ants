# Plants (task `ecology-plants`, GDD 05 §1.2 nectar rows, §1.4 honeydew herds; GDD 07 §6.1 tender rules)

Pure simulation of host plants, aphid herds and nectar. Constants: `src/sim/balance/ecology.ts`, section "plants".
The herd branch of the `tend` behaviour lives in `src/sim/ants/behaviours/outdoor/tendHerd*.ts`.

## Files

| File | What |
| --- | --- |
| `index.ts` | public API (re-exported by `src/sim/ecology`) |
| `system.ts` | systems: `plants` (hourly), `herd-tending` (every tick a cheap check, every second the step), `tend-demand` (after each allocation pass, local adapter) |
| `init.ts` | New Game: a PlantState per host placement; at Tier >= 2 herds on 60 % of the worldgen `aphid-herd` sites, pre-grown to the start day |
| `growth.ts` | hourly herd model: day-1 hatch, logistic growth by phase, parasitoids, dispersal, downpours, winter eggs, collapse, migrants, host decline |
| `tending.ts` | per second: tenders, tender-seconds and the claiming colony, `tend` (EWMA 60 s), production into the pool, overflow to the film, discovery |
| `claims.ts` | `Colony.honeydew.herdClaims`: it lists exactly the live herds the colony claims (updated on claim, takeover and every herd removal) |
| `links.ts` | herd point, the herd's `aphid-herd` source (units 0: honeydew is taken only by `tend-aphid`) and its `honeydew-film` |
| `droplet.ts` | the `tend-aphid` effect: one 0.15-load droplet per completed stroke (from the primitive's `action-completed` event) |
| `hosts.ts` | host sites (aphid-site POIs, usable ones, 1 per herb / shrub, up to 3 per tree), free sites, found / drop herds |
| `disturb.ts` | `herdDamage` (predators), `cullAphid`, `mowHerdsInArea`, `destroyHost`, rain on the films |
| `nectar.ts` | flower peak rhythm, Tier 2 flying-insect drain, plant link (`PlantState.nectarPool`) |
| `demand.ts` | tenders wanted per herd, workable herds, the colony's `tend` demand, the allocation adapter |
| `diagnostics.ts`, `yield.ts` | `diag-herds` inputs and record; honeydew yield per game day (persisted in `Colony.honeydew`) |
| `commands.ts` | `cheat.setHerd`, `cheat.spawnHerd`, `cheat.freezeGrowth` |
| `ports.ts` | air temperature, rain, publishDiagnostic (tests swap them) |
| `testkit.ts` | test support only: herb host plants with a climb route to the aphid site |

## Seams for other modules

- creatures: call `herdDamage(sim, herdId, n)` when a predator eats (it does the same as the local `eatAphids` adapter
  today); `herdPoint(sim, herd)` is the same point as `herdSite`.
- human events: `mowHerdsInArea(sim, centre, radius)`, `destroyHost(sim, plantId, cause)`; removal events also remove
  the films through the sources module.
- colony allocation: compute the `tend` demand with `herdTendDemand(sim, colonyId)` in `computeDemand`; then set
  `TEND_DEMAND_ADAPTER = false`.
- actions: the `cull-aphid` primitive's effect is `cullAphid(sim, herdId, antId)`; `tend-aphid` needs no change.
- Tier switch: herds are created at New Game only when `ECOLOGY_TIER >= 2` (the T1 static honeydew films are placed
  otherwise); the flowers' drain and peak rhythm also wait for Tier 2. Every rule runs for herds that exist.

## Decisions

- `frozen` (cheat) keeps A and `tend` fixed but still produces honeydew and is still eaten (GDD 05 App. E 1 and 4;
  App. B says "no growth/production").
- Decline phases (r < 0) change A by r x A x dt; the logistic term would turn the decline into growth above K_eff.
- A claim (`tenderColony`) stays while no colony tends the herd; it moves when another colony has more
  tender-seconds over the last 0.25 gd (EWMA).
- Rain empties the films only (GDD 05 owns herds; GDD 07 §6.1.5 also names the pool).
- Herds below 0.5 aphids in the active season collapse; a dormant herd without eggs is removed.
- `tend` demand (GDD 02 §6.2): Σ tenderSlots = 2 + floor(A / 25) (at most 16) over the colony's workable herds, x2
  under a `forage` marker. GDD 02's parenthesis "aphids / 5" is stale; tenderSlots is GDD 05's TEND_SLOTS.
- `cheat.spawnHerd` is rejected (`command-rejected`) unless `aphids` is a finite number; `k` is used only when finite
  and > 0.
- `diag-herds` remedies: `remedy.slider.tend` (the `tend` sub-share inside Forage), `remedy.marker.forage`,
  `remedy.possess.tend` (possess a tender and chase the predator). Their UI text is the content module's.
- `herdSourceOf` caches "no source" for a herd: `ensureLinks` is the only creator of herd sources and updates it.

## The herd branch of `tend` (decisions)

- `honeydew-relay` fires when honeydew is first seen going over in a relay give (GDD 07 App. E 6: within 10 s),
  not when the give ends; `loads` is what the give will move (moved so far + what the donor can spare and the
  receiver take, within TROPH_MAX_S). One event per give.
- "Pool empty for 60 s -> wait" is read from the tender's side: 60 s without a droplet reaching its crop (an empty
  pool, or a pool shared out by a crowd of tenders). The wait ends with the trip home after WAIT_TIMEOUT_S more
  without honeydew; brief spells of soliciting in between do not restart that clock. Arrival, guard duty and a
  relay restart it.
