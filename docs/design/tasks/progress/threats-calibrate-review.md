# threats-calibrate review progress
Started 20:54 UTC. Reviewer role.
## Done
- (nothing yet)
## In progress
- reading spec and docs
- 20:56 typecheck clean (whole tree). vitest creatures + presetDisplay: 28 files 206 pass, 2 expected fail, 6 skipped (93 s). Matches impl claim.
- Ramp source read: f5f8e67 diff (difficulty.ts, colonyRange.ts, director.ts rampCull/suspended, types/ecology.ts).
## Next
- read coreGaps.repro.test.ts, threatBatch.ts, evidence tables; write predationRamp.verify.test.ts
- 21:02 wrote src/sim/ecology/creatures/predationRamp.verify.test.ts (7 tests: subset monotone per preset, worldgen residents never ramp-despawned, engaged resident kept, timer reset, playerWorkers) -> all pass, 18 s.
- Evidence tables cross-checked (base-w60, gentle, harsh, off, ramp-found, base-found): totals match report. Harsh>=Nat pairs 8/10 by rate (9/10 by deaths).
- Sim code unchanged since 17:10 except comments (8bfb523) and tests -> current tree == tree-ramp.
## In progress (21:03)
- reproduce run: threatBatch ramp-found woodland-edge r1 to winter on current tree -> test-output/threats-calibrate/review-repro-found/ (expect 2 centipede deaths, 1474 owh)
- then: Naturalist w60 suburban-garden r2 on current tree -> review-repro-w60/ (base-w60: 7 deaths, 3718 owh)
