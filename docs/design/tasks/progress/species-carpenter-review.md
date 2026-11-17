# species-carpenter review — progress
Started fresh (no earlier review file).
## Done
- (nothing yet)
## In progress
- reading spec + docs
## Remaining
1. read spec/docs, 2. read module code, 3. typecheck + tests, 4. verify tests (*.verify.test.ts), 5. harness e2e + screenshots, 6. report
## Findings so far
- (read) spec, addendum, seed, arch, GDD 07 5.2 + 6.2 + App A-E, all wood module code, founding camponotus.
- Candidate findings (to verify): unused params (satiation 0.7, foragerShare 3%, satellitesMaxInterior, orphan 7 GD,
  bird chance) = §5.2.7/5.2.4 rules not implemented and NOT in impl notDone; young brood outside parent not carried
  back (§6.2.6); module-level Maps announced/ejectedSeen keyed by colony id survive across sims (2nd game in same
  page loses caste-unlocked/frass-ejected); assignShuttles ignores satellite free capacity; marker satellite skips
  thickness/decay/cap checks; isolation = "no open entrance" not "no walkable path"; wall-thin refusal is generic
  'not-allowed-here' (spec prompt "The wall is too thin").
- (03:55) DONE typecheck 0 errors; wood + founding/species tests 8 files 37 pass 1 skip.
- (03:55) DONE src/sim/species/modules/wood/wood.verify.test.ts: 7 tests, 2 pass (hazard edges, setWood NaN guarded by
  command layer), 5 RED on purpose: marker on decay-4 wood founds satellite; markers ignore 4-outdoor cap (5 founded);
  assignShuttles ignores satellite capacity (6 jobs for room 2); shuttle score ignores colony climate seam
  (chamberTemp raw; App E13 test's setChamberClimate 22/26 has no effect -> E13 numbers are for ~20/20 C);
  caste-unlocked never fires in a 2nd sim (module Map `announced` keyed by colony id).
- Static findings: trunk trails not implemented for CP (only granary/trunk.ts); satiation x0.7 + forager share 3%
  not implemented; decay-4 -> unstable/abandoned not implemented; orphan flag; young brood return; interior cap.
- NEXT: e2e harness run (one), look at shots; then report.
- (03:58) RUNNING e2e harness -> test-output/species-carpenter/review1 (started 03:43)
- (04:05) r4 run.json: frass pile volume 0.65 BU3 = 0.06 pile units (< 1 item); e2e "units>=1" counts 35 loose
  items lying outside (loosePos y 63 mm, on the log?) -> frass does not settle into a pile; e2e check weak.
  r4 shot 02: castes not readable (major is a dithered near-camera ghost); 04: dark diamond blob = soil fallback.
