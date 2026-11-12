# Task views — Play views: possession camera in the real world, observer, colony view with cutaway, picking and markers (Stage 1B, Opus, visual)

## Goal
Make the four play views real on top of the real renderers: the third-person possession camera on ground, walls, ceilings and in tunnels; the observer camera that can follow and pick any ant; the colony view with the underground cutaway where the player places markers and dig plans; and smooth hand-overs between them.

## Read first
- GDD 01 (`docs/design/gdd/01-modes-controls-camera.md`): read in full section 2 (views and hand-overs), section 3 (ways to possess, including click and cycling), section 6 (camera specification for every view, environment states, fades, the colony view's slice and x-ray cutaway), section 9 (prompt anchoring). GDD 08: the marker tool and dig planner interaction. GDD 03: the player's side of dig planning (templates, anchoring, validation feedback). Digests 01, 08, 03 give the maps.
- `docs/research/spike-nest.md` §5 items 9-10 and §6 (camera comfort on ceilings, pinch fallback, cutaway picking findings).
- `src/render/camera/**` (rigs from the foundation — you take ownership now), `src/game/**` (how `Game` selects views and feeds rigs), `src/render/nest/**` (cutaway and nest-space picking hooks), `src/render/ants/**` (highlight hooks), `src/sim/nest` (plan validation and creation), `src/input/**`.

## You own
`src/render/camera/**`, `src/game/views/**`, `src/render/fx/markers/**` (marker and dig-plan ghost rendering), and `tests/e2e/views.mjs`. If `Game` needs a small change to call into `src/game/views`, make it minimal and report it.

## Deliverables
1. Possession view: the third-person rig driven by the possessed ant with collision against the real world field; environment states (open, chamber, tunnel, crevice, falling, flight hook) switching by the rules of GDD 01 §6; the ceiling comfort option and pinch fallback from the spike findings; fade of near geometry and of the ant itself; depth-of-field focus following the subject; reduced-motion behaviour.
2. Observer view: orbit/fly with bounds, follow any ant or creature, picking under the cursor (ants, brood, items, sources, chambers) with hover highlight and the inspect card request, click-hold or key to possess, Tab cycling order.
3. Colony view: strategic camera above the nest and territory; slice and x-ray cutaway modes (driving the nest renderer); picking on the cut face and on tunnel walls; the marker tool (place, move, remove every marker kind with radius) and the dig planner (choose template and size, anchor on a wall, live validation feedback with the nest module's codes, confirm/cancel), rendered as ghosts; issuing the corresponding commands.
4. Hand-overs between views with the transitions and timings of GDD 01 §2, including possession hand-over from a clicked ant and returning to the last possessed ant.
5. End-to-end script `tests/e2e/views.mjs` exercising every view through `window.__game` with screenshots.

## Acceptance criteria
1. `npm run typecheck` clean; unit tests green (state switching, picking maths, plan ghost geometry, transition blending).
2. The end-to-end script passes with no console errors; screenshots (looked at) show: possession on open ground, on a wall, on a ceiling, inside a tunnel and a chamber with the camera never inside solid; observer following an ant with a hover highlight; colony view with slice cutaway and with x-ray, a placed forage marker, and a dig-plan ghost on a tunnel wall with validation feedback.
3. In a scripted walk from the surface down to the deepest chamber and back, the camera centre is never inside solid (sampled every frame against the field) and never jumps by more than the allowed amount between frames.
4. Placing a dig plan through the colony view creates the plan in the simulation; an invalid anchor shows the validation reason and creates nothing.
5. Clicking an ant in observer view and holding (or pressing the possess key) possesses that ant; Tab cycles in the documented order.
6. Works in `test` quality and in `high`; works in the classic single-file build.
