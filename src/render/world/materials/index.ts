// Shared world material library: definitions per MaterialId, texture sets, surface shader patch, shared uniforms.
export * from './materialDefs';
export * from './materialLibrary';
export * from './surfacePatch';
export * from './uniforms';
export * from './textureArray';
export { proceduralPixels, type PixelSet } from './procedural';
export { GLSL_NOISE, GLSL_TRIPLANAR, GLSL_WET } from './glsl';
