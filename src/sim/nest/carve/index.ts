// Carve grid public API (kernel; see docs/design/tdd/02-kernel.md).
export * from './keys';
export * from './params';
export { createCarveGrid, type CarveGrid, type CarveChange, type CarveListener, type SubstrateProbe } from './grid';
export { type BrushOptions, type BrushResult, type DigPredicate } from './brushes';
export { recordBreach, pruneBreaches } from './breaches';
export { meshChunk, type ChunkMesh, type MeshOptions } from './mc';
export { EDGES, EDGE_AXIS, TRI_COUNT, TRI_EDGES, MAX_CASE_EDGES } from './mcTables';
