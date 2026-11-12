// Map boundary (GDD 04 §14, render-integration): skirt, backdrop silhouettes, edge haze, and the edge glyph hook.
export { BoundaryRenderer, type BoundaryStats } from './boundaryRenderer';
export { alongEdge, buildSkirt, rowLevels, skirtRows } from './skirt';
export { makeSkirtHeight, outsideDistance, reflectInto, terrainMaxInRect, terrainPlaneAt, withinOneCell } from './skirtHeight';
export { buildBackdrop, edgeRuns, sides, type EdgeTreatment, type EdgeRun } from './backdrop';
export { edgeGlyphActive } from './edgeGlyph';
export * as boundaryTuning from './tuning';
