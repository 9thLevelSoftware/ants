# Task species-leafcutter — Leafcutter playstyle: the fungus garden (Stage 3, Opus, visual)

## Goal
Make *Atta texana* play differently: the colony farms a fungus that is the brood's only food. Leaves are cut and carried along cleared trails by size-matched workers, processed down an assembly line, planted in garden chambers that need the right climate, weeded of a parasite, and their waste removed — and the game begins with a queen carrying a fungus pellet.

## Read in full
GDD 07 (`docs/design/gdd/07-species.md`): the Atta data set and the fungus-garden economy module in full (garden growth, yield, waste and contamination, temperature/humidity/air tolerance, substrate quality and plant rejection, the processing chain with bottleneck detection, hitchhikers and phorid flies, the garden parasite with weeding and quarantine, what happens when gardens die), founding with the pellet, caste roles (minims, medias, majors), signature moments. GDD 03: fungus chambers, many-entrance nests, capacities. GDD 05: leaf sources and plant defences. `docs/research/bio-atta.md`. Digests 07, 03, 05.

## You own
`src/sim/species/modules/fungus/**` (state, systems, behaviours `cut`, `garden/*`, `haul/garden-waste`, `guard/hitchhike`; registered through the species module registry), Atta founding rules under `src/sim/colony/founding/species/atta*` (one registration line, reported), rendering of gardens and leaf fragments under `src/render/nest/species/fungus*` and `src/render/ants/species/atta*` (reported), constants in `src/sim/balance/species-leafcutter.ts`, `tests/e2e/species-leafcutter.mjs`.

## Deliverables
1. Leaf harvesting: leaf sources on plants, cutting (timed, size-matched load), carrying fragments along trails, plant selection and delayed rejection after garden feedback.
2. The processing chain inside the nest by worker size, with a detectable bottleneck stage.
3. Gardens: garden units per chamber with biomass, health, contamination, climate tolerance; yield of food for brood and queen; workers fuelled by plant sap; garden relocation hooks.
4. Hygiene: waste production and removal to a refuse heap or chamber, the parasite's outbreak/weeding/spread/quarantine rules (the `avoid` marker as quarantine), refuse workers.
5. Threats specific to the species per the chapter's tier (phorid flies and hitchhiker minims).
6. Founding with the pellet: the claustral-fungus sequence and its failure modes; garden death and the `garden-less` colony state.
7. Diagnostics (`diag-garden`, `diag-at-*`) and visuals (pale garden masses in chambers, ants carrying leaf fragments, a refuse heap).

## Acceptance criteria
1. Typecheck and tests green; pure simulation code in the module.
2. Headless scenarios: a founding queen establishes a garden and first workers within the chapter's range; garden biomass follows the chapter's growth law given substrate; brood starve when the garden is unhealthy even with leaves piled up, and the diagnostic names the cause; an untreated parasite outbreak collapses a garden at the stated rate and weeding contains it.
3. Leaf loads are size-matched by caste; the bottleneck detector identifies an understaffed stage in a scripted imbalance.
4. `tests/e2e/species-leafcutter.mjs`: a new game with this species reaches first workers; screenshots (looked at) show a leaf-carrying column and a garden chamber.
5. The 28-day soak with this species holds all invariants.

## Addendum (Nov 17, binding)
Read `docs/design/tasks/species-common-addendum.md` after this spec; where they differ, the addendum wins.
