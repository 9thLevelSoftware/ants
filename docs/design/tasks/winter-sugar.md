# Task winter-sugar — Colonies that grow but do not stock sugar for winter, and three leftovers of the opening (Opus implement / Opus verify)

Written Nov 24 ~13:20 UTC by the integrator, after `opening-fix` landed (review: pass with four minor findings).

## Where the simulation stands
Live `src/sim` = opening-fix's final tree (sim hash 741fec90; a frozen copy is `/home/user/frozen-openingfix2`).
On the 15 hand-overs of its close sweep (`test-output/opening-fix/cache`, table `draftfix15-table.md`): viable 15 of 15,
workers at winter 264. Five long runs to the second winter (`test-output/opening-fix/sweep-long-final/longrun-table.md`):
90 workers at winter 1 → 113 at winter 2, R22 5 of 5, R34 ≥ 1.0 × in 4 of 5, ≥ 1.5 × in 1 of 5.
**The remaining failure is sugar at the second winter**: playground-park #3 enters it with 28 workers and 0.7 C,
suburban-garden #2 with 22 and 3.7 C; a run earlier in the week with the same shape lost 59 % of its workers and its
queen in that lapse (`colony-life-ledger.md`, "Independent sweep after round 15", sg #2). Year one hides it because the
colonies are small; in year two they are large and the stock target is still the plain one.

What is known (read the sources, do not take this list on trust):
- needC follows the plain stock target (`STOCK_TARGET_C_GD` 3 gd of adult need); the winter need (R27,
  `overwinter/storesNeed.ts`) is not in it. Ruling R41 (`carbStockWanted`) put it there in round 13 and was withdrawn
  in round 14 **together with four other rules** because the bundle cost three colonies and a bisect on six colonies
  could not separate them (`colony-life.md` directions 29a / 29b; DEVIATIONS rows marked withdrawn; the code is in git
  history before commit `1543bf21`'s round - find it with `git log -S carbStockWanted`). R41 has never been measured
  alone.
- opening-fix found by accident that **how soon the first worker starts tending honeydew decides the year's sugar**:
  the same colony with a tender from tick 878 after the hand-over held 10.3 C at +12000, with none until +10500 it
  held 6.4, and the colony later failed its winter line (`opening-fix-report.md` section 4b; probes archived in
  `test-output/opening-fix/probes/`).
- `LARVA_P_REQ` 0.8 (R43), `PROSPECTIVE_WINTER_FROM_DOY` / `winterPathC` (R35: the queen's laying already waits for a
  winter path of sugar), R40 a's laying gate until the first winter.

## Goal
Colonies enter their winters with the sugar the winter needs - in year two as well - without losing year-one viability
or year-two growth. And close three small leftovers of the opening so the next task starts clean.

## Read in full
`docs/STATUS.md` from "### Nov 23 ~16:45 UTC" to the end; `docs/design/tasks/opening-fix-report.md`;
`docs/design/tasks/reviews/opening-fix.json` (the review's four findings); `colony-life.md` "The bars", directions 13,
26–29b; `colony-life-ledger.md` "### Known limits at the close of colony-life" (limit 7); GDD 02 §3–§5 (stores, needs,
allocation, honeydew), GDD 06 §8 (overwintering); `src/sim/colony/needs.ts`, `economy.ts`, `allocation/**`,
`overwinter/**`, `ants/behaviours/outdoor/**` (tend).

## You own
`src/sim/**`, `src/core/**`, `src/worldgen/**`, `tools/sim/**`, `docs/design/gdd/DEVIATIONS.md` (rows for what you
change), `docs/design/tasks/winter-sugar-report.md`. Another engineer works in `src/render`, `src/game`, `src/ui`,
`tests/e2e` and runs a browser at times.

## Work, in this order
### A. Leftovers of the opening (small; do them first, they do not need arms)
1. **R14 restated (integrator ruling, binding):** the entrance is open and a worker has been outside within 4 game hours
   **counted from the first hour after the hand-over in which the air at the nest mouth is at or above the forage
   gate's full band** (a cold-night hand-over starts its clock when the workers can work). Write it into DEVIATIONS,
   state it in `playerOpening.long.test.ts`, and hold the 4-worker case (seed 4) to it instead of the 7500-tick bound.
2. **The headless opening kit lays 12 eggs, the browser script now 24.** Port the script's new `layBatch` (wait for the
   lay-egg action to end by the event log) into `colony/founding/playerOpeningKit.ts`; keep a 2-batch / 4-worker case as
   an explicit extra case; rerun the long test.
3. **Unplug stand point inside the plug** (review finding 2: with a wide mouth the stand point lies in the plug, a digger
   arriving from the cell fails `approach()` and is barred for 600 ticks; second digger at +719 instead of +103). Fix
   it at the cause (a stand point in open cavity below the plug's lowest solid sample; no lockout for an approach that
   failed against the plug itself), unit test red without, and report the open times of headless seeds 1–5 before and
   after.

### B. Winter sugar
4. **Measure before changing anything.** From the 15 year-one runs of the final tree
   (`test-output/opening-fix/draftfix15`) and the 5 long runs (`sweep-long-final`), one table per colony and year: tick
   of the first tender after the entrance opens, tender worker-days, C income by source (honeydew, nectar, crumbs,
   spill, other), C spent, C in store and R27 need at each winter, workers. Say what separates the colonies that meet
   R27 from those that do not: tending start, tender share, herds in range, or demand never asking. If the JSONs lack a
   field, add it to `tools/sim/life.ts`'s output (not to the sim) and rerun only what you need, from the cached
   hand-overs.
5. **At most two candidate rules, each measured alone** (direction 13: one chaotic run proves nothing; an arm is all
   15 hand-overs to winter, and the five long runs):
   - **Arm W (R41 alone):** the carbohydrate the colony wants in store ramps from the plain target to the winter need
     over autumn (the day-of-year ramp R35 already uses), in year two as in year one; nothing else of round 13.
   - **Arm T (only if item 4 points at tending):** the smallest change that makes a colony with a known herd and an
     open entrance start tending promptly and keep a tender while needC is unmet (an execution or ordering fix if the
     cause is one - e.g. tend offered late, a tender drafted away and never returned - before any new floor).
   Run each alone against the final tree on the same hand-overs; then both together only if each alone is not worse.
6. **Adopt** a rule (or the pair) only if, against the final tree: year one viable ≥ 14 of 15 and workers at winter
   ≥ 255; long runs: workers at winter 2 in sum ≥ 105, R34 ≥ 1.0 × still in ≥ 4 of 5, **and at least 4 of 5 colonies
   enter the second winter at ≥ 1.0 × their R27 need** (today: 3 of 5). If a rule buys sugar by starving brood of
   protein or by stopping the queen in summer, it is not adopted: report the trade. If nothing meets the bar, change
   nothing and report the tables - that is an acceptable outcome.
7. **A third year for the two fragile colonies** (model-free once the tree is final): playground-park #3 and
   suburban-garden #2 run through the second winter to day 15 of year three (`UNTIL_DAY` as needed), on the final tree
   of this task, to show what a colony short of sugar at winter 2 does. Report workers and queen at spring 3.

### C. Close
8. A **fresh** `tools/sim/sweep-life.sh` (fresh foundings, from a frozen copy of your final tree) and the five long
   runs: the new baseline. Bars: viable ≥ 14 of 15 and ≥ 2 of 3 per archetype; R19, R22, R34 reported. If the fresh
   sweep falls under 13, find which change costs it by switch-off runs on the failing colonies **and report in the
   progress file before reverting anything**.
9. Report `docs/design/tasks/winter-sugar-report.md`: item 4's table and what it shows, each arm's table, what was
   adopted and why, the close tables, DEVIATIONS rows, and what is still wrong, most serious first.

## Rules
- Determinism; every new piece of state saved and restored; contracts additive only; tunables in `src/sim/balance`.
- No change to food in the world, lifespans, brood survival, `LARVA_P_REQ`, or the bars. A new balance constant only for
  the rule you adopt, named for it.
- Every fix and rule has a test that is red without it.
- At most two life runs at a time while a `chrome-headless` process exists (three otherwise); never the whole vitest
  suite in one process; `free -g` before a heavy start. Disk is short (about 7 GB): delete scratch trees as you finish
  with them, symlink `node_modules`, keep no traces beyond the run that needs them.
- Never edit a runner script while a slot runs it. Freeze a copy of the tree for every arm and sweep; never run an arm
  from the live tree.
- Use `date -u` for every time you write. Integrator rulings appear at the tail of this spec as "Integrator ruling N"
  and as an INTEGRATOR NOTE line at the tail of your progress file: re-read both each time a run finishes and before
  you close, and carry them out.
- If the task runs long, the must-haves are A (all three), item 4, arm W, and the close.

## Acceptance criteria
1. A1–A3 done with their tests; `playerOpening.long` green on the restated R14 including the 4-worker case.
2. Item 4's table exists and its reading is stated plainly.
3. Each arm run alone on 15 + 5, with its table; the adoption decision follows item 6's bar and is stated.
4. The fresh close sweep and long runs meet the viability bar, or the cause is reported before any revert.
5. Typecheck clean; tests green in every folder you touched; `outdoor/determinism.perf` green.
6. Report complete.
