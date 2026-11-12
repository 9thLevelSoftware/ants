# Review findings that were cut off before reaching the fixer (workflow truncation at 9,000 characters)

Each item below was reported by the independent reviewer but may not have been seen by the engineer who fixed the task (some may have been fixed anyway through the reviewer's failing tests). Treat each as open until checked against the code.

## loco

Reviewer tests added: /home/user/foundress/src/sim/locomotion/loco.verify.test.ts — 19 tests; 11 fail on purpose: default arrival radius (blocker), stuck bypass, separation, floor bias, LOD prevPos, Infinity destination, multi-nest capture, relocation onto itself, avoid marker placed under way, trail at coarse LOD, carved pit outside a nest. 8 pass and stay as regression tests: NaN destination, destination outside the map, point goal in a chamber via point field, navStop, map-edge invariants, entrance next to a stone, NaN intent for the possessed ant, 300 BU looping outbound walk retraced home in <= 1.4 x the straight line with no planner use (GDD 02 E17 at loco level), trail bend near the observer., /home/user/foundress/src/sim/world/navGrid.verify.test.ts — 2 tests, both fail on purpose: micro-portal edge through a full-width wall (major); groundY on top of a low block (minor)., Appendix E checks that need other modules: GDD 01 E3-5 (haul/forage/nurse behaviours), E12-14 (camera), E17/E23 (input/game). GDD 02 E16 (route learning, behaviours), E17 and E20 at behaviour level (my loco-level E17 passes; the loco part of E20 fails, see the avoid-marker finding). GDD 04 E20 second clause (10 GD headless soak with 500 AI ants: integration/soak tool), E21 (floating, Tier 2). Covered at loco level by the implementer's tests: GDD 01 E15, E25; GDD 04 E20 first clause.

### [major] Non-finite destinations are not rejected: Infinity writes NaN into fwd, and NaN disables the timeout

- Where: src/sim/locomotion/index.ts begin()/navTo (no input validation); steer.ts turnToward
- Detail: navTo(dest = {x: Infinity}) is accepted. After ~116 ticks the walker's fwd is NaN (persisted state, which JSON-saves as null) and walkerFailed counts up every tick. The status stays 'moving' and timeoutTick is -1, because Number.isFinite(distance) is false. A NaN in dest.y also gives timeout -1, and the request is still 'moving' after 200 ticks. A destination of 1e12 gets a timeout 3.5e12 ticks away. Repro: loco.verify.test.ts 'an infinite destination never puts NaN into the walker'. Reject non-finite destinations and clamp them to the map.

### [major] Any nav-grid change rebuilds every flow field synchronously (~35 ms each on a standard map); A* budget is a count, not a cost

- Where: src/sim/locomotion/grid/navGridImpl.ts flowField (version check), setCostMult/refreshArea bump the global version; runtime.ts planBudget
- Detail: Measured on a 4000 BU world (250x250 cells, load ~4): a flow field rebuild takes 35-59 ms, and a corner-to-corner A* takes 4.3 ms. Any setCostMult (puddles, heat or human-event overlays from other modules) or refreshArea (mounds, dynamic primitives) bumps the global version. Every colony's flow field is then rebuilt inside the next locomotion tick, against a 4 ms sim budget. GDD 04 §11 asks for incremental re-derivation per touched cell. The budget of 12 A* calls per tick can also cost about 50 ms in one tick on a big map. The 900 BU perf scenario hides both.

### [minor] Grid groundY ignores primitive tops, so the 'step' climb cost and grip-blocked rule never apply

- Where: src/sim/locomotion/grid/gridData.ts:121-131 (ground = field.height), search.ts edgeCost
- Detail: GDD 04 §11 defines groundY as the top-surface height of the walkable ground. The grid uses terrain height only, so kerbs, steps and slabs below NAV_OVER_MAX add no step cost. The 'blocked if grip < 0.5' rule is not implemented: the grid has no grip input at all. Repro: navGrid.verify.test.ts 'groundY of a cell on top of a 20 BU block': ground reads 0 instead of 80 mm.

### [minor] Dead tunables and persisted dead fields; tunables and magic numbers outside src/sim/balance

- Where: params.ts (trailGain, trailEdge, trailSearchS), scratch.ts (replansThisTick, replanTickMark, trailSide never read); stuck.ts:96 maxD = 6 BU; stuck.ts:118 0.3; modes.ts TRAIL_HEADING_TAU_S / 100 deg / 0.7 and 0.3 radius fractions; legs.ts 0.5 / 0.4 / 2 BU; nests.ts 1.2 and -0.25 BU; system.ts SLIP_EVERY and TICK_S (duplicates sim/time); update.ts MAX_LEG_SWITCHES; navGridImpl SMOOTH_*, SNAP_RADIUS, FLOW_CACHE
- Detail: The rule is that all tunables go in src/sim/balance or species data. LOCO_TUNING and NAV_GRID_TUNING live in loco's own files and are not re-exported from balance, and many values are still inline in the files listed above. The dead scratch fields are saved in every walker's state.

### [minor] Contract layering: types/walker.ts imports the persisted NavScratch shape from the locomotion implementation; the field is optional

- Where: src/sim/types/walker.ts:8 and NavState.loco?
- Detail: The contracts now depend on an implementation module, so any loco refactor silently changes the save format. Contracts guidance §1 also says no undefined-vs-missing semantics in persisted state; loco? is missing until the first request. Additive and allowed, but it should be listed as a contract change, and the shape belongs in src/sim/types.

### [minor] entityIndex.ts is never wired; the need was not reported

- Where: src/sim/world/entityIndex.ts; src/sim/services.ts:61 builds its own index
- Detail: createEntityIndexImpl has no caller. sim.index is services.ts's own index, so isLocoEntityIndex is false and locomotion always does a full refresh(). This works, but the report's 'entity index that can refresh only the walkers' is dead code, and the wiring need for the services owner is not in the report.

### [minor] Small spec deviations, not recorded

- Where: possessed.ts desiredDir; update.ts retrace; stuck.ts:61; possessed.ts integratePossessedFrame
- Detail: (1) The edge latch breaks on a per-frame input change > 30 deg, not on a change since the latch began, and on LATCH_MAX_S alone, without the 'camera up within 10 deg' condition (GDD 01 §4.1). (2) GDD 02 §9.2's retrace stuck rule (< 2 BU in 10 s -> planner path for 30 BU, then resume) is replaced by the generic ladder. (3) nav.stuckTicks is documented as 'consecutive ticks with almost no progress' but is set to the age of the request. (4) integratePossessed can create nav.loco on the ant through scratchOf, a state write from the per-frame predictor (harmless once one tick has run). (5) The report says 87 tests in 13 files; the run shows 78. (6) Perf: best-of-5 is 1.97 ms, but individual 200-tick repeats reach 2.6-3.4 ms, so 'averages under 2.5 ms' holds only for the best repeat.

## render-nest

Reviewer tests added: /home/user/foundress/src/render/nest/mesh/regionBuffer.verify.test.ts (passes: 600-operation random put/remove/repack property test, region keys and boxes at negative coordinates), /home/user/foundress/src/render/nest/mesh/chunkMeshManager.verify.test.ts (2 FAIL: starvation under nearby digging; backlog sort cost and throughput. 4 pass: material change moves buffers, re-dirtied staged chunk, refined meshes watertight around chunk corners, setSource(null)), /home/user/foundress/src/render/nest/mesh/chunkBuild.verify.test.ts (1 FAIL: fresh-wall lookup cost with 1250 recent edits; 1 pass: logs the busy-chunk rebuild cost), /home/user/foundress/src/render/nest/cutaway/cutaway.verify.test.ts (2 FAIL: degenerate vertical section; cap never completes under continuous digging. 3 pass: radius 0 and on-plane rule, disc and pit faces, default cap raster time logged), /home/user/foundress/src/render/nest/NestRenderer.verify.test.ts (2 FAIL: ghosts lost after dispose+init; NaN dt. 4 pass: x-ray hide and restore, underground flag, sense-light centre on possessed ant or camera, slice pick on the cap), /home/user/foundress/src/render/nest/picking.verify.test.ts (1 FAIL: a slice pick ignores the nearer visible ground), Harness scripts (git-ignored): /home/user/foundress/test-output/review-nest/dig-review.mjs and /home/user/foundress/test-output/review-nest/speck.mjs; screenshots under /home/user/foundress/test-output/review-nest/

### [minor] NestRenderer does not satisfy the registry's SubRenderer contract

- Where: src/render/nest/NestRenderer.ts (no `name`; stats() returns NestStats with an object and a boolean); src/render/index.ts SubRenderer
- Detail: Scratch type-check: `const s: SubRenderer = new NestRenderer()` gives TS2741 (missing 'name'). With 'name' omitted it gives TS2322 (stats() is not Record<string, number>). init() is also async, while the registry calls it without awaiting (harmless today). FrameInfo -> NestFrame is assignable. The registration in src/render/index.ts belongs to int-1A, which will need a thin adapter or a contract-shaped stats().

### [minor] The shadow depth material does not mirror the wall shader's discards

- Where: src/render/nest/materials/nestMaterials.ts:87
- Detail: The depth material only discards `vNestSub > -uSkin`. It ignores the slice hiding (nestCutHidden), the occlusion dithering and the inHole exception. At high/ultra quality (castShadow on), walls hidden above the slice still cast sun shadows. Low impact today because nest walls do not receive scene shadows, but ants and items under the cut would.

### [minor] Wood grain is fixed to world X

- Where: src/render/nest/materials/glsl.ts:129
- Detail: The fibre noise is stretched along world X, so it only follows the grain because the demo log lies along X. A log rotated along Z shows grain across the fibres. params.ts promises 'along the grain axis'. Needs the primitive's axis, per vertex or per material.

### [minor] Implementer's RegionBuffer test builds parts with the wrong attribute stride

- Where: src/render/nest/mesh/regionBuffer.test.ts:9
- Detail: `nest: new Float32Array(nv * 2)` while NEST_ATTR is 3. write() silently copies a truncated subarray, so the test passes without checking the aNest data. My regionBuffer.verify.test.ts covers this, and also runs a 600-operation random put/remove/repack property check, which passes.

### [minor] Duplicated underground constants

- Where: src/render/nest/params.ts NEST_LOOK vs src/render/world/lighting/constants.ts UNDERGROUND
- Detail: Already reported by the implementer. NEST_LOOK.exposureEV and the fog values duplicate render-world's UNDERGROUND, and the demo actually uses render-world's easing (worldRenderer.lighting.exposureEV), not NestLook.exposureEV. One owner should be chosen before integration.

## nestops

Reviewer tests added: /home/user/foundress/src/sim/nest/nestops.verify.test.ts — 20 tests. 5 FAIL and stay in place for the fixer: Mound.volume vs grid after the entrance radius grows; D_plan across save/load; D_seal across save/load; L-shaped natural cavity joining; shaft plan overshooting the surface dug by diggers. 15 PASS as regression tests: relaxation conservation; GDD check 14 (a tunnel plan dug by 2 diggers completes, >= 97 % of targets open, no voxel with g < -0.25 BU changed); instantCarvePlan nursery m gives a 125.7 BU^3 ±15 % room; planDig command plus overlaps-plan; validatePlan cost; NaN / zero / extreme heading and slope never write NaN; bite conservation over 30 bites; chamber merge (one id kept, other removed 'merged'); spoil-pile join; a surface spoil heap far from entrances is walkable; bite cost next to an entrance; an entrance plan dug by diggers completes; founding queen expulsion flow registers an entrance with exact mound bookkeeping; sand chamber with pillars; detection cost (strict mode via FOUNDRESS_PERF_STRICT=1)

### [minor] Validation check order differs from GDD 03 §7.3

- Where: src/sim/nest/plans/validate.ts:68-84
- Detail: 'unstable' is evaluated before 'water', 'non-diggable', 'overlaps-plan' and 'too-large', but the GDD orders it after 'too-large'. When several conditions apply, the reported code differs from the GDD order (for example, a plan that is both unstable and overlapping reports 'unstable').

### [minor] Unused balance constants and inline magic numbers

- Where: src/sim/balance/nest.ts; plans/plans.ts:110; plans/resolve.ts:13; navFields.ts:15; entrances.ts:264; pellets.ts:22
- Detail: These constants are defined but never read: MOUND_SUPPORT_BU, TAMP_RADIUS_BU, MOUND_MIN_H_BU, PLAN_PROGRESS_EVENT_TICKS, RIM_FULL_BU, RIM_MIN_FACTOR, TUNNEL_ADULT_CAPACITY, LN_EXTRA_ENTRANCE_WORKERS. These tunables are inline: the architect blacklist '1200 * T' (ARCH_BLACKLIST_S), DEFAULT_LEN_BU = 10, MAX_PLUG_SEEDS = 64, ANT_LENGTH_HEAD = 0.5, the FRASS_MATERIALS list. nestTemplates.ts adds a second source of nest-template truth next to SpeciesDef.nestTemplate. The implementer recorded this decision; species-data must keep the two in sync.

### [minor] Integration gap (outside nestops): the dig-bite action times bites without moisture, LOOSE or crust

- Where: src/sim/ants/actions/defs/dig.ts:59-62 and durationS (uses sim.field.diggability = digFactor only)
- Detail: nestops implements GDD 03 §1.2/§2.1 durations in substrate.biteTicks / digSpeedAt, and its unit tests prove check 2 against them. The action library does not call them, so in the running game a plug (LOOSE) bite takes 10 ticks instead of 5, dry clay 23 instead of 41, and crusts are not slowed. Check 2 therefore holds only at nestops' level. This needs the actions owner to switch to nest.digSpeedAt / biteTicks; nestops should list it as a need in its report.

## render-ants

Reviewer tests added: /home/user/foundress/src/render/ants/AntRenderer.verify.test.ts (16 tests; 4 fail on real bugs: two quality-switch crashes, wings ignoring the WINGED flag, recycled pose leak), /home/user/foundress/src/render/ants/gait.verify.test.ts (6 tests through the real tick -> interpolate -> render pipeline; 4 turning cases fail with 0.14-0.30 mm stance drift, 2 straight-walking controls pass), /home/user/foundress/src/render/ants/select.verify.test.ts (6 tests on LOD and cap edges; all pass), /home/user/foundress/src/render/ants/items/catalog.verify.test.ts (7 tests: every item kind x species, every brood stage x caste, finite geometry, size scaling; all pass), Harness scripts used for evidence, kept under test-output/review-render-ants/: turn-slide.mjs, shots2.mjs, bench2.mjs, classic-shot.mjs

### [minor] Deviations from the GDD 08 look and animation rules that are not recorded in the report

- Where: src/render/ants/morph/lasius.ts:45, shader/materials.ts:62, poses.ts
- Detail: (a) GDD 08 §11.6 cuticle: roughness 0.35, clearcoat 0.6, clearcoat roughness 0.2, and erect hairs as a soft rim term. The code uses the spike's eye-tuned values (Lasius 0.42 / 0.3 / 0.38) with geometric setae at LOD0 only. That may be the better choice (the spike notes too much clearcoat looks like plastic), but it should be recorded as a decision. (b) GDD 01 §7 `pose.grip` is 'body lowered'; the target only pitches the head 0.12. (c) The 'logged once in dev' fallback for unknown pose ids is missing. (d) Reduced motion (GDD 08 §11.9: idle antenna flicks at half amplitude) has no hook. (e) Larval peristalsis and begging (T2) are not done: BroodView has no hunger. (f) No path for the possessed ant's per-frame predicted pose (GDD 01: the game predicts it every frame); AntSimSource only offers prevPos/pos plus alpha. This is an integration need for the game module.

### [minor] Report inaccuracies

- Where: implementer report
- Detail: The report says 48 tests 'in 7 files'; there are 6 test files (vitest: 6 passed). The turning-drift numbers (0.009 mm) come from an idealised continuous path, not the demo or renderer pipeline (see the turning finding). The demo's footSlide only ever measured a straight-walking ant.

## render-world

Reviewer tests added: src/render/world/lighting/worldRenderer.verify.test.ts (6 tests; 5 fail on purpose: stale mound hole mask after a second setWorld, TypeError in update() during a pending setWorld, heightDeltaSignature missing changes inside a tile, NaN dt poisoning, hour override dropping the sim's weather), src/render/world/lighting/lighting.verify.test.ts (7 tests; 2 fail on purpose: overcast haze 1.44x instead of 1.2x, storm not 0.7 EV darker than rain. Passing regression tests: a cloudy 'clear' sky is never hazier than overcast, finite lighting for every weather and elevation, haze per habitat, smooth underground blend, shadow snapping stability), src/render/world/primitives/primitives.verify.test.ts (4 tests; 1 fails on purpose: one moving dynamic primitive re-uploads the 16k static instances. Passing regression tests: nearest-breach selection without reordering the caller's list, a material change moves a primitive to the right batch and removal empties it, finite instance data for zero-size and negative-rounding primitives)

### [minor] Night sky at High: stars turn into large bokeh discs that read as falling snow

- Where: src/render/world/sky/skyDome.ts:36-40 (stars) with the High DoF and bloom
- Detail: In test-output/rwv/high/asphalt-night.png dozens of bright discs about 15 px wide fill the sky. Without post (test preset) the stars are fine. GDD 08 and spike-look ask for faint stars. Lower the star brightness or count when DoF is on, or keep stars below the bloom threshold.

### [minor] Per-frame allocations in the update path

- Where: worldRenderer.ts:182 (envKey string), primitiveRenderer.ts:93/111 (new Set each frame), simAdapter.ts:128 (spread copies of moved primitives every frame), primInstances.ts:69 (signature string per dynamic primitive per frame), moundRenderer.ts:96-99, timeOfDay.ts:159 (new gain array)
- Detail: These allocate on every frame even when nothing changed, which adds GC pressure in the hot render loop. The contract style asks for allocation-free hot paths.

## actions

Reviewer tests added: /home/user/foundress/src/sim/ants/actions/actions.verify.test.ts (9 tests: opening batch laying [FAILS, real bug]; cancel on the effect tick minus 1 leaves no partial effect; trophallaxis moves exactly rate x time; stopAction on a timed repeat finishes one cycle and does not start another; a dead ant cannot begin; NaN point target is refused; feed-larva crop-empty / no-target on a pupa; empty liquid source no-target; ant.action and ant.bb survive a JSON round trip), /home/user/foundress/src/sim/ants/player/player.verify.test.ts (6 tests: large-footprint source missing from the prompt [FAILS, real bug]; release rule 2 then rule 15 after landing [FAILS, real bug]; act trophallaxis-give without a target while the HUD offers it [FAILS, real bug]; possess after cheat.kill in the same batch is rejected; release with nothing possessed emits nothing; re-possessing the same ant is a no-op)

### [minor] Species data gaps the action availability depends on (owner: species-data, not this task)

- Where: src/sim/species/data/lasius-niger.ts
- Detail: The LN queen caste lacks 'drop', 'harvest-liquid', 'unseal-entrance' and 'trophallaxis-give', and the gyne lacks 'antennate' and 'sniff'. GDD 01 §7.3 'Who' grants drop to any carrier, harvest-liquid to all adults that feed, unseal to the founding queen ('as dig-bite') and antennate/sniff to all adults. With the current data the possessed founding queen cannot drop a pellet or reopen her plug. The code correctly defers to species data, so this needs the species-data task.

## worldgen-terrain

Reviewer tests added: src/worldgen/terrain/heightfield.verify.test.ts (3 tests, all FAIL: path-junction cliffs, patio/path not flush, facade groove on x1/z1), src/worldgen/maps/maps.verify.test.ts (6 tests; FAIL: Messor fSpecial not re-derived, door crack not reliably useful / closed door walkable; PASS regressions: E2 Camponotus dims, E5 door gap >= 5.4 mm, E25 first clause (Q=0 on interior/paving for Messor), edge class at compact/large for Messor), src/worldgen/worker/worker.verify.test.ts (1 test, FAILS: async worker failure never falls back), src/worldgen/pipeline.verify.test.ts (8 tests; FAIL: mandatory zones vanish on compact seeds 39/59/52, suburban shares outside GDD range; PASS: extreme seeds 0/2^31/2^32-1 deterministic and distinct, fingerprint independent of key order, natural shares within range for the other four archetypes over 20 seeds x 3 sizes with pipeline seeds)

### [minor] Performance traps for the next-stage content

- Where: src/worldgen/maps/special.ts:31-60; kit/tables.ts:63-69; validate/micro.ts:28-31
- Detail: specialFactor scans every wood or plant primitive for every nav cell, with no spatial index. For Atta with the plant budget (600 plants x up to 24 prims) that is about 62,500 x 14,400 ≈ 9e8 distance tests per deriveMaps, and the maps may be derived up to 3 times. placeTables first generates the full saturated Poisson set over the whole map and then keeps a fraction of it (p = density / poissonDensity). Low-density tables with small spacing build hundreds of thousands of points to keep a few. evaluateMicro runs portals() and a Dijkstra for each micro-connection. Measured standard times are 0.6-2.3 s now; content will push them over the 3 s Node budget.

### [minor] AC1 import list and a registry-dependent BU

- Where: src/worldgen/params.ts:5-6, 51-53; src/worldgen/layering.test.ts
- Detail: Worldgen imports @/sim/balance and @/sim/species, which are not among the spec's 'core, sim/types and kernel modules'. The implementer's layering test explicitly allows them. speciesBuMm uses getSpecies(...)?.buMm, so world size, and with it the fingerprint, depends on what the global species registry holds at call time; the fallback table is only used when nothing is registered. Record this as a decision, or read BU only from params or species data.

### [minor] Smaller spec gaps and rough edges

- Where: various
- Detail: (a) Progress resets to 0 at each regeneration attempt, so a loading bar goes backwards (pipeline.ts:69). (b) Repair R4 records the root-channel portal even when addPreCarve refuses the channel over budget (repair.ts:125-129). (c) removeObject does not decrement budget.used. (d) GroundLayers cannot express forest humus/loam/clay or the garden-bed 400 mm and sand 305 mm layers (capped at 255). (e) GDD §2.4 per-cell texture, veg and theta1 are not produced. (f) v-rest does not check unintended overlaps. (g) §1.4 'drop the lowest optional built zone' when still above 70 % is not implemented. (h) The litter fringe extends into every natural neighbour zone, not only lawn. (i) `x ** 2` (Math.pow semantics) decides stored values in special.ts, suitability.ts applyRivalFactor and repair.ts, which DET-4 forbids in letter. (j) Tunables sit in src/worldgen/tuning rather than src/sim/balance, plus a few inline numbers (shell.ts SHELL, surface.ts SWARD_COVER duplicating SUIT.coverSward, the 300 mm raised-bed gap, the 0.15-0.85 L gate range). Fine as recorded decisions.
