# Task progression — Stages, milestones, journal, statistics, diagnostics aggregation, codex unlocks (Stage 2, Opus)

## Goal
The colony's record of itself: soft stages, milestones written into a field journal, history time series, the aggregation of every module's diagnostics into the "why" model with cause chains and remedies, alerts, and codex unlock triggers.

## Read in full
GDD 06 (`docs/design/gdd/06-environment-progression.md`): colony stages and their criteria (in simulated workers), the full milestone list (ids, triggers, journal text), the journal (timeline, history graphs, causes-of-death summary), the codex entry list with unlock triggers, autosave trigger points. GDD 02 and each chapter's Appendix D: diagnostics (status, weighted limiting factors, remedies). GDD 08: the alert system (kinds, levels, throttling, wording) and what the Colony health view needs. `docs/design/gdd/00-index.md` sections B6/B8 (final ids) and C11. Digests 06, 02, 08.

## You own
`src/sim/progression/**` (replace the stub index keeping its names and signatures), constants in `src/sim/balance/progression.ts`, text tables in `src/sim/progression/text/**` (journal lines and alert wording as data keyed by id — the codex prose itself is a later content task).

## Boundaries
Modules publish diagnostics through `publishDiagnostic`; you store, merge, rank and expose them. You do not compute other modules' limiting factors. UI panels are a separate task: expose plain-data queries.

## Deliverables
1. Stage evaluation and events; milestone engine (table-driven triggers over events and state, each firing once, with date and context) writing journal entries; journal queries.
2. Statistics: the hourly/daily time series the journal graphs need (population by caste, stores, intake by source, births and deaths by cause, nest volume), sampled on the stated cadence into the ring buffers.
3. Diagnostics registry: current status per diagnostic id with factors and remedies, change detection, cause chains (a diagnostic may cite another as a factor), ranking for the Colony health view, the alert engine (levels, throttling, grouping, click-through target) fed by diagnostics changes and module alerts.
4. Codex unlock engine (table-driven triggers) writing to the game's unlock flags and emitting events for the profile store.
5. Aims (the journal's current questions/goals) per the chapter, advancing with milestones.

## Acceptance criteria
1. Typecheck and tests green; pure simulation code.
2. Every milestone id and codex id in the design index exists in the tables, with a test that each trigger can fire from a synthetic event/state and fires exactly once.
3. Stage criteria match the chapter (table-driven test in simulated workers).
4. Diagnostics: publishing a status change produces one alert at the right level, repeated flapping is throttled as specified, and a cause chain is returned in order.
5. Statistics rings hold the stated sample counts and survive save/load; a 28-day headless run produces continuous series with no gaps.
6. Determinism; plain-data state.
