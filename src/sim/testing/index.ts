// Test helpers for simulation modules (options documented at the top of testWorld.ts).
export { makeTestWorld, makeTestSim, type TestWorldOptions, type TestSimOptions } from './testWorld';
export { buildFeatures, TEST_FEATURES, type FeatureSet, type TestFeature } from './testFeatures';
export { installSmallNest, type SmallNest } from './testNest';
export { buildWorld, type WorldBuildSpec } from './worldBuilder';
export { fakeNavGrid, fakePheromoneField } from './doubles';
export { findNonPlain } from './plainData';
export { CORE_INVARIANTS, checkInvariants, collectInvariants, type InvariantViolation } from './invariants';
