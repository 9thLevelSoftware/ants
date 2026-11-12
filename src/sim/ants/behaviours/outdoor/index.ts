// Outdoor behaviours (owner: beh-forage): scout, forage, tend (Tier 1 static honeydew sites) and flee, plus the
// perception system and the colony-level observers (trail-established, trail-lost, marker-response).
// The behaviour runner (src/sim/ants/behaviourRunner.ts) looks them up by task through sim.behaviours.
//
// How it fits together:
//   perception (src/sim/ants/perception) -> percept in ant.bb, read by the phases
//   engine.ts      one state machine for scout / forage / tend: interrupts, then the phase's think
//   transitions.ts phase entries (state names, decision log, first locomotion request)
//   phase*.ts      the phases: in-nest (wait, rest, ration, deliver), travel (outbound, search, queue, return),
//                  collect, scout (depart, explore, investigate)
//   choice.ts      which known source to go to (GDD 02 §5.5), depleted memory
//   routes.ts      route learning (§9.3); trail.ts trail laying (§8.3); flee.ts / fleeTask.ts (§10.12)
//   monitor.ts     events derived from the colony's trails and markers; transport.ts Tier 2 hook (§11)

import type { Behaviour, System } from '@/sim/types';
import { perceptionSystem } from '@/sim/ants/perception';
import { makeBehaviour } from './engine';
import { fleeBehaviour } from './fleeTask';
import { FORAGE, SCOUT, TEND } from './flavours';
import { markerResponseSystem, trailMonitorSystem } from './monitor';

export const behaviours: Behaviour[] = [makeBehaviour(SCOUT), makeBehaviour(FORAGE), makeBehaviour(TEND), fleeBehaviour];

/** Extra systems of these behaviours (e.g. perception); src/sim/ants/index.ts adds them to the module's systems. */
export const systems: System[] = [perceptionSystem, trailMonitorSystem, markerResponseSystem];

export { requestFlee } from './flee';
export { setTransportHook, type TransportHook } from './transport';
export { FORAGE, SCOUT, TEND, type Flavour } from './flavours';
export { K as OUTDOOR_KEYS, PHASE as OUTDOOR_PHASE } from './keys';
