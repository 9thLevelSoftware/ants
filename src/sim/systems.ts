// The ordered system list (docs/03-architecture.md §3 tick order). The only shared registration point:
// modules export their systems; this list changes only by adding entries. Events are flushed by sim.tick()
// after the last system, and dead entities are swept just before that flush.

import type { System } from '@/sim/types';
import { commandsSystem } from '@/sim/commands';
import { calendarSystem, environmentEffectsSystem, humanEventsSystem, weatherSystem } from '@/sim/environment';
import { creatureDirectorSystem, creatureSystem, plantsSystem, sourcesSystem } from '@/sim/ecology';
import {
  allocationSystem, broodSystem, colonyStatsSystem, economySystem, foundingSystem, overwinterSystem, queenSystem,
  reproductionSystem,
} from '@/sim/colony';
import { actionSystem, behaviourSystem, lifecycleSystem, perceptionSystem, playerControlSystem } from '@/sim/ants';
import { locomotionSystem } from '@/sim/locomotion';
import { combatSystem } from '@/sim/combat';
import { architectSystem, nestSystem } from '@/sim/nest';
import { pheromoneSystem } from '@/sim/pheromones';
import { rivalsSystem } from '@/sim/rivals';
import { diagnosticsSystem, progressionSystem } from '@/sim/progression';

export const SYSTEMS: readonly System[] = [
  commandsSystem, //            commands                                   (F1b)
  calendarSystem, //            environment: time                          (env-core)
  weatherSystem, //             environment: weather                       (env-core)
  humanEventsSystem, //         environment: human events                  (human-events)
  environmentEffectsSystem, //  environment: moisture, puddles, washing     (weather-effects)
  sourcesSystem, //             ecology: sources                           (sources-core)
  plantsSystem, //              ecology: plants, herds                     (ecology-plants)
  allocationSystem, //          colony allocation                          (colony-core)
  queenSystem, //               queen / eggs                               (colony-core)
  foundingSystem, //            queen / founding sequence                  (founding)
  broodSystem, //               brood                                      (colony-core)
  perceptionSystem, //          perception                                 (beh-forage)
  behaviourSystem, //           ant behaviours                             (beh-forage, beh-nest)
  playerControlSystem, //       player control                             (actions)
  actionSystem, //              action primitives complete                 (actions)
  creatureDirectorSystem, //    creature AI: spawning within caps          (creatures)
  creatureSystem, //            creature AI                                (creatures)
  locomotionSystem, //          locomotion                                 (loco)
  combatSystem, //              combat                                     (combat)
  nestSystem, //                nest: carve ops, chambers, nav fields      (nestops)
  architectSystem, //           nest: architect                            (architect)
  pheromoneSystem, //           pheromones                                 (phero)
  economySystem, //             colony economy                             (colony-core)
  colonyStatsSystem, //         colony stats                               (colony-core)
  overwinterSystem, //          colony: overwintering                      (overwinter-repro)
  reproductionSystem, //        colony: alates, flights, succession         (overwinter-repro)
  rivalsSystem, //              rivals                                     (rivals)
  progressionSystem, //         progression: milestones, journal, stage    (progression)
  diagnosticsSystem, //         progression: diagnostics, alerts           (progression)
  lifecycleSystem, //           lifecycle: deaths, spawns                  (actions)
];
