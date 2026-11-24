# app-seams-4 report (DRAFT, filled in as the runs finish)

Written 2026-11-24 by the app engineer of `app-seams-4`. Times are UTC. Pictures under `test-output/app4/` (git-ignored); every picture cited was looked at.

## 0. Result in one screen

(see section 8 when the full runs are in)

## 1. Item 1: the dig plan on seed 1 (whose fault)

**Reproduced as a player does it** (`tests/e2e/app4-planner.mjs`, the colony view framed on the cell, the Dig tool, clicks on the soil of the slice at 0.5 to 12 BU
beyond the wall of the cell, twelve directions each, the ghost turned through all 24 yaws): `test-output/app4/planner-before/pl-table.json`.
Every click 3 BU or more from the wall was refused with `anchor-not-in-nest` ("Start from a tunnel or chamber of this nest", picture `planner-before/pl-last.png`:
the ghost cross-hatched and the reason on it), whichever way the ghost turned; clicks within 2 BU worked. **The planner was the cause, not (only) the script**:
a founding cell is 3 to 4 BU across (12 cells of 0.5 BU at the plane: area 12 BU^2 on seed 1), so "beside the cell" is 4 to 8 BU from its wall, and the pick
snapped only within 2 BU (`ANCHOR_PICK_SNAP_BU`, GDD 03 14.2). The script was also wrong in what it hovered (the chamber record's centre + 0.9 x its x radius:
the record is 5 BU or more off the real cell, `shotSubject.ts` header), which is why it failed on all 24 turns.

**Fix.** `src/game/views/colony/digPlanner.ts`: a pick on soil that is not within 2 BU of a wall (the first, exact measure stays) snaps to the nest's own wall between the
click and the nearest open sample of the nest within `ANCHOR_PICK_REACH_BU` = 8 BU (`wallToward`: march from the open sample toward the click, bisect onto the wall, the
field's normal). Beyond 8 BU the ghost keeps saying why. DEVIATIONS row D-APP4-2. Test: `colonyTools.test.ts` ("a click on the soil of the slice beside the cell snaps to
the nest wall": clicks at 1, 3, 5, 7 BU anchor on the wall and are not refused; 20 BU is refused with the reason's words).
**After** (`test-output/app4/planner-after/`, same script and save): the table has `anchor-not-in-nest` only for clicks 9 and 12 BU out (`pl-table.json`);
a click 4 BU out gives an amber ghost with its warning ("Too close to the surface, another entrance or another room above or below - click again to confirm",
`pl-valid.png`), a click that lands on another plan shows "Overlaps another plan" cross-hatched (`pl-invalid.png`).
`firstplay.mjs` now places the plan the way the probe does (`placeChamberPlan` in `tests/e2e/lib/firstplay-steps.mjs`: the first wall from the cell's centre in
twelve directions, 2.5 BU of soil, hover, turn the ghost, click, confirm). The old "forage marker was not placed" soft failure of the baseline run was a second script
defect (the colony camera was moved and `views.project` read straight away: the camera drawn is the one the click is projected with; `render(1)` after every
`colonyCamera`).

## 2. Item 2: a worker with food and a full larder

**What the game did and showed.** The sim side was already right (GDD 02: the pool's cap is a larder of a day's need, `unload-crop` ends at once when it takes nothing, the
AI worker rests with a full crop, the `stores-full` alert follows after `STORES_FULL_ALERT_GD` with "dig a food chamber"). The app showed nothing at the moment that
matters: a possessed worker standing in the nest with a crop she cannot hand over had no word anywhere until the alert came, hours of game time later.
**Fix.** The possessed panel says it at once under her crop meter: "Stores full - dig a food chamber" (`UiPossessed.storesFull`, `hudSlices.carriesIntoFullStores`: the alert's own test,
`poolSpace` under `STORES_FULL_SPACE`, for the kind she carries; `PossessedPanel.tsx`, `STORES_FULL_NOTE` in `content/text/words.ts`). Tests: `src/game/uiBridge/storesFull.test.ts`
(room / no room for sugar, protein judged against protein room, empty crop). DEVIATIONS D-APP4-6; MANUAL section 14 "Stores full".
**The script.** The trail check (13 -> 14) on a colony that wants no sugar: after the 9000-tick wait, if no trail and the `stores-full` alert is up, `firstplay.mjs` plans the food chamber
the alert asks for with the dig planner (as a player would; recorded in `result.findings`), then waits again; the forage-marker step stays. Beat 16 records whether the note shows
(`checks.delivery.storesFullNote`). No assertion was weakened.

## 3. Item 3: ants between the camera and the possessed ant

**Rule** (integrator ruling; DEVIATIONS D-APP4-1): an ant whose body is inside the cone from the camera to the possessed ant (a third of its width at the camera, 0.6 body lengths at the subject,
the ant's own half length added; soft edges) and nearer the camera than half the boom is not drawn; its alpha fades out with time constant 0.1 s and back in with 0.16 s; every other
ant is solid; the possessed ant is never faded away (rule 1's dither of her own fade is unchanged). `src/render/ants/occluderFade.ts` (pure), the per-ant `hidden` smoother in
`AntRenderer` (one frame of lag on the subject), the instance attribute `aFootB.w` -> `vAntA` -> `diffuseColor.a`, body and carried-item materials blended only while an ant is
mid-fade (`setFadeBlend`: both programs stay cached, the crowd is opaque the rest of the time), a fully faded ant is not written to any batch (no draw, no shadow).
Tests: `occluderFade.test.ts` (zone, soft edge monotone and continuous, the smoother's time constants), `lookFixes.test.ts` (the renderer end to end: mid-fade blended, hidden then not
drawn, back with alpha, the subject never, photo mode / no subject nothing).
**Pictures** (`tests/e2e/app4-fade.mjs`: the possessed worker in the entrance tunnel, other workers teleported onto the camera-subject line, frames 0 / 3 / 8 / 40 of 33 ms):
low `sheets/item3-fade-sequence-low.jpg`, medium `sheets/item3-fade-medium.jpg` (the control, rule off, bottom right of that sheet: the near ant stays solid), crowded chamber and high
`sheets/item3-fade-crowd-high.jpg`. The near ant is whole at frame 0, a ghost at frame 8, gone at frame 40; the possessed worker is solid throughout; no hatching anywhere.
The earlier crowd pictures (`test-output/app4/crowd/cc-noon-*-low.png`) are the nests' own staging and show no ant in the zone (`faded 0`); they are kept as the "nothing got worse" check.

