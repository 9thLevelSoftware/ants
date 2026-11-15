# Task combat — Fighting: damage, grapples, acid, alarm recruitment, and the fight/patrol behaviours (Stage 2, Opus)

## Goal
Ant-versus-ant and ant-versus-creature combat exactly as the design specifies: health and damage by caste and size, bite and grapple locks, acid spray, outnumbering, alarm recruitment, retreat, injuries, corpses — identical for autonomous ants and the possessed ant.

## Read in full
GDD 05 (`docs/design/gdd/05-ecology-rivals-combat.md`) section 4 (combat rules with numbers: stats formula, engage test, bite/hold/pin, acid cone and charges, dodge, outnumbering multipliers, alarm radii and thresholds, retreat thresholds, injuries and recovery, corpses, what the possessed ant can do, stance and rally modes). GDD 01 §7: the `bite`, `bite-hold`, `spray-acid`, `release-alarm`, `dodge` primitives (their lifecycle already exists in the action library; you supply the effects). GDD 02: `guard`, `patrol`, `fight`, `flee` state machines and alarm constants. Digests 05, 01, 02.

## You own
`src/sim/combat/**`, `src/sim/ants/behaviours/outdoor/{fight,patrol}*.ts` (register through the outdoor behaviours index — only your registration lines, reported), constants in `src/sim/balance/combat.ts`.

## Boundaries
The action library calls your functions for effects (`applyDamage`, `beginGrapple`, `releaseGrapple`, spray resolution): keep those signatures. Rival colony strategy (wars, raids) is the `rivals` task; creature attack patterns are the `creatures` task — both call your damage functions.

## Deliverables
1. Stats from mass and caste (the chapter's formulas), hit resolution, grapple locks with slots, pinning, outnumbering multipliers, acid spray cone with charges and regeneration, dodge window, alarm level and recruitment, injuries and recovery, death and corpse creation with cause.
2. Engage/retreat decision helpers (the chapter's engage test, retreat thresholds, stance directive, rally markers' defend/attack modes).
3. `fight` and `patrol` behaviours; the combat branch of `guard`; fleeing when outmatched.
4. Combat diagnostics and events (losses by cause, fights in progress) and cue events for effects and sound.

## Acceptance criteria
1. Typecheck and tests green; pure simulation code.
2. Duel tables: worker vs worker, major vs minor, 3 vs 1, with and without acid, produce win rates and durations inside the chapter's stated ranges over 500 seeded trials each (report).
3. A grapple immobilises both parties per the rules; a pinned ant takes the stated multiplier; releasing works; death while grappled frees the partner.
4. Alarm released in a fight recruits nestmates within the stated radius and time; alarm decays with the stated half-life.
5. The possessed ant's bite, hold, spray and dodge produce the same state changes as an autonomous ant's.
6. Retreat thresholds and stance are honoured; corpses appear as items with the right nutrients.
7. Determinism; plain-data state.

## Addendum (integrator)
- State of the code you build on (read before designing): locomotion stalls are fixed; `load-crop`, `unload-crop`, `feed-queen`, `assist-eclosion`, `cannibalise` are action primitives; the behaviour runner has a `delivering` hook (deliver first on task change); the creature simulation exists (`src/sim/ecology/creatures/**`, read its README: it lists the exact combat calls and fields it relies on — `applyDamage`, `releaseGrapple`, `raiseAlarm`, `noteCreatureHit`, `preyEvades`, `creatureKilled`, stun/seize fields — and the queries it offers: `threatsNear`, `preyNear`, `knownHazardsNear`, `dangerAt`); world population provides food anchors, plant host points (`PlantPlacement.hostPoiIds`), aphid-herd anchors, territories and rival sites; the progression engine consumes events (read `src/sim/progression` for the event ids it waits for from your module and emit them); the audio system maps cue ids that wait for emitters (`src/audio/README.md`): emit exactly those ids, and give the `bite` cue a strength equal to target hardness.
- A reviewer and a fix engineer are working in `src/sim/ants/**` and `src/sim/locomotion/**` right now: keep your edits there to the files this spec names plus one registration line, re-read a shared file immediately before editing it, and report the line you added.
- Tests: about 20 s per file on an idle machine, at most 3 seeds; large sweeps (500-trial duel tables, multi-day runs) behind `FOUNDRESS_LONG=1`, run once for your report.
