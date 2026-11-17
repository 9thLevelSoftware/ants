# Task colony-life — A colony left alone grows (Opus; measured rounds; whole-sim authority)

## Why this task exists
Three rounds of work (`viab-economy`, `econ-growth`, its fix round) have left colonies that mostly sit still and age out: in the last sweep 7 of 15 were viable, 11 of 15 had no worker eclose after hand-over, median trip success was 17 % and median protein intake was 14 % of need (`test-output/econ-growth-review/sweep9-table.md`). Each round ended with its owner naming another module (locomotion, nest, founding, ecology). This task has no such border: you own the cause wherever it is.

## Read in full
- `docs/STATUS.md` from the Nov 16 14:00 entry to the end. Rulings R1–R19 are binding and take precedence over the GDD. R18 (protein a small colony can take) and R19 (growth bar) are the point of this task.
- `docs/design/tasks/colony-life-ledger.md` — the running ledger of this task. Earlier rounds' causes, fixes, things tried and reverted, and the independent sweep after each round. **Read it first; do not redo or undo what it records without new evidence.** If it does not exist, you are round 1: create it.
- `docs/design/tasks/viab-economy.md` (viability bar), `econ-growth.md` (R7–R11), and the results recorded in STATUS for econ-growth, loco-fix3, nest-fix3.
- GDD 02 (colony economy; §5 needs, §6 allocation and activation, §15 worked example) and GDD 05 (ecology: food sources, prey) sections that a cause leads you to, in full.

## You own
All of `src/sim/**`, `src/worldgen/**`, `src/core/**` (contracts additive only), `tools/sim/**`. Other engineers are working in `src/sim/species/modules/**` and their `src/sim/balance/species-*.ts`: do not edit those. Fix at the cause in the module that owns the rule. Determinism rules of the design seed apply.
`src/sim/locomotion/**` is yours too: the loco-fix3 fix round was cut off twice by container restarts near its end; its code is in the tree, its review is `docs/design/tasks/reviews/loco-fix3.json` (findings on descent planning, edge gates on the homeward flow field, relocation repeats, climbs to food, kernel crossings). Check the state of each finding before you change that folder, treat the unfinished ones as leads ranked like any other cause, and compare with the locomotion of commit f2b9eeb where the A/B lead points there.

## What is not allowed
- No change to lifespans or ageing (R11). No lowering of needs, no free food, no larger hand-over provision than R2, no weakening of the bars or of a test that checks a ruling.
- Balance changes only where you show, with numbers, that a constant is inconsistent with the design's own worked example or with a ruling; list each as a GDD deviation in the ledger.
- No fix that is a special case for one seed or archetype.

## Method — every round
1. **Account before you touch code.** For the failing runs in the latest sweep table (the ledger names it), build the funnel from the run's own output (`life.ts` has `report.econ`; add counters where a stage is invisible — counters are plain persisted state or tool-side observers, never behaviour):
   - worker time by state (in nest idle, in nest working, waiting to depart, travelling out, searching, handling, travelling home, stuck/relocating);
   - trips by outcome and reason (no source known, source gone, claim refused, path failed, gave up, weather, threat, success), per nutrient;
   - the protein path: sources within 300 BU by kind and what they hold, how many are known, visits, items taken, delivered, fed to larvae; the same for carbohydrate;
   - brood: eggs laid, and every loss between egg and worker by cause; time per stage;
   - hand-over: first-worker count and what set it;
   - deaths by cause.
2. **Rank causes by measured loss** (workers not eclosed, food not delivered) and write the ranking in the ledger before fixing.
3. **Fix the top one to three causes at the cause**, each with a unit test at the level of the rule and a before/after on the runs it affects (`node tools/sim/run-ts.mjs tools/sim/life.ts --seed S --archetype A --until winter --cache test-output/viab/cache`; at most 2 at a time). Do **not** run the whole 15-run sweep: an independent engineer does that after your round.
4. **Ledger**: append a section `## Round N` with: the funnel table for the runs you studied; the ranking; each fix (cause, files, test, before/after); what you tried and reverted and why; GDD deviations; what you would do next. Keep it factual and short.
5. Typecheck clean; tests green in every folder you touched (folder by folder, never the whole suite).

## Leads already on the table (verify each; they are claims, not facts)
- Prey patches are never hunted, so Tier 2 protein is missing (R18).
- Trip success 7–36 %: reasons unknown.
- With the current locomotion, kitchen-door #1 tends no herd and woodland-edge #1 starves of carbohydrate; both recovered with the locomotion of commit f2b9eeb (A/B in `test-output/econ-growth-review/ab/`). Stall at woodland-edge #1 near (4490.3, 51.6, 7958.4).
- Steady state is protein-limited: forage demand is capped by known capacity (≈ 17 foragers on one carcass) and 0.375 P pieces need ≈ 30 trips a game day (E25 passes on seed 1 only).
- Eggs lost as `egg:untended`; night flood traces send idle ants to nurse.
- Seed 3 hands over with 7–9 workers on every archetype.
- Workers crushed (up to 4 in a run) and lost.
- `src/sim/colony/founding/reopen.test.ts` is red.

## The bars (same 15-run sweep: seeds 1–3 × woodland-edge, suburban-garden, playground-park, car-park-verge, kitchen-door; Naturalist, default start, flooding on, no player)
- **Viability** (binding since viab-economy): ≥ 2 of 3 viable on each archetype.
- **Growth, R19**: workers at winter ≥ first workers in ≥ 10 of 15 runs; median eclosions after hand-over ≥ 4; median intake/need P ≥ 0.7 and C ≥ 0.9; median trip success ≥ 50 %; first workers ≥ 9 in ≥ 13 of 15 runs; no `worker:lost` in ≥ 13 of 15 runs.
- Once both hold, also report (not a bar): a spring start (`--start-doy 2`) to winter, and one run from the default start through winter to the second autumn, with worker counts over time.

## Machine rules
4 cores shared with other engineers and a headless browser. At most 2 life runs at a time; never the whole vitest suite in one process; long tests behind `FOUNDRESS_LONG=1`; no `process` in test files (no `@types/node`); delete probe files and scratch copies of the tree before you finish; `date -u` before writing a timestamp. Evidence under `test-output/colony-life/round-N/`.
