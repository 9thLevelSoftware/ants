// The facade's slice cutaway while the colony keeps digging (review finding: any edit restarted the cap raster,
// so the cut face never appeared): edits far from the cut leave the cap alone, edits across it patch it.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { getPreset } from '@/render/app';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { NestRenderer, type NestCutawayParams } from './index';
import { kernelSim } from './testing/kernelSim';

const BU = 4;

describe('NestRenderer slice cap under continuous digging', () => {
  it('completes while bites land every frame, and later shows an edit that crosses the cut', () => {
    const kernel = createKernel(makeFlatWorld({ size: 1200, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 300, y: -40, z: 600 }, { x: 900, y: -40, z: 600 }, 4, { force: true });
    const sim = kernelSim(kernel);
    const scene = new Scene();
    const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 40000);
    camera.position.set(600, 400, 300); camera.lookAt(600, -40, 540); camera.updateMatrixWorld(); // solid soil on the plane, beside the tunnel
    const r = new NestRenderer();
    void r.init({ renderer: {} as WebGLRenderer, scene, camera, quality: getPreset('test'), assets: null });
    r.setSim(sim);
    r.flush();
    const cut: NestCutawayParams = { mode: 'slice', planeY: -40, radius: 120 * BU, center: { x: 600, z: 600 } };
    let shownAt = -1;
    for (let f = 0; f < 400 && shownAt < 0; f++) {
      kernel.carveSphere({ x: 30 + (f % 20) * 3, y: -100, z: 30 + Math.floor(f / 20) * 3 }, 2.4, { force: true }); // far away
      r.update({ dt: 1 / 60, time: f / 60, cutaway: cut });
      if (!r.details().capBusy && r.pick(0, 0)?.kind === 'cap') shownAt = f;
    }
    expect(shownAt).toBeGreaterThan(0);
    // a chamber dug right under the camera's view centre, across the plane: the cap gets a hole there
    const before = r.pick(0, 0)!;
    kernel.carveSphere(before.point, 12, { force: true });
    // until the face is patched and the new walls are meshed (both within their per-frame budgets)
    for (let f = 0; f < 300 && (f === 0 || r.details().capBusy || r.details().pending > 0); f++) r.update({ dt: 1 / 60, time: 0, cutaway: cut });
    const after = r.pick(0, 0)!;
    expect(after.kind).not.toBe('cap'); // through the new hole in the face
    expect(after.point.y).toBeLessThan(-40);
    r.dispose();
  });
});
