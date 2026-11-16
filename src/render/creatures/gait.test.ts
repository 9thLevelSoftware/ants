// GDD 08 §11.9 "feet do not slide": every planted foot of every legged look keeps its place on the ground through
// the whole stance while the body walks (CPU replica of the shader's leg rule, gait.ts), legs stretch only a little,
// and the stride gives the median leg the look's designed swing.
import { describe, expect, it } from 'vitest';
import { cullBoundsOf } from './cullBounds';
import { footOffset, gaitWave, legFeet, legStrideMm } from './gait';
import { LOOKS } from './looks';

describe('leg gait: planted feet do not slide', () => {
  it('w(cyc) falls linearly from +1 to -1 in stance and returns continuously in the swing', () => {
    expect(gaitWave(0.25)).toBeCloseTo(1, 9);
    expect(gaitWave(0.5)).toBeCloseTo(0, 9);
    expect(gaitWave(0.75)).toBeCloseTo(-1, 9);
    expect(gaitWave(1.25)).toBeCloseTo(1, 9);
    for (let c = 0; c < 1; c += 0.01) expect(Math.abs(gaitWave(c + 0.001) - gaitWave(c))).toBeLessThan(0.01);
  });

  const legged = Object.entries(LOOKS).filter(([, def]) => {
    const g = def.build(1).body.toCreatureGeometry();
    return legFeet(g.getAttribute('aRig').array, g.getAttribute('aPivot').array, g.getAttribute('aFoot').array).length > 0;
  });

  it('the catalogue has legged looks (spiders, insects, woodlouse, myriapods, larvae)', () => {
    expect(legged.length).toBeGreaterThan(15);
  });

  for (const [key, def] of legged) {
    it(`${key}: every foot stays put through its stance; legs stretch <= 25 %`, () => {
      const g = def.build(1).body.toCreatureGeometry();
      const rig = g.getAttribute('aRig').array, piv = g.getAttribute('aPivot').array, foot = g.getAttribute('aFoot').array;
      const stride = cullBoundsOf(def).stride;
      expect(stride).toBeGreaterThan(0);
      if (def.motion.wave[3] === 0) expect(stride).toBeCloseTo(legStrideMm(rig, piv, foot, def.motion.leg[0] * (def.legAmp ?? 1)), 9);
      let worst = 0, stretch = 1;
      for (const f of legFeet(rig, piv, foot)) {
        // the body's gait phase p advances by distance / stride; the leg's own cycle is p + its phase offset
        let zmin = Infinity, zmax = -Infinity;
        for (let s = 0; s <= 40; s++) {
          const cyc = 0.25 + 0.5 * (s / 40), p = cyc - f.phase;
          const o = footOffset(cyc, Math.abs(f.x), f.z, stride, 1);
          const zWorld = p * stride + f.hipZ + o.z;
          zmin = Math.min(zmin, zWorld); zmax = Math.max(zmax, zWorld);
          stretch = Math.max(stretch, o.stretch);
        }
        worst = Math.max(worst, zmax - zmin);
      }
      expect(worst).toBeLessThan(1e-9 * Math.max(1, stride));
      expect(stretch).toBeLessThanOrEqual(1.25 + 1e-9);
    });
  }
});
