// The opening sequence: founding queen to first workers (GDD 06 §5; task docs/design/tasks/founding.md).
// One system (`foundingSystem`, colony module, `queen` phase) and the opening's command handlers, plus read-only
// helpers for the game flow, the UI and tests. Registered by src/sim/colony/index.ts.

// entry.ts first: the registration objects exist before any import below can walk into the colony index
export { foundingCommandHandlers, foundingSystem } from './entry';
export { runFounding } from './system';
import './commands';
import './species/camponotus'; // species founding rules (species-carpenter)
export { foundingView, foundingBites, foundingPhaseAgeGd, type FoundingView } from './view';
export { assessSite, coverLevelAt, footTrafficAt, deepMoisture, topsoilMoisture, type SiteReading } from './siteAssess';
export { factorDots, factorWord, mapFactorsOf, siteProfile, siteQuality, siteWordOf, toptOf } from './siteScore';
/** The static map's moisture window factor (the read-out's moisture bar). */
export { moistFactor as moistureFactor } from '@/worldgen/maps/suitability';
export {
  colonyBaseHazardPerGd, devTimeGd, forecast, forecastReserves, foundingMu, modelStats, runModel,
  type Forecast, type ModelParams, type ModelRun, type ModelStats,
} from './model';
export { desiccationBase, desiccationRate, reserveDrainPerGd } from './exposure';
export { failCauseOf } from './failure';
export { foundingNest, foundingQueen, openingOf } from './access';
export { cavityEntrances } from './dig';
