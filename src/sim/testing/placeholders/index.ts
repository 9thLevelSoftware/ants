// Safe placeholder services used until the kernel / module tasks provide real implementations.
// (The carve grid needs none: the kernel's src/sim/nest/carve is used directly.)
export { createPlaceholderField } from './field';
export { createPlaceholderNestNav } from './nestNav';
export { createPlaceholderNavGrid } from './navGrid';
export { createPlaceholderPheromones, pheroChunkKey } from './pheromones';
