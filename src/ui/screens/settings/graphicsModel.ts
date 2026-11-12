// What the Graphics controls show: the player's override when set, otherwise what the preset does (GDD 08 7.4).
import { getPreset, type GraphicsOverrides, type QualityId, type QualitySetting } from '@/render/app/quality';

export interface EffectiveGraphics {
  resolutionScale: number;
  dynamicResolution: boolean;
  targetFps: 30 | 60;
  depthOfField: 'off' | 'subtle' | 'full';
  haze: boolean;
  shadows: 'off' | 'low' | 'high';
  density: number;
}

export function effectiveGraphics(quality: QualitySetting, o: GraphicsOverrides): EffectiveGraphics {
  const id: QualityId = quality === 'auto' ? 'medium' : quality;
  const p = getPreset(id);
  const dofOn = p.post.enabled && p.post.dof.enabled;
  return {
    resolutionScale: o.resolutionScale ?? p.resolutionScale,
    dynamicResolution: o.dynamicResolution ?? p.dynamicResolution.enabled,
    targetFps: o.targetFps ?? (p.dynamicResolution.targetFps >= 45 ? 60 : 30),
    depthOfField: o.depthOfField ?? (dofOn ? 'full' : 'off'),
    haze: o.haze ?? p.fog.enabled,
    shadows: o.shadows ?? (p.shadows.enabled ? (p.shadows.mapSize >= 2048 ? 'high' : 'low') : 'off'),
    density: Math.min(1, o.density ?? p.density.grass),
  };
}
