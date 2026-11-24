# opening-fix review — progress (reviewer)

Started 12:44 UTC Nov 24 (fresh; no earlier review file).
Task diff = `git diff 560330c -- src/sim src/core src/worldgen tools/sim` (16 files; probes deleted in the working tree).

## Done
- read spec, impl report

## In progress
- reading the diff code

## Remaining
1. read code, typecheck, run task tests
2. write *.verify.test.ts (allocation, dryQueen, moundMask, field.withoutOverlays)
3. findings -> StructuredOutput

## Findings so far
(none yet)

## 12:55 UTC
- typecheck clean (12:45). vitest allocation + allocation*.test + dryQueen + nest/moundMask* + moundRestore14 + world/field*: 15 files / 53 pass.
  founding folder + determinism.perf + pointFieldRestore + pointFieldEvict.gate2: 29 files / 86 pass (15 skipped LONG).
- live src/sim == /home/user/frozen-openingfix2/src/sim (diff -rq clean).
- finding candidate (minor): playerOpeningKit.ts layBatch still press-50/release (12 eggs, 2 batches refused 'blocked'); tests/e2e/firstplay.mjs layBatch now waits for action end (24 eggs) -> headless kit no longer the browser's commands; docstring says "four lay batches".
- now: writing src/sim/colony/founding/dryQueen.verify.test.ts (does the walk flag clear after she is dry? per-tick cavity scans) and src/sim/colony/allocation/unplugOpening.verify.test.ts

## 12:53 UTC
- written + green: src/sim/colony/founding/dryQueen.verify.test.ts (2: walk flag clears, stays clear 1500 ticks; hypothesis of a stuck walk refuted),
  src/sim/colony/allocation/unplugOpening.verify.test.ts (5: whole allocateColony pass, possessed never drafted, open nest no draft, callow-only, 400-case invariant grid incl. threat/hygiene),
  src/sim/nest/moundMaskWide.verify.test.ts (3: published pile vs mask, withoutOverlays restore on throw, dyn prim changes cached mask).
- now: FOUNDRESS_LONG=1 playerOpening.long.test.ts (3 seeds, ~6-10 min) -> test-output/opening-fix-review/long.txt

## 13:00 UTC
- browser evidence checked: seed1/2-final2 logs ok:true, reopened open:0; pictures 12/13 of seed2-final2 looked at (card "First workers: 7"; open entrance at 02:46 after 19:46 hand-over = 7 h, R14 miss as reported).
- draftfix15 raw JSON: 15/15 viable:true confirmed.
- finding candidate (minor): unplug stand point inside the plug (dig.ts unplugStep, UNPLUG_RETRY_S 60 s lockout) found by impl and left unfixed although ruling 2 says "if something else holds them, fix that"; their own trace shows cost ~63 ticks.
- finding candidate (minor): playerOpening.long R14 for seeds 1/2 is checked on headless hand-overs of 13/11 workers, not the browser's 4/7; the 4-worker case (seed 4) is only held to 7500 ticks.
- waiting: long test (test-output/opening-fix-review/long.txt); then typecheck once more for my 3 verify files.

## 13:08 UTC - DONE
- FOUNDRESS_LONG=1 playerOpening.long.test.ts: 3/3 pass, 399 s (test-output/opening-fix-review/long.txt).
- typecheck exit 0 with the 3 verify files.
- verdict: pass-with-minor. Findings: (1) headless kit layBatch stale vs firstplay.mjs (12 vs 24 eggs); (2) unplug stand-point lockout left unfixed against ruling 2's "fix that"; (3) long test's R14 checks run on headless 11-13 worker hand-overs, 4-worker seed 4 bound 7500 ticks only; (4) R14 itself unmet on cold-night hand-overs (needs integrator ruling; documented).
