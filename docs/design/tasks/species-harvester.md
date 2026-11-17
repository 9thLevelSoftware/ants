# Task species-harvester — Harvester ant playstyle: seeds and granaries (Stage 3, Opus, visual)

## Goal
Make *Messor barbarus* play differently: seed harvesting along trunk trails, granaries with moisture and germination to manage, seed milling by majors into paste before larvae can eat it, chaff middens, a heat-avoiding daily rhythm, polymorphic castes, and founding deep in dry open ground.

## Read in full
GDD 07 (`docs/design/gdd/07-species.md`): the Messor data set and the granary economy module in full (seed classes and selection, seed batches with moisture and a germination clock, radicle gnawing, rot, milling into seed paste and its spoilage, the animal-protein minimum, chaff middens that grow seedlings, heat rhythm and morning patrol gate), founding variation, caste roles, signature moments. GDD 03: granary chambers and capacities. GDD 05: seed sources and seasonal availability. `docs/research/bio-messor.md` (including the interaction-rate task allocation summary). Digests 07, 03, 05.

## You own
`src/sim/species/modules/granary/**` (state, systems, behaviours `mill`, `store/granary-care`, seed foraging variants, patrol gate; registered through the species module registry), Messor founding rules under `src/sim/colony/founding/species/messor*` (one registration line, reported), species rendering parameters under `src/render/ants/species/messor*` if needed (reported), seed item visuals hooks (reported), constants in `src/sim/balance/species-harvester.ts`, `tests/e2e/species-harvester.mjs`.

## Deliverables
1. Seeds as the staple: seed sources in the world, size-matched carrying by caste, selection rules, trunk trails that persist and adapt.
2. Granary: seed cohorts per chamber with moisture, germination clock, rot; granary care (drying, radicle gnawing); capacity and the architect's granary need for this species.
3. Milling: majors process seeds into paste (the only form larvae eat), paste spoilage, the protein bottleneck and the animal-protein minimum.
4. Chaff midden and its seedlings; mistakes that grow plants near the nest.
5. Heat rhythm: activity windows by surface temperature, the morning patrol gate that opens foraging.
6. Founding per the species variation; polymorphic castes and their biases.
7. Diagnostics (`diag-granary`, `diag-mb-*`).

## Acceptance criteria
1. Typecheck and tests green; pure simulation code in the module.
2. Headless scenarios: a colony with seed sources fills a granary; a damp granary germinates/rots at the chapter's rates and care prevents it; with no majors milling, larvae starve despite full granaries and the diagnostic names the bottleneck; the animal-protein minimum is enforced.
3. Foraging stops in midday summer heat and resumes in the cooler windows; no foraging before the patrol gate opens.
4. `tests/e2e/species-harvester.mjs`: a new game with this species reaches first workers; screenshots (looked at) show ants carrying seeds on a trail and a granary chamber with seeds.
5. The 28-day soak with this species holds all invariants.

## Addendum (Nov 17, binding)
Read `docs/design/tasks/species-common-addendum.md` after this spec; where they differ, the addendum wins.
