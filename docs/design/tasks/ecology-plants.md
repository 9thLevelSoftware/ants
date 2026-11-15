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

## Addendum (integrator)
- State of the code you build on (read before designing): locomotion stalls are fixed; `load-crop`, `unload-crop`, `feed-queen`, `assist-eclosion`, `cannibalise` are action primitives; the behaviour runner has a `delivering` hook (deliver first on task change); the creature simulation exists (`src/sim/ecology/creatures/**`, read its README: it lists the exact combat calls and fields it relies on — `applyDamage`, `releaseGrapple`, `raiseAlarm`, `noteCreatureHit`, `preyEvades`, `creatureKilled`, stun/seize fields — and the queries it offers: `threatsNear`, `preyNear`, `knownHazardsNear`, `dangerAt`); world population provides food anchors, plant host points (`PlantPlacement.hostPoiIds`), aphid-herd anchors, territories and rival sites; the progression engine consumes events (read `src/sim/progression` for the event ids it waits for from your module and emit them); the audio system maps cue ids that wait for emitters (`src/audio/README.md`): emit exactly those ids, and give the `bite` cue a strength equal to target hardness.
- A reviewer and a fix engineer are working in `src/sim/ants/**` and `src/sim/locomotion/**` right now: keep your edits there to the files this spec names plus one registration line, re-read a shared file immediately before editing it, and report the line you added.
- Tests: about 20 s per file on an idle machine, at most 3 seeds; large sweeps (500-trial duel tables, multi-day runs) behind `FOUNDRESS_LONG=1`, run once for your report.
