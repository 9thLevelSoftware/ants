// Reviewer tests (adversarial) for the loco nav grid (GDD 04 §11). Failing tests demonstrate a gap for the fixer.
import { describe, expect, it } from 'vitest';
import type { Primitive, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { createWorldField } from '@/sim/world/field';
import { makeTestWorld } from '@/sim/testing/testWorld';
import { createNavGridImpl } from './navGrid';

const BU = 4;
const ROT = { x: 0, y: 0, z: 0, w: 1 };

function gridFor(world: WorldData) {
  const g = createNavGridImpl(world);
  g.attachField(createWorldField(world, null), world.prims);
  return g;
}

/** A 60 BU tall wall along x = 160 BU across the whole map, its foot `liftBu` above the ground (a door gap). */
function fullWall(liftBu: number): Primitive {
  const h = 60;
  return {
    id: 1, shape: 'box', pos: { x: 160 * BU, y: (liftBu + h / 2) * BU, z: 160 * BU }, rot: { ...ROT },
    size: { x: 1.5 * BU, y: (h / 2) * BU, z: 170 * BU }, round: 0, material: 'wood-sound', flags: PrimFlag.CLIMBABLE, objectId: -1,
  };
}

describe('reviewer: nav grid edges beyond the 8-neighbourhood (GDD 04 §11)', () => {
  // MAJOR. GDD 04 §11: "Edges: 8-neighbour moves, plus climb-route edges and micro-portal edges" (cost = channel
  // length, caste clearance). WorldData.micro is never read by locomotion, so a door crack (the only way into the
  // kitchen slice, GDD 04 §6.2) does not exist for the planner and every trip through it fails.
  it('A* crosses a full-width tall wall through a micro-connection (door crack) between its two mouths', () => {
    const world = makeTestWorld({ sizeBu: 320, prims: [fullWall(0.8)] });
    const a = { x: 158 * BU, y: 0, z: 160 * BU }, b = { x: 162 * BU, y: 0, z: 160 * BU };
    world.micro.push({ id: 1, kind: 'door-crack', posA: a, posB: b, gapMm: 0.8 * BU, minClearanceBu: 0.45, lengthBu: 4, useful: true, reason: 'test' });
    const g = gridFor(world);
    for (let z = 40; z <= 280; z += 16) expect(g.blocked(160 * BU, z * BU)).toBe(true);
    const path: { x: number; y: number; z: number }[] = [];
    expect(g.findPathEx({ x: 100 * BU, y: 0, z: 160 * BU }, { x: 220 * BU, y: 0, z: 160 * BU }, path)).toBe(true);
  });

  // MINOR. GDD 04 §11 groundY = "top-surface height of the walkable ground in the cell"; the grid takes the terrain
  // height only (field.height), so the top of a low object (a kerb, a step, a slab below NAV_OVER_MAX) is not the
  // cell's ground. Consequently the `step` rule (climb cost 1.5 x dh, and "blocked if grip < 0.5") never fires for
  // primitives, and the grid has no grip input at all.
  it('groundY of a cell on top of a 20 BU block (below NAV_OVER_MAX) is the block top', () => {
    const block: Primitive = {
      id: 1, shape: 'box', pos: { x: 160 * BU, y: 10 * BU, z: 160 * BU }, rot: { ...ROT },
      size: { x: 40 * BU, y: 10 * BU, z: 40 * BU }, round: 0, material: 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1,
    };
    const g = gridFor(makeTestWorld({ sizeBu: 320, prims: [block] }));
    expect(g.blocked(160 * BU, 160 * BU)).toBe(false);
    expect(g.groundAt(g.cellOf(160 * BU, 160 * BU))).toBeGreaterThan(15 * BU);
  });
});
