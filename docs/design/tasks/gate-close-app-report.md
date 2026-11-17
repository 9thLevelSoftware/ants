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

(pending — table filled from `test-output/gate-close/app/e2e/summary.txt`)

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

(pending)

## 5. Frame time (step 5)

(pending)

## 6. Portable build (step 6)

(pending)

## 7. Still wrong, most serious first

(pending)
