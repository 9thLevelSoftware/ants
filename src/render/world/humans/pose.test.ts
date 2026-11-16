import { describe, expect, it } from 'vitest';
import { planTime, samplePose, type ActorPose } from './pose';

const k = (t: number, x: number, lift: number, yaw = 0) => ({ t, x, y: 0, z: 0, yaw, lift });

describe('human actor pose', () => {
  const out: ActorPose = { x: 0, y: 0, z: 0, yaw: 0, lift: 0, u: 0 };
  it('is null outside the keys and exact on them', () => {
    const keys = [k(10, 0, 500), k(20, 100, 0), k(30, 100, 0)];
    expect(samplePose(keys, 5, out)).toBeNull();
    expect(samplePose(keys, 31, out)).toBeNull();
    expect(samplePose(keys, 20, out)!.lift).toBe(0);
    expect(samplePose(keys, 10, out)!.x).toBe(0);
  });
  it('eases between keys and interpolates yaw the short way', () => {
    const keys = [k(0, 0, 100, 3), k(10, 10, 0, -3)];
    const p = samplePose(keys, 5, out)!;
    expect(p.x).toBeCloseTo(5);
    expect(Math.abs(Math.abs(p.yaw) - Math.PI)).toBeLessThan(0.2);
    expect(samplePose(keys, 2, out)!.x).toBeLessThan(2); // smoothstep starts slow
    expect(samplePose(keys, 2, out, true)!.x).toBeCloseTo(2);
  });
  it('plan time follows the interpolated tick', () => {
    expect(planTime(101, 0.5, 90)).toBeCloseTo(10.5);
  });
});
