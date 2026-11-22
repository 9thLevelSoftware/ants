// Colony-life round 9, RO1 (sweep 8 suburban-garden #3): GDD 03 §4.2 `reopening` -> `open` needs the plug dug out,
// not only a passage past it. A reopening throat with plug soil the workers can still bite (a closed PLUG sample below
// the ground with a free face neighbour) stays `reopening`; plug soil walled in by plain soil does not hold it.
import { describe, expect, it } from 'vitest';
import { VoxelFlag } from '@/sim/types';
import { evaluateEntrance } from './entrances';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';
import { chunkKey } from './carve/keys';

describe('reopening -> open only once the plug soil is gone (RO1)', () => {
  it('exposed plug soil keeps the throat reopening; walled-in plug soil does not', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), e = nest.entrances[0], v = sim.carve.voxel, flags = nestRuntime(sim).flags;
    expect(e.status).toBe('open');
    const free = (i: number, j: number, k: number) => sim.carve.sampleAt(i, j, k) >= 128 || sim.field.substrateXYZ(i * v, j * v, k * v) > 0;
    const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    // soil samples of the throat wall (closed, below the ground) beside open space, and one deep in the soil
    const R = e.radius + 2 * sim.world.bu;
    const wall: number[][] = [], buried: number[][] = [];
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          const dx = i * v - e.pos.x, dy = j * v - e.pos.y, dz = k * v - e.pos.z;
          if (dx * dx + dy * dy + dz * dz > (R - v) * (R - v) || sim.carve.sampleAt(i, j, k) >= 128) continue;
          if (sim.field.substrateXYZ(i * v, j * v, k * v) >= -v) continue;
          const exposed = faces.some(([a, b, c]) => free(i + a, j + b, k + c));
          if (exposed && wall.length < 4) wall.push([i, j, k]);
          else if (!exposed && buried.length < 1 && faces.every(([a, b, c]) => !free(i + 2 * a, j + 2 * b, k + 2 * c))) buried.push([i, j, k]);
        }
    expect(wall.length).toBe(4);
    expect(buried.length).toBe(1);
    const rt = nestRuntime(sim);
    // the entrance memo re-evaluates on carve changes; the test edits flags only, so it marks the chunks changed
    const touch = () => { for (const [i, j, k] of [...wall, ...buried]) { const key = chunkKey(i >> 4, j >> 4, k >> 4); rt.chunkStamp.set(key, (rt.chunkStamp.get(key) ?? 0) + 1); } };
    // a throat being reopened, its passage dug, plug soil left on its wall: stays `reopening` (before RO1: `open`)
    for (const [i, j, k] of wall) flags.add(i, j, k, VoxelFlag.PLUG);
    e.status = 'reopening';
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('reopening');
    // the diggers bite the last of it away: `open`
    for (const [i, j, k] of wall) flags.clear(i, j, k, VoxelFlag.PLUG);
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    // plug soil walled in by plain soil on every side is no part of the way out: it does not hold the throat
    flags.add(buried[0][0], buried[0][1], buried[0][2], VoxelFlag.PLUG);
    e.status = 'reopening';
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
  });
});
