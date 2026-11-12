// Test doubles for module tests: simple stand-ins for services owned by other modules.
// (The geometric services need none: tests use the real kernel through makeTestSim / createKernel.)
export { fakeNavGrid } from './navGrid';
export { fakePheromoneField } from './pheromones';
