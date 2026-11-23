// Colony-life round 15 (direction 30 item 1a): a lone open voxel beside a passage must not blind the field queries.
// In woodland-edge #1's entrance throat a one-voxel bubble in the wall (joined to the throat only across an edge the
// graph does not step) was the nearest sample of deliverers standing 0.85 BU down the throat: their chamber field read
// Infinity there, the leg failed on the spot, and they stood with full crops for game days.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { createCarveGrid, type CarveGrid } from '@/sim/nest/carve/grid';
import { emptyCarve } from '@/sim/kernel.testWorld';
import { createNestNav } from './nestNav';

const BU = 4;
const V = BU / 2;
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** A straight tunnel along x at y -20, z 20, with a chamber target at its far end. */
function tunnel(): CarveGrid {
  const grid = createCarveGrid(emptyCarve(BU));
  grid.carveCapsule(v(10, -20, 20), v(70, -20, 20), BU);
  return grid;
}

const OPEN = 127.5;
const FACES: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * The first closed sample beside the tunnel that touches it only across an edge (no open face neighbour, an open
 * neighbour diagonally in the y-z plane), opened by a tiny bite as a lone voxel; the walker point stands 0.3 voxel
 * from it toward that diagonal neighbour, so the bubble is its nearest sample.
 */
function loneBeside(): { grid: CarveGrid; lone: Vec3; walker: Vec3 } | null {
  const ref = tunnel();
  const open = (g: CarveGrid, i: number, j: number, k: number) => g.sampleAt(i, j, k) > OPEN;
  const i = 20;
  for (let j = -16; j <= -4; j++) for (let k = 4; k <= 16; k++) {
    if (open(ref, i, j, k) || FACES.some(([a, b, c]) => open(ref, i + a, j + b, k + c))) continue;
    const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]].find(([b, c]) => open(ref, i, j + b, k + c));
    if (!diag) continue;
    const grid = tunnel();
    const lone = v(i * V, j * V, k * V);
    grid.carveSphere(lone, 0.6 * V);
    if (!open(grid, i, j, k) || FACES.some(([a, b, c]) => open(grid, i + a, j + b, k + c))) continue;
    const s = 0.3 / Math.SQRT2;
    return { grid, lone, walker: v(lone.x, lone.y + s * diag[0] * V, lone.z + s * diag[1] * V) };
  }
  return null;
}

describe('nest nav: lone open voxel beside a passage (round 15)', () => {
  it('a walker whose nearest sample is a lone bubble reads the field of the passage it stands in', () => {
    const found = loneBeside();
    expect(found).not.toBeNull();
    const { grid, walker } = found!;
    const nav = createNestNav(grid);
    nav.setTarget('chamber', { points: [v(68, -20, 20)], radius: BU });
    const d = nav.distanceAt('chamber', walker);
    expect(Number.isFinite(d)).toBe(true);
    // about the way along the tunnel (within a few BU), not a detour
    expect(d).toBeLessThan(68 - walker.x + 3 * BU);
    const out = v(0, 0, 0);
    expect(Number.isFinite(nav.lookahead('chamber', walker, 3, out))).toBe(true);
    expect(nav.stepDir('chamber', walker, out)).toBeGreaterThan(0);
    expect(Math.hypot(out.x, out.y, out.z)).toBeGreaterThan(0.5);
  });

  it('a sealed pocket of more than one voxel still reads Infinity', () => {
    const grid = tunnel();
    const pocket = v(40, -40, 20);
    grid.carveSphere(pocket, BU);
    const nav = createNestNav(grid);
    nav.setTarget('chamber', { points: [v(68, -20, 20)], radius: BU });
    expect(nav.distanceAt('chamber', pocket)).toBe(Infinity);
  });
});
