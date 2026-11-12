# Task render-nest — Carve-grid meshes, mounds and the underground look (Stage 1A, Opus, visual)

## Goal
Draw excavated space: marching-cubes chunk meshes that update as ants dig, tunnel mouths that join the surface cleanly, the dim "scent-lit" underground look, and the cutaway that lets the player look into the nest from outside.

## Read first
- `docs/research/spike-nest.md` (rendering parts: substrate-distance discard, breach spheres, seams, cutaway evaluation) and `spikes/nest/render/**`; `docs/research/spike-look.md` (underground variant) if present — if a spike document is missing when you start, wait a few minutes, re-check, then proceed from what exists.
- `docs/design/tdd/02-kernel.md` (the carve grid's mesh builder, dirty chunks, breaches).
- `docs/research/tech-stack.md` §7 (custom shader gotchas, depth materials for shadows).
- GDD 08 art-direction section (underground look) and GDD 01 §6 (colony view cutaway modes: slice and x-ray; what the player must be able to see). GDD 03 digest for substrates (soil types, wood) that tunnel walls must show.
- `src/render/app/**`, `src/render/assets/**`, `src/render/world/materials/**` if it exists (share its material library; if it does not exist yet, keep your material parameters in one file so they can be merged later).

## You own
`src/render/nest/**` and a demo page `spikes/render-nest-demo/**`.

## Boundaries
- The simulation contracts in `src/sim/types` are being synchronised with the design index during this hour and a few field names may still change. Read ALL simulation data through one adapter file in your folder (`simAdapter.ts`) so a rename costs a single edit, and do not import anything from `src/sim` except types and the functions your spec names.
- Apply the nest spike's rendering findings (`docs/research/spike-nest.md` section 5 items 6, 8 and 11, and section 6): discard by soil distance only with a thin skin below the soil; smooth coarse tunnel silhouettes by relaxing vertices toward the true iso-surface; depth-below-soil darkening plus a warm lantern around the possessed ant; the slice cap texture and the x-ray cast for the cutaway, with the improvements the spike lists as missing (plane following camera yaw, marker snapping).
- Mounds are dynamic primitives drawn by the world renderer; you only add the granular detail around entrances if needed.
- Dig-plan ghosts and markers are a later task (`views`); expose the hooks (a way to draw translucent spheres/ellipsoids in nest space).

## Deliverables
1. Chunk mesh manager: builds and rebuilds meshes from the kernel's mesh arrays for dirty chunks with a per-frame time budget and priority by distance to the camera; frees meshes of emptied chunks; handles thousands of chunks with frustum culling.
2. Wall material: triplanar soil or wood by substrate material (from the kernel's `materialAt` baked per vertex or per chunk), detail normals, moisture darkening hook, fragments in open air discarded via the per-vertex substrate distance, correct shadows/depth.
3. Underground lighting: dim warm ambient, depth-based darkening away from entrances, sky light spilling in near entrances, a soft glow around the possessed ant, parameters exposed to the post chain (exposure/fog switch when the camera goes underground, with a smooth transition).
4. Cutaway for the colony view: slice mode (clip plane with a readable cut face) and x-ray mode (surface hidden above the nest, tunnels shown as lit interior), as GDD 01 §6 describes; pick ray into nest space for marker placement.
5. A `NestRenderer` class with `init`, `setSim(sim)`, `update(frame)`, `dispose`, and the demo page: test world with a generated nest, scripted digging, cameras inside tunnels and chambers, cutaway toggles, URL flags; sets `window.__ready`.

## Acceptance criteria
1. `npm run typecheck` clean; no console errors in the harness.
2. Harness screenshots, looked at and judged honestly: the entrance seen from the surface (hole open, no see-through artefacts, no floating geometry above ground); looking down the shaft; inside a tunnel; inside a chamber; a tunnel in wood; slice cutaway of the whole nest; x-ray cutaway. Walls must read as soil/wood with depth, with no cracks at chunk seams and no black or blown-out frames.
3. Digging live: after a scripted series of 50 bites the new space appears within a few frames and the frame-time spike from re-meshing stays within the per-frame budget (report numbers).
4. Camera transitions surface -> underground -> surface change exposure and fog smoothly (screenshot series).
5. Works in `test` quality and in `high`; works in the classic single-file build.
