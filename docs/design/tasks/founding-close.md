# Task: founding-close — finish the opening (round 3)

Read first: `docs/design/tasks/founding.md` (all addenda), `docs/design/tasks/reviews/founding.json`
(the review), and the round-2 fix report below. Rounds 1 and 2 fixed nine of twelve findings.
This task closes what is left so the opening is playable end to end in the browser, on the
default start, on any generated world. It is on the critical path to the first playable build.

Owner paths: `src/sim/colony/founding/**`, `src/game/flows/founding/**`, `src/ui/screens/founding/**`,
`src/sim/balance/founding.ts`, `tests/e2e/founding.mjs`. Authorised edits outside them are named per item.
Do not edit `src/sim/ants/**`, `src/sim/combat/**`, `src/sim/ecology/**`, `src/worldgen/**`, `src/render/world/**`
(other engineers are in them now).

## 1. Sealing must work in every throat the dig can produce (blocker)

Round 2's browser run dug a 55° shaft, 2.1 BU wide at the throat, placed about 64 plug voxels with the
real `seal-entrance` action and then got `no-target` with a gap still open. A player can produce that
shaft, so a player can get stuck. Requirements:

- While the entrance is not sealed and the queen is inside her cavity, `seal-entrance` never refuses
  with `no-target`. Target choice must come from the actual leak: flood from the outside air through
  open voxels into the cavity and plug where the leak crosses the throat (or an equivalent method that
  cannot leave a gap it cannot see). The queen may need to move to reach it: either the action walks
  her, or the refusal says where to stand and the prompt shows it. No silent dead end.
- Bounded effort: sealing any legal throat takes a bounded, sensible number of actions (state the bound
  and test it).
- Property test (headless, real actions, no cheats): shaft pitches 30°, 45°, 55°, 70°, 85° x throat
  widths 1.5, 2.1, 3.0 BU x two soil types. Every case ends sealed, entrance state agrees with the nest
  module, and the chamber is still connected to nothing outside.
- The passive-player auto-seal uses the same code path.

## 2. First workers before winter on the default start, on generated worlds (blocker)

Round 2 measured: default start (Summer 3) gives a hand-over on 6 of 8 test worlds; Summer 2 gives 8 of 8;
generated seed 1 fails at Summer 3. Rulings (orchestrator, binding):

- Authorised: set `startDoy.default` to 9 in `src/sim/species/data/lasius-niger.ts` (inside the design
  window 9–12). One-line edit; update any test that pins 10.
- The design brief says the first brood is fast-tracked. If the start-day change alone does not meet
  the acceptance below, add a founding-only development-rate factor in `src/sim/balance/founding.ts`
  (applies to the claustral brood only, not to later brood) and raise it only as far as needed. State
  the value and the measured margins in your report. Do not change the environment's temperature model.
- Acceptance: on generated worlds, seeds 1–8, default start, the default (auto-chosen or nearest good)
  site: hand-over with a worker count in the chapter's range and at least 1.0 game day of autumn-free
  margin (hand-over no later than the last day of summer). The reviewer's `outcome.verify.test.ts`
  passes. Put the sweep behind `FOUNDRESS_LONG` and run it once; keep one or two seeds in the always-on
  suite if they run in under 30 s.
- The debug complete-founding cheat could not carve at some sites, so two of the round-2 sweep runs said
  nothing. Fix the cheat or make the sweep use the real passive path, so every run measures something.

## 3. Browser end-to-end to completion (acceptance)

`tests/e2e/founding.mjs` runs to the end with no stand-ins and no console errors, on the default seed
used by `autostart` and on one other seed, and produces every screenshot: 01 intro, 02 site read-out,
03 entrance mound, 04 sealed chamber with eggs, 05–07 time-lapse stages, 08 outcome card, 09 workers at
the reopened entrance, 10 possessed worker outside, 11 failure card, 12 retry. Look at every screenshot
yourself (Read the PNGs) and describe each in the report. Quality `test` for the run, plus shots 04 and
09 once at `quality=high`. Harness: `node tools/harness/play.mjs --root . --query '...' --script
tests/e2e/founding.mjs --out test-output/fnd-close --script-timeout 1500000`. Run at most one browser at
a time; other engineers are using the machine.

## 4. No false alarms in the opening

- The waste alert ("midden blocked") must not show during the claustral founding. Authorised: a guard
  in `src/sim/colony/midden.ts` / `src/sim/colony/diagnostics.ts` using the same "founding in progress"
  signal that round 2 used to hold the starvation clocks. Keep it to a few lines and add a test.
- An empty red alert card appears in the HUD during the opening (visible in round-2 screenshot 03).
  Find which alert has no text and fix the cause: either the text lookup (`src/content/text/alerts.ts`,
  authorised: add the missing entry) or the card rendering an alert it should filter (authorised: the
  HUD alert component, minimal change). An alert without text must never render as an empty card —
  add a test that every alert id the sim can raise has text.

## 5. Loose ends

- Round 2 saw the reviewer's `handover.verify.test.ts` fail once in a full-folder run and pass alone.
  Run the founding folder three times; if it fails again find the cause (shared module state, a clock,
  test order) and fix it.
- Site abandonment (GDD 03 §13.4) stays partial unless it is cheap; say what a player sees today if she
  walks away from a half-dug site.

## Test-cost rules

Never run the whole vitest suite. Run your folders only (`npx vitest run src/sim/colony/founding
src/game/flows/founding src/ui/screens/founding`). `npm run typecheck` once near the end; errors about
`process` in other engineers' new test files are theirs — ignore them.

## Report

For each numbered item: done / not done, the evidence (test names, sweep table, screenshot descriptions),
and anything the first-playable gate must know.
