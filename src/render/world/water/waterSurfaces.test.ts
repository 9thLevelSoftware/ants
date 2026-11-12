// Water surfaces from bodies and puddle inputs: levels follow the inputs, connected wet cells form one flat sheet.
import { describe, expect, it } from 'vitest';
import { GroundView } from '../decor/ground';
import { buildTestWorld } from '../decor/testWorld';
import { buildWaterGeometry } from './waterRenderer';
import { collectWater } from './waterSurfaces';

function world() {
  const w = buildTestWorld();
  w.waterBodies = [
    { id: 0, kind: 'bowl-water', vesselObjectId: -1, pos: { x: 1000, y: 10, z: 3000 }, radius: 80, levelMm: 30, capMm: 40 },
    { id: 1, kind: 'wet-patch', vesselObjectId: -1, pos: { x: 1200, y: 0, z: 3000 }, radius: 500, levelMm: 0, capMm: 0 },
  ];
  const zm = w.maps.zone;
  const cap = { cell: zm.cell, nx: zm.nx, nz: zm.nz, data: new Uint8Array(zm.nx * zm.nz) };
  for (const [i, k] of [[40, 50], [41, 50], [41, 51], [60, 60]]) cap.data[k * cap.nx + i] = 6;
  w.maps.puddleCapMm = cap;
  return w;
}

describe('water surfaces', () => {
  it('draws vessels at their level, skips wet patches, scales with the level input', () => {
    const g = new GroundView(world());
    const s = collectWater(g, null, { bodyLevelScale: 1, puddleMm: null });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: 'disc', y: 40, vesselDepth: 30 });
    const half = collectWater(g, null, { bodyLevelScale: 0.5, puddleMm: null });
    expect(half[0]).toMatchObject({ y: 25, vesselDepth: 15 });
  });

  it('fills puddle-capable cells from the input, one flat sheet per connected region, capped by capacity', () => {
    const g = new GroundView(world());
    const s = collectWater(g, null, { bodyLevelScale: 1, puddleMm: 10 }).filter((x) => x.kind === 'sheet');
    expect(s).toHaveLength(2);
    const big = s.find((x) => x.kind === 'sheet' && x.rects.length === 12);
    expect(big).toBeDefined();
    const geo = buildWaterGeometry(s)!;
    expect(geo.getAttribute('position').count).toBe(4 * 6);
    // level = lowest ground of the region + the deepest water (capped at 6 mm)
    const cell = g.world.maps.zone.cell;
    let low = Infinity;
    for (const [i, k] of [[40, 50], [41, 50], [41, 51]]) for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) low = Math.min(low, g.height((i + a / 4) * cell, (k + b / 4) * cell));
    expect(big!.y).toBeCloseTo(low + 6, 4);
  });
});
