# Task species-carpenter — Carpenter ant playstyle: wood nesting (Stage 3, Opus, visual)

## Goal
Make *Camponotus pennsylvanicus* play differently from the reference species: nests excavated in wood, moisture and decay, frass ejection and frass piles, parent and satellite nests with brood shuttling, nocturnal trunk trails, polymorphic workers unlocked with colony age, and founding in a wood cavity.

## Read in full
GDD 07 (`docs/design/gdd/07-species.md`): the Camponotus data set and the wood-nesting economy module in full (state, constants, state machines, failure modes, diagnostics, the player's role), the founding variation, caste roles, signature moments. GDD 03: wood substrates, windows, frass, satellites (`satellite` nest kind), founding requirements for wood. GDD 04: wood placements (logs, stumps, structural timber, wall voids). `docs/research/bio-camponotus.md` for intent. Digests 07, 03, 04.

## You own
`src/sim/species/modules/wood/**` (module state, systems, behaviours such as `haul/frass`, `nurse/shuttle`, drumming; registered through the species module registry), the Camponotus-specific founding rules under `src/sim/colony/founding/species/camponotus*` (one registration line in the founding index, reported), species-specific rendering parameters under `src/render/ants/species/camponotus*` if needed (reported), constants in `src/sim/balance/species-carpenter.ts`, `tests/e2e/species-carpenter.mjs`.

## Deliverables
1. Wood as nest substrate for this species: the kernel's diggable-primitive predicate and nest rules configured so galleries can be carved in wood objects per the wood state (moisture, decay) with the chapter's bite factors (grain direction if specified), minimum wall thickness and carved-fraction limits.
2. Wood state dynamics: moisture and decay per wood piece over time and weather; brood moisture hazard; diagnostics (`diag-wood`, `diag-cp-*`).
3. Frass: created by gallery carving, ejected through windows, piles as visible items/heaps.
4. Parent/satellite nests: founding satellites, brood shuttling between moist parent and warm dry satellites, queen relocation rules, the `satellite` marker.
5. Night shift: light- and temperature-gated foraging rhythm and trunk trails per the species data.
6. Age-gated polymorphism (minors, medias, majors) and their task biases.
7. Founding in a wood cavity (site assessment factors for wood, the claustral-wood sequence).

## Acceptance criteria
1. Typecheck and tests green; pure simulation code in the module.
2. Headless scenarios: a founding queen founds in a decayed log and raises first workers within the chapter's range; a growing colony carves galleries only in wood, ejects frass, founds a satellite when the chapter's conditions are met, and shuttles brood between nests (report numbers against the chapter's tables).
3. Foraging outside is concentrated at night per the activity gates; majors appear only after the stated colony age.
4. `tests/e2e/species-carpenter.mjs`: a new game with this species reaches first workers through the real opening sequence; screenshots (looked at) show a gallery in wood from inside and a frass pile outside.
5. The 28-day soak with this species holds all invariants.
