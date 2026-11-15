// Adversarial check of the render-only leaf bend (review of the look pass, materials/surfacePatch.ts LEAF_BEND):
// the vertex shader cups every leaf-finish primitive across (edges up by cup x half width) and droops it toward the
// tip (down by droop x half length), while the collision box stays flat. Leaves are climbable, so an ant walking on
// a leaf stands on the flat box: the bend is a float / sink of the ant against the drawn leaf. This test measures it
// on real generated leaves (CPU mirror of wrLeafBend at the leaf's far end and margin) and also checks that rosette
// leaves lying on the ground do not droop into the terrain.
import { describe, expect, it } from 'vitest';
import { FOOT_OFFSET_BU } from '@/sim/balance/ants';
import { terrainHeightAt } from '@/sim/entities/placement';
import { PrimFlag } from '@/sim/types';
import { generateWorld, defaultWorldParams } from '@/worldgen';
import { FINISH } from '../dressing/finishes';
import { lookTable } from '../dressing/looks';
import { staticPrims } from '../lighting/simAdapter';
import { LEAF_BEND } from './surfacePatch';

describe('leaf bend (verify)', { timeout: 60000 }, () => {
  const world = generateWorld({ ...defaultWorldParams('lasius-niger', 1), archetype: 'suburban-garden' });
  const look = lookTable(world.objects);
  const leaves = staticPrims(world).filter((p) => look(p).look[0] === FINISH.leaf && p.flags & PrimFlag.CLIMBABLE);
  const bu = world.bu;

  it('has climbable leaves to measure', () => {
    expect(leaves.length).toBeGreaterThan(50);
  });

  it('the drawn leaf stays within a quarter body length of the walkable box (no visible float or sink of an ant on it)', () => {
    // at 80 % of the way to the tip along the midrib (where an ant still stands) and at the margin half-way along
    const gaps = leaves.map((p) => Math.max(LEAF_BEND.droop * p.size.x * 0.64, LEAF_BEND.cup * p.size.z));
    const worst = Math.max(...gaps);
    const over = gaps.filter((g) => g > 0.25 * bu).length;
    console.info(`[leaf-verify] ${leaves.length} climbable leaves; worst bend ${worst.toFixed(2)} mm (foot offset ${(FOOT_OFFSET_BU * bu).toFixed(2)} mm); ${over} over ${0.25 * bu} mm`);
    expect(worst).toBeLessThanOrEqual(0.25 * bu);
  });

  it('a rosette leaf lying on the ground does not droop its tip into the terrain', () => {
    let buried = 0, lying = 0;
    for (const p of leaves) {
      const { x, y, z, w } = p.rot;
      const ax = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
      const ay = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
      if (ay[1] < 0.95) continue; // only leaves lying flat
      const g0 = terrainHeightAt(world.terrain, p.pos.x, p.pos.z);
      if (p.pos.y - p.size.y - g0 > 2) continue; // not on the ground
      lying++;
      // the far end (local +x, t = 0.9) of the leaf's underside after the droop
      const t = 0.9, lx = t * p.size.x, ly = -p.size.y - LEAF_BEND.droop * p.size.x * t * t;
      const wx = p.pos.x + ax[0] * lx + ay[0] * ly, wy = p.pos.y + ax[1] * lx + ay[1] * ly, wz = p.pos.z + ax[2] * lx + ay[2] * ly;
      // the top surface there: underside + 2 half thicknesses
      if (wy + 2 * p.size.y < terrainHeightAt(world.terrain, wx, wz)) buried++;
    }
    console.info(`[leaf-verify] ${lying} leaves lying on the ground, ${buried} with the tip drawn below the terrain`);
    expect(lying).toBeGreaterThan(0);
    expect(buried).toBe(0);
  });
});
