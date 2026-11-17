// nest-fix3 item 4: (a) plugCount counts no ghost plug voxel (a PLUG-flagged carve sample at or above the ground
// surface, open air in the field), and an entrance left with ghosts only goes back to `open`; (b) a founding plan
// (the first workers digging a plug open, colony/founding/reopen.ts) is validated like a player plan: soil thinner
// than the wall minimum to another cavity is a warning, not a refusal, so a deep plug can always be opened.
import { describe, expect, it } from 'vitest';
import { VoxelFlag } from '@/sim/types';
import { carveSphere } from './carveOps';
import { evaluateEntrance, plugCount } from './entrances';
import { createPlanImpl } from './plans/plans';
import { validatePlanImpl } from './plans/validate';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';
import { chunkKey } from './carve/keys';

describe('plug voxels at or above the ground (nest-fix3 item 4a)', () => {
  it('ghosts are not counted; a `sealing` entrance with ghosts only returns to `open`; real plug soil still counts', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), e = nest.entrances[0], v = sim.carve.voxel, flags = nestRuntime(sim).flags;
    expect(e.status).toBe('open');
    // closed carve samples in the throat sphere that are open air in the field (above the ground), flagged PLUG:
    // what a plug fill leaves over the opening; and one closed soil sample of the throat wall for a real plug
    const R = e.radius + 2 * sim.world.bu;
    const ghostsAt: number[][] = [], soil: number[][] = [];
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          if (Math.hypot(i * v - e.pos.x, j * v - e.pos.y, k * v - e.pos.z) > R - v || sim.carve.sampleAt(i, j, k) >= 128) continue;
          const sub = sim.field.substrateXYZ(i * v, j * v, k * v);
          if (sub > 0.5 * v && ghostsAt.length < 6) ghostsAt.push([i, j, k]);
          else if (sub < -v && soil.length < 1) soil.push([i, j, k]);
        }
    for (const [i, j, k] of ghostsAt) flags.add(i, j, k, VoxelFlag.PLUG);
    expect(ghostsAt.length).toBeGreaterThan(0);
    expect(plugCount(sim, e)).toBe(0);
    e.status = 'sealing';
    e.plugVoxelCount = ghostsAt.length;
    evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    expect(soil.length).toBe(1);
    flags.add(soil[0][0], soil[0][1], soil[0][2], VoxelFlag.PLUG);
    expect(plugCount(sim, e)).toBe(1);
  });
});

describe('a `sealing` entrance with founding remnants (colony-life round 1)', () => {
  it('goes back to `open` once the added plug is gone, not only at zero plug voxels', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), e = nest.entrances[0], v = sim.carve.voxel, flags = nestRuntime(sim).flags;
    expect(e.status).toBe('open');
    // real plug soil in the throat wall: closed carve samples below the ground surface
    const R = e.radius + 2 * sim.world.bu;
    const soil: number[][] = [];
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          const dx = i * v - e.pos.x, dy = j * v - e.pos.y, dz = k * v - e.pos.z;
          if (dx * dx + dy * dy + dz * dz > (R - v) * (R - v) || sim.carve.sampleAt(i, j, k) >= 128) continue;
          if (sim.field.substrateXYZ(i * v, j * v, k * v) < -v && soil.length < 6) soil.push([i, j, k]);
        }
    expect(soil.length).toBe(6);
    // the entrance memo re-evaluates on carve changes; the test edits flags only, so it marks the chunks changed
    const rt = nestRuntime(sim);
    const touch = () => { for (const [i, j, k] of soil) { const key = chunkKey(i >> 4, j >> 4, k >> 4); rt.chunkStamp.set(key, (rt.chunkStamp.get(key) ?? 0) + 1); } };
    // four remnants of an earlier plug, left in the throat by a reopening (which records them): still `open`
    for (const [i, j, k] of soil.slice(0, 4)) flags.add(i, j, k, VoxelFlag.PLUG);
    e.plugVoxelCount = 4;
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    expect(e.plugVoxelCount).toBe(4);
    // two more plug voxels: a plug is being added
    for (const [i, j, k] of soil.slice(4)) flags.add(i, j, k, VoxelFlag.PLUG);
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('sealing');
    // one of the added two removed: still sealing
    flags.clear(soil[5][0], soil[5][1], soil[5][2], VoxelFlag.PLUG);
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('sealing');
    // the added plug gone (the remnants stay): `open` again (before: `sealing` until the count reached zero)
    flags.clear(soil[4][0], soil[4][1], soil[4][2], VoxelFlag.PLUG);
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    expect(e.plugBaseline ?? 0).toBe(0);
  });
});

describe('founding plans are validated like player plans (nest-fix3 item 4b)', () => {
  it('a tunnel past another cavity inside the wall minimum: refused for the architect, accepted with a warning for founding', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), bu = sim.world.bu;
    const food = nest.chambers[0];
    // a tunnel from the food chamber's wall outward, and a separate pocket 1 BU beside its far end (loam's wall
    // minimum is larger), not connected to the nest
    const from = { x: food.center.x - food.radii.x + 0.3 * bu, y: food.center.y - food.radii.y + bu, z: food.center.z };
    const to = { x: from.x - 6 * bu, y: from.y, z: from.z };
    carveSphere(sim, { x: to.x, y: to.y, z: to.z + 2.2 * bu }, 0.75 * bu, { force: true });
    const spec = { nestId: nest.id, kind: 'tunnel' as const, anchor: { pos: from, normal: { x: -1, y: 0, z: 0 } }, end: to, priority: 'urgent' as const, confirmWarnings: true };
    const arch = validatePlanImpl(sim, spec, 'architect');
    expect(arch.ok).toBe(false);
    expect(arch.codes).toContain('too-close');
    const found = validatePlanImpl(sim, spec, 'founding');
    expect(found.ok).toBe(true);
    expect(found.warnings).toContain('too-close');
    // without confirmation a founding plan with warnings is not made (as for the player)
    expect(createPlanImpl(sim, { ...spec, confirmWarnings: false }, 'founding')).toBe(-1);
    expect(createPlanImpl(sim, spec, 'founding')).toBeGreaterThan(0);
  });
});
