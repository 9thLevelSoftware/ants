// SimEvent: typed union with a `type` discriminant (contracts guidance §8). Events are queued during a tick
// and delivered after it, in order, through `sim.events` (EventBus<SimEventMap>). Payload = the whole object.

import type { EventMapOf } from '@/core/events';
import type { ColonyEvent, LifecycleEvent, PossessionEvent } from './eventsColony';
import type { EcologyEvent, RivalCombatEvent, SpeciesEvent } from './eventsEcology';
import type { NestEvent } from './eventsNest';
import type { FlowEvent, ProgressionEvent } from './eventsProgression';
import type { TimeWeatherEvent, WorldEvent } from './eventsWorld';

export type * from './eventsColony';
export type * from './eventsEcology';
export type * from './eventsNest';
export type * from './eventsProgression';
export type * from './eventsWorld';

export type SimEvent =
  | LifecycleEvent
  | PossessionEvent
  | ColonyEvent
  | NestEvent
  | WorldEvent
  | TimeWeatherEvent
  | EcologyEvent
  | RivalCombatEvent
  | SpeciesEvent
  | FlowEvent
  | ProgressionEvent;

export type SimEventType = SimEvent['type'];
export type SimEventOf<K extends SimEventType> = Extract<SimEvent, { type: K }>;
export type SimEventMap = EventMapOf<SimEvent>;
