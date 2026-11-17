# Addendum for every Stage 3 species task (binding; read after your own spec)

Written Nov 17. The base game has moved a long way since the species specs were written. Where this addendum and the spec differ, this addendum wins.

## State of the base you build on
- `docs/STATUS.md` from the Nov 16 14:00 entry to the end: rulings R1–R15 are binding and take precedence over the GDD where they differ.
- The reference species (Lasius niger) founds, hands over, forages, overwinters and reproduces. Its economy is still being tuned (`econ-growth`, `loco-fix3` fix rounds are in flight, then a gate task). **Do not edit** `src/sim/ants/behaviours/forage/**`, `src/sim/colony/**` (except your founding registration line), `src/sim/locomotion/**`, `src/sim/ecology/**`, `src/sim/nest/**`. If you need a hook there: an additive, optional hook of under 20 lines with a test is allowed and must be listed in your report; anything larger goes in `needsFromOthers` with the exact lines.
- Species economy modules register through `src/sim/species/modules/<yours>/index.ts` (already listed in `modules/index.ts`; systems, behaviours, command handlers, save state). Follow the import rule learnt the hard way: deep modules never import a module **index** (`@/sim/ecology`, `@/sim/colony`, …) at load time; import the leaf file, or late-bind. `SYSTEMS`/`BEHAVIOURS` are lazy lists for this reason.
- Determinism rules of the design seed apply (no `Math.random`, `Date.now`, `Math.hypot`; per-tick triggers are persisted state; memos key on every input). Tunables live in your `src/sim/balance/species-*.ts`.
- Lifecycle is in (`src/sim/colony/{overwinter,reproduction,succession}`): your species must go through winter (or its own dormancy rule from GDD 07) and the nuptial flight without special cases breaking; state what you checked.

## Order of work (so a cut-off leaves something playable)
1. Species data sanity: `requireSpecies(<id>)` values against GDD 07; castes and their unlocks.
2. The complete loop first: found → first workers → gather the staple → turn it into brood food → grow → reach the first winter. Only then the secondary features in your spec.
3. Diagnostics and words for every failure mode you add (`src/content/text/words.ts` additions are authorised, listed).
4. Pictures.

## How to prove it
- `node tools/sim/run-ts.mjs tools/sim/life.ts --species <id> --seed S --archetype A --until winter --cache test-output/viab/cache` — at most 2 at a time. **Viability bar for your species**: on its two best-suited Tier 1 archetypes (you choose and say why), ≥ 2 of 3 seeds reach the first tick of Winter 1 with: queen alive, workers ≥ 0.8 × first workers, no worker starvation deaths, no stage worse than lean for more than 1 game day, stores ≥ 1 game day of adult need (in your species' staple where the GDD says so). Report the table. A colony that is viable but does nothing species-specific is a failure.
- Browser: `node tools/harness/play.mjs --root . --query '?test=1&seed=1&quality=test&autostart=1&species=<id>' --script tests/e2e/<yours>.mjs --out test-output/<yours> --script-timeout N` (check how the game takes the species in test mode in `src/game/flags.ts`; add the query flag there if it is missing — authorised, listed). One headless browser at a time; global Playwright only, never install it.
- Do **not** set `available: true` in the species data; the Stage 3 gate does that after review. Test mode must be able to start your species regardless.
- Look at every screenshot you cite. Castes must be told apart at a glance in a possession-view shot; say which picture shows it.
- Never run the whole vitest suite in one process; long tests behind `FOUNDRESS_LONG=1`; no `process` in test files (there is no `@types/node`); delete probe files before you finish; `date -u` before writing a timestamp.

## Report
Besides the usual fields: which parts of the GDD 07 module are done, partly done, not done; every file touched outside your paths; the viability table; open defects, most serious first. Be blunt.
