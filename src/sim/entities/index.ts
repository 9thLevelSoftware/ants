// Entity factories: the ONLY way entities are created or removed. Each allocates its id from state.nextId,
// fills every field with a sane default, registers it in its store and queues a lifecycle event.

export * from './context';
export * from './ants';
export * from './antStats';
export * from './brood';
export * from './items';
export * from './sources';
export * from './creatures';
export * from './colonies';
export * from './nests';
export * from './markers';
export * from './plants';
export * from './placement';
export { newAntMemory, newNavState, newWalker } from './walker';
export { applyInit, clonePlain } from './util';
