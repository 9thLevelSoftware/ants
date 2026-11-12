// Persistence of the pure simulation part (architecture §7). The game layer owns meta, gzip, IndexedDB, export.
export { snapshot, restore } from './snapshot';
export { stateHash } from './hash';
export { migrateState, type Migration } from './migrate';
export { SAVE_VERSION, MIN_SAVE_VERSION } from './version';
