# threats-calibrate report — predation at the design's rate, growing with the colony

Engineer: threats-calibrate (Opus), 2026-11-17 17:00-(END) UTC. Spec `docs/design/tasks/threats-calibrate.md`; rulings
R25 (ramp) and R26 (loss rate first) in `docs/STATUS.md`.

**Data set.** The five round-4 hand-overs `test-output/colony-life/round-4/cache/founded-lasius-niger-<archetype>-1-naturalist-d-any.bin`
(start day 5, hand-over at day ~8.4-8.9 with 9-18 nanitic workers), each run **twice with different run seeds**
(`--run-seed 1` and `2`: every RNG stream of the restored snapshot re-seeded tool-side), Naturalist unless stated.
Totals over the ten runs are the result; single runs are noisy. Measurements ran on scratch copies of the tree
(`tree-base` = the integrator's stop-gap state at 17:05 UTC, `tree-ramp` = this task's code); the main tree was
changed only after a step was measured. Evidence: `test-output/threats-calibrate/<run>/` (one `funnel-*.json` / `.md`
per run, `tables.md` per batch).

Tools (observers only, no rule change; all in `tools/sim/`):
- `threatFunnel.ts` (threats-live) gained `--run-seed K`, `--workers N` (raise the colony to N workers at the start,
  `cheat.spawnAnts` age 4 gd, as `life.ts --workers`), `--food C,P`, `--until-winter 1`.
- `threatBatch.ts` (new): worlds x run seeds in one process, one at a time, then `tables.md`: per-colony predation
  deaths with the median, rates (threatTable's), strikes and kills per family per run, worlds reaching each stage, the
  summed funnel.
- `threatTable.ts`: `rates` / `worlds` exported, run seed and worker count in the row label.

(SECTIONS FOLLOW)
