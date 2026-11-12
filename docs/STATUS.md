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
