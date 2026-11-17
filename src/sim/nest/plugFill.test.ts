// Colony-life round 4 (suburban-garden #2 after the R20 hand-over): an open entrance went `sealing` 2 gd after the
// hand-over with no ant near it and stayed so: its throat held open carve samples still flagged PLUG (plug soil the
// founding's reopen dug away), soil came back over them (a pellet tamped into the throat) and plugCount rose 6 -> 18.
// `sealing` seeds no exit field: no midden, no waste hauled, 27 of 32 brood lost to hygiene in the one royal chamber.
//
// GDD 03 §4.2: `open` -> `sealing` on "first plug added"; only `seal-entrance` adds plug (nest/entrances.ts
// sealEntranceImpl flags the samples it fills). Soil that refills a throat is soil.
import { describe, expect, it } from 'vitest';
import { VoxelFlag } from '@/sim/types';
import { evaluateEntrance, plugCount, sealEntranceImpl, throatPassage } from './entrances';
import { fillSphere } from './carveOps';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';
import { chunkKey, OPEN_MIN } from './carve/keys';

describe('soil over old plug flags in an open throat is no plug (round 4)', () => {
  it('an open entrance stays `open` when a fill closes open samples that still carry a PLUG flag', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), e = nest.entrances[0], v = sim.carve.voxel, bu = sim.world.bu;
    const flags = nestRuntime(sim).flags, rt = nestRuntime(sim);
    evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    // open samples one BU below the opening, flagged PLUG (what a reopen leaves when it digs plug soil away)
    const c = { x: e.pos.x - e.dir.x * bu, y: e.pos.y - e.dir.y * bu, z: e.pos.z - e.dir.z * bu };
    const r = 0.6 * bu, flagged: number[][] = [];
    for (let k = Math.floor((c.z - r) / v); k <= Math.ceil((c.z + r) / v); k++)
      for (let j = Math.floor((c.y - r) / v); j <= Math.ceil((c.y + r) / v); j++)
        for (let i = Math.floor((c.x - r) / v); i <= Math.ceil((c.x + r) / v); i++) {
          if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) continue;
          flags.add(i, j, k, VoxelFlag.PLUG);
          flagged.push([i, j, k]);
          const key = chunkKey(i >> 4, j >> 4, k >> 4);
          rt.chunkStamp.set(key, (rt.chunkStamp.get(key) ?? 0) + 1);
        }
    expect(flagged.length).toBeGreaterThan(0);
    evaluateEntrance(sim, nest, e); // the open entrance is evaluated (a carve change nearby, the hourly check)
    expect(e.status).toBe('open');
    // soil comes back into the throat (a tamped pellet, debris): a small fill that leaves the throat passable
    fillSphere(sim, c, 0.35 * bu);
    evaluateEntrance(sim, nest, e);
    expect(throatPassage(sim, e, false, nest)).toBe(true);
    expect(plugCount(sim, e)).toBe(0);
    expect(e.status).toBe('open');
  });

  it('a plug added by seal-entrance still makes an open entrance `sealing` or `sealed`', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), e = nest.entrances[0];
    evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    sealEntranceImpl(sim, e.id, -1);
    expect(plugCount(sim, e)).toBeGreaterThan(0);
    expect(['sealing', 'sealed']).toContain(e.status);
  });
});
