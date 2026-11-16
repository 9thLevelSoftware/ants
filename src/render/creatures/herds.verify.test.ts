// Herds against the real plants module (review of task render-creatures): a herd spawned by the sim on a test herb
// is drawn ON the plant at the plants module's own herd point, and its size follows A.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { herdPoint } from '@/sim/ecology/plants/links';
import { CreatureRenderer } from './CreatureRenderer';
import { creatureSource } from './CreaturesRenderer';
import { herdSpots } from './herds';

describe('herds on a real sim plant (verify)', () => {
  it('draws the sim herd on its stem, starting at the plants module\'s herd point, sized by A', () => {
    const { sim, plants } = plantSim({ seed: 2 });
    const h = addHerd(sim, plants[0]!, 57);
    const p = herdPoint(sim, h)!;
    expect(p).not.toBeNull();
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(p.x + 20, p.y + 5, p.z + 30); camera.lookAt(p.x, p.y, p.z); camera.updateMatrixWorld();
    const r = new CreatureRenderer();
    r.init({ scene, camera, quality: getPreset('high') });
    r.setSim(creatureSource(sim));
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    expect(r.stats.herds).toBe(1);
    expect(r.stats.aphids).toBe(57);

    // the same spots the layer uses: the first lies next to the herd point, all on the stem capsule
    const obj = sim.world.objects.find((o) => o.id === plants[0]!.objectId)!;
    const prims = sim.world.prims.slice(obj.primStart, obj.primStart + obj.primCount);
    const spots = herdSpots(prims, p, 200, h.id);
    expect(Math.hypot(spots[0]!.pos.x - p.x, spots[0]!.pos.y - p.y, spots[0]!.pos.z - p.z)).toBeLessThan(2);

    h.a = 3.2;
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    expect(r.stats.aphids).toBe(3);
    h.alive = false;
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    expect(r.stats.aphids).toBe(0);
    r.dispose();
  });
});
