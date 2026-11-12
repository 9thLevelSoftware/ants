// FROZEN after task F1c: additive changes only (new optional fields, new union members appended, new helpers).
// Renames and removals need the orchestrator.
//
// Barrel for the shared simulation contracts. Import from '@/sim/types'.

export * from './ids';
export * from './geom';
export * from './refs';
export * from './walker';
export type { LocoRequest, LocoSpeedKind, NavScratch } from './navScratch';
export * from './ant';
export * from './brood';
export * from './item';
export * from './source';
export * from './plant';
export * from './creature';
export * from './nest';
export * from './marker';
export * from './colony';
export * from './colonyModules';
export * from './pheromone';
export * from './environment';
export * from './intent';
export * from './player';
export * from './diagnostics';
export * from './progression';
export * from './ecology';
export * from './world';
export * from './decor';
export * from './config';
export * from './species';
export * from './rivalSpecies';
export * from './commands';
export * from './commandsCheat';
export * from './events';
export * from './services';
export * from './moduleApi';
export * from './nurseryBoard';
export * from './state';
