// Ants, brood and carried items renderer (task render-ants). See AntRenderer.ts.
export { AntRenderer } from './AntRenderer';
export type { AntFrameInfo, AntRenderContext, AntRenderStats, PickTarget } from './frame';
export type { AntSimSource, AntView, BroodView, ItemView, ColonyView, SpeciesView } from './simAdapter';
export { lodSettingsFor, type AntLodSettings } from './tuning';
export { POSE_TARGETS, poseTarget } from './poses';
export { advanceGait, footTarget, newGaitState, type GaitState } from './gait';
export { buildAntVariant } from './geometry/buildAnt';
export { PART, type AntRig, type AntVariant } from './geometry/rig';
export { SPECIES_MORPHS, resolveMorph, morphCaste } from './morph/catalog';
export type { AntMorphology } from './morph/types';
