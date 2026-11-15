# Task render-creatures — Drawing the other animals (Stage 2, Opus, visual)

## Goal
Procedural, animated models for every creature in the ecology — prey, neutral fauna, aphid herds on plants, aphid predators and ant predators — in the same naturalistic style and with the same cheap vertex-animation approach as the ants, plus the comfort-mode substitutes.

## Read in full
GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`): the creature catalogue (sizes in mm, appearance notes, comfort-mode visual substitutes), herds on plants, the antlion pit, the bird event's visible part. GDD 08: art direction (no cartoon features) and the spider comfort mode requirement. `docs/research/spike-ants.md` and `src/render/ants/**` (reuse its geometry helpers, shader chunks and attribute scheme; do not edit its files — if you need a shared helper exported, add a small file in your folder and report the wish).

## You own
`src/render/creatures/**` and a demo page `spikes/render-creatures-demo/**`.

## Deliverables
1. Parametric procedural geometry and vertex-shader animation for: aphids (instanced herds on stems and leaves, scaled by herd size), ladybird and its larva, lacewing larva, springtail, mite, fly larva, caterpillar, fruit fly, woodlouse, earthworm, snail, millipede, jumping spider, wolf spider, ant-specialist spider, antlion (mostly buried, jaws visible) and its pit dressing, centipede, rove beetle, and the bird event's beak/shadow.
2. Locomotion styles driven by per-instance attributes from the simulation (walking with N legs, crawling/undulating, hopping, hovering, coiled/retracted, dead).
3. Comfort mode: when enabled, spiders render as the substitute the design specifies; switching is instant and complete (no spider geometry or silhouette remains).
4. Level of detail and culling; shadows near the camera only.
5. `CreatureRenderer` with `init`, `setSim`, `update(frame)`, `dispose`; demo page with a line-up of every creature at true relative scale beside an ant, each locomotion style, comfort mode on/off.

## Acceptance criteria
1. Typecheck clean; no console errors in the harness.
2. Screenshots, looked at and judged honestly: each creature is recognisable as the animal it is meant to be, at the right scale beside a worker ant; herds sit ON stems and leaves; the antlion pit reads as a pit with a lurking animal.
3. Comfort mode screenshot contains no spider-like shape.
4. 300 creatures cost no more than the per-instance figure established for ants (report).
5. Works in `test` and `high` quality and in the classic single-file build.

## Integrator addendum (Nov 15, 23:45)
- The creature simulation is in `src/sim/ecology/creatures/**` (families, FSM states, the bird event, the threat director); plant herds are in `src/sim/ecology/plants/**` (herd size, host plant, `ECOLOGY_TIER` is still 1 in the real game, so build a test scene that spawns creatures and herds directly). Read their state shapes; do not edit them.
- Renderers plug in as registry slots (`src/render/slots/**`, see `antsSlot.ts` and `fxSlot.ts`). The first-playable app gate is editing `src/render/slots/**`, `src/render/app/**` and `src/game/**` right now: **do not edit those**. Deliver a `CreaturesRenderer` implementing `SubRenderer` plus a ready-to-paste slot file in your own folder, prove it in your demo page and in a harness run that registers it at run time (through `window.__game` in test mode if a hook exists; otherwise the demo page only), and report the one registration line.
- Comfort mode: the setting already exists in the settings store (`src/game/settings` — find the arachnophobia / comfort key); read it, do not add a second one.
- Machine rules: 4 cores shared with other engineers. Never run the whole vitest suite; run your folder. One headless browser at a time; close it when done. Use the global Playwright (never npm-install it).
- Evidence under `test-output/creatures-render/`. Look at every screenshot you cite.
