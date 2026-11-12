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
