// World generator entry point (GDD 04 §4): params + seed -> WorldData, deterministic (same params and generator
// version give the same fingerprint on any machine, in Node or a browser, in a worker or the main thread).
// Placement kit for content modules: src/worldgen/kit (README.md there). Worker entry: src/worldgen/worker.

import type { WorldData, WorldParams } from '@/sim/types';
import { generateWorldReport, type GenerateOptions, type WorldgenProgress } from './pipeline';

export * from './params';
export { generateWorldReport, DEFAULT_MODULE } from './pipeline';
export type { GenerateOptions, WorldgenProgress, WorldgenReport } from './pipeline';
export { worldFingerprint } from './fingerprint';

/** Generates the static world. `onProgress` receives the step, the overall fraction 0..1 and the attempt. */
export function generateWorld(params: WorldParams, onProgress?: (p: WorldgenProgress) => void, opts: Omit<GenerateOptions, 'onProgress'> = {}): WorldData {
  return generateWorldReport(params, { ...opts, onProgress }).world;
}
