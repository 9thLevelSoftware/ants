# species-leafcutter implementation — progress (engineer 1)

Started 06:57 UTC Nov 17. Last update 08:30 UTC.

## Done
- balance src/sim/balance/species-leafcutter.ts; fungus module (params, climate, dynamics, states, substrate, cache,
  state, economy, spread, quarantine, gardenLess, rejection, leaves, actions, behaviourCut, behaviourGarden, phorids,
  allocation, castes, chain, feedRule, queenFeed, chamberClimate, display, diagnostics, cheats, work, testkit, index)
- founding src/sim/colony/founding/species/atta.ts (+ test, 3 pass)
- tests: dynamics, loop, scenario (pass); state.test.ts written (save/restore, invariant, caste-unlocked, quarantine,
  relocation) — not yet run
- Math.hypot replaced by sqrt in sim code (08:29)
- shared additions: colonyModules.ts (optional fields), envAdapter.ts chamberRhRule hook (9 lines, tested),
  words.ts factor/remedy/diag words
- e2e tests/e2e/species-leafcutter.mjs; run r1 started 08:25 (test-output/species-leafcutter/r1)

## Core defects found (report, not fixed in core)
- founding auto seal never plugs the 35 BU Atta shaft (forced seal used, as life.ts)
- queen-care feed threshold 0.05 > nanitic minim crop 0.037 (queen never fed) -> queenFeed.ts in module
- entrance nav cell classed blocked-solid -> every navTo from the entrance fails (cut.clear wander escape)
- brood humidity hazard reads air RH -> chamberRhRule hook

## Probes to delete
tools/sim/probe-leaf-plants.ts, probe-leaf-life.ts, probe-leaf-queen.ts, probe-leaf-cut.ts

## 08:55
- own tests 26 pass (state.test.ts added), tsc clean; e2e r2 EXIT 0: 01 carrier+fragment close-up, 01b possessed
  carrier, 02 garden lumps, 03 castes; no refuse heap within +1 GD (garden 0.62 GU, seeded, staphylae 0)
- viability: life.ts atta suburban-garden 1 --until winter running (test-output/viab/sg1.log), then seeds 2,3 and
  a second archetype, one at a time

## 09:20
- sg1 (before): not viable — brood hygiene cascade (brood corpses 20+ in the founding cell) from starving larvae;
  queen laid from founding P while the founding garden (0.6-0.7 GU, fT 0.1-0.9 in a ~28-30 C cell) yields ~0.05 FL/GD
- fixes: minims process when no media gardens (noProcessors); queen laying held to fungus cover (holdLayingToFungus,
  LAY_COVER_GD 2.5). sg1b: stages all fed, larvae starved 0, but workers 9 -> 4 (6 minim old-age), 4 eggs laid
- sweep sg2, sg3, pp1-3 running sequentially (scratchpad viab.sh -> test-output/viab/*.log, sweep.done)

## Next
1. look at r1 screenshots; 2. run own tests + typecheck; 3. viability life runs (one at a time); 4. soak 28 d;
5. delete probes; 6. report
