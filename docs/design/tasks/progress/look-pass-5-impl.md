# look-pass-5 impl progress (Sonnet)
Started Nov 23 16:55 UTC. Read all spec docs. Task-list reminders in the harness are noise (other engineers' tasks): ignore.
## Item 1 (outcome card framing) - in progress
- Repro script: tests/e2e/look5-outcome.mjs (cheat.completeFounding, skipLapse, render; ~2 min/run). Before picture:
  test-output/look5/item1/before-s2/outcome-card.png (seed 2, quality low): queen huge and cut off at lower left, soil smeared.
- Cause: lapse/outcome use the possession camera (flow.ts nudges yaw 150/zoom 1.3); cell is tiny, rig can't back off.
- Plan: new pure shot maths src/render/camera/foundingShot.ts (elevated 3/4 orbit + slice cutaway above the chamber),
  ViewDirector.setFoundingShot(provider) (pose + cutaway when set, view stays 'possess'), FoundingFlow turns it on for
  timelapse / outcome card / failure card, off when they close. Subject = chamber + queen/brood/workers bounding sphere.
## Remaining: items 2..8 in order, then report, tests, cost check (acc 4).
- ITEM 1 DONE (code): foundingShot.ts (+test), ViewDirector.setFoundingShot (+src/game/views/foundingShot.test.ts), flows/founding/shotSubject.ts (+test), flow.ts syncShot; slice cut through the cell, lift behind cards. Pictures: test-output/look5/item1/{before-s2,after5-s1,after4-s2,fail-s2}; constants changed after those (FILL .92, card lift .5 fill .78) -> RE-TAKE final after-pictures at the end (script OUTCOME_FAIL=1 for failure).
  Found: at hand-over the view is 'observer' (follows queen), not possess: shot holds in both.
## Item 5 (resolved alert under the card) - starting
- ITEM 5 DONE (code): AlertFeed FeedContext.cardUp (resolved cards leave at once while a blocking card is up), store.ts passes blockingCardUp() + subscribes foundingUi; tests in src/ui/hud/alerts/feed.test.ts. Picture: test-output/look5/item1/final-s2/outcome-card.png (no alert card; the script log prints cards before/after the clear: rerun at the end to log "before" too). Before = test-output/firstplay-r9/seed2/12-outcome-card.png.
## Item 2 (backdrop speckle) - starting
- ITEM 2 DONE: MeshBuilder.fuzz (aBdFuzz) flag: box 0, ellipsoid/cylinder side 1; edgeHaze.ts multiplies fuzz by vBdFuzz (cache key v8); test src/render/world/boundary/fuzz.test.ts; boundary folder 38 pass. Pictures: before test-output/app-seams-3/cars/{ant-0,meta-edge}.png; after test-output/look5/item2/after-cars/*, suburban-garden/{low,medium,high}-{ant,meta-edge,meta-high}.png, kitchen-door/* (script tests/e2e/look5-backdrop.mjs). Decision: flat faces get no fuzz at all (their silhouette is crisp but hazed).
## Item 3 (kitchen-door wall foot) - starting
- ITEM 3 in progress: probe script tests/e2e/look5-footprobe.mjs (HIDE=, HIDEW=1, HIDEP=1 hide scene groups one at a time, clip shots). Findings: pale veil strip = vent-course brick prims (#23-26 of house-wall object, 65 mm tall: under minFaceMm 250 so NO fogKeep -> fully hazed grey, while the big prims keep 70% colour); streaks (y -23..132, the 250 mm foundation prim #21 region) persist with decor/boundary/terrain hidden -> they are in world:primitives. Probe2 (HIDEP=1, per primitives child) output in test-output/look5/item3/probe2 (running in background at 18:10).
  Worldgen facts: object house-wall (kitchen-door seed 1): brick prims z 9000..9103: #21 y-100..150, #23-26 y150..215 (vent course strips), #32 y215..2250; concrete cavity fill #38 z9103..9177 y-100..150; weep vents plastic #62-64. No coplanar overlap found in the facade object itself.
