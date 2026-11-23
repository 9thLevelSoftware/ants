# Task colony-life — A colony left alone grows (Opus; measured rounds; whole-sim authority)

## Why this task exists
Three rounds of work (`viab-economy`, `econ-growth`, its fix round) have left colonies that mostly sit still and age out: in the last sweep 7 of 15 were viable, 11 of 15 had no worker eclose after hand-over, median trip success was 17 % and median protein intake was 14 % of need (`test-output/econ-growth-review/sweep9-table.md`). Each round ended with its owner naming another module (locomotion, nest, founding, ecology). This task has no such border: you own the cause wherever it is.

## Read in full
- `docs/STATUS.md` from the Nov 16 14:00 entry to the end. Rulings R1–R19 are binding and take precedence over the GDD. R18 (protein a small colony can take) and R19 (growth bar) are the point of this task.
- `docs/design/tasks/colony-life-ledger.md` — the running ledger of this task. Earlier rounds' causes, fixes, things tried and reverted, and the independent sweep after each round. **Read it first; do not redo or undo what it records without new evidence.** If it does not exist, you are round 1: create it.
- `docs/design/tasks/viab-economy.md` (viability bar), `econ-growth.md` (R7–R11), and the results recorded in STATUS for econ-growth, loco-fix3, nest-fix3.
- GDD 02 (colony economy; §5 needs, §6 allocation and activation, §15 worked example) and GDD 05 (ecology: food sources, prey) sections that a cause leads you to, in full.

## You own
All of `src/sim/**`, `src/worldgen/**`, `src/core/**` (contracts additive only), `tools/sim/**`. Other engineers are working in `src/sim/species/modules/**` and their `src/sim/balance/species-*.ts`: do not edit those. Fix at the cause in the module that owns the rule. Determinism rules of the design seed apply.
`src/sim/locomotion/**` is yours too: the loco-fix3 fix round was cut off twice by container restarts near its end; its code is in the tree, its review is `docs/design/tasks/reviews/loco-fix3.json` (findings on descent planning, edge gates on the homeward flow field, relocation repeats, climbs to food, kernel crossings). Check the state of each finding before you change that folder, treat the unfinished ones as leads ranked like any other cause, and compare with the locomotion of commit f2b9eeb where the A/B lead points there.

## What is not allowed
- No change to lifespans or ageing beyond ruling R30 (direction 15, which replaces R11: the numbers there are the integrator's; do not tune them further). `UNTENDED_GD` (R33) and `LAYING_SUPPLY_HORIZON_GD` (R32b) change as direction 21 rules and no further. No lowering of needs, no free food, no larger hand-over provision than R2, no weakening of the bars or of a test that checks a ruling.
- Balance changes only where you show, with numbers, that a constant is inconsistent with the design's own worked example or with a ruling; list each as a GDD deviation in the ledger.
- No fix that is a special case for one seed or archetype.

## Method — every round
1. **Account before you touch code.** For the failing runs in the latest sweep table (the ledger names it), build the funnel from the run's own output (`life.ts` has `report.econ`; add counters where a stage is invisible — counters are plain persisted state or tool-side observers, never behaviour):
   - worker time by state (in nest idle, in nest working, waiting to depart, travelling out, searching, handling, travelling home, stuck/relocating);
   - trips by outcome and reason (no source known, source gone, claim refused, path failed, gave up, weather, threat, success), per nutrient;
   - the protein path: sources within 300 BU by kind and what they hold, how many are known, visits, items taken, delivered, fed to larvae; the same for carbohydrate;
   - brood: eggs laid, and every loss between egg and worker by cause; time per stage;
   - hand-over: first-worker count and what set it;
   - deaths by cause.
2. **Rank causes by measured loss** (workers not eclosed, food not delivered) and write the ranking in the ledger before fixing.
3. **Fix the top one to three causes at the cause**, each with a unit test at the level of the rule and a before/after on the runs it affects (`node tools/sim/run-ts.mjs tools/sim/life.ts --seed S --archetype A --until winter --cache test-output/viab/cache`; at most 2 at a time). Do **not** run the whole 15-run sweep: an independent engineer does that after your round.
4. **Ledger**: append a section `## Round N` with: the funnel table for the runs you studied; the ranking; each fix (cause, files, test, before/after); what you tried and reverted and why; GDD deviations; what you would do next. Keep it factual and short.
5. Typecheck clean; tests green in every folder you touched (folder by folder, never the whole suite).

## Leads already on the table (verify each; they are claims, not facts)
- Prey patches are never hunted, so Tier 2 protein is missing (R18).
- Trip success 7–36 %: reasons unknown.
- With the current locomotion, kitchen-door #1 tends no herd and woodland-edge #1 starves of carbohydrate; both recovered with the locomotion of commit f2b9eeb (A/B in `test-output/econ-growth-review/ab/`). Stall at woodland-edge #1 near (4490.3, 51.6, 7958.4).
- Steady state is protein-limited: forage demand is capped by known capacity (≈ 17 foragers on one carcass) and 0.375 P pieces need ≈ 30 trips a game day (E25 passes on seed 1 only).
- Eggs lost as `egg:untended`; night flood traces send idle ants to nurse.
- Seed 3 hands over with 7–9 workers on every archetype.
- Workers crushed (up to 4 in a run) and lost.
- `src/sim/colony/founding/reopen.test.ts` is red.

## The bars (same 15-run sweep: seeds 1–3 × woodland-edge, suburban-garden, playground-park, car-park-verge, kitchen-door; Naturalist, default start, flooding on, no player)
- **Viability** (binding since viab-economy): ≥ 2 of 3 viable on each archetype.
- **Growth, R19**: workers at winter ≥ first workers in ≥ 10 of 15 runs; median eclosions after hand-over ≥ 4; median intake/need P ≥ 0.7 and C ≥ 0.9; median trip success ≥ 50 %; first workers ≥ 9 in ≥ 13 of 15 runs; no `worker:lost` in ≥ 13 of 15 runs.
- Once both hold, also report (not a bar): a spring start (`--start-doy 2`) to winter, and one run from the default start through winter to the second autumn, with worker counts over time.

## Integrator direction for round 3 onward (Nov 17 06:45 UTC; binding; read with the sweep-2 section of the ledger)

Two sweeps have not moved the bars (viable 7 → 9 → 8 of 15; eclosions median 0; P intake 0.14 → 0.09 → 0.03). Single whole-life runs diverge after a day or two, so a before/after on one run is weak evidence, and the 15-run sweep is too slow and noisy to steer by. From this round:

**1. Steer by benches, confirm by sweep.** Build two tool-side benches under `tools/sim/` that start from the cached hand-over snapshots (all 15) and isolate one half of the colony each. They are measuring tools: they change no rule and are never used by the game.
- **Nest bench**: stores are topped up by the tool to 2 gd of need in C and P every game hour (tool-side write, bench only), foraging left on. Run to winter. Report per run: eggs laid, hatched, pupated, eclosed, every brood loss by cause, larvae starved, laying potential/permission shares, brood temperature by day, workers by day. This answers "does the nest raise workers when food is not the limit?" and gives the ceiling the calendar and temperatures allow.
- **Forage bench**: the nest's demand is held at the need of 30 workers with full brood (tool-side), brood care left on. Report trips by outcome per nutrient, P and C delivered per gd against that need, prey encountered / subdued / carried home, scout discoveries.
A fix is accepted when its mechanism counter moves on the bench across the 15 snapshots (medians, not one run), and a unit test pins the rule. Benches must be quick: stop at winter, 2 at a time; if a bench run costs more than a life run, cut its reporting, not its length.

**2. What the sweep-2 table says the bar needs (my reading; verify, then rank by bench numbers).** The eclosion and worker-hold checks need runs of the seed-1 kind (hand-over at 3.5–3.9 gd with 12–16 workers) to raise ≥ 4 workers, not only the seed-2 kind (2.8 gd).
- **Larvae starve while protein sits in the stores**: woodland-edge #1 (8 starved, P 2.56 in store at winter), car-park-verge #1 (6 starved, P 3.79), playground-park #3 (5 starved, P 4.12). Find where the path store → nurse → larva breaks (ration or reserve rule, form of the stored item, nurse job, reach) — nest bench.
- **Brood dies untended with nurses present**: egg:untended 44 and pupa:untended 14 across the sweep; woodland-edge #2 lost 13 of 21 that way with 15 workers. Nest bench.
- **Only 9–21 eggs are laid in the 8–9 gd after hand-over**; laying potential > 0.5 for 14–50 % of the time. With nanitics ageing out (1–3 per run, R11 stands) a colony cannot hold its count on that. Show from the nest bench what limits laying when food is not short (queen feeding path, "winter reserve short", temperature) and what the design's own numbers (GDD 02 §4, §15) expect for a colony of 12–16 at this point of the year.
- **Seed 3** (7–9 workers, 4.3–4.6 gd, 0 of ~43 eggs hatched): one-chamber nests losing eggs to exposure, flooding, no care. Is the first chamber's siting/depth or the missing second chamber the cause?
- **Hunting converts 7 %** of encounters (1,059 prey ahead of ants, 64 subdued, 41 loads home) and P intake fell — forage bench. Kitchen-door went from 2 of 3 viable to 0 of 3: establish with the round-start tree whether round 2 did that.
- **Stuck ants and crushed workers**: up to 16 ant-gd stuck in a run (playground-park #2), `walker-stuck-explosion`, 8 crushed in the sweep.

**3. Calendar.** If the nest bench shows that with food guaranteed and brood care working the median run still ecloses fewer than 4 workers before winter, the limit is time and temperature, and the lever is the **default start day** (not development rates, not temperatures, not lifespans): measure the bench at start days 9, 7 and 5 (`--start-doy`, fresh foundings, a few seeds) and report eclosions and first-worker counts for each; the integrator rules on the start day from that table. Do not change the default yourself.

**4. Regressions first, as before**: every run that was viable and is not, with the cause; revert a change that costs more than it gains and record it under "Tried and reverted".

**5. Ruling R21 — the larder of a small nest (Nov 17 09:20 UTC, binding).** Round 3 found that a nest without a food chamber refuses solid food once the workers' social stomachs are full (P 0.15 per worker): prey and carrion carried home lie unbooked on the floor, and the first food chamber is only planned at 25 workers. Rule: (a) a colony with no food chamber keeps solid food as a pile on the floor of the chamber its brood lives in (royal chamber or nursery), with a capacity of one game day of the colony's own full need per nutrient, never less than 4 loads; items put down there are booked as stores and nurses feed larvae from them; spoilage and hygiene rules apply as in a food chamber; (b) a delivery refused as `stores-full` while the colony has no food chamber makes "first food chamber" a planning need at once, whatever the worker count. This is a deviation from GDD 03 §6.4 (pile capacity 0 outside food chambers): record it. Unit tests at the rule; bench medians as for any fix.

**6. The calendar, as the integrator reads it (Nov 17 09:55 UTC), and what to measure for the ruling.** In the reference climate (`temperate-maritime`: annual mean 12 °C, half-range 8.5 °C, peak at day 9.5) the seasonal mean air temperature is 20.5 °C at day 9.5, 18.0 at day 13, 15.0 at day 15, 11 at day 17; brood develops at r(T) = (T − 10)/11. The warm season (mean ≥ 15 °C) is days 4–15. A default start at day 9 with a 3–4.5 gd founding hands over at day 12–13.5, when about two warm days are left: no egg laid after the hand-over can finish. That is the model doing what nature does (a first-year *Lasius niger* colony goes into winter with its nanitics), but it gives the player a first season of decline. The integrator will rule on two things from numbers:
- **R20 start day** (the round-3 start-day bench, days 7 and 5): for each start day, on at least one hand-over per archetype: founding length, first-worker count, queen reserve at hand-over, hand-over day, and from the nest bench eggs laid / eclosed before winter and workers at winter. If a founding in the cooler spring soil gives fewer first workers, say so with numbers.
- **Year two.** No run has gone through a winter yet. From the sweep after round 3 on, the independent engineer also runs **five long runs** (one per archetype, the seed that was viable at winter; `life.ts` through winter to day 15 of year 2) and reports winter survival (queen, workers, stores at the first tick of spring) and workers by day through the second warm season. A colony that is viable at winter but dead in spring is a blocker finding. Once R20 is ruled, the growth bar R19 will be restated on what the calendar allows in year one and on growth in year two.
- **A warm nursery** is the mechanism nature uses to beat the mean soil temperature (a shallow chamber, a stone or slab above it, brood carried up by day): report from the nest bench what the warmest chamber of each nest reads against the royal chamber on days 1–5 and whether the brood is kept there. Do not build new thermoregulation rules this round; this is evidence for the ruling.

**7. Rulings R20 and R22 (Nov 17 10:55 UTC, binding; from the round-3 start-day table).**
- **R20 — default start day of the reference species is day 5.** `src/sim/species/data/lasius-niger.ts` `opening.startDoy` becomes `{ min: 5, max: 9, default: 5 }`. Evidence (nest bench, food guaranteed): woodland-edge #1 at day 9 raises 0 workers after hand-over (16 → 12), at day 7 pupates 11 and loses them to care, at day 5 ecloses 13 (18 → 25); first-worker counts do not fall with the earlier start (16/18/18, 7/12/10, 12/12/9). The hand-over then lands at the seasonal peak (day 8.5–9.5) and the first worker-raised cohort has the whole second half of the warm season. This is a licence against the real flight season of *Lasius niger* (July–August ≈ days 9–12): record it as a GDD deviation (GDD 07 species data, GDD 06 calendar) and adjust any text or test that states the start day (`fc2` tests, founding tests, codex/journal lines that name the season of the flight — list what you change; app-side strings go in the ledger for the app engineer). The first action of round 4: make the change, regenerate the 15 hand-over snapshots at the new default, and re-base both benches on them. All earlier sweep tables are day-9 tables: compare mechanisms, not run-by-run numbers, across the change.
- **R22 — the growth bar R19 restated.** Sweep as before (15 runs, default start, flooding on, no player). Year one, unchanged checks: workers at winter ≥ first workers in ≥ 10 of 15; median eclosions after hand-over ≥ 4; median intake/need C ≥ 0.9 and P ≥ 0.7; median trip success ≥ 50 %; first workers ≥ 9 in ≥ 13 of 15; no `worker:lost` in ≥ 13 of 15. Added, year two (the five long runs of direction 6): at the first tick of spring the queen is alive and workers ≥ 0.7 × workers at winter in ≥ 4 of 5; workers at day 15 of year two ≥ 2 × first workers in ≥ 3 of 5.
- Other species keep their start days for now (Camponotus 5, Atta 5, Messor 17). Messor's autumn founding cannot raise first workers before winter under this calendar; that is for the species viability pass, not this task.
- With the calendar out of the way the ranked losses of the nest bench are brood care with food guaranteed (untended eggs and pupae, hygiene in the royal chamber, exposure after evacuation) — the bench's own numbers decide the order. The flood-evacuation loop that E1 addressed stays open (fix on the board side, as the round-3 ledger says).

**8. Year two (Nov 17 13:05 UTC, binding).**
 The year-two runs of sweep 3 make year two the first priority after W1, R21 and R20. Targets on the five long runs (R22): alive in spring with ≥ 0.7 × winter workers in ≥ 4 of 5; ≥ 2 × first workers by day 15 of year two in ≥ 3 of 5. Three things to establish with numbers, on long runs made **after** R20 (start day 5):
1. **Winter losses.** car-park-verge #1 and kitchen-door #1 lose 58–64 % in the lapse (drowning 5, disease 2 each). Show what in the lapse model produced them and what the GDD's formula expects for a colony that enters winter viable in a nest with no flood in the weeks before. Rule (R24): a colony that passes the viability bar at winter loses at most 15 % of its workers in the lapse on Naturalist, unless a hazard the player was alerted to before winter (flood-prone chamber, disease, short stores) is the cause, and then the losses follow the same rules as live play. Fix the lapse model to that; record the deviation if the GDD's numbers say otherwise.
2. **Winter stores.** playground-park #2 enters winter with C 7.1 and has 1.2 in spring, 0 by spring day 4. Show the lapse's consumption against the design's winter need and whether the viability bar's stores check (≥ 1 gd of adult need) is simply too low for a winter; propose the stores check the calendar requires (the integrator rules).
3. **Spring laying.** Report for each long run the day of the first year-two egg and the royal chamber and warmest dry chamber temperature by day through spring. Target: first eggs by spring day 4 in ≥ 4 of 5, first year-two workers before the overwintered workers age out. If the deep royal chamber is the limiter, the lever is the colony using its warmest dry chamber (the existing queen relocation and brood sorting; a shallow nursery in the architect's early plan), not the laying curve and not lifespans. Evidence first; build it only if the numbers say it is needed.

**9. Ruling R25 — predation grows with the colony (Nov 17 15:45 UTC, binding; for the round after sweep 4).** Predators hunt now (`threats-live`, report `docs/design/tasks/threats-live-report.md`): on Naturalist 0.07 worker deaths per outside-worker game day, inside the design's band, which on five founding-year colonies is 14 of 56 workers between hand-over and winter (−30 % workers, −27 % trips). The design's rate is right for an established colony and too heavy for one of 12–16. Rule: the director's **colony-range siting** of hunting predators (the part that places hunters where the colony's ants walk; `COLONY_RANGE_P` and its use in `src/sim/ecology/creatures/director.ts` / `spawn.ts`) is multiplied by a colony-size ramp: 0 up to 10 workers, rising linearly to 1 at 40 workers on Naturalist (Gentle: 20 → 60; Harsh: 0 → 20). Residents that worldgen placed in their own territories stay and still hunt ants that walk into them; the 40 BU nest exclusion "until 5 workers" and the bird's 30-worker threshold stay. The ramp values live in `balance/difficulty.ts` with the other preset parameters. Checks: unit test of the ramp; on the five hand-overs × 6 gd, predation deaths per colony median ≤ 1 at 10–16 workers on Naturalist, and the full rate (band 0.03–0.12 per outside-worker gd) on a bench colony of 60 workers; `predators: off` still zero. `src/sim/ecology/creatures/**` passes to this task when `threats-live` has finished (STATUS says when); until then do not edit it. GDD deviation (GDD 05 §5): record it.
- **Spring laying**: round 4 showed every chamber of these nests lies 36–48 mm deep and the royal chamber is already the warmest dry one (14 °C around spring day 7). A shallow warm nursery is **not** to be built yet: first measure year two on long runs that have the hygiene fixes (E2, H4, M1), R20, R24 and R25 — regular workers (lifespan 33 ± 10 gd, dormant ageing 0.15) eclosed in the second half of year one may bridge to the first year-two workers without it. Report first-egg day, first-eclosion day and the age of the surviving workers on those runs; the integrator decides from that.
- **Carbohydrate in year one** is the next limit the round-4 long run shows (suburban-garden #2: C stores 0 from day 9, nectar within 300 BU never found, honeydew found late): the scouting leads of rounds 2–3 (one ray to the range limit; raised flowers smelled and not reached; coverage of the first 300 BU) are now first in the forage bench's ranking.

**10. Protein first (Nov 17 19:35 UTC, binding for round 5).** Sweep 4 (day-5 start) so far: 1 of 12 colonies viable; old age is 29 of 39 adult deaths; protein stores are near zero on 11–13 of about 14 days in most runs. The earlier start gave the brood time and gave the first workers time to die of old age (R11 stands): a colony now holds its numbers only if it raises workers, and it raises none without protein. Every other loss is second to this one. Round 5's primary counter is **protein delivered against need on the forage bench** (round 3 baseline: median 0.012–0.013 of a 30-worker demand; carrion within 300 BU in every world, known in 2 of 15; patch prey met only where the patch edge is ≤ 130 BU; scouts make 4–30 trips in 8 gd and walk one ray to the range limit). Target for the round: median P/need ≥ 0.3 on the forage bench over the 15 day-5 hand-overs and protein known (a carrion piece or a prey patch) within the first game day after hand-over in ≥ 12 of 15. Work the funnel in order — is the protein there (R18: renewable, ≥ 1.5 × the need of 30 workers with full brood within 300 BU, in forms a small colony can take; if a world fails R18, fix worldgen/populate, and regenerate the hand-overs), is it found (scout coverage of the first 300 BU: headings, range, odour detection of carrion and prey, trips per day, what a scout does when it smells and cannot reach), is it taken (claims, carrying, cutting a piece), is it brought home and stored (R21), is it fed (store → nurse → larva). Carbohydrate discovery shares the scouting code: report its counter too. Do not spend the round elsewhere until the protein counter moves.

**11. Ruling R28 — what counts as a loud hour (Nov 18 01:30 UTC, binding; small, do it at the start of the next round).** `quiet-time` (report `docs/design/tasks/quiet-time-report.md`) fixed the human-event alerts and the alert bookkeeping; what still fails the quiet-share invariant I11 in whole games is one standing warning (`food-c-low`, `brood-stalled`, `nest-crowded` …) making every daytime hour loud for days, which also starves the threat director of its quiet budget (no major threat ever starts, no bird ever comes). GDD 08 §6.1 says a warning is on screen for at most 30 s and then collapses into the "+n" chip; I11 counted it for as long as it existed. Rule: in `alertActive` (`src/sim/ecology/creatures/threat.ts`), a **warning** is loud for `ALERT_LOUD_S` = 30 s of sim time (300 ticks) after it is raised or its level rises (an `update` that only bumps the count does not restart it); a **critical** alert is loud for as long as it stands. Use the alert's own raise/level tick (add a persisted `levelTick` to the alert record if it has none; additive). Tests: a warning standing for a game day makes one loud hour, not twenty-four; an escalation to critical is loud until cleared; save → load equal. Then run `tools/sim/quietRun.ts` on two worlds and the long test `src/sim/environment/human/quiet.long.test.ts` (FOUNDRESS_LONG=1; its threat cases are red by design until a major threat starts): report the quiet share per window and the major threats started. Record the deviation (GDD 05 §6 I11 wording).

**12. Small seams with no other owner (Nov 18 04:15 UTC; from `sim-seams`, report `docs/design/tasks/sim-seams-report.md`, results `reviews/sim-seams.json`). Do them in a round where they fit; each is small.**
- **Save → load changes mound heights** (also sweep 5's finding 2, and a rival colony's mounds: `test-output/sim-seams/probe/rivalSave.ts`): the published height overlay and the `Mound` state disagree after a restore. This is a determinism defect that a player meets as a different game after loading; it also puts noise into every cached-hand-over comparison. Treat as a major finding.
- `src/sim/sim.ts` `applyPendingCommands` does not flush the event queue as a tick does: a save taken while paused loses the commands' events.
- `src/sim/createGame.ts`: import `@/sim/rivals/wiring` (or add a creation hook) so a game is the same however it was created (rival nests are now built at creation; without the import they are built on the first tick and entity ids differ).
- `src/sim/environment/human/schedule.ts:48` hard-codes the week length (7, 2, 5): use `WEEK_DAYS` and a weekend constant; `src/sim/time.test.ts` is red until then.
- Re-evaluating entrances after every carved sphere makes instant plan carves 100–400 ms each.
- Ecology import cycle: entering the import graph at `ecology/creatures` leaves two ecology systems undefined (`test-output/sim-seams/probe/order.ts`).
- The first tick of a new game still costs about 670 ms outside rivals (for the perf task; note what you see).

**13. Measuring a round (Nov 18 05:35 UTC, binding for every sweep and round from now).** Sweeps so far read 7, 9, 8, 8, 1, 6, 4 viable of 15. Part of that is real (the larder regression of round 4), part is noise: fresh foundings differ from sweep to sweep whenever any engineer changes the opening (sweep 6's hand-overs are not sweep 5's: rival nests are now built at creation and the opening grace is wired), a restored hand-over does not continue like the in-process run (the mound-height defect of direction 12), and a 2-of-3 verdict on a chaotic run flips on one worker. So:
- **The paired comparison is the primary evidence of a round**: the independent engineer runs all 15 colonies to winter twice from the *same* hand-over snapshots — the round's tree and the previous round's tree (git archive of the commit the ledger names) — and reports sums and medians (workers at winter, eclosions, larvae starved, brood lost by cause, P and C intake, trip success, deaths by cause) and the count of colonies better / worse / equal on workers at winter. A round is a gain only if the paired comparison says so.
- **The fresh sweep is the bar**, as before, and is compared with the previous fresh sweep only through the bar's own counts.
- **Fix the mound-height restore defect first in the next round** (direction 12): until then the paired comparison carries restore noise on both sides equally, which is acceptable, but a long run from a restored hand-over is not the same game as the sweep's.
- From now only this task changes `src/sim`, `src/worldgen` and `src/core` (the other engineers work in the app, audio and documents), so differences between sweeps are this task's.
- A round engineer may use the same paired method on a subset (5 colonies, one per archetype) to accept or reject a fix; a fix that the subset does not support is reverted, as rounds 5 and 6 did.

**14. Ruling R29 — the queen lays what the colony can raise; and year two (Nov 18 07:25 UTC, binding for round 8).**
Round 7 tried two changes on paired runs and reverted both on the evidence (a later winter-reserve gate: its extra eggs become diapausing brood paid from the winter stores; an overdue-pile tending rule: it moved the neglect elsewhere). Its finding: **the shortage is nurses** — a colony of 9–16 has a nurse target of 2 against a demand of 3.6, because the automatic split halves every demand when the sum exceeds the workforce (GDD 02 §6.3) — and eggs laid more than about three game days after an R20 hand-over cannot finish before winter. The bug-shaped losses are largely found; what is left is that the colony carries more brood than it can tend or feed, and loses it as untended, starved, cannibalised and unhygienic brood (and as standing "brood stalled" alerts).
- **R29**: the queen's laying is limited by the colony's capacity to raise brood, as in the animal (her egg rate follows the food the workers bring her and the workers eat surplus eggs before they cost anything). Rule: laying potential is multiplied by a care factor that falls to zero as the brood in care (eggs + larvae + pupae not in diapause, weighted by each stage's care need from GDD 02) reaches what the colony's nurse-capable workforce can tend at the design's own care rates — nurse-capable = the workers the allocation could put on nursing if nursing and queen care came first, not today's halved target — and by a protein factor that already exists. Late-season eggs that cannot finish before winter are not laid (the developmental budget at the brood chamber's temperature forecast decides it; the reserve gate stays as it is). No change to needs, lifespans or development rates. Record it as a deviation with the GDD 02 passage it replaces.
- Accept it only on the paired comparison (direction 13) over all 15 hand-overs: fewer brood deaths (untended, starved, cannibalised, hygiene), eclosions not lower, workers at winter not lower, P intake/need higher (the need falls), fewer hours with a `brood-stalled` or food warning standing. If eclosions fall, the care rate or the forecast is wrong: show which.
- **Year two is unmeasured since round 4.** Sweep 6 ran no long runs. The independent engineer must run the five long runs of direction 6 with every sweep; the round-8 engineer runs two long runs (one colony that grew, one that held) before choosing what else to fix, and reports for each: workers at the first tick of spring, the day of the first year-two egg and of the first year-two eclosion, royal chamber temperature on spring days 1–9 against a founding chamber of the same depth on the same days of year one (the integrator's lead at the top of Round 5 is still unanswered), ages of the workers alive at year-two day 10, and workers at year-two day 15. R22's year-two checks decide whether the game has a second year at all.

- **Small seam for round 8 (found by the interface engineer, 07:12 UTC)**: the `winter-coming` alert passes x = 28 when the stores exceed the winter, so the text reads "stores cover 28 of 7 days" (`src/content/text/alerts.ts:37` is the template; the number comes from the sim). Pass days of cover clamped to the length of the winter plus a flag "more than the winter", or the two numbers the template needs; test beside the alert.

**15. Ruling R30 — worker lifespans (replaces R11); R31 — queen care in a small colony; the winter lapse regressed (Nov 18 08:30 UTC, binding from round 8).**
Evidence the integrator read after sweep 7 (4 of 15 viable, 13 runs identical to sweep 6) and three of the five year-two long runs on the round-7 tree (`test-output/colony-life/round-7/sweep-long/`, table `longrun-table.md`):
- Old age is 64 of 95 adult deaths **in a first year that lasts 12 game days after the hand-over**. A first worker (lifespan 24 ± 10 gd, clamp 10) that forages ages 3 per game day outside: it lives 4–11 game days. No rule about food can make a colony hold its count when its founders die of age inside one season; R11 ("fix it by feeding the brood") was wrong and is withdrawn.
- Year two cannot exist under these numbers: the queen's chamber reaches 14 °C on about spring day 6 (lay potential 0 before that, as in the animal), the first year-two workers eclose on about day 11–13, and every overwintered worker is dead of age by day 3–10 (long runs: 4, 2 and 1 workers on day 15; in round 5: 3, 2, 4, 4, 3). The animal's workers live one to two years and the workers that overwinter raise the first spring brood.
- The times-3 ageing outside stands in for the dangers of foraging. Those dangers are now simulated one by one (predation with the R25 ramp, drowning, heat, cold, crushing, getting lost), so the multiplier counts them twice, and it is the one danger that is not ramped for a small colony.
- **R30** (reference species; `src/sim/species/data/lasius-niger.ts`, `src/sim/balance/colony.ts`): worker lifespan mean 33 → 42 gd (1.5 of the 28-day years), sd 10 → 8; `lifespanBySize` [[100, 33], [250, 24]] → [[100, 42], [250, 30]]; first workers (`NANITIC_LIFESPAN_MEAN_GD`) 24 → 34, sd 10 → 8; `LIFESPAN_CLAMP_GD` lower bound 10 → 16; `ageRateOutside` 3.0 → 1.5; `ageRateDormant` 0.15 unchanged; `DIAG_MORTALITY_REF_LIFESPAN_GD` re-derived by measurement. Queens, gynes and males unchanged. The other three species' worker castes get `ageRateOutside` 1.5 and lifespans × 1.27 in their data files (their modules belong to another engineer: data only, say so in the ledger). Update the tests that pin the old numbers with the reasoning, record the deviation with the GDD 02 §1.3 / §15 passages it replaces (`docs/design/gdd/DEVIATIONS.md`), and re-derive GDD 02 §15's growth line (realised lifespan, the mature plateau against `WORKER_CAP`) in the ledger.
- Measure R30 and R29 as separate arms of the paired comparison on all 15 hand-overs (base, R29, R30, both), and on two long runs each for base and both. What must show: old-age deaths in year one fall to a small share; workers at winter ≥ first workers in most colonies; overwintered workers alive on year-two day 12; R22's year-two checks. If the colony now outgrows its food before winter, that is the next cause, with numbers. Do not tune the numbers to pass a bar; if they do not give a second year, report the arithmetic and the integrator rules again.
- **R31** (GDD 02 §6.2 deviation, to accept only on paired evidence): queen-care demand is 1 while the colony has fewer than 20 workers (the design's flat 2 below 100 takes 0.11–0.17 of a 10-worker colony's task time while nursing gets 0.04–0.18 and 59 eggs and pupae died untended in sweep 7); and in §6.3's first pass nursing is served in full before any task gets a second ant.
- **The winter lapse regressed since round 5** on the same three colonies: car-park-verge #1 17 → 6 (8 drowned **inside the lapse**, round 5: 17 → 15), suburban-garden #2 11 → 6 (3 starved and the queen starved, round 5: 12 → 11, stores at winter 1.3 C against 7.6), woodland-edge #2 8 → 5 (round 5: 8 → 8). R24 allows 15 %. Find which change of rounds 6–7 (WL3, the larder, the P1d payment, F1's flood readers may matter for the drowning) caused each, by the paired method on the winter-start snapshots; a flood that drowns a dormant cluster during a lapse the player cannot act in is against R24 unless they were alerted before choosing.
- From the interface engineer (`docs/design/tasks/progress/app-seams-2-impl.md`, 07:50–08:20): in the browser's first-play script on seed 2 the real founding fails in about 3 of 4 runs — all 6 eggs are lost at lapse progress 0.028 on a site whose read-out says "Poor / shaded", the relay clutch is lost the same way, and the opening ends `no-workers`; in the run that got workers, no forager laid a trail within 18 000 ticks. The outcome differs between runs of the same seed because the script's real-time waits change when the queen stops digging. Reproduce it without a browser (found at the start pose, as the script does), and say whether a first-time player who digs where the game puts them should get a "Poor" site at all (the start-pose rule of worldgen) and why every egg dies at 2.8 %.

**16. R29 amended: no "finish before winter" rule; arms of the comparison; protein is next (Nov 18 10:05 UTC, binding from the rest of round 8).**
The integrator stopped round 8's second engineer at 10:00 UTC on reading the 09:30–09:37 ledger entries (subset table `test-output/colony-life/round-8/paired/subset-table.txt`); the ledger's Round 8 section says what is in the tree and what the frozen arms are. The paired job runner was stopped too (runs in flight were left to finish; `done.txt`): **write a new job list, do not re-run `jobs3.txt` as it is.**
- **The finish clause of R29 is withdrawn** (the integrator's own wording in direction 14 was wrong). It is a knife edge (0.06 DU short of 3.9 → no egg at the peak of summer: sg #2 and kd #2 lay nothing after the hand-over) and it is wrong about the animal: this species overwinters brood as larvae, and those larvae are the first workers of spring — which is the gap year two dies in. Late eggs are to be laid as before round 8 (the existing winter-reserve gate and diapause rules decide), and what the overwintering larvae cost in stores and give in spring is to be measured on the long runs (year-two eclosions by day and by origin: overwintered larva or year-two egg). Remove `finishFactor` from the laying product (keep `chamberTempForecast` only if something else uses it). **R29 is now the care factor alone** ("R29c").
- In the subset the care factor reads 1 while eggs still die untended (cpv #1 r29: 20 eggs, 8 untended, 4 hygiene): so capacity on paper is not care in the nest. Show, for cpv #1 and pp #3, per game hour: nurse-capable, nurse target, ants actually nursing, eggs and pupae past their tending interval, and what the idle or queen-care ants were doing at those moments. R31 belongs to this question.
- **Arms from here** (15 hand-overs, `--renew-nanitics`): `base` (as built), `r30`, `r30+r29c`, `r30+r29c+r31`. Drop the standalone `r29` arm and the old `r29r30` arm (keep their outputs as they are, named). R30 is 5 better of 5 against base on workers at winter in the subset and is settled unless the 15 say otherwise; the question the arms answer is which of R29c and R31 to keep on top of it. Long runs to year-two day 15: `r30` and the best arm, on cpv #1 and we #2 first, then the other three colonies of the integrator's year-two baseline if time allows.
- What the subset already says about the next cause: with brood (base, r30) median P intake is 0.12–0.13 of need, larvae starve and are cannibalised, warnings stand for 220–340 hours a run; without brood (the old r29 arm) P is 0.37–1.0 of need and the colony is "viable" but does not grow. **Protein income, not laying or lifespans, limits growth once R30 holds the workers.** After the arms are running, take direction 10 up again as a ledger per colony over the 15 r30 runs: protein standing within 300 BU by day (R18) → known to the colony → trips sent for it → loads picked up → delivered → eaten by larvae → lost (rot, larder, stolen); the stage with the largest drop is the round's last piece of work or the next round's first. kd #2 (P 0.014 of need) and sg #2 (0.04) are the cases.

**17. Sim-side defects the interface task met in the browser (Nov 18 10:55 UTC; round 9 unless round 8 has time).** From `docs/design/tasks/reviews/app-seams-2.json` ("needsFromOthers") and `app-seams-2-report.md`; each needs a reproduction without a browser, a test, a fix:
- After a real founding on seed 2 (suburban garden, the first-play script), **no forager lays a trail to a sugar spill 22 BU from an open entrance within 18 000 ticks**, even with the player's forage marker on it (checkpoint `test-output/app-seams-2/firstplay-checkpoint.txt` is a save of that game; the script's stand-in is `FIRSTPLAY_STANDIN_TRAIL`). A first-time player sees a colony that ignores food on its doorstep.
- `trophallaxis-give` by a **possessed** worker does not empty her crop (crop 0.379 after the gives; stores C 10.62 → 10.50): the player's own delivery by mouth does nothing.
- `cheat.killAll` takes no cause (the epitaph screen cannot be shown with a real `DeathCause`): add an optional cause.
- `tests/docs/docs-final.test.ts` is red: `docs/design/gdd/DEVIATIONS.md` names `LAY_FINISH_STEP_D28`; whoever removes or renames a constant a deviation names updates the deviation in the same change.

**18. Ruling R32 — the protein need looks ahead to the eggs (Nov 18 11:05 UTC; round 9, or round 8 if its arms are done).** The round-8 ledger (10:53) shows a 100 P carcass known on day 2 and left to decay because the protein need index was 0 until the larvae hatched on day 4: GDD 02 §5.5 computes the need from today's eaters. R32: the protein demand that feeds the need index (and the stores target it is compared with) counts each egg as the larva it becomes, from the moment it is laid, at the larval rate for the days of the stores horizon that fall after its expected hatching at the brood chamber's temperature; nothing else in §5.5 changes, and what is eaten today is unchanged. Deviation record with the §5.5 passage. Paired evidence as always: P delivered, P spoiled in the stores (if looking ahead only fills a larder that rots — 30 % of deliveries spoil already — say so and look at the larder before keeping it), larvae starved, eclosions.

**19. Year two after R30: what the first long runs say, and how far long runs go (Nov 18 11:40 UTC).** r30 + WL4 on cpv #1 and we #2 (`round-8/paired/long-r30-table.txt`): spring with 17 of 19 and 10 of 11 workers (round 7: 6 of 17, 5 of 8), day 15 with **19 and 7 workers** (round 7: 4 and 1). So R30 and WL4 give the colony its second spring. Doubling by day 15 fails (19 against 22, 7 against 16) and the engineer's reading is right: at the royal chamber's 1–15 °C an egg of day 4 has 1.5 of its 3.9 DU by day 13, so **every worker that ecloses before day 15 was an overwintering larva** — 2 and 1 of them here. Consequences:
- The number of larvae a colony takes into winter is now the lever for spring (direction 16 withdrew the rule that stopped late laying; check that the winter-reserve gate and the diapause rules let a colony with stores enter winter with larvae in proportion to its nurses, and report larvae at the last autumn row for every run).
- **Long runs go to the first tick of the second winter** (`UNTIL_DAY=40` from an R20 hand-over; check the day count on one run), in rounds and in sweeps, and report workers on year-two days 15 and 21 and at the second winter, year-two eclosions by day, and stores. R22's second check stays as written (day 15 ≥ 2 × first workers in ≥ 3 of 5) until the integrator has those numbers; do not move it.
- Fix the origin label of `lifeEclosions` (brood ids through the lapse) before the next long runs.

**20. Round 9: order of work (Nov 22 05:30 UTC, binding).** Usage is limited: no exploratory arms beyond what each item needs; one paired arm per change, on the 15 hand-overs, plus the long runs for the final tree only.
1. **The founding a first-time player gets still fails on seed 2.** After FD1 (the queen no longer dries out) the browser's first-play script on the default seed again ended `failed`: 6 eggs lost at 2.8 % of the lapse, then the relay clutch (`docs/design/tasks/progress/look-pass-4-impl.md`, 05:11 Nov 22; `test-output/look4/firstplay.log`). Round 8's second engineer showed the site's own hazard cannot do that (Poor: ~0.6 survival per egg over the lapse). Reproduce without a browser exactly as the script founds (dig at the start pose, seal, lay), find what kills six eggs at once at the start of the lapse, fix it, and add a test that founds at the start pose of seeds 1–5 of each Tier 1 archetype and requires first workers in at least 4 of 5 on a Fair-or-better read-out and a stated, designed rate on Poor. Nothing else matters to a player who cannot get past the opening.
2. Fresh-sweep findings of sweep 8 marked blocker or major.
3. **R32** (direction 18) with the larder question (30 % of delivered protein spoils).
4. **Known carrion against hunting** (round 8, 10:28): the forager's choice values a hunting trip at one catch per 40 s in the patch; measured after HB1? Re-measure the catch rate on the HB1 tree, set the valuation from the measurement, and let known carrion and known liquid protein win when they are worth more per trip.
5. **The single-nurse gap** (untended 49–76 eggs and pupae of ~250 in every arm; round 8, 10:28): the design's rates give one nurse for a founding-year brood and she cannot be at two piles, carry, feed and rest. Candidates, each a GDD 02 §6 deviation to be shown on pairs: a nurse floor of 2 while brood exists and the colony has ≥ 6 workers; attendants standing in a chamber with overdue brood tend it; brood kept in one pile per stage in the queen's chamber while the colony is under 20 workers. Also explain R29c's hygiene deaths (2 → 15) and the red test left at 05:23 Nov 22 (a laying factor of 0.92 raising the day's larval C).
6. Direction 17's defects (no trail to sugar 22 BU from the door; a possessed worker's mouth-to-mouth gift; `cheat.killAll` cause).
7. Larvae taken into winter (direction 19) and the spring: only after 1–5.

**21. The yearly production budget does not close; rulings R32b, R33, R34 (Nov 22 06:30 UTC, binding; goes before items 3–7 of direction 20; item 1 of direction 20 stays first).** The integrator read the five final-tree runs to the second winter day by day (`round-8/long-final/*.json`). The four colonies that kept their queen:

| | cpv #1 | kd #3 | pp #3 | we #2 |
|---|---|---|---|---|
| eggs laid in all of year two | 16 | 12 | 25 | 18 |
| eclosions in year two | 5 | 1 | 3 | 3 |
| workers that died in year two (after the lapse) | 8 | 8 | 10 | 7 |
| brood lost untended (eggs + pupae) | 5 | 8 | 15 | 8 |
| stores C at the second winter (loads) | 26 | 9 | 0 | 41 |

A colony of 12 loses about 8 workers a year to age (R30 lifespans against ~28 gd of ageing a year: as designed). To hold level it needs 8 eclosions a year, to double about 20. It gets 3. Rounds 1–8 measured brood losses and trips; nobody had put the year's eggs beside the year's deaths. Two causes account for nearly all of it, and both are rules, not luck:

- **A lock on laying.** The laying potential is 23–34 eggs a day on the warm days (doy 8–15) and the queen lays 0–8, 18 in the year. The release gate (`colony/queen.ts layingReleaseShare`) lets her lay only while protein in store plus half a day of intake covers `LARVA_P_REQ` (1.2 loads) for every egg and larva already there: with the 1–3 loads these colonies hold, that is 1–2 brood at a time. And the colony does not go for more protein, because its protein need rate counts larvae that exist (`NEED_RATE_P_MIN` 0.05 with no larvae: the protein stock target is then 0.075 loads and the diet share ~5 %), so the foragers spend the year on carbohydrate and herds (task time cpv #1: forage 94, tend 67, queen-care 61, store 59, haul 56, nurse 36 worker-gd; C in store 26–46 loads unused; protein intake 0.38–0.64 of even that small need). Few larvae → little protein wanted → little protein in store → few eggs released. R32 as written in direction 18 (count an egg as a larva) does not break this, because the eggs themselves are what is withheld.
- **Neglect kills half the eggs.** 36 of the 71 eggs laid in year two by these four died "untended" as eggs or pupae; `UNTENDED_GD` is 0.25 (a quarter of a day without a visit kills). Base mortality took 14, hygiene 5, starvation 1.

**R32b (replaces R32).** The colony forages for the brood its queen could have, not only the brood it has. Add a *prospective* protein demand = `LARVA_P_REQ` × the laying the gates withhold (potential with the care, temperature, season, size and health factors, less what is released), in loads per gd, capped so that it never asks for more than the nurses could raise (the care factor already does this) and 0 outside the laying season. It enters: the desired protein share of the diet, the protein need index the forager's choice and the hunt/carrion valuation read, the scouts' interest in protein, and the protein stock target (so a store of 2 loads is not "full"). It does **not** enter `daysOfStock().p` as the laying-permission gates read it (that would shut laying by itself) nor the starvation stage. With it, `LAYING_SUPPLY_HORIZON_GD` goes 0.5 → 1.5 (an egg needs no protein for its 1.4 DU; intake over that time counts). Carbohydrate comes first only while C in store is under the adults' need for the days of stock target (a colony with 26 loads of C and no protein must send its foragers to protein). Measure on the 15 hand-overs (one arm) and say what share of protein that arrived within 300 BU was brought home before and after; if the world's supply is then the limit (delivered ≥ 60 % of what arrived and the colony still short), report the number — the supply rate is the integrator's to change, `LARVA_P_REQ` too.

**R33.** `UNTENDED_GD` 0.25 → 1.0 (an egg or a pupa dies of neglect after a full day without a visit, not six hours; the tend job is still raised at the present age, `balance/nestwork.ts`), and while any egg or pupa is overdue no worker in the nest stays idle, waiting (`forage.wait`) or resting unless exhausted: the nearest such worker takes the tend job whatever its task. This replaces the candidates of direction 20 item 5 (a nurse floor may be added if the pair still shows > 5 % of eggs lost untended). One arm on the 15 hand-overs.

**R34 (amends R22's second check).** No worker can eclose before year-two day 10 without overwintered larvae (first eclosions doy 10–14 in every run), so "≥ 2 × first workers by day 15" tested the wrong day. The year-two check is now: workers at the first tick of the second winter ≥ 1.0 × workers at the first winter in ≥ 4 of 5 long runs, and ≥ 1.5 × in ≥ 3 of 5. The spring check (≥ 0.7 × winter workers in ≥ 4 of 5) stays. `longrun-table.py` reports both.

**Order for round 9:** direction 20 item 1 (founding in the browser on the default seed; add to it that the same script on seed 1 failed later, "the first workers did not reopen the entrance and walk out [reopening:116]", `test-output/look4/firstplay-s1`, look-pass-4 progress 05:30 Nov 22 — the test over seeds 1–5 must run through the hand-over to the first worker outside); then sweep 8's blocker/major findings; then R32b; then R33; then the five long runs of the final tree against R34; then, only if time remains, direction 20 items 4, 6, 7. Item 3's larder question and item 5's hygiene question become notes if the arms do not need them. Also from sweep 8's review (if it stands in the sweep's result): `worker:lost` rose in fresh runs (we #1 3, pp #1 6), F1's cost (`readersCost.verify.test.ts` red: 30 spill builds where the throttle allowed 7), and `DIAG_MORTALITY_REF_LIFESPAN_GD` still 26 under R30.

**21a (Nov 22 07:35 UTC).** Sweep 8's first numbers (`round-8/sweep-table.md`, `progress/colony-life-sweep-8.md`): viable 9 of 15 (sweep 7: 4), workers at winter 194 (138), old age 1 (64), starved 1 (13); still failing: protein 0.269, trips 45.9 %, lost 10. Two of its probes belong with direction 20 item 1, because they are the same defects the browser met: (a) sg #3 made 0 trips all year because the hand-over reopen left 29 plug voxels in the throat while the entrance reads `open` — the red `founding/reopen.test` and very likely the seed-1 browser failure ("first workers did not reopen the entrance and walk out"); fix the reopen so the throat is passable before the entrance is called open, and make that test green. (b) pp #1's six lost foragers all stop at one point 82.5 BU from the entrance in `forage.return` home-mode 2 and jitter until `RETURN_LOST_S`: a homeward trap; fix the cause (not the timer), with the probe's point as the regression case.

**21b (Nov 22 07:50 UTC; what the browser saw, for direction 20 item 1).** look-pass-4's report: on the default seed 2 the first-play script's pictures 09 and 10 show the alert "Founding chamber flooding… 26 %" in rain just before the six eggs are lost — while the site read-out at that spot says **Flood safety ●●●●● Raised** (`test-output/look4/item2e/fp-until05/05-site-readout.png`; site Poor, Q 0.65, warmth 0 of 5). So either the read-out's flood factor is wrong for that ground, or a sealed founding cell takes water it should not (wxfix2's rule: a sealed founding cell gets seepage only), or the lapse applies rain differently from live play. Reproduce headless with the script's own dig (start pose, seed 2, the script's depth), say which of the three it is, fix it, and make the read-out and the outcome agree. Other sim-side findings from that task, for the direction 17 list: `lay-egg:budget` refuses the queen's egg after a cheat-completed founding (stage1a strict; the app engineer is deciding whether script or cheat is at fault), and `harvest-liquid` keeps running with a full crop after a tapped drink (controls.mjs).

## Machine rules
4 cores shared with other engineers and a headless browser. At most 2 life runs at a time; never the whole vitest suite in one process; long tests behind `FOUNDRESS_LONG=1`; no `process` in test files (no `@types/node`); delete probe files and scratch copies of the tree before you finish; `date -u` before writing a timestamp. Evidence under `test-output/colony-life/round-N/`.

## Direction 22 (integrator, Nov 22 11:41 UTC) — R35: the prospective protein demand may not cost the colony its carbohydrate

Round 9's long runs (ledger 11:08) show what R32b as I worded it does: R34 improved from 0 of 5 to 2 of 5 at
>= 1.0 x, and the two colonies it loses (pp #3, sg #2) go into winter 1 with protein in store and no carbohydrate
(C 2.6 / P 12.2 and C 0.6 / P 3.5 mg; sweep 8 on the same hand-overs: 14.1 / 2.7 and 6.3 / 4.2). The ruling's own
terms cause it, so they are mine to change:

- **Size.** The prospective rate is `LARVA_P_REQ` x withheld laying = 19-36 loads/gd at a lay potential of 16-30,
  against a carbohydrate rate near 0.6. In `desiredProteinShare` that is sP >= 0.97, and in `nutrientWeights`
  wC = base + needC x (1 - sP) x gain: a colony with no sugar at all values sugar at the base weight.
- **Gate.** "Carbohydrate first while C is under the stock target" is a switch at 1 x the target: the colony sits
  just over it (0.7-1.7 mg) all summer.
- **Spoilage.** GDD 02 §5.5 counts the store's spoilage in `rateP`. A 13 mg protein store therefore asks for more
  protein by itself, in autumn too (lay potential 0, no prospective demand): sP near 0.5, prey 16 of 20 deliveries on
  day 8 while C stands at 1.6-3.9 mg against a winter need of 6-11.

### R35 (amends R32b; GDD 02 §5.5 deviation rows)

1. **Bounded by the workforce.** Prospective rate <= `PROSPECTIVE_P_PER_WORKER` (0.5 loads/gd, balance) x workers.
2. **Carbohydrate sufficiency is a ramp, and it looks at the winter.** The prospective rate is multiplied by
   `clamp(daysC / targetDays.c - 1, 0, 1)` (daysC = C in store over the plain C rate; nothing at 1 x the stock target,
   all of it at 2 x), and it is 0 while C in store is under the path to the winter need:
   `stores.c < winterStoresNeed(sim, col).needC x WINTER_STORES_TARGET_MARGIN x clamp((doy - 7) / 14, 0, 1)`
   (nothing asked in spring, half the winter need by doy 14, all of it by doy 21). This replaces R32b's
   "C in store < adults' need x target days" switch.
3. **A colony short of sugar values sugar whatever its protein demand.** `nutrientWeights`:
   `wC = base + needC x max(1 - sP, needC) x gain` (wP unchanged). At needC 1 the carbohydrate weight is
   base + gain for any sP.
4. **Spoilage is not appetite on the forage side.** `forageRates().p` = the plain protein rate without the store's
   spoilage term (its own EMA of queenP + egg cost + larvaP, floored at `NEED_RATE_P_MIN`) + the prospective rate.
   `needRates` / `daysOfStock` / the laying gates / the starvation stage keep the GDD's rate with spoilage. With no
   larvae and no laying season the forage side's protein rate is then the floor and a stocked larder reads needP 0.
5. **Tenders.** On the same state, the tend head-count with and without the prospective term must be equal (test).
   pp #3 had no aphid tender all year against 2-4 in sweep 8: trace why (tend demand is `herdTendDemand`, not a
   function of sP, so either the herds were never found - `scoutShortfall` and what scouts look for - or the
   allocator's fill order starved the tend demand) and fix that cause. Report it by name.
6. **One arm, the five long runs** (same hand-overs as `round-9/long`; pp #3 and sg #2 first), against R34 and the
   spring check. No new arm on the 15: the long runs pass through winter 1. Report per run: C and P in store at
   winter 1, tenders by day, year-two eggs / eclosed, and the year-two brood losses by cause (the best run turns
   30 eggs into 15 workers: say where the other half goes, do not fix it in this round).

If this round's engineer has not returned yet: do R35 in this round, before closing it, so that sweep 9 judges a
tree with it. If the round has closed, it is the first item of the next.

## Direction 23 (integrator, Nov 22 13:25 UTC) — sweep 9 read; round 10's order; R36, R37

Sweep 9 (`test-output/colony-life/round-9/sweep-table.md`, `reviews/colony-life-sweep-9.json`), fresh foundings on the
round-9 tree (no R35): viable **9 of 15** (we 1/3, sg 2/3, pp 2/3, cpv 3/3, kd 1/3; bar 2 of 3 each: not met), workers
held 12 of 15, eclosions median 6 (sum 60 -> 100), protein intake / need 0.478 (bar 0.7), carbohydrate 1.109, trip
success **56.8 %** (bar 50: met), first workers >= 9 in 14, no-lost 13 of 15 (lost 10 -> 5), untended brood 80 -> 6.
Long runs: spring check 4 of 5 (met), R34 3 of 5 at >= 1.0 x (bar 4), 0 of 5 at >= 1.5 x (bar 3). Worse than sweep 8:
predation 14 -> 41, brood hygiene 9 -> 41, exposure 6 -> 25.

The six that are not viable: four hold protein and lack carbohydrate at winter (we #1 C 3.2 / P 9.0, we #3 5.2 / 5.8,
sg #3 0 / 7.0, pp #3 1.5 / 8.0) = the R35 case; two kitchen-door colonies starve of protein with the larder full of
sugar (kd #1 P intake 0.125, kd #2 0.025). With both mended the bar is in reach, so they come first.

### Round 10, in this order

1. **R35** as direction 22 rules it (all six points; the five long runs, pp #3 and sg #2 first, plus the four
   colonies above to winter on sweep 9's hand-overs, cached, base vs R35).
2. **Protein at the kitchen door (R36).** Measure on kd #1 and kd #2 (sweep 9's hand-overs): protein loads that
   arrive within 300 BU of the entrance per game day, by source kind, and how much of it the colony ever knows.
   - If under 1.5 loads/gd arrive (the outdoor archetypes' figure in the round-8 ledger is about 2.9): the world is
     short. R36: the kitchen-door flows (`src/sim/ecology`, not worldgen placement) are raised so that the median
     over kd seeds 1-3 matches the outdoor archetypes' median within 300 BU; sources that fit the place (dead flies
     under the window and at the door, moths at the light, kibble at a pet bowl where the world has one, the crumbs'
     own protein share). Record as a GDD 05 deviation row.
   - If it arrives and is not found or not taken: say which, and fix that (it is then item 5's question on a small
     map).
3. **Predation (R37).** Sweep 9: median 2 predation deaths per founding-year colony (R25's target: <= 1), 0.050 per
   outside worker-gd, 6 deaths in one day at 10 workers (sg #2 day 6). The run files do not say who kills. First add
   the killer's kind, whether it is a resident or a colony-range hunter, and the distance from the entrance to the
   death records (diagnostics, additive), and read sg #2, pp #2, pp #3. Then:
   - if residents in their own territories do it: R37 = the colony remembers the place. A worker attacked or killed
     by a resident marks the spot (the existing avoid marker / `knownHazardsNear`, radius = that creature's attack
     reach + 10 BU, 3 gd); foragers, hunters and scouts do not path through or choose targets inside a marked spot
     (steering reads `knownHazardsNear`, which nothing reads today), and a hunter breaks off a chase that enters one.
   - if colony-range hunters do it at a ramp near 0: that is a defect of the ramp; fix it.
   Bar: median <= 1 predation death per colony over the 15 paired runs to winter, and no colony loses more than a
   quarter of its workers to predation in one game day.
4. **Sweep-9 defects, small:** SG3 reads a long open shaft as sealed (`sealLongShaft.verify` red: treat the flood's
   radius cut like its sample cap: a leak is not ruled out); R33's draft hands a pile to a worker who cannot nurse
   (`tendDraft.verify` red: `draftable` checks nurse eligibility); `startPose.long.test.ts` must fail when a seal fix
   is reverted (per archetype >= 4 of 5 start poses hand over with a worker out, whatever the site grade; direction
   20.1's bar); the new `Math.hypot` in `sealGuide.ts backTick` (and the file's others) replaced per the purity rule.
5. **Where the eggs are not laid - measurement, no fix unless it is a defect.** On the five long runs after R35, for
   each warm day (lay potential > 0): the released share and which gate held it (stage, days of protein stock,
   larval hunger, larvae per nurse, winter reserve, release share's brood-need term), as game days per gate; and for
   every protein load that arrives within 300 BU: found or not, time from arrival to discovery, taken or lost
   (spoiled, taken by others, expired), nearest approach of any worker if never found. One table per colony. I rule
   on scouting and on the gates from that table; do not tune either.
6. **If time, measurement only:** brood hygiene deaths on cpv #1 (19 in year one, 7 eggs in one day in a
   one-chamber nest: what makes the chamber dirty, who should have cleaned) and exposure deaths (where the brood
   lay); year-two flooded eggs on we #2 and kd #3.

Budget: one arm per change; items 1-4 are the round. Close with the 15 paired runs to winter (sweep 9's hand-overs,
base = HEAD at the round's start, final = live) and the five long runs of the final tree against R34.

## Direction 23a (integrator, Nov 22 13:44 UTC) — item 5's table also covers the herds and the ground the colony sees

Your 13:34 trace is accepted: the tenders were not starved, the herds were never found (0 of 45 known after 48 h; one
herd within 300 BU, found only inside its 6 BU odour), and the allocator's fill order is a second, latent cause.
"The prospective part of the forage demand is filled last" is the right reading of R35 point 5: do that.

For item 5 (measurement, no rule change this round), add to the table per colony:
- every aphid herd within 300 BU of the entrance: found or not, hour found, by a worker on which task, nearest
  approach of any worker if never found, the herd's size and height above the ground;
- coverage: the share of the ground within 300 BU that came within 6 BU and within 30 BU of any outside worker, per
  game day, for the first 5 gd after the hand-over, and the scouts' head-count on those days;
- the perception radii in force for each food kind (herd odour, carrion, prey, crumbs, nectar), from the code.
I rule on the radii, on honeydew sign under a herd's plant and on the scouts' pattern from those numbers.

## Direction 24 (integrator, Nov 22 14:49 UTC) — R38: the colony finds and takes the protein that is already there

Read from your tables (`round-10/item5.py arm-r35`, ledger 13:58-14:42). Accepted as measured:
- R36's condition is not met: the kitchen door is not short of protein arriving (kd median 0.96 loads/gd against the
  outdoor 0.40). No flow is raised.
- R37: 20 of 20 recorded predation deaths are colony-range hunters at ramp 0-0.3. The strike-share fix stands; the
  resident-memory rule is not built and is not wanted now.
- LV1 (a liquid trip valued by what the source will hold on arrival) stands.
- Laying gates: after day 1 the gates that hold are protein's (days of protein stock, larval hunger, stage) and the
  winter reserve. No gate is changed this round: a colony at 0.2-0.5 of its protein need should not lay more. I read
  the gates again once R38 is measured.

What the tables say about discovery: a scout covers about 10 % of the 300 BU disc a day at 6 BU (she walks all day:
the bound is the day's length, not her pattern), the scouts' head-count falls from 1.4 to 0.02-0.1 by day 3-5 because
the allocator fills `forage` and `tend` before `scout` and the small-colony floor counts known sources of any
nutrient, small carrion is found 0-3 times in 7-11, entered prey patches are never learnt, and a found large carcass
gives up 3 % of its protein. So, in this order (R38, GDD deviations to record: 02 §6.2-6.3, 05 §1.1-1.2, 05 §2.3):

1. **Scouts for a missing nutrient.** A nutrient is *missing* while the colony needs it (need index > 0) and its
   known capacity covers under half of its forage want (`scoutShortfall`'s own `short()` term >= 0.5). While any
   nutrient is missing: scout demand >= max(`SCOUTS_MISSING_MIN` 2 (1 below 8 workers), `SCOUT_MISSING_FRAC` 0.2 x
   workers), capped at 0.25 x workers (`SCOUT_MAX_FRAC` stays 0.15 otherwise), and `autoTargets` fills that floor
   directly after `nurse` and `queen-care`, before `forage`. `smallColonyFloor`'s known-sources test counts only
   sources that carry a nutrient the colony needs, per nutrient. Tests: 15 workers, sugar known, no protein known,
   needP > 0 -> 3 scouts in the targets; everything known -> the present base; 6 workers -> 1.
2. **A herd's sign grows with the herd.** Plan-distance radius `clamp(6 + 2 x sqrt(aphids), 6, 24)` BU (7 aphids 11,
   14 -> 13.5, 64 -> 22: honeydew falls under the whole colony of aphids, not at a point), and any outside worker of
   the colony discovers it, on a trip or not. Test on `discoverHerdsNear`.
3. **Prey patches are learnt.** First say why kd #1's and kd #2's entered patches stayed unknown (task of the worker
   inside, time inside, spawn rolls, notices, what "known" needs today). If that is a defect, fix it. Then the rule:
   a patch becomes known to the colony the first time one of its workers notices or catches prey in it, whatever her
   trip's target; and a scout or forager who has walked `PATCH_NOTICE_S` 5 s inside a patch holding >= 0.2 of its
   capacity learns it without a spawn roll (litter alive with springtails is seen when walked on). A known patch is
   reported at home and chosen like any protein source. The spawn rule itself (who makes prey appear) is unchanged.
4. **Torn carrion is worth carrying.** A torn piece of any carrion carries >= 0.75 P per load of carry capacity (the
   density of `insect-medium`, which the colonies do bring home: 5.8 of 6 P); total P per carcass unchanged. Smallest
   change that does it (`insect-large` unitBulk 40 -> 20, `large-carcass` 500 -> 150, or a piece rule): your choice,
   say which and what else reads unitBulk. And trace why trips to a found large insect (pp #3: 0.56 of 15 P home) and
   to the large carcass (kd #1: 27 trips on one day, 3.2 of 120 P home) ended with food left: a known source with
   food left, while the colony is short of that nutrient, draws trips until it is empty or gone. Fix the cause.
5. **kd #2's medium carcass passed at 1.8 BU.** Trace it. If carrion (or crumbs) lands where no walkable route
   leads (a sill, a table top with no climb, inside a closed prim), fix the drop rule in `src/sim/ecology` so indoor
   and outdoor flows land on ground a worker can reach from the entrance, and give the share of kitchen-door
   arrivals out of reach before and after. If she was simply on a trip that does not perceive (laden, homing), say
   so: a homing or laden worker that smells food still reports it.
6. **One arm:** the R38 tree against `arm-final` (R35 + R37 + LV1) on all 15 sweep-9 hand-overs to winter. Per colony:
   P intake / need, found share and P home by kind, scouts' head-count by day, outside deaths by cause (scouts' cost:
   predation, old age, lost), workers at winter, viable. Long runs are not repeated on the R38 tree (the sweep runs
   them). Bars to read against: P intake / need median >= 0.7, kitchen-door viable >= 2 of 3, no archetype worse
   than in `arm-final`.

Round 10 closes after item 6. If you do not have the room for R38, close without it and put "R38 NOT BUILT" as the
first words of the round result's notes for the integrator: I then hold the sweep and give R38 to round 11.

## Direction 24a (integrator, Nov 22 15:51 UTC) — R37b: a hunter that has eaten does not hunt

Your 15:07 reading is accepted: scaling each strike's landing barely slows a hunter that stands at a herd and
strikes again after every miss (pp #3: 8 predation deaths, 6 of them tenders at the one herd). The cause under it:
a spider feeds for `FEED_S` 120 s and hunts again, so one spider can take five workers in a 600 s game day. No
spider eats five ants a day. R37b, added to direction 24 as item 0 (build it first, it is small):

- **Satiation.** After a kill a predator feeds (`FEED_S` as now) and is then *sated*: it takes no victim (ant of any
  colony, the possessed ant included) for `SATED_GD`: spiders (jumping, wolf, ant-spider) 1.0 gd, centipede and rove
  beetle 0.5 gd. Sated, it keeps its other behaviour (rests at home, flees, defends itself when attacked). Antlion,
  bird and anything whose rule is not "hunt, kill, feed" are unchanged. Balance constants; save field additive.
  Test: a spider with a line of workers walking past takes one in a game day, the next no sooner than `SATED_GD`
  after the feed ends.
- **The ramp applies to the hunt, not only the strike.** Keep `colonyRangeStrikeShare` and also draw it once when a
  colony-range hunter would take a player worker as its victim (`findVictim`): on a refusal that hunter ignores
  that colony's workers for 0.25 gd. One draw per acquisition, creatures stream.
- Bar as R37: median <= 1 predation death per colony over the 15 runs to winter, no colony loses more than a quarter
  of its workers to predation in one game day. Measured in direction 24's one arm (item 6), no arm of its own.

## Direction 25 (integrator, Nov 22 16:28 UTC) — round 11: R35b, then R38, one arm; no sweep ran after round 10

Round 10 closed at 16:04 with "R38 NOT BUILT"; I stopped the sweep that followed it (six of its runs exist under
`round-10/sweep/`, tree 465af0d7 = R35 + R37 + R37b + LV1 + item 4; they are not a sweep and are not a base). Your
base is `round-10/arm-final` (the 15 sweep-9 hand-overs on tree 880fe1af: R35 + R37 + LV1 + item 4, no R37b) and
`round-10/long-final`. The live tree = that + R37b (unit-tested, unmeasured). Round 10's closing table is accepted:
workers at winter 208 -> 222, viable 9 -> 10, predation 41 -> 22 (R37's bar met), but **median P intake 0.478 ->
0.298, larvae starved 1 -> 16, hunting trips 1167 -> 783, R34 >= 1.0 x 3 -> 1 of 5**. R35 bought carbohydrate with
protein. Order:

1. **R35b: a nutrient at full need gets its full weight, both ways.** R35 point 3 gave carbohydrate
   `wC = base + needC x max(1 - sP, needC) x gain` and left `wP = base + needP x sP x gain`: with the prospective
   term capped, sP is small in a small colony (its protein rate is a fraction of its carbohydrate rate), so a colony
   starving of protein weighs protein at 0.2 + sP x 2, under carbohydrate at any need. Make it symmetric:
   `wP = base + needP x max(sP, needP) x gain`. Test beside R35's (needP 1 at sP 0.1 -> full weight; needP 0 -> base;
   both needs 1 -> equal weights). **Its own small arm:** the four colonies of `arm-final` whose P intake fell most
   against sweep 9 (we #2 and we #1 among them), to winter, live tree (R37b + R35b) against `arm-final`. Read protein
   (P intake / need, hunting trips, larvae starved) as R35b's and predation as R37b's; carbohydrate must not fall
   under 1.0 of need in a colony where it was over. If C falls so, stop and write the numbers: I rule.
2. **R38 in full** (direction 24, items 1-5, in its order; R37b is item 0 and is built).
3. **One arm:** the tree with R35b + R37b + R38 against `arm-final` on all 15 to winter (direction 24 item 6's
   read-outs, plus R37's bar). No long runs in the round: the sweep runs them.
4. **If there is room, measurement first:** brood hygiene deaths (kd #3 long: 19 of 32 year-two eggs; we #2: 9 eggs in
   year one): what dirties the chamber, which task should have cleaned it and why it did not. Fix only a defect.

Laying gates stay as they are this round. **Re-read the tail of this file and of your ledger section each time an
arm finishes and before you close**: round 10 saw directions 24 and 24a an hour late.

## Direction 26 (integrator, Nov 22 18:35 UTC) — round 12: R39 sugar labour follows the carbohydrate need; brood hygiene; the scout floor's order

Written while sweep 11 runs (its findings may add a direction 26a: read the tail). Round 11's arm is accepted:
viable 10 -> 13, kitchen door 3 of 3, predation 22 -> 0 (R37 / R37b closed), median P intake / need 0.298 -> 0.329
(bar 0.7 not met), brood hygiene 31 -> 60. R35b stays (neutral). Rulings on your four questions: (1) scouts after
the hygiene haul when brood lies among waste: accepted; (2) see item 3 below; (3) and (4) accepted as built.
Your base is `round-11/arm-final11` (tree 4c9d17a9) and sweep 11's long runs.

**Evidence for R39 (my read of `round-11/arm-final11`, funnel `taskTimeGd`, `tripsByNutrient`, day states):**

| run | workers | forage % | tend % | wait % | C / need | P / need | C stores / winter need, day 4, 8, last | tend trips (ok) | hunts |
|---|---|---|---|---|---|---|---|---|---|
| cpv #1 | 16 | 22 | 16 | 21 | 1.61 | 0.25 | 14/13, 20/11, 19/4 | 44 (14) | 43 |
| cpv #2 | 11 | 12 | 24 | 22 | 1.61 | 0.22 | 9/10, 11/5, 12/3 | 28 (8) | 11 |
| cpv #3 | 19 | 23 | 23 | 23 | 1.62 | 0.31 | 15/11, 19/13, 20/7 | 51 (21) | 36 |
| kd #1 | 19 | 22 | 19 | 18 | 1.73 | 0.28 | 15/17, 23/12, 24/5 | 69 (22) | 40 |
| kd #2 | 17 | 10 | 35 | 22 | 1.50 | 0.32 | 9/11, 14/8, 13/4 | 60 (8) | 28 |
| sg #3 | 16 | 18 | 25 | 14 | 1.63 | 0.47 | 2/13, 9/12, 14/6 | 53 (12) | 23 |
| we #1 | 25 | 21 | 18 | 20 | 1.65 | 0.51 | 3/20, 17/17, 19/6 | 53 (26) | 22 |
| kd #3 | 12 | 22 | 15 | 12 | 0.96 | 0.67 | 2/12, 8/9, 6/5 | 26 (6) | 59 |
| pp #3 | 20 | 34 | 15 | 20 | 1.09 | 0.64 | 8/11, 10/13, 7/7 | 46 (11) | 97 |
| we #3 | 17 | 24 | 0 | 15 | 1.42 | 0.82 | 5/13, 3/12, 10/6 | 0 | 74 |

(percentages are shares of worker task time; the other five runs lie between.) Over the 15 runs: 848 patch trips
brought 102 P (0.12 P a trip, 0.21 P a carried springtail), all protein delivered 155 P against a larval demand of
326 P. Travel is 0.24 gd a round trip (cpv #3: 44 gd of travel over 183 trips), so a hunter makes about 3 trips a
game day: a colony's 2-2.5 P / gd needs 3-4 workers that do nothing but hunt. They are there and they tend:
`tend` demand is the sum of the herds' slots (`herdTendDemand`, 2 + floor(A / 25) a herd) whatever the colony
holds, R38 item 2 found five more herds, and the three colonies fed best are the three that hunt most (we #3 with
no herd at all). Seven colonies hold their winter carbohydrate by day 4-8 and go on tending at 15-35 % of their
worker time, at 20-40 % trip success.

1. **R39: tenders are asked for by the carbohydrate the colony wants, not by the slots the herds have.**
   `tend` demand = min(sum of the herds' tender slots, tenders needed), tenders needed = ceil(`TEND_HEADROOM` 1.25
   x wantC / carbohydrate one tender brings a game day), where wantC is the carbohydrate forage want of
   `nutrientShortfalls` (rate + max(0, target x rate - stock) / STOCK_REFILL_GD, so it carries the winter path and
   R35's prospective part exactly as the forage demand does) less what the colony's known non-herd carbohydrate
   sources already count for in `knownCapacity` only if you find that double count in the code; otherwise leave that
   term out. One tender's carbohydrate a day: the herd's production at full tending over its slots (the plants
   module's own numbers; no new constant if one exists). Floor: `TEND_KEEP` 1 tender for each workable herd while
   the surface is workable, so the claim and the herd's tending level are kept (check what `h.tend` and
   `RIVAL_TEND_GUARD` need to hold a herd against a rival: if one tender does not hold it, say what does and use
   that). The player's forage marker multiplier stays on top (a marked herd gets its slots).
   The freed workers must reach `forage`: trace in cpv #3 and kd #2 that the forage demand takes them (it is capped
   at `known.ants + 1`; `PATCH_FORAGERS_MAX` and the patch's catches a day bound a patch's share). If the cap holds
   them idle while protein is short and a known patch still has prey, the cap is the next defect: say so with the
   numbers and raise the patch term to what the patch's prey supports that day (no new rule beyond that).
   Tests: 15 workers, two herds (4 slots), carbohydrate stock over target -> tend demand 2 (the keep), not 4; stock at
   zero with a need -> 4; one herd of 100 aphids and a small want -> the want, not 6.
2. **Why a forager takes a carbohydrate trip at wP / wC of 7 to 1** (cpv #3: forage:C 37 trips, hunts 36, wC 0.2 on
   every day I read). Trace 2 game days of cpv #3's forage choices (candidates, their values, the winner). If the
   patch loses on its per-trip value (0.25 P against a full crop), on its claims, or on distance, report which. Fix
   only what is a defect against the stated rule ("weights decide between nutrients"); if it is the value form
   itself, stop and write the numbers: I rule.
3. **The scout floor's order (sweep 11's `colony/scoutsFirst.verify`, red):** only R38's floor
   (`missingScoutFloor`) is served ahead of `forage`; the rest of the scout demand keeps its place after `tend`.
   6 workers with a missing nutrient: 1 scout ahead of forage, the small-colony rule's second scout in the usual
   order. The verify test goes green.
4. **Brood hygiene (your trace is accepted as the cause):**
   a. The flood hold. Trace what wet place held cpv #2's hauler outside for 58 of 74 hours with the brood chamber
      dry. Rule: the surface hold applies only while the ant's own way to her destination passes a flooded cell; a
      held ant re-plans every `FLEE_RETRY_S` to any dry destination of her task, and a hold never outlasts
      `FLEE_HOLD_MAX_GD` 0.1 without that re-plan finding the way dry or her task being handed back to the allocator
      (she goes `idle` inside or outside and the task's target is refilled). If the trace shows a different defect
      (the wet cell is a puddle on the mound, a stale flood flag), fix that and say so.
   b. The burst. While any brood chamber holds waste over its tolerance, the haul cap is `HAUL_BROOD_MAX_FRAC` 0.4 x
      workers instead of 0.2, and a nurse whose think finds no feeding or moving job in such a chamber carries one
      waste item out of it by the haul primitive (kd / cpv day states show nurses in `nurse.groom` while the chamber
      kills brood). No change to the tolerance or the death rate.
   Tests: 8 meconium items in a brood chamber, 10 workers, one hauler held outside -> the chamber is under tolerance
   within 0.25 gd; a hauler outside with a dry way in is not held.
5. **One arm:** items 1-4 against `round-11/arm-final11` on all 15 to winter. Bars: median P intake / need >= 0.45
   (interim; R19's 0.7 stands), brood hygiene deaths <= 31, viable >= 13 with kitchen door >= 2 of 3, and no colony
   that met R27's winter carbohydrate in the base misses it. If the carbohydrate bar fails, report which colonies and
   their day-by-day stock against target: I rule on `TEND_HEADROOM`, you do not tune it.

Laying gates stay as they are. Re-read the tail of this file and of your ledger section each time an arm or a trace
finishes and before you close.

## Direction 26a (integrator, Nov 22 19:37 UTC) — sweep 11 read; additions to round 12's order

Sweep 11 (ledger "### Independent sweep after round 11", table `round-11/sweep-table.md`): **viability bar met for
the first time, 14 of 15** (we #2 the one failure); R19 6 of 7 (median P 0.353 against 0.7); R22 spring 5 of 5;
R34 2 of 5 at >= 1.0 x and 0 of 5 at >= 1.5 x; predation median 0. It bears out direction 26's R39 (forage 655 -> 516
worker game days, tend 402 -> 520, scout 150 -> 242 against sweep 9). Direction 26 stands; these come first or are
added:

0. **First, the cost trap (sweep finding 1).** `notice.ts noteSmelledFood` -> `sourcesSmelledFrom` makes
   `ecology/sources/lookup.ts` rebuild its whole grid on nearly every tick (behaviours 0.25 -> 0.63-0.70 ms a tick).
   Keep the grid current as sources are added, removed or moved, or give the smell check a query that does not force
   the rebuild; results identical. `outdoor/noticeCost.verify.test.ts` goes green; report the behaviours system's
   median ms a tick on kd #1 before and after (bar: <= 0.30).
1. **A scout that smells food and does not investigate reports it too** (kd #2 fresh: scouts inside carrion odour 6
   times, 1 discovery; R38 item 5 exempted scouts). Trace in which phase those scouts were (return, curfew, timeout);
   `noteSmelledFood` then covers a scout in every phase in which she does not investigate. Test beside
   `smellReport.test.ts`.
2. **R38 item 1's floor has two levels.** The full floor (`missingScoutFloor`, 0.2 x workers) holds only while the
   colony knows **no** live source of the nutrient (no source with it, no workable herd for carbohydrate, no known
   patch holding prey for protein). While it knows one and is still short by >= 0.5, the floor is
   `SCOUT_SHORT_KNOWN_FRAC` 0.1 x workers, at least 1. Evidence: scout time 150 -> 242 worker game days with 252 of
   299 scout trips finding nothing (sweep 9: 140 of 165): the share that finds nothing did not move, the head-count
   did, and protein is short by >= 0.5 in every colony on every day, so the floor never lifted. Tests restated: 15
   workers, sugar known, no protein -> 3; a patch with prey known and protein still short -> 2 (ceil of 1.5); all
   covered -> base. This is in the one arm with direction 26 (read scout time, patches known, small carrion found).
3. **Hygiene, before direction 26 item 4's fixes:** show which change raised it in four colonies at once (cpv #2 2 ->
   14, kd #3 0 -> 10, sg #1 0 -> 7, sg #3 0 -> 5-9). On cpv #2's hand-over, run to day 6 with R38's items switched off
   one at a time by a probe flag (items 1, 2, 3 + 5 together, none): five short runs, model-free, not an arm. Name
   the item and the mechanism (who is no longer in `haul`, or what the hauler does instead), then apply direction 26
   item 4 as ruled if the mechanism is the hold and the burst, or say what else it is and fix that defect.
4. Not this round's: the 12 red `ecology/sources` tests (red since e299de5), egg flooding 10 -> 35 in fresh foundings,
   year two (R34; old age 6-12 a colony after the lapse against 1-23 eclosions). Leave them; do not let them take the
   round.

Order of the round: 26a.0, 26.3, 26a.2, 26a.1, 26.1 (R39), 26.2 (trace), 26a.3 + 26.4 (hygiene), 26.5 (the one arm,
against `round-11/arm-final11`). Bars as direction 26 item 5.

## Direction 27 (integrator, Nov 22 22:14 UTC) — round 13 is the year-two round (R40)

Round 12 met its four arm bars (ledger "### Round 12 results"); sweep 12's fresh foundings: viable 14 of 15, winter
workers 239 -> 249, brood hygiene 56 -> 23, egg flooding 35 -> 7, behaviours 0.224 ms a tick median (kd #1 0.256: the
cost bar is met on fresh runs). Accepted as built: D32, R38b, R39 with the double-count subtraction, 26.2 "no change"
(knowledge, not the value form). `TEND_HEADROOM` stays 1.25.

**Year one is finished for this task unless the sweep's findings say otherwise (direction 27a).** It is one cohort
by the calendar: hand-over ~doy 10, a clutch of 11-12 on doy 11, eclosion doy 14-16, laying potential 0 from doy 16.
Its "P intake / need" is one day on which the synchronous clutch asks 8-11 P / gd of 9-11 workers; 10 of 12 hatched
still eclose. Do not add year-one foraging rules to chase R19's 0.7.

**Year two is where the growth bar fails (R34).** Integrator's model-free read of the long runs (`layingGates`,
`eclosions`, day states, `protein.days`; year split at the doy wrap):

| run (tree) | winter 1 -> winter 2 | eggs y2 | eclosed y2 | P delivered y2 | fed to larvae y2 | old age |
|---|---|---|---|---|---|---|
| cpv #1 (r11) | 15 -> 13 | 19 | 6 | 21.6 | 16.6 | 9 |
| kd #3 (r11) | 12 -> 7 | 19 | 6 | 15.8 | 11.3 | 7 |
| pp #3 (r11) | 19 -> 24 | 40 | 23 | 47.0 | 30.3 | 12 (+ 7 predation) |
| sg #2 (r11) | 16 -> 20 | 25 | 14 | 28.2 | 18.7 | 6 |
| we #2 (r11) | 6 -> 3 | 20 | 1 | 1.1 | 3.6 | 6 |
| sg #2 (r12) | 19 -> 13 | 19 | 7 | 26.7 | 12.8 | 10 |
| we #2 (r12) | 13 -> 12 | 23 | 8 | 20.8 | 17.4 | 8 |

A queen whose laying potential stands at 20-35 eggs / gd on doy 10-14 lays 19-25 eggs in the whole second year. The
founding cohort (9-12 workers, lifespan 34 +- 8 gd, ageing 1.5 x outside) dies of old age inside year two, so a colony
of 13-19 needs ~20-25 eclosions to stand at 1.5 x and gets 6-14. The lifespans stay (turnover is the design); the
eggs are the lever. What holds the eggs, by the gate shares of the summer days:
- **`winter-reserve` shuts the peak.** sg #2 (r12) doy 12-14: share 1.0 / 0.85 / 0.85 at potential 35 / 27 / 22 with
  4-7 P in store and no larvae; eggs 0, 0, 1. kd #3 (r11) doy 12-14: 0.85 / 0.7 / 0.55 at potential 33 / 16 / 13 with
  5.5-7 P in store; eggs 0. Both colonies then held 14-20 C by doy 16-18, two to three times their winter need. The
  gate was made for a first-year colony handed over late (R5); in a colony that has wintered it stops the one window
  in which eggs still eclose before the cold. R39 moved it earlier: carbohydrate now sits near its stock target, not
  at two or three times it.
- **The prospective protein demand is off by construction since R39.** `queen.ts prospectiveProteinRate` scales by
  clamp(daysC / targetDays.c - 1, 0, 1): nothing at 1 x the carbohydrate target, all at 2 x. R39's tenders refill
  carbohydrate to 1 x the target and stop. So the rule that should bring protein in before the eggs are laid asks for
  none, the intake EMA stays low without larvae, and `brood-need` (store + 1.5 gd of intake against LARVA_P_REQ per
  egg) lets 3-6 eggs through per batch (doy 5-9 shares: brood-need 0.2-0.85, larval-hunger 0.15-0.5, p-days
  0.25-0.55).
- **Late brood dies in the autumn.** we #2 (r12): 7 pupae `untended`, 3 `temperature`; sg #2: 5 eggs `temperature`.

### R40 (rulings; build in this order)

a. **`winterReserveShort` applies only until the colony's first winter** (a colony that has not yet wintered: use
   the founding year against the current year, or a flag set at the first lapse; not the worker count). After it,
   the gate is off, and R39's carbohydrate want (`forageWant.c` as `tendDemand` and the forage side read it) counts
   the shortfall to `winterPathC` from its start day as stock still wanted: max(0, max(target x rate, winterPathC) -
   stock) / STOCK_REFILL_GD. One rule asks for the carbohydrate, none withholds eggs for it. Tests: a wintered
   colony of 12 at d28 12 with carbohydrate under the R5 reserve -> laying protein permitted; a first-year colony in
   the same state -> withheld (as now); tend demand rises when stock < winterPathC and stock >= target x rate.
b. **Prospective protein ramps on the carbohydrate target, not on twice it:** carbRamp =
   clamp((daysC / targetDays.c - 0.5) / 0.5, 0, 1) (nothing at half the target, all at the target). The
   `winterPathC` condition stays. First trace it (two year-two colonies, doy 5-15, hourly: potential, release share,
   carbRamp, prospective rate, forage P share, stores) on the round-12 tree to confirm the rate is ~0 at carbRamp 0;
   if it is not ~0, write the numbers and still build b (the pairing with R39 is wrong either way). Test restated in
   `colony/prospectiveProtein.test.ts`.
c. **Late brood (trace, then fix only a defect):** for we #2 and sg #2 year two, the fate of every egg laid after doy
   11 and of the 7 untended pupae: stage and temperature day by day, who was nursing, whether `DIAPAUSE_DOY` 19 /
   `DIAPAUSE_COLD_C` 12 took the larvae into diapause before they pupated into the cold. GDD 02 §2.8: larvae
   overwinter, pupae do not. If larvae pupate after the brood chamber has fallen under DIAPAUSE_COLD_C, that is the
   defect: a larva that would pupate while the chamber is under it (or from DIAPAUSE_DOY on) diapauses instead. If
   pupae are simply untended because nurses are reassigned in the cold, say who should have tended them and stop: I
   rule.
d. **Not ruled, measure only:** per year-two colony, eggs laid by day against potential and the gate that held each
   share (your `lifeLaying` table), protein delivered / fed / spoiled by day, old-age deaths by day. If after a-c the
   eggs are still under ~40 a year with potential open, name the gate and the numbers; do not move
   `LAYING_SUPPLY_HORIZON_GD`, `LARVA_P_REQ`, lifespans or prey values: those are mine.

### Harness and arms

- **A year-two cache first.** Save the five long-run colonies (we #2, sg #2, cpv #1, pp #3, kd #3) at year 2 doy 1
  on the round-12 tree (the founding cache's save / load; `life.ts` option if it needs one), so a year-two arm is
  five runs of doy 1 -> second winter (doy 22 of year 2), not five whole lives. Check identity: the cached start
  continued on the round-12 tree gives the same final hash as sweep 12's long run of that colony (or say why it
  cannot and how close the day states are).
- **Arms (model-free, no more than these):** base = round-12 tree from the cache; arm A = R40 a + b; arm B = A + c
  (only if c changes code); then the round's year-one arm on all 15 hand-overs against `round-12/arm-final12`.
- **Bars.** Year two (5 colonies): second winter >= 1.0 x first winter in >= 3 of 5 and the five second winters
  together >= the five first winters together (interim; R34's 4 of 5 at 1.0 x and 3 of 5 at 1.5 x stand); eggs in
  year two >= 35 in >= 3 of 5; no colony that met R27's carbohydrate at its second winter in the base misses it.
  Year one (15): viable >= 14, median P intake / need >= 0.45, brood hygiene <= 15, no colony that met R27 in the
  base misses it. If the year-two carbohydrate bar fails, report stock against winter need by day: I rule.

Direction 27a (sweep 12's findings: lost workers, the kd #2 nursing gap, we #3's winter carbohydrate) follows when the
sweep returns; re-read the tail of this file before you start and each time an arm or trace finishes.

## Direction 27a (integrator, Nov 22 22:37 UTC) — sweep 12 read; additions to round 13

Sweep 12 (ledger "### Independent sweep after round 12", `round-12/sweep-table.md`,
`docs/design/tasks/reviews/colony-life-sweep-12.json`): viability met, 14 of 15 (we #3 fails on winter carbohydrate);
R19 5 of 7 (P 0.419; no-lost 11 of 15); R22 spring 5 of 5; R24 met; **R34 1 of 5 at >= 1.0 x, 0 of 5 at >= 1.5 x**
(sweep 11: 2 of 5); behaviours 0.224 ms a tick median, kd #1 0.256 (cost bar met). Year two of the five long runs on
the round-12 tree (integrator's split at the doy wrap):

| run | winter 1 -> 2 | eggs y2 | eclosed y2 | P delivered y2 | old age | C at winter 2 / need | summer gate shares (doy 8-15, mean a day) |
|---|---|---|---|---|---|---|---|
| cpv #1 | 19 -> 22 | 27 | 14 | 29.5 | 11 | 22.9 / 7.4 | p-days 0.25, winter-reserve 0.17, larval-hunger 0.16, released 0.14 |
| kd #3 | 10 -> 3 | 13 | 3 | 4.9 | 8 | 8.4 / 1.5 | winter-reserve 0.32, larval-hunger 0.14, brood-need 0.13, released 0.05 |
| pp #3 | 21 -> 15 | 26 | 9 | 34.6 | 14 | 6.0 / 3.8 | larval-hunger 0.26, winter-reserve 0.17, brood-need 0.16, p-days 0.16, released 0.08 |
| sg #2 | 19 -> 13 | 19 | 7 | 26.7 | 10 | 15.3 / 3.2 | winter-reserve 0.41, larval-hunger 0.17, released 0.09 |
| we #2 | 13 -> 12 | 23 | 8 | 20.8 | 8 | 19.5 / 2.8 | brood-need 0.24, p-days 0.21, larval-hunger 0.12, released 0.10 |

Every colony stands at 1.6-7 x its winter carbohydrate need at the second winter: the `winter-reserve` gate
withheld eggs for carbohydrate the colony got anyway. Direction 27 (R40 a-d, the year-two cache, the arms and bars)
stands and comes first. Added, in this order after R40 a-c:

1. **One carbohydrate stock wanted (R41; joins R40a).** we #3 went into winter with 1.07 C of 6.16: from doy 15 its
   foragers brought 1.6-2.8 P a day against 0.1-0.5 C while carbohydrate stood under `winterPathC` the whole time
   and protein in store rose 4.4 -> 6.4. Rule: the carbohydrate stock the colony wants is one function,
   max(target days x rate, winterPathC), read by `forageWant` (R40a), by the carbohydrate need / urgency behind
   `nutrientWeights` (needC counts the shortfall to it, so a colony under its winter path with protein over its own
   target weights carbohydrate above protein unless larvae are hungry), and by the scout floor's "short" test (a
   colony under the path that knows no live carbohydrate source has carbohydrate missing). Tests: doy 16, C under the
   path, P over target, no hungry larvae -> wC > wP; the same with mean larval hunger over
   `LAYING_LARVAL_HUNGER_MAX` -> protein is not starved of foragers (state the split you get); scout floor counts
   carbohydrate missing.
2. **The forage demand is sized by a yield foragers do not realise** (sweep finding: idle 137 -> 257 worker gd; pp #2
   day 4: 3-5 of 20 idle with P want 4.3 and the forage demand of 7 fully staffed, cap 31; `yieldPerForager`
   0.96-1.27 against a realised 0.6-1.2). Trace how `col.yieldPerForager` is measured (per successful trip? per
   forager-day? does waiting count?). Rule: the demand divides the want by the loads a forager assigned to `forage`
   actually brought home per game day over the last game day (all assigned foragers, failed trips and waits
   included; keep the existing floor and the known-capacity cap). Fix that measure if it is not that; no new
   multiplier. Test with a colony whose foragers succeed on half their trips: demand is twice the all-succeed case
   (up to the cap).
3. **kd #2's nursing gap:** hours 51-65, nurse demand 7-10, target 5, 2 nursing, 2-3 idle, 6 larvae starved with 1.5
   P and 12 C in store (`round-12/sweep-review/nursegap.txt`). Trace why idle workers do not take the open nurse
   places (threshold, age band, a held task, D32's nurse waste states counted as nursing?). Fix the defect; test.
4. **Autumn `worker:lost`** (5 in 4 colonies, doy 19-22; `round-12/sweep-review/probe-lost-pp1.txt`): both of
   pp #1's entered `forage.return` / `tend.return` at the same tick and did not change state for 2 gd until
   RETURN_LOST_S. Trace what stops a homing worker for 2 gd (cold torpor on the surface, the entrance, a path). Fix
   only a defect; if it is the cold catching workers outside, say at what surface temperature and stop: I rule.
5. **Tests:** `scoutSmellReport` case 3 goes through `updateInvestigate`; `hygiene26` cases 1 and 3 are replaced by
   the sweep's `hold26.verify` and `burst26.verify` (keep those two files as they are).

Must-haves if the round runs long: R40 a-c with the year-two arms, then items 1 and 3; report 2, 4, 5 as not done
rather than half done. The year-one arm (15 hand-overs, against `round-12/arm-final12`) judges items 1-4 with R40:
bars as direction 27, and in addition we #3's kind of colony: no colony ends under its R27 carbohydrate that met it
in the base. Not this round's: the 12 red `ecology/sources` tests, lifespans, `LARVA_P_REQ`, prey values,
`LAYING_SUPPLY_HORIZON_GD`, base brood mortality.

## Direction 28 (integrator, Nov 23 00:46 UTC) — rulings on round 13's three stops; the round goes on, do not close yet

Read at 00:46 from your ledger entries 23:42-00:37. Accepted as built: the year-two cache and its identity (4 of 5),
R40 a, b, c (`pupationIntoCold`, "outside spring"), R41 with the winter path in every colony's want, D33 (the yield
prior), the point-field seed fix in its 00:19 form, 27a item 5. My premise for R40 b was partly wrong (carbRamp was
0.9-1.0 in we #2 and kd #3); it stays built. Arm A is the finding of the round: R40 a released 21 more eggs and
they hatched into a protein shortage (larva starvation 9 -> 19, eclosions 47 -> 42, second winters 71 -> 64). Eggs were
not the lever alone; the protein behind each egg is.

**Do not close the round when the running final arms (`y2-final`, `arm-final13`) finish.** They become the base of
the next arms. Build the three rulings below in the live tree while they run, freeze a new closing tree, run the
arms listed at the end, then close. Keep the ledger current; if your context runs short, write the hand-over line a
successor needs and close with what is measured.

### R42 — the cold does not catch workers outside (27a item 4)

Your trace: workers set out at 7-9 C surface air, where the thermal speed multiplier is 0.1-0.2 and a 0.3 gd trip
takes 1-2 gd; they stall at 0 near the entrance and die `lost`. Ants do not leave the nest in that cold. Rule:
- **No departure:** a worker does not start an outdoor trip (forage, tend, scout, and any other task's surface leg
  that leaves the mound) while the surface air at the entrance gives a thermal speed multiplier under
  `OUTDOOR_DEPART_MIN_SPEED` 0.5. The allocator's "surface workable" test reads the same threshold, so demand for
  outdoor tasks is not raised for a surface nobody may walk on (those workers are free for nest tasks or idle).
- **Turn back:** a worker outside whose own speed multiplier falls under `OUTDOOR_TURN_BACK_SPEED` 0.35 ends her trip
  and homes at once (carrying what she has).
- No change to RETURN_LOST_S, the thermal curve or `worker:cold`.
Tests: entrance air at the 0.4 point -> no departures for 0.2 gd, forage / tend / scout demand 0, nobody outside; a
forager 100 BU out when her multiplier crosses 0.35 turns home. Say in the ledger which air temperatures the two
thresholds are on Lasius' curve. Carbohydrate check in the year-one arm: if a colony that met R27 misses it because
late-autumn trips stop, report stock against need by day: I rule.

### R40 c2 — brood lying outside a brood chamber is a nurse's first job

Your trace: we #2's late pupae were not pupated into the cold; they were put down in a passage (chamberId -1) or in
chamber 14551 during a carry in hours with `flee.run` and egg flooding, and lay there untended at 2.5-5.4 C while
the nurses stood in chamber 5542. Rule: any brood item, at any stage, that lies outside a chamber or in a chamber the
colony does not use for brood is a move job for nurses, taken ahead of feeding, tending and grooming (after a
starving larva's feed); it is carried to the brood chamber the stage's placement rule picks (warmest dry one for
pupae). A carry that is interrupted (flee, task change, hand-back) puts the item down as now, and the item is
re-queued by this rule at once. First trace why the carried pupae were put down where they were (which interruption)
and say so; fix that too if it is a defect (for example a carrier that drops instead of finishing a carry she could
finish). Test: 5 pupae on a passage floor, 4 nurses, a dry brood chamber 20 BU away -> all 5 in the chamber within
0.1 gd; an interrupted carry's item is picked up again.

### R43 — the protein behind an adult (my lever; one dose, measured)

With the present constants growth past 1 x is not reachable in year two: a colony of 13-19 delivers 20-35 P in the
year (0.35-0.6 P a forager game day of hunting), a larva asks LARVA_P_REQ 1.2, and the founding cohort's turnover
alone needs ~12 adults. Dose arms, year two from the cache only (5 runs each), on the new closing tree (final arms'
tree + R42 + R40 c2):
- **dose 1:** `LARVA_P_REQ` 1.2 -> 0.8 (one constant; everything that reads it follows: remaining need, the
  brood-need gate, the prospective demand).
- **dose 2 (run only if dose 1 misses the year-two interim bars):** dose 1 + the patch prey's protein per carried
  item x 1.4 (springtail `deadP` 0.25 -> 0.35; mites and the other patch kinds in the same proportion; carrion and
  honeydew unchanged).
Choose the smaller dose that meets: second winter >= 1.0 x first winter in >= 3 of 5, the five second winters
together >= the five first winters together, larvae starved in year two <= half of arm A's 19. Report for both the
base (final arms) and each dose: eggs, eclosions, larvae starved, P delivered / fed / spoiled, second winters, R27
at the second winter, and how many reach 1.5 x (R34's bar: 3 of 5). Do not move anything else of mine
(`LAYING_SUPPLY_HORIZON_GD`, lifespans, base brood mortality). Update the tests and DEVIATIONS rows that state the
constant (the `workedExample` red is known; say whether the new constant moves it).

### Smaller items
- **`outdoor/homeRange.test` case 2** (red with D33): the test measures a heading bias after 4000 ticks of free
  foraging, so any change of trajectory moves it. Restate it so the scout's memory and position are set by the test,
  not by a run (same assertion, bar 0.1); do not leave it red.
- **sg #2's restore gap** (state equal through doy 5, diverges at the doy-6 row, with and without the observer): a
  save that does not continue as the unsaved run is a defect for the player's saves. Not this round's to trace;
  record the repro (cache file, command, first diverging row and field) in the ledger's "Next" list.

### Arms from here (model-free, no more than these)
1. base = the running `y2-final` and `arm-final13` (do not rerun them).
2. year two from the cache on the new closing tree at dose 1; dose 2 only by the rule above.
3. one year-one arm of the chosen tree on the 15 hand-overs against `round-12/arm-final12`, with `arm-final13` as
   the middle column. Bars as direction 27 (viable >= 14, median P intake / need >= 0.45, brood hygiene <= 15, R27
   kept) plus: runs without a lost worker >= 13 of 15.
Then tables, the round's results section, cleanup, close.

## Direction 28a (integrator, Nov 23 01:35 UTC) — the final arms read; R44 goes in before you freeze

Read at 01:35 from your 01:33 entry. Year one regressed on the 00:19 tree (viable 14 -> 12, P 0.482 -> 0.403, C 1.386 ->
1.247, trips 62 -> 53 %, we #3 and sg #2 miss R27) and your day rows name the mechanism: with D33 the yield estimate
sits at its floor, the forage head-count is 5-11 against 1-7, and in doy 15-21 those foragers bring protein while
wC > wP and carbohydrate falls to 0. D33 is right (the old prior hid the true yield); what it exposed is that **one
nutrient's want staffs trips for the other**: `computeDemand` sizes `forage` as min(intakeTarget / yield,
known.ants + 1) over both nutrients together, so a carbohydrate want with no carbohydrate source known sends the
head-count to the only sources there are (prey patches), and every such trip burns carbohydrate.

### R44 — the forage demand is counted per nutrient
`forage` demand = sum over the two nutrients of min(the nutrient's forage want / the yield a forager realises,
the forager-equivalents of the known live sources that carry that nutrient), plus the single +1 as now (not one per
nutrient). `KnownCapacity` already splits loads by nutrient (`loadsC`, `loadsP`); split the forager-equivalents the
same way (a source carrying both counts toward each by its share of loads). The prospective part (R32b / R35) is
protein want and is capped by the protein side only. A want with no known source of its nutrient asks for scouts
(R38 / R41's floor), not foragers. The R39 tenders are unchanged (herds are not in `known`). Tests: 15 workers,
carbohydrate want 6 loads / gd, no carbohydrate source known, one prey patch good for 4 foragers, protein want 0.5
loads / gd -> forage demand is the protein side only (about 1-2 with the +1), not 5; the same with a flower good
for 3 foragers known -> carbohydrate side min(want / yield, 3) + the protein side; both wants covered by sources ->
as before.
Also check where the departing forager picks her nutrient: at wC > wP with no carbohydrate candidate she should
not take a protein trip that the protein side of the demand did not ask for; if `forage` over its per-nutrient
count is impossible after R44, nothing to do; if it still happens (a carbohydrate-demand forager waiting takes a
protein trip), say how often in the year-one arm and stop: I rule.

### Order and arms (replaces direction 28's arm list)
Build order: R44, R42, R40 c2 (trace first), `homeRange.test`; freeze = closing tree at LARVA_P_REQ 1.2.
1. year two from the cache, closing tree at 1.2 (5 runs): the proper base for the dose (it tells R44 + R42 + R40 c2
   from the dose); compare with `y2-final`.
2. year two, dose 1 (LARVA_P_REQ 0.8) on the same tree (5 runs); dose 2 only by direction 28's rule. Both slots can
   run 1 and 2 side by side.
3. one year-one arm of the chosen tree (15) against `round-12/arm-final12`, `arm-final13` as the middle column.
   Bars: viable >= 14, median P intake / need >= 0.45, hygiene <= 15, R27 kept (we #3 and sg #2 back over their
   need), runs without a lost worker >= 13.
Not this round's (record under "Next" with the repro): the save -> load -> continue gap (`outdoor/determinism.perf`
red with D33's trajectory, sg #2's cache): it is round 14's first item, with a fresh context; and kd #3's eggs laid
into a royal chamber over its waste tolerance (37 egg hygiene deaths in a colony of 3-4 workers).
If your context is short, the must-haves are R44 + R42 with their tests, arms 1-3 at dose 1, and the ledger; R40 c2
may go to round 14 as traced-not-built.

## Direction 28b (integrator, Nov 23 02:38 UTC) — R42's thresholds corrected; R44 still owed; how the dose gets made

Read at 02:38 from your 01:43 entry and from the 8 finished runs of `arm-final13b` (tree v2 = 4725f524 + R42).

1. **R42's thresholds were mine and they are too high.** 0.5 / 0.35 on the speed curve are 14.2 / 11.7 C of air; in
   the 8 paired runs forage time fell 388 -> 222 worker gd, median P 0.53 -> 0.37, C 1.39 -> 1.21, and we #3 misses
   R27 again. The workers that were lost set out at 7-9 C (multiplier 0.1-0.2). New values:
   `OUTDOOR_DEPART_MIN_SPEED` **0.3**, `OUTDOOR_TURN_BACK_SPEED` **0.25** (say the air temperatures in the ledger).
   Everything else of R42 as built. **Kill the unfinished `arm-final13b` runs**; the 8 done are enough to read.
2. **R44 (direction 28a) is not in tree v2 and must be in v3.** Direction 28a sits above this one: forage demand
   counted per nutrient (a carbohydrate want with no carbohydrate source known asks for scouts, not for foragers
   who then go to prey). Its tests as written there.
3. **R40 c2:** accepted as reverted (the board's `rescue` job already covers brood outside a chamber). The lead
   (carriers walking to the surface and back with nothing carried; 1 of 5 pupae on the shaft wall rescued in 0.6 gd)
   goes under "Next" for round 14 with the test as you have it.
4. **The dose is made by me, because your permission check refuses the constant.** Procedure:
   - Build R44 + the new R42 values; tests; freeze **v3** at `/home/user/scratch-r13-final3` (LARVA_P_REQ 1.2) and
     write "v3 frozen HH:MM" in the ledger. Start at once: year two from the cache on v3 (`y2-final3`, 5 runs).
   - I copy v3 to `/home/user/scratch-r13-final3-dose1`, set `LARVA_P_REQ` 0.8 there and write "dose tree ready" in
     the ledger (I look every ~20 minutes). You then run year two from the cache on it (`y2-dose1`, 5 runs). Do not
     edit that copy.
   - The machine has 4 cores: three slots are allowed for these arms.
   - Choose by direction 28's rule (dose 0 if v3 alone meets the year-two interim bars; else dose 1; dose 2 would
     be made by me the same way: say so in the ledger and wait one check). Then one year-one arm of the chosen tree
     (15) against `round-12/arm-final12`. Bars as direction 28a.
   - If dose 1 is chosen, the live tree must end at 0.8: say so in the ledger and I make that edit (constant + the
     E2 pin in `colony/brood.test.ts`) before you close; list the tests that then need restating and restate those
     you are allowed to.

## Direction 28c (integrator, Nov 23 04:03 UTC) — the dose is not adopted this round; one year-one arm on v3, then close

Read at 04:03 from `y2-final3` and `y2-dose1` (my own table from the JSON):

| | we #2 | sg #2 | cpv #1 | pp #3 | kd #3 | sum (winter 1: 82) | >= 1.0 x | eggs | eclosions | larvae starved | egg hygiene |
|---|---|---|---|---|---|---|---|---|---|---|---|
| v3, LARVA_P_REQ 1.2 | 10 | 16 | 25 | 16 | 3 | 70 | 1 | 136 | 49 | 8 | 6 |
| v3, LARVA_P_REQ 0.8 | 11 | 26 | 13 | 20 | 0 | 70 | 1 | 198 | 49 | 16 | 37 |

The dose does what it should to the eggs (sg #2 27 -> 45, cpv #1 31 -> 54, pp #3 35 -> 58) and where the nest stays
clean the colony grows (sg #2 16 -> 26, 1.37 x; pp #3 16 -> 20). In cpv #1 the 54 eggs meet a dirty chamber: 21 eggs,
7 pupae and 6 larvae die of hygiene and the colony ends at 13 instead of 25. Net over the five: nothing. So the
next limit behind protein is nest hygiene under a larger brood, and a balance change that buys nothing net is not
adopted: **the live tree stays at LARVA_P_REQ 1.2.** The dose tree stays on disk for round 14.

Do now, then close the round:
1. One year-one arm of **v3** (9f5935ce, dose 0) on the 15 hand-overs against `round-12/arm-final12`, three slots.
   It judges R44 and R42 at 0.3 / 0.25. Bars as direction 28a (viable >= 14, median P >= 0.45, hygiene <= 15, R27
   kept, runs without a lost worker >= 13).
2. While it runs: add v3 and dose rows to the round's results section, restate what is "Not done", and write "Next"
   for round 14 in this order: (a) hygiene under a larger brood: cpv #1 at dose 1 from the year-two cache (which
   chamber, which waste by kind and day: meconium, corpses of the old-age deaths, dead brood; who hauls; where the
   queen lays) and kd #3's dirty royal chamber; (b) the save -> load -> continue gap; (c) the passage-brood carry;
   (d) whatever the year-one arm shows of R42 against R27 and of trips at wC > wP after R44; (e) the dose again
   once (a) is fixed.
3. Leave `/home/user/scratch-r13-final3` and `-final3-dose1` in place (round 14 uses them); delete the other
   scratch trees. Close with the year-one table in the results.

## Direction 29 (integrator, Nov 23 04:56 UTC) — round 14: restore year one, then brood survival in year two

Round 13 is closed (ledger "### Round 13 results" and its closing addendum; the workflow was stopped before sweep 13
on purpose). The live tree is v3 = round 12 + R40 a-c, R41, D33, the point-field fix, R42 (0.3 / 0.25), R44, test
repairs, `life.ts --save-y2 / --from / --trace13`. Measured against round 12:

| | round 12 tree | v3 (live) |
|---|---|---|
| year one, 15 hand-overs: workers / viable / median P / median C | 266 / 14 / 0.482 / 1.386 | 273 / **11** / 0.370 / 1.302 |
| year one: R27 lost (met in round 12) | - | we #3, sg #2, kd #3; kd #2 not viable (starvation stage) |
| year one: runs without a lost worker | 11 | 13 |
| year two, 5 from the cache: second winters (winter 1: 82) | 71 | 70 |
| year two: eggs / eclosions | 122 / 47 | 136 / 49 (dose 0.8: 198 / 49) |

So the set costs year one three colonies' winter carbohydrate and buys nothing in year two. Two findings stand
behind the next step: (1) adults raised in year two are ~49 whatever the eggs (136 or 198): brood survival, not
laying, is the limit (v3, dose 0: base 34, untended 19, hygiene 18, flooding 8, starvation 8, exposure 7,
temperature 5; at dose 0.8 hygiene 70); (2) round 13's fixes of defects are real (nurse walks 157 failures -> 0,
larvae no longer pupate into the cold, lost workers 4 -> 2).

**This round and the next are the last two of this task.** What the bars do not reach after round 15 is written up
as known limits and the project moves on.

**Constants.** In this round you ARE authorized to change, exactly as ordered below and nowhere else:
`LARVA_P_REQ` (to 0.8), `BROOD_SURVIVAL` (the base brood survival per stage), and to switch round 13's rules off
in scratch copies for the bisect. Other balance constants of mine stay (`LAYING_SUPPLY_HORIZON_GD`, lifespans, prey
values, `TEND_HEADROOM`, the R42 thresholds).

### Part A — restore year one (first; mostly runs, so work on Part B while they run)
1. **Bisect by switch-off.** From the live tree make scratch copies with one of round 13's rules switched off each
   (an `R13_OFF` switch in the copy only, as round 12's hygiene probe did): D33 (old yield prior), R44 (demand over
   both nutrients), R41 (needC on the plain stock target), R40 a's carbohydrate want (no winter path in
   `carbStockWanted`), R40 b (ramp 1 x -> 2 x), R42 (no cold gate). Run each to winter on the four colonies that
   fail (we #3, sg #2, kd #3, kd #2) and two that do not (we #1, cpv #1): 6 x 6 runs, three slots. Table: winter C /
   need, viable, workers, P and C intake, forage / tend worker gd, trips by nutrient, lost.
2. **Rule by the table (yours to apply, then say what you applied):** a rule whose switch-off restores R27 in at
   least 2 of the 3 carbohydrate failures and harms neither control is taken out of the live tree (code reverted to
   round 12's form for that rule, its tests removed or restated, DEVIATIONS row marked withdrawn), unless the table
   shows a defect in it that a small fix cures, in which case fix and rerun those six. If two rules each restore,
   take out the one whose removal costs least elsewhere and rerun with only that out before removing the second. If
   no single switch-off restores, run the pairs D33 + R44 off and R41 + R40 a off; if still none, stop and write
   the numbers: I rule. Hypotheses to test, not to assume: D33 doubles the forage head-count on a true yield of
   ~0.5 and the extra foragers burn carbohydrate; R42 ends late-autumn carbohydrate trips (every R27 miss has
   too-cold turn-backs).
3. **Confirm:** one year-one arm of the resulting tree on all 15 against `round-12/arm-final12`. Bars: viable >= 14,
   R27 kept, runs without a lost worker >= 12, median P >= 0.45 (if P alone misses, report and go on).

### Part B — the save -> load -> continue gap (while Part A's runs go)
`outdoor/determinism.perf` (red on the live tree) and sg #2's year-two cache on the round-12 tree
(`round-13/cache-y2/y2-suburban-garden-2.bin`; repro in the ledger's round-13 "Next" (b)). Find the state that a
save does not carry or a load rebuilds differently (bisect by tick: save at T, compare the two runs' state hashes
tick by tick after T, then field by field at the first tick that differs). Fix at the cause; add a test that saves
and continues on that very state. A player's save must continue as the unsaved game does. If the fix changes what a
save file holds, bump or extend the save format as the code base does it elsewhere and keep old saves loading.

### Part C — brood survival in year two (after A is confirmed; arms from `round-13/cache-y2`, 5 runs each)
Base of the arms: Part A's tree, year two from the cache (5 runs).
1. **Stray and late pupae (untended 19):** the round-13 lead: on the small test nest 5 pupae on the shaft wall, 1
   rescued in 0.6 gd, carriers walking to the surface and back with nothing carried. Trace the `rescue` job for an
   item on a passage wall (reach, pick-up position, claim) and fix it; test as you have it, bar 5 of 5 in 0.2 gd.
2. **Hygiene under a larger brood (18, and 70 at the dose):** cpv #1 from the cache on the dose tree
   (`/home/user/scratch-r13-final3-dose1`, or Part A's tree with `LARVA_P_REQ` 0.8): per day, waste items by kind
   (meconium, adult corpses of the old-age deaths, dead brood, food remains) in each chamber holding brood, haulers
   and their states, where the queen stands and lays, eggs dead of hygiene. Name what fills the chamber and why it
   is not carried out, and fix that (candidates: old-age corpses left in the nest; the queen laying in a chamber
   over tolerance while a clean one exists; D32's haul cap not applying to the royal chamber). No change to
   `wasteTolerance` or the hygiene hazard.
3. **Dose arms, in this order, each kept only if it helps:** (i) items 1 + 2; (ii) + `BROOD_SURVIVAL`: halve the
   base loss of every stage (survival s -> 1 - (1 - s) / 2); (iii) + `LARVA_P_REQ` 0.8. Year-two bars: second winter
   >= 1.0 x first winter in >= 3 of 5 and the five together >= 82; R34's bar (4 of 5 at 1.0 x, 3 of 5 at 1.5 x)
   stands as the task's. Keep the smallest set that meets the interim bars, or the best set if none does, provided
   the year-one arm of that tree still meets Part A's bars (rerun the 15 once at the end).
4. Report eggs, hatched, pupated, eclosed, deaths by cause, P delivered / fed / spoiled, old age, R27 at the second
   winter for every arm.

Must-haves if the round runs long: Part A complete; Part B traced (fixed if the cause is small); Part C items 1 and 2
traced. Keep the ledger's "## Round 14" progress current so a successor can continue; keep `round-13/cache-y2`.

## Direction 29a (integrator, 06:00 UTC Nov 23) — Part A ruling: take round 13's economy rules out, no pairs

Read from `round-14/table14off.py` at 06:00 (d33, r44, r42, r41 complete, r40a half): no single switch-off passes the
rule. d33 off is the only strong one (we #3 and kd #3 back, sg #2 short by 0.24, kd #2 viable) and it costs the control
we #1 its viability; sg #2 is restored by nothing alone; and unrelated switches move single colonies by several
game-days of sugar (sg #2: 3.27 -> 1.28 with r42 off; we #3: 3.33 -> 13.09 with r40a off). Six colonies cannot
separate six interacting rules at that noise, and none of the five economy rules bought anything in year two (second
winters 60 to 70 against round 12's 71). So:

1. **Stop the bisect** when you read this (kill the remaining r40a / r40b runs; the table as it stands goes in the
   ledger). No pair arms.
2. **Take out of the live tree, back to their round-12 forms:** D33 (yield prior), R44 (forage demand per nutrient),
   R41 (`carbStockWanted` in needC and the scout floor), R40 a's winter path in the forage want and intake target,
   R40 b (prospective ramp back to 1 x .. 2 x the target). Remove the code, do not leave switches; tests of the removed
   rules go with them or are restated to the round-12 behaviour; `DEVIATIONS.md` rows D33, R41, R44 and the want half
   of R40 marked withdrawn (round 14), with one line why. Additive fields already on plain data (`KnownCapacity.antsC /
   antsP`) may stay if a save could hold them; otherwise remove.
3. **Keep:** R40 a's gate (winter-reserve gate only until the first winter), R40 c (`pupationIntoCold`), R42 at
   0.3 / 0.25, the wide point field with this round's restore fix, the mound-mask fix, the round-13 tooling and
   restated tests.
4. **Confirming year-one arm** on the 15 on that tree against `round-12/arm-final12` (bars as in direction 29: viable
   >= 14, R27 kept where round 12 had it, runs without a lost worker >= 12, median P >= 0.45). If viable < 14, rerun
   only the failing colonies with R42 off (scratch copy): if R42 is what costs them, report it and stop Part A there
   for my ruling (viability outranks the lost-worker bar); otherwise report the failing colonies' traces and go on to
   Part C on this tree; year one then goes to round 15.
5. Part B: both causes accepted as fixed once `probe-restore-sg2-r12fixed.txt` shows 36000 equal ticks. Add to the
   test list one save -> load -> continue hash check on a life-run state with mounds (the `determinism.perf` scenario
   has no relaxing pile next to a pit). The year-two cache needs no rebuild (a loaded game builds fresh masks), but
   Part C's base arm must be rerun on the fixed tree; round 13's year-two numbers are not its baseline.
6. Part C item 1: accepted as not reproducing; keep the gate test; read the in-game case from the base arm's trace
   as you planned.

## Direction 29b (integrator, 07:03 UTC Nov 23) — Part A ruling after tree A (12 of 15): R42, and what still costs sg #2 / kd #2

Read: tree A (round-12 economy + R42 + R40 c + the fixes) viable 12; with R42 off pp #3 is back (14.09 / 7.56) and
sg #2 forages twice as long (idle 57 -> 10 worker gd); sg #2 and kd #2 stay short with R42 off although round 12 had
them at 7.11 / 4.54 and 11.10 / 4.70. sg #2 has failed in every tree of rounds 13 and 14 and only there, so the cause
is something all of them share and round 12 lacks. With the economy rules and R42 out, that leaves **R40 c**
(`pupationIntoCold`) and **the wide point field**. R40 c fits the trace: larvae held as larvae keep a protein need
through doy 13-17, and sg #2's foragers bring 2.3-2.5 P a day while C stands under 2.

1. **R42: the depart gate is withdrawn.** It saves about 2 workers over 15 colonies and costs pp #3 its winter store
   and sg #2 half its forager time; viability outranks the lost-worker bar. The turn-back half
   (`tooColdToStayOut`) stays only if run (c) below shows it free; otherwise all of R42 goes (code removed, the
   `DEVIATIONS.md` row marked withdrawn, `coldGate42.test` removed or cut to what stays).
2. **Before any run** (model-free, from the runs you have): for sg #2 and kd #2, round 12 against tree A R42 off, per
   day doy 11-19: larvae, pupae, larvae in diapause, colony P need, P and C delivered, foragers by nutrient. Is the
   extra protein demand R40 c's held larvae? Are larvae in diapause counted in the protein need and fed?
3. **One batch, base = tree A with the depart gate off** (three slots, 7 to 9 runs to winter):
   (a) R40 c off: sg #2, kd #2. (b) round 12's `pointField` (no wide field): sg #2, kd #2. (c) turn-back half
   on, depart gate off: pp #3, sg #2, kd #2. (d) a + b on sg #2, kd #2 only if neither alone restores both.
4. **Rule by the batch:**
   - R40 c restores them: if step 2 shows larvae in diapause are counted in the protein need or fed, fix that
     (a larva in diapause needs and takes nothing) and keep R40 c; else cut R40 c to its calendar clause (from
     `DIAPAUSE_DOY` on, no cold-chamber clause); if neither is small, withdraw R40 c.
   - The point field restores them: it is a correctness fix and stays; report what the reachable nurses now do that
     costs the sugar (more brood raised -> more protein need?) and leave year one to round 15.
   - Neither: it is trajectory noise at this sample; record it and go on.
   - (c): turn-back stays only if all three are no worse than with it off.
5. **Then freeze the Part A tree** (those rulings + `wasteFall`, which is accepted: a real defect, good find) and run
   Part C on *that* tree: base arm from the cache, then the dose arms of direction 29 in order. Runs of
   `y2-baseA` already going may finish, but tree A is not the base of the dose arms. The one year-one arm of 15 is
   run once, on the round's final tree; bars: viable >= 14 (primary), R27 kept, median P >= 0.45, runs without a lost
   worker >= 11 (round 12's figure; the >= 12 bar is dropped with the depart gate).
6. `outdoor/removal.verify` (scout sent the wrong way by `endFlee` -> `startReturn`): accepted as a round-15 lead.

## Direction 30 (integrator, 11:15 UTC Nov 23) — round 15, the last round: defects first, then close with the known limits

Sweep 14 (ledger "### Independent sweep after round 14"; `reviews/colony-life-sweep-14.json`) on tree P at
LARVA_P_REQ 1.2: viable 13 of 15 with woodland-edge 1 of 3 (bar not met), R19 4 of 7 (P 0.427, trip success 48.1 %,
no-lost 12), R22 spring 5 of 5, R24 met, R34 2 of 5 at 1.0 x and 0 at 1.5 x (71 against 74), behaviours 0.245 ms a
tick. My paired run of the same sweep script on P + LARVA_P_REQ 0.8 (`round-14/sweep-p08`; foundings differ because
the constant acts in the founding too): viable 13 of 15, every archetype >= 2 of 3, workers at winter 273 against 255,
R19 5 of 7 (P 0.403; first workers >= 9 in only 11 of 15). Its five long runs are still going
(`round-14/sweep-long-p08`, two slots until its `summary.txt` says DONE, about 12:05 UTC: use one slot until then).

This round makes no new economy or allocation rule. It fixes the defects the sweep and round 14 found, measures once,
and writes up what is still unmet. Order:

0. **LARVA_P_REQ:** my ruling follows as direction 30a when the paired long runs are in. Until then the live tree
   stays at 1.2; items 1 to 3 do not depend on it.
1. **Delivery livelock in the entrance throat (sweep finding 1; cost we #1 its viability).** Two parts, both wanted:
   (a) why the chamber field's leg fails 0.85 BU down the throat from one side of the entrance (repro:
   `test-output/viab/cache/founded-lasius-niger-woodland-edge-1-naturalist-d-98af5b84.bin`, ant 7725, ticks
   29375-29386; probes `round-14/sweep-review/probes/`) - fix the field or the descent at the cause;
   (b) `phaseNest.ts updateDeliver` must not re-request a failed leg for ever: after a failed `toChamber` leg it
   re-plans (another reachable chamber of the nest, or the nearest reachable point inside it) and, failing that, hands
   on to a nestmate or sets the load down inside the entrance as the code base already allows; no ant stands with a
   full crop for more than one DELIVER_MAX_S. Test from the repro state (stuck deliverers 0 over 2 gd) and a unit test
   of the recovery. Bar: we #1 on that hand-over viable; deliver share of worker time under 6 %.
2. **Buried spoiled food (sweep finding 2).** `stores.ts spawnSpoiledItem` puts the item on the cavity's real floor
   (the same resting-point probe `wasteFall` uses; not `centre.y - radii.y`), and waste already inside solid in a
   save is lifted to the nearest open resting point in its chamber by the cycle hook. `wasteFall.verify.test` case 2
   green; add the missing test of `restingPointUnder` at spawn (`brood.ts spawnWaste`, sweep's minor finding). No
   change to `wasteTolerance`, the hazard or the census rule.
3. **Homing after a flee (`outdoor/removal.verify`):** `flee.ts endFlee` -> `startReturn` sends a scout outward
   (entrance distance 201 -> 337 BU). Fix the heading / the return target at the cause; that test green.
4. **Sugar left lying while prey is hunted (we #3 in sweeps 12 and 14; sg #2, kd #3, cpv #3 in the arms):** trace
   only, then fix **only if it is a defect of execution or of target choice**, not a new want rule. we #3 on sweep
   14's hand-over: 91 hunting trips while C stood at 1.9-4.1 against a winter need of 6-17, two crumb sources with
   16.8 C within 300 BU, 3 items taken. Per day: what the colony knew (sources, their nutrient, estimated yield),
   which target each departing forager chose and why, and how each carbohydrate trip ended (`untracked
   not-reached`: where did she stop, what did the trip planner hold?). Candidates: crumb trips failing on the way
   (a route or a claim defect); a known carbohydrate source scored under prey although needC is high; needC reading 0
   at 3 gd of stock while the winter need is not met (if that is the cause, report it - it is R41's question and I
   rule, you do not rebuild R41).
5. **Year-one brood flooding 7 -> 20 and trip success 57.5 -> 48.1 % (sweep findings 3 and 5):** one A/B each on
   the two or three worst runs: is it the mound-mask change (does the pile now sit over or beside the entrance
   differently, letting water in?), `wasteFall`, or the withdrawn rules? Fix if a defect of this round's fixes;
   else report.
6. **Close (must be in the ledger whatever else is not):**
   - one year-one arm of 15 on the round-10 hand-overs against `round-14/arm-y1P3b` (or P's values if 30a keeps
     1.2), plus we #1 and we #3 on sweep 14's hand-overs; one year-two arm of 5 from `round-13/cache-y2` against
     `round-14/y2-P` / `y2-P3b`;
   - a section "### Known limits at the close of colony-life" in the ledger: every bar not met with its last measured
     value, the cause as far as it is known, and what was tried (R19's P 0.7 against the one-day larval spike; R34's
     1.5 x against old-age turnover and brood base loss; pp #3; the colonies that end short of sugar; anything of
     items 1 to 5 left open), written for a reader who has not followed the rounds;
   - DEVIATIONS rows for whatever changes; the known-red test list.
Not yours to move: any balance constant other than placement / recovery parameters your fixes need and LARVA_P_REQ
as 30a rules it; no new allocation, demand or laying rule; bars and ruling tests. Must-haves if the round runs long:
items 1, 2, 3 and 6. Keep the ledger's "## Round 15" progress current; re-read the tail of this file and of your
ledger section each time an arm or a trace finishes.

## Direction 30a (integrator, 11:54 UTC Nov 23) — LARVA_P_REQ 0.8 is adopted for the colony after the hand-over

Paired evidence, 1.2 against 0.8, same scripts and seeds:

| | 1.2 | 0.8 |
|---|---|---|
| year one, round-10 hand-overs (15): workers / viable | (tree A 266 / 12; P not run) | 280 / 13 |
| year one, fresh foundings (15): workers / viable / archetypes at >= 2 of 3 | 255 / 13 / 4 of 5 | 273 / 13 / 5 of 5 |
| fresh foundings: first workers >= 9 (bar 13 of 15) | 14 | **11** |
| year two from the cache (5; winter 1 = 82): second winters / at >= 1.0 x | 74 / 2 | 83 / 3 |
| fresh long runs (5): winter 1 -> winter 2 / at >= 1.0 x / at 1.5 x | 74 -> 71 / 2 / 0 | 85 -> 85 / 3 / 0 |
| fresh long runs: year-two eggs / eclosed | 132 / 47 | 209 / 63 |

(0.8 long runs: `round-14/sweep-long-p08`: we #2 9 -> 6, sg #2 18 -> 20, cpv #1 25 -> 33, pp #3 21 -> 24, kd #3 12 -> 2;
kd #3 went into the winter not viable, C 2.2, and starved in spring.) Nothing is worse at 0.8 after the hand-over and
three comparisons are better, none of them by more than this sample's spread; the one thing that is worse is the
founding (first workers).

Ruling:
1. **`LARVA_P_REQ` = 0.8 in the live tree** for the established colony; restate `colony/brood.test` E2 to the
   constant; DEVIATIONS row R43 (adopted round 15, with the table above in one line).
2. **The founding keeps 1.2**, so that foundings, their first-worker counts and the hand-over caches of every earlier
   sweep stay as they are: a second constant `FOUNDING_LARVA_P_REQ` = 1.2 read while the colony has not handed over
   (larvae already alive at the hand-over go on at 0.8, which is what `round-14/arm-y1P3b` measured). Do this only
   if the brood step can tell the phase in one place (colony stage / founding flag) without touching the founding
   module's own tuning. Check: one founding on the live tree reproduces sweep 14's cached hand-over (same first
   workers, same state hash at the hand-over) - if it does not, or the split needs more than that one read, **drop
   the split**, keep the single constant at 0.8, and report the first-worker counts in the close.
3. The close's arms (item 6) run on the tree with this ruling in; their baselines are `round-14/arm-y1P3b` (year one)
   and `round-14/y2-P3b` (year two).
Items 1 to 3: read and accepted as built (lone-voxel nav sample + deliver recovery; floor placement and lift of
buried waste; no crumbs while homing and retrace from the nearest crumb). Two slots are free again (my long runs are
done): three run slots are yours.
