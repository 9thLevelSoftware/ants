// Adversarial checks of the static sky-occlusion map (review of the look pass). The feature was added so that the
// asphalt under a parked car stops glittering in the full sky light; these tests check it on the catalogue's own car
// proportions and on a real generated car park, plus degenerate inputs.
import { describe, expect, it } from 'vitest';
import type { Primitive, WorldData } from '@/sim/types';
import { terrainHeightAt } from '@/sim/entities/placement';
import { generateWorld, defaultWorldParams } from '@/worldgen';
import { ASPHALT } from '@/worldgen/catalog/outdoor/asphalt';
import { staticPrims } from '../lighting/simAdapter';
import { buildSkyOcclusion } from './skyOcclusion';

const flat = () => 0;
const at = (m: ReturnType<typeof buildSkyOcclusion>, x: number, z: number) => m.data[Math.floor(z / m.cell) * m.nx + Math.floor(x / m.cell)] / 255;
const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number): Primitive =>
  ({ id: 1, shape: 'box', pos: { x, y, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: hx, y: hy, z: hz }, round: 40, material: 'metal', flags: 0, objectId: -1 });

describe('buildSkyOcclusion (verify)', () => {
  it('darkens the ground under a body of the catalogue car size (1.8 m x 4.3 m, 150 mm clearance)', () => {
    const [w, h, l] = ASPHALT.car.body;
    const clearance = ASPHALT.car.clearance[0];
    const car = box(3000, clearance + h / 2, 3000, w / 2, h / 2, l / 2);
    const m = buildSkyOcclusion([car], flat, 6000);
    // the exact scene the feature was written for; the per-primitive cell cap is applied to the bounding square of
    // the footprint's circumradius (2 x 2331 mm -> ~85 000 cells > maxCellsPerPrim 40 000), so the car is skipped
    expect(at(m, 3000, 3000)).toBeGreaterThan(0.5);
  });

  it('a real car park (car-park-verge, seed 1): the ground under every parked car body is occluded', { timeout: 60000 }, () => {
    const world: WorldData = generateWorld({ ...defaultWorldParams('lasius-niger', 1), archetype: 'car-park-verge' });
    const prims = staticPrims(world);
    const cars = world.objects.filter((o) => o.templateId === 'parked-car');
    expect(cars.length).toBeGreaterThan(0);
    const m = buildSkyOcclusion(prims, (x, z) => terrainHeightAt(world.terrain, x, z), world.size);
    const under = cars.map((o) => at(m, o.pos.x, o.pos.z));
    expect(Math.min(...under)).toBeGreaterThan(0.5);
  });

  it('degenerate inputs: empty world, zero size, primitives outside the world', () => {
    expect(buildSkyOcclusion([], flat, 0).data.length).toBe(1);
    const outside = box(-500, 50, -500, 100, 50, 100);
    const far = box(9000, 50, 9000, 100, 50, 100);
    const m = buildSkyOcclusion([outside, far], flat, 2048);
    expect(m.nx).toBe(128);
    expect(Math.max(...m.data)).toBe(0);
  });
});
