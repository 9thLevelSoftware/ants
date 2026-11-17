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

## In progress
- Step 3 seams: night ant fill (ANT_FILL), CV_DIST_BU, males at swarm; a11y leftovers.

## Remaining (spec order)
2 browser scripts; 3 rest of seams; a11y leftovers (sound cues, flash EV, pad seal/lay); 4 play-through shots; 5 frame time; 6 portable build; 7 report

## Findings / decisions
- Species engineers add remedy ids to src/content/text/words.ts; health model needs an action per id (test enforces).
