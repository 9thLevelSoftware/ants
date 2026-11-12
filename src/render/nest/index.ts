// Nest renderer (render-nest): carve-grid meshes, underground look, cutaway, nest-space picking, ghost hooks.
export { NestRenderer, type NestFrame, type NestRenderContext, type NestStats } from './NestRenderer';
export { type NestCutawayParams, type CutMode, type CutPlane } from './cutaway/cutPlane';
export { patchSurfaceForCutaway } from './cutaway/surfaceCutPatch';
export { type NestGhost } from './ghosts';
export { type NestPick, type NestPickKind } from './picking';
export { type NestLook } from './lighting/undergroundLook';
export { nestSourceFromSim, type NestSource, type Opening } from './simAdapter';
export { NEST_LIGHT, NEST_LOOK, CUTAWAY, XRAY, GHOST_RENDER_ORDER, MESH_QUALITY } from './params';
