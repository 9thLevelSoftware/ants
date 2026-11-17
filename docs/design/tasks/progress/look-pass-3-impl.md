# look-pass-3 impl progress
Started 2026-11-17 18:47 UTC. Engineer: Sonnet impl.
## Done
(nothing yet; read spec + gate-close-app-report)
## In progress
orientation: reading code (NIGHT_LOOK, ant material, cameras)
## Remaining (spec order)
1 night look; 2 ant cuticle; 3 cameras (follow slope, possession low-room stage1a strict, observer after colony view); 4 dressing (leaves, mound foot, horizon strip, far buildings); 5 colony labels DOF; 6 HUD/text (pad View tap in frames, auto-slow flash + time.auto-slow event, newgame inEffect marking, season strings day 5 spring); 7 playthrough rerun; report docs/design/tasks/look-pass-3-report.md
## Evidence root
test-output/look3/
## Notes
- 18:58 wrote tests/e2e/look3.mjs (before/after shot driver, LOOK3_SET=night|ants or LOOK3_SHOTS=light:view:quality,...; reuses tests/e2e/lib/look2-stage.mjs). Launched BEFORE night set -> test-output/look3/before/ (log before-night.log).
- notes: dawn = hour 3.9 (sun symmetric about 12.0). Crop can't be set via __game (no sim handle); gaster look goes through spikes/render-ants-demo 'replete' scene (read-only for me).

- 19:07 (clock) item 6 CODE written, NOT yet run through tests/typecheck (wait until harness idle):
  * pad tap in frames: src/input/sources.ts (PAD_TAP_MAX_POLLS 2; polls counted; tap ms = frames*17; hold pulse needs >2 polls), src/ui/nav/padReader.ts (same), tests added in src/input/inputState.test.ts + src/ui/nav/nav.test.ts (also changed the old 'reports edges' test to a 3-poll press).
  * auto-slow flash + event: src/game/time/autoSlow.ts (apply gets `why`), Game.ts onAutoSlow (setSpeed, emits sim event time.auto-slow, autoSlowFlashes++), uiBridge.ts + ui/api.ts (UiSpeed.autoSlowFlash, optional), TimeCluster.tsx + hud.css (is-flash, 900 ms), tests in autoSlow.test.ts, uiBridge.hud.test.ts.
  * New Game: src/ui/screens/newgame/presetRows.ts (+NewGame.tsx PresetDetails, unwired rules disabled 'Not in this build', screens.css), test newgame.test.ts.
  * season strings: species.ts (Lasius card 'spring', foundingSeasonOf() from sim data startDoy), Loading.tsx, NewGame.tsx, content/text/alerts.ts sample. LIST for report: species card, loading summary, alerts sample; sim/species/data/lasius-niger.ts foundingSeason 'summer' (sim, not mine); game/title/titleWorld.ts vignette 'summer day 3' (backdrop only).
- BEFORE night shots running (test-output/look3/before, log before-night.log): ~2 min per shot.
- 18:59 session 2 (restarted 18:55): re-read spec+gate report; before night shots exist only for night:surface and night:observerlow (high) in test-output/look3/before; running item-6 unit tests now
- 19:00 item6 unit tests green + typecheck clean (fixed species.ts castes comment bug). Running 'before' for remaining night lights in bg (before-night2.log). Plan: tune via runtime patch (import('/src/render/world/lighting/constants.ts') in page, mutate NIGHT_LOOK) -> add LOOK3_EVAL/variants to look3.mjs
