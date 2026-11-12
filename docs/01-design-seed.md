# FOUNDRESS — Design Seed (binding decisions)

This file resolves every decision the original brief (`docs/00-original-brief.md`) left open.
It is the single source of truth for direction until the full GDD/TDD under `docs/design/` exist.
Where the GDD/TDD later go into more detail they must stay consistent with this file.

## 0. Originality rule (non-negotiable)

This is an ORIGINAL game in the ant-colony-sim genre. Do not reproduce any specific existing game:
no names, characters, art, music, UI layouts, level designs or signature set-pieces from SimAnt,
Empires of the Undergrowth, Grounded or any other title. Genre mechanics (controlling an ant,
managing a colony, pheromone trails) come from real ant biology and are fine. The SimAnt manual
cited in the brief is context for the genre only; never copy from it.

## 1. Product decisions

| Open item in brief | Decision |
| --- | --- |
| Title | **FOUNDRESS** (a foundress is a colony-founding queen). Subtitle: "A naturalistic ant colony sandbox". |
| Platform | **Browser-first** (WebGL2). Static site, no server. Must run from `file`-less static hosting and inside a sandboxed iframe (no service worker, pointer lock/fullscreen/audio may be refused -> always degrade gracefully). |
| Engine | TypeScript + Three.js (WebGLRenderer / WebGL2) + Vite. UI = DOM overlay with Preact + signals. No game engine editor. |
| Players | Single-player only. |
| Input | Keyboard + mouse (primary), gamepad (standard mapping), rebindable keys. Camera must work WITHOUT pointer lock (drag to orbit); pointer lock is an optional enhancement. |
| Visual style | Naturalistic macro-photography: real materials, shallow depth of field, haze for scale, warm daylight; dim "scent-lit" look underground. |
| Target hardware | Integrated-GPU laptop, 1080p, 60 fps at Medium. Presets Low/Medium/High/Ultra + auto-detect + dynamic resolution. |
| Species at launch | 4 playable, each with its own biology: *Lasius niger* (black garden ant, reference species), *Camponotus pennsylvanicus* (black carpenter ant, nests in wood, majors), *Messor barbarus* (harvester, seeds + granaries, polymorphic), *Atta texana* (leafcutter, fungus garden, strongly polymorphic). Final picks may be adjusted by biology research, but the four playstyles are fixed. |
| World | One connected generated locality per game, ~4000 BU square (see units), composed of habitat zones: forest floor, lawn/garden, pavement/parking, playground (sand), building interior (kitchen etc.). Seeded; persistent per save. |
| Time | 1 game day = 10 real minutes at 1x. 4 seasons x 7 days = 28-day year. Speeds: pause, 1x, 2x, 4x, 8x (8x only when not possessing an ant). Winter is resolved as a skippable overwintering time-lapse. First brood is a skippable time-lapse. |
| Queen commands | Two layers: (a) colony priorities (workforce allocation sliders, caste/alate production, diet emphasis), (b) spatial markers (dig plan / chamber type, forage here, avoid, rally/defend, new entrance, move brood/queen). Markers are an explicit gameplay abstraction; execution is by autonomous ants. |
| Excavation | Free-form 3D digging in a sparse voxel "carve grid" (marching cubes). Player digs directly as an ant; colony digs from dig plans and from an automatic nest architect. Excavated soil becomes pellets carried out to a mound. |
| Failure / succession | Queen death does not end the game immediately: the orphaned colony declines (no new eggs); alate brood can still fly. Game over = no living ants. Then an epitaph/history screen. Nuptial flights add daughter colonies to a persistent Lineage; the player can found a new colony as a daughter queen in a freshly generated locality. |
| Difficulty | Gentle / Naturalist (default) / Harsh, plus custom toggles (predators, rivals, human activity, weather severity, season length). |
| Saves | IndexedDB: autosave + 5 manual slots; export/import as a file (with copy/paste fallback when downloads are blocked). |
| People | Humans are represented indirectly at ant scale: giant shoes, tires, mower, broom, watering — events that change resources/access. No human characters or dialogue. |

## 2. Design pillars

1. **Be the ant, see the colony.** Third-person embodiment of any individual ant, at any time, in one continuous simulation. Leaving an ant returns it to autonomy.
2. **Naturalistic.** Behaviour, anatomy, life cycle, diet and ecology follow the modelled species. No human personalities, dialogue or institutions. Gameplay abstractions (queen directives, time compression) are few and explicit.
3. **Autonomous colony.** Routine work happens without the player. The player's leverage: priorities, markers, and personally doing any job.
4. **Readable causality.** The player can always find out *why* (food intake fell, brood slowed, a dig stalled): a diagnostics view traces causes.
5. **Small things matter.** A crack under a door, a gap beneath a curb, a paving joint: micro-connections open up the world.
6. **Quiet is good.** Watching the colony work is a first-class activity (observer camera, scent view, time-lapse, photo mode).

## 3. Units, scale and conventions (BINDING for all code)

- Right-handed, **Y up**. World units are **millimetres**. World spans X,Z in `[0, worldSize]`; ground near y = 0.
- **BU (body unit)** = length in mm of the played species' standard worker (Lasius 4, Camponotus 9, Messor 7, Atta 7). All simulation resolutions are multiples of BU so cost is species-independent:
  - carve-grid voxel = 0.5 BU; carve chunk = 16^3 voxels
  - terrain heightfield cell = 4 BU; pheromone cell = 4 BU; coarse nav cell = 16 BU
  - world size = 4000 BU (standard), 3000 (compact), 5000 (large)
  - ant walk speed ~12 BU/s (temperature dependent for AI), tunnels ~2 BU wide, chambers 8-16 BU wide
- **Solid/free field** `f(p)`: a signed pseudo-distance in mm, **positive in free space (air or excavated cavity), negative inside solid**. `f = max(fSubstrate, fCavity)` where `fSubstrate` = min over terrain + solid primitives and `fCavity` > 0 inside carved space.
- **Surface walking**: every ant (player and AI) is a surface walker on the level set `f(p) = footOffset`. State = position, up (surface normal), forward (tangent). Step along the tangent, re-project onto the level set, and **parallel-transport** the heading by the rotation old-normal -> new-normal. This one controller handles ground, walls, ceilings, stems, table legs and tunnels.
- Simulation is a **fixed tick of 0.1 s game time**, deterministic given seed + commands. Rendering interpolates. The possessed ant is additionally integrated per frame for responsiveness.
- **Layering**: `src/sim/**` and `src/worldgen/**` are pure TypeScript — no `three`, no DOM, no `window`, runnable in Node (tests, headless balance runs). `src/render/**` reads sim state, never mutates it. Sim -> outside communication is by reading state and by a typed event bus. Outside -> sim is by `Command` objects queued for the next tick.
- **State is plain data**: `SimState` contains only JSON-like values and typed arrays. No class instances, closures, Maps or Sets inside persisted state (derived caches live outside and are rebuilt on load).
- All randomness in sim/worldgen comes from the seeded RNG in state (never `Math.random`).
- All tunable numbers live in `src/sim/balance/*.ts` and species data files — no magic numbers in systems.

## 4. Core technical approach

- **Terrain**: heightfield `H(x,z)` (4 BU cells, bilinear), chunked LOD mesh, triplanar/splat material by biome.
- **Solid primitives**: rounded boxes, cylinders, capsules, ellipsoids with transforms + material + flags (climbable, diggable wood, slippery, wet...). Spatial hash. Meshes generated from the same primitive list, so collision == visuals. Dynamic primitives for mounds and moved objects.
- **Carve grid (negative space)**: sparse `chunkKey -> Uint8Array(4096)` of openness (0 solid .. 255 open, iso 127.5). Used for nests, pre-existing cracks/voids (under slabs, door thresholds, wall cavities), antlion pits and rival nests. Marching cubes per chunk, inward-facing; fragments outside the substrate are discarded via a per-vertex substrate-distance attribute; terrain/object fragments inside breach spheres are discarded so holes open visibly.
- **Nest navigation**: BFS distance fields over open voxels (to entrances, to chambers), incrementally updated when digging. AI steers down the field, tangent-projected, on the walls.
- **Surface navigation**: local steering + sparse 3D pheromone grid (trail, home, alarm channels) + per-ant route memory (breadcrumbs) + coarse 2D nav flow fields for commanded long-distance travel + authored climb routes on climbable objects.
- **Ant rendering**: procedural anatomically-plausible ant per species/caste, one instanced mesh per variant, legs/antennae animated in the vertex shader from per-instance attributes (gait phase, speed, pose, carried item, colour).
- **Camera**: third-person orbit in the ant's local frame with sphere-traced collision against `f`; pulls in and widens in tunnels; observer/colony camera when not possessing; underground cutaway for placing markers.
- **Verification hooks (required)**: URL flags `?test=1&seed=N&quality=low` and a `window.__game` debug API (step N ticks, read state, issue commands, teleport, possess, screenshot-ready promise) so headless Playwright runs are deterministic and fast.

## 5. Scope tiers (build order)

- **Tier 1 — core, must be rock solid**: world generation of all habitat zones; rendering; carve grid + digging; surface walker + third-person camera; possession of any ant; colony loop for *Lasius niger* (founding, brood, foraging with pheromones + route memory, nutrition, nursing, digging, storage, midden); queen directives; HUD/menus/settings; time controls; save/load.
- **Tier 2 — full sandbox**: food ecology (aphids/honeydew, nectar, prey, seeds, carrion, human food), creatures (prey + predators), rival colonies + combat + brood raids, seasons/weather/day-night, human activity events, overwintering, alates + nuptial flight + lineage, queen death/succession/epitaph, opening sequence + onboarding, milestones journal, diagnostics ("why") view, scent view, photo mode, audio.
- **Tier 3 — breadth and polish**: the three additional species with their own founding + economy modules, difficulty/custom rules, gamepad, accessibility (comfort mode for spiders, colour-blind safe overlays, reduced motion, UI scale), performance presets, manual/codex.
