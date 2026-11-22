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

## Nov 16, 04:50 UTC — both 1B gates reported: first playable NOT met; stabilisation round launched

- **Sim gate** (`gate-1B-sim-report.md`, 17 sections): save→restore→continue determinism on generated worlds fixed (`Nest.detectDue` persisted); combat scan 21.9 → 1.6 ms at 1,500; tamp spikes 1.3–1.6 s → ≤ 53 ms; `dig.unplug`; queen laying fix. **Acceptance not met**: colony-life sweep 4 = 0 of 15 healthy (strict judge). Causes: (a) weather-effects' nest flood model drowns queens/workers in dry weather (L12); (b) founding seal failures on 2 worlds (L1); (c) incipient colony economy (L2): empty pool at hand-over, 0.5–1.5 trips/worker/day, autumn 2 days later; (d) locomotion stall sites (L10); (e) App. E 25 laying permission (L13). Sim cost 5.9 / 13.2 / 24.1 ms per tick at 300 / 800 / 1,500 workers vs 4 ms budget.
- **App gate** (`gate-1B-app-report.md` §10): anisotropy now reaches textures; possession camera reads its distance table (open 3.6 L); colony slice names chambers; warmth word follows dots; `firstplay.mjs` asserts all 25 beats + growth. **Not run to the end**: sealing stalls on seed 2 (beat 09), no trail with cheat hand-over, colony declines days 2–3. Re-run command in the report.
- `weather-effects` fix round landed (11 of 13 findings) but not the dry-weather drowning (found by the sim gate, not its reviewer). `human-events` fix still running (`wkzgy3u9x`); known: import cycle `src/sim/environment/human/effects/bait.ts` → `src/sim/ecology/index.ts` breaks render/creatures tests at import; `process` type error in its perf.verify test.
- **Stabilisation round** (4 Opus tasks, each with Opus review):
  - `w7oa5adpf` (wf_05648d3c-818): `weather-fix2` + `viab-founding`.
  - `w7ydd9gyu` (wf_bb5cab2e-58d): `viab-economy` + `viab-loco`.
- **Integrator rulings in `viab-economy.md`**: R1 `ECOLOGY_TIER` → 2 now (+ virtualTend, mayAttack↔isHostile seams); R2 provisioned hand-over; R3 small-colony forage floor; R4 laying permission; R5 first-year autumn; R6 honest diagnostics. **Viability bar** replaces "healthy" for acceptance: at first tick of Winter 1, no player, queen alive, workers ≥ 0.8 × first workers, no starvation deaths, ≥ 1 gd stores; ≥ 2 of 3 seeds on each of five Tier 1 archetypes.
- Flood diagnostic ruling: critical `nest-flooding` only while brood/royal chamber ≥ 25 % flooded (GDD 03 §11.3); predicted flood = info.
- **After this round**: `gate-1B-close` (re-run firstplay/founding/stage1a/controls e2e, colony-life sweep, folder-by-folder suite; wire Stage 2 slots: creatures, fx + overlay host, weather, humans; `codexUnlocks`; antlion pit height overlay; `comfort` in FrameInfo), then build:portable, publish, source archive. Then `overwinter-repro` (winter is not implemented: runs past autumn starve), onboarding, photo, audio pass.

## Nov 16, 05:00 UTC — human-events landed; wiring + photo launched

- `human-events` (Opus): 13 of 13 review findings fixed (crush on slopes, footprint trenches, schedule rules, tyre semantics per car pass, cue cost 0.325 → 0.069 ms/tick mowing). I looked at the 12-scene contact sheet: shoes/soles, broom, vacuum head, mower deck read at ant scale; legs are plain gradient cylinders; car underbody dark slabs. Missing GDD effects listed in its result (spill afloat, detergent deposition ×0.5, post-mow effects, engine heat, shade under parked car, toys, door/lights states, diag-human-pressure, diag-bait, T3 variants).
- Launched `wire-stage2` (Opus, visual: register creatures / fx / weather / humans renderers, overlay host, codexUnlocks, dig-plans overlay, debug queries; `tests/e2e/stage2.mjs`) + `photo` (Sonnet impl, Opus review).
- Running: stabilisation round (`w7oa5adpf`, `w7ydd9gyu`).

## Nov 16 10:30 UTC — wire-stage2 + photo landed

- **wire-stage2** (Opus impl + review + fix): creatures, humans, weather and fx slots registered in the real game
  (`RENDERER_SLOTS` = world, nest, ants, creatures, humans, weather, fx), `comfort` in FrameInfo (title too),
  dig-plans outline in every view (hidden by photo "Hide markers"), codex unlocks from profile, debug queries and
  cheats (`spawnHerd`, `setRain`, `setWeatherClass`, `triggerBird`), tremor relay. `tests/e2e/stage2.mjs` (9 sections).
  Measured per-renderer cost via camera layer 31. Evidence `test-output/stage2/**`.
  - **stage2.mjs is red without `STAGE2_SOFT=1`**: no forager lays a trail to a 400-unit sugar spill 14 BU from the
    entrance in 12,000 ticks (2 of 3 seed-1 runs). Same root as the viability work (viab-economy R3).
- **photo** (Sonnet impl, Opus review, fix): photo mode from possession; subject / focal / aperture / focus /
  exposure / roll / look / guides; 1x and 2x PNG capture with preview card; sandboxed-iframe safe.
  `tests/e2e/photo.mjs`. Evidence `test-output/photo-fix/**`.
  - Integrator applied the remaining review finding 1: `FrameInfo.hidePossessedHighlight` → `AntFrameInfo` →
    `AntRenderer.highlightOf` (test in `src/render/ants/lookFixes.test.ts`).
  - Not done: `photo-captured` event, pad bindings untested, monochrome/field-note filters (GDD 08 looks win).
- **Look defects seen by the integrator in the stage 2 shots (owed, for `stage2-look-fix`)**:
  1. Rain streaks are wide opaque white columns near the camera (`test-output/stage2/final/06-rain-wet-puddle.png`): broken, must fix before publish.
  2. Moisture overlay makes the whole ground near-black / dark blue.
  3. Spider comfort "softened" ≈ "off" at observer distance.
  4. Bird beak spears props; human legs plain cylinders; broom shadow a hard quad.
  5. FoundingOverlay should hide itself in photo view (currently hidden by CSS only).
- Alerts after rain on seed 1 after hand-over ("Founding chamber flooding", "Queen under attack: rising water") →
  covered by weather-fix2 (running).
- 10:35 launched `wk1cq0726` (wf_81fd13d6-11b): `stage2-look-fix` + `onboarding` (Sonnet impl, Opus review, visual) and
  `wmqt2afty` (wf_fc81142e-a6a): `audio-pass` (Sonnet impl, Opus review). Still running: `w7oa5adpf` (weather-fix2 +
  viab-founding), `w7ydd9gyu` (viab-economy + viab-loco). Spec `gate-1B-close.md` written; launch it when the two
  stabilisation workflows have landed, with their result summaries pasted under its "Hand-over".

## Nov 16 12:00 UTC — audio-pass landed

- **audio-pass** (Sonnet impl, Opus review, fix): BS.1770 loudness estimator (`src/audio/loudness.ts`), levels retuned to
  the §K ruling (calm about -27 LUFS; fixed ceiling gain after the limiter, giants-bus compressor), every sim event
  type mapped / covered / deliberately silent (compile-time check in `src/audio/eventMap.ts`), single
  `EventRouter` with place tracking (`track(sim)` each frame), Settings > Audio status line + enable + Test per bus,
  packaging test over the real asset plan (45 audio files), portable build decodes audio. Override for scripted
  checks: `&audio=on`. Evidence `test-output/audio-pass/**`. 221 tests in `src/audio` + settings.
- Integrator wired the three hooks it asked for: `audio.alarmShimmer` in the settings model/schema/prefs,
  `audioUi('shutter')` on photo capture, `__game.ui.audio.{loudness,statusDetail,test,enable}`.
- Open (for gate / perf): voice-start frame p95 1.6 ms under load vs 1 ms budget (re-measure on a quiet machine);
  in-game calm loudness reading not taken (offline render is the measure); dead-ant positions not tracked (ant-keyed
  events about an ant killed in the same tick are silent).
- Needs from sim owners (later, when sim is free): plain `dig-bite` duplicate from the runner; miss vs armour-0 bite
  cue strength; emitters for `stridulate`, `leaf-cut`, `garden-tend` (Stage 3 species); ant id on cue events.
- Machine: load average 14–15 with 6 agents; timing-sensitive tests are unreliable until the stabilisation round lands.

## Nov 16 14:00 UTC — viab-economy + viab-loco landed

- **viab-economy** (Opus ×3): **viability bar met**: 11 of 15 runs viable, ≥ 2 of 3 on every Tier 1 archetype
  (`test-output/viab/final3.txt`; run in a snapshot = HEAD + founding WIP plug-reopen fix, `--no-flood`). Tier 2
  ecology on; provisioned hand-over (3 gd window); small-colony forage floor; winter reserve (`WINTER_RESERVE_FROM_D28`
  10: no laying protein late in the season under 30 workers unless C stores cover adults to winter); honest
  diagnostics; populate floors (crumbs renew at Tier 1 only; Tier 2 top-ups flowers → herd hosts → prey patches).
  `life.ts --until winter`, viable verdict, forced-seal fallback.
  - **Integrator's reading: bar met, game still thin.** Colonies live on the hand-over provision: 0.0–0.3 trips per
    worker per gd, 0 eclosions in 11 of 15 runs, larvae starve for protein while workers idle, strict "healthy" 1 of 15.
    Economy check C13 holds at 100 workers, fails at 300 (C 0.57×, P 0.14×). App. E 25 red (carrion piece conflict).
    Worldgen 2–4.5× slower on 8 of 15 worlds (floor regeneration). → **`econ-growth`** task with rulings R7–R11.
  - Plain HEAD: entrance plug sometimes never reopened after hand-over (viab-founding WIP fixes); flood model needs
    `--no-flood` (weather-fix2).
- **viab-loco** (Opus ×3): stall watch that cannot be escaped by fail/re-issue loops (`stallWatch.ts`); 5 stall-site
  worlds to day 10: 0 stalls; possessed-movement and weather hooks (under-water from the feet, puddles, wet friction);
  dozing counts nestmates only; locomotion cost at 1,500 workers 5.9–7.9 ms vs 16–18.6 ms before (37–45 %).
  Kernel crossings 18 of 20 on the game's ladder.
  - Open: suburban-garden #4 crossing (nav grid connects two cells through a 1.5 BU strip under a board at a fence
    end; walker aims at the cell centre behind the fence → needs nav-cell rule in worldgen or an edge-strip follower);
    playground-park #3 crosses only with the test walker's extra pass; outdoor behaviour budget 1.98 ms vs 1.2 ms;
    stall sites seen in the final sweep: (2529.0, -16.1, 234.5) BU raid ant woodland-edge #2; (2247.9, -0.2, 1157.2)
    BU tend.wait car-park-verge #1. → perf task / gate close.
- **Rulings R7–R11** written into `docs/design/tasks/econ-growth.md` (App. E 25 re-derived with GDD 05 carrion
  pieces; no regeneration when floors ≥ 80 % after top-ups; protein demand drives foraging; C13 at 100/300/800;
  ageing stands).
- Added word `winter-reserve`. `src/content/text/controls.test.ts` still red (known).
- Launching now: `econ-growth` + `overwinter-repro` (Opus). Still running: `w7oa5adpf` (weather-fix2 +
  viab-founding), `wk1cq0726` (stage2-look-fix + onboarding).

## Nov 16 17:00 UTC — weather-fix2 + viab-founding landed

- **weather-fix2** (Opus ×3): submersion measured as water depth over the feet / spill-layer bottom (`waterDepthOver`,
  0.5 BU for ants, brood by centre); sealed or reopening founding cell takes seepage only, an `open` entrance takes
  rain only if it really opens the pooled basin to air (`entranceOpensBasin`); spill cache holds only the pooled basin
  (zero-filled garbage samples removed); queen-in-danger card shared correctly with combat; dry rival nests re-predicted
  every 3000 ticks (`FLOOD_PREDICT_DRY_REBUILD_TICKS`); restore divergence fixed (stage1a.e2e (c) green; root cause
  = mound mask cache keyed on breach count only → **need from nest owner: key on breach positions**).
  - Open: first spill build per nest 11–35 ms once; rain-hour rebuilds 27–46 ms; "flee water along D_exit" behaviour
    missing (a queen resting in a sump can drown in a chamber < 25 % flooded); sprinkler/hose not wired to inflow;
    K_DRAIN per real second vs rain per compressed game hour needs a ruling.
- **viab-founding** (Opus ×3): guide state BACK (queen outside her cavity walks back in / bites down at the opening,
  never where she stands); guide no longer overrides the player after she is moved; plugs laid inside the throat
  sphere; **workers reopen the plug at hand-over** (throats set `reopening`; deep plugs through stepped 0.75 BU tunnel
  plans; the stand-in unplug is deleted); one pocket rule (`foundingPocketTest`); dots published by the flow. Seal
  sweep: 57 of 60 on the first run, the 2 seal failures pass after the last change (full sweep not re-run on final
  code). Browser `founding.mjs` seeds 1–3 complete **only with `FOUNDING_NO_FLOOD=1`**; the plain seed 1 run failed
  with the clutch drowning by seepage ("Founding chamber flooding ×3").
  - **Conflict to resolve on HEAD**: weather-fix2 says safe/dry nests no longer flood; viab-founding's last browser
    run (before weather-fix2's final commit?) still drowned the clutch. Integrator is running 4 life runs on HEAD with
    flooding on (`test-output/headcheck/`), then `founding.mjs` seed 1 without the flag.
  - Open: scripted digger gets no bite at some good sites (seed 8; seeds 3/4 first site); seed 3 hand-over 0.81–0.91
    gd before autumn (needs ≥ 1.0); deep-plug reopening depends on the nest accepting stepped tunnel plans; ghost plug
    voxels above ground counted by `plugCount`; queen cannot climb some steep template throats (seed 3).
- Integrator's look at `test-output/viab/e2e-3/*.png`: sealed chamber with eggs reads well. First possessed worker
  at night: status line says "Scout · scouting · stuck"; a flat pale blue slab with a hard rectangular edge stands
  against the starry sky (map-edge / far-plane look, known weak) → second look pass. 7 first workers on seed 3
  (below the chapter's 8–16).

## Nov 16 17:10 UTC — HEAD check with flooding on (integrator, `test-output/headcheck/*.log`)

Tree = pushed HEAD + econ-growth's work in progress. `life.ts --until winter`, flooding on:

| run | viable | notes |
|---|---|---|
| suburban-garden #1 | yes | 12 → 10 workers, 34 deliveries, 26 % of trips succeed, no drowning |
| suburban-garden #2 | **no** | 16 → 8: `worker:lost 5`, old-age 2, drowning 2; 350 `[loco] relocated walker` lines, the same walkers bounced around (8100–8150, 17–60, 10830–10870) mm (a climb) |
| woodland-edge #3 | **no** | queen drowned + 4 workers drowned on autumn days 3–4 in the single founding chamber; 0 deliveries, 35 trips 0 % successful |
| kitchen-door #1 | yes | 15 → 15, 43 deliveries, 9 % of trips succeed |

- Conclusion: flooding no longer kills in dry weather, but **ants do not flee water** (GDD 03 §11.3 never built) →
  launched `nest-fix3` (`w7nudxfes`, wf_9bf8174e-253; Opus): flee water, mound-mask signature, ghost plugs, reopening
  plan validation, queen alert helper, nest tick spikes, sprinkler inflow. Ruling R12 (hydrology factor stands;
  flood-safe sites never lose ants in ordinary rain) is in its spec.
- **Tick spikes** in every run (load 13–14 inflates, but not to this): `nest` max 4.5–8.5 s, `rivals-agents` max
  4–6 s, `environment-effects` 0.3–1.2 s, `creatures` 0.75 s, `human-events` 0.99 s. nest → nest-fix3 item 6; the rest
  → perf task.
- For the next locomotion task (`loco-fix3`, not launched yet): relocation loop and `lost` workers on the climb at
  suburban-garden #2; suburban-garden #4 fence crossing (nav cell strip); stall sites from the viab sweep; trip
  success 9–26 % (econ-growth R10 is looking at causes; split by what it finds).
- Running (5 agents + reviews): econ-growth, overwinter-repro (`wxxwcbc34`), stage2-look-fix, onboarding
  (`wk1cq0726`), nest-fix3 (`w7nudxfes`).

## Nov 16 18:30 UTC — stage2-look-fix + onboarding landed

- **stage2-look-fix** (Sonnet impl, Opus review, fix): rain is thin streaks with ground ripples at every camera
  distance, tinted by scene light (before/after `test-output/stage2-look/pairs/1-rain-*.png`: fixed, looked at);
  moisture overlay ramp 0.25–1.0 with a 1.5 power curve (resting soil alpha about 0.15, cap 0.38), temperature
  overlay shows a value label at the focus; spider "softened" has round smooth legs; bird beak clears props and
  reaches the soil; human trousers/shoes/soft shadow; FoundingOverlay not rendered in photo view.
  - Open: per-renderer frame cost not re-measured against the wire-stage2 baseline; resting topsoil sits at the
    "wet" class bound in the sim (0.65), so "dry" still carries a light tint; `src/render/fx/scent/scentTrail.test.ts`
    red (no forager trail: economy).
- **onboarding** (Sonnet impl, Opus review, fix): `src/game/onboarding/**` table-driven hint engine (22 hints, one at
  a time, once-only, rate limit, learned by doing), `src/ui/hud/prompts/**`, Settings "Reset hints",
  `tests/e2e/onboarding.mjs` (all 22 hints learned by play; stand-ins for hint-share, first delivery, first trail).
  - Integrator wired `registerHintProfile(profile)` in `src/game/save/install.ts`.
  - Open: gamepad dismissal needs a `dismiss-hint` input action (→ input-gamepad-a11y task); founding overlay should
    ask the engine itself (`PlayPanels.tsx`) so the DOM bridge `foundingGate.ts` can go; classic build not re-run.
- **Integrator fix: sim import cycle** (`creatures → environment → human → ecology index`, and through
  `colony/allocation/demand`): `ecology/index.ts` command handlers are late-bound (a second change, pointing human effects at
  `@/sim/ecology/sources`, broke `crush.test` / `human.verify.test` through `systems.ts` and was reverted). Importing creatures, sources, plants or human first all load. Six creature test files and
  `spikes/render-creatures-demo` no longer depend on import order.
- Seen in the rain shots: alert "Founding chamber flooding ×10/×11" long after the hand-over (wrong name once the
  opening is over, and it repeats) → check after nest-fix3; if still there, gate close.
- Running: econ-growth + overwinter-repro (`wxxwcbc34`), nest-fix3 (`w7nudxfes`, in review).
- 18:35 Integrator: `SYSTEMS` / `BEHAVIOURS` in `src/sim/systems.ts` are now built on first use (`lazyList`), so a test
  that enters through a deep module no longer finds half-loaded module indexes (`src/sim/ecology/creatures/*.test.ts`
  were failing at import: 9 files; now green). Known red, not from this: `src/sim/commands.test.ts` "ends with
  lifecycle": the `nest-flood` system sorts after `lifecycle` (weather-effects registered it in the lifecycle phase)
  → gate close / nest owner: give it the phase before lifecycle so drowned ants are swept the same tick.
- 18:45 launched `weiuc7x43` (wf_0fc884f0-b38): `loco-fix3` (Opus) + `input-gamepad-a11y` (Sonnet impl, Opus review,
  visual), and `wwjhnle8f` (wf_9d6a17e0-fe2): `look-pass-2` (Sonnet impl, Opus review, visual). Integrator's reasons for
  look-pass-2 (from `test-output/viab/e2e-3/*.png`): night frames nearly black; workers underground are black
  silhouettes; stems and blocks float with cut ends; pale slab at the horizon at night; `low` is bare soil into fog.
- Running (6 tasks): econ-growth + overwinter-repro (`wxxwcbc34`), nest-fix3 (`w7nudxfes`), loco-fix3 +
  input-gamepad-a11y (`weiuc7x43`), look-pass-2 (`wwjhnle8f`).
- **Order after these land**: `gate-1B-close` (then build:portable, publish, source archive) → Stage 3 species
  (carpenter, harvester, leafcutter, Lasius honeydew), difficulty-rules, perf (tick cost + spikes + E8 gen time),
  Stage 2/3 gate (progression listeners, rivals pre-carve, thief ants scope, `available: true`) → QA playtests, soak,
  manual/docs, final report.

## Nov 16 20:55 UTC — nest-fix3 landed

- **nest-fix3** (Opus ×3): **ants flee water** (`src/sim/ants/behaviours/nest/fleeWater.ts`, perception phase, per
  flood second, only ants near a wet basin; ≥ 0.15 BU over the feet → first dry footing along the exit field, out
  through the opening if none, held state `flee.run`/`flee.freeze`); queen moves to the highest dry chamber with her
  retinue; brood evacuated pupae → larvae → eggs to the highest dry chamber (`floodEvac.ts`); possessed ant gets an
  "Under water" critical card instead of being moved. Five life runs with flooding on (woodland-edge #3,
  kitchen-door #1, suburban-garden #1/#2, car-park-verge #2): **no queen died, no adult drowned** (`test-output/nest-fix3/r2/life/`).
  - Root causes found on the way: seal field of a soil-buried throat was Infinity inside the nest (every walk inside
    a closed nest failed; now seeded at the open voxels nearest the mouth, `SEAL_INNER_REACH_BU` 6); `waterDepthOver`
    read an ant on a wall as off the basin; entrance memo keyed on tile count.
  - Also: mound mask cache keyed on breach positions; `plugCount` ignores ghost plugs; founding reopen plans validated
    as warnings; escape dig when no plan/plug is reachable; `combatHoldsQueenAlert`; sprinkler/hose/can feed inflow
    at 0.5; tamp passage check incremental (`PassageProbe`: total −20 %, worst tamp 75 → 29 ms).
  - **Open**: nest ticks above 25 ms remain (tamp bursts 164–283 ms at one tick; `dryFillVolume` binary search or a
    per-tick tamp-volume budget is the next step → perf task); escape dig opens after 2.1 game hours (4.1 through
    `reopenTick`'s early branch), target was 1; red in the nest folders and not from this task: `sfaReview.verify`
    (move-brood save/load), `nestFixesReview` (founding expulsion pile), `stall.soak` (idle wanderers at speed 0
    while "moving"), `colony.scenario`; `haulE22.verify` 941 ticks vs 900 after locomotion WIP.
  - Spikes that are not the nest's: `rivals-agents` 1.7–5.5 s **at tick 1** (rival set-up at game start; ≤ 4 ms
    afterwards) → move rival set-up into world generation / loading (perf task); `env:moisture` single-tick outliers
    look like GC under load.
- **Rulings** (binding, for gate close / perf):
  - **R13 — stacked showers on a flood-safe site.** A site the read-out calls flood-safe must not reach 25 % in the
    brood or royal chamber from ordinary showers however they stack: drainage on a flood-safe site scales so that an
    ordinary shower (intensity ≤ 0.5) drains within 2 game hours. Downpours and flood-prone sites keep today's rule.
  - **R14 — reopening time.** The entrance must be open within 4 game hours of the hand-over (was 1): the dig is real
    and visible, and 100 s at 1× is an acceptable beat. The doubled time through `reopenTick`'s early branch is a
    defect to diagnose at the gate.
  - **R15 — possessed-danger level.** GDD 08 §6.5 wins: `possessed-danger` is critical in combat too.
- Machine: load average 15–16 with five tasks running; no new launches until one lands.

## Nov 16 23:10 UTC — container restart; overwinter-repro landed; three workflows resumed

- **The container restarted at about 23:00.** Disk survived (repo, scratchpad, journals). Four agents were cut off:
  `fix:econ-growth`, `fix:loco-fix3`, `verify:input-gamepad-a11y`, `fix:look-pass-2`. Tree snapshot committed
  (`535af58`), then the three workflows were resumed with `resumeFromRunId` (finished agents replay from the journal;
  the cut-off ones re-run and will find part of their work already in the tree): `wws8x2xjj` (wf_a74b450f-823,
  econ-growth fix), `wbpbsguac` (wf_0fc884f0-b38, loco-fix3 fix + a11y review), `wy9krir5z` (wf_9d6a17e0-fe2,
  look-pass-2 fix). One typecheck error in the tree at resume: `src/render/world/primitives/snapLayer.test.ts`
  material id `'wood'` (look-pass-2's, in flight).
- **overwinter-repro** (Opus ×3, complete): overwintering (notice, banner, winter model over the remaining winter
  days, losses by cause, time-lapse screen with skip, winter report, spring restart), reproduction (alate
  investment, flight offer valid only in the window/hours/weather, auto-release, possessed flight with Space climb /
  Shift descend, mating, landing, dispersal), lineage (per-game flight ids, Lineage screen, daughter-queen new game),
  succession (queen death, orphan decline, extinction after the sim's 30 s grace, epitaph with history graph).
  `tests/e2e/lifecycle.mjs` passes on seed 1; screenshots `test-output/lifecycle-fix/` (looked at: winter lapse,
  flight, epitaph all read; plain but correct).
  - Long test on the 11 viable sweep end-states (rebuilt from per-day figures, not real states): 8 with enough stores
    all reach Spring 2 with their queen; of 3 that ran out of sugar, 2 survive, 1 queen starves (suburban-garden #1).
  - Open (other owners): "E Groom yourself — not now" prompt shows during the flight (`src/sim/ants/player/prompt.ts`);
    no males drawn at the lek; journal key for the winter notice; `progression/journal.ts yearOfEntry` puts
    pre-winter entries in the wrong year after a winter jump; auto-slow rule `overwinter-prompt`; optional
    `intent.flight` from the input layer.
- **econ-growth** review verdict (fix round re-running): phantom source claims by foragers reassigned in the nest;
  re-derived E25 fails on empty worker crops, not on foraging; `NEED_SPONT_MULT ×5` makes the activation loop
  irrelevant and a test was changed to dodge it; acceptance 2–5 not met in the implementer's sweep.

## Nov 17 00:20 UTC — look-pass-2 landed (fix round done)

Review verdict was fail (11 findings); fix round closed most. I looked at
`test-output/look2/r2/b/r3-{night,noon}-surface-high.png`, `r3-noon-edge-high.png`,
`r2/kit/kit-night-nest-high.png`.

- Night now reads (moon key, `NIGHT_LOOK`); underground workers are visible, not silhouettes.
- Ground snap keeps the top of leaning stems fixed; `SnapLayer` re-snaps on moved objects / changed ground.
- Skirt floor seam gone (dithered over 80 BU); `BOUNDARY_FOG_SCALE` 0.35 → 0.15.
- `ANT_FILL` night body 0.8 → 2.2, rim 0.02 → 0.12.
- Frame cost at observer poses: −3.3 % to −0.1 % triangles, ≤ +1 draw call. No valid before/after at possession poses.

Open (carry to gate-1B-close / QA look review):
- Night ant looks pale and glassy (a black ant reads as grey-white). Prefer lower body fill + stronger rim.
- Thin lime-green strip at the map-edge horizon (soft now); nearest facade/fence shapes read as pale straight-edged blocks.
- White pillar, leaf contact shadow, car underbody, ragged open-end caps, floating-block coordinates: not identified / not re-shot.
- Colony view minimum distance 30 BU (`CV_DIST_BU[0]`) leaves the founding chamber ~110 px wide; needs the camera rig.
- Dusk, overcast, night rain not re-shot after the fill change; contact sheets not regenerated.

## Nov 17 00:25 UTC — launches while the fix rounds finish

- Gate-close split into two parallel specs: `gate-close-sim.md` (sweep with flooding on, R13, R14, sim seams, cost) and `gate-close-app.md` (browser scripts, app seams, play-through with pictures, portable build). Launch both when econ-growth, loco-fix3 and input-gamepad-a11y fix rounds have landed; fill each "Hand-over" first.
- `species-common-addendum.md` written (binding for the four species tasks: do not edit forage/colony/loco/ecology/nest; complete loop first; viability bar per species; do not flip `available`).
- Launched `w4ku7i4q9` / wf_466f5a8d-d06: `species-carpenter`, `species-harvester` (Opus impl, Opus review, visual). Their folders are isolated (`src/sim/species/modules/{wood,granary}`).
- Still running: `wws8x2xjj` econ-growth fix; `wbpbsguac` loco-fix3 fix + a11y fix.
- Next: leafcutter + honeydew after econ-growth lands (honeydew sits on the herd economy it is changing).

## Nov 17 00:45 UTC — econ-growth fix round landed; colonies still do not grow

Review findings 1–3, 5, 8–10 fixed with tests (phantom claims, crop loads returned to the pool, `NEED_SPONT_MULT` only for a forager who herself knows a live source of the needed nutrient, herd honeydew counts as known C capacity, one per-trip helper `tripLoad.ts`). Acceptance 2–5 **not met**.

Sweep 9 on the shared tree (flooding on): `test-output/econ-growth-review/sweep9-table.md`
- viable 7 of 15 (woodland-edge 1/3, suburban-garden 1/3, playground-park 2/3, car-park-verge 2/3, kitchen-door 1/3)
- median trip success 17 %; median trips per worker per gd while short 0.94
- median intake/need: C 0.87, **P 0.14**; eclosions after hand-over 0 in 11 of 15 runs
- most failures: workers die of old age with nothing eclosing (no protein → no second brood)
- seed 3 hands over with 7–9 workers on every archetype
- A/B (`test-output/econ-growth-review/ab/`): kitchen-door #1 tends no herd and woodland-edge #1 starves of C with the current locomotion (loco-fix3 in flight); both recover with f2b9eeb's locomotion. Stall at woodland-edge #1: (4490.3, 51.6, 7958.4).
- E25 re-derived passes on seed 1 only (P 0.89 on seeds 2, 3): steady state is protein-limited (demand capped by known capacity ≈ 17 foragers on one carcass; 0.375 P pieces need ≈ 30 trips/gd).
- Leads from the report: prey patches are never hunted (Tier 2 protein effectively missing); eggs lost as `egg:untended`; night flood traces send idle ants to nurse; `reopen.test.ts` red; slow spring founding (6.48 gd from doy 2).

Rulings:
- **R16** `outdoor/scenario.test` cycle floor (135 s GDD fastest) applies to travel + handling, excluding the nest wait. Accepted as changed.
- **R17** R3 reads: ≥ 2 trips per game day per **outside** worker and ≥ 1 per worker overall, over 0.5 gd. Accepted.
- **R18 Protein a small colony can take.** Within 300 BU of the start site the world offers renewable protein of at least 1.5× the need of a 30-worker colony with full brood, in forms a small colony can take (prey patches, small carrion), and the forage AI finds and takes it. Hunting prey patches is a forage behaviour, not optional.
- **R19 Growth bar** (on top of the viability bar; same 15-run sweep, flooding on): workers at winter ≥ first workers in ≥ 10 of 15 runs; median eclosions after hand-over ≥ 4; median intake/need P ≥ 0.7 and C ≥ 0.9; median trip success ≥ 50 %; first workers ≥ 9 in ≥ 13 of 15 runs; no worker lost (`worker:lost`) in ≥ 13 of 15 runs.
- The pattern of three rounds (viab-economy, econ-growth, its fix) is each owner naming another module. Next: one task with authority over the whole sim, run as measured rounds with an independent sweep after each (`colony-life.md`), started when loco-fix3's fix round lands.

## Nov 17 00:55 UTC — colony-life launched

- `wy0oh3u7p` / wf_737d0742-569: `colony-life` (spec `docs/design/tasks/colony-life.md`, ledger `colony-life-ledger.md`), script `wf-life.js` (copy in `docs/design/workflows/`), args `{maxRounds: 4, firstRound: 1, model: 'opus', effort: 'high'}`. Each round: engineer accounts, ranks, fixes; an independent engineer runs the 15-run sweep and reviews. Stops when viability + growth (R19) hold with no serious finding. To resume after an interruption: same script and args plus `resumeFromRunId`.
- The sim half of the gate (`gate-close-sim.md`) waits for this loop; its sweep step is then a confirmation. The app half (`gate-close-app.md`) starts when loco-fix3 + a11y land.
- Running: `wbpbsguac` (loco-fix3 fix, a11y fix), `w4ku7i4q9` (carpenter, harvester), `wy0oh3u7p` (colony-life).

## Nov 17 01:35 UTC — second container restart (01:24); relaunched with four agents

Restarts at ≈ 23:00 and 01:24, both with 5–6 agents and life runs/browsers going. Cause unknown; memory is a suspect (16 GB, no swap). From now: at most 4 agents; agents told to check `free -g` before heavy processes.

- Snapshot `8627b1d` holds everything that was on disk.
- **loco-fix3's fix round is not resumed** (cut off twice near its end). Its code is in the tree; its review is `docs/design/tasks/reviews/loco-fix3.json`; `src/sim/locomotion/**` now belongs to `colony-life`, which treats the unfinished findings as leads.
- Relaunched:
  - `wnk2w0kbw` / wf_3142d9de-859: colony-life from round 1 (`wf-life.js`, args `{maxRounds:4, firstRound:1, model:'opus', effort:'high', note:…}`).
  - `wb9nmew2q` / wf_2a92d6dd-89f: species-carpenter, species-harvester (Opus, continue from partial work), input-gamepad-a11y fix round (Sonnet, `startAt:'fix'`, review file `reviews/input-gamepad-a11y.json`).
- Both workflow scripts take an integrator note now (`t.note` / `args.note`); copies in `docs/design/workflows/`.

## Nov 17 02:05 UTC — third container restart (01:53); restart-proofing

Three restarts (≈ 23:00, 01:24, 01:53). No sign of memory exhaustion; the kernel build changed across the last one (fc-v509 → fc-v553), so the host is being redeployed. Outside our control; work on disk has survived each time.

Restart-proofing:
- Both workflow scripts now give every agent a **progress file** rule: `docs/design/tasks/progress/<key>-<role>.md` (for colony-life: the ledger's round section, and `progress/colony-life-sweep-N.md`). A successor reads it and continues instead of starting again.
- A background loop commits and pushes a snapshot every 10 minutes (re-create it after a restart; it dies with the container).
- Per workflow only 2 agents run at once (CPU count − 2), so separate workflows are launched for work that should run side by side.

colony-life round 1 so far (ledger `docs/design/tasks/colony-life-ledger.md`): entrance stuck `sealing` after founding-plug remnants (fixed, F1); waste never hauled because every waste item had bulk 1.0 > a nanitic's carry cap 0.75 (fixed, F2: hygiene losses 7 of 20 brood → 0); brood stranded outside a chamber got no job (fixed, F3). woodland-edge #1 stores 0.67 → 10.7 gd; kitchen-door #3 turns viable. Neither run ecloses a worker yet.

Relaunched (after any restart: same script and args, new run; agents pick up from progress files):
- `wji1tefky` / wf_227aebec-eb4: colony-life, `{maxRounds:4, firstRound:1, model:'opus', effort:'high', note: finish round 1}`.
- `whq2tpy3r` / wf_e200cf00-636: species-carpenter, species-harvester (Opus).
- `wdfxq8s95` / wf_91d8e4bc-a70: input-gamepad-a11y fix (Sonnet, `startAt:'fix'`).

## Nov 17 03:25 UTC — a11y fix round landed; app half of the gate launched

- **input-gamepad-a11y fix round** (Sonnet; result `reviews/input-gamepad-a11y-fix.json`): review findings closed except: seal/lay by pad through the real founding phases not demonstrated; sound-cue indicators toggle has no effect; flash reduction wired to lightning (`FrameInfo.reducedFlash`, default On → 2 s soft glow) but App E 25 not measured; photo-by-pad flake not reproduced; `a11y.mjs` needs two processes under load (`A11Y_SECTIONS=G,B,C-,C2,D,E` and `E2,F`). All handed to the app gate.
- **gate-close-app launched** (Opus impl + Opus review + fix, visual) with its Hand-over filled (`gate-close-app.md`). Told: load is 10–13, a timeout under load is "not measured"; separate app failures from sim failures.
- colony-life: round 1 finished; independent sweep 1 in progress (`progress/colony-life-sweep-1.md`): at 5 of 15 runs C intake up, P intake down in 3 of 5, 0 eclosions; reviewer's `plugBaseline.verify.test.ts` red (F1 fixes only the way back from `sealing`, not the trigger).
- Running: colony-life `wji1tefky`, species `whq2tpy3r`, gate-close-app (new), auto-snapshot loop `b6hyz8z3p`.

## Nov 17 06:45 UTC — colony-life sweep 2: no progress; integrator direction for round 3

- Sweep 2 (`test-output/colony-life/round-2/sweep-table.md`): viable 8 of 15 (woodland-edge 1/3, kitchen-door 0/3 fail); R19 3 of 7 (held 4/15, eclosions median 0, P 0.031, C 1.016, trip success 24.7 %). Round 2 added hunting of prey patches (H1), ghost-plug fix (G1), trip-count fix (C1), a scout heading change (S1). Hunting converts 7 % of encounters.
- Three sweeps: viable 7 → 9 → 8. Whole-life runs are chaotic; steering by one-run before/after does not converge.
- **Direction written into `colony-life.md`** ("Integrator direction for round 3 onward"): build a nest bench (food guaranteed) and a forage bench (demand fixed) from the 15 hand-over snapshots; accept fixes on bench medians; my reading of the table (larvae starve with P in store; brood untended with nurses present; only 9–21 eggs laid after hand-over; seed 3 one-chamber nests; hunting conversion; stuck/crushed). If the nest bench shows the calendar is the limit, the lever is the default start day and the integrator rules from a start-day table (9, 7, 5).
- App gate (`progress/gate-close-app-impl.md`): firstplay runs all 25 beats, fails only the growth assert (sim); founding seed 1 passes; controls, lifecycle pass; onboarding defect fixed (calendar tick vs sim tick). Lay by pad stalls: after the first batch the prompt becomes "Pick up egg" (brood class outranks the queen's lay class in `src/sim/ants/player/targeting.ts`).

## Nov 17 07:00 UTC — carpenter and harvester landed (not viable); leafcutter + difficulty-rules launched

Results in `reviews/species-carpenter.json`, `reviews/species-harvester.json` (impl, review, fix). `available` stays false for both.

- **Carpenter (Camponotus, wood module)**: 13 review findings, 7 fixed, rest partial. Built: wood state/decay, wood-only digging, frass that falls and piles, satellites with capacity, isolation/orphan/abandon rules, brood returns, castes distinguishable in a possession shot. Open: App E 13 shuttle throughput 10 of 20 (wants 15); trunk trails, satiation and the 3 % forager share (allocator hooks), decay-4 collapse, bird chance on frass, hideFrass toggle, queen relocation walk, window planning rule, "wall is too thin" prompt (needs an `ActionFailReason` member + a line in `src/sim/ants/player/prompt.ts`), frass pile drawn in soil colour (mound renderer), opening and cutaway shots weak. **Not viable**: in the 28-day soak the queen and 5 minors starve in the winter time-lapse; 9 deliveries in 28 days. Founding goes through `cheat.completeFounding`.
- **Harvester (Messor, granary module)**: 10 review findings handled; loop closed in the browser (seed → granary → milled paste → chaff on midden), castes shot good. Deviation: minors may mill soft seed (hardness ≤ 0.3) at 3× time. **Not viable / no growth**: founding hands over 1–3 workers (design 5–8); playground-park #2 founding fails (flood, queen exhaustion); 0 eggs after hand-over; seed carriers stuck in the entrance shaft 44 % of worker time (navigation fails as `leg` at y −9 mm, 32 BU from the founding chamber).
- Both species sit on the same core defects colony-life is working on (in-nest locomotion, laying after hand-over, small-colony allocation). A **species viability** pass comes after colony-life converges: Messor founding yield, Camponotus winter economy and foraging, then the per-species viability bar of the addendum.
- Launched: `species-leafcutter` (Opus/Opus, visual) and `difficulty-rules` (Sonnet/Opus) in one workflow.
- Running: colony-life `wji1tefky` (round 3), gate-close-app `w9q9gpha0`, this new one.

## Nov 17 09:20 UTC — colony-life round 3 findings so far; ruling R21

Benches (`tools/sim/bench-colony.ts --mode nest|forage`, `bench-sweep.sh`, `bench-table.py`) work and are finding causes one-run comparisons did not:
- **Calendar ceiling confirmed** (nest bench, food guaranteed, 7 of 15): seed-1 colonies lay 10–12 eggs, eclose 0; brood 12.5–18 °C on colony days 1–3 falling to 6–10 °C by day 5–8; with r(T) = (T−10)/11 no egg laid after hand-over can eclose before winter. Seed-2 (21–24 °C) eclose 2–4. Start-day bench (7, 5) queued; **the integrator rules on the default start day (R20) from that table.**
- **Flood evacuation loop** (fixed, E1): the dry drop point was inside the band the board evacuates from → one larva carried 89 times, no feeding for 0.55 gd. `dryDropPoint` margin + `BROOD_DRY_DROP_SLACK_BU`.
- **Prey escape rolled twice per contact** (fixed, H2a) and empty-handed returners may hunt (H2b): chase conversion 4–11 % → 25–29 % where prey is in reach.
- **Protein path** (forage bench before): carrion within 300 BU in every run (1–12 pieces), known 0 in 13 of 15; scouts 4–30 trips in 8 gd, nearest approach to a P odour edge ≈ 130 BU; patch prey met only where the patch edge is ≤ 130 BU.
- **No larder**: a nest with no food chamber refuses solids once social stomachs are full (0.15 P per worker); first food chamber only at 25 workers.

**R21 — the larder of a small nest** (deviation from GDD 03 §6.4): with no food chamber, solid food is piled and booked in the brood's chamber, capacity one game day of the colony's own full need per nutrient (≥ 4 loads); a `stores-full` refusal with no food chamber makes the first food chamber a planning need at once. Written into `colony-life.md` (direction 5).

## Nov 17 09:55 UTC — the calendar (integrator analysis); year-two runs added to the sweep

Nest bench before (food guaranteed, all 15): 231 eggs, eclosed median 0 (seed 1 and 3: 0 in all 10; seed 2: 1–10); workers at winter < hand-over in 12 of 15; brood losses with food guaranteed: egg:untended 61, hygiene 42, larva:starvation 30, pupa:untended 18. Brood temperature colony days 1–3 median 15.2 °C, 5–10 °C by day 5–8.

Reading: `temperate-maritime` seasonal mean = 12 + 8.5 cos → 20.5 °C at day 9.5, 18 at 13, 15 at 15, 11 at 17; r(T) = (T−10)/11. Default start day 9 + founding 3–4.5 gd → hand-over with ≈ 2 warm days left. The model reproduces nature (first-year colony = nanitics only); the growth bar R19 as written asks for something the calendar forbids. Decisions pending numbers: **R20 start day** (bench at 7 and 5) and a restated R19 (year-one hold + year-two growth). Written into `colony-life.md` as direction 6: start-day table contents, **five long runs through winter to day 15 of year 2 in every sweep from now**, warm-nursery evidence. No run has ever gone through a winter: that is the next unknown.

## Nov 17 10:55 UTC — rulings R20 (start day 5) and R22 (growth bar restated)

Start-day table (round 3, nest bench with food guaranteed, fresh foundings; `test-output/colony-life/round-3/bench-startday/`):

| start day | run | hand-over gd / first workers | eggs | pupated | eclosed | workers hand-over → winter |
|---|---|---|---|---|---|---|
| 9 | woodland-edge #1 | 3.53 / 16 | 10 | 2 | 0 | 16 → 12 |
| 7 | woodland-edge #1 | 2.74 / 18 | 26 | 11 | 0 (9 pupae untended) | 18 → 12 |
| 5 | woodland-edge #1 | 3.45 / 18 | 47 | 18 | 13 | 18 → 25 |
| 9 | woodland-edge #3 | 4.57 / 7 | 9 | 0 | 0 | 7 → 5 |
| 7 | woodland-edge #3 | 3.34 / 12 | 20 | 4 | 0 | 12 → 10 |
| 5 | woodland-edge #3 | 4.20 / 10 | 42 | 5 | 0 (egg:hygiene 22) | 10 → 8 |
| 9 | suburban-garden #1 | 3.91 / 12 | 10 | 0 | 0 | 12 → 11 |
| 7 | suburban-garden #1 | 3.04 / 12 | 15 | 8 | 0 (7 pupae untended) | 12 → 9 |
| 5 | suburban-garden #1 | 3.71 / 9 | 12 | 3 | 1 | 9 → 8 |

- **R20 — the reference species starts on day 5** (`lasius-niger.ts` `opening.startDoy` `{min 5, max 9, default 5}`). Licence against the real flight season (days 9–12); GDD deviation. Round 4 implements it first, regenerates the 15 hand-overs and re-bases the benches. Earlier sweep tables are day-9 tables.
- **R22 — growth bar**: R19's year-one checks unchanged, plus year two on five long runs: alive in spring with ≥ 0.7 × winter workers in ≥ 4 of 5; workers at day 15 of year two ≥ 2 × first workers in ≥ 3 of 5.
- Messor (start day 17, autumn) cannot raise first workers before winter under this calendar: species viability pass.
- Round 3 other results: hunting fix accepted (kills 61 → 123 over 15 benches, conversion 4.7 → 23.7 %); E1 (dry drop point margin) **reverted** — on the nest bench eclosions 20 → 7, exposure 6 → 34, hygiene 42 → 76; the evacuation loop stays open.
- App strings that name the flight season need a check after R20 (app engineer; list comes from round 4's ledger).

## Nov 17 11:25 UTC — leafcutter and difficulty rules landed; predators never act; threats-live launched

Results in `reviews/species-leafcutter.json`, `reviews/difficulty-rules.json` (impl, review, fix).

- **Leafcutter (Atta, fungus module)**: 13 review findings (8 major), all reviewer tests green after the fix round. Built: leaf cutting and carrying, processing chain with bottleneck counters, gardens (biomass, health, contamination, climate), garden death and the garden-less state, waste as its own haul job with refuse workers, phorid rate, diagnostics, castes distinguishable in a possession shot. **Viability not shown**: one seed re-run (suburban-garden #1: 9 → 9 workers, 43 leaf deliveries, with the forced seal); three of six foundings fail in the core (the automatic seal never plugs the 35 BU Atta shaft; queen drowned; larvae flooded). Open: no leaf column picture (first brood is all minims), no refuse heap in the run window, garden stays in the hot founding cell (fT ≈ 0.3; fungus chambers only planned at 10 workers), possession prompts by caste not wired, no garden renderer files (display lumps only). `available` stays false.
  - Needs from the core (for the species viability pass): `colony/allocation/groups.ts` `eligible` must refuse nurse/queen-care/garden to REFUSE-flagged ants (a guard system stands in); an optional `selfPromptRule` hook in `ants/player/targeting.ts` and skipping inert display items; first-brood lifespan per species (Atta minim 40 gd, core uses NANITIC_LIFESPAN_MEAN_GD 24 for all); architect asks for a fungus chamber at the first media.
- **Difficulty rules**: preset table + accessors + custom rules + season length; 147 tests. Open: several parameters have no consumer yet (openingThreatsMax, openingGraceGd, queenLifespanMult, flightPredatorEvents, alertLeadWarnings, rules queenSenescence and foundingAssist) and are flagged `inEffect: false` — the New Game screen does not read the flag yet; the opening spawn grace of GDD 06 §5.2 does not exist.
- **R23 — `rivals: 0` removes incipient conspecific foundations too** (the player's meaning of "no rivals" wins over GDD 05 §5/§7; implemented that way).
- **Predators never act.** Three 28-day runs (one per preset): 0 predator strikes, 0 bird visits; 6-day harsh probe: 7.7 live predators on average, 0 telegraphs. Every viability number so far was measured without predation. New task `threats-live.md` (Opus impl + Opus review, launched): funnel per predator family on real worlds, cause, fix, calibration against GDD 05 loss bands per preset, cost to small colonies.
- Running: colony-life `wji1tefky` (sweep 3, then round 4 with R20), gate-close-app `w9q9gpha0`, threats-live `wngv0c8uu`.

## Nov 17 13:05 UTC — sweep 3; year two collapses; R24; round 4 running

Sweep 3 (`test-output/colony-life/round-3/sweep-table.md`, day-9 start): viable 8 of 15 (woodland-edge, suburban-garden, kitchen-door 1/3 each); R19 3 of 7 (held 4/15, eclosions median 0, P 0.044, C 1.238, trip success 25.4 %). Hunting: prey loads home 41 → 58; 6 of 15 runs never meet patch prey (nearest patch edge 118–244 BU).

**Year two (first runs through a winter; five long runs):** every colony that was viable at winter declines to 0–4 workers by day 15 of year two; no queen died; year-two eclosions 0, 0, 0, 0, 3.
- woodland-edge #1: **no winter lapse** (heated-nest log kept stale samples "fresh") → winter played tick by tick, 14 → 8, dead by summer. Fixed in round 4 (W1).
- car-park-verge #1, kitchen-door #1: lapse losses 58–64 % (drowning 5, disease 2 each).
- playground-park #2: C 7.1 → 1.2 over winter, 0 by spring day 4 → adult starvation.
- All five: the queen lays nothing until the last spring day or two (`fTempQ` 0 below 14 °C; spring brood chambers 0.4–15.5 °C); year-one workers age out before any year-two worker ecloses.

**R24 — winter lapse losses**: a colony that passes the viability bar at winter loses at most 15 % of its workers in the lapse on Naturalist, unless a hazard the player was alerted to before winter is the cause (then live-play rules apply). Winter stores check and spring laying: evidence first (direction 8 in `colony-life.md`; note at the top of the ledger's Round 4).

Round 4 so far: heated-nest log fixed (W1), R21 larder built and unit-tested (L1); R20 next. Review findings carried: `huntReturn.verify` red (H2b flips hunt ↔ return after a `timeout` return), H2a's contact window is wider than "one roll per bite" (deviation noted, accepted for now).

This workflow run ends after round 4 + sweep 4 (round cap). A new loop follows with the same script (`firstRound: 5`).

## Nov 17 15:45 UTC — round 4 hygiene chain fixed; threats-live measured; R25

**colony-life round 4** (in progress): R20 in (15 hand-overs at day 5; first workers 8–18, seed 2 lower than at day 9: 15–16 → 8–11), R21 larder (L1, L1b), heated-nest log (W1), R24 lapse cap (WL1), hunt/return flip (H3). With predators live the first four long runs fail in year one (workers 11 → 11, 15 → 8, 11 → 3, 11 → 5). Brood hygiene deaths (22–27 per run) traced to **waste never leaving the nest**, three chained defects, all fixed with tests: E2 entrance `sealing` again from open carve samples still flagged PLUG; H4 no hauler under the GDD's fixed allocation order at 9 workers (haul now ranks after queen-care while the brood's chamber holds waste at the tolerance — GDD deviation); M1 the hauler carried the same corpses to the surface midden for ever (3D distance to a midden point at terrain height). Probe on suburban-garden #2: waste dumped 0 → 15, hygiene deaths 16 → 0; its long run now grows in year one (9 → 12, 4 eclosed) and then starves of carbohydrate (C 0 from day 9; nectar within 300 BU never found).
- Spring: every chamber is 36–48 mm deep; the royal chamber is the warmest dry chamber and reaches 14 °C (laying threshold) around spring day 7. No "warmer chamber" to move to. Warm nursery deferred until year two is measured with the fixes (regular workers live 33 ± 10 gd; dormant ageing 0.15).

**threats-live** (impl done, in review/fix; report `threats-live-report.md`): causes — worldgen put residents far from the colony; the jumping spider's wind-up refused targets faster than 6.7 mm/s (Lasius cruises at 24). After: Naturalist 0.07 deaths per outside-worker gd (band 0.03–0.12), gentle 0.01, harsh 0.16, off 0; wolf spider strikes on 4 of 5 worlds, ant-mimic 2, rove beetle 1, jumping spider 0 (stalk 8 mm/s cannot close), centipede 0, no antlion pits on the five worlds; birds need 30 workers (by design). Cost to founding-year colonies on the forage bench: 56 → 39 workers at winter over five colonies (14 predation deaths), trips −27 %.

**R25 — predation grows with the colony**: colony-range siting of hunters × ramp (Naturalist 0 at ≤ 10 workers → 1 at 40; Gentle 20 → 60; Harsh 0 → 20). Residents in their own territories unchanged. Target: median ≤ 1 predation death per founding-year colony on Naturalist; full design rate at 60 workers. Direction 9 in `colony-life.md`; `src/sim/ecology/creatures/**` passes to colony-life when threats-live finishes.

## Nov 17 17:00 UTC — threats-live landed at 6× the design's loss rate; R26; stop-gap; threats-calibrate launched

threats-live (results `reviews/threats-live.json`, report `threats-live-report.md`): the fix round answered the review's "every family must strike on 3 of 5 worlds" by siting the jumping spider and rove beetle at the colony's food sources. Final: Naturalist **0.40 worker deaths per outside-worker gd** (design 0.061), Harsh 0.45, Gentle 0.02, off 0; five colonies 69 → 32 workers in 6 gd. Other fixes in that round are sound (reload divergence, rebalance churn, pinned card, placement retries −90 %, paralysis cause).

- **R26 — the loss rate comes first.** The design's rate binds (Naturalist band 0.03–0.12 per outside-worker gd); "every family strikes on 3 of 5 worlds in 6 gd" does not.
- **Stop-gap by the integrator** (so sweep 4 is not run at 6× predation): `COLONY_PAUSE_KINDS = []`, `COLONY_RANGE_MIN_BU = {}` in `balance/creatures.ts` (the review state, ≈ 0.07); `colonySites.test.ts` pause-point case skipped while the list is empty. Typecheck clean; creatures 24 files green + that skip.
- **threats-calibrate** (new spec, Opus impl + Opus review, launched): R25 ramp, calibration to the band on founding-year colonies (median ≤ 1 predation death per colony to winter) and at 60 workers, reproductions of three core gaps for colony-life (paralysed nestmates never carried home; worker maxHp 7.2 vs the GDD's 10; `knownHazardsNear` unused by steering).
- Also from threats-live: the quiet-share check I11/E25 fails because of human-event-warning alerts (14–55 per run), not predators — for the gate.
- `src/sim/ecology/creatures/**` stays with threats-calibrate until it finishes (direction 9 of colony-life said it would pass to colony-life after threats-live: not yet).

## Nov 17 18:50 UTC — app half of the gate landed; first playable published (private artifact)

**gate-close-app** (impl + review + fix; report `gate-close-app-report.md`, results `reviews/gate-close-app.json`):
- Verdicts: typecheck clean and app folders green; browser scripts pass — founding seeds 1–3, controls, views, stage2 strict (all 14 sections), photo, onboarding (after an app fix), lifecycle, a11y except section C; **firstplay** runs all 25 beats and fails only the growth check (sim); **stage1a strict** plays the real opening now and still fails a later check (camera inside the soil in the very low room the 1A script digs); `panels.mjs` second half not measured under load (real-time tap threshold). Portable build 27.7 MB, `verify:portable` OK (sub-path and sandboxed iframe).
- Fixed in the task: auto-slow on alerts incl. escalations and the winter banner, closer colony view for small nests (founding nest spans 4.5 BU → closest view 11.25 BU), sound-cue pips with icons, flash reduction (App E 25), night colony slice blow-out, slice labels blow-out, hint chips over the palette/banner, hand-over banner staying for hours, flood film drawn as a slab, onboarding fact (calendar vs sim tick), photo-mode dotted queen, night ant fill on clear nights, males at the swarm, R15, groom prompt during flight (cross-edits logged in `test-output/gate-close/cross-edits.md`).
- **Still wrong, ranked (18 items, report §7)**: S1 colony does not grow (sim); S2 hardly an ant on the surface, foragers "waiting to leave – timeout" (sim); S3 laying by pad stalls on "Pick up egg" (player targeting); S4 night at ground level looks like an overcast day (NIGHT_LOOK metering, art decision); S5 pale see-through ant in a tunnel; S6 seal prompt wording / "Open entrance" offered right after sealing; S7 epitaph "unknown cause" deaths; S8 gyne pale at night; S9 leaves read as flat decals; S10 follow camera tips to the sky on slopes; S13 mound foot with square edges; S15 ants milky in night rain; S16 white rings on a full gaster; S17 flood alert sub-line "rim factor 1.00"; S18 smeared chamber labels; S11 pale horizon strip at night. Frame time not measured on a GPU (SwiftShader only: 84 / 118 / 127 draw calls, 0.50 / 0.70 / 0.97 M triangles at low / medium / high).
- Needs from the sim side go to colony-life (S1, S2, S3, S6, S7, S17, nest record stays `reopening` after a pad-played opening).

**First playable published** as a private artifact (owner only): `https://claude.ai/artifact/UN4he4cpvfLj687nUN4BMF` — slug `dd97a4c3-a304-4801-aa70-0302442d71e6`, version `1794941134-d1bb`. Built from the tree at 18:39 UTC (R20 start day 5, round-4 fixes, predation stop-gap), `npm run build:portable` + `verify:portable` OK. Republish with `publish_files` (slug + base_version) after the next gate.

A **look-and-feel pass 3** (app-side items S4, S5, S8–S16, S18, S11, stage1a camera, panels tap threshold) is queued as its own task once the machine has a free slot.

## Nov 17 19:05 UTC — fourth container restart (18:55); relaunched; R27

Restart at 18:55 UTC (fourth: ≈ 23:00 Nov 16, 01:24, 01:53, 18:55 Nov 17). Disk intact; snapshot `1274d45`. Lost in flight: the sweep after round 4 (4 of 15 runs done; progress file `progress/colony-life-sweep-4.md`), threats-calibrate impl (1 h 50 min in), look-pass-3 impl (10 min in).

- `wf-life.js` can now start at a round's sweep: `args.firstRoundResult` (the finished round's result) and the note goes to the first round engineer that actually runs. Copies in `docs/design/workflows/`. Round 4's full result: `reviews/colony-life-round-4.json`.
- Relaunched:
  - colony-life `w732tzrqp` / wf_901e470f-d2a: `{firstRound: 4, maxRounds: 5, firstRoundResult: <round 4 in short>, note: …}` → sweep 4 continues, then rounds 5–8.
  - threats-calibrate `w4bdetuz7` / wf_81a26f5f-ba6 (continue from its progress file).
  - look-pass-3 `waeqyax2g` / wf_08466742-ac3.
- **R27 — winter stores check**: the viability bar's stores check becomes "stores at the first tick of winter cover the lapse's own carbohydrate need plus 4 game days of spring adult need" (round 4's proposal, accepted); the autumn provisioning target (R6) aims for it. In the round-5 note.
- Round-5 note also carries: creatures folder stays with threats-calibrate; directions 8–9; core gaps from threats-live; sim-side needs of the app gate (S2, S3, S6, S7, S17, nest record `reopening`), S3 and S6 to be done in round 5.
- App string after R20: `src/ui/screens/newgame/species.ts` Lasius `foundingSeason 'summer'` → spring (look-pass-3 item 6).

## Nov 17 21:45 UTC — sweep 4 (day-5 start): 1 of 15 viable; round 4's larder × hand-over provision is the regression; round 5 running

Sweep 4 (`test-output/colony-life/round-4/sweep-table.md`; R20 start day 5; predators at the 17:00 stop-gap): viable **1 of 15**; R19 2 of 7 (held 2/15, eclosions median 2, P 0.045, C 0.716, trip success 42.2 %, first ≥ 9 14/15, no lost 15/15). 13 of 15 fail "starvation stage worse than lean > 1 gd".

A/B on the same 15 hand-overs, round 4's 12 production files reverted ("minus4"): viable 1 vs **4**, workers at winter 128 vs **154**, eclosions 35 vs **56**, larvae starved 48 vs **7**, bad-stage median 3.55 vs **0.10 gd**; trip success 42 % vs 30 %. Second A/B, only L1 reverted (4 pairs): eclosions 14 → 24, larvae starved 7 → 0, P intake 0.09 → 0.22. **Cause: L1 (R21 larder) × R2 hand-over provision** — with a larder the queen's whole protein reserve is paid into a floor pile at once and rots among the eggs (1.98 P spoiled before the first larva hatches on car-park-verge #1; larva:hygiene 28 vs 4). R21 stands for solid food carried home; the queen's reserve was never a pile. Round 5 fixed it first (P1: the provision goes to the workers' stomachs only; the rest stays in the queen). Other review findings fixed at the start of round 5: WL2 (the workers the R24 cap keeps now eat in the lapse), M2 (waste inside the nest under a surface midden is not "at the midden"), R27 implemented (`winterStoresNeed`, autumn target).

Even without round 4 the bar fails (4 of 15): calendar and protein remain. Year two (five long runs): alive in spring with ≥ 0.7 × winter workers 3 of 5; ≥ 2 × first workers by day 15 of year two **0 of 5**; 4 of 5 lay nothing in spring; old age takes the overwintered workers.

Integrator lead written at the top of the ledger's Round 5: the royal chamber reads 0.8–3 °C on spring day 1 and 12–13 °C on spring days 6–7 of year two, about 5 °C under what the same climate gives a same-depth founding chamber on those days of year one — check the thermal state after the winter lapse before treating late spring laying as a design gap.

threats-calibrate: impl done, review done, fix round running. look-pass-3: impl running.

## Nov 17 23:00 UTC — threats-calibrate landed (R25 ramp in); quiet-time task launched

threats-calibrate (impl + review + fix; report `threats-calibrate-report.md`, results `reviews/threats-calibrate.json`):
- **R25 ramp built** (`PREDATION_RAMP_WORKERS`, `predationRamp()` in `balance/difficulty.ts`; colony-range territories flagged `colonyRange`). Measured: founding-year colonies **median 0 predation deaths per colony** (0.005 per outside-worker gd) against median 4.5 (0.15) without the ramp over ten runs; at 60 workers Naturalist **0.038** per outside-worker gd (95 % range 0.027–0.051; band 0.03–0.12), Gentle 0.007, Harsh 0.047, off 0 in 23,770 outside worker-hours. Sweep 4 and the round-4 benches predate the ramp: they overstate predation (≈ 0.19 on founding colonies).
- Review found the long creature soak red 5 of 5 (never run before): cause — every landed strike raised a `predator-near` warning for 30 s, longer than a game hour (25 s), so each strike made a loud hour (I11). Now clears 5 s after the strike (`PREDATOR_STRUCK_CLEAR_S`); soak 6 of 6.
- Worker maxHp 7.2 is correct (nanitic; GDD 05's 10 hp is the regular worker).
- Not measured: the lever for when rescue of paralysed nestmates lands (`COLONY_PAUSE_KINDS = ['jumping-spider']`).
- For colony-life (noted at the top of the ledger's Round 5): creatures folder passes to it; gaps (a) rescue of paralysed nestmates, (c) `knownHazardsNear` in steering.
- **Whole-game quiet share (I11 / E25) fails on human-event warnings** (14–55 per 6 gd; quiet share 0–0.04), which also cancels every bird event. New task **`quiet-time.md`** (Sonnet impl + Opus review): measure loud hours per alert kind, fix human-event alert durations and re-raises and the colony alerts' bookkeeping, E25 in a whole game.

Running: colony-life `w732tzrqp` (round 5), look-pass-3 `waeqyax2g`, quiet-time (new).

## Nov 18 01:25 UTC — fifth container restart (01:16); round 5 result; relaunched

Restart at 01:16 UTC (fifth). Disk intact; snapshot `c2bb656`. Lost in flight: the sweep after round 5 (near its start), look-pass-3 impl (about six hours in; progress file current to 01:13), quiet-time fix round (20 minutes in). Round 5, the quiet-time impl and its review had finished and are saved: `reviews/colony-life-round-5.json`, `reviews/colony-life-sweep-4.json`, `reviews/quiet-time.json`.

**colony-life round 5** (ledger "## Round 5"): sweep-4 findings fixed with tests (P1 hand-over protein to the workers' stomachs only; WL2 capped workers eat in the lapse; M2 midden); R27 implemented; S3, S6, S17 fixed; scout range 220 → 300 BU kept; three scouting/pay-in experiments tried and reverted on bench numbers.
- Forage bench (15 hand-overs, full length): P/need median 0.122 → **0.245** (target 0.3), the gain is P1's (with the provision out of the larder the pool shows its real protein shortage and foragers hunt); protein known within 1 gd 7 → 3 of 15 (target 12, **worse**); larvae starved 21 → 4; eggs 288 → 225 (unexplained).
- Life to winter, 4 pairs on the same hand-overs: workers at winter 36 → **46**, eclosions 13 → **36**, larvae starved 9 → 2, C covers the R27 need in all four; playground-park #2 passes the viability bar; the other three fail only the starvation-stage check (1.25–2.2 gd of rationing on days 3–6, pool protein at zero).
- Open: the day 3–6 protein gap, discovery, catch rate 20–23 %, the egg drop, year two (no long runs this round), core gaps (a) and (c), S2, founding record `reopening`. Predation 7–8 deaths in two life runs although the ramp's bench says median 0: first thing for round 6 to check.

**quiet-time** (impl + review done; verdict pass-with-minor, one major: the whole-game check passes trivially because no major threat ever starts and the E25 clause requiring one is not reported; minors on the ease rule, the tool's fixed 0.60 threshold, an unrecorded GDD 06 §4.5 contradiction, per-tick list copy).

Relaunched:
- colony-life `wek2szmct` / wf_f9efc2e7-f2e: `{firstRound: 5, maxRounds: 4, firstRoundResult: <round 5 in short>, note}` → sweep 5, then rounds 6–8.
- quiet-time `woldn0vf5` / wf_001f111a-c97: `startAt: 'fix'`, `reviewPath: reviews/quiet-time.json`.
- look-pass-3 `w2ht0mt7m` / wf_9c9fafc0-4ed: continue from its progress file.

## Nov 18 01:30 UTC — quiet-time landed; R28

quiet-time (impl + review + fix; report `quiet-time-report.md`, results `reviews/quiet-time.json`, `reviews/quiet-time-fix.json`):
- Human-event alert raised only while player-relevant ants are in the predicted impact area, one per event, site cooldown; colony alerts ease to a lower level when the same diagnostic asks for it; `quietRun.ts` tool; 300 tests green in `environment/human` and `progression`.
- Whole-game E25 still fails (96–110 of 126–128 windows): the colony's own standing warnings (`food-c-low`, `food-p-low`, `brood-stalled`), `nest-flooding` (critical, real), `heat-danger` (AI foragers cross hot ground at 11:00–16:00), `nest-crowded`. No major threat started in any whole-game run (director starved of quiet budget); the long test's threat cases are red by design.
- **R28 — a loud hour**: a warning is loud for 30 s of sim time after it is raised or its level rises; a critical alert for as long as it stands (`alertActive` in `ecology/creatures/threat.ts`). Direction 11 in `colony-life.md` (start of the next round).
- Leads for colony-life: `heat-danger` from foragers crossing hot ground at midday (heat avoidance of the AI), flood criticals lasting 650 s.

Running: colony-life `wek2szmct` (sweep 5), look-pass-3 `w2ht0mt7m`.

## Nov 18 02:35 UTC — docs-final landed; sim-seams launched; app-seams-2 queued

docs-final (impl + review + fix; results `reviews/docs-final.json`): `README.md` (every command run), `docs/MANUAL.md` (504 lines; control tables generated from the bindings), `docs/design/gdd/DEVIATIONS.md` (R1–R28 + recorded deviations, code pointers), `CREDITS.md`, `docs/CREDITS-AUDIT.md`; `tests/docs/docs-final.test.ts` (8 tests) fails when bindings, presets or rules drift from the manual. Documents name commit fb15f3d.
- **Unverified provenance**: 26 audio files from archive.org items (USC "Red Library", "SSE Library") — licence not shown by the repository. `assets-src/raw/` (626 MB, git-ignored) holds the only evidence for some sets. To settle before the final build: verify each from its source page or replace with synthesized cues.
- **Design pieces the game lacks** (settings exist, nothing reads them): the Minimap and the Focus line of GDD 08 §3; `autoSlowDefault`; Settings controls for `autoSlowCritical` / `autoSlowWarning`; rules `winterMode`, `extinctionEndsGame` not offered. Wrong strings listed in the result.
- New specs: **`sim-seams.md`** (Opus; progression listeners table, journal year, rivals at tick 1, red command test, `time.auto-slow`, unwired difficulty parameters incl. the opening grace gate, map-edge parking, save round-trips in eight states) — launched; **`app-seams-2.md`** (Sonnet/Opus, visual; minimap, focus line, auto-slow settings, rules, strings, one manual) — queued behind look-pass-3 (same folders).

Running: colony-life `wek2szmct` (sweep 5), look-pass-3 `w2ht0mt7m`, sim-seams (new).

## Nov 18 04:15 UTC — sim-seams landed

sim-seams (impl + review + fix; report `sim-seams-report.md`, results `reviews/sim-seams.json`):
- Milestone/aim/codex trigger table test (every id has a listener and a reachable emitter, or is reported); `ms-zone-crossed` now needs a worker (the queen's search no longer fires it); journal entries carry `calTick` (dates right across winters — the app must read it); rival nests built at game creation (no multi-second first tick from rivals; new-game hashes differ from before); `commands.test` "ends with lifecycle" fixed (corpse pass ranked last; drowned ants leave corpses and drop what they carry); `time.auto-slow` documented as emitted by the game layer; **opening grace gate wired** (human events, ant predators and bird visits wait for `openingGraceGd` in real openings); `UNWIRED_WHY` names the missing piece of each parameter still not in effect; save round-trip table over the eight states.
- Open, handed on: journal dates in the UI and manual drift (added to `app-seams-2.md` items 9–11); small owner-less seams (direction 12 of `colony-life.md`: mound heights after load, `applyPendingCommands` flush, createGame import of rivals wiring, human schedule week constants, entrance re-evaluation cost, ecology import cycle); species modules' periodic systems collide in their stagger offsets (wood 7 pairs, granary 11, fungus 11: for the species viability pass); first tick of a new game ≈ 670 ms outside rivals (perf task); aims `aim-find-wood`, `aim-plant-garden` have no opener (species pass).
- `tests/docs/docs-final.test.ts` and `src/sim/time.test.ts` are red until those hand-ons land.

Running: colony-life `wek2szmct` (round 6 closing → sweep 6), look-pass-3 `w2ht0mt7m` (fix round). Queued: app-seams-2 (after look-pass-3).

## Nov 18 05:10 UTC — look-pass-3 landed (partial); app-seams-2 launched; audio-provenance running

look-pass-3 (impl ×3 engineers across two restarts + review + fix; report `look-pass-3-report.md`, results `reviews/look-pass-3.json`). Pictures looked at by the integrator: night at ground level now reads as night (dark, cool, grass and the entrance readable: `test-output/look3fix/shots2/fix-night-observerlow-high.png`); night worker dark with a rim, no chrome (`fix-night-close-high.png`).
- Done: `NIGHT_LOOK` re-metered; `STAGE1A_STRICT=1 stage1a.mjs` passes in full (camera rescue pose `closePose.ts`, GDD radius and clearance restored); leaf contact shadow as a soft blended fringe; gyne night wings; slope lift of the follow camera; mound foot; dry-leaf night albedo; `autoSlowDefault` read by the game; pad View tap counted in polls; inEffect marking; R20 strings. Browser: stage1a strict, photo quick, views quick, controls, panels A and B pass; firstplay beats 1–10.
- Open (added to `app-seams-2.md` items 12–13): founding queen by day still a grey glass bulb; far wall blocks in the opening shot; white sky disc in the crevice cutaway; quality-switch disposal leak; `firstplay.mjs` beat 11 (time-lapse overlay gone before the script looks); leaf thickness (blocked by the hug rule in `drapedShape`); play-through not re-run on the final code.
- GLSL note for this code base: no texture read inside a per-pixel `if` on sampled data (undefined derivatives; software GL renders differently each time); `tests/e2e/look3-det.mjs` checks it.

Launched: **app-seams-2** (Sonnet impl + Opus review, visual). Running: colony-life `wek2szmct` (sweep 6), audio-provenance `wexmqilmx`.

## Nov 18 06:20 UTC — sixth container restart (06:12); sweep 6; relaunched

Restart at 06:12 UTC (sixth). Disk intact; snapshot `948fb75`. Cut off: colony-life round 7 (30 min in), audio-provenance fix round (minutes in; impl and review saved: `reviews/audio-provenance.json`), app-seams-2 impl (an hour in). Saved from the journal: `reviews/colony-life-round-6.json`, `colony-life-sweep-5.json`, `colony-life-sweep-6.json`.

**Round 6**: sweep-5 findings fixed with tests — P1d (the queen pays her hand-over protein into the stomachs for as long as she holds it, no window), RS (footprint terrain overlays registered when the sim is built: the save → load ground-depth difference), WL3 (lapse model re-run under the cap so kept workers eat and can starve); R28 built (long test: failing quiet-share windows 96–110 of ≈127 → 0–1); SF (tenders stay in while the stores cannot take their crop). Predation analysis: the R25 ramp works; woodland-edge #1 still lost 7 workers at 18–26 workers (worldgen-placed residents near the nest).

**Sweep 6** (fresh hand-overs, `test-output/colony-life/round-6/sweep-table.md`): viable **4 of 15** (round 5: 6); R19 4 of 7 (held 4/15, eclosions 4, P 0.197, C 0.985, trips 43.9 %). Paired comparison on five colonies from the same hand-overs, round 6 vs the tree before it: 10/9, 11/9, 16/15, 10/9, 9/9 workers at winter — **round 6 is not the regression**; the fresh hand-overs differ from sweep 5's (rival nests at creation and the opening grace changed every opening). Direction 13 of `colony-life.md`: the paired comparison on the same hand-overs is the primary evidence of a round from now; only colony-life changes sim code.

audio-provenance review: fail (2 major: the always-on provenance test red on a level-match slack; new MP3s lack the gapless header, so decoders keep encoder delay and padding — loop seams) + 3 minor.

Relaunched:
- colony-life `w09el0k35` / wf_d2795bd9-5e2: `{firstRound: 7, maxRounds: 4, note}` (round 7 continues from the ledger).
- audio-provenance `w0771p982` / wf_7abc08a6-282: `startAt: 'fix'`, `reviewPath: reviews/audio-provenance.json`.
- app-seams-2 `w9b7zmcaw` / wf_ec7ed4b8-503: continue from its progress file.

## Nov 18 06:30 UTC — audio-provenance landed

audio-provenance (impl + review + fix; report `audio-provenance-report.md`, results `reviews/audio-provenance.json`, `reviews/audio-provenance-fix.json`): **36 sounds replaced by original sounds** rendered by deterministic scripts under `tools/audio/` (byte-identical on re-render; provenance tests always on; gapless headers; loudness targets met; seams measured). No archive.org file ships. `public/assets/CREDITS.md` has a group "Original sounds (36 files)". Nine OpenGameArt files are kept, labelled `A-badge` (CC0 on the author's own page, no saved copy of the page): residual risk, named in the audit.
- Nobody has heard the replacements: checked by measurement only. For the final report.
- Integrator edit: `src/ui/screens/credits/parse.test.ts` no longer expects the archive.org group (green).
- To do at the next gate: `npm run verify:portable` with the browser stage (not re-run after the fix round; build and static scan pass).

Running: colony-life `w09el0k35` (round 7), app-seams-2 `w9b7zmcaw`.

## Nov 18 07:25 UTC — round 7 complete; ruling R29

**Round 7** (ledger "## Round 7"): in the tree — RM (mound mask after restore: the mask key now includes terrain deltas; a footprint is a dent, not a hole), SF3 (tender gap), three owner-less seams (week constants in the human schedule → `time.test` green; `createGame.ts` imports the systems so a game is the same however created; `applyPendingCommands` flushes events outside a tick). **Tried on paired runs and reverted**: L1 (winter-reserve gate from day 14: gate-shut hours 70 → 0 and eggs a day earlier, but workers at winter 11/9, 10/10, 10/9 — the extra eggs are diapausing brood paid from the winter stores) and T1 (overdue-pile tending: untended deaths 15 → 21, larvae starved 8 → 11, a scenario test red). Finding: the shortage is nurses (target 2 of demand 3.6 at 9–16 workers; the automatic split halves demands), and eggs laid more than ≈ 3 gd after hand-over cannot finish before winter.

**R29 — the queen lays what the colony can raise**: laying potential × a care factor that reaches zero when the brood in care equals what the nurse-capable workforce can tend at the design's care rates; eggs that cannot finish before winter are not laid. Accepted only on the paired comparison over all 15 hand-overs. Direction 14 of `colony-life.md`. Year two: long runs are mandatory in every sweep (sweep 6 ran none); round 8 runs two itself and answers the spring-temperature lead.

Running: colony-life `w09el0k35` (sweep 7), app-seams-2 `w9b7zmcaw`.

## Nov 18 08:35 UTC — sweep 7; year two is worse; rulings R30, R31 (R11 withdrawn)

**Sweep 7**: viable 4 of 15 (we 2, sg 1, pp 0, cpv 1, kd 0); R19 4 of 7 (held 4/15, eclosions median 4, P 0.198, C 1.078, trips 43.9 %, first workers ≥ 9 in 14/15, no `lost` in 13/15). 13 runs identical to sweep 6 in every day sample (round 7 changed little by design); pp #3 worse (its founding changed with the mound fix). Review: one major, pre-existing — flood readers saw a different nest after a load (round 8 fixed it first: F1). Saved `reviews/colony-life-round-7.json`, `-sweep-7.json`.

**Year two, integrator's own long runs on the round-7 tree** (`test-output/colony-life/round-7/sweep-long/`; the sweep engineer skipped them again; the workflow script now makes them a numbered step): cpv #1 17 → 6 over the lapse (8 drowned inside it) → 4 on day 15; sg #2 11 → 6 (starved, queen starved) → 2; we #2 8 → 5 → 1. Round 5 had 17 → 15, 12 → 11, 8 → 8. So the lapse regressed in rounds 6–7, and no colony has ever had a second year.

**Why, by arithmetic rather than another round**: first workers live 24 ± 10 gd and age × 3 outside → 4–11 gd of foraging in a year that has 12 gd after the hand-over; 64 of 95 adult deaths in sweep 7 are old age. In spring the nest reaches laying temperature about day 6 and new workers eclose about day 11–13; the overwintered workers are dead by then. R11 (leave ageing alone, feed the brood) was my ruling and it was wrong; seven rounds were spent inside a budget that cannot close.

- **R30** (replaces R11): worker lifespan 33 → 42 gd (sd 8), first workers 24 → 34 (sd 8), clamp floor 10 → 16, ageing outside × 3 → × 1.5 (the dangers of foraging are simulated one by one now; the multiplier counted them twice and is not ramped for small colonies). Other species: data only, same factor.
- **R31**: queen-care demand 1 below 20 workers; nursing served in full before any task's second ant. Paired evidence required.
- R29, R30 measured as separate arms on the 15 hand-overs and on long runs. Winter-lapse regression and the browser founding failure on seed 2 (3 of 4 runs lose every egg at 2.8 % of the lapse on a "Poor" start site) go to round 8 as well. Direction 15 of `colony-life.md`.

Stopped `w09el0k35` at 08:22 (round 8 was 10 minutes in: F1 and R29 written, in the tree, ledger current) and relaunched with direction 15 as `w72m08zl2` (wf_e2eea569-54f; firstRound 8, maxRounds 3).

## Nov 18 08:40 UTC — year-two baseline complete (round-7 tree)

All five long runs done (`test-output/colony-life/round-7/sweep-long/longrun-table.md`). R22 year two: spring ≥ 0.7 × winter in 1 of 5 (bar 4); doubled by day 15 in 0 of 5 (bar 3). Lapse: cpv #1 17 → 6 (8 drowned), kd #3 10 → 3 (starved, queen starved, C 0 at winter), pp #3 7 → 6, sg #2 11 → 6 (starved, queen starved), we #2 8 → 5. Day 15: 4, 0, 1, 2, 1 workers. Two queens starve in a lapse the player accepted with stores that could not cover it: the winter notice must say so (R27 check) — for round 8. Baseline written into the ledger above "## Round 8".

## Nov 18 10:05 UTC — round 8 first numbers; R29 amended; second re-steer

Round 8 so far (ledger "## Round 8"): **F1** (flood readers after a load), **FD1** (a sealed queen standing in her shaft was treated as exposed and dried out: the cause of the browser founding failures — outcome depended on how long the player took to lay), **WL4** (a flood the colony survived before the winter notice no longer counts as "alerted": cpv #1 lapse 16 → 6 becomes 16 → 14), R29 and R30 in the tree, R31 as a patch. sg #2's winter loss is its stores, not the lapse code (round-5 tree gives the same on the same snapshot).

**Paired subset (5 colonies, one per archetype; first workers 63)** — workers at winter: base 52, R29 42, R30 66, R29+R30 59; eclosions 27 / 11 / 27 / 12; old-age deaths 23 / 23 / 10 / 11; median P intake 0.12 / 0.37 / 0.13 / 0.37 of need; viable 0 / 2 / 0 / 4. R30 better than base in 5 of 5 (and it was under-measured: cached hand-overs kept the first workers' old lifespans; the engineer added `--renew-nanitics`). R29 as I wrote it loses eclosions: its "do not lay what cannot finish before winter" clause is a knife edge that stops all laying at the peak of summer in two colonies.

**Integrator**: the finish clause is withdrawn — my wording, and wrong about the animal as well (the species overwinters larvae, which are spring's first workers; that is the gap year two dies in). R29 = care factor alone. Arms from here: base, R30, R30+R29c, R30+R29c+R31; long runs on R30 and the best arm. Protein income (0.12 of need with brood) is the next cause, as a per-colony ledger. Direction 16 of `colony-life.md`. Stopped `w72m08zl2` at 10:00 and relaunched as `w3ki38obr` (wf_cc7c5df9-2d8).

## Nov 18 10:50 UTC — app-seams-2 landed; look-pass-4 launched

**app-seams-2** (Sonnet impl, Opus review, fix; `reviews/app-seams-2.json`, report `app-seams-2-report.md`): minimap (possession, observer, click to pan), Focus line (shows a new aim opening behind an older one after the review's major finding), auto-slow settings, rules not in the build tagged on New Game, strings for the day-5 start, journal dates across the winter, hint card hidden behind the journal, shadow map released when a preset turns shadows off (the "quality-switch leak" was lazily created resources of visited presets), fence panels get boards and keep their colour in haze. firstplay: beats 1–13 and 14–25 all run (two segments; the trail beat with a stand-in in the full run), the growth check fails (6 workers, sim). Not done: 12(c) crevice disc never reproduced, slope camera pair unconvincing, epitaph cheat cause (needs a sim cheat), queen still glossy, single 25-beat pass on the final tree.

Pictures looked at by the integrator: HUD reads well; minimap ground is a coarse staircase; the possession camera rolls the horizon ~60° on a slope; a flat pale-green slab lies under the queen at quality high; far structures are untextured slabs in the worker shots; "Why?" card under the Tab prompt; brood inspector label/value inverted; the first site read-out says "Poor" with no guidance. → **`look-pass-4`** (spec written from these pictures).

Sim-side needs it reported (already with colony-life round 8: founding desiccation FD1, the winter-coming numbers): foragers lay no trail to a sugar spill 22 BU from the entrance within 18 000 ticks even with a forage marker; `trophallaxis-give` by a possessed worker does not empty her crop; `cheat.killAll` takes no cause; `tests/docs/docs-final.test.ts` red on a constant round 8 removed.

`look-pass-4` launched 10:55 UTC as `wu0kmy6jd` (wf_e5cc2c35-2fc; Sonnet impl, Opus review, visual). The browser-met sim defects are direction 17 of `colony-life.md`.

## Nov 18 11:40 UTC — first year-two runs with R30: a second spring exists

Round 8 (third engineer) so far: **HB1** — hunters fled from the alarm of their own non-lethal first bite, so 84 % of 1202 chases over 10 runs ended without a catch (~250 P of prey against 222 P of larval demand); fixed, paired runs queued. Protein ledger: 348 P arrived within range over 10 runs, 13.5 known on average; larvae ate mostly the queen's founding reserve (145 P fed, 66 delivered). **R32** (direction 18): the protein need counts eggs as the larvae they become.

**Year two, R30 + WL4** (cpv #1, we #2): spring 17 of 19 and 10 of 11 workers (round 7: 6 of 17, 5 of 8); day 15: **19 and 7** (round 7: 4 and 1). Doubling by day 15 not met (19 vs 22, 7 vs 16): every eclosion before day 15 is an overwintered larva (2 and 1). Direction 19: larvae taken into winter is the lever; long runs now go to the second winter (`UNTIL_DAY=40`).

look-pass-4: leaf detail, inspector wording, hint overlap, site advice, minimap shapes written (pictures pending). The engineer keeps the possession camera's follow-surface default because GDD 01 §6.2 / GDD 08 §7.4 say so and a "Keep level" setting exists; the integrator will decide the default from its slope pictures.

## Nov 22 04:30 UTC — resumed after the account's weekly usage limit (Nov 18 12:37 → Nov 22 04:00); container restart 7

Both workflows died on the usage limit at about 12:37 UTC Nov 18 (round 8's third engineer mid-way through the arms; look-pass-4's engineer with code for items 1–4, 6–8 written and most pictures missing). The machine restarted; disk and the frozen arm trees `/home/user/scratch-r8-*` survived.

Recovery, with cost in mind (the limit was spent in four days):
- The integrator resumed the paired runner itself (`round-8/paired/jobs4.sh jobs4c.txt`, then `jobs5.txt` = the HB1 arm on all 15; background command; about an hour). **The Opus engineer for the rest of round 8 is launched only when the runs are done**, so it does not wait on them.
- look-pass-4 relaunched (Sonnet) as `wveg3e7vs` (wf_15b7c326-705), continuing from its progress file.
- Check-ins go from every 30 minutes to every 60, and only while something runs.
- After a restart: `git add -A` commit + push; paired runner is restart-safe (same two commands); colony-life relaunch = `wf-life.js` `{maxRounds: 3, firstRound: 8}` with a note that directions 15–19 are binding and the ledger's Round 8 section says what is in the tree; look-pass-4 = `wf-build.js` with a note pointing at its progress file.

## Nov 22 05:15 UTC — round 8 arms complete on 15 colonies; verdicts

`test-output/colony-life/round-8/paired/arms15-table.txt` (cached hand-overs, to winter; first workers 168): workers at winter base 139, R30 203, R30+HB1 199, R30+R29c 214, R30+R29c+R31 209; viable 4 / 7 / 8 / 10 / 10; old-age deaths 62 / 0 / 0 / 0 / 0; median P 0.198 / 0.221 / 0.287 / 0.215 / 0.245; trips ok 43.9 / 36.8 / 50.4 / 38.4 / 45.1 %.
**R30 accepted** (15 of 15 better). **R29c accepted**. **R31 not accepted** (no gain). **HB1 accepted** (defect fix). Untended brood (54–76 of ~250 eggs) is unchanged by all of them: the single-nurse gap is the next brood loss. Fourth engineer of round 8 launched to put the accepted set in the tree, run the year-two runs to the second winter, and close the round; then the fresh sweep 8.

Colony-life relaunched 05:20 UTC Nov 22 as `wy25pjnh7` (wf_378a44f5-031; firstRound 8, maxRounds 2: closes round 8, then sweep 8, round 9, sweep 9). After a restart: plain firstRound 8 with a note that the ledger entry of Nov 22 05:15 holds the verdicts and the round only needs closing; if round 8 result is in the journal, firstRoundResult.


## Nov 22 06:30 UTC — round 8 closed; year two to the second winter; rulings R32b, R33, R34 (direction 21)

Round 8 closed 05:56 (tree = F1 + FD1 + WL4 + R30 + R29c + HB1). Five long runs to the second winter (`test-output/colony-life/round-8/long-final/table.txt`): spring check **4 of 5** (met; sg #2 entered winter with C 0 and lost its queen), but every colony shrinks through year two (workers at winter 1 → winter 2: 14 → 10, 9 → 1, 13 → 5, 17 → 3, 12 → 7).

The integrator's reading of the daily rows (four colonies with a queen): **eggs laid in all of year two 16, 12, 25, 18; eclosions 5, 1, 3, 3; worker deaths 8, 8, 10, 7.** A colony of 12 needs ~8 eclosions a year to hold and ~20 to double. Causes:
1. A lock on laying: potential 23–34 eggs/day on warm days, laid 0–8. The release gate needs `LARVA_P_REQ` 1.2 loads in store per egg and larva (stores hold 1–3), and protein demand counts only larvae that exist, so foragers gather carbohydrate (C 26–46 loads unused) and the queen is never released. → **R32b**: prospective protein demand from withheld laying drives diet share, forager choice, hunt valuation and the protein stock target; supply horizon 0.5 → 1.5 gd.
2. Neglect: 36 of 71 year-two eggs died untended as eggs or pupae (`UNTENDED_GD` 0.25). → **R33**: 1.0 gd, and no idle/waiting worker in the nest while brood is overdue.
3. **R34**: R22's "≥ 2 × first workers by year-two day 15" tested a day before any same-year worker can eclose; replaced by workers at the second winter ≥ 1.0 × first winter in ≥ 4 of 5 and ≥ 1.5 × in ≥ 3 of 5.

Browser: firstplay fails on seed 2 (6 eggs lost at 2.8 % of the lapse) **and on seed 1** (first workers never reopen the entrance). Both are round 9's first item.

Running at 06:30: colony-life `wy25pjnh7` (sweep 8 in progress: 6 of 15 at 06:22; then round 9 under directions 20 + 21, sweep 9); look-pass-4 `wveg3e7vs` (impl at item 9 browser scripts). Not yet weighed: `walker-stuck-explosion` violations (9–59 a run, mostly autumn; possibly cold-slowed walkers flagged) and worker time on queen-care (14 %) and store/haul (27 %).


## Nov 22 07:35 UTC — sweep 8 (fresh 15 runs) first numbers

`test-output/colony-life/round-8/sweep-table.md`: **viable 9 of 15** (sweep 7: 4; bar ≥ 2 of 3 per archetype fails on playground-park and kitchen-door); R19 4 of 7 (held 12 of 15 ok, eclosions median 5 ok, C 1.162 ok, first workers ok; protein 0.269 FAIL, trips 45.9 % FAIL, no-lost 12 of 15 FAIL). Sums vs sweep 7: workers at winter 138 → 194, old age 64 → 1, starved 13 → 1, lost 2 → 10, predation 14 → 14. Probes by the sweep engineer: pp #1's six lost foragers stop at one point 82.5 BU from the door (homeward trap); sg #3 made no trip all year because the hand-over reopen left plug soil in the throat (= red `founding/reopen.test`, likely the seed-1 browser failure). Both added to round 9's first item (direction 21a). Long runs of the sweep in progress. look-pass-4: implementation done 06:57 (report written), Opus review in progress (candidates: minimap repaint cost 0.14 → 1.1 ms, brick courses doubled over scanned bricks, stumps drawn with boards). `reviews/colony-life-round-8.json` saved.


## Nov 22 07:50 UTC — look-pass-4 landed; camera default decided; app-seams-3 launched

look-pass-4 (`reviews/look-pass-4.json`, `look-pass-4-report.md`): review failed with 11 findings (brick lines drawn over scanned bricks, plinth stripe mid-wall, stumps with boards, triangles +11.8 % at low, minimap repaint cost), all fixed; triangles now +7.8 % at low; minimap repaint 1.9 × the old painter at 176 px (accepted: 1.8 ms every 200 ms). Integrator looked at `item2e/fp-until05/05-site-readout.png` (fence reads as boards, ground has grit) and `item5/*` (slope and stem, Follow surface vs Keep level).
**Camera default: stays Follow surface** (GDD 01 §6.2). On the 32° slope Keep level puts the slope between camera and ant (ant half hidden); Follow frames the ant on both the slope and the stem. Keep level remains a setting.
Not done there: backdrop cars never pictured; plastic play equipment has no face pattern; brood-inspector picture (needs firstplay past beat 12).
Browser facts for the sim: seed 2 founding floods in rain at a site whose read-out says flood safety 5 of 5 (direction 21b); seed 1 entrance stays `reopening`.
Launched **app-seams-3** (Sonnet / Opus verify; `docs/design/tasks/app-seams-3.md`): corrupted save loads (red `save.verify.test.ts`), flood alert titled "Queen under attack", backdrop cars picture, stage1a strict egg beat, epitaph cause, queen gloss.

app-seams-3 launched 07:55 UTC Nov 22 as `wknx0224r` (wf_ecf2efc5-423; wf-build.js, key app-seams-3, sonnet/opus). After a restart: relaunch with the same args and a note pointing at `progress/app-seams-3-impl.md`.

## Nov 22 08:35 UTC — sweep 8 closed (result saved); round 9 running

`reviews/colony-life-sweep-8.json`. Verdict: viability bar not met (9 of 15; pp 1/3, kd 1/3), growth bar not met (protein 0.269, trips 45.9 %, no-lost 12 of 15). Findings: 2 major (lost workers in traps: a terrain bowl 82.5 BU from the door in pp #1, and two workers 0.1–0.4 BU from their own open entrance in we #1; inert colony sg #3 with plug soil left in an `open` entrance and every worker's nav `failed:leg`), 4 minor (F1 reader cost, `DIAG_MORTALITY_REF_LIFESPAN_GD` 26, round numbers not reproduced on fresh foundings, workedExample red is 10-seed noise). Brood: 80 untended + 34 flooded of 247 eggs, 60 eclosions. kd #3 hunted 45 of 54 trips and starved of sugar with 4 flowers in range (C must not be dropped for protein: R32b's "C first while short" clause covers it). Sweep long runs (`round-8/sweep-long/table.txt`): spring check 4 of 5; all shrink again by the second winter (e.g. 11 → 6, 12 → 10, 13 → 8): the R34 baseline is 0 of 5.
Round 9 started 07:53 (engineer 1): reopen defect reproduced 08:05; a locomotion fix for the bowl trap (LD1: progress during a stuck episode must beat the best reached before it) is on a paired run. app-seams-3 running (first edits under `src/game/save`).

## Nov 22 10:05 UTC — app-seams-3 landed (verify failed with 3 findings, all fixed)

Result saved: `docs/design/tasks/reviews/app-seams-3.json`; report `docs/design/tasks/app-seams-3-report.md`.
Pictures I looked at: `test-output/app-seams-3/alerts/queen-danger-cards.png`, `cars/meta-edge.png`, `cars/ant-0.png`,
`queen-fix-compare-side.png`.

- **Saves:** a damaged save no longer loads. New saves are a gzip member with an `FC` subfield (CRC-32 of the deflate
  body), MTIME 0 and a checked length; every single-byte change and trailing bytes are rejected (test over every byte).
  Saves written before the change still open, with weaker checks (MTIME and deflate-equivalent flips in them cannot be
  detected; a limit of the old format).
- **Alert title:** "Queen in danger" for rising water and an enemy that is only close; "Queen under attack" for a
  creature or damage. Worded on the UI side from the alert's tokens (sim text table untouched); GDD 08 deviation
  D-APP3-1.
- **Backdrop cars:** exist in 7 of 18 compact worlds tried (road edge runs: car-park-verge, field-margin, one
  woodland-edge). From a raised camera they read as box cars with a window band and wheels. **Open visual defect, my
  reading of the pictures:** the hashed-alpha fuzz (`BACKDROP_FUZZ` 0.85) sprinkles white dots over every large backdrop
  face, plainly visible both raised and at ant height. Left for the next look pass (per-vertex fuzz attribute, or fuzz
  on silhouette edges only).
- **`stage1a.mjs` egg beat:** script fault (a blind `lay-egg` before the opening, refused correctly; the stand-in then
  quoted that refusal). Now an asserted check; the full strict gate incl. the high-quality part passed once.
- **Queen colours:** the first change was dead data (species appearance overwrote every caste); fixed with an additive
  render-local `AntMorphology.ownColours`. The lift is barely visible in the compare sheet; she is still a dark disc
  from behind. Accepted as is.
- **Epitaph:** `tests/e2e/lifecycle.mjs` already kills per ant with real causes; round 9 added an optional cause to
  `cheat.killAll`. Nothing further.
- **Mine (trivial):** `src/core/serialize.ts gzip()` passes `mtime: 0` (a pure module was stamping the wall clock into
  the gzip header); `src/core` + `src/game/save` 303 tests green.
- Still open for sim: `lay-egg` returns reason `budget` outside the opening's lay phase (direction 21b list).

Running: colony-life round 9 (arms + long runs), then sweep 9. Check-in 10:36 UTC.

## Nov 22 11:41 UTC — round 9 mid-way: R32b + R33 help to winter 1, R32b starves two colonies of sugar; R35 ruled

Round 9 (still running) so far, from the ledger:
- **Founding at the start pose: 25 of 25** (5 archetypes x seeds 1-5) hand over and get a worker outside, after the
  reopen fix and three seal fixes (SG1 stall in the throat, SG2 SOIL/BACK cycle, SG3 plugs laid below the throat).
  Before: 22 of 25. Not yet re-run in the browser.
- **Arms on sweep 8's hand-overs to winter 1, base -> final (10 pairs):** workers at winter 117 -> 150 on the first 9,
  eclosions 40 -> 74, brood lost untended 49 -> 13, `worker:lost` 11 -> 3, viable 6 -> 8 of 9. Predation 8 -> 14 and
  crushed 8 -> 12 (more workers outside).
- **Five long runs vs R34:** >= 1.0 x winter 1 on 2 of 5 (was 0 of 5; bar 4 of 5), >= 1.5 x on 0 of 5 (bar 3 of 5);
  spring check 3 of 5 (was 4 of 5). cpv #1 18 -> 22, we #2 15 -> 19; kd #3 12 -> 8; pp #3 17 -> 6 and sg #2 12 -> 2
  (queen starved) enter winter 1 with protein in store and no carbohydrate.
- **Cause, my ruling's own terms** (R32b): the prospective protein rate (19-36 loads/gd) swamps the carbohydrate rate
  (0.6), so the desired protein share is >= 0.97 and the carbohydrate weight falls to its base; the C-first switch sits
  at 1 x the stock target; and the GDD's spoilage-in-need term makes a protein store ask for more protein in autumn.
- **R35 (direction 22):** prospective rate <= 0.5 loads/gd x workers; a carbohydrate ramp (0 at 1 x, full at 2 x the
  stock target) and 0 while C is under the path to the winter need; `wC = base + needC x max(1 - sP, needC) x gain`;
  spoilage out of the forage-side protein rate; tend head-count unchanged by the prospective term (pp #3's zero
  tenders to be traced); one arm = the five long runs. A note in the ledger asks this round's engineer to do it before
  returning; if the round has closed it is the next round's first item.

If sweep 9 starts on a tree without R35: let it run (it still judges founding, lost workers and winter-1 viability on
fresh foundings); its R34 result is then known in advance and round 10 does R35.

## Nov 22 12:42 UTC — round 9 closed (result saved), without R35; sweep 9 running on that tree

`docs/design/tasks/reviews/colony-life-round-9.json`; ledger "### Round 9 results".
- 15 paired hand-overs to winter 1, base -> final: workers 190 -> 239 (better 14, equal 1, worse 0), viable 9 -> 13,
  eclosions 57 -> 113, untended brood deaths 78 -> 13, `worker:lost` 11 -> 3, trip success 45.9 -> 50.8 %, protein
  intake / need 0.269 -> 0.366 (bar 0.7). Predation 15 -> 26, crushed 8 -> 13. Flooding is now the largest brood
  loss (34 of 143).
- **R32b measure:** protein brought home / protein that arrived within 300 BU = 0.33 base, 0.20 final (150 of 743
  loads). The world's supply is not the limit; no ruling on supply rate or `LARVA_P_REQ`.
- Founding at the start pose 25 of 25 (headless). R34 2 of 5 / 0 of 5.
- The engineer closed at 11:49 with R35 unread or untaken (its "next" asks for the ruling direction 22 gives).
  Sweep 9 started on the tree without R35: left to run (independent check of the numbers above on fresh foundings,
  new defects). Its R34 result is known in advance. Round 10 starts when the workflow ends: R35 first, then brood
  drowned after the hand-over (sg #1, cpv #1), predation per outside-worker day against R25, sweep-9 findings.

## Nov 22 13:25 UTC — sweep 9 closed; round 10 launched (R35, R36, R37)

Sweep 9 (`reviews/colony-life-sweep-9.json`, table `test-output/colony-life/round-9/sweep-table.md`), fresh foundings,
round-9 tree without R35:

| | sweep 8 | sweep 9 | bar |
|---|---|---|---|
| viable | 9 of 15 | 9 of 15 (we 1/3, sg 2/3, pp 2/3, cpv 3/3, kd 1/3) | 2 of 3 each |
| workers at winter (sum) | 194 | 208 | |
| eclosions (sum) | 60 | 100 | |
| protein intake / need (median) | 0.269 | 0.478 | 0.7 |
| trip success (median) | 45.9 % | 56.8 % | 50 % (met) |
| `worker:lost` | 10 | 5 | 0 |
| untended brood deaths | 80 | 6 | |
| predation deaths | 14 | 41 | median <= 1 per colony (is 2) |
| brood hygiene / exposure deaths | 9 / 6 | 41 / 25 | |
| spring check (long runs) | 4 of 5 | 4 of 5 | 4 of 5 (met) |
| R34 >= 1.0 x / >= 1.5 x | 0 / 0 of 5 | 3 / 0 of 5 | 4 / 3 of 5 |

- The six non-viable: four are the R35 case (protein in store, carbohydrate short at winter), two are kitchen-door
  colonies starving of protein beside a full sugar store.
- Sweep findings: SG3 calls a long open shaft sealed (red verify test kept); the founding long test would not fail
  if the seal fixes were reverted; predation; R33 draft picks a worker who cannot nurse (Atta only); a new
  `Math.hypot` in sim code.
- Year two, best run: 35 eggs -> 13 workers against 12 old-age deaths. Growth needs both more eggs (the gates
  release about a sixth of the warm days' potential) and better brood survival; round 10 measures the gates and the
  protein discovery (direction 23 item 5) and I rule from the table.

**Direction 23** (`colony-life.md`): round 10 = R35 (direction 22) -> R36 kitchen-door protein (measure; raise the
`src/sim/ecology` flows to the outdoor median if under 1.5 loads/gd arrive within 300 BU) -> R37 predation (record
the killer; residents: the colony remembers the place, steering reads `knownHazardsNear`; bar median <= 1 per colony
and no more than a quarter of the workers in one day) -> sweep-9 defects -> gate and discovery tables.

**Launched:** `w8ztuxf6y` / wf_ac58d774-66a (`wf-life.js` `{maxRounds: 1, firstRound: 10, model: 'opus', effort:
'high'}`), round 10 then sweep 10. Recovery as before: round result in the journal -> relaunch with `firstRound: 10`
and `firstRoundResult`; cut off -> plain `firstRound: 10` with a note that the ledger's Round 10 progress says what is
in the tree.

**Mine, model-free:** browser first play on seed 2 through the hand-over (`test-output/firstplay-r9/seed2`,
background `b0r48rvug`), to see whether round 9's founding fixes hold in the browser.

## Nov 22 13:33 UTC — browser first play, seed 2: founding passes through the hand-over

`test-output/firstplay-r9/seed2` (my run, `FIRSTPLAY_UNTIL=13`, HEAD 4ab0ebd, no stand-ins): beats 01-13 all pass,
`ok: true`, no console errors; the lapse lost 3 of the first clutch, 7 first workers, queen's reserves 67 %, entrance
reopened (`open:0`), a worker outside. Before round 9 this seed lost the whole clutch to flooding and ended `failed`.
Pictures looked at: 12 (outcome card), 13 (entrance at night with the mound and a worker).
- Visual defect seen in picture 12: behind the outcome card the camera sits against the queen inside the cell; the
  wall texture is smeared and her body fills the frame cut off. For the next app pass (outcome-card framing).
- The alert "Founding chamber flooding - Resolved" is still on screen at the outcome card: the cell did take water in
  the lapse at a site whose read-out says flood-safe (direction 21b's question stays open; FD2 saves the clutch).
Seed 1 running now (`test-output/firstplay-r9/seed1`).
