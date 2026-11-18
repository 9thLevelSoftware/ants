# Task app-seams-2 — HUD pieces the design specifies and the game lacks; wrong strings (Sonnet implement / Opus verify, visual)

## Goal
The documentation task (`docs/design/tasks/reviews/docs-final.json`, `docs/MANUAL.md` "known problems") found settings and screen rows that do nothing and strings that are wrong. Build what the design specifies; correct or remove the rest.

## Read in full
GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): §3 HUD (element table with the Focus line and the Minimap rows: positions, content, when shown), §6 alerts and auto-slow, the settings table; GDD 06 §4.5; `docs/design/tasks/reviews/docs-final.json` (the notes "wrong strings in the game"); `docs/design/tasks/look-pass-3.md` and its report if it exists (it changed HUD files just before you: read its diff of `src/ui/**` first).

## You own
`src/ui/**`, `src/game/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `docs/manual/**` and `docs/MANUAL.md` (regenerate what your changes make stale; the generators are under `test-output/docs-final/` if they survive, otherwise edit by hand and keep `tests/docs/docs-final.test.ts` green). Not `src/sim/**` except `src/sim/config/presetDisplay.ts` display strings.

## Items
1. **Minimap** (GDD 08 §3 row "Minimap", T2, setting Never / Always, default Never): top-down, north-up, 256 × 256 BU window round the camera target; zones as flat tints, entrances as rings, markers as icons, the possessed ant as an arrow, trails when the scent view is on; click moves the observer; hidden in compact layout. Wire `gameplay.minimap`.
2. **Focus line** (GDD 08 §3 row "Focus line", T2, Auto / Always / Never): the current top aim, click opens Journal > Aims; shown during the first 2 game days of a new colony, then for 30 real seconds when a new aim opens (Auto). Wire `gameplay.focusLine`.
3. **Auto-slow settings**: controls for `autoSlowCritical` and `autoSlowWarning` in Settings > Gameplay; the preset's "Automatic slow-down at an alert" default (`autoSlowDefault`) becomes the default of those settings for a new game, or the row is marked not in effect — coordinate with `presetDisplay.ts` `UNWIRED_PARAMS` (another engineer may be editing that list: re-read before you edit, one-line edits only).
4. **Rules not offered**: `winterMode` and `extinctionEndsGame` exist as rules and no screen offers them: add them to the New Game custom rules with the design's wording, or flag them not in this build if the sim side does not honour them (check with a short harness run).
5. **Strings**: New Game help says the natural start is "on day 3" (it is the species' day: 5 for the reference species since R20; derive it from the data); "1 young rivals nearby" (plural rule); `PRESET_TEXT` claims that are not measured ("mistakes can be recovered from", "losing colonies is the usual outcome") become descriptions of what the preset changes; one preset summary text, not two; rule effect texts that name parameters not in effect say so; the Photo mode row of `controlsMarkdown()` puts the pad chord in the keyboard column; the comment in `src/content/text/controls.ts` names the wrong file; the title menu's Lineage note and "rules can be changed later in Settings" in `docs/manual/`.
6. **Overlap**: the prompts "Groom yourself" / "F Dig" overlap the intro card text in the opening (`test-output/readme-shot/page.png`): prompts stay hidden while a blocking card is up.
7. **Species flag**: `&species=<id>` accepts unavailable species outside test mode: restrict it to `?test=1`.
8. **One manual**: `docs/manual/` (older draft, partly test-covered) and `docs/MANUAL.md` both exist: make `docs/MANUAL.md` the manual, move what is only in the old folder and still true into it, delete the old folder, and point the controls test at the one file.

9. **Journal dates** (from `sim-seams`): journal and event-log entries now carry `calTick` (`JournalEntry.calTick`, `EventLogEntry.calTick`; helpers `entryCalTick`, `entryDate` in `src/sim/progression/journal.ts`). Pass it through `src/game/uiBridge/panels/journalSlice.ts` and date entries from it in `src/ui/panels/journal/timeline.ts` (`dateLine`, `timeLine`) and `charts.ts` (`calDay`): today every entry from before a winter shows on the wrong day. Harness picture of the journal across a winter.
10. **Manual drift** (from `sim-seams`): the opening grace period is in effect now — `docs/MANUAL.md` must drop "(not in effect)" from that row and correct the count of rows not in effect; `tests/docs/docs-final.test.ts` is red until then. Re-read `UNWIRED_PARAMS`, `UNWIRED_RULES` and the new `UNWIRED_WHY` in `src/sim/config/presetDisplay.ts` and make the New Game screen and the manual agree with them.
11. **Epitaph by cheat**: `tests/e2e/lifecycle.mjs` kills the colony with `cheat.killAll`, which books deaths as "unknown": pass a cause, so the epitaph screenshot shows real causes.

## Acceptance criteria
1. Typecheck clean; tests green in every folder you touched; `tests/docs/docs-final.test.ts` green.
2. Harness screenshots (looked at) of: the minimap in observer and possession views with a marker and an entrance visible, with scent view on; the focus line on a new colony and when a new aim opens; the settings rows; the New Game rules; the opening intro card with no prompt over it. `panels.mjs` and `controls.mjs` pass.
3. Report `docs/design/tasks/app-seams-2-report.md` with the picture paths and anything left undone.

## Machine rules
4 cores shared with other engineers. One headless browser at a time (`pgrep -f chrome-headless` first); global Playwright only; long `--script-timeout`; `date -u` before a timestamp; no git commands that change the index. Evidence under `test-output/app-seams-2/`.
