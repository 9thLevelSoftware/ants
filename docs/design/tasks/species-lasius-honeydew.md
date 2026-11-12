# Task species-lasius-honeydew — Honeydew ranching depth for the garden ant (Stage 3, Opus)

## Goal
Deepen the reference species' signature economy beyond basic herd tending: relaying honeydew, relocating aphids to better host points, claiming and defending herds against predators and rivals, and the optional soil shelters and root herds the design lists.

## Read in full
GDD 07 (`docs/design/gdd/07-species.md`): the honeydew-ranching module in full (tender behaviour, honeydew relay, aphid relocation, seasonal cycle summary, shelters and root herds marked as low-priority Tier 3, the night/scale-insect variant for the carpenter ant). GDD 05: herds, predators of aphids, herd claims. The existing `src/sim/ecology/plants/**` and the `tend` behaviours. Digests 07, 05.

## You own
`src/sim/species/modules/honeydew/**` (registered through the species module registry), constants in `src/sim/balance/species-honeydew.ts`.

## Deliverables
1. Relay: tenders hand honeydew to carriers near the herd when the chapter's conditions hold.
2. Relocation: carrying live aphids to new host points to found or reinforce herds, with limits and costs.
3. Claims and defence: herd ownership per colony, guards posted, response to ladybirds, lacewing larvae and rival tenders.
4. The Tier 3 extras in priority order as far as the chapter specifies them (shelters over herds, root herds), each behind its own constant so it can be disabled.
5. Diagnostics (`diag-herds`, `diag-ln-*`) and codex/milestone events.

## Acceptance criteria
1. Typecheck and tests green; pure simulation code.
2. Headless scenarios: with relocation enabled a colony increases its number of productive herds over a season within the chapter's limits; guarded herds lose fewer aphids to ladybirds than unguarded ones by a clear margin; relay raises honeydew intake per tender per the chapter.
3. Disabling each extra leaves the base herd economy unchanged.
4. The 28-day soak holds all invariants.
