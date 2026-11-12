// Render application layer: renderer, quality presets, post chain, statistics, dynamic resolution.
export * from './quality';
export { validatePreset } from './qualitySchema';
export { classifyGpu, pickQuality, AUTO_BENCH_MS, type GpuClass, type GpuProbe } from './autoDetect';
export { runStartupBenchmark, rendererString } from './benchmark';
export { DynamicResolution, dynResConfig, DYNRES_DEFAULTS, type DynResConfig } from './dynamicResolution';
export { FrameStats, type FrameStatsSnapshot } from './frameStats';
export { PostChain, type PostHooks } from './postChain';
export { createRenderApp, type RenderApp, type RenderAppOptions, type FrameCallback } from './renderApp';
export { disposeObject, markMaterialsDirty } from './disposeObject';
export { parseRenderFlags, type RenderFlags } from './flags';
export { configureSunShadow } from './shadows';
