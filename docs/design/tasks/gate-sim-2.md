# Task gate-sim-2 — Simulation gate after colony-life (Opus implement / Opus verify)

Supersedes `gate-close-sim.md` (written Nov 16, before colony-life; its sweep, R13 / R14 and seam items were overtaken by
`colony-life`, `sim-seams` and rounds 9–15). Written Nov 23 ~17:00 UTC by the integrator.

## Goal
Leave the simulation in a state the rest of the pipeline can build on: a sim test suite with no unexplained red, the
defects of execution that the last sweep named fixed at their cause, and one fresh sweep that shows the viability bar
still holds. This is **not** another round of colony-life: no new economy, allocation, demand or laying rule, no balance
change except where an item below names it. The growth bars that colony-life left unmet (R19 protein, R19 first workers,
R34) stay unmet and documented; do not chase them.

## Read in full
- `docs/STATUS.md` from "### Nov 23 ~11:15 UTC" to the end (rulings R1–R43 and directions are binding and take
  precedence over the GDD).
- `docs/design/tasks/colony-life-ledger.md`: "## Round 15" (results and "### Known limits at the close of colony-life")
  and "### Independent sweep after round 15" (the table a later task compares with — that is you).
- `docs/design/tasks/colony-life.md`: "The bars", direction 13 (how a round is measured), directions 30, 30a, 30b, 30c.
- `docs/design/gdd/DEVIATIONS.md` rows R43, D34, D35.
- `docs/design/tasks/reviews/colony-life-sweep-15.json` (findings, regressions, leads).

## You own
`src/sim/**`, `src/core/**`, `src/worldgen/**`, `tools/sim/**`, `docs/design/gdd/DEVIATIONS.md` (rows for what you
change), `docs/design/tasks/gate-sim-2-report.md`. Fix at the cause in the module that owns the rule; contracts additive
only; determinism rules of the design seed. Another engineer works in `src/render`, `src/game`, `src/ui`, `tests/e2e`
at the same time and runs a headless browser: do not touch those paths.

## State at hand-over
- Live `src` = colony-life's final tree (sweep-life.sh hash 48db2e0d; a copy is `/home/user/scratch-r15e`).
  `LARVA_P_REQ` 0.8 (R43). `tsc` clean.
- Last fresh sweep = sweep 15: `test-output/colony-life/round-15/sweep` (15 runs), `sweep-long` (5 to the second
  winter), tables `round-15/sweep-table.md`, `sweep-long/longrun-table.md`, review `round-15/sweep-review/`. Viable 14 of
  15; R19 5 of 7; R34 3 of 5 / 0 of 5.
- Tools: `tools/sim/sweep-life.sh OUTDIR [CACHEDIR]` (15 runs, two at a time, `summary.txt` ends `DONE`),
  `PAR=2 UNTIL_DAY=40 tools/sim/longrun-life.sh OUTDIR CACHEDIR "woodland-edge:2 suburban-garden:2 car-park-verge:1 playground-park:3 kitchen-door:3"`,
  `tools/sim/sweep-table.py NEW OLD`, `tools/sim/longrun-table.py DIR` (run the table scripts from
  `test-output/colony-life`); `node tools/sim/run-ts.mjs tools/sim/life.ts …` (`--from`, `--save-y2`, `--until-day`,
  `--trace13`). Round 15's runner scripts and job lists are in `test-output/colony-life/round-15/` (`run15.sh`,
  `jobs15.sh`, `ab5.py`, `y2table.py`), round 13's in `round-13/` (`table13y1.py`, `account13.py`), hand-overs of
  sweep 14 in `round-15/handover14/`, round 10's cached hand-overs in `round-10/cache`, the year-two cache in
  `round-13/cache-y2`. The founding cache is `test-output/viab/cache` (keyed by the founding code's hash).
- Known red at hand-over (one worker per folder): `colony/workedExample`, `colony/handoverStomach.verify`,
  `behaviours/outdoor/appendixE23`, `behaviours/nest/sfaReview.verify`, `behaviours/nest/stall.soak`,
  `nest/escapeDig`, `nest/flood/readersCost.verify`, `nest/architect/layout` (timing), `locomotion/perf` (timing),
  `behaviours/nest/perf` (timing), `ants/actions/runner.test` "failure codes", 12 tests in `ecology/sources`,
  possibly `src/sim/time.test.ts` and `tests/docs/docs-final.test.ts`.

## Work, in this order
1. **Red-test table, then green.** Typecheck, then tests folder by folder (never the whole suite in one process; one
   vitest worker while life runs are going): `src/core`, every folder of `src/sim`, `src/worldgen`, `tools`,
   `tests/docs`. One table: test, red since (if known), cause, verdict (real defect / stale expectation / timing under
   load). Then work the table:
   - a real defect is fixed at its cause with the test left as it is;
   - a stale expectation (a number that follows from a ruling or a later constant) is restated by deriving it from the
     constants, with the old and new number in DEVIATIONS; no tolerance widened, no assertion dropped;
   - a timing test gets the load guard the common rules describe (strict mode documented), not a wider limit.
   Named cases: the 12 `ecology/sources` reds; `runner.test` "failure codes"; `colony/workedExample` (GDD 02 §15 need
   rates against today's constants); `nest/escapeDig` and `nest/flood/readersCost.verify` (red since round 12: find
   which change, decide defect or expectation); `sfaReview.verify`, `stall.soak`.
   `colony/handoverStomach.verify` ("7 workers, 13 fresh eggs": at 0.8 the colony reaches `rationing` at gd 2.05–2.08
   while the queen still holds her hand-over protein): trace why a lower larval need brings rationing earlier. If the
   queen's held protein is not released to a rationing colony, that is the thing ruling R2 forbids: fix it. If rationing
   is entered on a threshold that 0.8 moved and nothing starves, restate the test to R2's intent (no worker or larva
   starves while the queen holds hand-over food) and say so.
2. **Crumb retrace "variant f"** (`locomotion/crumbs.ts retraceTarget`): start at the nearest crumb, **without**
   consuming passed crumbs. Sweep 15 showed in a scratch copy that this keeps `outdoor/removal.verify` green and turns
   `behaviours/outdoor/appendixE23` (carrion trail) green; only `retraceResume15` case 1 asserts consumption. Adopt it
   if, from round 10's hand-overs, we #3 and sg #3 are still viable with their R27 carbohydrate met (they are the two
   colonies the first version of the rule cost; `round-15/arm-y1-r15e` holds their variant-e runs), and we #1 from sweep
   14's hand-over stays viable. Restate `retraceResume15` case 1 to what the rule then is; update D34. If a colony fails,
   keep variant e and make App. E 23's trail establish another way, or report it red with the cause.
3. **Mound-mask hole probe** (`nest/moundRelax.ts buildMask`; direction 30b item 5): a probe as wide as round 12's that
   reads only state a save restores exactly (the substrate / carve field without the pile overlays). Adopt only if
   `nest/moundMaskHeights.test`, `nest/moundRestore14.test`, `locomotion/pointFieldRestore.test` and
   `outdoor/determinism.perf` are green, a save / restore of sg #2 runs equal for 36000 ticks, and on sweep 14's
   hand-overs of kd #3, sg #2 and pp #3 (`round-15/ab5-table.md` has both older arms) trip success is not below the
   cavity-only probe's in at least 2 of 3 with kd #3's brood flooding ≤ 11. Otherwise restore the cavity-only probe and
   report.
4. **kd #3 of sweep 15: larvae starve with protein in store** (0 eclosions; 7 larvae starved on days 2–5 with 1.4–4.8 P
   in store, mean larval hunger 0.70–0.97, nurse target 1–2 against a demand of 1.4–3.8, several nurses counted outside
   any chamber; one chamber, 9 workers; the same founding raised 7 workers in `round-14/sweep-p08`). Reproduce from its
   hand-over, trace store → nurse → larva for the starving days, and fix what is a defect of execution (a nurse that
   cannot reach, a job never offered, a target computed from the wrong count). A rule change is not in scope: report it.
5. **sg #2 of sweep 15: digging with no open plan while sugar collapses** (21.6 worker-gd of digging against 4.1 in
   p08, 6–23 pellets a day on days 4–11 with one plan created on day 8; tenders 1–2 a day against 4–5; C delivered on
   day 3 0.045 against 3.28). Find what the diggers dig and why the allocator keeps them there. Fix a defect of
   execution (work offered for a finished or missing plan, a dig target that regenerates, pellets re-made from spoil);
   report anything that would need a new allocation rule.
6. **R13 / R14 from data you already have**: from sweep 15's JSONs, the entrance-open delay after the hand-over per run
   (R14: ≤ 4 game hours) and, per run on a flood-safe site, the peak flooded share and any queen or brood lost to water
   (R13). No new runs for this; a table. A run that breaks either is traced only if items 1–5 leave time.
7. **Leftover seams — check each, do the small ones, report the rest**: antlion pit height overlay (`createPit`
   registers its profile through `kernel.setHeightOverlay`); creatures parked at the map edge; `lay-egg` returning reason
   `budget` outside the opening's lay phase (direction 21b's list); the periodic systems of the species modules colliding
   in their stagger offsets (wood, granary, fungus: list the pairs, fix by assigning distinct offsets if it changes no
   Lasius hash — check with one cached Lasius run, same final hash).
8. **Close.** A fresh sweep from a frozen copy of your final tree (as sweep 15 did: copy `src`, `tools`, configs to
   `/home/user/frozen-gate2`, symlink `node_modules` and `test-output/viab`, run `sweep-life.sh` then the five long
   runs; delete the copy at the end) → `test-output/gate-sim-2/sweep`, `sweep-long`; table against
   `colony-life/round-15/sweep`. **Bar: viable ≥ 2 of 3 on every archetype and ≥ 13 of 15**; R19, R22, R34 reported, not
   chased. If the viability bar fails, find which of items 2–5 cost it by switching each off on the failing colonies'
   hand-overs (as round 15 did for item 3), revert that item, and say so — do not start a new diagnosis.
9. **Report** `docs/design/tasks/gate-sim-2-report.md`: the red-test table before and after, each item's cause / fix /
   test / before → after, the sweep tables, R13 / R14 table, DEVIATIONS rows, and a complete "still wrong" list, most
   serious first, for a reader who has not followed the rounds.

## Rules that colony-life paid for
- One chaotic run proves little (direction 13): a claim about a colony needs the paired run from the same hand-over; a
  claim about the tree needs the arm or the sweep. Say which you have.
- Every fix gets a test that is red without it. Every new piece of state is saved and restored (the reviewer checks).
- Never edit a runner script while a slot runs it. Never run more than two life runs at a time while the other
  engineer's browser is going (three if `pgrep -f chromium` is empty). `free -g` before a heavy start.
- Probes live under `tools/sim/probe/` while you use them; archive them under `test-output/gate-sim-2/probes/` and
  remove them from the tree before you finish. No `process` in test files.
- Disk is short (about 9 GB free): no `--trace13` output kept beyond the run that needs it; delete scratch trees when
  done; never copy `node_modules`.
- If the task runs long, the must-haves are items 1, 2, 8 and 9.

## Acceptance criteria
1. Typecheck clean on your paths; every red test in your folders is either green or in the report with cause and owner,
   and none is red from an unexplained cause.
2. Items 2–5 each: adopted with its test and its paired evidence, or reverted / not built with the reason.
3. The close sweep meets the viability bar, or the offending item is reverted and the sweep rerun on the affected
   colonies.
4. No new state outside the save; `outdoor/determinism.perf` green.
5. Report complete.
