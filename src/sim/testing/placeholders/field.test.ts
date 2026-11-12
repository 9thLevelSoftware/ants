import { describe, expect, it } from 'vitest';
import { makeTestWorld } from '@/sim/testing';
import { createPlaceholderField } from './field';

describe('placeholder field sphereTrace', () => {
  it('does not step through a steep slope (height difference is not a distance)', () => {
    const world = makeTestWorld({ terrain: 'flat' });
    const hf = world.terrain;
    const slope = 3; // dy/dx
    for (let iz = 0; iz < hf.nz; iz++) for (let ix = 0; ix < hf.nx; ix++) hf.data[iz * hf.nx + ix] = slope * ix * hf.cell;
    const field = createPlaceholderField(world);
    const x0 = 100, z0 = 100;
    const o = { x: x0, y: field.height(x0, z0) + 10, z: z0 };
    // Horizontal ray up the slope: it meets the ground after 10 / 3 mm.
    const t = field.sphereTrace(o, { x: 1, y: 0, z: 0 }, 50, 0);
    expect(t).toBeGreaterThan(10 / slope - 0.2);
    expect(t).toBeLessThan(10 / slope + 0.05);
  });
});
