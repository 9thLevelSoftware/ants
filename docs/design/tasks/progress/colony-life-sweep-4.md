# Progress: independent sweep after colony-life round 4

Started 18:15 UTC 2026-11-17.

- Frozen tree: `/home/user/frozen-sweep4` = copy of src, tools, configs at 18:16 UTC (node_modules symlinked);
  src/sim+worldgen+core hash `8338ddfe` (same as the live tree at 18:16; HEAD 8bfb523 + nothing in src).
- Sweep: `/home/user/frozen-sweep4/tools/sim/sweep-life.sh /home/user/foundress/test-output/colony-life/round-4/sweep /home/user/foundress/test-output/viab/cache`
  started 18:16 UTC. Restart-safe: re-run the same command; runs with a JSON are skipped; summary.txt has per-run tree hash
  (all must be 8338ddfe).
- Previous sweep table: `test-output/colony-life/round-3/sweep-table.md` (dir round-3/sweep; day-9 start, so compare mechanisms).
- Table: `python3 tools/sim/sweep-table.py test-output/colony-life/round-4/sweep test-output/colony-life/round-3/sweep` -> round-4/sweep-table.md (not yet).
- Round diff: `git diff 5c8c576` (round start) on the round's files; HEAD commits are snapshots.
- Review: not started.

## Remaining
1. sweep (15 runs), table, bars, regressions
2. code review of round 4, typecheck, folder tests, verify tests
3. ledger section "### Independent sweep after round 4"

## Log
- 18:25 review so far (round diff = `git diff 5c8c576`): tsc clean (18:24, incl. new verify tests). Fix tests checked red
  with the fix switched off in a scratch copy (scratchpad/rev): plugFill, haulMidden, lossCap, larder (4 of 5; the
  food-chamber case is a control). allocation/hygiene.test stays green with the H4 trigger (`broodAmongWaste`) unwired:
  it tests the order only (minor coverage gap).
- New verify tests (RED, kept): `src/sim/ants/behaviours/nest/haulMidden.verify.test.ts` (M1: waste in a cavity 10 BU
  under the surface midden area reads "at the midden", haul priority 0); `src/sim/colony/overwinter/lossCapStores.verify.test.ts`
  (WL1: the workers the cap keeps eat nothing in the lapse: seed 1 17 vs 9 workers, C at spring 16.554 both; seed 5 17 vs 6).
- Probe on the 15 R20 hand-overs (scratchpad probe-midden.ts): no midden at hand-over (entrance sealed), founding
  chamber 8 BU from the entrance; M1's case not shown on real nests (latent).
- Lead to check in the sweep: L1's larder spoils into the brood chamber (P 4 loads x ln2/3 gd ~ 0.9 P/gd at 20 C ->
  ~2 spoiled-food items/gd among the brood; before L1 there was no pile outside food chambers).
- Folder tests running in background -> test-output/colony-life/round-4/sweep-review/vitest-*.txt (summary vitest-summary.txt).
- 18:45 sweep 4/15 done (all tree 8338ddfe): we #1 NO, sg #1 yes, pp #1 NO, cpv #1 NO. Folder tests (sweep-review/):
  colony 2 red (founding/reopen known + my lossCapStores.verify), nest 1 (escapeDig known), behaviours/nest 3
  (sfaReview, stall.soak known + my haulMidden.verify), outdoor 1 (removal.verify known), species green; rest running.
  Early leads: P stores ~0 on 11-13 of ~14 days in 3 of 4 runs; old-age 18 of 21 adult deaths; egg:flooding 20 (seed 1).
- Plan after sweep: table + bars, then 5 long runs (R22 year two) with the frozen tree + viab/cache (reuses the sweep
  hand-overs): `PAR=2 UNTIL_DAY=32 /home/user/frozen-sweep4/tools/sim/longrun-life.sh <abs>/round-4/sweep-long <abs>/viab/cache "<a:s ...>"`.
- 18:59 container restart at ~18:55 (pp #2, sg #2 cut off). Resumed the sweep with the same command (frozen tree hash
  still 8338ddfe; 6 runs kept: we1 sg1 pp1 cpv1 kd1 we2).
- 19:15 sweep resumed (pp #2, sg #2 running). Review so far (this session): E2, H3, L1, W1 read, no new defect; checked
  that heatedNest's state write (dropOldSamples) has sim-only callers (system.ts). Live sim tree = frozen tree + the two
  verify tests (diff -rq). Open: H4 trigger end-to-end test (coverage gap), leads from the sweep.
- 19:10 new verify test `src/sim/colony/allocation/hygieneWiring.verify.test.ts` (H4 trigger through allocateColony on a
  real nest, 3 workers, ΣD 4.8 > 3): GREEN; red with broodAmongWaste unwired (scratch copy scratchpad/rev): closes
  the coverage gap noted at 18:25. Machine load ~8 (other engineers).
- 19:09 sweep 8/15 (sg #2, pp #2 NO). tsc clean 19:05 (incl. new verify test); colony/allocation folder 4/4 green.
  Leads so far: P intake 0.005-0.13 (P stores 0 from day ~3; "starvation stage worse than lean" fails 5 of 6 first runs,
  P-driven: kd #1 C 24 in store, stage rationing); old age 29 of 39 adult deaths; egg:flooding 20 (sg #1 11, pp #1 9);
  crushed 7 (kd #1 4 on day 5); we #2 hygiene 12 in a royal-only nest with a hauler (estimate: ~1.3 spoiled-food
  items/gd from the P pile in the royal chamber, pre-existing: storeChamber = chs[0] before L1 too).
  Plan after the sweep: table, bars, then 5 long runs (frozen tree, viab/cache, lowest viable seed per archetype).
- 19:26 sweep 12/15 (viable so far: sg #1 only). Remaining pp #3, cpv #3, kd #3.
- 19:36 sweep 14/15 (kd #3 running). Started long run sg #1 (the only viable run so far): PAR=1 UNTIL_DAY=32 frozen longrun-life.sh -> round-4/sweep-long (restart-safe).
- 19:45 **sweep done** (15/15, all tree 8338ddfe). Table `test-output/colony-life/round-4/sweep-table.md` (sweep-table.py,
  prev = round-3/sweep). Viable **1 of 15** (round 3: 8); R19 2 of 7 (held 2/15, eclosions median 2, P 0.045, C 0.716,
  success 42.2 %, first>=9 14/15, no lost 15/15). "starvation stage worse than lean" fails 13 of 15 (round 3: 1).
  Running: (a) long run sg #1 (round-4/sweep-long, frozen tree); (b) A/B "minus4" = frozen tree with the round's 12
  production files at 5c8c576 (R20, types, balance kept; scratchpad/minus4, tsc clean on sim/tools), same hand-overs
  (scratchpad/cache4 -> viab/cache ab70a1d3 as -any), cpv #1, kd #1, sg #2, pp #2 -> round-4/sweep-review/ab-minus4/
  (sequential; restart: re-run the loop, done JSONs skipped). Checked: restore from the cache = in-process run (sg #1
  long run days 1-4 identical to the sweep's), so the sweep runs are the A/B control.
  Correction: P 5.35 stays constant days 1-3 (sg #1, we #2): the larder pile does not spoil there; drop the
  spoiled-food lead.
  Remaining: long runs (4 more), ledger section.
- 19:55 long run sg #1 done. Decision: no viable run on we/pp/cpv/kd, so the long run per archetype is the seed with the best workers winter/first: we #3 (10->11), pp #2 (11->10), cpv #1 (11->10), kd #2 (10->8). Started PAR=1 (other slot = A/B).
- 19:58 A/B first pairs (round 4 vs minus4, same hand-over): kd #1 viable NO -> **yes** (15->7 vs 15->14, eclosed 5 vs 6,
  P intake 0.016 vs 0.389, prey P 0 vs 6.9, crushed 5 vs 2); cpv #1 NO both (stage 6.75 vs 2.85 gd, 11->10 vs 11->11).
  Mechanism seen: with L1 the queen's hand-over P (~4 above stomach) goes into the pool at once (day 1 P 5.7 vs 1.6) and
  is gone the day the larvae hatch; without L1 it stays in the queen and trickles in (handover.ts provisionAtHandover).
  Extending the A/B to all 15 hand-overs: scratchpad/ab-loop.sh (copy in round-4/sweep-review/ab-loop.sh), queue A
  (we1 we3 sg1 cpv3 kd3 pp1) after sg2/pp2; queue B (we2 sg3 pp3 cpv2 kd2) when the long runs end.
  Long runs queue (we3 cpv1 pp2 kd2) running, PAR=1.
- 20:04 **finding (L1 x R2 provision)**: probe (scratchpad probe-p.ts, outputs probe-r4-cpv1.txt / probe-m4-cpv1.txt,
  cpv #1 hand-over, 72 h): round-4 tree pulls 4 P of the queen's provision into the larder at once; 1.98 P spoils
  before the first larva hatches (h39), larvae get 7.9 P by h72; minus4: queen keeps it, 0 spoiled, larvae 9.85 P.
  New verify test `src/sim/colony/larderProvision.verify.test.ts` RED on the tree (1.39 P spoiled, 2 spoiled-food
  items in the royal chamber in 1.5 gd at 20 C), GREEN on minus4. Earlier "correction" (P constant = no spoil) was
  wrong: the pool stays at its cap because the queen refills what rots.
- 20:10 A/B 4 pairs (sweep vs minus4): round 4 worse in all 4 (net workers -1/-1/-1/-8 vs 0/+1/0/-1,
  eclosions 14 vs 21; kd #1 viable -> NOT). minus4 itself viable 1 of 4 (calendar/protein). Long run we #3: C 0 at
  winter, 11 -> 3 in the lapse (starvation alerted), queen starves. Chain (restart: re-run): after the long runs,
  scratchpad/abL1-loop.sh (tree minusL1 = frozen with stores/economy/colony index/architect needs at 5c8c576, tsc
  clean) on kd1 cpv1 sg2 pp2 -> round-4/sweep-review/ab-minusL1/, then ab-loop.sh queue B (we2 sg3 pp3 cpv2 kd2).
  Queue A (we1 we3 sg1 cpv3 kd3 pp1) running in the other slot.
