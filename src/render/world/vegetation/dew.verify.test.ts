// Reviewer test (render-decor): dew droplets must disappear with their blade. The blade fragment shader hides blades
// near the eye and around the camera->subject line (grFragFade); the dew shader places droplets on the same blade
// (bladeShapeAt) but only checks the LOD fade, so a droplet can float where its blade has been faded out.
// Amended by the module owner after the fix: the visibility rule the test hard-coded (the old shader's: rank below
// the dew level and LOD fade > 0.5) is now read from dropletVisible, the CPU twin of the shader's test.
import { describe, expect, it } from 'vitest';
import { blockContext } from '../decor/blockContext';
import { GroundView } from '../decor/ground';
import { BLADE_STRIDE } from '../decor/instances';
import { buildTestWorld } from '../decor/testWorld';
import { blockRef } from '../decor/tiles';
import { bladeFragFade, bladeVertex, type BladeView } from './bladeShape';
import { DROP_STRIDE, dropletVisible, placeDew } from './dew';
import { placeGrass } from './grassPlacement';

describe('dew droplets (review)', () => {
  it('no visible droplet sits where its own blade is faded out (eye fade / line-of-sight fade)', () => {
    const world = buildTestWorld(), g = new GroundView(world), bu = world.bu;
    const ref = blockRef(0, 0, bu); // lawn
    const blades = placeGrass(blockContext(g, ref));
    const drops = placeDew(blades, g.seed ^ ref.key);
    // 40 ant-height views over the lawn block, with a followed subject (parting) and without (observer)
    let floating = 0, nearEye = 0, shown = 0;
    for (let c = 0; c < 40; c++) {
      const sx = 150 + (c % 8) * 100, sz = 150 + Math.floor(c / 8) * 150, part = c % 2 === 0;
      const subject = { x: sx, y: g.height(sx, sz) + 1, z: sz };
      const cam = { x: sx - 4.5 * bu * 0.95, y: subject.y + 1.4 * bu, z: sz - 4.5 * bu * 0.3 };
      const view: BladeView = { cam, subject, part, bu, time: 0, windDir: { x: 0.8, z: -0.6 }, wind: 0.07, density: 1 };
      for (let o = 0; o < drops.length; o += DROP_STRIDE) {
        if (!dropletVisible(drops, o, view, 1)) continue;
        shown++; // dew level 1: every droplet that the shader would draw
        const p = bladeVertex(drops, o, drops[o + 13], drops[o + 12], view);
        if (bladeFragFade(p.x, p.y, p.z, view) < 0.05) {
          floating++;
          if (Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) < 3 * bu) nearEye++;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[review] droplets drawn on invisible blades: ${floating} (within 3 BU of the eye: ${nearEye}) of ${drops.length / DROP_STRIDE}; blades ${blades.length / BLADE_STRIDE}`);
    expect(floating).toBe(0);
    expect(shown).toBeGreaterThan(1000); // the rule still shows droplets away from the eye and the sight line
  });
});
