# Task viab-founding — The opening must complete everywhere (stabilisation round, Opus, visual at the end)

## Why
The first playable build needs the opening to complete in every world. Today (reports: `docs/design/tasks/gate-1B-sim-report.md` §5, §12 L1, L5, §13a, §14; `docs/design/tasks/gate-1B-app-report.md` §10):
- the seal never completes on playground-park #3 and car-park-verge #2 (queen dies of desiccation); `generated.long.test` player path: seeds 1 and 3 refuse `seal-entrance` with `no-target`, seed 2 stalls in dig; the browser run `tests/e2e/firstplay.mjs` seed 2 stalls at "sealing:246" after one plug; `tests/e2e/founding.mjs` seed 1 fails reading the lapse view (`null.progress`);
- suburban-garden #3 hands over after 7.1 gd with 2 workers;
- the `foundingInProgress` guard in `src/sim/colony/midden.ts` turned three tests red (`colony/seams.test` midden-blocked, `nest/sfcDeterminism`, `nest/spoilScenario`);
- `src/sim/colony/founding/rules.verify.test.ts` fails to load (import-order cycle in `systems.ts assembleSystems`);
- the site read-out words warmth from cell temperature while the dots show the suitability map's sun factor.

## Read
Those report sections; `docs/design/tasks/founding-close.md` (round 3 spec and rulings) ; GDD 06 opening; GDD 03 §4 entrances. Code: `src/sim/colony/founding/**` (leak.ts, plugPredict.ts, sealPlan.ts, sealGuide.ts, siteScore.ts), `src/sim/nest/entrances.ts`, the `seal-entrance` action in the action library.

## You own
`src/sim/colony/founding/**`, `src/game/flows/founding/**`, `src/ui/screens/founding/**`, `src/sim/balance/founding.ts`, `tests/e2e/founding.mjs`. **Authorised for this task** (minimal, reported): `src/sim/nest/entrances.ts` (natural entrance registration at a founding breakthrough; anything needed so `sealed` is stable), the `seal-entrance` action (aim point / reach by the hole patch; defer to the guide instead of refusing `no-target`), `src/sim/colony/midden.ts` (the guard).

## Work
1. **Sealing is a property, prove it as one.** For generated worlds seeds 1–3 × five Tier 1 archetypes (15 worlds; one world per process, see `generated.long.test.ts` notes) at the start site AND the nearest good site: the passive path and the scripted-player path both reach `sealed` and stay sealed (no flip back to `ready` as on playground-park #3 tick 184→185) within the exposure budget. Zero failures is the bar. Where the geometry defeats plugs (wide shallow trench, log beside the site, steep wall), change the method until it cannot fail: e.g. let the plug action aim at the leak point, let the guide back-fill from inside the cell, or have the queen dig a new narrow throat and seal the old one by fill. A founding site where a queen can dig must be a site where she can seal.
2. **Never strand the player.** A possessed player pressing E in phase `seal` anywhere gets the guided seal; no `no-target` refusal reaches the player; if the guide is stuck for 200 ticks it changes strategy, it does not repeat.
3. **Lapse view** `null.progress` in `founding.mjs`; the midden guard (make the three tests pass without re-introducing the false alarm: test both); the `rules.verify` import cycle; one rule for the warmth word and dots (sun-based words: Shaded / Mild / Warm / Sun-baked or what GDD 06 lists).
4. **Weak hand-overs**: suburban-garden #3 (7.1 gd, 2 workers). Find why (cold site? lapse hazards?) and fix within GDD 06, or make the site read-out honest about it (a site that gives 2 workers must not read Fair or better).
5. **Browser**: `tests/e2e/founding.mjs` on seeds 1, 2, 3 to completion, no stand-ins, no console errors; look at the screenshots. Run it at the end, one browser at a time.

## Others are working in parallel
`weather-fix2` owns the drowning-in-dry-weather defect of the nest flood model (queens drown in sealed cells at ~0.55 gd). If it still reproduces while you work, disable nest flooding in your probes (find the switch in `src/sim/nest/flood/**` or `src/sim/balance/weather.ts`; if none, guard in your probe only) and say so; do not fix it. `viab-economy` owns everything after the hand-over (pool, foraging, starvation alarms). `viab-loco` owns locomotion (possessed walker on steep shaft walls / beside a log: report exact reproductions to it in your result; work around inside the guide only as a last resort).

## Acceptance
1. Work item 1 at 30/30 (list every case with ticks to seal). 2. `FOUNDRESS_LONG=1` founding tests green incl. `generated.long.test` seeds 1–8 one per process. 3. The three midden tests and `rules.verify` green; founding folders green; typecheck clean. 4. Browser e2e seeds 1–3 ok with screenshots looked at. Machine rules: 4 cores shared; never the whole suite.
