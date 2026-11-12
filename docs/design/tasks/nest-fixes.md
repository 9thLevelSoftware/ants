# Task nest-fixes — Entrances, chambers and mounds for free-form digging (Stage 1B, Opus)

## Goal
Fix the nest-module defects the Stage 1A integration gate found in the running game, so that a shaft and room dug freely by an ant (no plan) become a real nest: an entrance record, a registered chamber, and a natural crater mound that never buries its own entrance.

## Read first
- `docs/design/tasks/gate-1A-app-report.md` §5 (defects left, with reproductions) and `docs/design/tasks/gate-1A-sim-report.md` §4 and §8.
- GDD 03 (`docs/design/gdd/03-nest-excavation.md`): entrances (breach detection, throat, kept-clear ring and rim ring), mounds (grid, bulking, relaxation, crater shape), chamber detection and registration thresholds, the founding dig and its readiness rule. `docs/design/gdd/digests/03.md` gives the map; `docs/design/gdd/00-index.md` C9 the final constants.
- `src/sim/nest/**` as it stands and its tests; `docs/design/tdd/02-kernel.md` (breaches, hole test, height overlays).

## You own
`src/sim/nest/**` except `carve/**`, `nav/**` (kernel) and `architect/**` (another task running in parallel — do not touch it). Constants in `src/sim/balance/nest.ts`.

## Defects to fix (reproduce each first, in a headless test)
1. **No entrance record for a freely dug shaft.** A possessed or autonomous ant digging from the surface with `digBite` outside any plan opens a hole that the field reports as a breach, but no `Entrance` is created and no nest owns it. Expected: the breach creates (or extends) a nest for the digger's colony with an entrance at the hole, as GDD 03 specifies for breach detection, including the case of the founding queen before any nest exists.
2. **No chamber registered for a widened room at the end of a free shaft**, so `lay-egg` is refused. Expected: chamber detection finds any carved room meeting GDD 03's minimum (and the founding cell rule applies during founding), with stable ids.
3. **Spoil buries the entrance.** Surface pellets settle into a heap centred on the hole; the height overlay then closes the throat. Expected: the mound is the crater GDD 03 describes — a kept-clear throat, a rim ring around it, spoil distributed around the entrance — and settling never raises the ground inside the kept-clear radius; an entrance that is somehow covered is reported, not silently closed.
4. **Mounds and heaps are square pyramids.** The relaxation uses a 4-neighbour slope limit. Expected: an isotropic angle-of-repose relaxation (for example 8 neighbours with distance-weighted slope limits, or a radial profile for entrance mounds) that yields round cones and crater rings with the chapter's angle of repose, conserves volume, and stays within the mound batch cost.
5. Any related inconsistency you find between breach records, entrance records, nest fields and the mound overlay (for example entrance fields not refreshed after an entrance appears).

## Acceptance criteria
1. `npm run typecheck` clean; nest tests green, with a new headless test for each defect that fails on the old code.
2. Scripted free dig (no plan, no cheats) from the surface by a founding queen: after the shaft and room are dug there is exactly one nest for her colony with one entrance at the hole and one registered chamber (or founding cell); `canDo(lay-egg)` is allowed inside it; nest navigation reaches the surface from the room.
3. After 200 pellets are dumped at the surface around the entrance, the throat is still open (field hole test at the entrance centre true; a walker can walk in and out), and the mound volume equals the dumped volume times the bulking factor within 10 %.
4. Mound shape: sampling the height overlay on a circle at several radii shows radial symmetry within 15 % (no square or diamond bias), and no slope exceeds the angle of repose by more than a small tolerance.
5. Save/load round-trip preserves entrances, chambers and mounds; determinism holds; the 3-day soak still reports zero violations.
