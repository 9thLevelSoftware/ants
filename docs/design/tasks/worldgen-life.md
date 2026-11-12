# Task worldgen-life — Populating the world: food anchors, plants as hosts, territories, rival sites, connection guarantees (Stage 1B, Opus)

## Goal
The living layer of the generated world: where food can occur, which plants host honeydew or nectar, where creatures have territories, where rival colonies sit, where the founding queen starts — and the map-wide guarantees that make every world playable (enough useful micro-connections, food within reach of likely nest sites, fair rival spacing).

## Read first
- `docs/design/tasks/gate-1A-sim-report.md` (§1 what works end to end, §2 what is stubbed, §8 what Stage 1B tasks must know — the public functions to call) and `docs/design/tasks/gate-1A-app-report.md` §7. The scripted stand-ins under `src/sim/testing/e2e/` show working call sequences against the real modules.
- GDD 04 (`docs/design/gdd/04-world-habitats-worldgen.md`): read in full the sections on food anchors and creature territory placement, rival sites and the queen's start position, nesting suitability per species, the micro-connection "useful" definition and the algorithm guaranteeing a minimum number per map size, the validation checks that concern resources and reachability, and world persistence (what is regenerated versus saved). `docs/design/gdd/digests/04.md` gives the map.
- GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`): the food-source catalogue (which kinds occur where and in which season), the Tier 1 rules (static honeydew sites, core-tier protein), rival roster per habitat with spacing rules, creature habitats. `docs/design/gdd/00-index.md` sections C10 and C13 (final spacing constants and the economy sanity budget).
- `src/worldgen/kit/**`, `src/worldgen/pipeline.ts`, `src/worldgen/validate/**`, the outputs of the terrain, outdoor and interior steps (objects, points of interest, micro-connections, suitability maps), `src/sim/types/world.ts` (placement tables), `src/sim/ecology/sources` (how anchors become sources).

## You own
`src/worldgen/populate/**`, registered with the pipeline through the kit's mechanism, and the validation checks about resources, connections and fairness inside `src/worldgen/validate/` that the terrain task left as "not applicable yet" (edit only those check bodies and report it).

## Deliverables
- Site quality ruling (`docs/02-design-directions.md` §K, last bullet): founding-site quality must discriminate; calibrate the suitability factors and word thresholds to the stated distribution targets, and place the queen start by the stated rule. You own this calibration: adjust the suitability weights/thresholds in `src/worldgen/maps/**` (authorised edit outside your folder; report it) and add a test that checks the distribution over 20 seeds per archetype.
1. Food anchors by zone, season and kind per GDD 04/05 (sugar and crumbs near human areas, carrion, static honeydew sites, nectar plants, seeds, fruit under fruit trees, pet food and counter food indoors, bait where enabled), attached to points of interest where they exist, with the renewal schedule data the source system reads.
2. Plant host assignments (which climbable plants can carry herds or nectar, at which points) for the Tier 2 ecology to use.
3. Creature territories and spawn tables per habitat (prey, neutral fauna, predators) as data.
4. Rival colony sites: species per habitat, spacing from each other and from the queen start, nest-site suitability per rival profile; the data a later task needs to pre-carve their nests.
5. The founding queen's start position and facing: on walkable ground, at a fair distance from suitable founding sites, rivals and hazards, per the chapter.
6. Guarantees: the micro-connection minimum per map size (adding connections through the outdoor/interior helpers or the kit when the map has too few), food within the chapter's distance of enough suitable nest sites, and the Tier 1 economy floor — with regeneration requests to the pipeline when a guarantee cannot be met.

## Acceptance criteria
1. `npm run typecheck` clean; tests green; imports limited to `src/core`, `src/sim/types`, the kernel and `src/worldgen`.
2. Over 20 seeds per Tier 1 archetype and size: every validation check passes or the pipeline regenerates/repairs within its attempt limit; no world is returned that violates a guarantee.
3. Rival sites respect the spacing constants in the design index; the queen start is on walkable ground with at least the required number of suitable founding cells within the chapter's radius.
4. The summed Tier 1 food supply of a standard world over a summer day (computed from anchors and their renewal data) meets the economy floor in the design index for the colony sizes it lists (report the numbers per archetype).
5. Every food anchor is reachable by a walker from the queen start using the nav grid, micro-connections and climb routes (sampled check across seeds); none is inside a solid.
6. Fingerprints stay deterministic; total generation time stays within budget (report).
