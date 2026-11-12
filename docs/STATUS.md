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
