// Succession and the end of a colony (GDD 06 §13; task overwinter-repro): queen death, the orphan phase, extinction
// and retirement, the epitaph record. Registered through src/sim/colony/index.ts.
export { successionSystem, successionCommandHandlers, endColony } from './system';
export { buildEpitaph, type EpitaphData, type EpitaphGraph } from './epitaph';
export { lifecycleOf, playerCol, newLifecycleState } from './lifecycleState';
