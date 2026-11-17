# Gate close — application half (gate-close-app) report

Engineer: gate-close-app (Opus). Work from 2026-11-17 03:20 UTC on the shared checkout (load average 9-14 on 4 cores
throughout: colony-life sweeps, species engineers' browsers). Evidence root: `test-output/gate-close/app/` (git-ignored).
Cross-edits into `src/sim` (each under 30 lines, each with a test): `test-output/gate-close/cross-edits.md`.
Progress log: `docs/design/tasks/progress/gate-close-app-impl.md`.

DRAFT: sections marked (pending) are filled as the remaining runs finish.

## 0. Verdict per acceptance criterion

(pending — filled at the end)

## 1. Typecheck and tests, folder by folder (step 1)

`npm run typecheck`: clean on my paths at 03:22 and after every change since. Errors seen in the tree that are not
mine (work in progress of others, not touched): `src/sim/species/modules/wood/wood.verify.test.ts` (TS2554, carpenter),
`src/sim/ants/behaviours/outdoor/hunt.test.ts` (TS2339 `knownBy`, colony-life).

Unit tests, one vitest process per folder (`test-output/gate-close/app/unit/{summary.txt,*.log}`):

| Folder | Files | Tests | Result |
|---|---|---|---|
| src/content | 11 | 114 | green (incl. `controls.test.ts`, red at hand-over: green now) |
| src/input | 6 | 105 | green |
| src/audio | 12 | 209 | green |
| src/ui | 46 | 395 | 1 red → fixed (below) |
| src/game | 82 | 549 | green |
| src/render/ants, app, assets, camera, creatures, debug | 48 | 351 | green |
| src/render/fx | 14 | 68 | green (incl. `scentTrail.test.ts`, red at hand-over: green now — foragers lay trails again) |
| src/render/nest, slots, world | 77 | 367 (+2 skipped) | green |

Red test found and fixed:

| Test | Owner | Cause | Fix |
|---|---|---|---|
| `src/ui/panels/health/model.test.ts` "every remedy the colony publishes has words and a known action" | ui-panels (mine now) | the species engineers added remedy ids (`remedy.slider.mill`, `.store`, `remedy.caste-emphasis`, `remedy.granary.hygiene`, `remedy.dig.granary`, `remedy.guard.entrance`, `remedy.marker.satellite`, `remedy.dig.drain-chamber`, `remedy.toggle.hideFrass`) with words but no action, so the health panel offered them as plain advice | `REMEDY_ACTION` entries (nearest existing control; a `brood` directives control for caste emphasis) in `src/ui/panels/health/model.ts` |

## 2. Browser scripts on the real game (step 2)

One headless browser at a time through `test-output/gate-close/app/e2e/run.sh` (results, wall time and load average
per run in `summary.txt`; per-run `<name>.json` / `<name>.log` / `<name>/`). Load average 5.3-13.8 on 4 cores
throughout.

| Script | Result | Cause of a failure, with evidence | Owner |
|---|---|---|---|
| `founding.mjs` seed 1 | **pass** (flooding on) | sealed in 400 ticks with 3 plugs; 18 eggs; 8 first workers | - |
| `founding.mjs` seed 2 | **pass** | 16 first workers | - |
| `founding.mjs` seed 3 | **pass** | 7 first workers | - |
| `founding.mjs` FOUNDING_PAD=1 (seal and lay by pad) | seal **pass**, lay partial | see section 3 (accessibility) and section 7 S3 | sim (player targeting) |
| `firstplay.mjs` (25 beats) | **fails only the growth check** | all 25 beats shot (`e2e/firstplay/01..25-*.png`); `no growth over game days 2-3 at 8x: from summer 6 to autumn 1, workers 15,15,15, brood 8,7,4, P 2.25 -> 1.62 -> 0.26`. The protein store runs down and the brood shrinks: the sim does not grow colonies yet (hand-over note). The app part (screens, HUD, save, continue) passed every beat | sim (colony economy) |
| `stage1a.mjs` STAGE1A_STRICT=1 | **fail** at the egg step | `stage1a.log`: `egg path {"before":0,"laid":0,"refusals":[],"phaseBefore":"intro-card"}` then `lay-egg refused (no egg)`. The 1A script never plays the opening (it stays at the intro card), and since founding the queen lays only in the opening's lay phase or as a colony queen after the hand-over. The strict mode turns the egg stand-in into a failure. Script/design mismatch, not a game defect: the egg path is covered by founding.mjs (18 eggs) and firstplay beat 10 | test owner (1A script predates founding) |
| `controls.mjs` | **pass** | | |
| `views.mjs` | **pass** (after a script fix) | the second pick chose an off-screen worker under load; now picks an on-screen one | - |
| `panels.mjs` health/alert/nest/journal/codex | **pass** | | |
| `panels.mjs` markers/hudfix/keys/tools/sizes | **fail twice at the same step, counted as not measured under load** (06:59 and 09:42; markers+overlays and hudfix pass) | `panelsB.log`: `a tap of View puts the pad focus on the tool UI ... {"inTools":false,"suspended":false,"ring":false}` after 4 one-frame taps. The pad poller (`src/ui/nav/controller.ts`) runs once per animation frame and calls a View press a tap only if it lasts under `VIEW_TAP_MS` 450 real ms; with the page at several hundred ms per frame under load average 9-10 a one-frame press already measures as a hold. The assertion is right; not changed | load (re-run on a quiet machine) |
| `stage2.mjs` strict (no `STAGE2_SOFT`) | **pass, in two runs** | full run 10:34-12:25: 11 sections OK (creatures, herd, comfort, scent, overlays, machine, rain, footsteps, rainlook, comfortlook, overlaylook); `humanlook` was cut by the script timeout (6600 s; `footsteps` alone took 2494 s under load), `birdlook` and `perf` not reached. Re-run of exactly those three (`STAGE2_ONLY=humanlook,birdlook,perf`, 12:34-12:44, load 2.5-5.6): all OK. One finding logged by the script: `prey: 2 of 4 spawned creatures not drawn in the frame (culled or off-screen)` | - |
| `photo.mjs` PHOTO_QUICK=1 | **pass** (09:29, and again 12:56 after the photo-subject fix) | first run (07:08): `difficultyValue is not defined`, another engineer's work in progress in `src/sim/balance/difficulty.ts` at that minute; gone on the re-run | - |
| `onboarding.mjs` | **pass** (after an app fix) | first run: B11 `hint-directives` shown as an engine card right after the hand-over: `daysSinceFirstWorker` subtracted a sim-tick milestone from the calendar tick. Fixed in `src/game/onboarding/facts.ts`, test `facts.firstWorker.test.ts` | app (fixed) |
| `lifecycle.mjs` | **pass** (x3) | winter 17 -> 13 workers (1 outdoors, 3 cold), spring, flight with males drawn round the gyne | |
| `a11y.mjs` G,B,C-,C2,D,E | **fail in C only** (re-run 09:42-10:34; G, B, B2, C2, D, E OK) | first run also failed B (`RB did not possess another ant`: the RB tap spanned several frames under load; the script now taps one frame with up to 3 retries, and B passes). C `no teaching hint came up to dismiss`: the hint engine stays silent while `foundingInProgress`, and the facts show it still true with `openingPhase: null` after the script played on 60 x 200 ticks (2 game days) after the hand-over: the founding nest record never left `sealed`/`reopening`, i.e. the first workers did not dig the plug out in that game (`src/sim/colony/founding/access.ts` `foundingInProgress`). In founding.mjs the reopening does happen (beat 09). Evidence `a11yA.log` (facts dump) | sim (reopening after a pad-played opening) |
| `a11y.mjs` E2,F | **pass** | | |

## 3. Seams (step 3)

| Seam | Outcome | Files | Test / evidence |
|---|---|---|---|
| R15 `possessed-danger` critical in combat | **done** (cross-edit): the combat "Pinned" card is raised `critical` like every possessed-danger card (GDD 08 §6.5 table) | `src/sim/combat/alerts.ts` | `src/sim/combat/pinnedLevel.verify.test.ts` |
| "Founding chamber flooding" x10 after the hand-over | **done** (cross-edit). Cause: the nest's founding record stays in `reopening` after the hand-over, so `foundingFloodAlert` kept re-raising the founding card every 250 ticks, and each periodic re-raise counted as a repeat. Now: the founding card exists only while the opening is on (cleared at `reopening`); a periodic refresh updates the share in place without a count; after the opening the `diag-nest-flood` card names the chamber ("Royal chamber flooding", "Nursery flooding", "Queen's chamber flooding") | `src/sim/nest/flood/diagnostics.ts` | `src/sim/nest/flood/foundingAlertAfterOpening.verify.test.ts` (3 tests) + `founding.test.ts` green |
| `PlayPanels.tsx` asks the hint engine; `foundingGate.ts` goes | **done**: `Prompts` filters the chip by `onboarding.engine.allows(promptHintId(...))`; the DOM bridge (MutationObserver + style hiding) is deleted; `promptVisibility` moved to `foundingShown.ts` | `src/ui/screens/founding/PlayPanels.tsx`, `src/ui/hud/prompts/{foundingShown.ts,index.ts,OnboardingPrompts.tsx}`, deleted `foundingGate.ts` | `src/ui/hud/prompts/prompts*.test.ts` green; onboarding.mjs passes |
| "Groom yourself" during the nuptial flight | **done** (cross-edit): no context prompt while the possessed ant is in the air (`medium === 'air'` or a flight phase) | `src/sim/ants/player/prompt.ts` | `src/sim/ants/player/promptFlight.verify.test.ts`; `lifecycle/03-flight.png` shows no prompt (looked at) |
| Winter notice journal entry | **done** (cross-edit, 3 lines): `overwinter.notice` writes `event.winter-notice` (kind `event`), worded "Winter is near" | `src/sim/progression/events.ts`, `src/content/text/{journal,journalText}.ts` | `src/sim/progression/winterNoticeJournal.verify.test.ts`; `plural.test.ts` key list extended |
| Overwinter prompt slows time like other blocking prompts | **done, and more than asked**: there was no auto-slow at all in the game (settings `autoSlowCritical/Warning` had no consumer). New `AutoSlowWatcher`: on an alert raise, critical alerts by the critical setting (default slow to 1x), warnings by the warning setting, and `winter-coming` (overwinter-prompt) and `flight-weather` (flight-launch) whatever their level (GDD 06 §4.5); 0.25 game-day cooldown per kind, never while paused, never faster. Also closes GDD 08 App E 6 | `src/game/time/autoSlow.ts` (new), `src/game/Game.ts` (attach/detach) | `src/game/time/autoSlow.test.ts` (4 tests) |
| Males at the swarm in the flight screen | **done** (render-only): the sim books the males as an aggregate, so the ant renderer draws 24 winged males in the `fly` pose looping round the lek centre while the gyne climbs, and round the gyne once she is at the lek (lek / mate) | `src/render/ants/swarm.ts` (new), `simAdapter.ts`, `tuning.ts` (`SWARM`) | `src/render/ants/swarm.test.ts`; `test-output/gate-close/app/e2e/lifecycle/03-flight.png` (looked at: a dozen males round the gyne; renderer stats lod2 20 + lod3 10) |
| Night ant pale and glassy | **done for clear nights, not for night rain**: `ANT_FILL.body.night` 2.2 -> 1.1, `rim.night` 0.12 -> 0.3. Clear night: a dark ant with readable segments and a cool rim (`antfill/after/after-night-surface-high.png` vs `before/...`, looked at). Night rain: unchanged, because the fill is not active at that exposure; the milky look there comes from the cuticle's clearcoat and sheen reflecting the sky (left, see section 7) | `src/render/ants/tuning.ts` | `test-output/gate-close/app/antfill/{before,after}/*.png`; formFill tests green |
| Colony view closest distance for small nests | **done**: the closest zoom is 2.5 x the nest span, between 10 BU and 30 BU (`CV_DIST_PER_NEST_SPAN`, `CV_DIST_SMALL_MIN_BU`); a founding nest (span about 6 BU) can be framed from 15 BU (the founding chamber about twice as wide on screen) | `src/render/camera/{constants,colonyRig}.ts`, `src/game/views/viewsLayer.ts` (`nestSpanBu`) | `src/render/camera/rigs.test.ts` "closest zoom for a small nest" |

Accessibility items handed over:

| Item | Outcome | Evidence |
|---|---|---|
| Sound-cue indicators toggle did nothing | **wired**: `SoundCueTracker` follows the sim's information-bearing sounds (tremor warning `human.telegraph`, colony `alarm-raised`, `drum`, nest crackle `collapse-warning`, rain onset) and, while the setting is on, the HUD draws a word chip at the screen edge in the sound's direction for 4 s (rain at the top centre). Driven by sim events, so it works with audio muted or blocked | `src/game/soundCues.ts`, `src/ui/hud/SoundCuePips.tsx`, `src/content/text/soundCues.ts`, `UiSnapshot.soundCues`; `src/game/soundCues.test.ts`. Not seen in a browser frame (no harness shot of a cue was taken) |
| Flash reduction vs GDD 08 App E 25 | **measured, and a real defect fixed**: the reduced glow restarted on every strike, and at 8x the sim's strikes come every 0.75-2.6 real s, so a 20 s storm at 8x gave about 8 brightening events at the mean strike spacing and up to 26 at the minimum (limit 5). Now a soft brightening never restarts over a running one and starts at most every 4 real s (`LIGHTNING_REDUCED_MIN_GAP_S`). Frame-by-frame measure on the renderer's own flash clock (`FlashTimer`) at 60 fps, densest strikes: largest frame-to-frame rise about +0.005 EV (the whole glow lifts the frame by +0.18 EV at its peak), at most 5 events at 1x / 4x / 8x; the unreduced pulse fails the same measure (as it should) | `src/render/world/weather/{lightning.ts,WeatherRenderer.ts,tuning.ts}`; `flashReduction.test.ts`. Not measured from rendered pixels |
| Seal and lay by pad through the real founding phases | **demonstrated once, with a finding**: `FOUNDING_PAD=1 founding.mjs` seed 1 (`e2e/foundingPad.log`). Seal: one tap of A (prompt "Put down soil pellet") started the founding guide's sealing: sealed in 400 ticks with 3 plugs. Lay: one batch of 6 eggs by A; then the prompt changed to "Pick up egg" (her own egg in front of her outranks laying), A picked the egg up and the opening could not go on to the time-lapse | section 7 item |
| a11y engineer's edits outside their folders | read as owner: kept (`CAM_REDUCED_CROSSFADE_S` 0.3 -> 0.2 matches GDD 08 2.4; `FrameInfo.reducedFlash`; Game passes the setting; WeatherRenderer uses it - now through `FlashTimer`) | |
| Bindings storage key | document fix, no code: GDD 08 App E 21 names `foundress.settings.v1` for bindings, GDD 01 §5.7 names `foundress.bindings.v1`; the code follows GDD 01 | |
| New-game screen and unavailable species | checked once: carpenter / harvester / leafcutter are listed disabled with "Not yet available" (`available: false`), cannot be chosen | `src/ui/screens/newgame/NewGame.tsx` |

## 4. Play-through with pictures (step 4)

Script `tests/e2e/playthrough.mjs` (new), quality=high, opening by `cheat.completeFounding` + time-lapse skip (the first
workers are the sim's own), then the shots rotate observer / possession / colony slice / scent view. Reading of the
spec: "20 min at 1x then 4x, a shot every 2 game minutes" was run as 10 shots of 1200 ticks each at each speed (1200
ticks = 2 real minutes at 1x = 4.8 game hours); the 4x half therefore covers the same game time as the 1x half (5 real
minutes at 4x, not 20). Then one day-night cycle at 8x, a shot every 2 game hours (500 ticks), observer pose fixed.

**Seed 1 (lawn-edge), `test-output/gate-close/app/e2e/playSeed1/` (32 shots, all looked at), 4795 s wall time.**
Colony across the run: 12 workers throughout (summer 7 04:14 -> autumn 4 13:52); brood eggs 9 -> 9 -> 1/4 larvae ->
0/5 larvae; C stores 7.5 -> 9.2 -> 8.2, P 1.8 -> 1.4 -> 0.5 (protein falling, no pupae, no new workers: the sim's
growth gap, see section 7).

What a player would call broken or ugly (fixed items marked; every picture named was looked at):

| # | Shot | What is wrong | Owner / outcome |
|---|---|---|---|
| P1 | `x1-m06-slice.png` (04:14), `x1-m14-slice.png` (23:26) | at night the whole colony slice is pale pink-white: the cut face and the cut fill are their own light, calibrated for the day exposure, and the night metering (+3 EV) lifted them 8x | **fixed** (render): `CUTAWAY.refEV` 0.4, a shared `uCutGain` = min(1, 2^(refEV - EV)) on the cap colour and the cut fill (`src/render/nest/{params,cutaway/capMesh,lighting/nestLighting,NestRenderer}.ts`, `src/render/slots/nestSlot.ts`); test `src/render/slots/cutGain.test.ts`; re-shot `e2e/slicenight/slice-{day,night}.png`: the night slice (02:00) now reads like the day one (13:00), dark soil, readable outlines (looked at) |
| P2 | all `*-slice.png` | chamber outlines and their labels blown to white and blurred (overlay marks drawn into the lit frame and scaled by the exposure) | **fixed** (render): `holdAgainstExposure` in `MarkerRenderer.ts`; test `exposureHold.test.ts` |
| P3 | `x1-m06-slice.png`; still in `e2e/slicenight/slice-night.png` after the first fix ("Why?" chip on the palette's Select button) | "Tab Next ant" hint chip drawn over the colony palette (slot 4-5) | **fixed** (ui) in two steps: `.pn-panel` added to the HUD keep-out regions, then (the re-shot showed it still overlapping) the regions are searched and observed in the whole document, because the panels layer mounts the palette outside the HUD root (`src/ui/hud/keepOut.ts`, test `keepOut.test.ts`) |
| P4 | `x4-m16-possession.png` | a translucent ghost of an ant fading through the camera capsule (the occlusion fade applied to an ant body next to the lens) | reported (render-ants dithering near the lens; not fixed in the hour) |
| P5 | `x1-m02-observer.png`, `x1-m10-observer.png`, `x4-m06-observer.png` | no ant visible on the surface round the entrance in any observer shot; the foragers sit "waiting to leave" | sim (colony-life): foraging trips rare; see section 7 |
| P6 | `day-h06.png` 19:52, `day-h12.png` 01:52, `day-h16.png` 05:52 vs `day-h02.png` 15:52, `day-h22.png` 11:52 | at ground level night looks almost like an overcast day: the leaves stay saturated yellow, only the sky band turns dark blue | reported, not changed: this is the look-pass-2 night metering (`NIGHT_LOOK` target luma, `nightLook.verify.test.ts`), a deliberate "night readable" calibration; a look decision for the art lead. The dark leaf-shaped patches that do not move between day and night are soil gaps in the leaf layer, not stale shadows |
| P7 | `day-h02.png`, `x4-m10-slice.png` | "Colony orders (I)" hint chip sits over the colony palette's first slots | the keep-out fix (P3) covers it |
| P9 | `x1-m02-observer.png` (18:37, about 5 game hours after the hand-over) | the hand-over banner ("Tab to take a worker, or stay with the queen") still sits over the middle of the scene after the player left the queen for the observer view | **fixed** (game): the banner closes when the player changes the view, as it already did when a worker was taken (`src/game/flows/founding/flow.ts`; test in `flow.test.ts`) |
| P8 | `x1-m08-scent.png` | scent view reads well (home dots, food rings); no trail chevrons because nobody forages (P5) | - |

**Kitchen door (indoor archetype):** (pending)

**look-pass-2 open items** (checked in these pictures; ant-height observer on seed 1 and the founding/firstplay beats):
thin lime-green strip at the map-edge horizon - not seen in any of the 32 play-through shots or the founding beats
(the horizon at night shows a pale strip instead, S11); the nearest facade and fence as pale straight-edged blocks -
seen as pale rectangles inside the fog band (`playSeed1/day-h02.png`, `day-h22.png`, top right), consistent with the
report; white pillar, leaf contact shadow, car underbody, ragged open-end caps, floating block - not found (no
coordinates, and none came into these frames); the dusk (`day-h04.png`, 17:52), overcast (`day-h02.png`) and night
rain (`antfill/after/after-night-rain-surface-high.png`) frames are re-shot here.

**Day-night at 8x:** sky, fog and the HUD clock change every 2 hours; ground light changes little (P6); no frame
was black or blown out on the surface; the HUD weather word and the moon/sun icon follow the clock.

## 5. Frame time (step 5)

(pending)

## 6. Portable build (step 6)

(pending)

## 7. Still wrong, most serious first

Every picture named here was looked at. "Sim" items carry the evidence that separates them from the app.

| # | What a player sees | Evidence (pictures, logs) | Owner | Cause as far as known |
|---|---|---|---|---|
| S1 | The colony does not grow after the first workers: worker count flat, brood shrinks, protein falls to near zero in 2-3 game days | `e2e/firstplay.log` (workers 15,15,15; brood 8,7,4; P 2.25 -> 0.26), `e2e/playSeed1.json` (12 workers for 4 game days, P 1.8 -> 0.5), `e2e/firstplay/21-day-2-8x.png`, `22-day-3-8x.png` | sim (colony economy) | protein intake 0 on the logged days (`intakeToday.P` 0): foragers do not bring protein; the hand-over note says the sim does not grow colonies yet |
| S2 | Hardly an ant on the surface: the foragers sit inside "waiting to leave" | `e2e/playSeed1/x1-m02-observer.png`, `x1-m10-observer.png`, `x4-m06-observer.png`, `x4-m16-possession.png` (HUD "Forage - waiting to leave - timeout") | sim (behaviour) | the forage FSM waits at the entrance and times out |
| S3 | Laying by pad: after the first batch the prompt turns to "Pick up egg" and A picks her own egg up; the opening cannot reach the time-lapse by pad | `e2e/foundingPad/04-sealed-chamber-eggs.png` (prompt "A Pick up egg" over the six eggs), `e2e/foundingPad.log` (1 batch of 6, then `pick-up`); `src/sim/ants/player/targeting.ts` ranks the brood class over the queen's lay | sim (player targeting) | brood class outranks `lay-egg` in front of the queen |
| S4 | Night at ground level looks like an overcast day (saturated leaves, only the sky band dark) | `e2e/playSeed1/day-h06.png`, `day-h12.png`, `day-h16.png` vs `day-h02.png`, `day-h22.png` | art direction (look-pass 2 calibration, render-world) | `NIGHT_LOOK` metering lifts night by ~3 EV to a "readable" target; a calibrated, tested choice - not changed here |
| S5 | A pale, see-through ant in a tunnel ahead of the possessed worker | `e2e/playSeed1/x4-m16-possession.png` | render-ants | not found within the hour (capsule dither is only camera->possessed ant; may be a callow/queen material under the sense light) |
| S6 | Prompts during sealing: the seal action reads "Put down soil pellet", and "Open entrance" comes up right after sealing | `e2e/foundingPad.log` (seal step: prompt `Put down soil pellet`) | sim (`src/sim/ants/player/prompt.ts`, targeting) | the pellet put-down is the sealing act; the unseal action is offered as soon as the plug exists |
| S7 | Epitaph: "an unknown cause: 13" among the causes of death; "Alates reared: 0; flown: 16"; "Food returned: 0 sugar, 0 protein"; the last entries are five identical "Footsteps" titles | `e2e/lifecycle/06-epitaph.png` | sim (death cause recording; `repro.alatesReared` not counted for cheat-spawned alates) | the lifecycle script spawns the alates by cheat, so "reared 0" is partly a stand-in artefact; the unknown causes are real deaths without a recorded cause |
| S8 | Gyne pale at night; the males' wings faint | `e2e/lifecycle/03-flight.png` | render-ants | night fill fixed for workers on clear nights; gyne / alate cuticle at dusk not tuned |
| S9 | Leaves read as flat decals | `e2e/playSeed1/day-h02.png`, `x1-m02-observer.png` | render-world (decor) | draped decals without thickness or curl at ant height |
| S10 | Following a worker on a slope, the camera tips up to the sky; a white stick (a stem) cuts across the frame; the worker is a small blur at the bottom edge | `e2e/firstplay/14-worker-following-trail.png` | views (possession rig on slopes) | the boom keeps the world-up pitch while the ant climbs a slope towards the camera |
| S12 | The first workers at the entrance at night are drawn as thin pale outlines, like wire sketches | `e2e/firstplay/13-first-workers-entrance.png` (01:56, quality=test) | render-ants | taken before the night fill change (`ANT_FILL` night 2.2 -> 1.1); the after shots in `antfill/after/` are at quality=high; not re-shot at quality=test |
| S13 | The entrance mound ends in straight, square edges at its foot | `e2e/founding1/09-handover-entrance.png` | render-nest / world (mound skirt) | the mound overlay's footprint shows its grid cell edges |
| S14 | Photo mode, f/1.4 on the queen: a fine dotted (screen-door) pattern over her head and thorax | `e2e/photo-before/02-f1.4-focus-subject.png` (before), `e2e/photo/02-f1.4-focus-subject.png` (after the fix) | render-ants: **fixed** | photo mode hides the possession rim, and the shader tells the possessed ant apart only by her rim, so she was dithered at 0.4 inside her own camera capsule; the capsule is now off while the rim is hidden (`src/render/ants/AntRenderer.ts`, test in `lookFixes.test.ts`); the re-run photo.mjs (12:56, pass) shows her solid (looked at). Still open: the folded wings over the gaster read as a glass bulb with white veins (render-ants wing membrane) |
| S15 | In night rain the ants look milky and glassy (grey-white translucent bodies) | `e2e/stage2/10-rain-night-possess.png`, `antfill/after/after-night-rain-surface-high.png` | render-ants (cuticle clearcoat / sheen) | the night fill is not active at the rain exposure; the look comes from the clearcoat and sheen reflecting the wet sky. Not fixed (the fill change covers clear nights only) |
| S11 | Pale strip along the horizon at night | `test-output/gate-close/app/antfill/after/after-night-observer-high.png` | render-world (sky/fog) | fog colour vs night sky at the horizon |

Fixed in this task (re-shot where noted): night colony slice blown out (P1), slice outlines and labels blown out (P2),
hint chip over the colony palette (P3), hand-over banner staying for hours (P9), founding chamber flood film as a
pale slab (flood sheet edge alpha; the old look is in `e2e/foundingPad/04-sealed-chamber-eggs.png`, grey cross over the queen), flash reduction (App E 25), night ant fill on clear nights.
