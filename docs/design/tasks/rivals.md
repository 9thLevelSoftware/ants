# Task rivals — Rival colonies: abstract populations, fielded agents, territory, wars and raids (Stage 2, Opus)

## Goal
Neighbouring ant colonies that compete with the player's: each an abstract colony (population, stores, seasonal growth, aggression) that fields a limited number of real ants, owns a small real nest that can be invaded, marks territory, and escalates from skirmish to war to raid according to the design.

## Read in full
GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`) section 5 (rival roster per habitat with stats, the abstract colony model, fielding rules and the agent budget, their real nests, territory from home-range marking, encounter rules, escalation, brood raiding of same-species incipient colonies, destruction and aftermath, threats to a founding queen, incipient rivals) and the invariants that concern rivals. GDD 04 digest: rival sites in `WorldData`. `docs/02-design-directions.md` §K (budget under ~2500 simulated ants; brood raiding is a labelled gameplay mechanic). Digest 05.

## You own
`src/sim/rivals/**`, `src/sim/species/rivals/**` (`RivalSpeciesDef` data for every rival species), constants in `src/sim/balance/rivals.ts`.

## Boundaries
Rival ants are ordinary `Ant` entities flagged as fielded: they move through locomotion, fight through combat, forage with the simplified rival behaviours you provide (do not reuse the player's full behaviour set unless it is cheap). Their nests are pre-carved with the nest architect's layout function through the nest module's public API. Player-facing relation wording belongs to the UI.

## Deliverables
1. Abstract colony simulation on a slow cadence: population by season, stores, growth, losses fed back from fielded ants' deaths and deliveries.
2. Fielding and recall: spawn real ants at the rival entrance within the global budget, simple forage/patrol/raid behaviours, despawn when they return.
3. Real rival nests created at game start (queen, brood, a few chambers), invasion rules, queen death -> collapse, brood stealing by same-species raiders (both directions).
4. Territory grid from marking; relation states and escalation (skirmish, war, raid on the player's nest or the player's raid on theirs), driven by strength ratios, distance and the threat director, respecting difficulty.
5. Threats to the founding queen and incipient rivals per the chapter.
6. Diagnostics, alerts and events (rival discovered, relation changed, raid incoming, rival overcome).

## Acceptance criteria
1. Typecheck and tests green; pure simulation code.
2. The total of simulated ants never exceeds the budget in a 28-day soak with 4 rivals (assert every tick).
3. Abstract growth curves match the chapter's tables per rival species and season.
4. Scripted scenarios: border contact escalates through the stated states with the stated timings; a raid arrives with a warning; killing a rival queen collapses that colony; stolen same-species brood ecloses as the thief's workers.
5. A founding queen placed within the stated distance of a rival is threatened as specified; beyond it she is not.
6. Determinism; plain-data state.
