# Creatures (task `creatures`, GDD 05 §2)

Pure simulation of the other animals: prey, neutral fauna, aphid predators, ant predators, the bird event, the
creature director, the player colony's danger grid and the threat director's quiet share (I11).
Constants: `src/sim/balance/creatures.ts` (import it directly; it is not in the balance barrel).

## Files

| File | What |
| --- | --- |
| `index.ts` | systems (`creature-director` every 50 ticks, `creatures` every tick, phase `creatures`), public API, cheat handlers |
| `system.ts` | per-tick loop, kind table, deaths from hp <= 0, subduing, hit reactions |
| `director.ts` | residents / visitors from territories (nearest the colony first, far residents give way), despawning, caps, global cap 260, winter, hourly rolls |
| `colonyRange.ts` | colony-range residents (threats-live): after the hand-over, one territory per hunting kind with habitat in the ring `COLONY_RANGE_BU` around the player's first entrance, near the colony's routes (entrance -> food sources); `COLONY_RANGE_P` x Predators setting |
| `spawners.ts` | prey patches (+ regrowth), patch prey around foragers, fruit flies, caterpillars, fly larvae, stranded worms, pits |
| `attack.ts`, `predator.ts` | telegraph / strike / seize / venom / struggle; victim choice, flee, feed, recover |
| `spiders.ts`, `hunters.ts`, `antlion.ts`, `invasion.ts` | jumping & wolf spider; ant-spider, centipede, rove beetle; antlion pit; centipede nest raid |
| `aphidPredators.ts`, `preyFauna.ts`, `neutral.ts`, `bird.ts` | the other families and the bird event |
| `prey.ts` | remains (carcass item / tear source), transport rule, subduing |
| `queries.ts` | `threatsNear`, `preyNear`, `knownHazardsNear`, `creatureArmour`, `creaturePull` |
| `alerts.ts` | `predator-near` (warning; lurking near the possessed ant / 3 foragers, or a strike that landed on a player-colony ant; cleared 30 s after its condition ended or when the creature is gone), `nest-attacked` (critical; cleared 30 s after the last invader left), `possessed-danger` causes `seized` / `paralysed` (critical, per tick; a card another module raised for the same ant is left alone) |
| `danger.ts`, `threat.ts` | danger grid (nav cost overlay), threat director + quiet share |
| `hooks.ts`, `lifecycle.ts` | lazily installed locomotion hooks (movement override, speed factor) and event listeners |
| `ports.ts` | every external function called for an effect (tests swap them) |
| `testkit.ts`, `soakScene.ts` | test support only |

## States (`Creature.state`) and flags (`Creature.flags`, `CreatureFlag`)

- jumping-spider: `rest scan stalk windup hold feed recover flee`
- wolf-spider: `rest wander ambush orient freeze windup hold feed recover flee` (`freeze` = vibration cue, 1 s)
- ant-spider: `rest patrol approach windup wait collect carry feed recover flee`
- antlion: `wait drag feed rebuild collapsed` (pit hazard `state` mirrors it; flag DORMANT when <= 10 C / winter).
  A pit whose antlion is gone becomes `collapsed` with `untilTick` (fills in over ANTLION_EMPTY_PIT_FILL_GD) and is
  no longer slowing or a known hazard. Pits are placed only up to cap x Predators setting (I5).
- centipede: `prowl windup hold feed recover flee invade burrow`; rove-beetle: `forage windup hold feed recover flee burrow`
  (both hunt while night-active, rove beetles also by day in leaf litter (`ROVE_DAY_ZONES`); out of it and not engaged
  they burrow: gone at once far from the focus, after BURROW_S in state `burrow` near it)
- ladybird: `fly-in feed fly-off` (flag FLYING); ladybird-larva: `egg crawl feed drop-off wander`;
  lacewing-larva: `crawl feed`
- springtail / mite: `graze`; fly-larva: `feed burrow`; caterpillar: `feed crawl silk subdued` (ON_SILK, HAIRY);
  fruit-fly: `feed fly` (FLYING + HIDDEN between hops)
- woodlouse: `shelter wander graze roll` (CURLED); earthworm: `surface return dying`; snail: `graze wander retract cover`;
  millipede: `wander graze coil cover`
- any prey: `subdued` (SUBDUED). HIDDEN creatures are not drawn and not interactive.

A strike in progress: `bb.strikeAt` (tick), `bb.tgt` (ant id), `bb.aimX/Y/Z`; `predator-telegraph` carries them.
Stunned ants (ladybird reflex bleeding 2 s, caterpillar regurgitation 2 s, hairy caterpillar 3 s): their lock breaks,
`ant.bb['cr.stunUntil']` holds the end tick and `combat.biteCdTick` is pushed back to it (CombatState has no stun field).
Danger grid: misses and non-seizing hits count as survived strikes at once; a seizing strike is settled when the hold
ends (freed = survived, dead = killed, which needs another nestmate within 6 L). Avoid markers are rasterised over
their own bounding cells. Hazard speed factors (slime x0.7, pit upslope x0.4) apply only to ants outside the nest on
the hazard's surface (feet within HAZARD_SURFACE_TOL_BU). Patch prey for the possessed ant appears outside its front
cone (PATCH_POPIN_CONE_DEG). Bird rolls use p = BIRD_RATE / (daylight window hours) per hourly roll.
Bird variants: a sparrow eats up to 10 crumb units at landing; a woodpecker calls `nest.disturb(sim, entrance, 3 BU,
'woodpecker')` every 5 s (up to 6) - the carve itself is the nest module's hook.
The bird event is `state.ecology.birdEvent` (`phase` approach / landed / leaving, `pos`, `peckAim`), not an agent.

## Seams for other modules (report these when integrating)

- combat: call `noteCreatureHit(sim, creatureId, antId, 'bite' | 'spray' | 'sting')` once per hit on a creature
  (before or after applying its damage; hp lost within HIT_ATTRIBUTION_S of a report, e.g. 2 s of acid, belongs to
  that report; hp lost with no report at all is counted as one unreported bite);
  ask `preyEvades(sim, creatureId, antId)` before a bite; kill creatures with `creatureKilled(sim, id, antIds)`
  (not `killCreature`) so they become food; read `creatureArmour` / `creaturePull`. Damage this module deals goes
  through `combat.applyDamage(sim, 'ant', id, dmg, 'predation' | 'antlion' | 'bird')` and lets go with
  `combat.releaseGrapple`. Seized ants: `ant.combat.seizedBy`, `escape`; paralysed: `paralysedUntilTick`.
- player control: `addStruggleInput(sim, antId)` per struggle input (bites, specials and > 90 degree turns are also
  read from the recorded intent).
- perception (ants): `predatorPerceivedBy(sim, creature, ant)` is GDD 05 §2.4's AI detection (4 L x stealth by
  state; never hidden / dormant creatures or a buried antlion) - `ants/perception/sense.ts` flees only from these.
- behaviours: `threatsNear` (state word, telegraphed strikes, repel zones of secretions, the bird), `preyNear`,
  `knownHazardsNear` (avoid pit radius + 1 L), `dangerAt` (avoid markers count as 3); the danger grid also prices
  nav-grid cells. Seized ants (`combat.seizedBy`) and paralysed ants are moved by this module's movement override;
  behaviours should not act for them. Stunned ants (`bb['cr.stunUntil']`) should not bite.
- rivals: `requestMajorThreat(sim, kind)` / `endMajorThreat(sim, kind)` for raids (one major threat at a time, I11).
- nest: `disturb(sim, center, radius, cause)` with cause 'woodpecker' should carve the 3 BU sphere (GDD 05 §2.6).
- locomotion: flight is not simulated (ladybirds and fruit flies appear / hop; see the report); springtail jumps and
  antlion flicks are re-placements through `placeOnSurface` / the movement override.
