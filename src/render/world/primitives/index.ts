// Solid primitives: parametric instanced geometry, buckets per material, dynamic add/remove/update.
export * from './primGeometry';
export * from './primInstances';
export { PrimitiveRenderer, PRIM_SIZE_CULL_K } from './primitiveRenderer';
export { PrimSet, type BatchDef, type PartitionView } from './primCells';
