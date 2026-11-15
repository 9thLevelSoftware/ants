# Task int-1B-sim — Stage 1B integration gate, simulation half: a colony that lives by itself (Opus)

## Goal
Join the Stage 1B simulation work — autonomous behaviours, the nest architect, the founding sequence, the populated world — into a colony that founds itself, feeds itself, raises brood, digs and grows on a generated world with no player input, deterministically, with the economy inside the design's sanity budget. A second engineer does the application half (browser flow, views, HUD, look) at the same time.

## Read first
- `docs/design/tasks/notes-1B.md` — every Stage 1B task's report (not done, needs from others, notes for the integrator, contract changes, unmet criteria, unfixed minor findings). Your work list is everything in it that concerns `src/sim/**`, `src/worldgen/**`, `src/core/**`, `tools/sim/**`: resolve each item or record why not.
- `docs/design/tasks/gate-1A-sim-report.md` (the state you start from) and `docs/design/tasks/gate-1A-app-report.md` §7.
- `docs/design/gdd/00-index.md` sections C (final constants; C13 is the economy sanity budget) and F (risks: which economy numbers were never verified), `docs/design/gdd/digests/02.md`, `03.md`, `05.md`, `06.md`; the owning GDD chapter wherever a behaviour looks wrong.
- `docs/02-design-directions.md` §J and §K (binding units and rulings).

## You own (for this task)
Integration edits anywhere under `src/sim/**`, `src/worldgen/**`, `src/core/**`, `tools/sim/**` and their tests. Rules: fix a defect where its root cause lives; keep each edit minimal; never weaken a test to make it pass; contracts stay additive; tunables only in `src/sim/balance/**` (list every value you change, old -> new, with the evidence); list every file you touched with a one-line reason. Do not edit `src/render/**`, `src/game/**`, `src/ui/**`, `tests/e2e/**` (the application-half engineer owns those) — describe defects you find there precisely in your report. Do not start Stage 2 features (weather effects, creatures, combat, rivals, reproduction).

## Work
1. **Baseline.** `npm run typecheck`; the simulation-side test suite. Record and fix every failure at its root. Then put the suite on a diet: measure per-file run time, and move every sweep that takes more than about 20 seconds on an idle machine (many seeds, multi-day soaks, large populations) behind `FOUNDRESS_LONG=1` while keeping a small always-on version of the same check. Target: the default simulation-side suite runs in under 5 minutes on an idle 4-core machine. Report before/after.
2. **Seams.** Connect what the Stage 1B tasks left as adapters or stand-ins: behaviours to the real perception, pheromone, source, colony and nest functions; the architect to real needs and real diggers; founding to the real dig, seal and lay actions and the real brood model; new-game creation to the populated world's start position, food anchors and suitability maps (`ensureThermal` and similar set-up belongs in `createNewGame`); chamber and entrance registration for a nest the queen dug freely. Remove scripted stand-ins from production paths (they stay available to tests).
3. **Colony-life tool.** `tools/sim/life.ts` (run through `tools/sim/run-ts.mjs`): new game on a generated world (seed, archetype, species, difficulty), founding completed through the real founding code path at maximum speed, then N game days with no player. Per game day it logs: population by caste and brood stage, carbohydrate and protein stores, foraging trips started/completed, deliveries by source kind, deaths by cause, dig plans created/completed, pellets made/hauled, nest volume and chambers by type, trail cells above threshold, ants per behaviour state, ants that hit a state timeout, invariant violations, and average/maximum milliseconds per system. Output: JSON and a Markdown table.
4. **Make it live.** Run the tool for every Tier 1 archetype, 3 seeds each, 10 game days from the default start date. A run is healthy when: founding yields first workers in the chapter's range; workers leave, find food and return; stores do not collapse to zero for more than the chapter tolerates; larvae are fed; the population grows along the GDD 02 curve within its tolerance; the architect adds chambers as the colony grows and every pellet leaves the nest; no ant is stuck beyond its state timeout; zero invariant violations. Diagnose every unhealthy run to a root cause and fix it (behaviour logic, navigation on real terrain and props, perception, source placement and reachability, balance). Typical traps to check explicitly: foragers that cannot get back in through the entrance; scouts that never leave the entrance area or walk off the map; trails that never form on rough ground or across kerbs and steps; food anchors that are unreachable for a walker; nurses starving larvae while stores are full; diggers and haulers blocking a one-ant-wide tunnel; the founding chamber never being registered so the queen cannot lay; mound soil sealing the entrance.
5. **Economy check.** Compare measured intake, consumption and growth to `00-index.md` C13 and the GDD 02 targets for colony sizes 20, 100 and 300 (reach the larger sizes with the debug cheats where waiting would take too long, then measure a full game day). Adjust balance values where the model is off; if a GDD number is itself inconsistent, keep the game healthy and record the deviation.
6. **Player in the loop (headless tests).** A possessed worker can harvest from a real source, carry it home and deliver it by the action primitives; a possessed queen's directives change allocation and, measurably, outcomes (more foragers -> more deliveries; brood production off -> no new eggs); `forage`, `avoid` and dig-plan markers change behaviour; with auto-expansion off the architect creates nothing.
7. **Robustness.** Save -> restore -> continue equals an uninterrupted run, taken mid-life (trails present, plans in progress, ants carrying). A 5-game-day soak with 300 workers: zero invariant violations. Determinism: same seed and commands, same `stateHash`, across two processes.
8. **Performance.** Simulation cost per tick on a generated world with autonomous behaviour at 300, 800 and 1,500 workers, per system, measured several times (report the minimum; the machine is shared). Budget: the architecture's simulation budget; fix any system that exceeds its share by a wide margin (unbounded per-tick work, quadratic scans, per-tick allocation).
9. **Report** `docs/design/tasks/gate-1B-sim-report.md`: what a colony now does unattended (with the per-day tables for one seed per archetype), balance changes, defects fixed (file, cause), defects left (with reproduction), performance tables, every notes item and its outcome, and what Stage 2 tasks must know.

## Acceptance criteria
1. `npm run typecheck` clean; every test under `src/sim`, `src/worldgen`, `src/core` green in default mode; the default suite's run time is reported and under the target (or the remaining offenders are listed).
2. The colony-life tool exists, and for every Tier 1 archetype at least 2 of 3 seeds are healthy by the definition above over 10 game days; every unhealthy seed has a recorded diagnosis.
3. The player-in-the-loop tests pass.
4. Mid-life save/restore determinism holds; the 300-worker 5-day soak reports zero invariant violations.
5. Performance tables for 300 / 800 / 1,500 workers are in the report, with the budget verdict per system.
6. No production code path uses a scripted stand-in, test double or stub where a real module exists (grep-based check listed in the report).
7. Every simulation item in `notes-1B.md` is accounted for in the gate report.

## Addendum 2 (integrator): two fix tasks ran before this gate
Two fix tasks ran before this gate and took most of the root causes listed in the next section: `sim-fix-ants` (walker stalls, behaviour cost and board cadence, action primitives, deliver-first, home deposits, avoid markers) and `sim-fix-colony` (plan bounds, spoil and passages, mound cost, entrance alert, colony delivery function and alerts, Tier 1 sources, balance re-exports). Their reports are in the notes file: read them first, verify their claims by running, connect the two sides where each left a note for the other (the foraging adapter and the new delivery function; haulers and the dead-end query), and treat the list below as a checklist of what must be true at the end, not as work to redo.

## Addendum (integrator): known root causes handed to this gate by finished tasks (details in the notes file)
- **Locomotion stall (fix first — it slows every in-nest job).** An autonomous walker with a point goal inside the nest often stands still for seconds with `nav.status` 'moving' and speed 0 (goals 0.4-2 BU away; upside down on a tunnel ceiling with the target below; requested moves smaller than one nest voxel). A fresh request restarts the recovery ladder, so callers cannot cure it. The in-nest behaviours carry a workaround (`reachAndAct`/`approach` in `src/sim/ants/behaviours/nest/**`): fix the walker, prove it with a test at the locomotion level, then remove or shrink the workaround.
- **Behaviour cost.** In-nest behaviours measured 6.4 ms per tick for 800 ants and foraging 2.0 ms for 500 outdoor ants under heavy machine load (budgets 1.5 and 1.2 ms). Measure on a quiet machine (repeat, take the minimum); the in-nest job board is rebuilt every tick although the design says every 2 s — give it an aligned rebuild that survives save/load (store the board, or rebuild deterministically on load), and stop "think every tick near a target" from scaling with population.
- **Nest operations.** Plan bounds are a cube about 4.75 times too large (validation and plan-cache cost; the architect's 400-worker layout takes 82 ms against 50 ms); `acceptPlan` is a no-op; spoil piles inside the nest are not cleared by haulers before pellets tamp (after 1200 s a pile can close a 2 BU neck); mound batches cost 40-90 ms per 250 ticks per mound (spread over ticks); a nest with no open entrance needs the design's internal-dump rule (deepest dead-end query) and the `midden-blocked` flag; raise an alert when an entrance closes without a plug.
- **Colony seams.** A public count-only delivery function (the foraging adapter imports colony internals today); `cheat.injectReturn` must reach foragers waiting in the entrance chamber; the `stores-full` alert; the allocator must not reassign ants that are outside on a trip; passive home-pheromone deposits (`HOME_DEPOSIT_PER_BU`) have no owner, so scouts never bias away from home ground; crop loading, queen feeding, eclosion help and cannibalism still run through a local adapter instead of action primitives; liquids need an unload-to-chamber primitive and the departure ration its own ledger key.
- **Hygiene.** `src/sim/balance/index.ts` should re-export the foraging, nest-work and architect balance files; `behaviourRunner.test.ts` still asserts an empty outdoor list; remove the no-op `perception` placeholder system; check for an import cycle between `src/sim/colony/founding/clutch.ts` and `src/sim/ants/actions` (`ports.canLay is not a function` appeared depending on import order); once founding sets `digging` on the first bite, remove `site-search` from `FOUNDING_CELL_STATES`.
- Tier 1 static spills still evaporate (half-life 0.15-1 game day) and Tier 1 carrion is removed after 3 game days: check both against the design's Tier 1 rules and the economy floor.

## Addendum 3 (Nov 15, evening) — integration list handed to this gate by the task owners

Everything below is small, cross-module and unowned. Do each, with a test where it changes behaviour.
The collected reports are in `docs/design/tasks/notes-1B.md` (claims to check, not facts).

**Red tests to resolve (baseline `test-output/full-suite-nov15.txt`: 23 failures)**
1. `src/sim/sim.test.ts` restore-at-N equals uninterrupted — save/load determinism. Top priority: find
   the state that is not saved or not restored (candidates: `SimState.nurseryBoards` cadence, behaviour
   blackboards added since, module-private caches) and fix at the cause.
2. `commands.robust` periodic-system tick collision.
3. Layering tests: `performance.now` in `src/sim/ants/testing/costTable.ts`, `window` in
   `src/sim/locomotion/update.ts`, `src/worldgen/populate/common.ts` matching the `window` rule,
   `src/worldgen/populate/populate.verify.test.ts` importing `@/sim/balance/ecology`.
4. `src/sim/ants/behaviourRunner.test.ts`: the expected task list needs fight, patrol and tend
   (Lasius/Camponotus). `src/sim/testing/stubs.test.ts`: combat is real (`applyDamage(queen, 5)` = 4).
5. `src/worldgen/validate/checks.ts` `checkStart`: when the start rule fails only because the good-site
   count is short and `contentLimited(ctx, good)` is true, return `regenerate: false` like `checkFound`
   and `checkConnect`. Turns `pipeline.test.ts` "wood nesters without catalogue wood" green.
6. `removal.verify.test.ts`: a scout in `scout.explore` re-enters the rim zone five times after a removal.
   Decide per GDD 02 whether scouts count; fix the behaviour or the test, and say which and why.
7. Architect layout 50 ms, outdoor `determinism.perf`, `sfaReview` feed-queen, populate.verify (3),
   remaining outdoor/interior worldgen tests: re-run each alone on a quiet machine first; several were
   load-sensitive. Fix what is real.

**Seams**
8. Colony `computeDemand` must compute the `tend` demand with `herdTendDemand(sim, colonyId)`; then set
   `TEND_DEMAND_ADAPTER = false` in the plants module.
9. `fleeTask`: hand back `rest` instead of `idle` when health < 0.25 (GDD 02 §10.13).
10. Action library: pass the attacker id to `applyDamage` from bite and spray shells; native `dodge` and
    `sting` shells; the bite shell asks combat whether the ant may bite, the spray shell whether the
    special works; drop the fixed-strength bite cue (combat emits it with the target's hardness). Then
    remove combat's runtime adapters that patch `ACTION_DEFS`.
11. Locomotion on the surface (from the worldgen-fixes walker work): an ant that has wrapped onto the
    underside of a stone bulge or stands on the raised tip of a thin leaf sheet cannot get off and ends in
    the relocation teleport; `letGoPinned` / `dropToGoal` only act in the cavity medium. Add a surface
    let-go / step-down. The stuck ladder's progress metric must count climbing (a 47 BU fence board
    triggers it mid-climb). A nav cell open only through a narrow strip traps a walker aiming at the cell
    centre. Sites to reproduce are listed in the worldgen-fixes report; the three `FOUNDRESS_LONG`
    kernel crossings (suburban-garden #4, playground-park #3, kitchen-door #3) are the acceptance.
12. Possessed-ant per-frame prediction ignores movement overrides (a pinned possessed ant twitches).
13. Colony health regeneration vs GDD 05 §4.7 (0.25/gd in nest with crop C, 0.1/gd elsewhere).

**Not for this gate (recorded for Stage 2/3)**: `ECOLOGY_TIER` 1 → 2; map-wide site-food rule; Camponotus
kitchen-door has no good founding site (species-carpenter); generation time E8 on an idle machine (perf);
rival nests pre-carve (rivals).

**Outdoor budget**: 500 foragers outdoors ≤ 1.2 ms per tick is still unproven. Measure on a quiet machine
(`uptime` load < 2) and report the table; if it is over, profile and fix the top two costs.
