// Colony-life round 14 (direction 29 Part B): the mound mask must not depend on the pile's heights. The mask is a
// derived cache that only entrance, breach, ground-delta and near-surface carve changes drop, while the hole probe
// read the whole field f (terrain + every pile overlay, whose slope enters the soil term): as the pile relaxed beside
// an entrance pit, a cell 0.4 mm under the ground went from f -0.0006 to +0.0016 (a hole for a fresh build), the
// unsaved game kept its cached mask and a loaded game built the new one (sg #2, sweep 12's year-two restore gap: the
// two runs' mound heights differed one tick after the save). The probe now reads the carve cavity alone.
import { describe, expect, it } from 'vitest';
import { carveCapsule } from './carveOps';
import { moundMask, moundOrigin } from './moundRelax';
import { createMound } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';

describe('mound mask: independent of the pile heights (round 14, save -> load -> continue)', () => {
  it('a fresh mask with a cone heaped around an open hole equals the one built on the bare ground', () => {
    const sim = nestSim({ nest: 'none', seed: 1 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ground = sim.field.height(c, c);
    const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
    // holes to the surface of several widths on the grid, with their breach records (the mask probes around them)
    const holes: number[][] = [];
    for (let k = 0; k < 36; k++) holes.push([((k % 6) - 2.5) * 9 + 0.37 * k, (Math.floor(k / 6) - 2.5) * 9 - 0.21 * k, 0.6 + 0.07 * k]);
    sim.carve.breaches.length = 0;
    for (const [dx, dz, r] of holes) {
      const p = { x: c + dx * bu, y: ground, z: c + dz * bu };
      carveCapsule(sim, { ...p, y: ground - 4 * bu }, { ...p, y: ground + bu }, r * bu);
      sim.carve.breaches.push({ pos: { ...p }, r: r * bu });
    }
    const rt = nestRuntime(sim);
    rt.moundMasks.delete(m.id);
    const bare = moundMask(sim, m);
    const bareClear = Array.from(bare.clear), bareCap = Array.from(bare.cap);
    // heap material over the holes and around them, unevenly (a hole opening under a pile, or a pile relaxing over
    // a pit's edge before its kept-clear cells are emptied)
    const { x0, z0 } = moundOrigin(m);
    for (let i = 0; i < m.n * m.n; i++) {
      const x = x0 + (i % m.n) * m.cell, z = z0 + Math.floor(i / m.n) * m.cell;
      let d = Infinity;
      for (const [dx, dz, r] of holes) d = Math.min(d, Math.hypot(x - (c + dx * bu), z - (c + dz * bu)) - r * bu);
      m.h[i] = d < 8 * bu ? 2 * bu * (1 + 0.5 * Math.sin(i)) : 0;
    }
    rt.moundMasks.delete(m.id);
    const heaped = moundMask(sim, m);
    expect(bareClear.filter((v) => v === 2).length).toBeGreaterThan(0); // the holes are seen
    expect(Array.from(heaped.clear)).toEqual(bareClear);
    expect(Array.from(heaped.cap)).toEqual(bareCap);
  });
});
