// The opening sequence: founding queen to first workers (GDD 06 §5; task docs/design/tasks/founding.md).
// One system (`foundingSystem`, colony module, `queen` phase) and the opening's command handlers, plus read-only
// helpers for the game flow, the UI and tests. Registered by src/sim/colony/index.ts.

export { foundingSystem, runFounding } from './system';
export { foundingCommandHandlers } from './commands';
export { foundingView, foundingBites, foundingPhaseAgeGd, type FoundingView } from './view';
export { assessSite, coverAt, footTrafficAt, deepMoisture, type SiteReading } from './siteAssess';
export {
  coverFactor, diggabilityFactor, exposureFactor, factorWord, floodSafetyFactor, moistureFactor, rivalScentFactor,
  siteProfile, siteQuality, siteWordOf, warmthFactor, type CoverKind,
} from './siteScore';
export {
  colonyBaseHazardPerGd, devTimeGd, forecast, forecastReserves, foundingMu, modelStats, runModel,
  type Forecast, type ModelParams, type ModelRun, type ModelStats,
} from './model';
export { desiccationBase, desiccationRate, reserveDrainPerGd } from './exposure';
export { failCauseOf } from './failure';
export { foundingNest, foundingQueen, openingOf } from './access';
export { cavityEntrances } from './dig';
