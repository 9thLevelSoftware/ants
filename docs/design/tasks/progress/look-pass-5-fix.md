# look-pass-5-fix progress
Plan (in order): F1 ease subject in ViewDirector (+ cap), F2 shotSubject: weight workers (reach taper, above-cut), F3 plane under roof via carve field in shotSubject (guard if no sim.field),
F4 reduced-motion still crossfade every 3 s (director), F5 alert resolved rule (store.ts cardUp), F6 MANUAL lines 152, 822, F7 comment fix in shotSubject, report update, typecheck+tests+harness shot.
Decision: finding 3 is real in part (plane above roof under low roofs); sim-cause claim in report/MANUAL to be softened.
Done: (nothing yet)
DONE (tests green: shotSubject*, views/foundingShot*, render/camera/foundingShot*): F1 easing (camera/foundingShot.ts easeShotSubject, constants FSHOT_EASE_*, viewDirector.nextShotSubject), F2 weights (shotSubject.ts reachWeight/aboveWeight), F3 roof clamp (shotSubject roofUnder, guarded for sims w/o field), F4 reduced-motion still every FSHOT_STILL_S with crossfade, F7 comment fixed.
cutY NOT eased (follows source; roof keeps plane under ceiling). Warm constant light for lapse (GDD06 5.11): not started (world lighting is in render/world/lighting/timeOfDay) - check if cheap.
TODO: F5 alert rule (src/ui/hud/alerts/store.ts, blockingCard.ts), F6 MANUAL lines ~152 and ~822 + 252, report update, real browser run to check roof fix (tests/e2e/look5-verify-shot.mjs), typecheck.
DONE: F5 alerts: isCentreCardUp/centreCardUp in ui/hud/blockingCard.ts (+tests), store.ts uses it (hand-over/winter banner/flight no longer drop Resolved). F6 MANUAL lines 152, 252 (alerts), 822 edited.
Root cause of "Resolved across 75 s lapse" NOT found (real clock expiry is 4 s; likely harness screenshot within 4 s of a clear at lapse end, or flapping alert): say so in report.
TODO: typecheck; folder tests (render/camera, game/views, game/flows, ui/hud); run tests/e2e/look5-verify-shot.mjs once (seed 1, ~6 min, see header of the script) then look at pngs; update look-pass-5-report.md (item 1, still-unfinished #4, needs-from-others #4) and MANUAL; final StructuredOutput.
Warm constant light: decide after (probably notDone).
DONE: constant lapse light: FrameInfo.lightHour (render/index.ts), worldSlot lightEnv -> w.env hour, FSHOT_LIGHT_HOUR=17.5 (camera/constants), Game.renderScene passes it while views.foundingShotOn. Typecheck clean; tests green (render/camera, game/flows, game/views, ui/hud) before this last light change.
NEXT: run real seed-1 browser: FIRSTPLAY_SEED=00000001 FIRSTPLAY_UNTIL=12 node tools/harness/play.mjs --root . --query "test=1&quality=test" --script tests/e2e/look5-verify-shot.mjs --out test-output/look5-fix/shot-s1 --script-timeout 3000000 > test-output/look5-fix/shot-s1.log (≈6 min); look at 11-timelapse.png and 12-outcome-card.png. Then report update + final output.
ALL DONE; only final output left
