# Task weather-fix2 — Flooding must not kill dry nests (stabilisation round, Opus)

## Why
The first-playable sim gate found that the nest flood model landed by `weather-effects` drowns ants in dry weather. Sweep 4 of the colony-life tool (15 runs, `docs/design/tasks/gate-1B-sim-report.md` §5 and §12 L12): 6 founding queens drowned in their sealed cells at 0.55–0.59 game days with overcast weather and precipitation 0; 49 drowning deaths in all. This blocks the first playable build. It is the top priority of the whole project right now.

## Read
`docs/design/tasks/gate-1B-sim-report.md` §5 (sweep 4 table), §12 L3, L12, §17. GDD 03 flooding section (§11) and GDD 06 soil moisture / rain. `docs/design/tasks/weather-effects.md` and its integrator addendum. Your code: `src/sim/nest/flood/**`, `src/sim/nest/collapse/**`, `src/sim/environment/{effects,moisture,flooding}*.ts`, `src/sim/balance/weather.ts`.

## You own
The files above. Tests beside them. Nothing else (report needs).

## Work
1. **Reproduce first**: `node tools/sim/run-ts.mjs test-output/int1b-fix/fprobe.ts 3 woodland-edge` (if the probe file is gone, write the same: generated world, default start, founding by `cheat.completeFounding` or the passive path, log water level / chamber flooded share / the queen's drown timer each 100 ticks). Find the root cause (initial soil moisture treated as standing water? water table? a sealed cell counted as a basin with inflow from saturation? the spill cache labelling solid as water?). Fix the cause, not the symptom.
2. **Invariants, as tests on generated worlds (seeds 1–3 × the five Tier 1 archetypes, behind `FOUNDRESS_LONG` if slow, plus a fast version on the test world):** with precipitation 0 for 3 game days no chamber's flooded share rises above 0 and nobody drowns; a site the static suitability map calls flood-safe (`floodFactorOf` ≥ its "raised" threshold in `src/worldgen/maps/suitability.ts`) does not flood in an ordinary shower; a **sealed** founding cell takes water only by the GDD's seepage rule, never through its plug as if open; water recedes after rain at the GDD's rate.
3. **Founding queen**: a queen in a flooding cell follows GDD 03/06 (alert with words, time to react, she can dig up/out when possessed); never a silent death at 0.55 gd.
4. **Save/restore divergence** (L12, `stage1a.e2e` (c) at tick 5,360; probe `test-output/int1b-fix/e2ec2.ts`): check whether your last round's persisted throttle fixed it; if not, fix. `npx vitest run src/sim/testing/e2e/stage1a.e2e.test.ts` (105 s) must pass (a), (b), (c).
5. **Other red tests your work caused** (re-run each; fix or prove not yours): `nestFixes.verify` App. E check 5 (mound erosion 0.5004 % vs 0.5 %), `beh-nest` `colony.scenario`, `sorting`, `starvation`, founding `system.test` passive player.
6. **Words**: `remedy.dig.drain-chamber` has no text (`src/content/text/words.ts`; `health.verify.test.ts` fails) — add it (additive edit in content is allowed for this id only).
7. **Ruling on the flood diagnostic contradiction** (your round-2 note 12): follow GDD 03 §11.3 — the critical `nest-flooding` alert only while a brood or royal chamber is ≥ 25 % flooded; a predicted flood from the reference storm is an `info` note with its remedy. Keep it that way and make the registry not raise the critical alert on `warn` for this diagnostic (report the line if it is outside your files).
8. **Cost**: report flood + moisture ms per tick on a generated standard world with one dry nest and with one flooding nest; no tick above 10 ms.

## Others are working in parallel
`viab-founding` (src/sim/colony/founding/**, nest entrances), `viab-economy` (src/sim/colony/**, balance, foraging), `viab-loco` (src/sim/locomotion/**), `human-events` fix (src/sim/environment/human/**). Do not edit their files. They are told that drowning is yours.

## Acceptance
1. Item 2's invariants pass. 2. `node tools/sim/run-ts.mjs tools/sim/life.ts --seed S --archetype A --until-day 6` for woodland-edge 3, suburban-garden 1, car-park-verge 1 and 3, kitchen-door 1: zero drowning deaths in dry weather (founding may still fail for reasons owned by others: say which). 3. stage1a.e2e green. 4. Typecheck clean; your folders' tests green. Machine rules: 4 cores shared, never run the whole suite, report what you ran.
