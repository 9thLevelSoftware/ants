// The skin band (spike-nest 5.6b) must stay under intact ground and go only at the terrain hole and its lip (review
// finding: a ring of wall fragments poking through intact ground up to 0.5 BU around every entrance). Checked
// against the world renderer's own terrain hole probe, applying the wall shader's keep rule per vertex.
import { describe, expect, it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { fieldHoleProbe } from '@/render/world/lighting/simAdapter';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { CAVITY_SKIN_BU, HOLE_LIP_BU, NEST_ATTR } from '../params';
import { buildChunk } from './chunkBuild';

const BU = 4;

describe('skin band around entrances', () => {
  it('keeps near-surface wall fragments only where the terrain is open', () => {
    const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
    kernel.carveCapsule({ x: 200, y: 6, z: 200 }, { x: 200, y: -40, z: 200 }, 4, { force: true }); // a shaft = entrance
    kernel.carveSphere({ x: 214, y: 3, z: 200 }, 4, { force: true }); // a bite that barely dips into the ground
    kernel.carveCapsule({ x: 200, y: -2, z: 200 }, { x: 200, y: -2, z: 214 }, 2.5, { force: true }); // a shallow lip
    const sim = kernelSim(kernel);
    const src = nestSourceFromSim(sim);
    const probe = fieldHoleProbe(sim)!;
    const skin = CAVITY_SKIN_BU * BU, lip = HOLE_LIP_BU * BU;
    let banded = 0, kept = 0;
    for (const refine of [false, true]) {
      for (const key of kernel.meshKeys()) {
        const c = buildChunk(src, key, { refine, ao: false });
        if (!c) continue;
        for (let i = 0; i < c.vertexCount; i++) {
          const sub = c.sub[i];
          if (sub > 0 || sub <= -skin) continue; // open air (always dropped) or below the band (always kept)
          const x = c.positions[i * 3], z = c.positions[i * 3 + 2];
          const band = c.nest[i * NEST_ATTR + 3] <= -lip; // the wall shader's rule
          const open = probe(x, z);
          if (open < -lip - 0.02) { expect(band).toBe(true); banded++; }
          if (open > -lip + 0.02) { expect(band).toBe(false); kept++; }
        }
      }
    }
    expect(banded).toBeGreaterThan(20); // the dish of the bite and the shallow lip under intact ground
    expect(kept).toBeGreaterThan(20); // the wall tops at the hole's rim reach the surface
  });
});
