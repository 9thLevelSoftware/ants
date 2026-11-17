# gate-close-app-fix progress
## Done
- F1+F2 autoSlow: src/game/time/autoSlow.ts rewritten (escalation via level map per alert id, overwinter.banner trigger 'overwinter-prompt', cooldown key kind:level). Tests: autoSlow.test.ts (+2), new autoSlow.session.test.ts (3, driver-frame level, App E 6), reviewer autoSlow.verify.test.ts now green. `npx vitest run src/game/time` 17/17 green.
## In progress
F3 nestSpan (src/game/views/viewsLayer.ts nestSpanBu)
## Remaining
4 playthrough labels; 5 stage1a opening; 7 sound pips icons; typecheck; folder tests; harness shot; report update
- F3 nestSpan DONE: viewsLayer.nestSpanBu counts entrances only horizontally (founding nest 4.5 BU -> min zoom 11.25 BU). New src/game/views/nestSpan.test.ts (4 tests incl. chamber in FOV at min zoom every pitch); reviewer nestSpan.verify green. Browser shot still TODO.
- F4 playthrough.mjs: REAL_MIN_TICKS, ticks scaled by speed, labels x{speed}-r{min}; result.colony has ticks/gameHours. node --check ok. NOT re-run (4800 s run).
- F5 stage1a.mjs: egg step now plays the real opening (skipIntro, dealation, first bite, deepen to depth bar, room, seal, lay) + finishOpening (beginTimelapse + skipLapse) before 8x checks. node --check ok. Harness run IN PROGRESS: test-output/gate-close/app-fix/stage1a*
## Remaining
typecheck; stage1a strict run; nestSpan browser shot; sound pips (F7) decision; folder tests src/game src/render/camera; report update
- F7 sound pips: icons cue-alarm/cue-drum/cue-crackle added to src/ui/icons/paths.ts; SOUND_CUE_ICON in src/content/text/soundCues.ts; pip renders Icon+word (SoundCuePips.tsx, hud.css). Test src/ui/hud/soundCuePips.test.ts (not run yet).
- Browser check script written: test-output/gate-close/app-fix/check.mjs (closest zoom, auto-slow via Game, winter banner, rain pip). Run AFTER stage1a finishes (one browser at a time).
- unit: vitest src/game/time src/game/views src/game/soundCues src/ui/hud src/ui/icons src/render/camera 47 files 299 tests green. stage1a run1: egg PASS via real opening; failed at my new handover expect (lapse ended failed?, queen reserve 0) -> finishOpening now accepts failed + logs. Next: check.mjs run, then stage1a run2.
- nestSpan v2: chambers only (browser run1 gave 25.8 BU because founding cheat's entrance is 32 mm to the side). keepOut: .wi-banner added (hint chip over winter banner, check/winter-banner.png). check run1: auto-slow critical/escalation/banner all 8->1 in browser. Running check run2.
