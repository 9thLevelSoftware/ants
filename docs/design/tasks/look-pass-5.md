# Task look-pass-5 — What still reads as unfinished in the browser (Sonnet implement / Opus verify, visual)

Written Nov 23 ~17:10 UTC by the integrator. The simulation engineer works in `src/sim/**` at the same time
(`gate-sim-2.md`) and runs colony sweeps: the machine is loaded, and `src/sim` may be mid-edit for minutes at a time (a
type error or a red test there is theirs; retry a browser script once after a few minutes before you report it).

## Goal
Fix the visible defects the integrator and earlier engineers saw in pictures and left open, then play the first hour in
the browser without stand-ins and write down, with pictures you have looked at, everything a player would still call
broken or unfinished. Each item: reproduce with a picture, find the cause, fix, take the same picture again, look at it.

## Read in full
`docs/design/tasks/look-pass-4-report.md` (its "Not done" list), `app-seams-3-report.md`, `docs/STATUS.md` entries
"Nov 22 13:33 UTC" and "Nov 22 13:41 UTC" (browser first play, seeds 2 and 1), GDD 08 (`docs/design/gdd/08-ux-audio-art.md`:
art direction, camera rigs, cards and alerts), GDD 01's opening (founding, time-lapse, outcome card),
`docs/research/tech-stack.md` §7, `tests/e2e/firstplay.mjs` (its beats and environment switches).

## You own
`src/render/**`, `src/game/**`, `src/ui/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `tools/harness/**`,
`docs/manual/**`, `README.md`, `docs/design/tasks/look-pass-5-report.md`. Not `src/sim/**`, `src/worldgen/**`,
`src/core/**`: a cause there goes in your report with a reproduction (seed, archetype, steps, picture).

## Work — most visible first
1. **Outcome card framing** (`test-output/firstplay-r9/seed2`, picture 12): behind the founding's outcome card the
   camera sits against the queen inside the cell; the wall texture is smeared and her body fills the frame, cut off.
   The card is the player's first reward: frame the chamber so the queen and her first workers and brood are all in
   view (a framed interior shot of the founding chamber with a sane near plane and distance, or what GDD 01 / 08 say the
   moment shows — follow the GDD if it speaks). Same for the failure outcome. Pictures on seeds 1 and 2.
2. **White speckle on backdrop faces** (`test-output/app-seams-3/cars/meta-edge.png`, `ant-0.png`): the hashed-alpha
   silhouette fuzz (`BACKDROP_FUZZ` 0.85) sprinkles white dots over every large backdrop face, raised and at ant
   height. Fuzz belongs on silhouette edges only (a per-vertex or edge-distance attribute), or goes; large faces must be
   clean. Pictures: backdrop houses, fence line and parked cars on car-park-verge and suburban-garden, raised and at ant
   height, at low / medium / high.
3. **Kitchen-door wall foot** (`test-output/look4*/facade-tiers/facade-test-near.png`): the air-brick row is a flat pale
   strip and the rows below show z-fighting streaks where coplanar foundation prims overlap. If the overlap is in
   generated geometry (`src/worldgen`, not yours), fix what the renderer can (polygon offset or a depth bias per prim
   layer, a face pattern for the air-brick kind) and report the worldgen cause with the prim ids.
4. **Moulded plastic** (play equipment, garden furniture): large single-colour faces with no surface read at ant
   height. Give the plastic finish a look that reads at 5–50 BU (mould seams or a part line, a fine stipple, edge wear,
   a dirt gradient at the foot) without a new texture download; before / after on playground-park at ant height.
5. **A resolved alert still on screen at the outcome card** ("Founding chamber flooding — Resolved" stays up across the
   lapse and under the card). Decide by GDD 08's alert rules how long a resolved alert stays and whether cards clear the
   feed; fix; picture.
6. **Pictures never taken** (look-pass-4's list): the brood inspector, the queen inspector and the chamber inspector on a
   live colony past the hand-over (use a cached hand-over or `FIRSTPLAY_UNTIL`), each checked for label / value order,
   units and clipped text; a 45° slope and a nest shaft for the possession camera (stage them with the debug API if the
   seed has none). Fix what the pictures show.
7. **The full first hour, without stand-ins**: one uninterrupted `tests/e2e/firstplay.mjs` on seed 1 and one on seed 2
   (all beats, including 14–25: trail, joining a worker, directing, saving and loading). Then `panels.mjs`,
   `controls.mjs`, `stage1a.mjs` strict, `views.mjs`, `save.mjs`, `lifecycle.mjs`. For every failing beat: the cause
   (app or sim), fixed if it is yours. **Look at every picture of both firstplay runs** and list, most serious first,
   everything a player would call broken or unfinished — with the picture path, even if you cannot fix it. This list is
   the main deliverable of the item; do not shorten it to be kind.
8. **Manual and README drift**: `docs/manual/**` and `README.md` against the game as it now runs (controls, the opening,
   speeds, alerts, the species flag, save / load). Correct what is wrong; no new chapters.

## Acceptance criteria
1. Typecheck clean on your paths; tests green in every folder you touched (folder by folder, never the whole suite).
2. Before / after pictures for items 1–6 under `test-output/look5/`, same script and pose, each looked at; an item that
   could not be fixed is reported with what was tried.
3. Item 7's scripts pass or are reported with the failing beat and its cause; the "still unfinished" list exists and
   cites pictures.
4. Draw calls and triangles at low / medium / high on the seed 1 colony do not rise by more than 5 % (same method as
   the gate report §5).
5. Report `docs/design/tasks/look-pass-5-report.md` with the picture paths.

## Machine rules
4 cores shared with the simulation engineer's two life runs. One harness or browser process at a time; never leave a
dev server or a browser running; never the whole vitest suite in one process. Disk is short (about 9 GB free): keep
pictures, delete videos, traces and duplicate runs. Check `date -u` before writing a timestamp.
