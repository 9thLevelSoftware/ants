// Independent review of colony-life round 1, fix F1 (entrances.ts: `sealing -> open` at the remnant baseline).
// The round found the trigger of woodland-edge #1's shut-in colony: "a mound pile raised the ground over ghost plug
// samples" (plug count 8 -> 13 with the throat still passable). F1 changed only the way back (`sealing -> open` once
// the count is back to the remnants); these tests check the trigger itself and the way back after it.
//
// GDD 03 §4.2: `open` -> `sealing` on "First plug added"; `sealing` seeds no exit field (D_exit: open entrances only),
// so a passable entrance read as `sealing` shuts the colony in (no foraging, no midden) until it reads `open` again.
import { describe, expect, it } from 'vitest';
import { VoxelFlag } from '@/sim/types';
import { THROAT_BU } from '@/sim/balance/nest';
import { evaluateEntrance, plugCount, throatPassage } from './entrances';
import { createMound, publishMound } from './mounds';
import { moundOrigin } from './moundRelax';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';
import { chunkKey } from './carve/keys';

function setUp() {
  const sim = nestSim({ nest: 'small', seed: 1 });
  const nest = playerNest(sim), e = nest.entrances[0], v = sim.carve.voxel, bu = sim.world.bu;
  const flags = nestRuntime(sim).flags, rt = nestRuntime(sim);
  const R = e.radius + THROAT_BU * bu;
  // ghost plug samples: closed carve samples of the throat sphere just above the ground, outside the opening's disc
  // (what a founding plug fill leaves above the ground around the opening; plugCount ignores them, nest-fix3 4a)
  const ghosts: number[][] = [];
  for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
    for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
      for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
        const dx = i * v - e.pos.x, dy = j * v - e.pos.y, dz = k * v - e.pos.z;
        if (dx * dx + dy * dy + dz * dz > (R - v) * (R - v) || sim.carve.sampleAt(i, j, k) >= 128) continue;
        if (dx * dx + dz * dz < (e.radius + v) * (e.radius + v)) continue;
        const sub = sim.field.substrateXYZ(i * v, j * v, k * v);
        if (sub > 0.25 * v && sub < 1.5 * v && ghosts.length < 5) ghosts.push([i, j, k]); // the run's rise: 8 -> 13
      }
  for (const [i, j, k] of ghosts) flags.add(i, j, k, VoxelFlag.PLUG);
  const touch = () => {
    for (const [i, j, k] of ghosts) { const key = chunkKey(i >> 4, j >> 4, k >> 4); rt.chunkStamp.set(key, (rt.chunkStamp.get(key) ?? 0) + 1); }
  };
  return { sim, nest, e, v, bu, R, ghosts, touch };
}

describe('colony-life round 1, F1: the trigger (a spoil pile over ghost plug samples)', () => {
  it('a pile around a passable open entrance adds no plug, so the entrance stays `open`', () => {
    const { sim, nest, e, bu, R, ghosts, touch } = setUp();
    expect(ghosts.length).toBe(5);
    touch(); evaluateEntrance(sim, nest, e);
    expect(e.status).toBe('open');
    expect(plugCount(sim, e)).toBe(0);
    // a 2 BU spoil ring around the opening (the crater rim the mound batches build), the opening's disc kept clear
    const m = createMound(sim, nest, null, e.pos.x, e.pos.z, 'loam');
    const { x0, z0 } = moundOrigin(m);
    for (let iz = 0; iz < m.n; iz++) for (let ix = 0; ix < m.n; ix++) {
      const idx = iz * m.n + ix;
      const d = Math.sqrt((x0 + ix * m.cell - e.pos.x) ** 2 + (z0 + iz * m.cell - e.pos.z) ** 2);
      if (!Number.isNaN(m.base[idx]) && d >= e.radius + m.cell && d <= R + 2 * m.cell) m.h[idx] = 2 * bu;
    }
    publishMound(sim, m);
    touch(); evaluateEntrance(sim, nest, e);
    const counted = plugCount(sim, e), pass = throatPassage(sim, e, false, nest);
    console.log('[plugBaseline.verify pile]', JSON.stringify({ ghosts: ghosts.length, counted, pass, status: e.status }));
    expect(pass).toBe(true);
    // the pile buried the ghost flags under soil: the count rose with no plug added (the round's measured trigger)
    // and the entrance flips to `sealing` with the throat open. With F1 it reads `open` again only after workers
    // have dug the count back down to the remnants (founding/reopen.ts remnant plans); until then no exit field.
    expect(e.status).toBe('open');
  });
});
