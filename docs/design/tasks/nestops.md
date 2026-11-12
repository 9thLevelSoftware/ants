# Task nestops — Nest model and excavation mechanics (Stage 1A, Opus)

## Goal
Turn the kernel's raw carve grid into nests: dig bites and soil pellets, mounds, entrances, chamber detection and designation, dig plans with a frontier that diggers can claim, and the per-tick nest system that keeps navigation fields and chamber data current.

## Read first
- GDD 03 (`docs/design/gdd/03-nest-excavation.md`) — read it in full except the nest-architect section (a later task) and the flooding/collapse details (Tier 2: read them to leave the right hooks). `docs/design/gdd/digests/03.md` gives the map.
- `docs/design/tdd/02-kernel.md` and the kernel sources under `src/sim/nest/carve/**` and `src/sim/nest/nav/**` — you build on them and do not modify them.
- GDD 01 digest (`docs/design/gdd/digests/01.md`): the `dig-bite`, `seal-entrance`, `unseal-entrance`, `pick-up`/`put-down` primitives (the action library, another task, calls your functions).
- `src/sim/types/**` (`Nest`, entrances, chambers, dig plans, mounds, `Item`) and the stub `src/sim/nest/index.ts`.

## You own
`src/sim/nest/**` except `carve/**`, `nav/**` (kernel) and `architect/**` (later task). Replace the stub `src/sim/nest/index.ts` keeping its exported names and signatures (extend additively). Nest balance constants go in `src/sim/balance/nest.ts`.

## Boundaries
- Apply the nest spike's most important finding (`docs/research/spike-nest.md` section 5, item 5): a dig sphere placed relative to the body can engulf the digger and curls back on itself. The dig bite must use the spike's RAMP BRUSH (a capsule whose floor starts at the digger's feet and runs along its horizontal heading at a world-relative slope) and must re-project nearby walkers after each carve (`surfaceChanged`). Design `digBite` around that; dig plans supply the slope/heading for AI diggers.
- The action library decides WHEN an ant bites or drops a pellet; you implement WHAT happens (`digBite`, `dumpPellet`, `sealEntrance`, …). Dig behaviours (later task) call `claimDigSite` / `releaseDigSite`.
- Chamber temperature and humidity are computed by the environment module from the depth/cover data you provide.
- The architect (automatic planning) is a later task: expose the queries it needs (free wall space, chamber stats, nest bounds).

## Deliverables
1. Substrate rules from GDD 03: diggability and bite duration per material and species, stability flags; `canDigAt(sim, species, p)`.
2. `digBite(sim, ant, point)`: carve with the species' bite radius respecting `canDigAt`, return carved volume and failure reason, create pellet items from the volume ledger (per GDD 03), mark dirty chunks.
3. Pellets: carrying, dropping, clutter in tunnels, dumping near an entrance; mounds as dynamic primitives that grow with dumped volume in the shape GDD 03 specifies and are registered with the world field (walkable, renderable).
4. Entrances: registered when a carve breaches the surface (from kernel breach data), throat radius, sealing and unsealing (plug by fill, reopen by carve), several entrances per nest, entrance lookup for navigation.
5. Chamber detection and registry: analyse carved space (throttled, incremental where possible) to tell chambers from tunnels; volume, floor area, depth, cover; designation of types by the player or by rule; capacities per GDD 03; a `flooded` flag hook.
6. Dig plans: templates (tunnel, shaft, chamber by type and size, new entrance) anchored on existing space, validated (diggable, spacing, not undermining), expanded into ordered carve spheres; frontier claiming API for diggers; progress, priority, cancel, blocked-reason reporting.
7. Nest lifecycle helpers: `createFoundingNest`, a helper that pre-carves a small template nest (used later for rival colonies), nest statistics (volume, depth, tunnel length).
8. `nestSystem`: consume dirty chunks, update nest-nav fields incrementally, re-detect chambers on a budget, grow mounds, emit events.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Bite volume, pellet yield and bite duration match GDD 03's numbers for loam, sand, clay and a non-diggable crust (bite refused with the right reason).
3. On a synthetic nest (three chambers joined by tunnels) chamber detection finds exactly three chambers with volumes within 15 % and stable ids across re-detection after unrelated digging.
4. A shaft dug upward to the surface registers an entrance; sealing makes nest-nav report the outside unreachable; unsealing restores it.
5. Dumping N pellets grows a mound whose volume matches the dumped volume within 10 %, and a walker can walk over it (world field updated).
6. A chamber plan anchored on a tunnel wall expands to spheres, diggers claiming the frontier never get the same sphere twice, and completing all spheres yields a detected chamber of the planned type and size.
7. Plans in non-diggable material or too close to existing space are rejected with a reason.
8. Nest state round-trips through core `encode`/`decode`; determinism holds.
