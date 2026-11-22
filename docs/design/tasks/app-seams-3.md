# Task app-seams-3 — Small app-side defects left by look-pass-4 and app-seams-2 (Sonnet implement / Opus verify, visual)

## Goal
Close the app-side items the last two tasks reported and did not own or did not reach. Small, each proven. The colony engineer is working in `src/sim` at the same time (round 9 of colony-life) and running life runs, two at a time.

## Read in full
`docs/design/tasks/look-pass-4-report.md`, `docs/design/tasks/reviews/look-pass-4.json` (notDone, needsFromOthers, notesForIntegrator), `docs/design/tasks/app-seams-2-report.md` (its "not done" list), GDD 08 alert table (`docs/design/gdd/08-ux-audio-art.md`), `docs/design/gdd/DEVIATIONS.md` (format of a deviation row).

## You own
`src/render/**`, `src/game/**`, `src/ui/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `tools/harness/**`. Not `src/sim/**`, `src/worldgen/**`, `src/core/**`: a cause there goes in your report under "needs from others" with the file and line, unfixed.

## Work, in this order; progress file `docs/design/tasks/progress/app-seams-3-impl.md` after each item
1. **A corrupted save file loads.** `src/game/save/save.verify.test.ts` › "bytes with trailing garbage, an empty input and a lone prefix are rejected without throwing" is red: flipping byte 11560 of an exported save still parses as ok. Find which bytes of the container are not covered by a check (gzip header fields, padding, a trailer, an uncompressed section) and make the parser reject any single-byte change and trailing bytes, without making a valid save of an earlier build unreadable (state what happens to saves written before the fix, and test it with a fixture written by the current code before your change). Every other test under `src/game/save` stays green.
2. **The flood alert of the founding chamber is titled "Queen under attack"** (`src/content/text/alerts.ts` `queen-in-danger`; pictures `test-output/look4/firstplay/09*`, `10*`). Water is not an attack. Give the title a wording that is true for both causes ("Queen in danger"), or choose the title from the alert's cause on the UI side if the alert carries one; keep the sim's alert kind and its tests untouched; add the GDD 08 deviation row. Picture: the alert card with the flood cause and with an attacker cause (stage both with the debug API or cheats in a harness script).
3. **The backdrop cars have never been seen** (`src/render/world/boundary/backdrop.ts`, `carDetail`). Find a world that has them (the road treatment; read the code for which boundary sides and archetypes get it, then try seeds) and take a picture at ant height looking at them and one from the meta camera; if no world shows them from anywhere a player can stand, say so with the numbers and stop. Fix what looks wrong; if they read as cars, leave them.
4. **`stage1a.mjs` strict fails at its egg beat** with `lay-egg refused (lay-egg:budget); 6 eggs cheat-spawned` after a cheat-completed founding. Decide by reading the code whether the script asks for something the game should refuse (then fix the script so the strict run is a real check) or the cheat leaves the queen in a state the game would never produce (then report it for the sim with file and line). Run strict once at the end.
5. From app-seams-2's not-done list, only these two: the epitaph screen's cause line after `cheat.killAll` (if the cause is set in `src/sim`, report it; if the screen can show the true cause from what it has, fix it), and the queen's gloss (look at `test-output/look4/item2e/fp-until05/05-site-readout.png`: the queen is the first thing a player looks at; if she reads flat or plastic at that distance, tune her material and show before/after at test, medium and high).
6. Report `docs/design/tasks/app-seams-3-report.md`: per item what was wrong, what changed, the picture or test that shows it, and what is left.

## Acceptance criteria
1. Typecheck clean; tests green in every folder you touched, folder by folder (never the whole suite in one process).
2. `save.verify.test.ts` green, with a test that a save exported before the change still loads or a stated, tested migration message.
3. Pictures for items 2, 3, 5 under `test-output/app-seams-3/`, each looked at by you.
4. No change under `src/sim`, `src/worldgen`, `src/core`.

## Machine rules
4 cores shared with life runs and one other engineer. One headless browser at a time (`node tools/harness/play.mjs --root . --query '?test=1&seed=N&quality=…&autostart=1' --script tests/e2e/<x>.mjs --out DIR --script-timeout N`; a load takes ~100 s under load, use generous timeouts). Global Playwright only (never npm-install it). No `@types/node`; no `process` in test files. `date -u` before writing a timestamp. Do not commit; the integrator snapshots the tree.
