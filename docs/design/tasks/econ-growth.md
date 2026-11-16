# Task econ-growth — A colony that feeds its brood and scales (Stage 2 stabilisation, Opus implement / Opus verify)

## Goal
`viab-economy` met the viability bar (11 of 15 runs, ≥ 2 of 3 on every Tier 1 archetype; `test-output/viab/final3.txt`), but the colonies it produces are passive: they live on the food provisioned at the hand-over, make 0.0–0.3 trips per worker per game day, let larvae starve for protein while workers stand idle, and at 300 workers the colony earns 0.57× its carbohydrate need and 0.14× its protein need. A player watching this sees nothing happen. Make the colony forage for what its brood needs at every size, without undoing the viability bar.

## Read in full
`docs/design/tasks/viab-economy.md` (rulings R1–R6 and the viability bar: binding) and its result in `docs/STATUS.md` (Nov 16 14:00 entry). GDD 02 (`docs/design/gdd/02-colony-economy.md`) §§ on needs, activation, allocation, the worked example §15 and Appendix E checks 13 and 25. GDD 05 food table (owns food data). `tools/sim/life.ts`. `src/sim/colony/diagnostics.ts` (the foraging diagnostic already names `foragers`, `sources`, `success`, `distance`).

## You own
`src/sim/colony/**` except `founding/`, `overwinter/`, `reproduction/`, `succession/`; `src/sim/balance/**` except `founding.ts`, `weather.ts`, `human.ts`, `lifecycle.ts`; `src/sim/ants/behaviours/outdoor/**`; `src/worldgen/populate/**`; `tools/sim/life.ts`; `src/sim/testing/gate1b/**`. Another engineer (`overwinter-repro`) is adding `src/sim/colony/{overwinter,reproduction,succession}/**` and may ask for hooks: additive only. Do not edit `src/sim/locomotion/**`, `src/sim/nest/**`, `src/sim/colony/founding/**`, `src/sim/environment/**`.

## Integrator rulings (binding; they continue R1–R6)
- **R7 — Appendix E 25 and the carrion piece.** GDD 05's food table stands: a 1-bulk carrion piece carries 0.375 P. The worked example's "0.9 P per trip" is superseded. Re-derive check 25 from first principles and replace its fixture: a real aphid herd at the Tier 2 drinking rate (no stand-in honeydew film) plus carrion at the stated distance, 100 workers. It passes when, over the measured window: carbohydrate intake is 0.9–1.5× the colony's carbohydrate need; protein intake is 0.9–1.8× its protein need; eggs laid are in the chapter's range; the carbohydrate stock does not fall by more than 3. The number of foragers out is reported, not asserted. Record the re-derivation in a comment at the test and in your report (the integrator will amend GDD 02 §15).
- **R8 — Tier 2 food floors and generation time.** Human-event food stays out of the floors. A world is regenerated for an economy floor only if, after in-place top-ups (flowers, herd hosts, prey patches), any floor is below 80 % of its target; between 80 and 100 % the world is accepted and flagged `economyLean` in the validation report. Generation time on the 15 sweep worlds must be within 1.25× of the pre-`viab-economy` time (measure both; say what the load was).
- **R9 — Protein demand drives foraging.** "A stocked colony forages little" applies per nutrient. Hungry larvae with protein stores under target is a demand that sends scouts and foragers out for protein whatever the carbohydrate stock, in colonies of every size; the same for carbohydrate. The winter-reserve rule (R5) may stop laying; it must not stop feeding larvae that already exist.
- **R10 — Scale.** Appendix E 13 must hold at 100+16, 300+16 and 800+16 workers on its standard supply: intake ≥ 1.0× need for both nutrients. Find why demand is "capped by known source capacity", why 55 % of trips fail and why a forager makes 1.1 trips per game day, and fix the causes; do not paper over with supply.
- **R11 — Old age.** GDD 02 §1.3 stands (outside ageing 3 per game day). Do not change lifespans. If first workers die of age before their replacements eclose, that is fixed by feeding the brood (R9), not by ageing.

## Work
1. Reproduce: `woodland-edge #2` (285 trips a day, almost no deliveries, C 0 at winter), `woodland-edge #3` (0 deliveries), `kitchen-door #3` (0 trips), and the 300+16 economy check. For each, the cause from the sim's own counters before any change.
2. Fix causes under R9 and R10. Every behavioural rule gets a unit test on a small fixture and a line in the balance tables if it has a number.
3. R7 and R8.
4. Sweep: `life.ts --until winter`, seeds 1–3 × five Tier 1 archetypes, at most 2 runs at a time. Report the viability table and these new columns: larvae starved, trips per worker per game day while a nutrient is under target, share of trips that succeed, protein intake ÷ protein need.
5. One long run to prove growth: seed 1 suburban-garden with `--start-doy 2` (an early-spring start through the real founding or the forced-seal fallback) until the first tick of Winter 1: the colony must reach ≥ 40 workers with brood of every stage present at Autumn 1. If `life.ts` has no such option add it.

## Acceptance criteria
1. Typecheck clean; `src/sim/colony`, `src/sim/ants/behaviours/outdoor`, `src/worldgen/populate` test folders green (name any red test that is another owner's).
2. Viability bar still met (≥ 2 of 3 seeds on each archetype) on the final tree.
3. In the sweep: no larva starves in ≥ 12 of 15 runs; trips per worker per game day ≥ 1.0 while a nutrient is under target and surface activity ≥ 0.5 (median across runs); ≥ 70 % of trips succeed (median).
4. Appendix E 13 holds at 100, 300 and 800 workers; Appendix E 25 (re-derived per R7) passes.
5. The early-start run reaches ≥ 40 workers by Winter 1.
6. Generation time per R8.
7. Sim cost per tick not worse than before your change at 300 / 800 / 1,500 workers (same method as the gate report §9; say the load).

## State of the shared tree (read before you start)
- Two other simulation engineers are still finishing: `viab-founding` (opening, sealing, plug reopening: on plain HEAD the entrance plug is sometimes never reopened after the hand-over) and `weather-fix2` (nests flooding in dry weather). Until their work is committed use `life.ts`'s forced-seal fallback and `--no-flood` when their defects block a run, and say so beside each number. Re-run the final sweep on the shared tree as it stands at the end of your work, without `--no-flood` if `weather-fix2` has landed (check `docs/STATUS.md`).
- `src/sim/systems.ts:57` had an import cycle that broke some test files at import time; if it is still there and blocks your tests, report it (owner: `viab-founding`).
- Known locomotion stall sites are listed in the `viab-economy` result; locomotion is not yours: report coordinates.

## Machine rules
4 cores shared with five other engineers; never the whole vitest suite; at most 2 life runs at a time; long tests behind `FOUNDRESS_LONG=1`; check `date -u` before writing timestamps. Evidence under `test-output/econ-growth/`.
