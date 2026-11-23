# Task look-pass-6 — What the integrator saw in look-pass-5's pictures (Sonnet implement / Opus verify, visual)

Written Nov 23 ~23:50 UTC by the integrator after looking at `test-output/look5/**` and `test-output/look5-fix/**`.
The simulation engineer works in `src/sim/**` at the same time (`opening-fix.md`: the player's founding fails on both
test seeds for sim reasons) and runs life runs and, at times, a browser: one harness process at a time for you, expect
a loaded machine, and retry a script once after a few minutes if `src/sim` does not compile.

## Goal
Three things a player sees in the first ten minutes look broken. Fix them, each proven by a before / after picture taken
the same way that you look at; then the smaller items.

## Read in full
`docs/design/tasks/look-pass-5-report.md` (its "Still unfinished" list and causes), `reviews/look-pass-5.json` (review
and fix reports), GDD 08 (`docs/design/gdd/08-ux-audio-art.md`: night and underground lighting, camera rigs §6–7, the
possession camera's behaviour in tight spaces, cards), GDD 01's opening, `docs/research/tech-stack.md` §7,
`src/render/camera/**` (third-person rig, founding shot), the lighting / exposure code under `src/render/**`.

## You own
`src/render/**`, `src/game/**`, `src/ui/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `tools/harness/**`,
`docs/MANUAL.md`, `README.md`, `docs/design/tasks/look-pass-6-report.md`. Not `src/sim/**`, `src/worldgen/**`,
`src/core/**`: a cause there goes in your report with a reproduction.

## Work — in this order
1. **The possession camera inside the founding shaft and cell is broken**
   (`test-output/look5/firstplay/seed1/09-sealed.png`, `10-first-clutch.png`, `seed2/09-sealed.png`,
   `look5/item6/camera/chamber-follow.png`): the camera sits inside or against the queen and the wall; her body fills
   the lower left of the frame and is drawn with a coarse screen-door dot pattern; a block of white noise shows at the
   bottom of the frame; wall geometry cuts through the view in flat planes; a pale strip floats across the upper right.
   This is the picture the player has while laying the first eggs. Find each cause (camera collision and minimum
   distance in a cavity a few body lengths wide, the possessed ant's fade when the camera is inside her radius, near
   plane against the wall, what the white patch and the strip are) and fix them so that in a cell of the founding's size
   the queen is seen whole or nearly whole from behind and above, the walls read as soil, and nothing is dithered,
   clipped or noisy. If the rig cannot back off, GDD 08's rule for tight spaces decides (follow it and cite it); if it is
   silent: cut the soil between camera and ant away (the cutaway the founding shot already uses) rather than push the
   camera into her. Pictures: seeds 1 and 2, beats 07–10, at low, medium and high; a worker in a tunnel and in a crowded
   chamber on a live colony.
2. **Night is black** (`look5/firstplay/seed1-continue/13-first-workers-entrance.png`: 22:04, rain, the first workers
   leaving the nest — one ant barely visible on a black field; `21-day-2-8x.png`, `25-continued.png`,
   `seed1/06-digging-entrance-mound.png`). A third of the game's clock is night and the first workers come out in it.
   GDD 08's night rule decides what night looks like (read it; the manual's line "night reads like an overcast day" is
   the intent as the integrator understands it). Make the ground, the ants, the entrance and food within 60 BU readable
   at night at every quality tier — moonlight / sky fill and exposure, not a flat ambient lift that kills contrast;
   keep night recognisably night (cool, low saturation, long soft shadows or none). Clear, overcast and rain nights,
   new and full moon if the game has moon phases. Pictures: the same pose at 12:00, 18:00, 22:00, 02:00 and 05:00, clear
   and rain, at ant height and from the observer camera; and beat 13 of `firstplay.mjs` again.
3. **The real founding's outcome card** (`test-output/look5-fix/shot-s1/12-outcome-card.png`): the cutaway shows the
   cell with one worker at its lower rim and the queen as a grey smudge half under the wall at the right edge, where the
   cheat-script picture (`look5/item1/final2-s1/outcome-card.png`) shows her and her workers whole. Frame the queen
   first: she is the subject, in the middle third, whole; the cut follows her and the open space around her, not the
   chamber record's centre; workers and brood join the frame when they are within the open cell. Same for the
   time-lapse. Run the real founding (no cheat) on seeds 1 and 2 with `FIRSTPLAY_UNTIL=12`; if the sim engineer's fix for
   seed 2's flood has not landed, use the failure card for seed 2 and a third seed for a second success.
4. **Smaller, from the same list**: the site read-out says "Poor" in red while five of seven rows show full dots
   (`seed1/05-site-readout.png`) — make the word, the dots and the advice agree (find which is wrong against the sim's
   suitability value and GDD 01 / 06 §5.7); the grey blurry square above the queen in the seed 2 shaft
   (`seed2/07-inside-shaft.png`) — identify and fix; the left tool rail's last icon under the "Queen's reserves" panel in
   the time-lapse; the roster's "Where" column cut and printing chamber ids ("Royal 5740"); buildings washed to pale grey
   shapes at overcast (`seed1/04-queen-surface.png`) — haze strength against GDD 08's overcast look; the speckled band
   along the horizon on the title screen (`seed1/01-title.png`); the clover head's white polka dots up close; the weep
   vents as white ticks.
5. **Reduced motion and constant light in the lapse** (review findings left partly open): see the crossfade drawn in a
   browser with reduced motion on; check the light does not jump when the founding shot ends.
6. At the end: `firstplay.mjs` with `FIRSTPLAY_UNTIL=12` on seeds 1 and 2 on the tree as it then is (the sim may have
   been fixed meanwhile: then run past 12 and report the first failing beat), `panels.mjs`, `controls.mjs`,
   `views.mjs`; look at every picture and append what still reads as unfinished, most serious first, with paths.

## Acceptance criteria
1. Typecheck clean on your paths; tests green in every folder you touched (folder by folder).
2. Items 1–3: before / after pictures under `test-output/look6/`, same script and pose, each looked at, at the three
   quality tiers; the after pictures must stand on their own — a tired player would not call them broken. An item that
   could not be fixed is reported with what was tried.
3. Draw calls and triangles at low / medium / high do not rise by more than 5 % against look-pass-5's table, measured on
   the same staged scene before and after your change (not against an older scene).
4. No frame-time regression at low from the night lighting (same method as the gate report §5; report the numbers).
5. Report `docs/design/tasks/look-pass-6-report.md` with picture paths and the still-unfinished list.

## Machine rules
4 cores shared with the simulation engineer's life runs. One harness or browser process at a time; never leave a dev
server or a browser running; never the whole vitest suite in one process; no vitest while a harness run is going. Disk
is short (about 8 GB free): keep pictures, delete videos, traces and duplicate runs. Check `date -u` before writing a
timestamp.
