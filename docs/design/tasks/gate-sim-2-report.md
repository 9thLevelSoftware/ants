# gate-sim-2 — simulation gate after colony-life: report

Engineer: gate-sim-2 implementer, Nov 23 16:50-UTC onward (one session; progress file
`docs/design/tasks/progress/gate-sim-2-impl.md`). Evidence: `test-output/gate-sim-2/` (git-ignored; paths below are
relative to it unless they start with `src/`, `docs/` or `test-output/`).

SWEEP_SECTION_PLACEHOLDER

## 1. Red-test table (item 1)

Method: `npm run typecheck` (clean before and after), then `test-output/gate-sim-2/folders.sh` — every folder of
`src/core`, `src/sim`, `src/worldgen`, `tools`, `tests/docs` run on its own (files directly in the folder, one vitest
worker while life runs went on). Before = the live tree at 16:56 with only variant f in (`vt-before/`, per-folder `.txt`
and `.json`; `vt-before/summary.txt`); after = the final tree (`vt-after/`). The failing-test lister is
`scratchpad fails.py` reproduced in section 9.

Verdicts: **defect** (fixed at its cause, test unchanged), **stale** (a number or fixture made stale by a ruling or a
later rule; restated from the constants, old -> new in DEVIATIONS, no tolerance widened, no assertion dropped),
**timing** (wall-clock budget under load: load guard `src/sim/testing/perfLoad.ts heavyLoad()`, strict mode
`FOUNDRESS_PERF_STRICT=1`), **mine** (made red by a change of this task and fixed in it), **left red** (cause and owner
given).

RED_TABLE_PLACEHOLDER

## 2. Items 2-5

### Item 2 — crumb retrace "variant f" (ADOPTED)
- Change: `src/sim/locomotion/crumbs.ts retraceTarget` keeps the nearest-crumb start of variant e and drops the
  consumption (`crumbLen = target + 1`). Probe evidence for the cause was sweep 15's (App. E 23 red from the
  consumption half only).
- Adoption check (spec: we #3 and sg #3 from round 10's hand-overs viable with R27 C met, we #1 from sweep 14's
  hand-over viable), tree `scratch-g2f` = hand-over tree + variant f, runs in `item2-f/`:

  | colony (hand-over) | variant e (`colony-life/round-15/arm-y1-r15e`, `h14-r15e`) | variant f (`item2-f`) |
  |---|---|---|
  | we #3 (round 10) | viable, C 7.32 / R27 6.31 = 1.16 x | **viable, C 8.04 / 6.23 = 1.29 x** |
  | sg #3 (round 10) | viable, C 14.88 / 6.24 = 2.38 x | **viable, C 12.52 / 6.07 = 2.06 x** |
  | we #1 (sweep 14) | viable, C 28.2 / 6.42 | **viable, C 23.4 / 6.78** |

  One run each (direction 13: a claim per colony from its paired runs; the sweep is the tree's measure).
- Tests: `behaviours/outdoor/appendixE23` green (folder run), `outdoor/removal.verify` green, `retraceResume15`
  case 1 restated to the rule as it is now: the crumbs behind her are KEPT (the farthest crumb lies more than a crumb's
  spacing beyond her — red with variant e's consumption), the resumed retrace still walks home (unchanged assertions).
  D34 restated.
- Side finding: `behaviours/outdoor/review.verify` "a lasting threat on the way" went red in the before-run with
  variant f (forager outside 2101 s > 1800 s, 102 flee runs). Seed sweep of the same scenario
  (`tools/sim/probe/g2-threat.ts`, archived): variant e exceeds the bound on seeds 2 and 6 of 1-6, variant f on seed 5
  (`threat-seeds-e.txt`, `threat-seeds-f.txt`). Both variants show the same flee -> return -> flee loop at a standing
  alarm on the way home (62-159 flee runs); the test's seed is chaotic. Pre-existing defect, not a cost of variant f;
  left red (section 6).

### Item 3 — mound-mask hole probe (NOT BUILT)
Not built. Reason: the must-haves (items 1, 2, 8, 9) and the two defects found under items 4 and 5 took the time; the
probe needs its own A/B on three hand-overs, the four restore / determinism tests and a 36000-tick restore equality
before the close sweep, and a second close sweep if adopted. Round 14's cavity-only probe stays
(`src/sim/nest/moundRelax.ts buildMask`); the known limit and its A/B table stand as written in the colony-life
ledger ("Known limits", item 3). Note for whoever builds it: the base ground of the mask (`m.base` + `groundDeltaAt`)
is already restore-exact; a "substrate without pile overlays" reading at `g - depth` is negative by construction away
from a cavity, so round 12's width came from the cavity / pile terms of the whole field, not from the bare substrate.

### Item 4 — kd #3: larvae starve with protein in store (FIXED, defect of execution)
- Reproduced from sweep 15's own hand-over (`viab/cache/founded-...-kitchen-door-3-...-325775ec.bin`) on the
  hand-over tree (`probe-kd3-r15e.txt`, probe `g2-nurse.ts`): 7 larvae starved at gd 2.3-2.6 (same as the sweep).
- Trace of one nurse (`probe-kd3-n7296.txt`, probe `g2-nurse1.ts`): the larvae lay in one pile at
  (8067.5, -59.4, 5205.8), **1.3 mm inside the wall** of the 2.5 BU royal chamber (field -1.3). A nurse with a full
  crop asked the walk for the larva; `locomotion/trip.ts resolveTarget` -> `snapToSurface` moved a goal inside a solid
  **straight up until free space**: through 46 mm of soil to the ground at y -13. Every feeding nurse walked out of the
  nest to the ground above the pile, failed, passed, came back, and started over (state `nurse.feed`, chamber -1 or
  nest -1, for hours). Store -> nurse worked; nurse -> larva did not.
- Fix: `src/sim/locomotion/trip.ts` — an item or brood goal that lies in a nest (`nestId >= 0`) and inside the soil
  next to its cavity moves to the nearest carved space along the field gradient (`climbToFree`, at most 16 steps,
  within SNAP_MAX_BU, accepted only below the substrate surface). All other goals keep the old rule (vertical rise).
  Two narrower versions were needed because the first ones broke other tests (recorded so nobody repeats them):
  (1) a general gradient climb broke `locomotion/locoFix3.review` (goal up a stem: the climb planner expects the
  vertical rule); (2) restricting it to carved space still broke `rivals/broodRaid` App. E 20 (raiders' goals). The
  final form is green on both.
- Test: `src/sim/ants/behaviours/nest/buriedLarva.gate2.test.ts` (2 cases): a goal 1 mm inside a chamber's side wall
  snaps to within 1 BU in the chamber (was 52 mm away, on the ground); three larvae 1 mm in the floor of a nursery are
  fed by their nurses with no nurse-tick outside the nest (was 114 nurse-ticks outside, larvae unfed). Both red with
  the `climbToFree` call removed.
- Paired evidence, kd #3 from sweep 15's hand-over to winter (one pair; `item4-base` = hand-over tree + variant f,
  `item4-fix` = + the first version of the fix; the final version acts identically for brood goals):

  | | larvae starved | eclosed | workers at winter | viable | C / R27 need |
  |---|---|---|---|---|---|
  | base | 7 | 0 | 9 | yes | 8.08 / 3.96 |
  | fix | **0** | **7** | **16** | **no** | 4.15 / 6.23 (0.67 x) |

  The fix does what it should (the brood is raised); the bigger colony then needs more winter carbohydrate than it has
  (R27) — the known "colonies that end short of sugar" limit, not a cost of the fix. The sweep judges the archetype.
- No new state: the change is a pure function of the field.

### Item 5 — sg #2: "digging with no open plan" (NO DEFECT; one candidate found, not fixed)
- Reproduced sweep 15's run from its own hand-over on the hand-over tree (`probe-sg2-dig-r15e.txt`, probe
  `g2-dig.ts`; same plan ids and days as the sweep's table).
- What the diggers dig: **an open architect plan existed the whole time**: tunnel plan 6490 (need `missing-type`,
  61.75 BU^3) created at gd 0.06, dug slowly (1-2 diggers, often `stalled: no-diggers`) until it completed at gd 7.2;
  then chamber plan 10923 (68.5 BU^3, created gd 7.4). Pellets of days 4-11 are `dig.bite` on those plans. The sweep's
  "plans +/done" column counts plans **created / completed that day**, which read as "no open plan". Dig demand = the
  plans' slots (2, then 8), target 1-4: the allocation rule as built.
- The carbohydrate collapse (C 8.5 -> 3.8 between gd 2.0 and 2.75) coincides with the hatching larvae: at 25 C a larva
  eats 0.909 C/gd (section 1, workedExample), five larvae 4.5 C/gd; tend target 0-1 then (R39). Rule behaviour; a
  change would be a new allocation rule (not in scope).
- **Candidate defect seen, not fixed (time; needs its own trace):** from gd 9.5 three of the four diggers stand in
  `dig.stow` holding a pellet for 0.3-1.5 gd (ages up to 1840 ticks at unchanged positions, two outside on the pile),
  so the chamber plan gets no pellets for 1.25 gd while the colony's carbohydrate runs out. Mechanism suspected:
  `carryTo('mound')` fails -> `recover` (put-down) -> `dig.claim` -> `dig.stow` again with the pellet still held
  (a loop like round 15's deliver livelock). Listed in section 6.



## 3. R13 / R14 from sweep 15's data (item 6)

From sweep 15's JSONs (`colony-life/round-15/sweep/life-*.json`; script inline in this report's history, output
`r13r14-from-sweep15.md`). The JSONs hold one row per game day: entrances open at the day-0 row (the hand-over tick)
and at the day-1 row, brood deaths by cause and adult deaths by cause; they hold **no** chamber flooded share and no
site flood rating, so R13's "peak flooded share on a flood-safe site" cannot be read from them, and R14's 4-hour bound
can only be bounded by a day.

| run | hand-over gd | entrances open at day row 0 / 1 | brood lost to flooding | adults drowned | queen |
|---|---|---|---|---|---|
| car-park-verge-1 | 3.691 | 0 / 1 | 6 | 0 | alive |
| car-park-verge-2 | 4.788 | 0 / 1 | 0 | 0 | alive |
| car-park-verge-3 | 4.171 | 0 / 1 | 0 | 0 | alive |
| kitchen-door-1 | 3.582 | 0 / 1 | 1 | 1 | alive |
| kitchen-door-2 | 4.931 | 0 / 1 | 2 | 0 | alive |
| kitchen-door-3 | 4.404 | 0 / 1 | 10 | 0 | alive |
| playground-park-1 | 4.181 | 0 / 1 | 0 | 0 | alive |
| playground-park-2 | 4.791 | 0 / 1 | 0 | 0 | alive |
| playground-park-3 | 3.923 | 0 / 1 | 0 | 0 | alive |
| suburban-garden-1 | 4.184 | 0 / 1 | 0 | 0 | alive |
| suburban-garden-2 | 4.868 | 0 / 1 | 0 | 0 | alive |
| suburban-garden-3 | 4.417 | 0 / 1 | 1 | 0 | alive |
| woodland-edge-1 | 3.625 | 0 / 1 | 0 | 0 | alive |
| woodland-edge-2 | 4.929 | 0 / 1 | 0 | 0 | alive |
| woodland-edge-3 | 4.408 | 0 / 1 | 0 | 0 | alive |

- **R14 (entrance open within 4 game hours of the hand-over):** all 15 hand over with no open entrance (day-0 row 0)
  and have one open by the day-1 row (and departures on day 1): open within 24 game hours in 15 of 15. The 4-hour
  bound is not measurable from the JSON. A probe that restores each hand-over and ticks to the first open entrance
  (`tools/sim/probe/g2-r14.ts`, archived) gives the hours where it was run: R14_PROBE_PLACEHOLDER
- **R13 (no flood-safe site reaches 25 % flooded in the brood / royal chamber from ordinary showers):** not readable
  (no flooded share in the JSON). Losses to water: brood lost to flooding in 5 of 15 runs (cpv #1 6, kd #3 10, kd #2 2,
  kd #1 1, sg #3 1), one adult drowned (kd #1), no queen lost. kd #3 is the flood-prone nest named in the colony-life
  limits. Neither ruling is traced further (the spec allows tracing only if items 1-5 left time; they did not).


## 4. Leftover seams (item 7)

- **Antlion pit height overlay:** not done. `src/sim/ecology/creatures/antlion.ts createPit` only pushes a hazard
  record; walkers walk flat over the pit (the renderer draws the cone). Registering the profile with
  `kernel.setHeightOverlay` also needs the overlay rebuilt on restore from the hazard list and removed when the pit
  goes; that is a state / restore change with its own determinism test, not a small seam. Owner: creatures.
- **Creatures parked at the map edge:** not examined (time). Owner: creatures.
- **`lay-egg` returning `budget` outside the opening's lay phase:** checked, working as built: `ants/actions/defs/care.ts`
  refuses with `budget` whenever `colony.canLay` says no and the queen is not protein-short — the colony's egg budget
  (GDD 02 §3.2). After a cheat-completed founding the budget is refilled by the laying system on its own cadence; the
  refusal is the rule, not a defect. Whether the cheat should prime the budget is the app / cheat side's call.
- **Stagger offsets of the species modules' periodic systems:** pairs that fire on the same ticks (offset 0, periods
  multiples of each other): granary `economy` (25) with `castes` (10), `patrol-gate` (10), `trunk-trail` (20),
  `winter` (50), `middens` (100), `display` (100), `seed-sources` (250), `diagnostics` (250); fungus `garden` (25)
  with `castes` (50), `phorid-deaths` (50), `display` (100), `leaf-sites` (250), `diagnostics` (250); every one of
  them also with the environment's fast step (25, offset 0) and the overwinter / succession checks (5, offset 0).
  Wood's systems already have distinct offsets. **Tried and reverted:** distinct offsets 1-8 within each module.
  Lasius hash unchanged (sg #2 of sweep 15, 18000 ticks: beb35045 / 11e07a85 / 74d18776 with and without,
  `probe-hash-g24.txt`, `probe-hash-g24o.txt`), but `species/modules/fungus/scenario` ("cutters but no processor ->
  the chain names processing") went red (its diagnostics cadence moved) and `granary/rhythm` failed differently, so
  the change was reverted; the list above is the hand-over. Owner: species modules (harvester, leafcutter).


## 5. DEVIATIONS rows written

- **D34** restated (variant f: nearest-crumb start, crumbs behind kept; the variant-f adoption numbers).
- **D36** new: Camponotus digs only wood and insulation (GDD 07 §5.2.6 over GDD 03 §2.1's soil column);
  `services.test` restated to the constant.
- **R43** extended (old -> new numbers of the tests restated here): GDD 02 §15 worked example (larval 0.80 C / 2.40 P
  -> 0.909 / 1.819 per larva and gd; need C 10.71 -> 11.27, P 12.90 -> 9.90; stock change C +1.39 -> +0.83,
  P +0.05 -> +3.05); `handoverStomach.verify` case 1 restated to R2's intent; GDD 07 larval costs
  (`species/derive.test`: CP major 2.33 -> 1.55 P, CP gyne 10.1 -> 6.7 P, MB major 3.0 -> 2.0 P, AT major 6.7 ->
  5.0 FL; `speciesData.verify`: AT gyne by the mass rule 42 -> 31.5 FL).
- Not deviations (defects fixed at their cause, the GDD's rule unchanged): item 4 (`trip.ts`), the winter path read on
  the default year (`queen.ts winterPathRamp`), the runner's failure code (`whoWithinSpecies`).


## 6. Still wrong (most serious first)

STILL_PLACEHOLDER

## 7. Contract changes (additive)

None in `src/sim/types/**` or `src/core/**`. Additive within owned module APIs: `ActionDef.whoWithinSpecies?`
(`src/sim/ants/actions/types.ts`), `snapToSurface(sim, p, bu, inNest = false)` (optional parameter,
`src/sim/locomotion/trip.ts`), `winterPathRamp(doy28)` (new export, `src/sim/colony/queen.ts`). No new persisted state.


## 8. Evidence paths

EVIDENCE_PLACEHOLDER
