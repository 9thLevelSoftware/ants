// Applies the preset's shadow settings to a directional sun light (the lighting renderer owns the light; this keeps
// map size, frustum and biases consistent with the quality preset). Distances in mm.
import type { DirectionalLight } from 'three';
import type { QualityPreset } from './quality';

export function configureSunShadow(light: DirectionalLight, q: QualityPreset, bu: number): void {
  light.castShadow = q.shadows.enabled;
  if (!q.shadows.enabled) {
    // the map's render target stays allocated until freed: a switch to a no-shadow preset gives it back
    light.shadow.map?.dispose();
    light.shadow.map = null;
    return;
  }
  const ext = q.shadows.distanceBU * bu;
  if (light.shadow.mapSize.x !== q.shadows.mapSize) {
    light.shadow.mapSize.set(q.shadows.mapSize, q.shadows.mapSize);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }
  const c = light.shadow.camera;
  c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext;
  c.near = 0.5 * bu;
  c.far = ext * 4;
  c.updateProjectionMatrix();
  // biases scale with the texel size in mm (tech-stack spike: normalBias 0.25 mm at 660 mm / 2048 px)
  const texel = (2 * ext) / q.shadows.mapSize;
  light.shadow.normalBias = texel * 0.8;
  light.shadow.bias = -0.0004;
}
