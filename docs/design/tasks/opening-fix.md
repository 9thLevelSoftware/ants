# Task opening-fix — The player's founding fails in the browser on both test seeds (Opus implement / Opus verify)

Written Nov 23 ~20:40 UTC by the integrator. Highest priority in the project: this is the first ten minutes of the game.

## What is wrong
`tests/e2e/firstplay.mjs` plays the opening the way a player does (walk the queen, pick a site, dig, seal, lay, time
lapse, outcome card, first workers reopen the entrance). On Nov 22 13:33 / 13:41 UTC (HEAD `4ab0ebd`, colony-life round
9) both seeds passed beats 01–13 with no stand-ins (`test-output/firstplay-r9/seed1`, `seed2`, STATUS entries of those
times). On Nov 23 19:11–19:38 UTC (live tree after colony-life round 15 + gate-sim-2's edits) both fail
(`test-output/look5/firstplay/seed1.log`, `seed2.log`, pictures beside them):
- **Seed 2** (`00000002`, the script's default): beats 01–10 pass; the time lapse ends in phase `failed`, "Water filled
  the burrow" (11 eggs, rising-water alerts) at a site the read-out called flood-safe. In round 9 this seed lost 3 of the
  first clutch and handed over 7 workers.
- **Seed 1** (`00000001`): the lapse and the outcome card pass; then "the first workers did not reopen the entrance and
  walk out" — the entrance stays `reopening:130` (ruling R14: open within 4 game hours of the hand-over).
The headless sweeps do not see either: `tools/sim/life.ts` founds with its own autoplayer at its own site (15 of 15
sweep-15 foundings have an open entrance on day 1). So the regression is in what the player's path does differently:
the site the script picks, the shaft and cell the player digs, the seal, the lapse at that place.

## Goal
Both seeds pass beats 01–13 of `firstplay.mjs` again without stand-ins, by fixing the cause in the simulation; and a
headless test reproduces each failure so it cannot come back unseen.

## Read in full
`docs/STATUS.md` entries "Nov 22 13:33 UTC", "Nov 22 13:41 UTC" and from "Nov 23 ~15:07 UTC" to the end;
`tests/e2e/firstplay.mjs` and `tests/e2e/lib/firstplay-steps.mjs` (what the script commands, beat by beat);
`docs/design/tasks/colony-life-ledger.md` "## Round 9" (how the reopen defect and seed 2's flood were fixed then: FD2,
the reopen fix), "## Round 14" results (mound-mask probe, wasteFall, point-field restore) and "## Round 15" results;
`docs/design/tasks/gate-sim-2-report.md`; rulings R12–R14 and direction 21b in `docs/STATUS.md` / `colony-life.md`;
GDD 01's opening and GDD 06 §5 (founding).

## You own
`src/sim/**`, `src/core/**`, `src/worldgen/**`, `tools/sim/**`, `docs/design/gdd/DEVIATIONS.md` (rows for what you
change), `docs/design/tasks/opening-fix-report.md`. You may run `tests/e2e/firstplay.mjs` (one browser at a time) and
add environment switches to it that only shorten or instrument a run (`FIRSTPLAY_UNTIL`, a state dump); you may not
change what a beat asserts. `src/render`, `src/game`, `src/ui` belong to another engineer who is working there now.

## Work
1. **Reproduce in the browser once per seed** on the live tree (`FIRSTPLAY_SEED=00000001`, `00000002`,
   `FIRSTPLAY_UNTIL=13`), keeping the log and a state dump at the failing beat (founding phase, cell flood share and
   water source, entrance state and plug cells, where the first workers are and what their nav says).
2. **Make it headless.** A node script under `tools/sim/` that drives the same commands as beats 04–13 for a given
   seed (the same site choice, dig, seal, lay, lapse, hand-over) and ends in the same state as the browser run — check
   by comparing the founding phase, site cell and the state hash at the lapse start with the browser's dump. If the
   browser run cannot be matched exactly, get as close as the commands allow and say what differs. From here on work
   headless; the browser is for the final confirmation.
3. **Find the change that broke each seed.** The round-9 tree passed. Use `git archive <commit> src tools | tar -x` into
   scratch directories (no checkout, no worktree) and bisect over the commits between `4ab0ebd` and HEAD with the
   headless script (state formats may differ between commits: found from scratch each time). Suspects, not
   conclusions: round 14's mound-mask hole probe (spoil on the entrance lip, run-off into the throat), `wasteFall`,
   round 15's nest-nav lone-voxel sample and deliver recovery, round 10–12 changes to the lapse's flood handling,
   gate-sim-2's edits.
4. **Fix at the cause**, each fix with a test that is red without it (a unit test at the rule, plus the headless
   opening as a `FOUNDRESS_LONG` test if it takes more than 20 s). For seed 2 the bar is the design's: a site the
   read-out calls flood-safe does not fill in the lapse (R13); if the read-out is wrong about that site, fix the
   read-out's flood factor or the drainage, not the script. For seed 1: the entrance is open and a worker is outside
   within 4 game hours of the hand-over (R14).
5. **Do not trade the sweep for the opening.** After the fixes: the five cached Lasius hand-overs of sweep 15 that are
   in the long-run set run to winter on your tree (paired with their sweep runs); viability must not drop in more than
   one of the five, and if a fix changes every game (not only the player's opening) say so and run the full
   `tools/sim/sweep-life.sh` once (bar: viable ≥ 13 of 15, ≥ 2 of 3 per archetype).
6. **Confirm in the browser**: `firstplay.mjs` on both seeds, `FIRSTPLAY_UNTIL=13`, no stand-ins; then one uninterrupted
   full run per seed and report the first failing beat after 13, if any, with its cause (app or sim) — fix it if it is
   a sim defect of the same kind (a worker that cannot hand over her load failed beat 16 in a stand-in run on Nov 23:
   `test-output/look5/firstplay/seed1-standin`).
7. **Three more seeds** (`00000003`, `00000004`, `00000005`) through beats 01–13 headless (and in the browser if the
   headless script is not an exact match): the opening must not depend on the two seeds the script happens to use.
   Report each; fix what is the same cause.
8. Report `docs/design/tasks/opening-fix-report.md`: per seed the cause, the breaking commit, the fix, the test, before
   and after; the sweep check; what still fails.

## Rules
- Determinism rules of the design seed; every new piece of state saved and restored; contracts additive only.
- No rebalancing: no change to rain, drainage or flood constants unless the cause is a constant that a ruling already
  fixes (then cite the ruling). No change that makes the lapse ignore water.
- At most two life runs at a time while a chromium process exists; one browser at a time; never the whole vitest suite
  in one process. Disk is short (about 8 GB): delete scratch trees as you finish with them; never copy `node_modules`
  (symlink it).
- Probes under `tools/sim/probe/` while in use; archived under `test-output/opening-fix/probes/` and removed before you
  finish.
- If the task runs long, the must-haves are items 1–4 and 6 for the two seeds.

## Acceptance criteria
1. `firstplay.mjs` beats 01–13 pass on seeds `00000001` and `00000002` without stand-ins on your final tree (logs and
   pictures under `test-output/opening-fix/`; look at pictures 12 and 13).
2. A headless reproduction exists for each failure, red before the fix and green after.
3. The sweep check of item 5 holds.
4. Typecheck clean; tests green in every folder you touched; `outdoor/determinism.perf` green.
5. Report complete.

## Integrator ruling 1 (00:45 UTC Nov 24, after container restart 8)
Read from your progress file: seed 2's breaking commit is round 14's mound-mask hole probe (995244e), and the
seed-1-type failure is an allocation that leaves no digger for the plug. Both fixes so far are accepted in kind
(`dryQueen`: a founding queen does not sit in water through the lapse; the unplug floor of 2 diggers while a nest has
no open entrance). In addition:
1. **Fix the breaking change itself, not only its consequence.** The cavity-only probe was written for save / restore
   equality and has now cost the seal of the player's founding (plug 93 against 229 voxels), trip success and kd #3's
   brood flooding (`test-output/colony-life/round-15/ab5-table.md`). Build the probe direction 30b item 5 of
   `colony-life.md` describes: as wide as round 12's, reading only state a save restores exactly (the substrate / carve
   field without the pile overlays). Adopt it if `nest/moundMaskHeights.test`, `nest/moundRestore14.test`,
   `locomotion/pointFieldRestore.test`, `locomotion/pointFieldEvict.gate2.test` and `outdoor/determinism.perf` stay
   green, a save / restore of one cached colony runs equal for 36000 ticks, and seed 2's headless opening seals as round
   9's did (plug size and queen position reported). If it cannot be made restore-exact within about an hour, leave the
   cavity-only probe and say why. Either way `dryQueen` stays.
2. **The unplug floor must not starve the brood of a 4-worker founding**: state what the floor does with fewer than 5
   first workers (the browser's seed 1 handed over 4), and cover it in the unit test.
3. Your close sweep (mandatory, see the launch note) measures all of it together; if viability drops below 12 of 15
   find which change costs it by switching each off on the failing colonies' hand-overs, as gate-sim-2 did, and report
   to the integrator in the progress file before reverting anything (the last task reverted a real fix by the letter).
4. Write real UTC times (`date -u`) in the progress file: the stamps before the restart ran two hours ahead of the clock.

## Integrator ruling 2 (06:36 UTC Nov 24) - the close sweep (12 of 15, 249 workers)
- **Viability:** 12 of 15 with every archetype at 2 of 3 or better meets the project's bar (>= 2 of 3 per archetype);
  the three misses are the winter-sugar limit again (R27 at 0.59-0.83). Accepted. No revert.
- **Workers at winter 249 against 271 / 270 on the same foundings** is the number to explain, not to accept unseen.
  After the long runs end (not before: the machine is full), run two switch-off arms **on the five long-set colonies
  only**, from this sweep's own hand-overs (`test-output/opening-fix/cache`), to winter: (a) the cavity-only mound-mask
  probe in place of the wide one; (b) the unplug floor and draft off. Table per colony: workers at winter, eclosions,
  trip success, R27 ratio, against the sweep's own run. Ten runs, about an hour. Report what the table says; change
  nothing on it unless one arm is better in at least 4 of 5 colonies - then say so in the progress file and wait for a
  ruling (the opening needs both fixes: a cheaper form would have to keep seeds 1-5 passing).
- **R14 on a night hand-over** (seeds 1 and 2 hand over at about 19:46 and need 6-7 game hours; seed 3 hands over at
  08:00 and is open within 753 ticks): if cold workers digging slowly is the whole cause, that is the game, not a defect
  - state the temperatures and the dig rate in the report and restate R14 as "within 4 game hours of the first hour
  above the activity threshold". If something else holds them (no digger allocated at night, a rest rule), fix that.
- Seeds 4 and 5 in the browser and the two full runs go on as you planned.
