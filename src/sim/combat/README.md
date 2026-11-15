# Combat (task `combat`, GDD 05 §4)

Fighting between ants and between ants and creatures: stats, bites and hit resolution, grapple locks and pins,
outnumbering, acid spray, sting, dodge, alarm and recruitment, engage / retreat, injuries, deaths, combat alerts
and diagnostics. Constants: `src/sim/balance/combat.ts`. The `fight` and `patrol` behaviours live in
`src/sim/ants/behaviours/outdoor/{fight,fightTargets,patrol}.ts` and are registered by one line in that folder's
`index.ts`.

## Files

| File | What |
| --- | --- |
| `index.ts` | public API (`applyDamage`, `beginGrapple`, `releaseGrapple`, `raiseAlarm`, `engage`), the `combat` system, `cheat.combatFlags` |
| `system.ts` | per tick: alarm decay, acid / venom in progress, spray detection (`combat-spray`), lock upkeep (hold bites in shuffled order, breaks, stalemates), fight records and injuries, recruitment scans; rally, alerts and diagnostics on cadences |
| `stats.ts` | bite, bite cycle, pull, armour, special, retreat health per species / caste (§4.1) |
| `hits.ts` | bite resolution: hit chance, M(n), `combat-hit`, the `bite` cue at the target's hardness |
| `damage.ts` | armour, possessed-ant multiplier, hitter record, bitten alarm, death (corpse by the ant lifecycle), creature damage and kills |
| `grapple.ts` | locks, contact slots (tunnel cap), pins, lock-break odds |
| `movement.ts` | locomotion hooks: speed factors (holder x0.3, held target, disoriented, lost legs) and the movement override (contact, immobilised, dragged, dodge) |
| `acid.ts`, `sting.ts`, `dodge.ts` | spray resolution, the sting and dodge primitives (registered into the action library, see below) |
| `alarm.ts`, `recruit.ts`, `rally.ts` | alarm bursts and decay; hit reactions, encounter roll, alarm recruitment with cap; rally markers |
| `engage.ts` | attack roll (§3.6), θ_fight, recruit cap, retreat rule, stance, territory claim test |
| `fight.ts`, `fightRecord.ts`, `injuries.ts` | task switches into / out of `fight` and `flee`; the per-ant fight record; injury roll and recovery top-up |
| `alerts.ts`, `diagnostics.ts` | `queen-in-danger`, `possessed-danger` (pinned); `diag-combat-losses`, `combatSummary` |
| `attribution.ts` | finds the attacker of an action-library `bite` / `spray-acid` call that does not name it |
| `late.ts`, `wiring.ts` | late-bound calls into the ant actions, colony and guard modules (import-cycle hygiene, below) |
| `testkit.ts`, `duels.ts` | test support only (duel tables) |

## State (all plain data)

`Ant.hp/maxHp`, `acid`, `alarmLevel`, `injuries`, `combat: CombatState | null` (null outside fights) and ant.bb keys
with the prefix `cb.` (see `CB` in `state.ts`): fight record, hold-bite timer, shake timer, acid in progress, alarm
source, hit reaction, lost legs, dodge in progress, fight target / source / task to resume, rally, encounter
re-roll marks. Creatures carry `cb.acid*`, `cb.h.<antId>` (recent hitters), `cb.pin`, `cb.nh` in their bb. The
`cheat.combatFlags` switches are runtime only (a WeakMap per Sim): a reloaded game starts without them.

## Seams (report these when integrating)

- Action library: `bite` and `spray-acid` call `applyDamage(sim, kind, id, dmg, 'combat')` without the attacker;
  `attribution.ts` finds it exactly (the action system steps ants in list order). Proposed: pass `ant.id` as the
  new optional 6th argument, then the lookup is unused. `dodge` and `sting` have no shells in the library, so
  `installActionAdapters()` (dodge.ts) adds combat's definitions to `ACTION_DEFS` when absent, and replaces the
  `bite` entry by a copy without its strength-1 cue (combat emits `bite` with the target's hardness). A pinned or
  stunned ant's bite still starts (the shell does not ask combat) but deals nothing (`mayBite`).
- Creatures: bites, sprays and stings report through `noteCreatureHit`; `preyEvades` is asked before free bites
  and grabs; kills go through `creatureKilled`. Creature damage to ants comes in through `applyDamage` with
  causes `predation` / `bird` / `antlion` (armour and the possessed ant's `damageTakenMult` apply).
- Guard (nest behaviours): `registerGuardEngage` hook, installed per Sim on the first combat tick.
- Locomotion: `registerSpeedFactor`, `registerMovementOverride` (installed per Sim). The per-frame prediction of the
  possessed ant (`integratePossessed`) does not consult overrides; the tick pose wins.
- Rivals: `attackChance`, `retreatReason`, `startFight`, `engage`, `territoryAt`, `relationOf` (read); encounter
  display / withdraw, `rival-encounter` and escalation are the rivals module's.
- Import cycles: the creature ports import this module, so combat imports only light modules; `wiring.ts` binds
  the rest and is imported by the fight behaviour (every Sim loads it through the systems list).
