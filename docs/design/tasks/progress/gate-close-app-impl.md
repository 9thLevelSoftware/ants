# gate-close-app — progress (impl)

Started 2026-11-17 03:20 UTC. Evidence root: test-output/gate-close/app/

## Done
- Step 1: typecheck clean (03:22). Unit tests per folder: test-output/gate-close/app/unit/{summary.txt,*.log}. All green except
  src/ui/panels/health/model.test.ts (new species remedy ids w/o action) -> FIXED in src/ui/panels/health/model.ts
  (REMEDY_ACTION entries + 'brood' control). controls.test.ts and scentTrail.test.ts now green.
- Seam R15: src/sim/combat/alerts.ts pinned -> critical; test src/sim/combat/pinnedLevel.verify.test.ts (green). cross-edit logged.
- Seam founding-flooding: src/sim/nest/flood/diagnostics.ts (opening-only, in-place update, diag label names chamber);
  test src/sim/nest/flood/foundingAlertAfterOpening.verify.test.ts (green with founding.test.ts). cross-edit logged.

- Seam foundingGate: removed src/ui/hud/prompts/foundingGate.ts; PlayPanels.tsx Prompts asks onboarding engine (promptVisibility moved to foundingShown.ts). Tests in src/ui/hud/prompts green.
- Seam groom-in-flight: src/sim/ants/player/prompt.ts flying() -> no prompt; test promptFlight.verify.test.ts. cross-edit logged.
- Seam winter journal: src/sim/progression/events.ts 'event.winter-notice' + text in src/content/text/journal.ts/journalText.ts; test src/sim/progression/winterNoticeJournal.verify.test.ts.
- Seam auto-slow: NEW src/game/time/autoSlow.ts (+test) wired in Game.ts (attach/detach). Auto-slow did not exist at all before.
- typecheck clean after all of the above (03:5x).

- Seam CV_DIST_BU: src/render/camera/{constants.ts (CV_DIST_PER_NEST_SPAN, CV_DIST_SMALL_MIN_BU), colonyRig.ts setNestSpan}, src/game/views/viewsLayer.ts nestSpanBu; test in src/render/camera/rigs.test.ts (green).
- a11y flash reduction: FlashTimer in src/render/world/weather/lightning.ts (+ min gap 4 s, no restart mid-glow), WeatherRenderer uses it; test src/render/world/weather/flashReduction.test.ts (E25 at 1x/4x/8x green).
- Night ant BEFORE shots running: test-output/gate-close/app/antfill/before (look2.mjs night,night-rain surface,observer high).

- ANT_FILL night body 2.2->1.1, rim 0.12->0.3 (src/render/ants/tuning.ts). AFTER shots still to take (same look2.mjs cmd, LOOK2_TAG=after).
- Sound-cue indicators: NEW src/game/soundCues.ts (+test), src/ui/hud/SoundCuePips.tsx, src/content/text/soundCues.ts, UiSnapshot.soundCues (src/ui/api.ts), SnapshotSource.soundCues (src/game/uiBridge.ts), Game.ts wiring, hud.css. Not yet seen in browser.
- e2e runner: test-output/gate-close/app/e2e/run.sh <names...> (sequential), summary.txt there.

- Males at swarm: NEW src/render/ants/swarm.ts (+test), SWARM in tuning.ts, SimReader appends swarm (simAdapter.ts). Need lifecycle.mjs flight shot to see it.
- founding.mjs FOUNDING_PAD=1 mode (seal/lay via virtual pad A); runner name foundingPad.
- NEW tests/e2e/playthrough.mjs (step 4) and tests/e2e/frametime.mjs (step 5); runner names playSeed1, playKitchen, frametime.
- NOTE: detached (setsid/nohup) launches are refused by the permission system; run runner chunks via run_in_background (<2h each).

## In progress
- Step 3 seams: night ant fill (ANT_FILL), CV_DIST_BU, males at swarm; a11y leftovers.

## Remaining (spec order)
2 browser scripts; 3 rest of seams; a11y leftovers (sound cues, flash EV, pad seal/lay); 4 play-through shots; 5 frame time; 6 portable build; 7 report

## Findings / decisions
- Species engineers add remedy ids to src/content/text/words.ts; health model needs an action per id (test enforces).
