// Overwintering (GDD 06 §6; task overwinter-repro): the trigger sequence, the aggregate winter model, the Begin step
// and the Winter Report. Registered through src/sim/colony/index.ts.
export { overwinterSystem, overwinterCommandHandlers, begin as beginWinterNow, bannerAutoTicks } from './system';
export { runWinterModel, metFactor, dayNeedC, dayNeedP, type WinterInput, type WinterOutcome, type WinterParams } from './model';
export { beginOverwinter, winterParams, ticksToSpring, winterDaysLeft, heatedNest } from './begin';
export { clusterOf, winterClimate, type ClusterInfo, type WinterClimate } from './climate';
export { rankWhy, reportNumbers } from './report';
