# Task render-decor — Vegetation, draped decor and water (Stage 1B, Opus, visual)

## Goal
The visual-only layers that make the surface world feel like a place seen from an ant's height: grass blades towering overhead and moving in the wind, fallen leaves, petals and litter draped on the ground, moss and small debris, and water (puddles, bowls, dew).

## Read first
- `docs/research/spike-look.md` and `spikes/look/**` (grass technique, parting/fading near the camera, densities per quality preset, measured costs).
- GDD 04 (`docs/design/gdd/04-world-habitats-worldgen.md`): the decor rules (grass blades, draped leaves/petals/litter: densities, sizes, where), zone variants, water (puddles, bowls, drains) and its visual states. GDD 08 art direction: look per habitat, season and weather. `docs/design/gdd/digests/04.md` and `08.md` give the maps.
- `src/render/world/**` (the world renderer's shared material library, wind/wetness/time uniforms and chunking — reuse them; do not edit its files), `src/render/app/**` (quality presets), `src/render/assets/**`, the decor descriptors in `WorldData` (`src/sim/types/world.ts`), `public/assets/manifest.json` (leaf and grass atlases).

## You own
`src/render/world/{vegetation,decor,water}/**` and a demo page `spikes/render-decor-demo/**`.

## Boundaries
- Decor has no collision: ants walk the terrain; draped decor must hug the ground so ants appear on top of it, never inside it. Climbable plants are solid objects drawn by the world renderer; you may add their leaf/petal dressing if the descriptors ask for it.
- Rain, splashes and other weather effects are a later task: expose wetness and puddle-level inputs.

## Deliverables
1. Grass: instanced blades generated per terrain chunk from the zone's decor descriptor (density, height and width ranges, colour variation, mown versus rough), wind sway in the vertex shader, distance fade and density LOD, shadows only near the camera, and the parting/fading behaviour around the camera-to-subject line so the possessed ant stays visible.
2. Draped decor: leaves, petals, needles, small litter and moss patches laid on the terrain surface following its height (geometry conforming to the ground with a tiny offset), with atlas textures and seasonal palettes; density by zone and season.
3. Water: puddle and bowl surfaces with a simple believable material (reflection tint, depth darkening, meniscus edge), dew droplets on grass at dawn if the descriptors include them, level driven by an input.
4. Streaming: generate and dispose decor by chunk around the camera on a time budget, deterministic per chunk so it never pops differently when revisited.
5. A `DecorRenderer` class with `init`, `setWorld(world)`, `update(frame)`, `dispose`, and the demo page (lawn, forest floor, paving joints with moss, a puddle; flags for time of day, season, quality, wind).

## Acceptance criteria
1. `npm run typecheck` clean; no console errors in the harness.
2. Harness screenshots, looked at and judged honestly: ant-height view in a lawn (blades overhead, subject visible, no blade through the camera), forest floor with leaf litter (ants standing ON leaves, not in them — place a marker object at the walker foot height to verify), moss in paving joints, a puddle, autumn palette, golden hour. Each must look natural and correctly exposed.
3. Revisiting a chunk reproduces identical decor (hash of instance buffers).
4. Cost: at the High preset a dense lawn view stays inside the architecture budget for triangles and draw calls (report numbers); the `test` preset draws no decor or a minimal amount.
5. Works in the classic single-file build.
