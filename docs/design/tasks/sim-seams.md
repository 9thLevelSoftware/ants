# Task sim-seams — Small simulation seams outside the colony engineer's rounds (Opus implement / Opus verify)

## Goal
A set of small, known defects in simulation modules that the colony engineer (`colony-life`) is not working in. Each is fixed at its cause with a test. This is part of the simulation half of the gate (`docs/design/tasks/gate-close-sim.md` step 5 and its red-test list), split off so it can run beside the colony work.

## Read in full
`docs/STATUS.md` (rulings R1–R28; the entries from Nov 16 on), `docs/design/tasks/gate-close-sim.md`, `gate-1B-sim-report.md` §9, §12, §15, `docs/design/tasks/reviews/difficulty-rules.json` (open parameters), GDD 06 §4.5 (time, auto-slow), §5.2 and §5.6 (opening grace, opening threats), GDD 05 rivals chapter, the progression chapter of GDD 06 (milestones, aims, journal, codex unlocks) and the registry in `docs/design/gdd/00-index.md` section B.

## You own
`src/sim/progression/**` except the meaning of alerts (`alerts*.ts`: additive only), `src/sim/rivals/**`, `src/sim/commands*.ts`, `src/sim/time*.ts`, `src/sim/save/**`, `src/sim/world/**` bounds helpers, `src/sim/balance/progression.ts`, `balance/rivals.ts`. **Not yours** (another engineer is mid-round there): `src/sim/colony/**`, `src/sim/ants/**`, `src/sim/nest/**`, `src/sim/ecology/**`, `src/sim/locomotion/**`, `src/sim/environment/**`, `src/worldgen/**`. A cause there goes in your report with a failing test or a counted reproduction; an edit under 20 lines there is allowed only for item 6 below, with a line in `test-output/sim-seams/cross-edits.md`.

## Items
1. **Milestones and Stage 2 events**: a table-driven test that every milestone id, aim id and codex-unlock trigger in the registry has a listener and a trigger that can fire in a real game (name the event and the system that emits it); add the listeners that are missing (`rival-discovered` and whatever else the table shows) and report every id whose emitter does not exist in the sim (with the module that should emit it).
2. **Journal**: `progression/journal.ts` `yearOfEntry` is wrong after the winter jump; the winter notice and the spring return get entries; an entry's day and year are right across two winters (test).
3. **Rivals at tick 1**: `rivals-agents` set-up costs 1.7–5.5 s at the first tick. Move it out of the first tick (at world creation, or spread deterministically over ticks) so no tick of a new game exceeds 50 ms for it; same state hash after 2 game days as today unless you show why it must differ; `rivals: 0` (R23) still yields no rivals and no incipient foundations.
4. **Commands**: `src/sim/commands.test.ts` "ends with lifecycle" is red: find whether the test or the system order is wrong and fix the wrong one; the robust/validation/verify command tests stay green.
5. **Time**: the sim event `time.auto-slow` is declared and never emitted; GDD 06 §4.5 names what triggers auto-slow. Decide with the app's `AutoSlowWatcher` (`src/game/time/autoSlow.ts`, read only) which side owns the trigger; if the sim should emit, emit it deterministically and say what the app must do; if the app owns it, remove or deprecate the dead event (additive contracts: mark it, do not delete the type) and say so.
6. **Difficulty parameters without a consumer** (`reviews/difficulty-rules.json`: `openingGraceGd`, `openingThreatsMax`, `queenLifespanMult`, `flightPredatorEvents`, `alertLeadWarnings`, rules `queenSenescence`, `foundingAssist`, and `autoSlowDefault` found by the docs task): for each, find the rule in the GDD, and either wire it where the consumer lives (the opening grace gate for human events and predator spawns of GDD 06 §5.2 is the important one; a cross-edit under 20 lines per consumer is allowed, logged) or leave it flagged `inEffect: false` with the exact missing piece named. Update `UNWIRED_PARAMS` / `UNWIRED_RULES` in `src/sim/config/presetDisplay.ts` to the truth.
7. **Bounds**: creatures and ants parked at the map edge (gate report L-items): a counted reproduction on two archetypes (how many entities sit within 2 BU of the bounds after 2 game days, which kinds, why), and the fix if it is in your paths; otherwise the reproduction for its owner.
8. **Save**: a save made in each of these states loads to an equal state hash and continues equally for 0.2 game days: mid-opening (each founding phase), mid-time-lapse, at hand-over, mid-flood, mid-human-event, mid-hunt, in the winter lapse prompt, first tick of spring year two. Report the ones that differ, with the differing state path; fix those in your paths.

## Acceptance criteria
1. Typecheck clean; tests green in every folder you touched (folder by folder, never the whole suite).
2. Each item: fixed with a test, or reported with the reproduction and the owner. The table of item 1 and the table of item 8 are in the report.
3. No tick over 50 ms from rivals set-up in a new game (measured, method of the sim gate report §9; the machine is loaded, so compare before/after on the same run and say the load).
4. Report `docs/design/tasks/sim-seams-report.md`.

## Machine rules
4 cores shared with two other engineers (load average 5–9). One life-length run of yours at a time; `uptime` and `free -g` before a heavy process; background commands have a 2 h limit and die with a container restart: keep batches short and restartable; no `process` in test files; long tests behind `FOUNDRESS_LONG=1`; `date -u` before a timestamp; no git commands that change the index. Evidence under `test-output/sim-seams/`.
