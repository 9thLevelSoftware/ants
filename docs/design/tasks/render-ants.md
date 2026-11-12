# Task render-ants — Ants, brood and carried items (Stage 1A, Opus, visual)

## Goal
Draw every ant in the simulation — up to a couple of thousand — as an anatomically plausible, animated individual of its species and caste, plus brood and loose items, cheaply.

## Read first
- `docs/research/spike-ants.md` and `spikes/ants/**` (geometry generator, vertex-shader animation, attribute layout, LOD, costs — your starting point). If the document is missing when you start, wait a few minutes, re-check, then proceed from the spike code.
- `docs/research/tech-stack.md` §7 (onBeforeCompile, instanced attributes, custom depth materials).
- GDD 07 (`docs/design/gdd/07-species.md`): the caste tables and appearance fields of all four species (sizes, proportions, colours, petiole nodes, spines, polymorphism) — use `docs/design/gdd/digests/07.md` to find them. GDD 01 digest: pose and animation cues of the action primitives. GDD 08 art direction: no cartoon features.
- `src/sim/types/**` (`Ant`, `Walker` interpolation fields, `Brood`, `Item`, species appearance), `src/render/app/**`.

## You own
`src/render/ants/**` and a demo page `spikes/render-ants-demo/**`.

## Boundaries
- Creatures (spiders, aphids, …) are a later task; design the animation attribute scheme so it can be reused for them.
- You read simulation state and interpolate; you never write it.

## Deliverables
1. Procedural geometry per species and caste from parameters (the four species' castes including queen, winged gyne, male, and size-class variation for polymorphic species), with correct anatomy: three body regions, six legs on the mesosoma, elbowed antennae, one petiole node for formicines and two for myrmicines, mandibles scaled by caste.
2. Instanced rendering with vertex-shader animation driven by per-instance attributes filled from the simulation each frame: interpolated position/orientation between ticks, gait phase (no foot sliding), speed, pose (idle, walking, carrying, digging, feeding, trophallaxis, alarm, grooming, dead), crop fullness (gaster swelling), tint/age, scale. Smooth up-vector changes on walls and ceilings.
3. Level of detail by distance (full, reduced, impostor-like minimal), shadows for near ants only, frustum culling by instance, and a hard cap policy that never drops the possessed ant.
4. Brood and items: egg clusters, larvae by size, cocoons or naked pupae per species, soil pellets, food pieces, seeds, leaf fragments, corpses; items carried in the mandibles follow the carrier's head.
5. Selection feedback: a subtle highlight for the possessed ant and for the hovered/inspected target (no cartoon outlines).
6. An `AntRenderer` class with `init`, `setSim(sim)`, `update(frame)`, `dispose`, and the demo page with a scripted crowd, close-ups of each species and caste, each pose, URL flags; sets `window.__ready`.

## Acceptance criteria
1. `npm run typecheck` clean; no console errors in the harness.
2. Harness screenshots, looked at and judged honestly as real-looking ants (not blobs): three-quarter close-up of a *Lasius niger* worker; queen next to a worker; winged gyne; a major and a minor of a polymorphic species side by side; an ant carrying a cocoon; an ant on a vertical wall and one on a ceiling (legs toward the surface); a crowd of 2,000; brood pile; each pose.
3. Gait: in a three-frame series of a walking ant the feet in stance do not slide relative to the ground (measured in the demo by projecting foot positions).
4. Cost on this machine (software rendering, relative numbers): 2,000 ants in the `test` preset render within 2x the cost of an empty scene plus the measured per-instance cost from the spike; attribute upload for 2,000 ants takes under 1.5 ms of CPU per frame (report numbers).
5. Works in `test` quality and in `high`; works in the classic single-file build.
