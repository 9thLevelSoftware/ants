// Adversarial check of the render-only leaf bend (review of the look pass, materials/surfacePatch.ts LEAF_BEND):
// the vertex shader cups every leaf-finish primitive across (edges up by cup x half width) and droops it toward the
// tip (down by droop x half length), while the collision box stays flat. Leaves are climbable, so an ant walking on
// a leaf stands on the flat box: the bend is a float / sink of the ant against the drawn leaf. This test measures it
// on real generated leaves (CPU mirror of wrLeafBend at the leaf's far end and margin) and also checks that rosette
// leaves lying on the ground do not droop into the terrain.
// (Updated with the fix: the CPU mirror is now the shared `leafBendMm` (materials/leafBend.ts, the same constants as
// the GLSL) instead of the old uncapped `fraction x half extent` formula; the thresholds are unchanged.)
import { describe, expect, it } from 'vitest';
import { FOOT_OFFSET_BU } from '@/sim/balance/ants';
import { terrainHeightAt } from '@/sim/entities/placement';
import { PrimFlag } from '@/sim/types';
import { generateWorld, defaultWorldParams } from '@/worldgen';
import { FINISH } from '../dressing/finishes';
import { lookTable } from '../dressing/looks';
import { staticPrims } from '../lighting/simAdapter';
import { leafBendMm } from './leafBend';

const upYOf = (p: { rot: { x: number; z: number } }) => 1 - 2 * (p.rot.x * p.rot.x + p.rot.z * p.rot.z);

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
    const gaps = leaves.map((p) => {
      const up = upYOf(p), hx = p.size.x, hz = p.size.z;
      return Math.max(Math.abs(leafBendMm(hx, hz, 0.8 * hx, 0, up)), Math.abs(leafBendMm(hx, hz, 0.5 * hx, hz, up)));
    });
    const worst = Math.max(...gaps);
    const over = gaps.filter((g) => g > 0.25 * bu).length;
    console.info(`[leaf-verify] ${leaves.length} climbable leaves; worst bend ${worst.toFixed(2)} mm (foot offset ${(FOOT_OFFSET_BU * bu).toFixed(2)} mm); ${over} over ${0.25 * bu} mm`);
    expect(worst).toBeLessThanOrEqual(0.25 * bu);
  });

  it('a rosette leaf lying on the ground does not droop its tip into the terrain', () => {
    // (Updated with the fix: a leaf whose tip is already below the terrain when drawn FLAT is a placement matter of the
    // generator, not of the bend (suburban-garden seed 1 has 18 such dandelion rosette leaves, up to 2.7 mm, with
    // their centre pressed 0.1-3.7 mm into the soil). What the bend must guarantee: it never lowers a lying leaf's tip
    // and never buries a tip that the flat leaf keeps above the terrain.)
    let buried = 0, buriedFlat = 0, lowered = 0, lying = 0;
    for (const p of leaves) {
      const { x, y, z, w } = p.rot;
      const ax = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
      const ay = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
      if (ay[1] < 0.95) continue; // only leaves lying flat
      const g0 = terrainHeightAt(world.terrain, p.pos.x, p.pos.z);
      if (p.pos.y - p.size.y - g0 > 2) continue; // not on the ground
      lying++;
      // the top surface (underside + 2 half thicknesses) at the far end (local +x, t = 0.9), flat and bent
      const t = 0.9, lx = t * p.size.x;
      const topAbove = (bend: number) => {
        const ly = -p.size.y + bend;
        const wx = p.pos.x + ax[0] * lx + ay[0] * ly, wy = p.pos.y + ax[1] * lx + ay[1] * ly, wz = p.pos.z + ax[2] * lx + ay[2] * ly;
        return wy + 2 * p.size.y - terrainHeightAt(world.terrain, wx, wz);
      };
      const bend = leafBendMm(p.size.x, p.size.z, lx, 0, ay[1]);
      if (bend < 0) lowered++;
      if (topAbove(0) < 0) buriedFlat++;
      else if (topAbove(bend) < 0) buried++;
    }
    console.info(`[leaf-verify] ${lying} leaves lying on the ground: ${buried} tips buried by the bend, ${lowered} lowered; ${buriedFlat} already below the terrain flat (generator placement)`);
    expect(lying).toBeGreaterThan(0);
    expect(lowered).toBe(0);
    expect(buried).toBe(0);
  });
});
