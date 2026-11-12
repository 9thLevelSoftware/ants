# Task founding — The opening sequence: founding queen to first workers (Stage 1B, Opus, visual)

## Goal
The first ten minutes of every game, exactly as the brief describes: begin as a lone queen in third person, explore and assess the ground, dig an entrance and founding chamber, seal it, lay the first clutch, watch a short skippable time-lapse of the first brood, and hand over to normal play with the first workers.

## Read first
- `docs/design/tasks/gate-1A-sim-report.md` (§1 what works end to end, §2 what is stubbed, §8 what Stage 1B tasks must know — the public functions to call) and `docs/design/tasks/gate-1A-app-report.md` §7. The scripted stand-ins under `src/sim/testing/e2e/` show working call sequences against the real modules.
- GDD 06 (`docs/design/gdd/06-environment-progression.md`): read in full the opening-sequence section (intro card, founding-queen phase with reserves and threats, live site assessment and scoring, digging requirements, sealing, laying the first clutch, the brood time-lapse with its duration and what is shown, how the outcome is computed, the hand-over and first aims, per-species variations) and the time-control rules it relies on. GDD 03: the founding dig (minimum shaft and chamber, automatic pellet expulsion for the queen, readiness, sealing). GDD 02: first-brood fast-track rules. GDD 08: the founding overlays and the time-lapse overlay. `docs/design/gdd/00-index.md` section C6 holds the final founding constants. Digests 06, 03, 02, 08 give the maps.
- The original brief `docs/00-original-brief.md` §4 (this sequence is a confirmed user decision — follow it closely).
- Modules you build on: `src/sim/ants/actions` (dig-bite, seal-entrance, lay-egg), `src/sim/nest` (founding nest, readiness, site queries), `src/sim/colony` (brood, queen reserves), `src/sim/environment`, `src/game/**` (views, time control, flows), `src/ui/**` (components).

## You own
`src/sim/colony/founding/**` (simulation side: founding state machine, reserves, site assessment read-out, time-lapse stepping and outcome), `src/game/flows/founding/**` (the flow driver: phases, camera choices, time-lapse control, skip), `src/ui/screens/founding/**` (intro card, site read-out, readiness indicator, time-lapse overlay), and `tests/e2e/founding.mjs`.

## Boundaries
- Site quality ruling (`docs/02-design-directions.md` §K, last bullet): founding-site quality must discriminate; calibrate the suitability factors and word thresholds to the stated distribution targets, and place the queen start by the stated rule. The live assessment must call the same factor functions and thresholds as the static suitability map (import them; do not re-implement), so the overlay and the read-out always agree.
- Use existing action primitives and module functions; if the founding rules need a function that is missing (for example a faster dig rate for the queen or automatic pellet expulsion), implement it inside your folder as a founding-phase rule that calls the owning module's public API, and report it.
- Onboarding prompts in general are a later task; the prompts that belong to the founding script itself are yours.

## Deliverables
1. Simulation: the founding phase state (searching, digging, ready, sealed, laying, time-lapse, handed over), the queen's reserves meter and desiccation/exposure rules, the live site assessment (the chapter's factors and score), founding dig readiness from the nest module, sealing, the first clutch, the brood time-lapse computed by actually stepping the colony model at high speed with automatic queen brood care, the outcome (number of first workers) and the hand-over (workers reopen the entrance; possession hand-over options).
2. Flow: intro card -> queen possession -> prompts that follow the script -> time-lapse with camera inside the chamber, day counter and skip -> hand-over choice (stay with the queen or possess a worker) -> first journal aims.
3. UI: the intro card, the site assessment read-out when antennating the ground, the readiness indicator, the time-lapse overlay with skip, failure and retry (queen dies before founding).
4. Debug support: `cheat.completeFounding()` implemented through the same code path at maximum speed.
5. End-to-end script `tests/e2e/founding.mjs` driving the whole sequence through `window.__game` (walk, assess, dig until ready, seal, lay, run or skip the time-lapse, take over a worker) with screenshots at each beat.

## Acceptance criteria
1. `npm run typecheck` clean; unit tests green (state machine, reserves, assessment scoring against the chapter's worked examples, outcome computation, failure path).
2. The end-to-end script passes in the harness with no console errors, and its screenshots (looked at) show: the queen on the surface with the intro card; the site read-out; the dug entrance with a mound; the sealed chamber with eggs; the time-lapse overlay with brood stages visibly advancing; the first workers at the reopened entrance.
3. Founding outcomes match the chapter's numbers: a good site with default reserves yields first workers within the stated range; a poor site yields fewer; reserves drain as specified.
4. Skipping the time-lapse and watching it produce the same simulation state (same `stateHash`).
5. If the queen dies before sealing, the failure screen offers retry and the game does not soft-lock.
6. After hand-over the colony is in normal play: speed controls unlocked, workers autonomous, possession of a worker works.
