# Foundation task reports: notes for integration

Collected automatically from the task reports. Treat each item as a claim to check, not a fact.

## F1a-scaffold-core

**Summary:** F1a is complete. The production scaffold is in place, with configs, scripts, index.html, a boot placeholder and a TypeScript runner for Node. All of src/core is implemented as specified, with 128 tests next to the code. `npm run typecheck` reports 0 errors for the whole project, spikes included. `npm test` passes 129 tests in 14 files: the 128 core tests plus 1 in a new src/core/index.test.ts. Both builds succeed. The harness reports ok:true for the dev-server root, for dist/ served from /a/b/, and for dist-classic/ served both at the root and from /x/y/z/. I looked at each screenshot: each shows the seeded fbm soil preview with its version label. The stack spike builds and renders exactly as before.

Two results go beyond the spec. The RNG reproduces the reference xoshiro128** output, and that sequence is now a test. The ellipsoid approximation's error was measured against brute force, and the measured bounds are written in sdf.ts and pinned in tests. One of those results changes the advice: outside the shape it never overestimates distance, but deep inside it can overestimate by up to about 2x.

### Not done
- Nothing from the spec is left open.
- Not done: an exact ellipsoid distance (Newton or Eberly). Only the bound-corrected approximation was asked for. Its measured limit is that deep inside an elongated ellipsoid it can overestimate depth by up to about 2x. If the world field ever needs true interior depth there, add a sdEllipsoidExact.

### Needs from others
- Owner of docs/design/tasks/F1a-scaffold-core.md acceptance 7: its wording says 'the world field elsewhere flips it' (the SDF sign). That is only true for cavities. A solid's distance, positive outside, already means positive in free space, so fSubstrate = min over solids of +sd. Only cavity shapes (carve brushes, cracks, voids) are negated. The README and the sdf.ts header document this; please align the TDD wording.

### Notes for the integrator
- Decision: run-ts uses Vite's SSR module runner with the project vite.config.ts (about 0.5 s start-up); tsx was not added. The example script tools/sim/hello-core.ts is a small extra file in tools/sim beyond the one owned path (run-ts.mjs); it doubles as the documented usage example.
- Decision: tests/smoke.test.ts was deleted (allowed by the spec). Its no-DOM and determinism checks now live in src/core/index.test.ts and rng.test.ts. vitest.config.ts still includes tests/**/*.test.ts.
- Decision: the classic build's output directory is set in vite.config.ts (build.outDir 'dist-classic' when mode is classic); dist-classic was added to .gitignore and the tsconfig exclude list. The spike build scripts still pass their own --outDir and work unchanged. vite build also copies public/ (about 20 MB of assets) into both outputs; that is expected for normal static hosting.
- Shared-checkout risk: npm run build empties dist/, which removes dist/spike-stack* (re-create with npm run build:spike).
- Gotcha: in the @/ alias, vite.config.ts and vitest.config.ts compute the src path with new URL('./src', import.meta.url) because @types/node is not installed. Use the same trick in any other config.
- Policy (serialize.ts): NaN/±Infinity as plain numbers throw with a path such as $.ants[1].pos.x; undefined object properties are omitted (so optional fields round-trip as missing); undefined or holes in arrays throw; typed-array contents are copied bit-exact without inspection. '__proto__' keys decode as own properties.
- Determinism: noise uses integer hashing only, so it is bit-identical on every engine, and golden values are pinned in tests. rngGauss uses Math.log and quat uses trig, so cross-engine bit-exactness is not guaranteed for those (same-engine determinism holds). RNG and noise golden values are pinned: changing either changes every world or save, so bump generator versions deliberately.
- grid2d convention: a cell's value sits at its centre; for corner-based heightfields set origin = cornerOrigin - cellSize/2. The gradient is the analytic derivative of the bilinear patch (it has kinks on centre lines).
- Store.count is exact when deaths go through markDead(); sweep() and rebuild() resync it otherwise. get() returns undefined for entities that are dead but not yet swept.
- Unrelated to my paths: a new docs/design/tasks/00-module-map.md and docs/design/gdd/ appeared in the checkout from other work. I did not touch them.

### Contract changes
- New src/core (all files new). Additions beyond contracts-guidance §2: src/core/version.ts (FOUNDRESS_VERSION, used by main.ts); sdSphere, sdCapsuleSegment, sdfToWorld; v3Project, v3IsFinite, v3Clone and unit-vector factories; quatSet/Copy/Conjugate/Dot/EqualsApprox; hash2u/hash3u; rngReseed, rngClone, hashString; EventBus.onAny, clearQueue, clearListeners, droppedCount, plus the EventMapOf<Union> helper type; HashGrid3.queryRadiusV(pos, r, out) alongside the spec's queryRadius(x, y, z, r, out); grid2d world/cell helpers; tsLast, tsMean, tsClear; encodeToText/decodeFromText; setLogSink.
- Naming: vec3 and quat functions are prefixed (v3Add, quatSlerp) so the barrel has no name clashes. The guidance's deferred `remove` is Store.markDead(id) plus sweep().

### Review findings left unfixed (minor)
- [minor] sdEllipsoid's documented inside-error bound is wrong: 2.6x for a 3:1 ellipsoid, not 'about 2x' (src/core/math/sdf.ts:85-97 (doc comment of sdEllipsoid)): The comment says that deep inside it 'can OVERESTIMATE the depth by up to about 2x (3:1)'. Compared with the exact distance (Eberly root, confirmed by dense brute force), radii (3,1,2) at p=(0.3444, 0.01098, -0.003586) give approx -2.562 against an exact -0.9816, a 2.61x overestimate. Measured maxima elsewhere: 3:1:1 gives 1.94x, 5:1:1 gives 3.2x, 10:1:1 gives 3.8x and 10:10:1 gives 7.3x. The outside claim is correct: it never overestimates, even at 20:5:1. The walking-band claim (within 5% insi
- [minor] sdEllipsoid is discontinuous at the centre (src/core/math/sdf.ts:98-105): As p approaches 0, k0*(k0-1)/k1 tends to -k0/k1, which depends on the direction of approach: -rx along x, -ry along y, -rz along z. The special case returns -min(r). So sdEllipsoid((0,0,0),3,1,2) = -1, but sdEllipsoid((0,0,1e-6),3,1,2) is about -2. Finite-difference gradients or depenetration near an ellipsoid centre will jump. This is low impact because it is deep inside solids. Repro: it.fails test 'is continuous at the centre' in src/core/math/sdf.verify.test.ts.
- [minor] rngRange can return hi, although it documents [lo, hi) (src/core/rng.ts:113-116): lo + (hi - lo) * rngFloat rounds up to hi when |lo| is large compared with hi - lo. Example: with the state forced to output 0xFFFFFFFF, rngRange(s, 1e9, 1e9+1) === 1e9+1. Realistic world ranges (0..36000 mm, angles) are not affected (verified). Fix: clamp, e.g. `v >= hi ? lo : v` or a nextDown, or document the range as [lo, hi]. Repro: it.fails test in src/core/rng.verify.test.ts.
- [minor] rngSeed claims 'integers up to 2^53 are used in full', but distinct seeds collide (src/core/rng.ts:39-56): The low and high words are folded into a single 32-bit value (lo ^ imul(hi, 0x9e3779b9)) before splitmix32. Only 2^32 distinct streams exist, and simple collisions are easy to find: rngSeed(2**32) deep-equals rngSeed(0x9e3779b9). This is harmless for UI seeds (small integers), but the doc comment overstates it. Either seed s[0..1] from lo and s[2..3] from hi, or reword the comment. Repro: it.fails test in src/core/rng.verify.test.ts.
- [minor] smoothstep(e, e, x) returns 0 for every x (src/core/math/scalar.ts:30-33): invLerp returns 0 for an empty interval, so smoothstep(5, 5, 10) === 0. The doc promises '0 at e0, 1 at e1' and support for reversed edges, so a caller with a degenerate ramp, such as a balance value set to equal thresholds, gets 0 where a step to 1 is expected. Repro: it.fails test in src/core/math/quat.verify.test.ts.
- [minor] A file was created outside the exact owned path (tools/sim/hello-core.ts): The spec gives ownership of tools/sim/run-ts.mjs only. The implementer added tools/sim/hello-core.ts as the proof script for criterion 4. It is a reasonable, tiny file and nobody else owns tools/sim yet, but it is outside the letter of the spec. Separately, `npm run build` wipes dist/ (Vite's emptyOutDir), so it deletes a previously built dist/spike-stack. That is harmless, but it surprised me while re-checking the spike claim.

## F1a-fixes

**Summary:** All five F1a-fixes findings are fixed in src/core. `npx vitest run src/core` passes 187 of 187 tests. `npm run typecheck` reports no errors in `src/core` or `tools/sim`. Public signatures are unchanged; the only export change is the new `sdEllipsoidExact`.

### Not done
- rngSeed gives distinct states for all tested seed families (about 2,700 structured seeds) but I could not prove collision-freedom by construction. The doc comment says so.
- Seeds of 2^32 and above, and negative seeds, now produce different streams than before. Seeds in [0, 2^32), including the reference seed 42, are unchanged. Anything that persisted a large or negative seed would see a different stream.

### Notes for the integrator
- Item 1 (`rngRange`): it now never returns `hi`, by stepping down to the next representable value below it. `lo === hi` returns `lo` and still consumes one draw. Ranges whose width overflows a double are handled. `rngInt`, `rngPick`, `rngShuffle` and `rngChance` needed no code change, and tests pin their edges. One consequence: `rngPick` of a 3-element array on the largest uint32 draw rejects it and redraws, because 2^32-1 is divisible by 3. That is the intended rejection sampling.
- Item 2 (`rngSeed`): the low word still drives the base stream, so seeds below 2^32 keep their sequence. A nonzero high word is now whitened separately and folded into all four state words.
- Item 3: `smoothstep(e, e, x)` is now a step (0 below, 1 at or above the edge). `invLerp` with equal edges stays 0 and `remap` with equal input edges returns `outLo`; both are now documented and tested.
- Item 4: `sdEllipsoid` interior is now capped at -minRadius, which makes the value finite, negative and continuous through the centre (it equals -minRadius at the centre). Worst measured interior overestimate vs exact depth: 1:1 is 1.0x, 1.5:1 is 1.2x, 2:1 is 1.35x, 3:1 is 1.55x, 4:1 is 1.7x, 6:1 is 2.0x. The old formula alone reached 2.4x at 3:1 and 4.8x at 6:1, which is where the review's 2.6x came from. Outside values and the near-surface walking band are unchanged.
- Item 4: `sdEllipsoidExact(p, rx, ry, rz)` uses 50 bisection steps and costs roughly 30-60 times `sdEllipsoid`, which the doc comment states. It is accurate to about 1e-12, covers the centre and symmetry planes, and tests show it within 1% of brute force.
- Item 5: `tools/sim/run-ts.mjs` already references `hello-core.ts` in its header example and the script runs, so no change was needed.
- `npm run typecheck` and the full vitest run were only checked for my own paths. Other engineers' modified files (docs/STATUS.md, docs/design/gdd/07-species.md) were not touched.

## F1b-contracts

**Summary:** I reproduced all ten findings. Nine were real and I fixed eight of them, each covered by a test. Two were only partly right: the snapshot finding (real, but not mine to fix) and the queen nestId part of the creature finding (wrong). The three tests the reviewer marked FAILING now pass. All tests in my paths pass (111 tests, 18 files) and `npm run typecheck` shows no errors in my paths.

Fixed:
1. **Bad command blocking every later tick** (major, reproduced). `applyPendingCommands` now takes each batch out of the queue before applying it. `applyCommand` never throws: an unknown type (including inherited names like `toString`), a disabled cheat or a handler that throws becomes a `command-rejected` event, with reason `unknown-type`, `cheats-disabled` or `handler-error`. The error text goes in a new optional `detail` field and is logged as a warning.
2. **Possessing at 8x kept 8x** (major, reproduced). Starting a possession now sets 1x and emits `time.speed-changed` with reason `possession`. `requested` is set too, because the GDD says releasing does not restore the earlier speed. A pause stays a pause. A new optional `dropTo1x` field on `possess`/`possessRole` carries the player's `dropTo1xOnPossess` setting: when false, 8x is clamped to 4x instead. Decision: switching from one possessed ant to another keeps a 2x or 4x the player chose; it does not reset to 1x.
3. **Start day spilling into the next season** (reproduced). The new `startCalendarTick(config)` clamps the start day to the configured season length and throws on a winter start.
4. **WoodState** (real). It is now a named `WoodState` type: `moisture` is in % (6..60) and `decay` is a whole-number class 0..4, as in GDD 07. Nothing was removed. I also added `Herd.relocations` (default 0). The contracts map lists the m

### Not done
- Most module behaviour is intentionally stubbed: systems are safe no-ops, and about 60 command handlers are no-ops annotated with their owner task, as the spec allows.
- createNewGame does not spawn food sources or rival colonies itself. It calls the stub hooks initEcology / initRivals, which the ecology and rivals tasks fill in. The placeholder world has no food anchors.
- CalendarDerived is filled by a simple placeholder (sine-based day length, coarse day phases) in createGame.ts. env-core's calendar system owns the real values; the stub does not update them while ticking.
- SpeciesDef is PROVISIONAL because digest 07 was never available. The Lasius data is minimal: the life history, nest template and diet tables are filled in, but there are no other species and no economy module parameter blocks beyond a placeholder.
- Snapshot and stateHash take about 0.5 s at 2500 ants. The main cost is in the core encoder, which I do not own. Autosave should use a structured clone, and stateHash should only be used in tests.
- Lasius male upkeep is 0.06 in GDD 07 and 0.08 in GDD 06. Both values are left in the data file until species-data decides (contracts-map question (e) 10).
- The extra WoodState fields from GDD 07 (segments, placement, grainAxis, thicknessBu, carvedFrac, sunExposure, windowCount) and `Herd.shelterPellets` are deferred to their module owners and listed in the map.
- The types in species.ts have not yet been checked field by field against digest 07; that check is left to species-data and noted in the map.
- DRY_LEVEL in entities/nests.ts was not moved to balance: it is a marker value, not a tunable.

### Needs from others
- F2-kernel: confirm or reconcile the PROVISIONAL WorldField and NestNav interfaces in src/sim/types/services.ts with field.ts and nav/. Then switch the stub factories createWorldField (src/sim/world/index.ts) and createNestNav (src/sim/nest/index.ts) to the real implementations; createCarveGrid already uses the kernel grid.
- F2-kernel / orchestrator: the voxel flags LOOSE/NATURAL/PLUG are not stored anywhere. Decide whether CarveData gets a flags array (proposal: additive `flags?: (Uint8Array | null)[]` parallel to `chunks`). cheat.fillSphere ignores `loose` until then.
- Module owners: implement the bodies of their stub index.ts. The integration pass then points the no-op command handlers in src/sim/commands.ts (each annotated `// owner: <task>`) at the module functions.
- species-data: complete src/sim/species/data/lasius-niger.ts and add the other three species; confirm the PROVISIONAL SpeciesDef schema.
- rivals: decide how rival-only species get stats. getSpecies() returns undefined for them today, and spawnAnt falls back to standard-worker stats.
- Core owner (`src/core/serialize.ts`): encoding takes about 0.15–0.2 ms per ant. Likely causes: a new UTF-8 buffer for every property name, nine instanceof checks per object, and a linear cycle check up the parents. Caching encoded key strings would probably help most.
- Game/UI owner: pass the player's `dropTo1xOnPossess` setting as `dropTo1x` on every `possess`/`possessRole` command.
- Species-data owner: decide the Lasius male upkeep value (0.06 or 0.08), and check `types/species.ts` against digest 07.

### Notes for the integrator
- Composition: sim.ts -> systems.ts (SYSTEMS) -> module index.ts exports. createServices (src/sim/services.ts) gets services only through the module factories createWorldField and createNavGrid (sim/world), createCarveGrid and createNestNav (sim/nest), and createPheromoneField (sim/pheromones). Swapping in a real implementation means changing only that factory body.
- createSim(state, world?, { systems? }) lets module tests run a reduced system list. makeTestSim({ world, systems, config, seed, terrain: 'flat' | 'noise', prims }) builds a new game on a small test world with cheats on.
- Snapshots: take them at tick boundaries. Queued commands and undelivered events are not included. restore(bytes) returns { state }; rebuild the runtime with createSim(state, world).
- Colonies are never swept from state.colonies, so colonies[0] stays the player's. destroyColony only sets alive=false.
- Colony.livingAnts counts all adults, queen included, and is maintained by spawnAnt / killAnt.
- Pheromone chunk keys use their own packing ((c+512) + (c+512)*1024 + (c+512)*1048576, see pheroChunkKey), not the kernel carve-key packing.
- src/worldgen/index.ts imports the shared builder src/sim/testing/worldBuilder.ts for the placeholder world. worldgen-terrain should drop that import when replacing the body.
- The kernel's other files (world/primHash.ts, world/terrainSample.ts and carve tests) were in progress in the same checkout. All of them typecheck and pass the layering test.
- Failures outside my paths, most likely other engineers' work in progress: a typecheck error at `src/input/inputState.ts:226`; failing tests in `src/input/inputState.test.ts`, `src/render/camera/camera.verify.test.ts` and `src/sim/kernel.test.ts`; `src/sim/kernel.perf.test.ts` times out only when run in parallel with the rest of the suite.
- `src/sim/tmpdiag.test.ts`, `src/sim/kernel.ts`, `src/sim/kernel.testWorld.ts` and `src/sim/kernel.perf.test.ts` are kernel files and I left them alone. tmpdiag looks like a temporary diagnostic that should be removed before commit.
- Command order: commands queued by a handler run as the next batch in the same pass, after the rest of the current batch.
- `applyCommand` now catches handler errors. A module bug in a handler therefore shows up as a `command-rejected` event with `reason: 'handler-error'` plus a `[commands]` log warning, not as a crash. Tests that want to fail loudly can listen for that event.

### Contract changes
- src/sim/types/geom.ts: appended 'insulation' to MATERIAL_IDS (GDD 03 material). Appended at the end, so existing byte codes are unchanged.
- src/sim/types/services.ts re-exports the kernel's carve types (BrushOptions, BrushResult, CarveChange, CarveGrid, CarveListener, ChunkMesh, DigPredicate) from '@/sim/nest/carve'. That makes the kernel's own interface the CarveGrid contract, as the spec asked when kernel files already exist.
- SimState root gains three fields not in guidance §3: rngStreams (named RNG streams), ecology (EcologyState) and rivals (RivalsState), both from GDD 05.
- Walker gains radius; NavState gains fieldKind and routeId. Additive to the guidance §4 shapes.
- TASKS gains 'raid' (GDD 05) at the end, so per-task arrays are TASKS.length = 18. MARKER_KINDS gains 'satellite' (GDD 07).
- src/sim/types/eventsNest.ts: `command-rejected` gains an optional `detail?: string`; reason codes documented as 'unknown-type' | 'cheats-disabled' | 'handler-error' | module codes.
- src/sim/types/commands.ts: `possess` and `possessRole` gain an optional `dropTo1x?: boolean` (default true).
- src/sim/types/world.ts: new exported `WorldDelta.wood` is now `WoodState[]`, with the same three fields (primId, moisture, decay). The units are corrected to moisture in % and decay as a class 0..4.
- src/sim/types/plant.ts: `Herd.relocations: number` added. `spawnHerd` is the only place that creates herds and it sets 0.
- src/sim/types/config.ts and environment.ts: comments only. The start day is clamped to the configured season length and a winter start throws; the rain ring comment now names RAIN_HISTORY_HOURS.
- src/sim/entities/context.ts (mine): `EntityCtx` gains an optional `world?: { bu }`, plus a new helper `worldBu(ctx)`.
- src/sim/createGame.ts: new export `startCalendarTick(config)`.
- Balance: new constants CASTE_EMPHASIS_DEFAULT, GRANARY_HYGIENE_DEFAULT, LEAF_SELECTIVITY_DEFAULT, HONEYDEW_HISTORY_DAYS, TWILIGHT_HALF_H, MIDDAY_HALF_H, RAIN_HISTORY_HOURS, WEEKEND_FROM, POSSESS_MAX_SPEED, and the stagger offsets (*_OFFSET).

### Acceptance criteria not fully met
- [partial] Finding 5: inline tunables moved to balance, leafSelectivity default 0.3 — All moved to src/sim/balance except DRY_LEVEL. DRY_LEVEL is a 'no water' marker value, not a balance number, so it stays where it is. The Lasius male upkeep 0.06 vs 0.08 is a conflict between GDD 06 and GDD 07, not a transcription error; it is commented in the data file and raised as question (e) 10 in the map.
- [partial] Finding 6: snapshot size and speed — Measured. The cost is mostly in the core encoder's handling of objects and keys, not the per-ant arrays. I documented it on snapshot() and stateHash(); the fix belongs to the core owner.

## F2-kernel

**Summary:** All 9 reviewer findings were real (finding 9 was a documentation gap) and all are fixed at the root cause. All 6 reviewer tests that failed now pass, and none of the reviewer's tests were changed. My paths have 12 test files and 91 passing tests (up from 61). Typecheck reports 0 errors across the whole project. The strict perf budgets still pass. The 9 demo screenshots were re-taken and looked at.

1. **Stale fallback seed in nav (F1).** Each distance field now records, per target point, what it was seeded with: samples within the radius, nothing, or a fallback sample. Incremental updates re-check the points that had no in-radius seeds. A point that gains its first fallback is updated incrementally. A fallback that a rebuild would no longer pick makes the update report that the field must be rebuilt, and the nav service then rebuilds that field. Radius seeding is now per point; before, a point counted as seeded if a sample near another point fell inside its search cube.
2. **`project()` probe missed small cavities (F2).** The 14-ray probe (worst gap 36 degrees) is replaced by 98 rays from a cube-surface lattice (worst gap 14.5 degrees). It finds a standard 2 BU tunnel from about 2.5 BU away from its level set. It is built with `sqrt` only, so it stays bit-identical across JS engines.
3. **Thin crusts dug through, and a fake hole over intact crust (F3, F4).** One root cause: an open sample opens the field in the 8 cells around it. `canDigAt` now refuses any sample that has undiggable ground (hard crust or hard subsoil) within one voxel of it. The reach is widened by the slope, and adjacent ground cells are checked too. The test is a new helper, `hardLayerNear` in `terrainSample.ts`.
4. **Breach flag and field disagreed (F5).** There were two definitions: a voxel rule, an

### Not done
- Marching-cubes normals default to the cavity term's gradient (central differences of the samples), which equals the field gradient on cavity walls and is smoother at seams. The field gradient is available through MeshOptions.gradient but is not the kernel default.
- Breach records are still the brush spheres (the spike approach). I added field.isHoleAt(x, z) for renderers to build a hole mask, but did not build the mask texture; that belongs to render-nest.
- src/sim/world/field.ts is 526 lines, over the 400-line style target. Splitting it would need a new file outside my listed ownership (field.ts, primHash.ts, terrainSample.ts).
- Tunables live in params objects inside my own paths (FIELD_TUNING, CARVE_TUNING, NAV_TUNING, WALKER_TUNING), not in src/sim/balance, which I did not own.
- A one-sided sheet primitive for leaves and paper thinner than about 0.3 BU is not implemented (known limit from spike-nest.md section 5.3).
- src/sim/world/field.ts is 560 lines, over the guidance target of under 400. It was already 526 before this round; I did not split it.
- Breaches now include smooth-blend pinholes (skins thinner than about k/2), which no walker fits through. This is deliberate (the breach flag equals the field's hole mask), but whatever creates entrances (nestops) must decide what counts as a passable entrance.
- On sloped ground the hole mask between sample columns is not bilinear, so a pinhole between columns could in theory go unflagged. None occurred in 900 random sloped trials. Documented in 02-kernel.md section 9.
- Breach spheres can still extend under intact crust next to a breach elsewhere on the same brush (a render risk). Renderers should rasterise field.isHoleAt as the hole mask, as documented.
- Seven failing tests outside my paths were left alone as other engineers' work: src/sim/commands.verify.test.ts (2), src/sim/types/contracts.verify.test.ts (4), and src/sim/time.test.ts, which flags src/sim/balance/environment.ts:40.

### Needs from others
- Integrator / F1b: replace or alias the PROVISIONAL WorldField, CarveGrid and NestNav in src/sim/types/services.ts with the interfaces exported from my files, and build services through createKernel(world, state.worldDelta.carve, { canDigMaterial, isDiggablePrim }).
- Species data: wire SpeciesDef.dig into KernelOptions.canDigMaterial and isDiggablePrim. DEFAULT_DIGGABLE_MATERIALS (Lasius: loam, humus, sand, clay, gravel, wood-decayed, insulation) is a placeholder.
- Balance owner: re-export FIELD_TUNING, CARVE_TUNING, NAV_TUNING and WALKER_TUNING from src/sim/balance/kernel.ts if all tunables must be reachable there.
- loco: rate-limit turning and implement edge latch, prefer-floor bias in tunnels, avoidance and level of detail on top of walkerStep. Call walkerSnapshot once per tick, and walkerSurfaceChanged for walkers near carves, fills and moved primitives.
- nestops: define one NestNav target per nest exit or chamber. Call walkers' surfaceChanged after digBite. Use BrushResult.volume, blockedFraction and breach for pellets, the not-diggable reason and entrance registration.
- render-nest: use kernel.meshChunk (substrate attribute = soil distance, discard > 0), carve.takeDirty(), and field.isHoleAt or carve.breaches for terrain holes.
- Wiring task: change dynamic primitives (mounds, moved objects) through kernel.addPrim/updatePrim/removePrim, not field.addPrim directly. Otherwise nest-nav passability and mesh discard attributes go stale. Walkers nearby still need walkerSurfaceChanged.
- nestops: BrushResult.breach and the new breach records now mean 'this carve opened new terrain-hole columns as the field sees them'. Re-digging an existing hole no longer reports a breach. Pinholes count, so check hole size or nav if you need a passable entrance.
- Renderers: keep using field.isHoleAt as the terrain hole mask. Breach spheres are only the compact record.

### Notes for the integrator
- API reference: /home/user/foundress/docs/design/tdd/02-kernel.md, with decisions in section 2 and measured performance in section 8.
- Recorded deviation: hard terrain crusts are protected by the dig predicate (kernel.canDigAt) instead of the field's HARD group. Normal digging cannot open asphalt, and a tunnel can run under it with a skin of at most half a voxel. Pre-carves with force:true can open cracks through the crust, as directions §K requires. Hard primitives stay in the HARD group, so a slab is a tunnel's exact ceiling.
- Under Vitest every imported binding is read through a getter on a module object, which costs about 5x in tight loops. Hot modules re-bind imports as local consts (const x = xImp). Keep this pattern in any hot sim code, or headless Node runs will be much slower than the browser.
- Perf tests allow 2x for machine load in the normal parallel suite; FOUNDRESS_PERF_STRICT=1 checks the exact budgets. Under the current shared load (load average ~8) BFS timings swing between 29 and 99 ms.
- NestNav processes carve changes lazily on the next query, and the results are deterministic. A fill frees every built field, which then does a full rebuild on next use (about 0.3-0.4 us per open voxel). Component ids are canonical but change after every edit; never persist them.
- WalkerKin matches the contracts' Walker structurally (an Ant can be passed). The kernel never sets medium 'water' and ignores Walker.radius and nav.
- Demo: node tools/harness/play.mjs --root spikes/kernel-demo --query test=1 --script spikes/kernel-demo/scripts/shots.mjs --out test-output/kernel-demo --width 1280 --height 720 --script-timeout 300000. It exposes window.__spike (same verbs as the nest spike) and uses its own vite.config.ts for the @/ alias.
- Test fixture src/sim/kernel.testWorld.ts (flat world, the spike scene and test nest at BU 4) is shared by the kernel tests and the demo. It sits next to kernel.ts as test support and does not depend on F1b's src/sim/testing.
- The src/sim/world, src/sim/nest and src/sim/locomotion index.ts stubs belong to F1b and were left untouched.
- Behaviour change: the default dig predicate is more conservative near undiggable ground. A tunnel dug up under asphalt or tile now stops 0.5-1.5 voxels below the crust instead of at most half a voxel inside it. Samples within one voxel of a hard ground cell are refused at crust depths. World-generation pre-carves with force are unaffected.
- Cost: canDigAt costs about 0.14 us per sample a brush may open, so brush cost is dominated by it. The perf test measures r = 1 BU at 80-90 us deep and r = 3 BU at about 0.3 ms. Force brushes cost about half.
- project() with the probe running now costs 34-67 us (it was about 11 us with 14 rays). It runs only where the gradient vanishes, as in walkerPlace or landing in a chamber interior, never on walker substeps.
- walkerStep clips any request above 8 BU per call (WALKER_TUNING.maxStepDistBU).
- The demo's in-browser world build measured 311 ms in the last run, against 47 ms before. Two other engineers' heavy harness jobs were rendering at the time, and the test-nest carve itself measures 3.9 ms in Node with the hole probe and 3.8 ms without, so this is machine load, not a regression.
- src/sim/world/index.ts and src/sim/locomotion/index.ts show as modified in git; that is not my change (another engineer's stubs).

### Contract changes
- None: src/sim/types/** and src/core/** were not edited. (git shows geom.ts and some core files modified, by other engineers.)
- New service contracts exported from my files: WorldField and createWorldField (src/sim/world/field.ts), CarveGrid, CarveChange, BrushOptions, BrushResult and ChunkMesh (src/sim/nest/carve/*), NestNav and NavSeeds (src/sim/nest/nav/*), WalkerKin, WalkStatus and the walker functions (src/sim/locomotion/walker.ts), KernelWorldInput, Kernel and createKernel (src/sim/kernel.ts)
- CarveData.keys numeric format: chunkKey = (cx+1024) + (cy+1024)*2048 + (cz+1024)*2048^2. This is part of the save format.
- No changes to src/sim/types/** or src/core/**.
- Additive changes to my own service interfaces. CarveGrid is re-exported by src/sim/types/services.ts, but CarveStore is its only implementation:
- CarveGrid: markDirty(box) and setHoleProbe(probe), plus the new exported type HoleProbe.
- WorldField: primBounds(id, out), plus the new exported type PrimBounds.
- NestNav: invalidateBox(box).
- Kernel: addPrim(p), updatePrim(p), removePrim(id).
- WalkerParams: maxStepDist.
- Tuning tables: FIELD_TUNING.probeDirCoord; CARVE_TUNING.maxBreachRecordsPerBrush is now 12 (was 4 and never read), plus new breachSpacingFraction and ellipsoidCoreFraction; WALKER_TUNING.maxStepDistBU.
- New exported helper: terrainSample.hardLayerNear.
- Nav internals: NavChunks.fillPass and refreshBox now return PASS_GAINED/PASS_LOST bits instead of a boolean, and DistanceField.update takes a nearest-sample function and returns -1 when a rebuild is needed. Neither is used outside src/sim/nest/nav.

## F3a-render-input-camera

**Summary:** I reproduced all 7 review findings. Every one was real, and every one is now fixed at its root cause and covered by a test. All 9 previously failing reviewer tests now pass, and none of them was weakened or deleted. The full repo typecheck shows 0 errors. The full vitest suite passes: 50 files, 437 tests (133 of them in src/render and src/input). I ran the harness 10 times (resize at DPR 1 and 2, shots, edge, context-post, live, classic static build, sandboxed pack fixture) and looked at every screenshot. Every run in its final form reported ok:true, with two caveats. The first live.mjs run lost the page in its final dispose() while the machine was heavily loaded by another engineer's harness job; the two reruns passed. The sandboxed run needs --ignore "Blocked pointer lock", because Chromium logs the refused lock in the sandboxed frame as a console error.

1) Dynamic resolution never scaling back up (major, src/render/app/dynamicResolution.ts). On a 60 Hz display a frame never comes faster than 16.7 ms, so the controller could not see spare capacity. A smoothed frame time at the target (within 4 %) for 180 frames now triggers one probing step up. If that step overloads the GPU, the normal step-down undoes it, and the wait before the next probe doubles each time, up to 16x (48 s). One of my own tests, quality.test.ts 'dead band', had encoded the bug (it fed 16.7 ms and expected no change). It now uses 17.5 ms, and a new probe and backoff test was added.

2) Missing GDD 01 §5.1 actions and wrong keys (major, src/input/actions.ts). Added overlay-cycle (O), directives (I), nest-overview (U) and codex (K). photo-mode is now F2 and pointer-lock-toggle is now F8. The demo help text, the main.ts comment and the edge.mjs / sandboxed.mjs scripts now use F8. Recorded decision: sc

### Not done
- Per-action hold-or-toggle is implemented for hurry, dig, inspect, bite, foot and obs-fast. GDD 08 also lists 'Orbit-drag' as toggleable; that is not implemented.
- Pointer-lock and gamepad toasts and auto-pause are not shown here: the input layer only emits events (focus-lost, pad-connected/disconnected/nonstandard, pointer-lock locked/lost/refused, device-changed). Acting on them is the Game/UI task's job.
- The occlusion-cutaway and fade values (FadeOutput: target opacity, occlusion 0..1, capsule) are computed but not used for dithering. The demo only fades the stand-in ant; real dithering belongs to the terrain/carve/ant renderers.
- Depth strategy for GDD 6.1's near/far ratio (near down to 0.005 BU, far 8000 BU): logarithmicDepthBuffer is an option, off by default, because pmndrs DoF has not been tested with it. Reversed depth is untested. Decide in the look spike.
- Exposure (setExposure) sets renderer.toneMappingExposure. That is certain on the post-off path, but I did not verify that pmndrs ToneMappingEffect honours it on the post path.
- Composer MSAA is not used: post always uses SMAA, as in the tech spike.
- spike-look.md and spike-nest.md did not exist, so the preset values (shadow sizes and distances, bloom, density, auto benchmark thresholds) are starting points from the tech-stack doc and GDD 08 LOOK_*. They are kept in one place (quality.ts, autoDetect.ts) for retuning.
- scent-view still has only one gamepad default (Dpad left in P, O and C). GDD 01 5.1 asks for 'Dpad up (O)' as well, but GDD 5.7 allows one gamepad slot per action, so the two rules conflict. This is recorded as a decision in actions.ts; a design decision is needed if per-context pad bindings are wanted.
- Photo mode's Ctrl x0.2 speed (GDD 08 7.9) exists only as the PhotoInput.slow flag. The input layer deliberately ignores every key event that carries Ctrl (GDD 01 5.7 does not offer Ctrl as a modifier), so the Game/settings owner must decide how Ctrl reaches photo mode, or whether to bind slow movement to another key. GDD 08 also says Q/E for photo up/down, while GDD 01 says Space/C; I kept GDD 01's keys.
- Dynamic resolution still judges the rAF interval. GPU timer queries (EXT_disjoint_timer_query_webgl2) would show real headroom without probing; this was not done, because probing with backoff fixes the defect and works on every GPU.
- The sandboxed-iframe harness run needs --ignore 'Blocked pointer lock': Chromium itself logs the refused request as a console error. Our code cannot detect a missing allow-pointer-lock before asking. The script header now documents the flag.
- The colony camera keeps its full distance when its 2 BU lift point is itself inside solid (target under an object), because the trace cannot help there. Positions on the demo field were tested; a target buried under a large overhanging object was not, and that case would rely on occlusion fading.

### Needs from others
- F3b / Game: build the TraceFn from the world service's sphereTrace. Expected meaning: distance a sphere of `radius` travels from origin before f < radius, 0 if it already touches solid. Pass `underground` (fSubstrate(p_ant) < 0), `airborne` and `flying` to ThirdPersonRig.update.
- F3b / Game: call domInput.poll() and then input.update(now) once per frame. Push and pop contexts on view changes. Send pointer-lock-toggle and Settings mouseLook to input.pointer.setPreference. Persist bindings with serializeBindings/parseBindings under localStorage 'foundress.bindings.v1' (try/catch).
- Packaging task: write asset packs in the format documented in src/render/assets/backends.ts: classic scripts doing `(window.__FOUNDRESS_ASSETS__ ||= {})[path] = base64`, plus an inlined `window.__FOUNDRESS_ASSET_INDEX__ = {version:1, packs:[{src, paths}]}`. Include assets/manifest.json in a pack. spikes/appshell-demo/scripts/make-pack-fixture.mjs is a working reference.
- Lighting renderer: call configureSunShadow(light, preset, bu) when quality changes. Terrain/primitive/carve renderers: read ColonyRig.cutaway (plane y, radius, centre, mode) for the slice and x-ray cutaway.
- Game/Settings owner: decide how photo mode's Ctrl x0.2 speed is triggered, since the input layer ignores Ctrl on purpose (GDD 01 5.7 versus GDD 08 7.9).
- Design owner: settle the conflicting photo-mode keys (GDD 01 5.5 says 'exit O', 6.9 and 08 say F2; up/down Space/C versus Q/E) and the scent-view dual pad default versus the one-pad-slot rule.

### Notes for the integrator
- Decision: GDD 01 says context G 'overlaps all' for conflicts, but the default tables reuse G keys in Ph/TL/UI (H = hide-hud and ph-guides; Enter = alert-jump and ph-capture). I treat G as overlapping P, O and C only (the contexts where it is live). With that rule the defaults have zero conflicts, and a test asserts it.
- Decision: analogue axes are rebindable as components named `<axis>.up/down/left/right/stick/drag/in/out`, so WASD fits the GDD's 2-KBM-slots-per-action rule. Extra mouse gestures (double-click to possess) are `fixed` bindings outside the slots.
- Decision: on the gamepad, Start is `menu` as a tap (under 1 s) and `controls-reminder` as a 1 s hold. View is `release` as a tap and `colony-view` as a 500 ms hold. LB is `possess-prev` only on a quick tap that was not used as a modifier.
- Decision: the GDD says camera constants belong in src/game/config/camera.ts, which I don't own. They live in src/render/camera/constants.ts; the Game task may re-export them. Input constants are in src/input/defaults.ts as the GDD names.
- Decision: architecture §8 names src/render/app/assets.ts for the loader. The implementation is in src/render/assets (as the task spec says) and src/render/app/assets.ts re-exports it.
- Decision: the tunnel boom's 3 BU look-ahead scales with speed (zero when standing), and its collision trace starts from the un-shifted pivot, so look-ahead into a bend can never pull the camera in front of the ant.
- Decision: the colony cutaway follows GDD 01 (2 BU slice step, 10 BU below the deepest voxel, R_cut 40..400 BU). GDD 08 says 1 BU and +4 BU; that is a GDD inconsistency for the doc owners.
- Decision: photo-mode radius uses GDD 01's 120 BU (GDD 08 says 400) and 8 aperture stops f/1.4..f/22 with bokeh = 9 / f-number.
- three r187 removed PCFSoftShadowMap; presets use PCFShadowMap. pmndrs CircleOfConfusionMaterial copies camera near/far by value, so PostChain re-syncs them whenever the rig changes the near plane (otherwise DoF focus is wrong).
- Use renderer.forceContextLoss()/forceContextRestore() to simulate context loss: getExtension('WEBGL_lose_context') returns null once the context is lost.
- Chromium logs its own console.error 'Blocked pointer lock ... sandboxed' when the page is sandboxed without allow-pointer-lock. It is not from our code; harness runs inside such a frame need --ignore for it.
- Reproduce: npx vite build spikes/appshell-demo --config spikes/appshell-demo/vite.config.ts --mode classic --outDir ../../test-output/appshell-demo-classic --emptyOutDir. Harness scripts: spikes/appshell-demo/scripts/{shots,edge,live,sandboxed}.mjs (usage in each file header).
- src/render/camera/testing/demoField.ts is shared by the camera tests and the demo (analytic world plus scripted path). It is not production code.
- Input defaults changed: photo-mode is now F2 (was O), pointer-lock-toggle is now F8 (was K), and K is codex, O is overlay-cycle, I is directives, U is nest-overview. Any UI help text or harness script that pressed KeyK or KeyO for those actions must follow.
- unboundRequired() can now also return pad-only ids such as 'move.stick' and the pad side of 'interact', 'release' and 'menu'. The Settings screen should treat these as 'required, unbound' (on the gamepad side).
- rebind() returns {status:'refused', reason:'reserved'} when the input belongs to the locked menu action (Esc or Start tap), whatever resolution is passed.
- PhotoRig: PHOTO_SPEED_BU / PHOTO_RADIUS_BU / PHOTO_FOV_DEG were replaced by PHOTO_SPEED_BU_S, PHOTO_FAST_MULT, PHOTO_SLOW_MULT, PHOTO_MAX_RADIUS_BU, PHOTO_FOCAL_MM and PHOTO_SENSOR_HALF_HEIGHT_MM (all in src/render/camera/constants.ts, nothing outside F3a used the old names). PhotoInput gained optional fast/slow; PhotoOutput gained focalMm; PhotoRig.setFNumber(n) is for the aperture slider.
- New camera constants: CAM_MIN_CLEARANCE_R (0.5) and CV_BOOM_LIFT_BU (2).
- DynResConfig gained atTargetRatio, probeFrames, probeFailFrames and probeBackoffMax (defaults in DYNRES_DEFAULTS); DynamicResolution.probeBackoff is readable for debugging.
- No shared contracts (src/sim/types/**, src/core/**) were changed.

### Contract changes
- None. No files in src/core or src/sim/types were changed.

## F1c-contracts-sync

**Summary:** I reproduced all 8 review findings. Every one was real, and each has a fix plus a test. 15 of the reviewer's 15 tests now pass, and none of them was weakened. Midway through, the env-core engineer replaced src/sim/environment/index.ts with their real implementation, and my stub edits there were overwritten. So the environment-side fixes now live either in their code, which picked up my contract types and balance constants, or in my own paths. The 5 tests that still fail in the full suite are all caused by other engineers' work in progress (listed in needsFromOthers).

What was fixed:
(1) D7.1-D7.4 are applied and recorded in contracts-map section (g).
- D7.1: src/sim/time.ts gains `defaultYearDay` (d28, exact tick arithmetic), `defaultYearDoy` (doy28), `inDefaultYearWindow`, `currentDefaultYearDay/Doy` and `DEFAULT_DAYS_PER_YEAR`.
- D7.2: new contract type `ThermalInputs`. `env.thermal` gains `emaCell` (per 4 BU heightfield cell, with `emaCellMm/Nx/Nz`) and `emaCover` (per cover primitive, with `emaCoverPrimIds`); both start empty (lazily allocated, ruling 3) and createGame sizes the grid. New balance file `thermalInputs.ts` holds `RAIN_INTENSITY` and the related constants. env-core already uses them in their `rainIntensityAt` and `thermalInputs`.
- D7.3: new `BroodCaste = Exclude<Caste,'queen'>` and `BROOD_CASTES`. Brood.destined, egg-laid.destined, cheat.spawnBrood.destined, layEgg and SpawnBroodOptions are narrowed. cheat.spawnBrood now rejects a queen caste with `invalid-caste`.
- D7.4: documented.
(2) Commands arriving as untyped JSON: a new `PAYLOAD_GUARDS` table in src/sim/commands.ts checks setSpeed (via new `isSpeedLevel`) and setDifficulty (preset, plus the new `invalidCustomRules` in balance/difficulty) before any handler runs. A bad command is refused with `

### Not done
- npm test is not fully green: 4 kernel verify tests fail. They are outside my paths and belong to the F2 review in progress.
- WorldField and NestNav are not reconciled with the kernel, and the kernel is not wired in (ruling 1 and the spec leave both to the wiring task).
- GDD 01's `speed-changed` and GDD 06's `autosave.done/failed` are not in the event union, on purpose (reasons in the contracts map §(g)). If the orchestrator wants them, they can be added later as new members.
- Finding 8 is only partly met: the shared calendar record is not frozen. env-core's implementation reuses one mutable record to avoid allocating, and documents 'do not keep it'. I cannot change their file.
- src/sim/testing/stubs.test.ts, src/sim/testing/layering.test.ts and the time.test.ts scan fail because of other engineers' in-progress files (see needsFromOthers). I did not edit those files.

### Needs from others
- Wiring task: reconcile types/services.ts WorldField and NestNav with src/sim/world/field.ts and src/sim/nest/nav, and replace the createWorldField / createNestNav stubs. Note nest/index.ts createCarveGrid ignores the world (no substrate probe yet).
- nestops: maintain WorldDelta.carveFlags (voxel flags LOOSE / NATURAL / PLUG).
- difficulty-rules: confirm the preset rule values I chose in balance/difficulty.ts (open question 5).
- species-data: encode GDD 03's Lasius entrance rule (3 entrances, 4 from 800 workers); fill in the other three SpeciesDefs with the new fields (fixedStats, wildColonySize, growThreshold/matureThreshold, dMin*/vMin/wMin, R0).
- rivals: refine the T3 rival rows marked [E] in src/sim/species/rivals.ts.
- env-core: surfaceTemp (and anything that reads env.thermal.tsurf) returns NaN on a fresh game before the first weather tick. The lawn slot index lies beyond createGame's MATERIAL_IDS.length*2 array, and ensureThermal is never called on the query path. Call ensureThermal in the queries, or ask me to size tsurf to SURFACE_SLOTS. This makes src/sim/testing/stubs.test.ts fail.
- env-core: src/sim/environment/envTestKit.ts is not a .test.ts file and contains hard-coded 7 and 28 (`?? 7`, `/ 28`, `5 | 7 | 10`). Use DEFAULT_SEASON_LENGTH_DAYS, DEFAULT_DAYS_PER_YEAR and SeasonLengthDays. This makes the time.test.ts scan fail.
- env-core: src/sim/environment/zz-explore.test.ts fails to load (it looks like a scratch file).
- env-core: delegate defaultYearDayOf/defaultYearDoyOf/inDefaultWindow to time.ts defaultYearDay/defaultYearDoy/inDefaultYearWindow, and REFERENCE_DAYS_PER_YEAR to DEFAULT_DAYS_PER_YEAR (map (h)14). Also choose between the per-material tsurfDay/tsurfSeason and the per-cell/per-cover emaCell/emaCover from D7.2, and document the choice (map (h)12).
- env-core: setSpeed validation now lives in commands.ts PAYLOAD_GUARDS. timeCommands.ts does not need to repeat it, but must not depend on receiving invalid speeds.
- sources-core: src/sim/ecology/sources/season.ts names a parameter `window`, which the layering test flags as a DOM global. Rename it, e.g. to `win`.
- phero: src/sim/pheromones/sense.test.ts has a type error and 3 failing tests (work in progress).
- Design owner: GDD 07 still writes fSeason on the 1-based D (line 116 says 'by 1-based D = d + 1'). Edit it to d28 to match C1 and E-123, and tell species-data to subtract 1 when entering the GDD 07 tables.

### Notes for the integrator
- To register a system, behaviour or command handler, add it to your own module's `systems`, `behaviours` or `commandHandlers` export. Never edit systems.ts or commands.ts for that. A new command type also needs a row in COMMAND_OWNERS in src/sim/commands.ts (the compiler forces it).
- Species economy modules have stub folders at src/sim/species/modules/{honeydew,wood,granary,fungus}/index.ts. Their owner tasks own those folders.
- Possession, time controls, directives, markers and the cheat handlers moved from commands.ts into the owning module indexes (ants, environment, colony, nest, ecology, progression, locomotion, world). Their behaviour is unchanged except that pause is now the `paused` flag: `setSpeed {speed: 0}` pauses and keeps the running speed.
- setSpeed now refuses anything above 2x during the opening phases search..lay (GDD 06 §4, E-17); the new event reason is 'opening'.
- setDifficulty never changes seasonLengthDays, startSeason or the rival count mid-game (GDD 06 §14.1).
- Ant.lengthBu is now in world BU (the same as species BU for the player's species), so rival-only ants collide consistently.
- Decisions made without asking (recorded in the contracts map): default marker radii for point markers (4 BU); cue `variant` replaced by namespaced cue ids; the release-alarm cooldown dropped; the brood causes `raided` and `poison` dropped to match registry B3.
- I found no uncommitted state outside my paths that I changed. Other engineers edited kernel files while I worked; I did not touch them.
- env-core rewrote src/sim/environment/index.ts during this round, so the module now has its real implementation. My stub additions there (thermalInputs, rainIntensityAt, setSpeed check, calendarNow cache) were superseded. Their versions use my ThermalInputs type and RAIN_INTENSITY constants. The setSpeed and setDifficulty checks live in commands.ts so module rewrites cannot drop them.
- ThermalStateData's new required fields are filled only by createGame. No saves exist yet (SAVE_VERSION is still 1), so no migration was added.
- time.test.ts scan change: the regex now ignores numbers that are part of identifiers (the C1 names d28 and doy28 were false positives), and REFERENCE_DAYS_PER_YEAR = 28 is on the allowed list as a named reference-year constant. commands.test.ts 'F1b tick order' now checks the F1b systems as an ordered subsequence, because module owners may add systems (ruling 13). env-core added ant-thermal and skip.
- The setDifficulty handler in progression/index.ts no longer validates on its own; it relies on the command layer (applyCommand is the only caller, via sim.ts).

### Contract changes
- This task was allowed to rename and remove (the freeze takes effect after F1c). Every rename and removal is listed in docs/design/tdd/01-contracts-map.md §(f).
- New type files: src/sim/types/rivalSpecies.ts (RivalSpeciesDef).
- New contract types and helpers: CommandHandler, CommandHandlerMap, BehaviourTable, SYSTEM_PHASES/SystemPhase, System.phase, Sim.behaviours, Behaviour.species, CarveFlagsData, DifficultyConfig, DifficultyParams, HistoryState, JournalState, DeviceProfile, CodexUnlock, GrappleLock, RivalAbstract, Nutrients, DigBiteResult, ActionPrompt, AntInspect, RemedyId, allCodexIds(), TASK_COUNT.
- MATERIAL_IDS: 'mortar' appended at the end, so existing material codes are unchanged (the kernel reads them).
- FROZEN comment added at the top of src/sim/types/index.ts.
- Nothing changed in src/core.
- types/ids.ts: new type BroodCaste = Exclude<Caste,'queen'> and new const BROOD_CASTES
- types/brood.ts, commandsCheat.ts (cheat.spawnBrood.destined), eventsColony.ts (egg-laid.destined): narrowed from Caste to BroodCaste (D7.3). This is a narrowing, not an additive change; it is recorded in map §(f) and no module consumed the old type
- types/ids/progression.ts: new helper isSpeedLevel(v)
- types/environment.ts: ThermalStateData gains emaCellMm, emaCellNx, emaCellNz, emaCell, emaCoverPrimIds, emaCover (D7.2); new interface ThermalInputs. env-core separately added the optional tsurfDay/tsurfSeason fields and WeatherForecast
- types/species.ts: comments only. fSeason and layWindows are keyed on d28
- types/config.ts: comment only. WorldParams rule fields are generation-time copies
- types/diagnostics.ts: comment example fixed
- balance: new file thermalInputs.ts (RAIN_INTENSITY, RAIN_INTENSITY_STORM, RAIN_INTENSITY_SPRINKLER, THERMAL_DAY_EMA_TAU_GD); difficulty.ts gains MAX_RIVALS, presetRivals, presetHumanActivity, invalidCustomRules
- time.ts: defaultYearDay, defaultYearDoy, inDefaultYearWindow, currentDefaultYearDay, currentDefaultYearDoy, DEFAULT_DAYS_PER_YEAR
- createGame.ts: worldRuleInputs, syncWorldParams; createNewGame syncs world params when it generates the world
- worldgen/params.ts: defaultWorldParams takes an optional 5th argument with rule inputs; new type WorldRuleInputs

### Acceptance criteria not fully met
- [partial] Finding 8: calendarNow cache keys and sharing — The stale-cache part is fixed: env-core's calendarNow (environment/calendar.ts) keys on calendar tick, moon phase and season length, and d7.test.ts covers it. The record is still shared and mutable: env-core reuses it on purpose to avoid allocating and documents 'do not keep it'. My frozen-object fix was overwritten by their rewrite.
- [partial] typecheck clean and tests green in my paths — No type errors in my paths. Three of my test files fail only because of others' work in progress: layering (sources season.ts), stubs (env-core surfaceTemp NaN), time.test (env-core envTestKit literals).

## F-int-foundation

**Summary:** F-int is done. The simulation now runs on the real kernel. createServices builds one kernel per sim with createKernel(world, state.worldDelta.carve, { canDigMaterial }), and exposes it as the new `sim.kernel`. sim.field and sim.carve are the kernel's own objects. sim.nestNav is a forwarding object over the kernel nav that adds the nest-level helpers (distance, descend, onCarve, rebuild); a new helper nestFieldId names the fields, and registerNestTargets registers each nest's exit, seal and chamber fields. createSim calls it for every nest, so the fields are rebuilt after a load. The contract WorldField and NestNav now extend the kernel interfaces. Every old member is kept, so all changes are additive. WorldField adds `diggability`, computed from the new GDD 03 §2.1 table in balance/nest.ts (DIG_SPEED x DIG_SPECIES_MULT, function digFactor). The same table drives the kernel's dig predicate and decides which primitives are diggable. The state's dynamic primitives and mounds are registered in the kernel when a sim is created. The one planned kernel change is height overlays in field.ts: small bilinear grids added to height() and to the terrain term, with analytic gradients, and a pile material for materialAt. The kernel wrappers also mark the carve meshes under an overlay dirty, and moundOverlay(m) converts a Mound record into an overlay. createNewGame applies the world's pre-carves through the kernel's carve grid, then places the founding queen with walkerPlace; locomotion.placeOnSurface uses walkerPlace too. makeTestWorld and makeTestSim gain these options, documented at the top of testWorld.ts: features (wall, a table with a leg-to-top climb route and a world object, stone, stem), nest: 'small' (entrance shaft, food / nursery / royal chambers and a blind branch, registe

### Not done
- docs/design/tdd/02-kernel.md (owned by F2) does not document the new height-overlay API yet. It is documented in contracts map §(i) and in the field.ts and kernel.ts doc comments.
- Mound.base (support height for a pile resting on a primitive) is not modelled: the overlay sits on the terrain. Mound relaxation, batching and refreshing the overlay after a batch are nestops' work.
- createNewGame does not write NATURAL voxel flags (WorldDelta.carveFlags) for pre-carves; that belongs to nestops.
- The nest field registration is a simple default (exit and seal from entrance positions, chambers from their centres). Plan fields and updates when entrances or chambers change are nestops' job (they should call registerNestTargets).
- GDD Appendix E checks that need other modules: GDD 03 checks 1-24 and the first two clauses of 25 (bites, pellets, mounds, plans, chambers, microclimate, flood, collapse: nestops, architect, founding, env); GDD 04 check 19 (height deltas and grass across save/load: worldgen and loco) and check 20 (world-edge bounds: loco; could become a soak invariant once loco lands); GDD 01 check 3 (haul behaviour). Covered at my level: GDD 03 N1 (every chamber reaches the exit), check 25's save/load determinism clause, and GDD 04 check 19's carved chunks + full-state hash clause.
- No visual or harness check: nothing visual in this task.

### Needs from others
- nestops: keep the nav fields current by calling registerNestTargets(sim.nestNav, nest, bu) from src/sim/services.ts whenever entrances or chambers change; add plan fields under nestFieldId(nestId, {kind: 'plan', id}). Carve with sim.kernel.carve* (species dig predicate). After each mound batch, call sim.kernel.setHeightOverlay(moundOverlay(m)). Write NATURAL flags for pre-carves.
- nestops / loco / ecology: change dynamic primitives only through sim.kernel.addPrim / updatePrim / removePrim, and keep them in state.worldDelta.dynPrims (createSim re-registers that list).
- species-data: SpeciesDef.nestTemplate.nestMaterials for Lasius (humus 1.1, sand 1.4, clay 0.5, gravel 0.6) disagrees with GDD 03 §2.1, which balance DIG_SPEED / DIG_SPECIES_MULT now follows (1.3, 1.6, 0.45, 0.35). Please align the data or drop the field.
- F2 / doc owner: document the height overlays in docs/design/tdd/02-kernel.md, and remove the 'TODO(integration): re-export from src/sim/balance' comments in carve/params.ts, nav/params.ts and walkerParams.ts (done through balance/kernel.ts).
- loco: replace fakeNavGrid in createNavGrid; build steering on sim.nestNav / sim.kernel.nav and walkerStep with sim.kernel.walker; consider adding a world-bounds soak invariant (GDD 04 E20) as `invariants` exported from locomotion/index.ts.
- Owners of the failing reviewer verify tests: sources-core (sources.verify, tier2.verify), env-core (envCore.verify: stone thermal depth, queries draw rng.weather), phero (caps.verify, perf.verify), render (lighting, worldRenderer, primitives verify). colony-core: typecheck errors in colony/queen.ts and colony/diagnostics.ts.

### Notes for the integrator
- Decision: sim.nestNav is a forwarding object rather than the kernel nav instance itself. Assigning the helper methods onto the instance overwrote the kernel class's private `descend` (found and fixed in this task; a test covers it). sim.field IS the kernel field, with `diggability` added as a property; createWorldField throws if the field already has a member of that name.
- Decision: the dig rules come from the GDD 03 §2.1 material table in balance (precedence: GDD 03 owns substrates), not from SpeciesDef.nestTemplate.nestMaterials. The kernel's canDigMaterial is digFactor(species, m) > 0 for the PLAYED species.
- Decision: FOOT_OFFSET_BU stays 0.1 (within GDD 04's <= 0.15 BU limit). The kernel walker reads each walker's own footOffset; tests and the soak pass with it.
- Decision: createNewGame throws if walkerPlace finds no surface at queenStart. That is a world-generation bug and should fail loudly.
- Decision: the small test nest is carved into the state with force brushes after createNewGame (not as WorldData.preCarve), so it works with any test world. The founding queen stays on the surface; the colony's existing nest becomes the small nest (founding record cleared).
- Decision: sim.verify's scripted cheat.carveSphere and the other carve cheats still call sim.carve directly, without the dig predicate (cheats).
- Contradiction recorded: SpeciesDef.nestMaterials vs GDD 03 §2.1 dig speeds (see needsFromOthers). Resolved by precedence, the owning chapter: GDD 03.
- Notes from notes-foundation.md acted on: kernel wired through createKernel with the species dig rules (F1b, F2, F1c); tunables re-exported from balance (F2); dynamic primitives go through the kernel wrappers (F2: kernel exposed as sim.kernel, dynPrims re-registered on load); stub factories switched (F1b, F1c); createCarveGrid now has the substrate and hole probes (F1c). Not acted on, outside my scope: the core encoder speed (core owner), the Lasius male upkeep and SpeciesDef cross-check (species-data), env-core's calendarNow sharing and envTestKit constants, and the input / render items.
- src/sim/types/pheromone.ts and several balance files (actions, colony, ecology, environment, environmentWeather) show as modified in git; those edits are by their module owners, not me.
- The soak tool runs at about 0.04-0.12 ms per tick with the current stub systems. Checking the state-encodes invariant dominates the check time (about 9 ms per check).

### Contract changes
- types/services.ts: WorldField now extends the kernel's WorldField (src/sim/world/field.ts) + diggability(p, species). All old members are kept; project() gains an optional outNormal.
- types/services.ts: NestNav now extends the kernel's NestNav (src/sim/nest/nav) + the old distance / descend / onCarve / rebuild helpers (old names kept).
- types/services.ts: new required runtime member Sim.kernel: Kernel. It is not persisted state; only createSim builds Sims. Tests that fake a Sim with `as unknown as Sim` are not affected.
- types/services.ts: new helper nestFieldId(nestId, target).
- types/services.ts: kernel types re-exported from the barrel: FieldParams, HeightOverlay, PrimBounds, NavSeeds, NavStats, Kernel, KernelOptions, WalkerKin, WalkStatus, WalkerParams.
- types/moduleApi.ts: new interface SimInvariant { name, check(sim, fail) }.
- Kernel (F2 files, the planned change): field.ts gains HeightOverlay, setHeightOverlay / removeHeightOverlay / heightOverlay, overlays included in height(), the terrain term and materialAt; minHeight is now mutable inside the class (the interface still says readonly). kernel.ts gains Kernel.setHeightOverlay / removeHeightOverlay, which also mark dirty the carve meshes under the pile.
- Module factory signatures (stub index files): createWorldField(kernel), createCarveGrid(kernel), createNestNav(kernel), replacing (world, carve) and (data, world). The only caller is services.ts.
- Balance: nest.ts adds DIG_SPEED, DIG_SPECIES_MULT and digFactor(); new balance/kernel.ts re-exports FIELD_TUNING, CARVE_TUNING, NAV_TUNING and WALKER_TUNING.

### Acceptance criteria not fully met
- [partial] 1. npm run typecheck clean; all tests green, including F1b's determinism and snapshot tests on the real kernel — My paths typecheck clean, and every test in my paths passes, F1b's determinism and snapshot tests included. The repository is not fully green: 21 failing tests are in new reviewer verify tests for other modules, and kernel.perf misses its BFS time limit only because of machine load (it passes alone). Other engineers' files also have typecheck errors. All of these are outside my ownership.
