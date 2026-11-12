// Environment API: calendar, time controls, weather, temperatures, light, moisture, human events.
// Owners: env-core (everything re-exported from the files below), weather-effects (effects, moisture, flooding),
// human-events (environment/human). Their two systems and command handlers stay stubs here until those tasks land;
// they replace the stub lines marked below.

import type { CommandHandlerMap, Sim, System } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { ENV_MOISTURE_EVERY, ENV_MOISTURE_OFFSET } from '@/sim/balance';
import { calendarSystem } from './calendar';
import { antThermalSystem } from './antThermal';
import { skipSystem, timeHandlers } from './timeCommands';
import { weatherSystem } from './system';

export * from './calendar';
export * from './climates';
export * from './light';
export * from './temperature';
export * from './surface';
export * from './soil';
export * from './microTemp';
export * from './chamber';
export * from './thermalResponse';
export * from './antThermal';
export * from './weather';
export * from './weatherStep';
export * from './weatherDraw';
export * from './queries';
export * from './system';
export * from './timeCommands';
export * from './noLag';

/** Human activity schedule, telegraphs, impacts. Stub: human-events. */
export const humanEventsSystem: System = { name: 'human-events', phase: 'environment', run: () => {} };
/** Soil moisture, puddles, flooding inputs, trail washing. Stub: weather-effects. */
export const environmentEffectsSystem: System = {
  name: 'environment-effects', phase: 'environment', every: ENV_MOISTURE_EVERY, offset: ENV_MOISTURE_OFFSET, run: () => {},
};

export const systems: readonly System[] = [
  calendarSystem, weatherSystem, antThermalSystem, skipSystem, humanEventsSystem, environmentEffectsSystem,
];

/** No overhead cover within 3 BU. Stub: false (weather-effects). */
export function isExposed(_sim: Sim, _p: Vec3): boolean {
  return false;
}

export const commandHandlers: Partial<CommandHandlerMap> = {
  ...timeHandlers,
  'cheat.setSoilMoisture': () => {}, // owner: weather-effects
  'cheat.setRain': () => {}, // owner: weather-effects
  'cheat.setDrainScale': () => {}, // owner: weather-effects
  'cheat.setWater': () => {}, // owner: weather-effects
  'cheat.humanEvent': () => {}, // owner: human-events
  'cheat.setGrass': () => {}, // owner: human-events
};
