# Task creatures — Creature simulation: prey, neutral fauna, aphid predators, ant predators (Stage 2, Opus)

## Goal
The other animals at ant scale, each a surface walker with a small naturalistic state machine: prey the colony hunts or scavenges, neutral fauna that makes the world feel alive, predators of aphids, and predators of ants — with fair telegraphing for a possessed ant and sensible avoidance for autonomous ants.

## Read in full
GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`): the creature catalogue (kind, size, habitat, behaviour state machine, senses, speed, health, attacks, diet, how ants interact, population limits, spawning/despawning, comfort-mode substitute), live prey rules (subduing, cooperative kills, butchering into pieces), the antlion pit, the bird event, the creature director and danger grid, and the ecological invariants (including the quiet-share rule). Digest 05 for navigation. GDD 04 digest: creature territories in `WorldData`.

## You own
`src/sim/ecology/creatures/**` (one file per creature family + director + shared steering helpers), constants in `src/sim/balance/creatures.ts`.

## Boundaries
Damage exchange goes through the combat module's functions (a parallel Stage 2 task: code against its stub signatures, test with a fake). Movement through locomotion. Rendering is `render-creatures`. Ant reactions to creatures (flee, attack decisions) beyond what GDD 05 assigns to creatures belong to the behaviour and combat tasks: expose queries (`threatsNear`, `preyNear`).

## Deliverables
1. Spawning and despawning from territories with population limits per habitat, season and difficulty; the creature director that keeps threat pressure and quiet periods within the chapter's invariants.
2. State machines for every Tier 2 creature in the catalogue: prey (springtails, larvae, caterpillars, fruit flies...), neutral fauna (woodlice, worms, snails, millipedes), aphid predators (ladybird, ladybird larva, lacewing larva) acting on herds, ant predators (jumping spider, wolf spider, ant-specialist spider, antlion in its pit, centipede, rove beetle) with telegraphs, attack patterns, retreat and feeding.
3. Prey handling: subduing thresholds, corpses and butchering into carriable pieces (items/sources) with nutrients.
4. The bird event at mounds as a timed hazard with warning cues.
5. Danger grid updates (where ants died or met predators) for navigation costs and alarm.

## Acceptance criteria
1. Typecheck and tests green; pure simulation code.
2. Each creature kind has tests for its state transitions, senses and limits (table-driven against the chapter).
3. A 28-game-day headless soak with a 300-worker colony: creature counts stay within limits, the quiet-share invariant holds for the Naturalist preset, ant deaths by predation stay within the chapter's bounds (report numbers).
4. A possessed-ant scenario per predator: the telegraph precedes the attack by at least the stated time and the counterplay the chapter describes works (scripted intent).
5. Ladybirds reduce an undefended herd; prey killed by ants becomes food pieces with the right nutrients.
6. Determinism; plain-data state; no creature ends inside a solid.
