// Reviewer's tests for the cell camera (look pass 6, item 1) on the REAL test nest (queen-sized shaft and tunnels, real
// kernel field and walker). The cell camera turns off the rig's fade and occlusion cone and relies on its cut-away
// alone, so the picture is broken whenever soil that the cut does NOT remove stands between the camera and the queen.
// The test walks the queen down and back up the nest and, on every frame where the cell camera is fully on, samples the
// line of sight camera -> thorax: a solid sample outside the hidden region (isHiddenByCut, the shaders' own test) is
// soil (or a cut face) drawn in front of her.
import { describe, expect, it } from 'vitest';
import { computeCutPlane, createCutPlane, isHiddenByCut, type NestCutawayParams } from '@/render/nest/cutaway/cutPlane';
import type { Sim } from '@/sim/types';
import { makeNestWalk, type WalkFrame } from './testing/nestWalk';
import { ViewDirector, type ViewSubject } from './viewDirector';

const CAM = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function director(sim: Sim): ViewDirector {
  return new ViewDirector({
    bu: sim.world.bu, worldSize: sim.world.size,
    trace: (o, dir, max, r) => sim.field.sphereTrace(o, dir, max, r),
    groundHeight: (x, z) => sim.field.height(x, z),
    field: (x, y, z) => sim.field.sampleXYZ(x, y, z),
  }, CAM);
}

function subjectOf(f: WalkFrame): ViewSubject {
  const a = f.ant;
  return { pos: { ...a.pos }, up: { ...a.up }, fwd: { ...a.fwd }, lengthBu: a.lengthBu, underground: f.underground, airborne: a.medium === 'air' };
}

interface Blocked { frame: number; side: boolean; solidMm: number; at: number; offset?: number }

describe('cell camera: nothing the cut leaves stands between the camera and the queen', () => {
  it('on every fully-on frame of a walk down the test nest and back, the line of sight to her thorax is clear', () => {
    const w = makeNestWalk({ dt: 1 / 30 });
    const d = director(w.sim);
    const field = (x: number, y: number, z: number) => w.sim.field.sampleXYZ(x, y, z);
    const cp = createCutPlane();
    let started = false, onFrames = 0, sideFrames = 0;
    const blocked: Blocked[] = [];
    w.run((fr) => {
      const s = subjectOf(fr);
      if (!started) { d.setView('possess', s, true); started = true; } else d.setSubject(s);
      const f = d.update(1 / 30, null);
      const cell = d.cellState();
      if (cell.weight < 1 || !f.cutaway) return;
      onFrames++;
      if (cell.side) sideFrames++;
      computeCutPlane(f.cutaway as NestCutawayParams, (x, z) => w.sim.field.height(x, z), w.sim.world.bu, cp);
      const a = fr.ant, L = a.lengthBu * w.sim.world.bu;
      const tx = a.pos.x + a.up.x * 0.2 * L, ty = a.pos.y + a.up.y * 0.2 * L, tz = a.pos.z + a.up.z * 0.2 * L;
      const c = f.pose.pos;
      const len = Math.hypot(tx - c.x, ty - c.y, tz - c.z);
      // stop 0.35 L short of the thorax: her own body and the floor under her head are not "in front of her"
      let solid = 0, firstAt = -1;
      for (let u = 0; u < len - 0.35 * L; u += 0.1) {
        const k = u / len, x = c.x + (tx - c.x) * k, y = c.y + (ty - c.y) * k, z = c.z + (tz - c.z) * k;
        if (field(x, y, z) < 0 && !isHiddenByCut(cp, x, y, z)) { solid += 0.1; if (firstAt < 0) firstAt = u; }
      }
      if (solid >= 0.5) blocked.push({ frame: fr.i, side: cell.side, solidMm: +solid.toFixed(1), at: +firstAt.toFixed(1), offset: f.cutaway.offset });
    });
    expect(onFrames, 'the cell camera took over somewhere in the queen-sized shaft').toBeGreaterThan(30);
    const worst = [...blocked].sort((p, q) => q.solidMm - p.solidMm).slice(0, 5);
    process.stdout.write(`\n[verify] cell camera on ${onFrames} frames (${sideFrames} side view); line of sight blocked on ${blocked.length}; worst ${JSON.stringify(worst)}\n`);
    expect(blocked.length, `frames whose line of sight crosses uncut soil, worst: ${JSON.stringify(worst)}`).toBe(0);
  });
});
