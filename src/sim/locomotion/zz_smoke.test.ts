import { describe, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { navTo } from './index';
import { locoSim, runUntilDone, v3 } from './testkit';
const ROT = { x: 0, y: 0, z: 0, w: 1 };
function wallWithGap(bu: number, cx: number, z0: number, gapZ: number, gapHalf: number, z1: number): Primitive[] {
  const h = 30 * bu, a0 = z0 * bu, a1 = (gapZ - gapHalf) * bu, b0 = (gapZ + gapHalf) * bu, b1 = z1 * bu;
  const box = (id: number, za: number, zb: number): Primitive => ({ id, shape: 'box', pos: { x: cx * bu, y: h - bu, z: (za + zb) / 2 }, rot: { ...ROT }, size: { x: 1.5 * bu, y: h, z: (zb - za) / 2 }, round: 0.25 * bu, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1 });
  return [box(1, a0, a1), box(2, b0, b1)];
}
describe('smoke', () => {
  it('wall', () => {
    const bu = 4;
    const sim = locoSim({ sizeBu: 400, prims: wallWithGap(bu, 200, 60, 280, 16, 360) });
    const ant = sim.state.ants[0];
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: v3(160 * bu, 0, 200 * bu) });
    sim.tick();
    console.log('at', ant.pos.x / bu, ant.pos.y / bu, ant.pos.z / bu);
    console.log(navTo(sim, ant, v3(240 * bu, 0, 200 * bu), 2 * bu, { speed: 6 * bu }));
    sim.tick();
    console.log(ant.nav.mode, ant.nav.path?.map((p) => [p.x / bu, p.z / bu].map((x) => x.toFixed(0)).join(',')).join(' | '));
    let n = 0;
    runUntilDone(sim, [ant], 3000, (t) => { if (t % 25 === 0 && n++ < 30) console.log(t, ant.nav.mode, ant.nav.pathIdx, [ant.pos.x / bu, ant.pos.y / bu, ant.pos.z / bu].map((x) => x.toFixed(1)).join(',')); });
    console.log(ant.nav.status);
  });
});
