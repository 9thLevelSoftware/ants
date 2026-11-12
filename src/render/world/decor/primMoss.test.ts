// Moss on solids: only on shaded mossy materials, every kept vertex on the solid's upper surface (a hair above it).
import { describe, expect, it } from 'vitest';
import { makePrimEntry, primEval } from '@/sim/world/primHash';
import { PrimFlag, type Primitive } from '@/sim/types';
import { blockContext } from './blockContext';
import { GroundView } from './ground';
import { placePrimMoss } from './primMoss';
import { buildTestWorld } from './testWorld';
import { blockRef } from './tiles';
import { MOSS } from './tuning';

function worldWithStone(shaded: boolean) {
  const w = buildTestWorld();
  const stone: Primitive = { id: 999, shape: 'ellipsoid', pos: { x: 2600, y: 4, z: 600 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 120, y: 40, z: 90 }, round: 0, material: 'stone', flags: PrimFlag.CLIMBABLE, objectId: -1 };
  w.prims = [...w.prims, stone];
  w.maps.shade.data.fill(shaded ? 200 : 0);
  return { w, stone };
}

describe('moss on primitives', () => {
  it('grows on a shaded stone, hugging its surface', () => {
    const { w, stone } = worldWithStone(true);
    const g = new GroundView(w), e = makePrimEntry(stone, false);
    const m = placePrimMoss(blockContext(g, blockRef(2, 0, 4)));
    expect(m.patches).toBeGreaterThan(0);
    let kept = 0;
    for (let i = 0; i < m.position.length / 3; i++) {
      if (m.uvMask[i * 4 + 2] < 0.5) continue;
      kept++;
      const d = primEval(e, m.position[i * 3], m.position[i * 3 + 1], m.position[i * 3 + 2], null);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(MOSS.primLiftMm + 0.01);
    }
    expect(kept).toBeGreaterThan(20);
  });

  it('does not grow in full sun', () => {
    const { w } = worldWithStone(false);
    expect(placePrimMoss(blockContext(new GroundView(w), blockRef(2, 0, 4))).patches).toBe(0);
  });
});
