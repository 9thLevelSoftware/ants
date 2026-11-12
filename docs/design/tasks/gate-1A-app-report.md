# Stage 1A gate — application half (int-1A-app) report

The running game now draws the real world, nest and ant renderers on the real simulation. Debug renderers remain
only for the `creatures` and `fx` slots (no real renderer exists yet) and for `?render=debug`.

Evidence: `tests/e2e/stage1a.mjs` (harness, `test` quality, 1280 x 720), output in `test-output/stage1a/`
(git-ignored). Run: `node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test"
--script tests/e2e/stage1a.mjs --out test-output/stage1a --script-timeout 1600000` (about 10 minutes on this
machine; `STAGE1A_SKIP_HIGH=1` skips the two high-quality shots).

## 1. What the player can do now (Stage 1A)

- Start a new game on a generated world (seed 1: lawn soil next to a gravel patio), the founding queen possessed
  in third person, walking with camera-relative movement on the real terrain.
- Dig with the action primitive (`dig-bite`, ramp brush aimed by a point target): a sloped shaft through the
  ground into the soil and a widened end at the bottom. The terrain opens visibly (field hole mask), the nest
  renderer meshes the cavity live, the camera follows the queen underground and the view switches to the
  underground look (exposure / fog) from the camera position.
- Every bite makes a soil pellet (items drawn by the ant renderer); surface pellets settle into a spoil heap
  that the world renderer draws as a mound.
- Cheat-spawned workers (60) appear on the surface, drawn with the real ant model and LOD.
- Time controls (1x, 2x, 8x outside possession, pause), observer view (free fly and follow orbit), colony view
  with the cutaway slice over the nest, runtime quality switch (`__game.quality('test' | 'low' | 'high' ...)`).

Not yet possible in the running game (simulation side, Stage 1B or the sim half): workers do not move (no
behaviours yet), the founding chamber is not registered as a chamber, so `lay-egg` is refused
(`not-allowed-here`) and eggs are cheat-spawned in the script; no entrance record is created for the shaft;
hauling pellets out of the tunnel (the script uses `cheat.spawnPellets` beside the entrance to stand in for it).

## 2. Screenshots (`test-output/stage1a/`, all looked at)

Final run: `ok: true`, no console errors, about 9.5 minutes (`test-output/int1a/final.out`). Earlier iterations of the
same script are in `test-output/int1a/s1a*`, `s1b`.

| File | Judgement |
|---|---|
| `01-surface-third-person.png` (07:00) | Good. Real terrain textures (patio gravel, lawn soil), haze, the real queen model behind-above, upright on the ground, prompt chip. The winged queen still reads greyish from directly behind because the sky reflects on the folded wings; acceptable. |
| `02a-entrance-fresh.png` (14:52) | Good. The shaft mouth is a clean black hole in the terrain (field hole mask), a second shallow pit from the first bite next to it, no seams or sky slivers at the rim. |
| `03-inside-tunnel.png` (night) | Poor. The camera is in the `crevice` state 0.23 body lengths from the queen in the steep shaft, so the occlusion dither of the walls fills most of the frame; walls are lit warm-orange by the sense light. The renderer is correct, the camera placement is not useful (views task, section 5). |
| `04-chamber-queen.png` | Fair. Underground look (exposure, warm sense light), the widened end of the shaft, the queen dithered by the camera fade in the foreground; the six eggs are behind her in this run (visible in the earlier run `test-output/int1a/s1b/04-chamber-queen.png`). |
| `07-colony-view.png` | Fair. Colony view from the possessed queen underground: the slice cap opens the ground over the dug room, the queen and the pellets inside it; the cap is small at this camera distance and colour-close to the soil. |
| `02-entrance-mound.png` (12:00) | Fair. Spoil heap (cheat-dumped pellets) beside the entrance and the small first heap at the mouth; the mouth is partly buried by that first heap (section 5); heaps are square pyramids (nestops relaxation). |
| `05-workers.png` | Good. 60 cheat-spawned workers with the real model and LOD, standing on lawn, heap and patio; none sunk or floating. They do not move (no behaviours yet). |
| `06-observer-surroundings.png` | Good. Free observer high above: zone boundary lawn / patio, haze, the heap and the workers as specks. |
| `08-high-surface.png` | Good. High preset after a runtime switch: depth of field, bloom, PCF shadows, the gravel at macro scale, the workers and the heaps. |
| `09-high-underground.png` | Fair. High preset underground: exposure honoured on the post path, DoF blur, the queen dithered by the fade; mostly tunnel wall because of the close camera. |


## 3. Performance at `test` quality (60 workers, 1280 x 720, SwiftShader on a loaded 4-core machine)

`__game.perf()` right after spawning the 60 workers (minimum over the runs today; the machine had load 8-12):

| Measure | Value |
|---|---|
| Draw calls | 15 in total (terrain 7 levels, nest 2 regions, ants and items 4, sky, mound) |
| Triangles | 66,981 (terrain 32,256, nest 6,904, ants + items 20,216) |
| Simulation ms per tick | 0.47 (61 ants, Stage 1A systems; 1.78 in a run under heavier load) |
| Render CPU per frame | 11.3 ms (ant renderer 0.8 ms of it) |
| Nest re-mesh, worst frame | 9.3 ms (test preset budget 4 ms; the kernel's one-chunk marching cubes, known) |
| Frame time | 3.9 s per 1280 x 720 frame in SwiftShader (terrain fragment shader); not representative of a GPU |

Quality switches (scripted, test -> low -> high -> test -> low -> test, a frame rendered after each): no errors;
`perf().memory` geometries 22 -> 17 and textures 16 -> 18 after returning to `test` (world rebuilt for the preset),
unchanged over the second test <-> low cycle; shader programs 25 -> 42, also unchanged over the second cycle
(three keeps one program per material variant it has seen; bounded, not a leak).


## 4. Defects fixed (file — cause)

| Defect | File(s) | Cause and fix |
|---|---|---|
| Real renderers never used | `src/render/index.ts`, new `src/render/slots/*` | Nothing registered. `WorldSlot`, `NestSlot`, `AntsSlot` adapt `FrameInfo` and the registry lifecycle to each renderer; the registry passes `ctx.peer(slot)` so the nest shares the world's `MaterialLibrary`; `init` / `onGameStart` may return promises the game awaits. |
| First frames of a game drawn without the world | `src/game/Game.ts` | `onGameStart` was fire-and-forget while `WorldRenderer.setWorld` loads textures asynchronously. `newGame` now awaits `registry.onGameStart(sim)` during the loading screen; `boot` awaits the renderers' texture loads before `__ready`. A cancelled load leaves the renderers to the newer request; `endGame` always calls `onGameEnd`. |
| Old world kept after the game ended | `src/render/world/lighting/worldRenderer.ts`, `terrain/terrainRenderer.ts` | No way to drop a world. New `WorldRenderer.clearWorld()` / `TerrainRenderer.clear()` (also cancels a pending `setWorld`). |
| Screenshots timing out / GPU backlog (36 s first frame) | `src/game/Game.ts` | Scripted test-mode renders queued heavy SwiftShader frames. `renderNow` (debug `renderFrame`) now waits for the GPU with a 1-pixel read-back in test mode and clears the dirty flag so the rAF loop does not draw the same frame again. |
| Underground look decided from the subject, not the camera | `src/game/Game.ts`, new `src/game/undergroundSwitch.ts` | The possess view used the ant's underground flag, so a camera above an entrance turned dark. Now from the camera's substrate distance with the nest look's hysteresis band (snap on settled screenshots). |
| Possessed ant and camera disagreeing (judder) | `src/render/ants/simAdapter.ts`, `AntRenderer.ts`, `frame.ts` | The ant renderer only interpolated tick poses. `AntFrameInfo.possessedPose` (locomotion's per-frame prediction, the pose the camera follows) replaces the interpolated pose of the possessed ant. |
| Possessed ant pale / milky | `src/render/ants/shader/fragmentChunk.ts`, `AntRenderer.ts` | Two causes: the hyaline wing membrane alpha 0.16 over four folded layers read as milky white from the third-person camera (now 0.07); the emissive highlight rim scaled with the scene exposure (+2-3 EV at night and underground) and used a broad (1 - N.V)^2 term — now compensated by `2^-EV` and narrowed to ^4 (a rim). |
| Camera fade and occlusion cutaway not drawn | `AntRenderer.ts`, `shader/*`, `slots/nestSlot.ts`, `src/render/index.ts` | `FrameInfo.subjectOpacity` was ignored and `fade` not passed. The possessed ant (the only positive highlight) is dithered by `uSubjectOpacity`; nest walls in the camera-ant capsule are dithered through `NestRenderer.setOcclusionCapsule`. |
| Open holes glowing orange at night | `src/render/nest/lighting/nestLighting.ts`, `NestRenderer.ts`, `slots/nestSlot.ts` | The nest's ambient and sense light are calibrated for the underground exposure; the surface night exposure (about +3 EV) amplified them. `setArtificialGain(min(1, 2^(EV_underground - EV)))`. |
| Ants, eggs and pellets black underground | `slots/nestSlot.ts` | Walls have their own sense light; scene-lit objects only had the dim underground ambient. A scene point light (always present, intensity 0 above ground, so no shader recompiles) stands in for the sense light around the possessed ant. |
| Cutaway did not hide the surface over the nest | `slots/nestSlot.ts` | `patchSurfaceMaterial` was demo-only. Applied lazily to every scene-lit standard material outside the nest group (terrain, mounds, primitives, ants, items) while the colony cutaway is on. |
| Observer follow orbit below the ant (F3b finding) | `src/render/camera/observerRig.ts` | The clamp used GDD's elevation range on the look pitch; follow pitch now clamps to `[-85°, +10°]` look pitch = `[-10°, 85°]` elevation. Test `observerFollow.test.ts`. |
| No "stop following" (F3b finding) | `observerRig.ts`, `src/game/views/viewDirector.ts` | `setFollow(null)` always started the 2 s loss hold. New `ObserverRig.stopFollow()`; the ViewDirector's hold run-out workaround is removed. |
| Shadow depth material ignored the wall discards (truncated finding) | `src/render/nest/materials/nestMaterials.ts` | Depth pass mirrors the skin band with its terrain-hole exception and the colony slice (the occlusion dither stays view-only, decision). Test `depthMaterial.test.ts`. |
| Per-frame allocations in the world update path (truncated finding) | `worldRenderer.ts`, `primInstances.ts`, `primitiveRenderer.ts`, `moundRenderer.ts`, `timeOfDay.ts`, `terrainRenderer.ts`, `skyEnvironment.ts`, `simAdapter.ts`, new `lighting/signature.ts` | String signatures (env key, primitive and mound signatures), a `Set` per frame, spread copies of moved primitives every frame, a gain array and a `forEach` closure. Now numeric FNV signatures, reused sets, moved primitives rebuilt only when the object moves change. Test `signature.test.ts`. |
| RegionBuffer test with the wrong attribute stride (truncated finding) | `src/render/nest/mesh/regionBuffer.test.ts` | `nest: nv * 2` instead of `NEST_ATTR`. |
| Debug renderer tests assumed no real renderer | `src/render/debug/debugRenderers*.test.ts` | They now build the registry with `forceDebug` (the `?render=debug` path they test). Assertions unchanged. |
| `possessedPose` imported from a locomotion internal file (F3b need) | `src/game/sim/possessedPose.ts` | Locomotion's index exports it; imported from `@/sim/locomotion`. |

New wiring that is not a defect fix: LOD observer (`setLocoObserver`) follows the camera focus (re-sent when it
moves more than 1 BU); `mound-changed` events invalidate mounds; `carve-chunks-dirty` events mark nest chunks;
surface wetness eases toward the weather's precipitation; daylight into tunnels follows the world's light level;
`reducedMotion`, hover / inspect highlights (`__game.highlight(hover, inspect)`), runtime quality
(`__game.quality(id)`, `Game.setQuality`), `perf().memory` (GPU geometries / textures / programs),
`__game.query.mounds()` and `__game.query.items()`.

## 5. Defects and gaps left (with reproduction)

| Defect / gap | Reproduction | Owner |
|---|---|---|
| A dug shaft gets no entrance record and no chamber is registered for the widened end; `lay-egg` is refused `not-allowed-here` | `stage1a.mjs` log lines `chamber {..."chambers":0,"entrances":0}` and `egg {... "fail":["lay-egg:not-allowed-here"]}` | nestops (entrance from breach, chamber detection) / founding (1B) |
| The first surface pellets settle into a heap ON the entrance: the hole is buried (the field overlay closes it; the renderer shows what the field says). Screenshot 02 vs 02a | `stage1a.mjs` 02a (fresh, hole visible) then 02 (after settling) | nestops (spoil placement must keep the throat open / treat it as an entrance mound) |
| Mounds and heaps are square pyramids (4-neighbour relaxation) | screenshots 02, 05, 08 | nestops (mound relaxation, e.g. 8-neighbour or radial) |
| Founding-state commands are stubs (`cheat.setFoundingState` is a no-op), so the queen's founding dig never expels onto a mound | `__game.cheat.raw({type:'cheat.setFoundingState', ...})` has no effect | founding (1B) |
| Cheat-spawned workers do not move (no behaviours in Stage 1A) | `stage1a.mjs` `workers {"spawned":60,"moved":0}` | beh-forage / beh-nest (1B) |
| The scripted dig depth varies between runs of the same script (11.4, 11.1, 10.8, 9.5, 5.7 BU over five runs today) | run `stage1a.mjs` twice and compare the `shaft` log line | Most likely other engineers' simulation changes landing between my runs (the determinism script itself passes with identical hashes); recheck when the tree is quiet |
| The third-person camera sits within about 1 body length of the queen in the shaft; the fade dither then covers much of the view | screenshots 03 / 04 (tunnel and room shots) | views (GDD 01 6.4 tunnel boom tuning) |
| Colour grade (frost desaturation, night / golden gain) not applied | `LightingState.saturation/gain` computed, unused | render/app look (1B) |
| Software-GL frame cost: 3-8 s per 1280 x 720 frame at `test` (terrain fragment shader), so harness scripts must render few frames | `perf()` frameMs in section 3 | none needed for a GPU; scripts keep to settled single frames |
| Tests in `src/render` failing outside this task: `world/decor/DecorRenderer.verify.test.ts` (2, reviewer tests waiting for the decor fixer), and the load-dependent `nest/mesh/chunkMeshManager*.test.ts` timing tests (pass when run alone) | `npx vitest run src/render` | render-decor; perf note |
| Type errors in `src/ui/**` (Panel, Modal, screens, settings tabs, styles) | `npm run typecheck` | ui-shell work in progress in the same checkout (not touched here) |


## 6. Notes items and their outcome

Legend: **done** (fixed or wired in this task), **decision** (resolved by a recorded decision), **left** (owner named), **sim** (simulation half / sim module owner).

### render-world (notes-1A)
| Item | Outcome |
|---|---|
| Register WorldRenderer; ctx.setExposure; frame.subject; onMoundChanged on `mound-changed`; setWetness from weather | **done** (`slots/worldSlot.ts`; wetness eases toward `min(1, 2 x precip)`, constants in `slots/params.ts`) |
| A re-export `src/render/world/index.ts` | **decision**: not needed, the slot imports `../world/lighting` |
| env-core real `sunDirection` | **sim**: the adapter already uses a real answer automatically |
| Grade effect for `LightingState.saturation` / `gain`; the macro DoF curve | **left** (render/app look work, Stage 1B "decor/look"); saturation and gain are computed but not applied |
| Nest skin discard at or below the hole margin | **done** (unchanged constants; the nest still imports HOLE_PROBE_DEPTH_BU / HOLE_MARGIN_BU) |
| One owner for underground exposure / fog | **decision**: the world renderer (its `UNDERGROUND` constants) owns exposure and fog; `NEST_LOOK.exposureEV` is only the calibration point of the nest's artificial-light gain |
| Mounds not in the world field | **sim** (resolved by F-int height overlays) |
| `WorldDelta.heightDeltas` tile layout unconfirmed | **left** (worldgen / weather-effects; nobody writes deltas yet) |
| Pass `reducedMotion` in WorldFrame | **done** (from the camera setting `reducedMotion`) |
| Dapple for grass / decor / water renderers | **left** (render-decor; DecorRenderer is not registered in a slot yet) |
| F9 colour grade not on screen | **left** (same as the grade hook) |
| Lightning, heat shimmer, storm exposure checks | **left** (weather-effects, Tier 2) |

### render-nest (notes-1A)
| Item | Outcome |
|---|---|
| Register NestRenderer; `setSim` on game start; disposal | **done** (`slots/nestSlot.ts`, `onGameStart` / `onGameEnd`) |
| Share the world's MaterialLibrary (`ctx.library`) | **done** (registry `peer('world')`) |
| Order nest -> world, pass `nest.look.underground` | **decision**: the Game decides `underground` from the camera with the nest look's hysteresis (`undergroundSwitch.ts`), so the world can update first and both agree |
| `setDaylight` from the world lighting | **done** (`DAYLIGHT_RGB x world.env.light`) |
| Apply `patchSurfaceMaterial` to terrain, primitives, mounds (lazily created ones too) | **done** (scene traversal while the cutaway is on, outside the nest group; includes ants and items) |
| Patch ant materials for slice mode | **done** (same traversal) |
| X-ray: draw ants in cavities above `XRAY.renderOrder` | **left** (views, Stage 1B) |
| Pass `ColonyRig.cutaway` as `frame.cutaway` | **done** (F3b already; verified in the colony-view screenshot) |
| pick / snapToWall / projectOnCut / ghosts for markers | **left** (views, Stage 1B) |
| `setOcclusionCapsule` (GDD 01 6.5 rule 3) | **done** (from the possession camera's fade output) |
| Real entrance records for the daylight openings | **sim** (no entrance is registered for a dug shaft yet; breach spheres are used) |
| Kernel marching cubes in slices / a worker | **sim** (kernel) |
| Keep HOLE_* constants exported | **done** (unchanged) |
| Truncated: SubRenderer contract (`name`, numeric `stats`) | **done** (already fixed by render-nest; type-checks through the slot) |
| Truncated: shadow depth material discards | **done** (section 4) |
| Truncated: wood grain fixed to world X | **left** (minor; needs the primitive axis per vertex; no wood nests in Stage 1A) |
| Truncated: RegionBuffer test stride | **done** |
| Truncated: duplicated underground constants | **decision** (world owns, see above) |
| Not done: granular soil near entrances, water at flood level, root ends, motes | **left** (Tier 2 / scent-fx) |

### render-ants (notes-1A)
| Item | Outcome |
|---|---|
| Register AntRenderer; init / update; setSim; setQuality | **done** (`slots/antsSlot.ts`; a `Sim` satisfies `AntSimSource` structurally, `antSource()` is the seam) |
| Hover / inspect via setHover / setInspect | **done** (FrameInfo.hover / inspect from `Game.hover/inspect`, `__game.highlight()`); picking under the cursor is views (1B) |
| Interpolation of the possessed ant (prevPos/pos vs per-frame) | **done**: the possessed ant is drawn at locomotion's predicted pose |
| CALLOW flag, clump eggs `carriedBy`, species appearance blocks, corpse caste, dealation flags | **sim** (colony-core / actions / species-data / sim owner of item.ts) |
| Truncated (a) cuticle values | **decision** already recorded by render-ants (GDD 08 values for Lasius / Messor) |
| Truncated (b) grip pose lowers the body; (c) unknown pose logged once; (d) reduced-motion antenna flicks | **left** (minor, render-ants polish; `reducedMotion` is now in FrameInfo for (d)) |
| Truncated (e) larval peristalsis (T2) | **left** (Tier 2) |
| Truncated (f) possessed predicted pose path | **done** |
| Feet on uneven ground; flight wings; Atta/Messor head refinement | **left** (render-ants polish) |

### F3b-game (notes-1A)
| Item | Outcome |
|---|---|
| Observer follow pitch sign | **done** (section 4) |
| Observer "stop following" | **done** (section 4) |
| Register the real renderers; AntSimSource; NestRenderer.setSim on start | **done** |
| `possessedPose` export path | **done** |
| SaveHooks / settings persistence | **left** (save task, in progress in the same checkout) |
| Photo mode Ctrl x0.2 | **left** (design owner) |
| Worldgen bank near the seed-1 queen start | **sim** (the start is now on a flat patio; smoke still walks 20 ticks) |
| Guard against non-finite PlayerIntent in the sim | **sim** |
| Game.ts over the 400-line target | **left**: now 595 lines (wiring added here); a split of the frame building out of Game is a Stage 1B refactor for the views task |
| Debug renderer hole approximation | **done** for the real renderers (field hole probe) |
| E-checks needing other modules | listed in section 5 |

### F3a-render-input-camera (notes-1A)
| Item | Outcome |
|---|---|
| TraceFn, underground / airborne to the rig; poll + update input; contexts; pointer-lock preference | **done** (F3b, verified unchanged) |
| Persist bindings | **left** (save task) |
| Asset packs | **left** (packaging, 1B) |
| `configureSunShadow` on quality change | **done** (world LightingRig.setQuality calls it; quality switch scripted) |
| Fade / occlusion values not used | **done** for the possessed ant and nest walls; terrain / primitive dithering left (views 1B) |
| Exposure honoured on the post path | **verified**: the high-quality underground screenshot is exposed like the test one (ToneMappingEffect reads `toneMappingExposure`) |
| Depth strategy (log depth / reversed) | **left** (no artefacts seen at 0.1 mm near plane in the shots) |
| Photo keys / scent pad conflicts | **left** (design owner) |

### F-int-foundation and other sim reports (items that concern the app)
| Item | Outcome |
|---|---|
| loco: `setLocoObserver(sim, cameraFocus)` each frame | **done** (re-sent when the focus moves > 1 BU; determinism script unchanged) |
| loco: `integratePossessed` each frame and draw / camera from `possessedPose` | **done** |
| env-core: call `ensureThermal(sim)` at game start | **left / sim**: it writes sim state; belongs in `createNewGame` (sim half) |
| actions: send action start / stop, read `promptView` for the HUD, re-possess after colony view | **done** (F3b; colony view round trip used in the stage1a script) |
| actions: AFK release cannot be switched off | **sim** (contract field needed) |
| worldgen: build the worldgen worker for the game | **left** (packaging, 1B) |
| phero / colony-core / sources / nestops / kernel items | **sim** (not app items) |


## 7. What Stage 1B must know

- **Renderer slots.** `src/render/slots/*` adapt the registry to the real renderers; new real renderers register in
  `src/render/index.ts`. A slot reaches another slot's renderer with `ctx.peer(slot)` (all slot renderers exist
  before any `init`). `init` / `onGameStart` may return promises; the Game awaits them (no frame shows a half-built
  world). Debug renderers remain for `creatures` and `fx`; `?render=debug` forces them everywhere.
- **Decor (render-decor)** is not registered: decide whether DecorRenderer becomes part of the world slot (it needs
  the world's MaterialLibrary and uniforms) or its own slot; it must be patched for the cutaway like the other
  surface materials (the nest slot already patches every scene-lit standard material lazily).
- **Views.** `FrameInfo` now carries `fade`, `hover`, `inspect`, `reducedMotion`. Hover / inspect come from
  `Game.hover / Game.inspect` (set them from picking). The possessed ant fades by ordered dither from
  `subjectOpacity`; nest walls by the occlusion capsule; terrain and primitives still need dithering. ObserverRig
  has `stopFollow()`; follow pitch is elevation-correct. The tunnel boom puts the camera very close to the queen.
- **Underground.** `FrameInfo.underground` is the camera's state (substrate distance, hysteresis from `NEST_LOOK`).
  The world renderer owns exposure and fog; the nest scales its artificial light so it never exceeds its
  underground calibration; a scene point light lights ants / items near the possessed ant underground.
- **Possessed pose.** Renderers draw the possessed ant at `FrameInfo.possessedPose` (locomotion's prediction); the
  camera follows the same pose.
- **HUD / UI.** `src/ui/**` has type errors from the ui-shell work in progress; the snapshot API is unchanged.
- **Founding.** The 1A script digs with the primitive, but the founding states, chamber registration and the egg
  need the founding flow: `lay-egg` is refused without a registered chamber or founding cell.
- **Packaging.** The classic build passes the smoke script from `/games/foundress/v1/` (textures load by relative
  URL); asset packs and the worldgen worker build are still to do.
- **Debug API additions.** `__game.quality(id?)`, `__game.highlight(hover?, inspect?)`, `__game.query.mounds()`,
  `__game.query.items()`, `perf().memory`. Test-mode `renderFrame()` now blocks until the GPU finished (1-pixel
  read-back), which keeps software-GL screenshots from timing out.

