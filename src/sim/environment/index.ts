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
export * from './wind';
export * from './envGuard';
export * from './weatherDraw';
export * from './queries';
export * from './system';
export * from './timeCommands';
export * from './noLag';

import { humanEventsSystem, commandHandlers as humanHandlers } from './human'; export { humanEventsSystem, humanForecast, humanRainRateAt, humanPlan, crushP } from './human'; // owner: human-events
import { environmentEffectsSystem, weatherEffectsHandlers } from './effects'; export { environmentEffectsSystem } from './effects'; export { moistureAtXZ, puddleDepthMm, surfaceWetness } from './moisture'; // owner: weather-effects

export const systems: readonly System[] = [
  calendarSystem, weatherSystem, antThermalSystem, skipSystem, humanEventsSystem, environmentEffectsSystem,
];

export { isExposed, isExposedAt } from './effectsExposure'; // owner: weather-effects (no overhead cover within 3 BU)

export const commandHandlers: Partial<CommandHandlerMap> = {
  ...timeHandlers,
  ...weatherEffectsHandlers, // owner: weather-effects (setSoilMoisture, setRain, setDrainScale, setWater)
  ...humanHandlers, // owner: human-events (cheat.humanEvent, cheat.setGrass)
};
