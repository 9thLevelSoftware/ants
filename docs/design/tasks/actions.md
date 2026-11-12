# Task actions — Action primitives, possession control and ant lifecycle (Stage 1A, Opus)

## Goal
The single library through which any ant — autonomous or possessed — changes the world, plus the rules of possession. If an effect on the world is not reachable through an action primitive, the player cannot do it either; that symmetry is a design pillar.

## Read first
- GDD 01 (`docs/design/gdd/01-modes-controls-camera.md`): section 3 (possession rules, release inference table, death and loss), section 7 (action primitives: lifecycle state machine and the full catalogue), section 9 (context prompts and target scoring), section 10 (inspect read-outs) — read these four sections in full. `docs/design/gdd/digests/01.md` gives the map.
- GDD 02 digest and GDD 03 digest for the functions your primitives call (food ledger, brood feeding, egg laying, dig bite, pellets, sealing).
- `src/sim/types/**` (`Ant`, `ActionInProgress`, `TargetRef`, commands, events), `src/sim/entities/**`, and the stubs `src/sim/ants/index.ts`, `src/sim/colony/index.ts`, `src/sim/nest/index.ts`, `src/sim/pheromones/index.ts`, `src/sim/ecology/index.ts`.

## You own
`src/sim/ants/actions/**`, `src/sim/ants/player/**`, `src/sim/ants/lifecycle.ts`, and the parts of `src/sim/ants/index.ts` that export them (keep the stub's exported names and signatures; extend additively). Constants go in `src/sim/balance/actions.ts`.

## Boundaries
- Primitives CALL other modules' functions for the real effect (dig bite and pellets -> nest; food transfers, brood feeding, egg laying -> colony; pheromone deposits -> pheromones; harvesting -> ecology sources; damage -> combat). Those modules are being written in parallel: code against their stub signatures, test with fakes, and list every function you rely on in your report.
- Movement itself is the locomotion task. Combat resolution (bite/hold/spray damage) is a Tier 2 task: implement the primitives' lifecycle, reach, cooldown and events now, delegating damage to the combat stub.
- Behaviours (later tasks) and the possessed ant both use `canDo` / `begin` / `cancel`.

## Deliverables
1. The primitive lifecycle from GDD 01 §7 (timed and continuous primitives, reach and cone tests, interrupts, failure codes, pose and sound cues as events) and a per-tick `actionSystem` that completes actions and applies effects.
2. The Tier 1 catalogue implemented per the chapter's table: let-go / grip, pick-up, put-down, drop, dig-bite, seal-entrance, unseal-entrance, lay-egg, feed-larva, trophallaxis give and receive, groom, antennate/inspect, trail-laying toggle, harvest-liquid, harvest-solid, and the lifecycle shells of bite, bite-hold, spray-acid, release-alarm, drag, tend-aphid (effects delegated to their Tier 2 owners). Availability by species and caste comes from the species definition.
3. Possession: `possess` / `release` commands and rules (who, how, soft release), the `POSSESSED` flag semantics, the release-inference table (what an ant does next from what it carries and where it is), death and loss of the possessed ant, idle auto-release.
4. Player control system: turns held/pressed intents into primitives for the possessed ant; target selection with scoring and hysteresis; the current context prompt (`prompt` query: primitive id, target, enabled/disabled reason) for the HUD; inspect read-outs as plain data for every target kind in GDD 01 §10.
5. Ant lifecycle helpers: death processing (cause, corpse item, events, dropping what was carried), eclosion hook, and removal.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Every Tier 1 primitive has tests for its preconditions, duration, effect (through fakes of the owning modules) and each failure code.
3. An interrupted timed primitive leaves no partial effect; a continuous primitive transfers exactly rate x time.
4. Each row of the release-inference table in GDD 01 §3 is covered by a test.
5. Prompt selection is deterministic and stable (no flicker between two equally good targets: hysteresis test).
6. A possessed ant and an AI ant performing the same primitive on the same target produce identical state changes.
7. Killing an ant that carries brood drops the brood intact and creates a corpse item.
8. Determinism and plain-data state.
