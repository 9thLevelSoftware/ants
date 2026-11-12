# Task beh-nest — In-nest behaviours: nursing, queen care, storing, digging, hauling, resting, guarding (Stage 1B, Opus)

## Goal
The autonomous indoor life of the colony: larvae get fed, eggs gathered, brood moved to the best microclimate, the queen attended, incoming food received and stored, dig plans excavated and their soil hauled to the mound, waste and corpses taken to the midden, tired ants resting, and the entrance watched — all without the player.

## Read first
- GDD 02 (`docs/design/gdd/02-colony-simulation.md`): read in full the behaviour state machines for `nurse`, `queen-care`, `store`, `dig`, `haul`, `idle`/`rest`, `guard` and the established queen, plus brood placement by microclimate, the starvation and feeding rules those behaviours implement, and necrophoresis/midden rules. `docs/design/gdd/digests/02.md` gives the map.
- GDD 03 digest and the chapter's sections on the dig/haul loop, pellets, spoil points, the midden site, and brood-placement ranking by chamber climate.
- The modules you drive (read their `index.ts` exports and API docs): `src/sim/locomotion`, `src/sim/nest` (dig sites, plans, pellets, chambers), `src/sim/ants/actions`, `src/sim/colony` (brood, queen, stores, ledger, allocation), `src/sim/environment` (chamber temperature), `src/sim/ants/behaviourRunner.ts`.

## You own
`src/sim/ants/behaviours/nest/**` (register through its `index.ts` `behaviours` array). Constants in `src/sim/balance/nestwork.ts`.

## Boundaries
- Movement through locomotion requests; world changes only through action primitives; food and brood accounting through the colony module's functions called by those primitives.
- The nest architect (what to dig) is another task; you execute plans that exist. Fighting at the entrance is Tier 2: `guard` posts ants and raises alarm, with a hook for combat.

## Deliverables
1. `nurse`: job selection from a colony-wide nursery board (hungry larvae, eggs to collect, brood in the wrong chamber, pupae needing help), loading food, feeding, carrying brood to the best chamber for its stage, grooming; the chapter's timings and priorities.
2. `queen-care`: attendants feed and groom the queen, collect and carry eggs, escort her when a `move-queen` marker or an emergency relocates her.
3. `store`: receiving incoming foragers' loads near the entrance, moving food to store chambers, keeping stores tidy, cleaning.
4. `dig` and `haul`: claim a dig site, travel, bite (through the action primitive, with the plan's heading and slope), stow or carry pellets, haul to the mound outside the right entrance; waste and corpses to the midden; release claims on failure.
5. `idle`/`rest` (where ants wait, how they recover fatigue, how they make themselves available) and `guard` (entrance posts, alarm raising).
6. The established queen's own behaviour (stay in the royal chamber, lay through the action primitive within her egg budget, relocate when asked).
7. Decision logging (reason codes) for the inspect card; state timeouts so no ant is stuck.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; no `three`/DOM imports.
2. Headless scenario (test sim with the standard small nest, a queen, 40 workers, 30 brood of mixed stages, ample stores): over 2 game days larval hunger stays below the chapter's threshold, eggs laid by the queen end up in nursery piles, and brood reach adulthood at the rate the brood model predicts (report numbers).
3. When chamber temperatures are changed (deep chamber warm, shallow cold, then reversed), nurses move brood to the better chamber within the time the chapter implies.
4. A chamber dig plan is completed by autonomous diggers; every pellet created is hauled out and ends in the mound (volume conservation within 10 %); no two diggers hold the same site; cancelling the plan frees all claims.
5. Corpses and waste placed in the nest are moved to the midden; incoming food handed over at the entrance ends in the store chamber and in the ledger.
6. With stores at zero the behaviours follow the starvation rules (who is fed first) rather than deadlocking.
7. No ant stays in one state beyond its timeout over a 5-game-day soak; all world changes go through action primitives (test double counts direct mutations: zero).
8. Determinism; performance on this machine: 800 in-nest ants average under 1.5 ms per tick (report).
