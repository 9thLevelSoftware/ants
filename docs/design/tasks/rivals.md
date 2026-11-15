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

## Integrator addendum (Nov 15) — the state of the code you build on

Read the module READMEs before designing: `src/sim/combat/README.md`, `src/sim/ecology/creatures/README.md`,
`src/sim/ants/behaviours/outdoor/` (fight.ts, patrol.ts, tendHerd.ts for how a behaviour is registered:
one line in `outdoor/index.ts`), `src/worldgen/populate/**` (rival sites and territories in `WorldData`
population data), `src/sim/progression/**` (event ids it listens for), `src/audio` cue map.

- **Combat is real** (`src/sim/combat/**`). It treats any foreign colony as hostile and does not call
  `rivals.isHostile` (still a stub). You own that: provide relation state per colony pair and wire
  `isHostile` so combat's `mayAttack` consults it (ask for the smallest hook; combat's barrel exports
  `mayAttack`, `protectedQueen`, `frontHolder`, `faceToward`). What combat left to you, from its report:
  the encounter ritual (display, withdraw-with-turn, `rival-encounter` event), escalation and raids, the
  raid behind the rally marker's attack mode, `nest-attacked` for three or more hostile ants in the
  player nest, tenders attacking rival tenders at a herd.
- **Founding queen**: combat's `protectedQueen` keeps rivals gentle towards a founding queen per GDD 05;
  your "threats to a founding queen" must go through the same rule, not around it. The founding module
  (`src/sim/colony/founding/**`) reads a rival-scent factor for site quality from the static map
  (`rivalFactorAt` in `src/worldgen/maps/suitability.ts`); keep rival sites consistent with it. Another
  engineer is editing `src/sim/colony/founding/**` now — do not edit it; report needs.
- **Locomotion and behaviours** (`src/sim/locomotion/**`, `src/sim/ants/**`) are under review/fix by
  another engineer. Do not edit them except the one registration line for your behaviours; put your
  rival behaviours in `src/sim/rivals/behaviours/**` and keep them cheap (the measured cost table is in
  `src/sim/ants/testing/costTable.ts`; the outdoor budget is 1.2 ms per 500 ants and is not yet met, so
  rival ants must cost well under the player's per-ant cost).
- **Creatures** (`src/sim/ecology/creatures/**`) has a threat director and a danger grid. Use the
  director's budget interface for raid timing rather than a second pacing system.
- **Progression** needs these events from you (ids in `src/sim/types/ids/progression.ts` and the
  progression README): rival discovered, relation changed, raid incoming, rival overcome, lineage/brood
  raid events. Emit them; do not write journal text (that is `src/content/text/**`).
- **Budget**: directions §K caps simulated ants at about 2500 in total; assert it each tick in your soak.
- Test-cost rules: never run the whole vitest suite; run your folders. Long soaks go behind
  `FOUNDRESS_LONG` with explicit timeouts and are run once. `npm run typecheck` once near the end.
- Known red tests that are not yours: `src/sim/ants/behaviourRunner.test.ts` (task list), 
  `src/sim/testing/stubs.test.ts` (combat stub expectation) — the integrator fixes them.
