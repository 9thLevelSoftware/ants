// `auto` quality: pick a preset from the unmasked renderer string and a short startup benchmark. Pure: the
// benchmark itself (benchmark.ts) measures, this decides.
import type { QualityId } from './quality';

export interface GpuProbe {
  /** UNMASKED_RENDERER_WEBGL (or the masked renderer string when the extension is missing). */
  renderer: string;
  /** Milliseconds per frame of the startup benchmark scene at the benchmark resolution; NaN if it did not run. */
  benchMs: number;
  maxTextureSize: number;
}

export type GpuClass = 'software' | 'mobile' | 'integrated' | 'discrete' | 'unknown';

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|mesa offscreen/i;
const MOBILE = /adreno|mali|powervr|apple gpu|immortalis|xclipse/i;
const INTEGRATED = /intel|uhd graphics|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|apple m\d/i;
const DISCRETE = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|arc a\d/i;

export function classifyGpu(renderer: string): GpuClass {
  if (SOFTWARE.test(renderer)) return 'software';
  if (MOBILE.test(renderer)) return 'mobile';
  if (DISCRETE.test(renderer)) return 'discrete';
  if (INTEGRATED.test(renderer)) return 'integrated';
  return 'unknown';
}

/** Benchmark thresholds (ms per frame of the benchmark scene) for each preset. */
export const AUTO_BENCH_MS = { ultra: 2.5, high: 5, medium: 10 } as const;

/** Ceiling per GPU class: integrated laptops target Medium (seed: 60 fps at Medium). */
const CLASS_CAP: Record<GpuClass, QualityId> = { software: 'low', mobile: 'low', integrated: 'medium', discrete: 'ultra', unknown: 'high' };

const ORDER: QualityId[] = ['low', 'medium', 'high', 'ultra'];

export function pickQuality(p: GpuProbe): { id: QualityId; gpu: GpuClass; reason: string } {
  const gpu = classifyGpu(p.renderer);
  const cap = CLASS_CAP[gpu];
  let fromBench: QualityId = 'medium';
  if (Number.isFinite(p.benchMs)) {
    fromBench = p.benchMs <= AUTO_BENCH_MS.ultra ? 'ultra' : p.benchMs <= AUTO_BENCH_MS.high ? 'high' : p.benchMs <= AUTO_BENCH_MS.medium ? 'medium' : 'low';
  }
  if (p.maxTextureSize > 0 && p.maxTextureSize < 4096 && ORDER.indexOf(fromBench) > 0) fromBench = 'low';
  const id = ORDER[Math.min(ORDER.indexOf(fromBench), ORDER.indexOf(cap))];
  return { id, gpu, reason: `gpu=${gpu} bench=${Number.isFinite(p.benchMs) ? p.benchMs.toFixed(1) + 'ms' : 'n/a'} cap=${cap}` };
}
