# Rivals (task `rivals`, GDD 05 §3)

Neighbouring colonies: an abstract population per rival (`Colony.rival`, hourly model), a budgeted number of real
agents (ordinary ants, flag `FIELDED`, task `raid`), a small real nest with queen(s) and display brood, territory
marks, relations and escalation, raids and brood raids, destruction and new foundations, and the threats to the
player's founding queen. Constants: `src/sim/balance/rivals.ts` (import it directly). Species numbers:
`src/sim/species/rivals.ts` (roster rows) and `src/sim/species/rivals/profiles.ts` (abstract-model profile of
every rival species, the four playable species included as conspecific rivals).

## Files

| File | What |
| --- | --- |
| `index.ts` | LIGHT public API: systems, `relationOf`, `isHostile`, `initRivals`, claim queries, `rivalSummary`, invariants, cheats |
| `late.ts`, `wiring.ts` | the heavy half bound late (combat imports this index; see "Import cycles") and the `raid` behaviour export |
| `state.ts` | module state (`state.rivals.module`), per-colony / per-pair records, territory slots, agent bb keys and jobs |
| `init.ts` | New Game: one abstract colony per world rival site, its nest record, slot and core marks |
| `setup.ts` | first rivals tick: nest carved by the nest module's template layout, queens, display brood (min(24, ceil(B/10))) |
| `model.ts` | the abstract model (pure): births, maturation, deaths, harvest, upkeep, caps, aggression, winter, strength |
| `env.ts` | season, day phase and the activity factor a |
| `territory.ts`, `claims.ts` | deposits (1 per ant-second on the surface), core deposit, decay, rain halving, hourly scan, claims |
| `relations.ts` | relation records, escalation gains (/ warThresholdMult), the state table (peace .. truce) |
| `hourly.ts` | the hourly update: marks, scan, model (+ virtual harvest drawn from real nodes), relations, raids, destruction, foundations, founding threat, diagnostic |
| `tick.ts` | per tick: setup, deaths, deposits, fielding pass and observers, the hard ant cap |
| `fielding.ts` | targets per job, the global budget by priority, emergence, recall, `enforceCap` (<= 2500 every tick) |
| `agents.ts` | spawn and absorb agents (absorption = removal without a death, load delivered, brood adopted) |
| `behaviour.ts`, `jobs.ts`, `raidJobs.ts`, `move.ts` | the `raid` task behaviour: rival jobs (forage, patrol, war, guard, defend, escort, return, queen, wander) and raiders (rival and player) |
| `encounter.ts` | recognition (+1 E per ant pair per 60 s), discovery, the ritual display and withdrawal |
| `watch.ts` | deaths (+3 E, N - 1), fight entries (+2 E, `rival-encounter` fight, reinforcements), stolen brood, nest knowledge, reclaiming agents |
| `raids.ts` | raid launches (war, R >= 2, nest known, cooldown, threat director), player rally raids, brood raids, end rules |
| `lifecycle.ts` | queens lost -> orphaned, destruction and aftermath, incipient first workers, new foundations |
| `founding.ts` | the sealed founding queen inside rival territory: dig-in roll and the diggers |
| `report.ts` | alerts `raid-seen`, `nest-attacked` (ants) and the `diag-rivals` diagnostic |
| `cheats.ts` | `cheat.setRival`, `cheat.setRelation`, `cheat.triggerRaid` |
| `testkit.ts` | test support only |

## Rival agents

Every ant of a rival colony has task `raid`; its job is `ant.bb['rv.job']` (`JOB` in `state.ts`). Combat moves an
agent into `fight` / `flee` and back (`raid` resumes with the job kept). A fielded agent re-entering its nest is
absorbed (`entity-removed` cause `absorbed`, no `ant-died`, no corpse). `N` counts every worker of the colony,
fielded ones included: deaths of agents subtract from N, absorption adds only the load. Player raid parties are
player workers switched to task `raid` (jobs `raid` / `brood`), handed back to the allocator at home.

## Seams (report these when integrating)

- Combat: `mayAttack` should consult `isHostile` (exported here; true for two different living colonies). The
  encounter ritual, escalation and `rival-encounter` are done from the rival agent's side (`encounter.ts`,
  `watch.ts`) because combat's encounter roll has no hook; a hook "encounter without attack" would let player
  ants display too.
- Nest: plans chambers only for the four playable species; a rival-only species is laid out with its profile's
  `templateSpecies` (the colony's species is swapped for the synchronous `carveTemplateNest` call).
- Entities: no "despawn" helper; `absorbAgent` marks the ant dead without `ant-died` (`life.noBody` set).
- Threat director: refuses every major threat while no daytime hour is counted (founding stage); `founding.ts`
  takes the slot directly in that case.
- Game debug API: `query.rivals` can return `rivalSummary(sim)`; `query.territory(pos)` can use `claimAt`.

## Import cycles

`combat/engage.ts` imports `relationOf` from this index, and the creature module imports combat, so this index
imports only types, balance, entities, species data and its own light files. The heavy files are reached through
`late.ts`, bound by `wiring.ts`, which the one registration line in `src/sim/ants/behaviours/outdoor/index.ts`
loads for every Sim.
