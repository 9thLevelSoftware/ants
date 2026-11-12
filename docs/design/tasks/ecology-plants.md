# Task ecology-plants — Honeydew herds, nectar and the plant side of ecology (Stage 2, Opus)

## Goal
Living, renewable food on plants: aphid (and other honeydew-producer) herds that grow, yield honeydew when tended, need protection and follow a seasonal cycle; nectar on flowers and extrafloral nectaries; and the `tend` behaviour's herd branch.

## Read in full
GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`): honeydew herds (growth, yield per tending visit, tending need, tender slots, predators' effect, ants defending or moving aphids, seasonal cycle, host decline), nectar sources and their daily/seasonal rhythm. GDD 07: the honeydew-ranching module's ant-side rules for *Lasius niger* that are marked Tier 2 (tender behaviour, relay) — the deeper Tier 3 parts (relocation, shelters, root herds) belong to a later task. GDD 02: `tend` state machine. Digests 05, 07, 02 for navigation.

## You own
`src/sim/ecology/plants/**`, `src/sim/ants/behaviours/outdoor/tendHerd*.ts` (registered through the outdoor behaviours index — add only your registration line there and report it), constants in `src/sim/balance/ecology.ts` (plants section).

## Boundaries
Aphid predators (ladybirds, lacewing larvae) are the `creatures` task: expose `herdDamage(herdId, amount)` and herd queries for it. Sources API (`harvest`) stays the sources module's; herds present themselves as sources through its runtime-creation functions.

## Deliverables
1. `PlantState` and `Herd` dynamics on host plants from the world's host assignments: logistic growth by season and host condition, honeydew buffer and yield per tending visit, untended decline, tender slots, discovery, events.
2. Nectar: flower and nectary sources with their rhythm, depletion and refill.
3. The herd branch of `tend`: travel along the plant's climb route, solicit (the `tend-aphid` primitive now has a real effect), guard the herd, relay honeydew home.
4. Diagnostics inputs (`diag-herds`) and codex/milestone events (first herd tended).

## Acceptance criteria
1. Typecheck and tests green; pure simulation code.
2. Herd growth, yield and seasonal curve match GDD 05's tables (table-driven tests on the default year and with season lengths 5 and 10).
3. Headless scenario: a colony with 60 workers next to two host plants establishes tending; honeydew intake per game day is within the chapter's range; an untended herd declines as specified.
4. Tenders reach herds on stems via climb routes and return (no stuck ants over 3 game days).
5. Determinism; plain-data state.
