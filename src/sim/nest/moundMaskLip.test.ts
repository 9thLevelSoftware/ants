// Task opening-fix (integrator ruling 1; direction 30b item 5): the mound mask's hole probe reads the field f without
// the pile overlays, as wide as round 12's probe (which read f with them) and as exact on restore as round 14's (which
// read the carve cavity alone). f's smooth union of soil and cavity is positive on the steep lip of a pit where the
// cavity itself is not yet open, so the piles keep off the lip: with the cavity-only probe spoil lay there, the player's
// seal on seed 2 shrank from 229 to 93 plug voxels and the colony's trips and brood flooding got worse.
import { describe, expect, it } from 'vitest';
import { heightAt } from '@/sim/world/terrainSample';
import { MOUND_HOLE_PROBE_DEPTH_BU } from '@/sim/balance/nest';
import { carveCapsule } from './carveOps';
import { moundMask, moundOrigin } from './moundRelax';
import { createMound } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';

describe('mound mask: the hole probe keeps piles off a pit\'s lip (opening-fix)', () => {
  it('cells where f is open under the ground but the carve cavity is not are kept clear, piles or not', () => {
    const sim = nestSim({ nest: 'none', seed: 1 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ground = sim.field.height(c, c);
    const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
    sim.carve.breaches.length = 0;
    const p = { x: c + 3.3 * bu, y: ground, z: c - 2.1 * bu };
    carveCapsule(sim, { ...p, y: ground - 4 * bu }, { ...p, y: ground + bu }, 1.4 * bu);
    sim.carve.breaches.push({ pos: { ...p }, r: 1.4 * bu });
    const rt = nestRuntime(sim);
    rt.moundMasks.delete(m.id);
    const mask = moundMask(sim, m);
    const { x0, z0 } = moundOrigin(m), depth = MOUND_HOLE_PROBE_DEPTH_BU * bu;
    let lip = 0, holes = 0;
    for (let i = 0; i < m.n * m.n; i++) {
      if (mask.clear[i] !== 2) continue;
      holes++;
      const x = x0 + (i % m.n) * m.cell, z = z0 + Math.floor(i / m.n) * m.cell;
      if (sim.carve.cavity(x, heightAt(sim.world.terrain, x, z) - depth, z) <= 0) lip++;
    }
    expect(holes).toBeGreaterThan(0);
    expect(lip).toBeGreaterThan(0); // the cavity-only probe of round 14 marks none of these
    // heap a pile over the lip: a fresh mask is the same (the probe leaves the pile overlays out)
    const before = Array.from(mask.clear);
    for (let i = 0; i < m.n * m.n; i++) m.h[i] = 1.5 * bu;
    rt.moundMasks.delete(m.id);
    expect(Array.from(moundMask(sim, m).clear)).toEqual(before);
  });
});
