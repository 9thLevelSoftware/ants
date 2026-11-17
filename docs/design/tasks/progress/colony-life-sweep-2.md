# Progress: independent sweep after colony-life round 2

Started 05:08 UTC (2026-11-17). Fresh start (no earlier progress file).

## Sweep
- Command: `nohup tools/sim/sweep-life.sh test-output/colony-life/round-2/sweep test-output/viab/cache &` (restart-safe: skips
  runs whose JSON exists; summary.txt records the tree hash per run). Started 05:08.
- If cut off: `ps aux | grep life.ts`; if none of ours runs, re-run the same command (finished runs are kept if their
  tree hash in summary.txt matches; only Messor/granary files of other engineers changed at the start).
- Table: `python3 tools/sim/sweep-table.py test-output/colony-life/round-2/sweep test-output/colony-life/round-1/sweep > test-output/colony-life/round-2/sweep-table.md`
  (previous sweep = round-1/sweep, as the ledger says). Script columns = sweep9 + first workers + worker:lost.
- Runs finished (06:01): 12 of 15 (see summary.txt); remaining pp #3, cpv #3, kd #3. Table script extended with C/P without 'unknown' deliveries (C1 artefact in round-1 numbers).

## Review findings so far (05:15)
- H1 (minor, accounting + credit): prey caught on a trip to a known source is booked as that source's kind and credited
  to the source (noteKind reads K.src). Test `src/sim/ants/behaviours/outdoor/huntSourceTrip.verify.test.ts` RED
  (delivery "nectar c0 p0.25 src32"). Output test-output/colony-life/round-2/sweep-review/vitest-huntSourceTrip.txt.
- Checked, no finding: endChase after a source search restarts the search at the patch centre (seen: centre moved
  120 BU) but the forager still found its source; test deleted (inconclusive).
- G1, C1, B1, S1, H1b read; no finding yet. S1 bound = 220 - 12 = 208 BU.

- 05:30 typecheck clean; folder tests (outputs round-2/sweep-review/vitest-*.txt): outdoor 24/26 (red removal.verify known +
  my huntSourceTrip.verify), nest 54/55 (escapeDig known), colony 52/53 (reopen known), combat+types+balance ids.test only,
  beh/nest sfaReview.verify + stall.soak (known). Same red set as the round reported.
- Scratch copy (deleted): broodCarried, tripCount, scoutRange, hunt.test (2 behaviour cases) all red with their fix out.
- New green test huntSaveLoad.verify (save->load mid-hunt equals uninterrupted run).
- Leads from finished runs: sg #1 65 springtails + 17 mites appeared ahead of colony ants in its patch (edge 80 BU), 0
  subdued (huntCheck skips tenders and laden/returning ants?); pp #1 worker:lost 2 = two tenders stuck in tend.return at
  (972,-9.5,3490) days 5-6; laying potential 0 all run on we #1, cpv #1 (gut P for an egg 0.045/0.073).
- Lead (round-1 sweep JSON): eclosions only in runs handing over <= 2.81 gd (all seed 2): their day-1 clutch sits at
  brood temp 21-24 C (egg mean 0.98 gd, eclosed 7-9); hand-over 3.5-3.9 gd -> brood 15-20 C falling to ~10 C in autumn,
  egg mean 2.0-3.1 gd, 0 eclosed; seed 3 (4.3-4.6 gd) 0 hatched.
- Probe tool written: tools/sim/probe-hunt.ts (DELETE after use); run on sg #1 hand-over after the sweep.
- 05:38 we #2 viable -> NOT (15->11, crushed 3, pupa:untended 6, egg:untended 7, walker-stuck-explosion 14; same
  hand-over 2.811 gd/15 as round 1). A/B planned after the sweep: round-start tree 151cc41 (no round-2 sim change) in
  scratchpad/ab151 (git archive; delete after), cache copied as -any.bin, `--cache cache --cache-any`.
- kd #1 NOT viable (15->11, old-age 3, crushed 1); 82 springtails appeared, 6 subdued, 1 prey delivery; 'unknown' P 0.515.
- 06:12 SWEEP DONE (06:08). Table written: test-output/colony-life/round-2/sweep-table.md. Viability NOT met: 8 of 15
  (we 1/3, sg 2/3, pp 2/3, cpv 3/3, kd 0/3). R19 NOT met 3/7: held 4/15, eclosions median 0, P 0.031, C 1.016 ok,
  trip success 24.7 %, first>=9 13/15 ok, no lost 13/15 ok. 14 runs flagged; viable->NOT: we2, we3, pp1, kd1, kd2, kd3.
  Median P without 'unknown' deliveries: round 1 0.047 -> round 2 0.030; C 1.148 -> 0.982.
- Hunting sweep-wide: 864 springtails + 195 mites appeared ahead of foragers/scouts, 53 + 11 subdued, 41 prey loads home
  (P 7.9); sg #1 65 appeared / 0 subdued; we #3 nest 4 BU from its patch, 69 appeared / 1 subdued.
- 06:10 A/B running in scratchpad/ab151/out (round-start tree 151cc41, same hand-overs): we #2, kd #1.
- Next: probe-hunt on sg #1 hand-over (cache founded-...-suburban-garden-1-...-fe66cb2b.bin) after the A/B.

## Remains
- table, bars, regressions, ledger section
