# quiet-time report — the human side no longer makes hours loud; the quiet share is now bound by the colony's own alerts

Engineer: quiet-time (Sonnet), 2026-11-17 22:55 - 2026-11-18 00:50 UTC. Spec `docs/design/tasks/quiet-time.md`.
Evidence: `test-output/quiet-time/` (`before1/`, `after2/` = step 1 tables per run as `.md` and `.json` with every hour's
record; `counts/`; `long/` = whole game; `before-after-table.md`). Runs were made from frozen copies of the tree (before =
the tree with the old `warn()`, after = the final tree), one process at a time, on the round-4 hand-overs
`test-output/colony-life/round-4/cache/*-1-naturalist-d-any.bin`, 6 game days from the hand-over (tick-gd 3.4-3.7,
calendar day about 8.5), AI only, Naturalist, human events at the preset's rate.

## 1. Result in one paragraph

A human event lasts real seconds (1 clock hour = 25 s; a mowing run up to 240 s = ten clock hours), and the old card
`human-event-warning` was raised at the first cue if any player ant was anywhere on the event's whole area and held to the
event's end: 31-66 cards and 911-1885 s on screen per 6 game days, **32-76 loud hours of about 96** made by human cards
alone, longest card 254 s. The card is now raised only while a player ant stands in the path of an impact due within 3 s,
lives at most 5 s, one per site with the engine's 1-game-hour warning cooldown: 0-11 cards, 0-38 s on screen, **0 loud hours
made by a human card in all 8 runs, longest card 5 s**. The telegraph (cues, sound, tremor, shadow), the events, their
frequencies and the lethal effects are unchanged. What remains loud is **not the people, the creatures or the director**: it
is the colony's own standing warnings (food, brood), a nest flood, a heat warning, nest crowding. With only the outside
alerts (people, predators, rivals) and the major threats counted, every trailing 3-game-day window is quiet at 0.94-1.00
(needs 0.60), and over a whole game to winter at 1.00 on four runs including Gentle (0.75) and Harsh (0.40). With all
alerts counted the share is 0.04-0.60 per run and the full E25 target is **not met**: the failing windows are named in §3
with their owners. Bird events are still refused in 85-95 % of daytime hours because the trailing share stays under
QUIET_SHARE_MIN + 0.05 for the colony's reasons.

## 2. What changed (files)

| File | Change |
|---|---|
| `src/sim/environment/human/alerts.ts` (new) | the card: `checkHumanAlert` (every `HUMAN_ALERT_EVERY` = 5 ticks per run: first impact due within the look-ahead with a player ant of the surface inside its footprint + 60 mm; raise or keep the site's card), `expireHumanAlerts` (every tick: lifetime), `endHumanAlert` (event end clears the site's card unless another running event of the site holds it) |
| `src/sim/environment/human/runner.ts` | `warn()` (raise at the first cue, anywhere on the area, clear at event end) removed; the three calls above |
| `src/sim/balance/human.ts` | `HUMAN_ALERT_LOOKAHEAD_S` 3 (x `HUMAN_TELEGRAPH_MULT`), `HUMAN_ALERT_MARGIN_MM` 60, `HUMAN_ALERT_IDLE_S` 1, `HUMAN_ALERT_MAX_S` 5, `HUMAN_ALERT_EVERY` 5, `HUMAN_ALERT_MAX_IMPACTS` 24, with the reasoning |
| `src/sim/progression/alerts.ts` | additive: `touchAlert`, `expireAlert`, `AlertLifetime` (a card held by a condition; the marks are in `progression.engine.mem`, saved); and the **ease rule**: a repeat raise of an active key with a lower level from the same `diagnosticId` lowers the card (op `update`, journal `alert.ease`); review fix: the comparison is made against the diagnostic that holds the card BEFORE the repeat overwrites it, so a different diagnostic's lower raise no longer lowers a card (it did, for any non-null diagnostic) |
| `tools/sim/quietRun.ts` (new) | the observer (below) and `--counts 1` (human events per game day at off/low/normal/high) |
| tests | `src/sim/environment/human/alerts.test.ts` (5), `src/sim/progression/alerts.life.test.ts` (4), `src/sim/environment/human/quiet.long.test.ts` (4, `FOUNDRESS_LONG=1`) |

Contract changes: none in `src/sim/types/**` or `src/core/**`; the card's state needs no new field (the engine's `mem`).
Additive exports of `progression/alerts.ts` are imported by path (`@/sim/progression/alerts`), `progression/index.ts` untouched.
The card's key is now `human-event-warning:<siteId>` (was `:<instId>`); the content text and the app read kind and tokens only.

### Design of the card (step 2)

What the player can act on is "ants in the path of a footstep, mower, hose, car": so the alert is a function of ants and
impacts, not of the event's life. Raised when an impact (contact other than none or bait) due within 3 s (Gentle 4.5 s,
Harsh 2.25 s, like the cues' leads) has a player-colony ant with `nestId < 0` within its footprint + 60 mm (spatial index
query, at most 24 impacts looked at per check). Cleared 1 s after the ants were last in a path (impact passed, ants left),
at 5 s at the latest (below `QUIET_ALERT_SHARE` of an hour, 6.25 s: one card never makes an hour loud on its own), or when
the event ends. One card per site; after it clears, the alert engine's own cooldown (warning: 1 game hour) turns the next
raise into a journal line (`alert.cooldown`), written once per event and site (a mark in the engine's `mem`), not at
every 5-tick check. **Decision (review):** "one alert per event" is kept as "one card per site and game hour": a mowing run
of up to ten clock hours can raise a further card an hour after the previous one cleared, because ants that walk into a
later stripe are in real danger and the cue alone would not tell the player; each card is at most 5 s, under the loud-hour
share, so the quiet share is not affected (checked: 0 loud hours from human cards in every run). The
journal keeps `alert.raise` / `alert.clear` for every card; the telegraph events (`human.telegraph`, `human.impact`) are
untouched, so audio, tremor relay and perception are as before. Save -> load in the middle of a card equals the
uninterrupted run (test).

## 3. Step 1: the table (before and after)

Per run: human cards, seconds on screen, daytime counted hours made loud by a human card (an hour counts when that card
alone had >= 25 % of it, or, when none did, all cards that took part), counted hours, quiet share of the run, minimum of
all full trailing 3-game-day windows (45-46 windows from the 72nd hour), and the same minimum with only the outside alerts
(people, predators, rivals) and threats counted.

| world | colony | | human cards | human s on screen | hours made loud by a human card | counted h | quiet share (run) | min 3-gd window | min window, outside alerts only |
|---|---|---|---|---|---|---|---|---|---|
| car-park-verge | hand-over | before | 60 | 1255 | 70 | 97 | 0.15 | 0 | 0.39 |
| car-park-verge | hand-over | after | 0 | 0 | 0 | 97 | 0.28 | 0 | 1 |
| car-park-verge | 60 workers | before | 66 | 1363 | 76 | 97 | 0.07 | 0 | 0.39 |
| car-park-verge | 60 workers | after | 0 | 0 | 0 | 97 | 0.22 | 0 | 0.96 |
| kitchen-door | hand-over | before | 50 | 1458 | 63 | 97 | 0.21 | 0 | 0.32 |
| kitchen-door | hand-over | after | 11 | 37 | 0 | 97 | 0.28 | 0 | 1 |
| kitchen-door | 60 workers | before | 52 | 1048 | 53 | 97 | 0.09 | 0 | 0.43 |
| kitchen-door | 60 workers | after | 10 | 38 | 0 | 97 | 0.12 | 0 | 0.98 |
| playground-park | hand-over | before | 31 | 1857 | 58 | 95 | 0.21 | 0.06 | 0.49 |
| playground-park | hand-over | after | 2 | 9 | 0 | 95 | 0.49 | 0.18 | 1 |
| playground-park | 60 workers | before | 32 | 1885 | 57 | 95 | 0.08 | 0 | 0.45 |
| playground-park | 60 workers | after | 2 | 10 | 0 | 95 | 0.08 | 0 | 0.94 |
| suburban-garden | hand-over | before | 31 | 911 | 32 | 95 | 0.28 | 0.05 | 0.62 |
| suburban-garden | hand-over | after | 0 | 0 | 0 | 95 | 0.60 | 0.57 | 1 |
| suburban-garden | 60 workers | before | 31 | 1139 | 40 | 95 | 0.07 | 0 | 0.59 |
| suburban-garden | 60 workers | after | 2 | 8 | 0 | 95 | 0.13 | 0 | 0.94 |

Reading it. Before, the outside alerts alone failed I11 on 7 of 8 runs (0.32-0.62 against 0.60); after, they pass with a
wide margin on all 8. The run shares rose where the human cards had been the main cause (suburban-garden 0.28 -> 0.60,
playground-park 0.21 -> 0.49) and not where the colony's own alerts fill the day. The "after" and "before" colonies are
not the same colony after the first crushed ant (the runs diverge), so the colony-side rows differ a little between them.

Per-alert tables of every run (raised, updated, cleared, seconds at warning and critical, longest stay, loud hours as
main cause and as participant) are in `test-output/quiet-time/{before1,after2}/quiet-*.md`, and each loud hour's causes
(`by.alerts` shares) in the `.json` (`hourRecords`). The alerts that make the remaining loud hours, **after**, with
raised / warning s / critical s / hours made loud (as participant), per run:

| run | what keeps the hours loud |
|---|---|
| car-park-verge hand-over | food-p-low 1 / 2285 s / 61 h (never cleared), brood-stalled 2 / 1850 s / 58 h, heat-danger 2 / 175 s / 9 h, nest-flooding 1 / 225 s critical / 8 h |
| car-park-verge 60 w | food-c-low 1 / 2468 s / 65 h, brood-stalled 35 h, heat-danger 14 h, nest-crowded 11 h |
| kitchen-door hand-over | food-c-low 1 / 2491 s / 64 h, brood-stalled 3 / 1150 s / 34 h, heat-danger 14 h, nest-flooding 150 s critical / 6 h |
| kitchen-door 60 w | food-c-low 1 / 2685 s / 72 h, brood-stalled 30 h, heat-danger 14 h, nest-crowded 13 h, nest-flooding 4 h |
| playground-park hand-over | nest-flooding 1 / 650 s critical / 19 h, food-c-low 565 s / 17 h, heat-danger 7 h, brood-stalled 6 h |
| playground-park 60 w | food-c-low 1 / 3000 s / 77 h, brood-stalled 46 h, nest-crowded 10 h, heat-danger 9 h, nest-flooding 5 h |
| suburban-garden hand-over | nest-flooding 1 / 650 s critical / 19 h, food-p-low 519 s / 12 h, heat-danger 3 / 200 s / 11 h |
| suburban-garden 60 w | food-c-low 2 / 1968 s / 47 h, nest-crowded 1 / 1025 s / 28 h, heat-danger 14 h, brood-stalled 14 h |

(The "60 workers" runs raise the colony by `cheat.spawnAnts` as `life.ts --workers` does, **without food**: their stores
are empty, so `food-c-low` stands for the whole run. That is a property of the cheat, not a finding; a run with `--food`
was not made.)

## 4. Step 3: the colony's own alerts — bookkeeping or real trouble

- **One card, updates, no re-raise**: already so. Every colony alert is keyed `kind:colony`; `brood-stalled` shows 29-72
  `update` events per run, all on one card (count badge), at most 3 cards per run (each its own cooldown). `food-c-low`
  and `food-p-low` are raised once (at the stage change) and stand until the stage is `fed`.
- **Level falls back when the cause eases**: was missing. `raiseAlert` only ever escalated; a diagnostic going `bad` ->
  `warn` kept the higher level. Added (see §2): the same `diagnosticId` asking for a lower level lowers the card. It
  matters for the diagnostics whose `warn` is a `notice` and `bad` a `warning` (`nest-crowded`, `dig-stalled`): a crowded
  nest that eases is no longer a loud hour. Measured: suburban-garden 60 workers `nest-crowded` 44 loud hours with the human change alone (`after1/`), 28 with the ease rule
  added (`after2/`); suburban-garden hand-over run share 0.28 before, 0.38 with the human change alone, 0.60 with both (single
  runs: the colony diverges between runs, so read the direction, not the size). Tests: `alerts.life.test.ts`.
- **Real trouble, not bookkeeping** (each is one card, correctly standing while the cause stands):

| Alert | Cause in these runs | Owner | Reproduction |
|---|---|---|---|
| `food-c-low` / `food-p-low` (warning, 12-77 loud hours) | stores below `LEAN_DAYS`; the colony stage stays lean the whole 6 gd (hand-over colonies of 9-15 workers that do not grow; the 60-worker runs have empty stores by the cheat). Raised once at `fed` -> lean (`colony/starvation.ts raiseStageAlerts`), cleared only at `fed` | colony engineer | `node tools/sim/run-ts.mjs tools/sim/quietRun.ts --archetype kitchen-door --days 6` (`food-c-low` 2491 s, never cleared) |
| `brood-stalled` (warning, 6-58 h) | `diag-brood-growth` `bad` for `BROOD_STALLED_GD` and a larva present (`colony/diagnostics.ts`); protein and carbohydrate factors lead | colony engineer | same run (kitchen-door 3 cards, 1150 s) |
| `nest-flooding` (critical, 4-19 h, 75-650 s) | a rain event floods the nest: one card for 650 s = 26 clock hours over the storm in suburban-garden and playground-park hand-overs (gd about 4) | nest / weather owner | `... --archetype suburban-garden --days 6` (650 s critical from gd 3.96) |
| `heat-danger` (warning, 7-14 h, 100-200 s per card) | `diag-heat-exposure` `warn` when > 10 % of the surface ants are within 3 C of their stress temperature at noon: the AI foragers keep crossing hot ground at 11:00-16:00 | environment (diagnostic) and foraging behaviour (the AI's heat avoidance) | any run: hours 76-83 and 102-105 of suburban-garden |
| `nest-crowded` (notice, warning when `bad`, 10-28 h on the 60-worker runs) | 60 workers in the small hand-over nest; `bad` = warning level | nest | `--workers 60` runs |
| `colony-starving` (critical) | one run (playground-park 60 w, 21 s) | colony | — |

**Ruling asked of the integrator (not decided here).** GDD 08 §6.1 says a warning stays on screen "until resolved, max 30
real s, then collapses to the '+n' chip", while I11 counts an alert "active" as long as it exists in the list. A standing
warning (`food-c-low` for days) is one card the player has long seen and either acted on or not, yet it makes every
daytime hour loud, and the whole-game share is then decided by whether the colony is in trouble at all, which the sim
(that does not grow colonies yet) is, always. Two options: count an acknowledged warning (or one older than N game hours)
as not loud in `quietTick`, or keep I11 as is and take it as the colony engineer's acceptance. The quiet tracker is
`ecology/creatures/threat.ts` (not mine); `alertActive` there is the one line.

## 5. Step 4: E25 in a whole game

`quiet.long.test.ts` (`FOUNDRESS_LONG=1`, 4 cases, 19 min here): from the cached hand-over (calendar day about 8.5) to the
first tick of winter (12.3-12.7 game days), AI only, `humanActivity: normal`, one run per case, every trailing 3-gd window
ending at a counted hour (126-128 windows per run, window sizes from the first counted hour: partial windows early on).

| case | preset (min) | workers | share (run) | min window, all alerts | windows failing | min window, outside alerts + threats | what makes the failing windows loud |
|---|---|---|---|---|---|---|---|
| suburban-garden | Naturalist (0.60) | 9 -> 8 | 0.61 | 0.16 | 63 of 126 | **1.00** | nest-flooding (2 cards, 850 s critical, 21 h), brood-stalled (1550 s, 29 h), food-p-low (519 s, 12 h), heat-danger (11 h) |
| kitchen-door | Naturalist (0.60) | 15 -> 12 | 0.40 | 0 | 109 of 128 | **1.00** | food-c-low (2680 s, 66 h), brood-stalled (4 cards, 2650 s, 64 h), heat-danger (14 h), nest-flooding (7 h) |
| suburban-garden | Gentle (0.75) | 9 -> 10 | 0.58 | 0 | 63 of 126 | **1.00** | brood-stalled (2300 s, 62 h), nest-flooding (8 h), food-p-low (11 h) |
| kitchen-door | Harsh (0.40) | 15 -> 9 | 0.36 | 0 | 121 of 128 | **1.00** | food-p-low (2 cards, 3774 s, 88 h), brood-stalled (70 h), nest-flooding (3 cards, 1150 s critical, 30 h), heat-danger (17 h) |

The test asserts the outside-alerts-and-threats share >= `QUIET_SHARE_MIN` in every window (passes, 4 of 4); the all-alerts
share is asserted only with `FOUNDRESS_QUIET_STRICT=1`. **E25 as written (all alerts, the AI colony) is not met**, and its
failing windows belong to the colony engineer (food, brood), the nest/weather owner (flood, heat) as in §4. Not done:
the "spring start" half (the tool stops at winter; the overwintering lapse is not driven), and Gentle/Harsh on one world
each rather than both.

**Bird events** (the criterion "> 0 once the colony has 30 workers"): not met by these runs. 8 six-day runs: one bird event
in all (suburban-garden, 60 workers, after); the director refused a new threat in 54-95 of ~97 daytime hours in every run,
in all but a few of them because of the trailing share (`blockedByShareHours`), i.e. because of the colony's alerts above.
No run had a colony of 30 workers that was not also in standing trouble. The fix to the human side does remove one of
the two causes the task named (the human cards); the second (the colony's own) is §4.

## 6. Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | The step-1 table before and after | met | §3, `test-output/quiet-time/{before1,after2}/` (8 runs each: 4 worlds x hand-over and 60 workers, 6 gd, Naturalist) |
| 2 | I11 met on the four worlds in 6-gd runs and the whole-game check, or each failing window named with its alert and owner | partial | met for everything this task owns (outside alerts + threats: min window 0.94-1.00 in 8 of 8 six-day runs, 1.00 in 4 of 4 whole-game runs incl. Gentle 0.75 and Harsh 0.40); not met for all alerts (0.04-0.60 per run), failing windows named in §3-§5 with owners (colony, nest/weather); ruling asked in §4 |
| 3 | Human-event counts per game day by kind match GDD 04 at off/low/normal/high, unchanged | met | `test-output/quiet-time/counts/counts-{suburban-garden,kitchen-door}-1.md` (drawn over a default year vs expected, e.g. suburban normal: footsteps 11.3/11.4, car 2/2, watering 0.54/0.38; kitchen normal: footsteps 18.0/17.9, sweeping 3.9/4.0, food-drop 5.0/5.1; off = 0 everywhere, low about half, high about 1.5x); scheduler untouched; `schedule.test.ts` E22-E24 pass |
| 4 | No player-relevant event loses its telegraph; possessed-ant scenarios pass unchanged | met | cues, `human.telegraph`, impacts untouched (only `warn()` removed); `telegraph.test.ts`, `crush.test.ts`, `kitchen*.test.ts` unchanged and passing (human folder: all files pass, 48 tests before this task's 5 new ones); new test: telegraph plays with no card when no ants are near |
| 5 | Report | met | this file |

Spec items not in the table: determinism (save -> load mid-card equals uninterrupted: `alerts.test.ts`, `alerts.life.test.ts`;
`determinism.test.ts` passes); typecheck of the whole tree clean at the end.

## 7. Verification

- `npm run typecheck`: clean (whole tree, 00:43 UTC).
- `npx vitest run src/sim/environment/human src/sim/progression`: 25 files passed, 3 skipped (the LONG ones), 284 tests, 79 s
  (includes `perf.verify.test.ts` of the human folder is `describe.skipIf(!FOUNDRESS_LONG)`, so in that run it was one of the 3
  skipped files: the earlier statement that it passed was wrong). Run with `FOUNDRESS_LONG=1` in the review fix round it passes
  its 2 ms/tick limit. `npx vitest run src/sim/balance`: 99 passed.
- `FOUNDRESS_LONG=1 npx vitest run src/sim/environment/human/quiet.long.test.ts` (from a frozen copy): 4 passed, 19 min.
- Under load the batches took 3-6 min per 6-gd run; no timing numbers are reported because none were measured for a budget.

## 8. Decisions, contradictions, notes for others

- **GDD 06 §4.5 (recorded in the review round).** The auto-slow table maps `footfall-warning` to `human-event-warning`
  (warning) as "human `footsteps` warning active within 120 BU of a trail or entrance". The card here is raised only for a
  player ant on the surface within footprint + 60 mm of an impact due in 3 s (the task spec's narrower rule). Followed:
  the task spec and GDD 04 §15.3 / GDD 08 (what the player can act on); so the §4.5 trigger "a footsteps warning active
  near a trail or entrance" is true less often than the table implies, and a footstep pass over an entrance with every ant
  inside (sand or loam, block chance 0.5, GDD 04 §15.4) raises no card and therefore no auto-slow. The old `warn()` also
  needed exposed surface ants, so this is not a regression. The integrator should either accept this or rewrite the §4.5
  row as "a `human-event-warning` card is active" (which it effectively is already, by key).

- **Precedence note.** GDD 04 §15.3 ("Alerts use chapter 08's `human-event-warning`") and GDD 08 §6.5 (focus: event area)
  leave the duration open; GDD 08 §6.1 (warning "until resolved") and I11 (an alert counts while active) collide for any
  alert that stands. Followed: GDD 05 §6 ("if the soak fails, tune ... human-event frequency, not alert thresholds"; the
  frequency is unchanged and no threshold is moved: the change is *when the card exists*, which GDD 04 leaves to this module).
  The card's focus is now the impact the ants are in the path of, not the event area's centre.
- Not changed, on purpose: the alert thresholds, `ALERT_COOLDOWN_GAME_H`, `THREAT_MIN_QUIET_GD`, the human frequencies,
  the warning level of the card. The card is raised at `warning` as the catalogue says.
- Tool notes: `tools/sim/quietRun.ts` must import `./threatFunnel` first (the sim modules' import cycles break system
  assembly when a deep module is entered first). `--days` caps `--until-winter 1`. The hour record is the sim's
  (`quietTracker`); the tool only attributes. `outsideOnly` = people, predators, nest-attacked, raid-seen, queen danger,
  possessed danger.
- Things I did not touch because they are others': `colony/starvation.ts` (stage alerts stand until `fed`),
  `colony/diagnostics.ts` (`brood-stalled`), `nest/flood` (one 650 s critical card per storm), `environment/effectsHeat.ts`,
  `ecology/creatures/threat.ts` (`alertActive`). A possible simple lever for the colony side that is within `progression`
  but needs the colony engineer's agreement: let a standing `food-*` card fall to `notice` after N game days.
- The earlier `human-event-warning:<instId>` keys are gone. A saved game with an old-style card active expires it at once
  (`expireHumanAlerts` clears every card of the kind whose lifetime is over); no migration needed, cards live seconds.
