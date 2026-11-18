import { describe, expect, it } from 'vitest';
import { DirectionalLight, WebGLRenderTarget } from 'three';
import { configureSunShadow } from './shadows';
import { getPreset } from './quality';

describe('configureSunShadow', () => {
  it('frees the shadow map when a preset turns shadows off, and again allows a new one', () => {
    const light = new DirectionalLight();
    const map = new WebGLRenderTarget(1024, 1024);
    let disposed = 0;
    map.addEventListener('dispose', () => { disposed++; });
    light.shadow.map = map;
    configureSunShadow(light, getPreset('test'), 4);
    expect(light.castShadow).toBe(false);
    expect(disposed).toBe(1);
    expect(light.shadow.map).toBeNull();
    configureSunShadow(light, getPreset('low'), 4);
    expect(light.castShadow).toBe(true);
  });

  it('replaces the map when the map size changes', () => {
    const light = new DirectionalLight();
    light.shadow.mapSize.set(1024, 1024);
    const map = new WebGLRenderTarget(1024, 1024);
    light.shadow.map = map;
    let disposed = 0;
    map.addEventListener('dispose', () => { disposed++; });
    configureSunShadow(light, getPreset('medium'), 4);
    expect(disposed).toBe(1);
  });
});
