// Decor renderer (GDD 04 §9, §13): grass, draped decor, dew and water around the camera. Visual only.
export { DecorRenderer, type DecorFrame, type DecorLink } from './DecorRenderer';
export { GroundView } from './ground';
export { decorSeason, type DecorSeason } from './season';
export { drapeHeight, clipmapParams, drapeLayout } from './drape';
export { placeDraped } from './placement';
export { hashFloats, DRAPED_KIND, BLADE_STRIDE, DRAPED_STRIDE } from './instances';
export * as decorTuning from './tuning';
