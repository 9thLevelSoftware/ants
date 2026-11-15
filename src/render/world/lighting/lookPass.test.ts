// Look-pass lighting: the camera-side fill exists only underground (the founding queen read as a black silhouette
// in her chamber), and the sun's shadow biases are millimetres, not a fraction of a 10 m frustum (a 4 mm depth
// bias detached every pebble's and toy's shadow from its base).
import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { getPreset, type QualityId } from '@/render/app';
import { SHADOW_BIAS_TEXELS, UNDERGROUND } from './constants';
import { LightingRig } from './lightingRig';
import { computeLighting, type LightingInput } from './timeOfDay';

const input = (under: number): LightingInput => ({
  sunDir: new Vector3(0, 0.8, 0.6), sunElevDeg: 53, moonDir: new Vector3(0, 0.6, -0.8), moonIllum: 1,
  weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn', bu: 4, under, hazeScale: 1,
});

describe('underground sense fill', () => {
  it('is off on the surface and on underground, eased with the underground blend', () => {
    expect(computeLighting(input(0)).fillIntensity).toBe(0);
    expect(computeLighting(input(1)).fillIntensity).toBeCloseTo(UNDERGROUND.fillRel);
    expect(computeLighting(input(0.5)).fillIntensity).toBeCloseTo(UNDERGROUND.fillRel / 2);
  });

  it('the rig keeps the fill light in the scene (no program recompiles) and aims it from the camera side', () => {
    const rig = new LightingRig(getPreset('high'), 4);
    rig.apply(computeLighting(input(0)), new Scene(), true);
    expect(rig.fill.intensity).toBe(0);
    expect(rig.fill.castShadow).toBe(false);
    rig.apply(computeLighting(input(1)), new Scene(), true);
    expect(rig.fill.intensity).toBeGreaterThan(0);
    const subject = new Vector3(100, 0, 100), view = new Vector3(0, -0.3, 1).normalize();
    rig.follow(subject, view, new Vector3(0, 1, 0));
    const toLight = rig.fill.position.clone().sub(rig.fill.target.position).normalize();
    expect(toLight.dot(view)).toBeLessThan(-0.5); // the light comes from behind the subject, where the camera is
    rig.dispose();
  });
});

describe('sun shadow biases', () => {
  it.each(['low', 'medium', 'high', 'ultra'] as QualityId[])('are sub-millimetre at %s', (id) => {
    const q = getPreset(id);
    const rig = new LightingRig(q, 4);
    const cam = rig.key.shadow.camera;
    const depthMm = -rig.key.shadow.bias * (cam.far - cam.near);
    const texel = (2 * q.shadows.distanceBU * 4) / q.shadows.mapSize;
    expect(depthMm).toBeCloseTo(SHADOW_BIAS_TEXELS * texel, 6);
    expect(depthMm).toBeLessThan(1);
    expect(rig.key.shadow.normalBias).toBeLessThan(1);
    rig.dispose();
  });
});
