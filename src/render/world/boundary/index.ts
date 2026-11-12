// Map boundary (GDD 04 §14, render-integration): skirt, backdrop silhouettes, edge haze, and the edge glyph hook.
export { BoundaryRenderer, type BoundaryStats } from './boundaryRenderer';
export { buildSkirt, makeSkirtHeight, reflectInto, outsideDistance, skirtAxis } from './skirt';
export { buildBackdrop, edgeRuns, sides, type EdgeTreatment, type EdgeRun } from './backdrop';
export { edgeGlyphActive } from './edgeGlyph';
export * as boundaryTuning from './tuning';
