// Debug renderers: the fallback for every registry slot without a real renderer (src/render/index.ts).
import type { RendererSlot, SubRendererFactory } from '../index';
import { DebugAntsRenderer } from './debugAnts';
import { DebugCreaturesRenderer } from './debugCreatures';
import { DebugFxRenderer } from './debugFx';
import { DebugNestRenderer } from './debugNest';
import { DebugWorldRenderer } from './debugWorld';
import { nullHumansRenderer, nullWeatherRenderer } from '../slots/nullSlots';

export const DEBUG_RENDERERS: Record<RendererSlot, SubRendererFactory> = {
  world: () => new DebugWorldRenderer(),
  nest: () => new DebugNestRenderer(),
  ants: () => new DebugAntsRenderer(),
  creatures: () => new DebugCreaturesRenderer(),
  humans: nullHumansRenderer,
  weather: nullWeatherRenderer,
  fx: () => new DebugFxRenderer(),
};

export { DebugAntsRenderer, DebugCreaturesRenderer, DebugFxRenderer, DebugNestRenderer, DebugWorldRenderer };
export { interpolateWalker, poseMatrix, newPose, type PoseOut } from './pose';
