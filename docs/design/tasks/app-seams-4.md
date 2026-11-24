# Task app-seams-4 — Play the first hour to its last beat (Sonnet implement / Opus verify, visual)

Written Nov 24 ~13:50 UTC by the integrator after `look-pass-6` and `opening-fix` landed. The simulation engineer works
in `src/sim/**` at the same time (`winter-sugar.md`) and runs two life runs: expect a loaded machine; `src/sim` may not
compile for a few minutes now and then (wait, retry once, never edit it).

## Where the game stands in the browser
`tests/e2e/firstplay.mjs` without stand-ins passes beats 01–13 on seeds 1–5 (the founding, the time lapse, the outcome
card, the first workers out). With the script's clutch fixed to its intended 24 eggs, seed 1 hands over 14 workers and
passes to beat 19; it stops at 19 → 20: the colony-view dig planner refuses the plan the script places
(`anchor-not-in-nest`: `validatePlan` finds no open nest sample within the snap distance of the hovered point; the
script hovers the chamber centre + 0.9 × its x radius and only rotates the yaw). Seed 2 stops at 13 → 14: no linked
trail forms while the founding cell's larder is full (the colony's sugar need is 0), and on the older tree at 15 → 16:
a worker cannot hand over her load at a full larder. No run has reached beat 25 (save, quit to title, continue) without
a stand-in since the project began.

## Goal
One uninterrupted `firstplay.mjs` to beat 25 on seeds 1, 2 and 3 with no stand-in, every picture looked at; and the
visible defects below fixed. Each item: reproduce with a picture or a log, find the cause, fix, same picture again.

## Read in full
`docs/design/tasks/look-pass-6-report.md` ("Still unfinished"), `reviews/look-pass-6.json`,
`docs/design/tasks/opening-fix-report.md` section 3 (browser table, full runs), `tests/e2e/firstplay.mjs` and
`tests/e2e/lib/firstplay-steps.mjs`, GDD 01 (opening, first hour, §6 cameras incl. 6.5), GDD 08 (cards, alerts, colony
view, dig planner, water), GDD 03 §dig plans as far as the planner's anchor rule goes.

## You own
`src/render/**`, `src/game/**`, `src/ui/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `tools/harness/**`,
`docs/MANUAL.md`, `README.md`, `docs/design/gdd/DEVIATIONS.md` (rows for what you change),
`docs/design/tasks/app-seams-4-report.md`. Not `src/sim/**`, `src/worldgen/**`, `src/core/**`: a cause there goes in
your report with a reproduction (seed, steps, state dump), and you work round it in the script only where the script
was doing something a player would not do.

## Work — in this order
1. **Beat 19 → 20, the dig plan.** Decide first whose fault it is by doing what a player does: in the colony view,
   click to place a chamber plan beside the founding cell with the planner tool on seeds 1–3. If a player's click on
   soil beside an open cell is refused, the planner's pick or snap is wrong (the anchor should snap to the nearest open
   nest sample within a sensible distance of the hovered soil, and the preview should say why when it cannot): fix it,
   with a unit test at the planner. If the planner is right and the script hovers a point no player would (inside
   solid, far from any opening), fix the script's geometry, not its assertion. Pictures of the preview valid and
   invalid with its reason shown.
2. **Beats 13 → 16 on a full larder (seed 2).** A player's first worker out finds food while the founding cell's
   larder is full: what does the game do and show? Per GDD 02 / 08 a load that cannot be stored is carried to another
   store or refused with a visible reason; a worker standing with a full crop and no feedback is a defect of the app's
   feedback even if the sim's cap is right. Make the HUD say why ("Stores full - dig a food chamber" as an alert or the
   prompt's reason, per GDD 08's alert list), and make the script play it as a player would (the trail check when the
   colony wants no sugar: place the spill, or wait, as the tutorial's own guidance says). No assertion weakened; if a
   beat's assertion cannot hold by design, say so in the report and propose the beat's correct form.
3. **Ants between the camera and the possessed ant** (integrator ruling as GDD owner; DEVIATIONS row): the 4 × 4
   ordered dither of GDD 01 §6.5 rule 2 reads as broken hatching in a crowded chamber
   (`test-output/look6/sheets/item1-worker-tunnel-crowd-low-before-after.png`, bottom right;
   `look6/cc/cc-after-noon-crowd-*.png`). Replace it: an ant (or any creature) whose body lies inside the cone between
   camera and subject and nearer the camera than half the boom is **not drawn**, with a short smooth fade (alpha, not a
   screen-door pattern) as it enters and leaves that zone; everything else is drawn solid. The possessed ant herself is
   never faded while the camera is outside her. Pictures: the crowded chamber at low / medium / high, a tunnel with a
   worker passing the camera, the founding cell.
4. **Flood water reads as a pale rectangle** (`test-output/look6/sheets/item1-s2-low-real-beats-07-10-after.png`: a
   translucent blue-white slab with square corners over the queen; edge-on a pale band). Water in a cell or shaft must
   read as water with a shore: the surface clipped to the open cavity's outline at the water level (not to carve
   cells' squares), a soft edge where it meets the wall, darker and more transparent than now, a faint specular
   ripple; from the cut-away camera the queen is visible through it. Pictures: seed 2's flooded cell from the cell
   camera and from the colony view, and a puddle outdoors for comparison (the outdoor puddle look is the reference).
5. **Outcome card**: the queen's head touches the card's top edge (`look6/sheets/item3-s1-high-real-beats-09-12-after.png`,
   bottom right) and the cell is cut by the top of the frame. Frame the cell whole between the HUD's top band and the
   card, queen in the middle third, on seeds 1–3 (real foundings).
6. **Night contrast of the ant** (look-pass-6's unfinished 8): at 22:00 and 02:00 the ant has almost the luminance of
   the ground. A faint cool rim light on ants and creatures at night (moon side), no change to the ground exposure;
   pale leaf litter must not outshine the soil. Pictures at 22:00 and 02:00, clear and rain, ant height and observer.
7. **The full run**: `firstplay.mjs` to beat 25 on seeds 1, 2, 3 without stand-ins, one uninterrupted run each
   (`--script-timeout` long enough; about 15–25 minutes each on this machine). For every failing beat: cause, owner,
   fixed if yours. Then `panels.mjs`, `controls.mjs`, `views.mjs`, `hud.mjs`, `save.mjs`, `lifecycle.mjs`,
   `stage1a.mjs` strict. **Look at every picture of the three runs** and list, most serious first, what a player would
   still call broken or unfinished, with paths.
8. `docs/MANUAL.md` against what the three runs show (opening, lay prompt busy state, stores full, dig planner).

## Acceptance criteria
1. Typecheck clean on your paths; tests green in every folder you touched (folder by folder; never the whole suite).
2. Items 1–6: before / after pictures under `test-output/app4/`, same script and pose, each looked at; unit tests for
   the planner anchor, the occluder fade rule, and the stores-full feedback.
3. Item 7: three full runs to beat 25 without stand-ins, or each failing beat reported with cause and owner; the
   other scripts pass or are reported.
4. Draw calls and triangles at low / medium / high do not rise by more than 5 % on the same staged scene before and
   after (the water surface and the rim light included).
5. Report `docs/design/tasks/app-seams-4-report.md` with picture paths and the still-unfinished list.

## Machine rules
4 cores shared with the simulation engineer's two life runs. One harness or browser process at a time (check
`pgrep -f chrome-headless`); never leave a dev server or a browser running; no vitest while a harness run is going;
never the whole vitest suite in one process. Disk is short (about 7 GB free): keep pictures, delete videos, traces and
duplicate runs. Use `date -u` for every time you write. Integrator rulings appear at the tail of this spec as
"Integrator ruling N" and as an INTEGRATOR NOTE line at the tail of your progress file: re-read both each time a run
finishes and before you close.
