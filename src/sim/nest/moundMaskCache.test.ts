// nest-fix3 item 3: the mound mask cache is keyed on the breach records near the grid (positions and radii), not on
// their count. A breach replaced by another elsewhere (the same count) must give the mask a fresh build gives.
import { describe, expect, it } from 'vitest';
import { carveCapsule } from './carveOps';
import { moundMask } from './moundRelax';
import { createMound } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';

describe('mound mask cache (nest-fix3 item 3)', () => {
  it('a breach replaced by another elsewhere: the cached mask equals a fresh build', () => {
    const sim = nestSim({ nest: 'none', seed: 1 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ground = sim.field.height(c, c);
    const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
    // two holes to the surface on the grid, 12 BU apart
    const a = { x: c - 6 * bu, y: ground, z: c }, b = { x: c + 6 * bu, y: ground, z: c };
    carveCapsule(sim, { ...a, y: ground - 4 * bu }, { ...a, y: ground + bu }, bu);
    carveCapsule(sim, { ...b, y: ground - 4 * bu }, { ...b, y: ground + bu }, bu);
    const breaches = sim.carve.breaches;
    breaches.length = 0;
    breaches.push({ pos: { ...a }, r: bu });
    const first = moundMask(sim, m);
    // the same number of breach records, the one at a replaced by one at b
    breaches[0] = { pos: { ...b }, r: bu };
    const cached = moundMask(sim, m);
    nestRuntime(sim).moundMasks.delete(m.id);
    const fresh = moundMask(sim, m);
    expect(Array.from(cached.clear)).toEqual(Array.from(fresh.clear));
    expect(Array.from(cached.cap)).toEqual(Array.from(fresh.cap));
    // and the replacement did change the mask (the test would be void otherwise)
    expect(Array.from(first.clear)).not.toEqual(Array.from(fresh.clear));
  });
});
