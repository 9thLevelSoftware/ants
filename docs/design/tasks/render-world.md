# Task render-world — Terrain, solid objects, sky and lighting (Stage 1A, Opus, visual)

## Goal
Draw the surface world at ant scale from `WorldData`: chunked terrain with real materials, every solid primitive with the right material, the sky, sun and moon, time-of-day lighting, haze and shadows — in the naturalistic macro-photography look established by the look-dev spike.

## Read first
- `docs/research/spike-look.md` and the code in `spikes/look/**` (the visual recipe, quality presets and measured costs — your starting point). If the document does not exist yet when you start, wait a few minutes and check again; if it is still missing, proceed from `docs/research/tech-stack.md` and GDD 08's art direction and leave named constants for retuning.
- `docs/research/tech-stack.md` §4 and §7 (post chain, colour management, shader gotchas).
- GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): the art-direction section in full (look per habitat, time of day, weather, materials, what must never appear). GDD 04 digest: zone model, surface materials, object catalogue (what primitives/materials to expect). GDD 06 digest: day phases and light.
- `src/render/app/**`, `src/render/assets/**` (use these; never fetch assets yourself), `src/sim/types/geom.ts`, `src/sim/types/world.ts`, the environment module's light/sun queries.
- `public/assets/manifest.json` (25 texture sets).

## You own
`src/render/world/{terrain,sky,lighting,primitives,materials}/**` and a demo page `spikes/render-world-demo/**`.

## Boundaries
- Nest spike finding (`docs/research/spike-nest.md` section 5, item 7): a uniform list of breach spheres does not scale. Use a 2D hole-mask texture over the terrain, rasterised locally from the field when carving breaches the surface (the kernel exposes breaches and the cavity field); keep the uniform list only as a fallback for the `test` preset if simpler.
- Grass, draped decor, water, weather effects, creatures, ants and the carve-grid meshes are other tasks. Leave a clean API for them (shared material library, shared uniforms for wetness, time and wind, the breach list).
- You read simulation data; you never write it.

## Deliverables
1. Terrain: chunked level-of-detail mesh from the heightfield with seamless borders; a splat material that blends the surface materials from the ground-layer map using the CC0 texture sets (albedo, normal, roughness), triplanar or anti-tiling treatment so textures hold up at 1 mm scale, detail normals, distance fade; fragments inside breach spheres are discarded so nest entrances open (uniform list of the nearest breaches).
2. Solid primitives: geometry generated from the primitive list (rounded box, cylinder, capsule, ellipsoid), batched or instanced by material and shape, with a material library keyed by `MaterialId` (PBR parameters and textures, world-space mapping so huge objects do not stretch textures), per-primitive tint, dynamic primitive add/remove/update (mounds, moved objects).
3. Sky and light: sky dome consistent with fog colour (the tech-stack gotcha about untone-mapped backgrounds), sun and moon driven by the environment's sun direction and light level, hemisphere light, a shadow camera that follows the view with stable texel snapping, golden-hour and night grading, overcast flattening; exposes `setWetness(0..1)`.
4. Fog/haze tuned for scale and for hiding the map boundary; underground the surface world is hidden or dimmed (flag from the frame info).
5. Quality scaling through the presets in `src/render/app` (LOD distances, shadow size, anisotropy, texture resolution).
6. A `WorldRenderer` class with `init`, `setWorld(world)`, `update(frame)`, `dispose`, and the demo page: loads a generated world (or the test world), flies/positions a camera at ant height, URL flags for time of day, quality, position and a frozen clock; sets `window.__ready`.

## Acceptance criteria
1. `npm run typecheck` clean; no console errors in the harness; nothing in your paths imports `src/sim` internals other than types and the environment queries.
2. Harness screenshots, looked at and judged honestly: ant-height views on lawn soil, pavement with a kerb, asphalt, sand and an interior floor; midday, golden hour and night; a breach hole visibly open in the ground; a view containing at least four different primitive materials. Each must be correctly exposed, show convincing material detail at close range and no texture stretching, seams, z-fighting or cracks between terrain chunks.
3. Terrain LOD: no visible popping gaps in a fly-through screenshot series; draw calls and triangles for a standard world at High stay inside the architecture budget (report numbers).
4. Dynamic primitives: adding a mound primitive at runtime shows it within one frame; removing it removes it.
5. Works in the `test` quality preset (no post, no shadows) and in `high`; works when built with the classic single-file build.
