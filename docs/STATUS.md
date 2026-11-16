# FOUNDRESS — build status log (orchestrator's running notes)

## Standing instructions from the user
- Build the full game end to end from `docs/00-original-brief.md`; no questions to the user.
- **Model policy (user, 2026-11-12): subagents/workflows must use Opus 5.5 and Sonnet 5.5 wherever possible; do not spawn Fable 5.2 subagents casually — they are expensive.**
  - Sonnet 5.5: research, fact-checking, asset processing, docs, UI panels, data tables, tests, mechanical fixes.
  - Opus 5.5: hard engineering (locomotion, nest/carve, AI behaviours, shaders/rendering, world generation), design synthesis, code review.
  - Fable 5.2: orchestrator only (architecture decisions, reviewing key contracts, final judgement). No Fable subagents unless an Opus attempt has demonstrably failed on a specific hard problem.
  - Workflow `agent()` calls always pass an explicit `model` ('sonnet' | 'opus') and an `effort`.
- Workflow concurrency is 2 agents per workflow here (4 CPUs), so parallelism comes from running 2-3 workflows side by side.

## Plan
1. Research + technical spikes (running).
2. Design: GDD chapters -> consistency pass -> TDD + contract files -> contract review -> implementation plan.
3. Foundation: scaffold, contracts, kernel ported from spikes (field, carve grid, marching cubes, walker, nav), app shell, debug API, harness smoke test.
4. Wave 1 (Tier 1 core) -> integration gate.
5. Wave 2 (Tier 2 sandbox systems) -> integration gate.
6. Wave 3 (Tier 3: three more species, accessibility, polish) -> integration gate.
7. QA loops: scripted playtests with screenshots, headless soak/balance runs, code review, performance.
8. Delivery: production build, published playable artifact, source zip, manual.

## Log
- 04:47 project created at /home/user/foundress; brief copied; seed, directions and architecture docs written.
- 04:52 first workflow launch (all Fable) — stopped at 04:59 on the user's cost instruction; nothing had completed.
- 05:01 relaunched: research-core (Sonnet), research-species (Sonnet), tech-spikes (stack on Sonnet; nest/ants/look on Opus).
- 05:25 species research done (Camponotus pennsylvanicus BU 9, Messor barbarus BU 7, Atta texana BU 7 confirmed). Core research written; fact-checks finishing. Assets: 25 CC0 materials + 46 audio files, 20 MB, licence audit running.
- 05:27 stack spike done -> docs/research/tech-stack.md (three 0.187, vite 8.3.8, TS 7.0.2 native, vitest 5.1, preact 11.2, postprocessing 6.39.6; harness tools/harness/play.mjs; portable classic build needed for opaque-origin iframes).
- 05:26-05:31 launched all 8 GDD chapters (4 workflows, script scratchpad/wf-gdd-chapters.js), nest/ants spikes running (look queued), F1a scaffold+core (script scratchpad/wf-build.js, spec docs/design/tasks/F1a-scaffold-core.md).
- Decisions added: directions §J (units, canonical ids, nav model), §K (no per-agent weights, caps, calendar anchor); architecture §8 (packaging constraints); docs/design/tdd/00-contracts-guidance.md (contract shapes).

## Next (in order)
1. When all GDD chapters are done: run scratchpad/wf-gdd-consistency.js (edit -> traceability -> close gaps) => docs/design/gdd/00-index.md with the contract digest.
2. F1b: contracts + sim skeleton + stubs from the digest (Opus), then orchestrator review of src/sim/types.
3. F2 kernel port from spikes/nest (field, carve, marching cubes, walker, nest nav) and F3 app shell (renderer, loop, camera, input, asset loader, debug API).
4. Write Wave 1 task specs with exclusive file ownership; run them through wf-build.js, 2-3 workflows side by side.
- 05:42-06:05 all 8 GDD chapters written (~150k words): docs/design/gdd/01..08. Digests (Sonnet) in docs/design/gdd/digests/NN.md (07 running).
- 06:02 F1a done: scaffold + src/core (129 tests, verify pass-with-minor). F1a-fixes (Sonnet) running for the minor nits.
- 06:02 launched F1b contracts (Opus). 06:06 launched F3a render/input/camera (Opus). Specs: docs/design/tasks/{F1b-contracts,F2-kernel,F3a-render-input-camera}.md
- Rulings added to directions §K: speeds (cruise 6 BU/s), custom rules, no "w", calendar windows as year fractions, 7-day human week, thresholds in simulated workers, two kinds of pre-existing passage.
- Orchestrator wrote src/sim/types/geom.ts (shared by kernel and contracts).

## Next (in order) — supersedes the list above
1. When digest 07 is done: run scratchpad/wf-gdd-consistency.js (edit -> traceability -> close gaps) => docs/design/gdd/00-index.md (registry, shared constants, contract-affecting decisions).
2. When spikes/nest reports (docs/research/spike-nest.md): launch F2 kernel (spec ready) with wf-build.js, model opus, effort xhigh.
3. After F1b + F2: foundation integration pass (wire kernel into createSim, replace PROVISIONAL service types, sync contracts with 00-index "contract-affecting decisions"), orchestrator review of src/sim/types; then F3b (Game orchestrator, debug API, UI root, debug renderers).
4. Stage 1A task specs (planner agent on Opus from module map + GDD digests + contracts), then run Stage 1A.
- 06:12 nest spike WORKS (screenshots reviewed by orchestrator: entrance hole, tunnel 3rd-person camera, x-ray cutaway with 50 AI ants). Key findings folded into specs: smooth min/max field with soil/hard split, ramp brush for digging, 2D hole mask, prefer-floor bias, lantern lighting.
- 06:15 launched F2 kernel (Opus xhigh). Consistency edit running. F1b, F3a running.
- Specs ready: F-int-foundation, F3b-game, Stage 1A (loco, phero, nestops, colony-core, actions, env-core, worldgen-terrain, render-world, render-nest, render-ants). Still to write: ui-shell, save (after F3b).

## Launch order from here
1. F1b + F2 done -> F-int (Opus). F-int + F3a done -> F3b (Opus).
2. After F-int: Stage 1A sim tasks (loco, phero, nestops, colony-core, actions, env-core, worldgen-terrain) in 3 workflows side by side. Render tasks (render-world/nest/ants) can start after F3a + their spike docs.
3. After F3b: ui-shell, save.
- 07:07 F1b contracts done (verify found 10, 8 fixed). Orchestrator reviewed state/ant/walker/services/nest types: coherent.
- 07:08 GDD consistency done: 99 conflicts resolved, docs/design/gdd/00-index.md (registry B, constants C, 107 contract-affecting decisions D, decision log E, risks F); traceability 110 statements -> all covered after gap closure (docs/design/gdd/traceability.md).
- 07:10 launched F1c contracts sync (applies section D + orchestrator rulings; contracts FROZEN after). Digests being regenerated from the edited chapters.
- Ants spike WORKS (screenshots reviewed: anatomically correct ant, 2000-instance crowd). Look-dev spike finishing.
- Machine load ~8 on 4 cores: keep at most 2-3 rendering-heavy agents at once.

## Launch order from here (supersedes earlier lists)
1. F1c done -> launch Stage 1A kernel-independent sim tasks: phero, colony-core, env-core, actions, sources-core (wf-build.js; 2 per workflow).
2. F2 done -> F-int (Opus). F-int done -> loco, nestops, worldgen-terrain.
3. F3a done (+F-int) -> F3b (Opus). F3a + F1c done -> render-ants, render-world; F2 done -> render-nest. Stagger visual tasks.
4. F3b done -> ui-shell, save.
5. Then write Stage 1B specs: beh-forage, beh-nest, architect, worldgen-outdoor/interior/life, render-decor, founding, views, ui-hud, packaging; integration gate after Stage 1A.
All specs: docs/design/tasks/*.md. Build workflow script: scratchpad/wf-build.js (args: {tasks:[{key,spec,model,effort,verifyModel,visual,verify}]}).
- 07:17 F3a done (render app, asset loader, input, camera rigs; 437 tests repo-wide). Launched render-ants + render-world (Opus, behind simAdapter.ts).
- 07:21 Stage 1B specs written (beh-forage, beh-nest, architect, worldgen-outdoor/interior/life, render-decor, founding, views, ui-hud, packaging). Consistency pass 2 running (residual conflicts list: docs/design/gdd/digests/residual-conflicts.md).
- wf-build.js preamble now states GDD precedence (seed > directions J/K > 00-index > owning chapter) and tells implementers to cover Appendix E checks.
- Still to write: Stage 2 and Stage 3 specs; integration-gate task specs (int-1A, int-1B).
- 07:46 consistency pass 2 done (51 more resolutions; 4 late contract items D7.1-D7.4 folded into F-int spec). All four spikes complete; look-dev screenshots reviewed (macro look + underground scent-lit look both good).
- 07:51 ALL task specs written: Stage 1A, 1B, 2, 3 (docs/design/tasks/*.md, 57 files). Remaining orchestrator work: launch waves per module map, integration gates, QA playtests, packaging/delivery.
- 07:52 Stage 1A wave 1 launched (kernel-independent): phero, colony-core, actions, sources-core (Opus), env-core (Sonnet/Opus verify). Also running: F1c verify, F2 fix, render-ants, render-world.
- Pending triggers: F2 done -> launch F-int + render-nest. F-int done -> launch loco, nestops, worldgen-terrain, F3b. F3b done -> ui-shell, save. Then Stage 1A integration gate (write int-1A spec), then Stage 1B.
- 08:01 F2 kernel DONE (9 review findings fixed, 91 tests, perf budgets met). Launched render-nest.
- 08:11 F1c DONE: contracts synced with design index and FROZEN (additive only from now). Launched F-int (implement-only; wf-build.js now supports tasks with skipImpl:true for a later verify+fix run).
- When F-int impl completes: launch (a) F-int verify+fix via {key:'F-int-foundation', spec, skipImpl:true}, (b) loco, nestops, worldgen-terrain, (c) F3b. Notes for integrators: docs/design/tasks/notes-foundation.md (regenerate with scratchpad/collect-notes.py).
- 08:54 F-int impl DONE (sim on real kernel, height overlays, makeTestSim nest/workers options, tools/sim/soak.ts). Launched loco, nestops, worldgen-terrain (Opus) and F-int verify+fix (skipImpl).
- Machine load ~17: HOLD F3b (visual) until the render-ants/render-world workflow finishes; cap visual agents at 2-3. wf-build.js preamble now warns about load-noisy perf numbers.
- Stage 1A status: phero/env-core/sources-core in fix; actions in verify; colony-core in impl; render-ants in fix; render-world in verify; render-nest in impl.
- TODO next: launch F3b when a render slot frees; then ui-shell + save after F3b; write int-1A gate spec; then Stage 1B.
- 09:18 env-core DONE, render-ants DONE. Launched F3b (game shell). Running: render-world fix, render-nest impl, worldgen-terrain impl, actions fix, loco impl, nestops impl, colony-core fix, F-int verify.
- Launch policy for Stage 1B: start early (before the gate) only the seam-light tasks when their dependency lands: render-decor (after render-world), worldgen-outdoor + worldgen-interior (after worldgen-terrain), packaging + ui-shell + save (after F3b). Hold beh-forage, beh-nest, architect, worldgen-life, founding, views, ui-hud until gate int-1A passes (spec docs/design/tasks/int-1A.md; generate docs/design/tasks/notes-1A.md with scratchpad/collect-notes.py first).
- 09:31-09:40 DONE: phero, colony-core, actions, sources-core. F-int verify: pass-with-minor (7 minors incl. NaN-position hang in PrimHash.query, 2/20 workers fail walk-out, materialAt allocation with overlays) -> to be fixed in gate int-1A (they are in the collected notes).
- Still running (Stage 1A): render-world fix, render-nest verify, worldgen-terrain impl, F3b impl, loco impl, nestops impl. Not started: ui-shell, save (after F3b).
- 09:55 DONE: render-ants, render-world (orchestrator reviewed kerb + breach/mound screenshots: good). Launched render-decor.
- Stage 1A remaining: render-nest (verify), worldgen-terrain (impl), F3b (impl), loco (impl), nestops (impl); then ui-shell + save after F3b; then gate int-1A.
- 10:46 DONE: render-nest. Launched ui-shell + save (Sonnet impl / Opus verify). Running: render-decor impl, worldgen-terrain verify, F3b fix, loco fix, nestops fix.
- When loco, nestops, worldgen-terrain, F3b are all done: generate docs/design/tasks/notes-1A.md (collect-notes.py with keys: phero colony-core actions sources-core env-core loco nestops worldgen-terrain render-world render-nest render-ants F3b-game F-int-foundation [+ ui-shell save render-decor if done]) and launch gate int-1A (Opus high, visual, verifyModel opus). Seam-light Stage 1B tasks can start alongside: worldgen-outdoor, worldgen-interior, packaging.
- 11:04 DONE: F3b game shell (orchestrator viewed smoke screenshot: game boots with debug renderers, HUD line, prompt, queen possessed). Real renderers get registered in gate int-1A.
- Waiting for: loco (fix), nestops (fix), worldgen-terrain (verify) -> then gate int-1A. Also running: render-decor, ui-shell, save.
- 11:05 DONE: loco, nestops. Found workflow fault: review findings were truncated at 9,000 chars before reaching fixers (23 findings possibly unseen, mostly minor; one loco major: nav-grid change rebuilds all flow fields). Fixed wf-build.js limit (80k) and recorded them in docs/design/tasks/notes-truncated-findings.md.
- 11:08 Launched the Stage 1A integration gate as two parallel halves: int-1A-app (renderer registration, game flow, browser e2e) and int-1A-sim (module seams, tests, soak). Specs docs/design/tasks/int-1A-{sim,app}.md; notes docs/design/tasks/notes-1A.md (27k words).
- Still running besides the gates: worldgen-terrain fix, render-decor impl, ui-shell impl, save impl.
- After the gates: read docs/design/tasks/gate-1A-{sim,app}-report.md, view the stage1a screenshots, then launch Stage 1B (beh-forage, beh-nest, architect, worldgen-outdoor, worldgen-interior, worldgen-life, founding, views, ui-hud, packaging), 2-3 workflows side by side, visual tasks capped at 2-3.
- 12:03 DONE: worldgen-terrain (zone map reviewed by orchestrator: plausible lot layout). Ruling added (directions §K): founding-site quality must discriminate (distribution targets; queen start rule) -> owned by worldgen-life (calibration) and founding (same factors).
- 12:05 Launched worldgen-outdoor + worldgen-interior (Opus). Running: gates int-1A-app + int-1A-sim, render-decor, ui-shell, save.
- Stage 1B still to launch after the gates: beh-forage, beh-nest, architect, worldgen-life (after outdoor/interior), founding, views, ui-hud, packaging.
- 12:48 DONE: ui-shell, save (orchestrator viewed title + new-colony screenshots: good). TODO noted: title screen needs a live 3D backdrop scene (add to a Stage 2 polish task "title-scene").
- Running: gates int-1A-app + int-1A-sim, render-decor, worldgen-outdoor, worldgen-interior.
- 12:50 Gate reports read (docs/design/tasks/gate-1A-{sim,app}-report.md) and stage1a screenshots viewed. Sim: founding dig -> eggs -> brood, 60-worker scripted foraging, save/load determinism, 3-day soak 0 violations, 0.5 ms/tick. App: real renderers registered; game boots on generated world; defects listed (no entrance/chamber for free dig, heap buries entrance, square-pyramid mounds, tunnel camera too close, colour grade unused, decor not registered).
- New specs: nest-fixes (entrances/chambers/mounds for free digging), render-integration (decor slot, boundary, grade, fades, title backdrop). views spec updated with tunnel-camera finding. All 1B specs now point at the gate reports.
- Stage 1B launch plan (after both gate workflows finish): wave A = beh-forage, beh-nest, architect, nest-fixes (sim, Opus) + views, ui-hud (visual). wave B = founding (after nest-fixes), render-integration (after render-decor), packaging, worldgen-life (after outdoor/interior). Then gate int-1B = first playable + send source archive to user.
- 13:15 Gate int-1A-sim DONE. Launched Stage 1B wave A (sim): beh-forage, beh-nest, nest-fixes, architect (Opus).
- Still running: int-1A-app (verify/fix), render-decor fix, worldgen-outdoor impl, worldgen-interior impl.
- Next: when int-1A-app completes -> views + ui-hud. When nest-fixes completes -> founding. When render-decor completes -> render-integration. When worldgen-outdoor+interior complete -> worldgen-life. Then packaging. Then gate int-1B (first playable) + send source archive to the user.
- 13:16 DONE: render-decor (orchestrator viewed lawn + forest screenshots: scale reads well; polish later: leaf surface detail, blade translucency).
- Waiting on int-1A-app fix -> then launch views, ui-hud, render-integration. Running: beh-forage, beh-nest, nest-fixes, architect, worldgen-outdoor, worldgen-interior.
- Polish list (for QA stage): leaf vein/normal detail, grass translucency; mound shape (nest-fixes); tunnel camera (views); title backdrop (render-integration).
- 15:22 DONE: gate int-1A-app (fix round). stage1a.mjs passes with EXPLICIT stand-ins (chamber registration, lay-egg budget, cheat pellets); tunnel shot 03 still unusable (crevice camera + capsule dither shows sky) -> assigned to views (addendum in its spec). Wing membrane fix (queen no longer milky). Committed 4b280e7.
- 15:24 Machine was at load 22 with 3 GB RAM free (vitest workers up to 2 GB each): capped vitest at 2 workers per run (VITEST_MAX_WORKERS), testTimeout 20 s. Sent the user a source snapshot (scratchpad foundress-source-stage1A.tar.gz, 66 MB) as a safety net.
- 15:27 Launched views (Opus) + ui-hud (Sonnet impl / Opus verify) = task we7aeb6ze. Running: beh-forage impl, beh-nest impl, nest-fixes verify, architect fix, worldgen-outdoor verify, worldgen-interior fix.
- Next launches: render-integration (when a visual slot frees: after nest-fixes/architect workflow or worldgen workflow finishes); founding after nest-fixes (add addendum from nest-fixes report + gate items: lay-egg 'budget' refusal for founding queen, cheat.setFoundingState, automatic pellet expulsion, ensureThermal in createNewGame); worldgen-life after outdoor+interior (add addendum: queen start must have diggable soil — seed 1 starts indoors in a plant pot); packaging.
- Open low-priority item: LOD observer is camera state; replay determinism from seed+commands would need a sim-side carrier (state.player.observer). Saves are unaffected.
- 16:30 DONE: nest-fixes (free-dug shaft registers entrance + founding cell; foundingReadiness(); mounds 8-neighbour, craters keep mouths clear) and architect (needs -> plans, layoutNest for rivals; 400-worker layout 82 ms vs 50 ms budget: needs nestops tight plan bounds + incremental nav rebuild -> 1B gate/perf task). worldgen-interior DONE (inside wf_bb24490e; outdoor still in fix). Committed 7034c57.
- 16:33 Launched founding (Opus) + packaging (Sonnet impl / Opus verify) = task wp9rgfz5p. Addenda written into founding.md and worldgen-life.md (queen start not diggable on seed 1 -> worldgen-life).
- Running: beh-nest verify, beh-forage fix, worldgen-outdoor fix, views impl, ui-hud impl, founding impl, packaging impl.
- Next: render-integration after views impl is done (both touch src/render/slots + FrameInfo); worldgen-life after worldgen-outdoor completes. Then generate notes-1B.md (collect-notes.py keys: beh-forage beh-nest architect nest-fixes worldgen-outdoor worldgen-interior worldgen-life render-decor render-integration founding views ui-hud packaging ui-shell save int-1A-app int-1A-sim) and launch gates int-1B-sim + int-1B-app (specs drafted in docs/design/tasks/).
- wf-build.js preamble now tells agents: no whole-suite runs, committed tests <= ~20 s/file and <= 3 seeds, big sweeps behind FOUNDRESS_LONG=1, one heavy process at a time.
- Items for the 1B sim gate from architect/nest-fixes reports: nestops plan bounds are a cube (4.75x too big; validation + planCache cost) -> tight bounds; acceptPlan handler no-op; haulers must clear spoil piles inside the nest (pellets tamp after 1200 s and can close a 2 BU neck); balance/index.ts should re-export balance/architect.ts; mound batch cost doubled (40-90 ms per 250 ticks per mound) -> spread over ticks if over budget.
- 16:36 Orchestrator review of screenshots: tunnel possession camera now usable (views); HUD clean (ui-hud); BUT the world look is far from the spike reference at ant height (flat speckle ground, disc-on-stick flowers, every metal object rust-blotched, founding queen shown winged). New task spec docs/design/tasks/look-pass.md (materials, ground relief, plant dressing, props, sky/light, world occlusion fades, dealate queen). Scope split: render-integration keeps slots/decor registration/grade/boundary/title backdrop + plumbing of FrameInfo.fade -> WorldFrame.occlusion; look-pass owns the world shaders.
- 16:37 Launched render-integration + look-pass (both Opus, visual) = task wc3vo4y71. Running now (9 agents): beh-nest verify, beh-forage fix, worldgen-outdoor fix, views impl, ui-hud impl, founding impl, packaging impl, render-integration impl, look-pass impl.
- Gate int-1B-app must NOT edit src/render/world/** while look-pass is still running (add that to its spec if they overlap).
- 18:05 DONE: beh-forage + beh-nest (fix rounds applied; committed 8bbf74e). Items for the 1B sim gate: (1) LOCOMOTION ROOT CAUSE — an autonomous walker with a nest point goal often stands still for seconds with nav.status 'moving' and speed 0 (goals 0.4-2 BU away, or upside down on a tunnel ceiling); beh-nest works around it locally; fix in loco. (2) beh-nest perf unproven: 6.39 ms/tick for 800 ants at load 23 (budget 1.5 ms); job board rebuilt every tick (GDD says every 2 s; needs the board in state or an aligned rebuild for save/load equality). (3) beh-forage perf 1.96 ms vs 1.2 ms under load. (4) colony-core: public count-only delivery API; cheat.injectReturn radius; stores-full alert; allocator should not reassign ants that are outside. (5) HOME_DEPOSIT passive home pheromone has no owner. (6) nest: deepest dead-end query for internal-dump + midden-blocked flag. (7) actions: crop-load / queen-feed / eclosion-help / cannibalism primitives (careActs.ts adapter today), unload-to-chamber for liquids. (8) stale behaviourRunner.test.ts. (9) balance/index.ts should re-export foraging + nestwork + architect. (10) possible import cycle colony/founding/clutch.ts <-> ants/actions (`ports.canLay is not a function` depending on import order).
- 18:08 Launched early (CPU-light / seam-light) = task w822e0zvr: audio (Opus), species-data (Sonnet impl / Opus verify), codex-content (Sonnet / Sonnet). Addenda written into their specs.
- Running now (8 agents): founding impl, views impl, render-integration impl, look-pass impl, worldgen-outdoor fix, audio impl, species-data impl, codex-content impl. ui-hud and packaging agents are finished (their workflows wait on views / founding).
- Next: worldgen-life when worldgen-outdoor completes; then notes-1B.md + gates.
- 18:15 DONE: worldgen-outdoor (fix round; committed 6ea9d7d). Fences continuous, back step/doormat/chairs seated, all 129 micro-connections useful+passable over 10 worlds, 2065/2069 climb routes walkable. Left: generation over the 3 s budget (derived-map column rasteriser: tilted paving slabs), nine red tests in files owned by finished tasks, three validation evaluator defects.
- 18:20 Launched = task wqkyfyoim: worldgen-life (Opus; owns populate/**, maps/start.ts, maps/suitability.ts, validate/**) + worldgen-fixes (Opus; NEW spec: column rasteriser, derived maps, pipeline timing, the nine red tests incl. the cross-map walker). Ownership split written into both specs.
- Running now (9 agents): founding impl, views impl, render-integration impl, look-pass impl, audio impl, species-data impl, codex-content impl, worldgen-life impl, worldgen-fixes impl.
- Stage 2 wave plan (after gate 1B): 2A = ecology-plants, creatures, combat, progression, weather-effects (visual), human-events (visual), render-creatures (visual; seam-light, may start as soon as a visual slot frees). 2B = rivals (after combat+creatures), overwinter-repro (visual), ui-panels (after progression), scent-fx (visual), onboarding, photo.
- 18:40 Carved the known sim root causes out of the 1B sim gate so they start now: task w6p7lz1hm = sim-fix-ants (Opus; owns src/sim/locomotion/**, src/sim/ants/**: walker stall, behaviour cost + board cadence, action primitives replacing careActs, deliver-first, home deposits, avoid markers) + sim-fix-colony (Opus; owns src/sim/nest/**, src/sim/colony/** minus founding, ecology/sources, balance index: plan bounds, spoil/tamping, mound cost, entrance alert, delivery API, stores-full alert, allocator rule, Tier 1 sources). int-1B-sim.md has "Addendum 2" telling the gate to verify and connect rather than redo.
- Running now (11 agents): founding impl, views impl, render-integration impl, look-pass impl, audio impl, species-data impl, codex-content impl, worldgen-life impl, worldgen-fixes impl, sim-fix-ants impl, sim-fix-colony impl. Machine: 3 headless-browser renders dominate CPU.
- notes-1B.md keys to collect at the gate: beh-forage beh-nest architect nest-fixes worldgen-outdoor worldgen-interior worldgen-life worldgen-fixes sim-fix-ants sim-fix-colony render-decor render-integration look-pass founding views ui-hud packaging ui-shell save audio species-data int-1A-app int-1A-sim
- 20:10 DONE: audio (engine, ambience matrix, cue map, synth fallbacks, giants, UI sounds, generative music; 71 tests; never starts before a gesture), species-data (four validated SpeciesDef files + derive helpers; T3 species `available: false` until their modules ship), codex-content (102 codex entries with dossier-quote provenance, text tables, 9-page manual with verify-at-release marks). Committed.
- Rulings added to directions §K: calm-scene loudness target about -27 LUFS (audio currently renders -40 to -50 dBFS RMS -> AUDIO PASS needed: master trim + giants-bus compressor; do it in the Stage 2 gate or a small audio-polish task), species availability rule + never test caste === 'worker'.
- Audio follow-ups for the Stage 2 gate: bite cue strength = target hardness (actions runner.ts:109); duplicate dig-bite cue (runner + nest/bite.ts); Settings > Audio status line + "click to enable sound" (audioStatus/audioEnable from '@/audio'); __game.ui.audio.status()/cueLog() aliases; diag-audio; cues waiting for emitters (creatures, weather, human events, combat: Stage 2 tasks must emit the ids listed in src/audio/README.md); alarm-shimmer setting; CPU bench on a quiet machine; packaging: switch INCLUDE_ALL_AUDIO to a reference scan.
- Species follow-ups: getAntStats -> species/derive.ts (entities owner); colony/life.ts larvaFood -> derive.larvalCost; SEXUAL_STAGE_DU_MULT double-count for non-Lasius; founding clutch/cheats use def.opening.firstBroodClass instead of 'worker'; polymorphic-aware caste checks in nest/substrate.ts, actions/defs/dig.ts, behaviours/nest/idle.ts, architect counts; diag-nest-space Infinity when capacity is zero (speciesGame.test red until fixed; sim-fix-colony is editing nestSpaceDiag now).
- Content follow-ups: progression must use milestoneText/alertText and emit codex.unlocked; UI reads through '@/content'; founding flow should use aimText()/FOUNDING_FAIL_TEXT; WORDING table of proposed string changes is in the codex-content report (notes file) for the app gate.
- 20:20 Launched early Stage 2 (non-visual, own folders) = task w2djcpn9k: progression (Opus) + creatures (Opus). Addenda in their specs (text lives in src/content; code against stubs/contract types).
- Running now (10 agents): founding impl, views (verify?), render-integration impl, look-pass impl, worldgen-life impl, worldgen-fixes impl, sim-fix-ants impl, sim-fix-colony impl, progression impl, creatures impl.
- Stage 2 remaining to launch after gate 1B: ecology-plants, combat (both touch src/sim/ants/behaviours/outdoor -> after sim-fix-ants), weather-effects (visual), human-events (visual), render-creatures (visual), rivals (after combat+creatures), overwinter-repro (visual), ui-panels (after progression), scent-fx (visual), onboarding, photo; plus an audio pass (loudness ruling, cue emitters).
- == Nov 15 == Session resumed after the weekly usage limit cut off seven agents on Nov 12 (fix:founding, fix:views, fix:worldgen-life, impl:worldgen-fixes, impl:look-pass, verify:sim-fix-ants, impl:creatures). Done and committed before the cut: progression (fix round applied), render-integration (fix round; map edge still weak), sim-fix-colony (fix round), ui-hud, packaging, audio, species-data, codex-content.
- 16:55 Baseline on the idle machine: typecheck clean; full suite 3317 pass / 23 fail (17 files) in 816 s -> test-output/full-suite-nov15.txt. Failures: populate.verify (3, known review findings), outdoor.test (3), interior.test (1), pipeline.test R2 fixture, both layering tests (Math.hypot in worldgen/testing/walker.ts, performance.now in sim/ants/testing/costTable.ts, window in sim/locomotion/update.ts, populate importing balance/ecology), stubs.test, sim.test restore-equals-uninterrupted (!), architect layout 50 ms, commands.robust periodic-system collision, founding rules.verify + outcome.verify (known blockers), outdoor determinism.perf, sfaReview feed-queen, content text.verify (2) + manual.verify + codex.verify (minor findings never fixed: content verify passed-with-minor).
- Rulings (directions §K): site-quality shares revised (only caps on excellent/good + 3 good sites near start are binding; ONE scoring function/threshold table, founding owns unification and may edit worldgen maps/suitability.ts + SUIT).
- wf-build.js gained `startAt: 'fix'` + `reviewPath` (fix-only runs reading docs/design/tasks/reviews/<key>.json). Workflows have a 2-agent concurrency cap each (4 CPUs), so launch pairs.
- 17:00 Resumed as three workflows: wnivo4bq3 = founding fix + views fix; wvpsj0avp = worldgen-life fix + worldgen-fixes (impl restart on partial work); we3iw055l = look-pass (impl restart on partial work) + sim-fix-ants (verify -> fix). Held: creatures (impl restart; partial work in src/sim/ecology/creatures).
- Economy plan: fewer parallel agents (<= 6, <= 3 visual); first-playable gate + published build + source archive take priority over Stage 2/3.
- Gate notes keys (collect-notes.py): add progression, creatures when done; journals of the resumed runs: wf_4cadfab0-257, wf_29443f25-e24, wf_0d1bed28-f6c.
- 17:20 User supplied a git remote: origin = https://github.com/9thLevelSoftware/ants.git (was empty). Pushed main (75 commits). FROM NOW ON: push main after every milestone commit (`git push origin main`, retry with backoff on network errors). The repo was empty, so work goes straight to main (no PR base existed).

### Nov 15, 19:10 — founding round 2 + views fix landed; round 3 launched
- **views**: all 12 review findings closed; e2e green (15 screenshots, reviewed 04 and 12). HUD overlap and a
  flat blue disc in colony view noted in `int-1B-app.md` addendum.
- **founding round 2**: 9 of 12 findings fixed (reopen, seal by action, passive path, single site-quality
  function, starvation alarm held). Open: sealing fails in steep/wide throats (browser e2e stops at beat 03),
  first workers before winter on default start (6/8 at Summer 3, 8/8 at Summer 2), midden false alarm, empty
  red alert card.
- **Ruling**: Lasius `startDoy.default` 10 → 9; if not enough, a founding-only development factor (brief:
  "fast-tracked first brood"). Spec: `docs/design/tasks/founding-close.md` (Opus, visual, no separate review —
  the 1B gate verifies).
- Running: founding-close; worldgen-life fix + worldgen-fixes; look-pass + sim-fix-ants review; combat +
  ecology-plants (launched 18:45).

### Nov 15, 19:35 — combat + ecology-plants landed (implement → review → fix); rivals + ui-panels launched
- **combat**: full GDD 05 §4 module, fight + patrol behaviours; review found 4 major + 10 minor, 12 fixed, 2 shown
  not to be defects (duel bias = seed noise over 2000 fresh seeds; removal.verify repeat visitor is a scout).
- **ecology-plants**: herds, honeydew, nectar rhythm, tend behaviour; review 2 major + 6 minor, all fixed.
  3-day long run: 77–99 % of herd production reaches the nest.
- **Integration list for the gates** (not done by the task owners):
  - `src/sim/ants/behaviourRunner.test.ts`: expected task list needs fight, patrol, tend (Lasius/Camponotus).
  - `src/sim/testing/stubs.test.ts`: combat is real (applyDamage(queen, 5) = 4).
  - Colony `computeDemand` must call `herdTendDemand`; then `TEND_DEMAND_ADAPTER = false`.
  - `ECOLOGY_TIER` 1 → 2 at the Stage 2 gate (herds and flower rhythm are off in the real game until then).
  - Action library: pass attacker id to applyDamage; native `dodge`/`sting` shells; bite shell asks combat
    (pinned/stunned), spray shell asks combat (gaster wound); drop fixed-strength bite cue.
  - `fleeTask`: hand back `rest` (not `idle`) at health < 0.25.
  - Colony regen vs GDD 05 §4.7 (0.25/gd in nest, 0.1 elsewhere; colony gives 0.2 everywhere); injured bias.
  - Perception/locomotion: antenna-loss x0.6, trail noise x2, leg-loss climb x0.75; possessed prediction
    ignores movement overrides (pinned possessed ant may twitch).
  - Forage owner: does a scout crossing the rim zone count in removal.verify (limit 2)?
  - Text: `remedy.slider.tend`, `remedy.possess.tend` (given to ui-panels).
- Launched: rivals (Opus) + ui-panels (Sonnet implement, Opus review, visual).

### Nov 15, 19:45 — worldgen-life fix + worldgen-fixes landed
- **worldgen-life**: 10 of 11 findings fixed (renewable-only economy floors, zone-correct top-ups, start rule
  re-check). 145 swept worlds pass, 0 repairs; 14 % of standard worlds now need a second attempt.
- **worldgen-fixes**: derived-map step 2.4–4.6x faster, identical content; 8 of 9 red tests green; reviewed
  (pass with minors), minors fixed. Open: `checkStart` regenerate flag (validation), E8 on an idle machine,
  three LONG kernel crossings that trap the game's walker (locomotion).
- Gate prep: `int-1B-sim.md` Addendum 3 (integration list), `notes-1B.md` regenerated.
- Waiting for: look-pass + sim-fix-ants review/fix, founding-close → then both 1B gates.

### Nov 15, 20:45 — look-pass and sim-fix-ants landed (reviewed + fixed); both 1B gates launched
- **look-pass**: review 3 major + 4 minor; 6 fixed (car sky occlusion + skirt, asphalt glitter, leaf bend ≤ 1 mm,
  flower cap, dead leaf, wings at dealation). Quality-switch ghosting root cause is in `renderApp` (autoClear) →
  app gate. Orchestrator look at 4 frames: soil grit and ants good; underground queen now warm and readable;
  grass still faceted, white untextured pillar in woodland, under-car frame nearly black → app gate (exposure)
  and second look pass.
- **sim-fix-ants**: review 3 major + 5 minor; 7 fixed, budgets reported. Stalled share 0.01 %. Outdoor 1.33 ms
  at load 11 (budget 1.2 ms, idle unknown).
- Launched `int-1B-sim` + `int-1B-app` (Opus, with review). Still running: founding-close, rivals, ui-panels.

## Nov 15, 23:15 UTC — founding round 3 landed

- `founding-close` done (Opus, 15 M ms wall). Browser e2e completes on seeds 1 and 2, no stand-ins, no console errors; I looked at shots 02, 04, 08, 10 of seed 1.
- Sealing: guided from the real leak; 29 of 30 matrix cases seal (loam 30°/3.0 BU fails). Start day 9; `FOUND_FIRST_BROOD_DEV_MULT = 1.5`. Seeds 1–8 all accepted at start site or nearest good site; seed 7 start site stalls beside a log; seed 3 start site margin 0.83 GD (< 1.0).
- Good-site runs give 17–18 workers (above the chapter's 8–16); the engineer widened the sweep ceiling to 19 for Q ≥ 0.85. Revisit at balance pass.
- Open, passed to the running gates as addenda (they may or may not be read mid-run; re-issue as a follow-up task if not done): colony starvation false alarms (start and after hand-over), `last-ants` empty title, nest `reopening`→`sealed`, natural entrance registration, plug reach, locomotion stall on shaft walls / beside logs, first worker "stuck" on flat ground, warmth dots vs word, red alert dot always lit.
- Site abandonment still partial (no `abandoned-burrow`, no 3-burrow limit).
- Still running: rivals + ui-panels (`wfdd5p8cl`), both 1B gates (`wbzzr1gt5`).

## Nov 15, 23:50 UTC — rivals + ui-panels landed; Stage 2 pair launched

- `rivals` (Opus): 12 of 12 review findings fixed. Not done: thief ants (needs nest narrow-tunnel carve op), herd materialisation / `virtualTend` read by plants, Formica/Flavus mounds, corpse-carrying raiders, App. E 21/22 sweeps on generated worlds (integrator's `tools/sim` runs). Combat `mayAttack` still does not consult `rivals.isHostile` (sim gate or Stage 2 gate).
- `ui-panels` (Sonnet impl, Opus review): Colony health, Nest overview, Journal, Codex, marker palette, overlay controls + legends, alert click-through, gamepad route in colony view. I looked at health/nest/journal/dig-tool shots: good. Open: `codexUnlocks` hook in `src/game/save/install.ts` (one line), default pad bindings for the books, founding meters persist in the e2e test world (not in a real game after hand-over), `src/content/text/controls.test.ts` red (manual table vs input labels), "Protein intake: Good at 0.0 of need" sim diagnostic rule.
- Launched `wlu1imvyi` (wf_dc13b542-044): `render-creatures` + `scent-fx` (both Opus, visual). Told not to edit `src/render/slots/**`, `src/render/app/**`, `src/game/**` (app gate is in there); they report registration lines.
- Still running: both 1B gates (`wbzzr1gt5`).
- Stage 2 gate must wire: creatures renderer slot, fx slot + overlay host, `codexUnlocks`, `mayAttack`↔`isHostile`, `virtualTend`, `ECOLOGY_TIER` 2, rival-discovered progression listener, debug `query.rivals`/`query.territory`.

## Nov 16, 02:30 UTC — render-creatures + scent-fx landed; weather + human events launched

- `render-creatures` (Opus): 22 creature looks, herds, antlion pit, bird event, comfort modes; 8 of 9 review findings fixed. I looked at the close-up contact sheet: every animal recognisable, scale against a worker right; surfaces plasticky (look pass). Open: sim must register the antlion pit as a ground-height patch (`pitHeightOverlay` profile, copy `-1 + r^1.35` into `src/sim/ecology/creatures/antlion.ts createPit`) or ants float over the cone; slot registration + `comfort` in FrameInfo (Stage 2 gate); `ui.look()` → `lookOf()`.
- `scent-fx` (Opus): scent view (trail chevrons, home range, alarm, food plumes), temperature/moisture/threat overlays, particles; 8 of 9 findings fixed. I looked at the trail shot (chevrons read well, up the wall too) and the moisture shot (whole ground goes dark blue — too heavy, tune `FILL_ALPHA`/stain at the look pass). Open: dig-plans overlay outside colony view needs the views layer; slot replacement lines in `src/render/fx/overlays/fxSlotReplacement.ts`.
- Launched: `weather-effects` + `human-events` (both Opus, visual).
- Still running: both 1B gates (`wbzzr1gt5`): sim gate in review; app gate still implementing (5.5 h).
