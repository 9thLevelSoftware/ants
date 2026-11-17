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
- 21:09 repro-found woodland-edge r1: IDENTICAL to ramp-found (finalHash 3006d751). Now running review-repro-w60 suburban-garden r2.
- 21:15 repro-w60 suburban-garden r2 Naturalist on ramp tree: identical funnel/deaths/owh to base-w60 (hash differs, flag). Now running LONG soak.
- 21:19 LONG soak (FOUNDRESS_LONG=1 soak.test.ts): 5 of 5 long tests FAIL on current tree (minWindowShare 0 all; harsh maxBirdKills 18 > 12). Checking baseline tree (git archive f5f8e67^) in scratch.
- 21:30 baseline tree (git archive f5f8e67^ in scratchpad/base): LONG soak seed1/gentle/harsh ALSO FAIL (quiet 0, harsh bird 18>12) -> pre-existing, not caused by the ramp. Diag (test-output/threats-calibrate/review-diag/nat-8gd.txt): creature-only soak scene, no human events, predator-near warnings in 32/81 samples, minWindowShare 0.32 after 8 gd -> E25 creature-scene claim in report is wrong. FINDING (major).
- funnel runs: predatorNearS 338 s / 6 gd -> report's human-event attribution for real-game quiet share plausible.
## DONE 21:35 — review complete, verdict fail (one major: LONG soak), rest verified
Findings: (major) LONG soak.test.ts 5/5 fail, pre-existing, not run by impl, report App E rows E21/E22/E25 say covered and blame human events;
(minor) Naturalist 0.038 at band's lower edge (Poisson CI crosses 0.03); off measured 5x2 gd one seed; save->load test Naturalist only;
threatBatch resume key ignores --days/--until-winter/--food/rules content.
Verified: typecheck clean; 28 files green; predationRamp.verify.test.ts 7 green; repro runs identical (review-repro-found, review-repro-w60).
Scratch baseline tree deleted. Nothing running.
