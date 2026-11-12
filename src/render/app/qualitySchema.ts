// Runtime validation of a QualityPreset (presets are data; Settings overrides and future tuning must stay valid).
import type { QualityPreset } from './quality';

type Check = [path: string, ok: boolean];

const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const bool = (v: unknown) => typeof v === 'boolean';

/** Returns a list of problems (empty = valid). */
export function validatePreset(p: QualityPreset): string[] {
  const c: Check[] = [
    ['id', typeof p.id === 'string'],
    ['resolutionScale', num(p.resolutionScale, 0.25, 1)],
    ['maxPixelRatio', num(p.maxPixelRatio, 0.5, 4)],
    ['dynamicResolution.enabled', bool(p.dynamicResolution?.enabled)],
    ['dynamicResolution.targetFps', num(p.dynamicResolution?.targetFps, 15, 240)],
    ['dynamicResolution.minScale', num(p.dynamicResolution?.minScale, 0.25, 1)],
    ['dynamicResolution.maxScale', num(p.dynamicResolution?.maxScale, 0.25, 1) && p.dynamicResolution.maxScale >= p.dynamicResolution.minScale],
    ['msaa', bool(p.msaa)],
    ['shadows.enabled', bool(p.shadows?.enabled)],
    ['shadows.mapSize', num(p.shadows?.mapSize, 128, 8192) && Number.isInteger(Math.log2(p.shadows.mapSize))],
    ['shadows.distanceBU', num(p.shadows?.distanceBU, 1, 10000)],
    ['shadows.type', ['basic', 'pcf', 'vsm'].includes(p.shadows?.type)],
    ['post.enabled', bool(p.post?.enabled)],
    ['post.dof.enabled', bool(p.post?.dof?.enabled)],
    ['post.dof.bokehScale', num(p.post?.dof?.bokehScale, 0, 10)],
    ['post.dof.resolutionScale', num(p.post?.dof?.resolutionScale, 0.1, 1)],
    ['post.dof.rangeK', num(p.post?.dof?.rangeK, 0.01, 10)],
    ['post.bloom.enabled', bool(p.post?.bloom?.enabled)],
    ['post.bloom.intensity', num(p.post?.bloom?.intensity, 0, 10)],
    ['post.bloom.threshold', num(p.post?.bloom?.threshold, 0, 10)],
    ['post.bloom.smoothing', num(p.post?.bloom?.smoothing, 0, 1)],
    ['post.bloom.levels', num(p.post?.bloom?.levels, 1, 10) && Number.isInteger(p.post.bloom.levels)],
    ['post.bloom.radius', num(p.post?.bloom?.radius, 0, 1)],
    ['post.vignette.enabled', bool(p.post?.vignette?.enabled)],
    ['post.vignette.offset', num(p.post?.vignette?.offset, 0, 1)],
    ['post.vignette.darkness', num(p.post?.vignette?.darkness, 0, 1)],
    ['post.smaa.enabled', bool(p.post?.smaa?.enabled)],
    ['post.smaa.preset', ['low', 'medium', 'high', 'ultra'].includes(p.post?.smaa?.preset)],
    ['density.grass', num(p.density?.grass, 0, 2)],
    ['density.litter', num(p.density?.litter, 0, 2)],
    ['density.decor', num(p.density?.decor, 0, 2)],
    ['density.crowdLod', num(p.density?.crowdLod, 0, 2)],
    ['anisotropy', num(p.anisotropy, 1, 16) && Number.isInteger(p.anisotropy)],
    ['drawDistanceBU', num(p.drawDistanceBU, 10, 100000)],
    ['fog.enabled', bool(p.fog?.enabled)],
    ['fog.hazeScale', num(p.fog?.hazeScale, 0.1, 10)],
    ['renderOnDemand', bool(p.renderOnDemand)],
    ['maxTextureSize', num(p.maxTextureSize, 0, 16384)],
  ];
  const problems = c.filter(([, ok]) => !ok).map(([path]) => path);
  // a post chain with nothing enabled is allowed (tone mapping still runs), but DoF needs a bokeh scale
  if (p.post?.dof?.enabled && !(p.post.dof.bokehScale > 0)) problems.push('post.dof.bokehScale must be > 0 when DoF is on');
  return problems;
}
