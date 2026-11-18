// Independent review after colony-life round 6 (fix RS, sweep-5 finding 2 "save -> load changes the run"). RS
// registers the human-event terrain deltas as field overlays when the Sim is built, so the ground reads the same
// before the first tick after a load. The restored game still leaves the live one: on the playground-park #3 hand-over
// (8 save points, 1000 ticks apart) the state hash differs 21-141 ticks after every load
// (`test-output/colony-life/round-6/probe-restore-review-pp3.txt`); the first difference is mound 4060's relaxation
// (relaxFlags, relaxRow, h), then the walkers on it. Its cached mound mask (nest runtime) has 744 hole cells, a fresh
// build 782: the cells that differ lie under a footprint (field 2.8 mm below the pile base), deeper than
// MOUND_HOLE_PROBE_DEPTH_BU (0.4 mm), so a fresh build reads the print as an open hole. The mask cache is dropped on
// carves, entrance changes and breach changes only, not when a footprint presses the ground on the grid: the live
// game keeps the mask built before the print, the loaded one builds it after.
//
// Rule checked: after a footprint is pressed beside a breach on the grid, the cached mask equals the mask a fresh
// build gives and the mask a loaded game builds (as moundMaskCache.verify does for breaches). Whether a print should
// count as an open hole at all (MOUND_HOLE_PROBE_DEPTH_BU against FOOT_PRINT_MM) is a separate question for the
// owner; this test pins only that live and loaded games agree.
import { describe, expect, it } from 'vitest';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { deformDisc, pressPrint } from '@/sim/environment/human/effects/terrain';
import { carveCapsule } from './carveOps';
import { moundMask } from './moundRelax';
import { createMound } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestRuntime } from './runtime';

describe('review colony-life round 6 (RS): the mound mask after a footprint', () => {
  // Round 7 answered the owner's question: a print is a dent, not a hole (the hole probe reads the ground as pressed
  // now, moundRelax.ts buildMask), and the mask's key covers the terrain deltas over the grid. The review's
  // precondition "the print changes the mask" therefore holds only where the print opens a cavity (second case).
  function setup() {
    const sim = nestSim({ nest: 'none', seed: 1 });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ground = sim.field.height(c, c);
    const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
    const a = { x: c - 6 * bu, y: ground, z: c };
    carveCapsule(sim, { ...a, y: ground - 4 * bu }, { ...a, y: ground + bu }, 1.5 * bu);
    return { sim, bu, ground, m, a };
  }
  const holes = (x: Uint8Array): number => x.reduce((n, v) => n + (v === 2 ? 1 : 0), 0);
  function check(sim: ReturnType<typeof setup>['sim'], m: ReturnType<typeof setup>['m'], before: Uint8Array, printMatters: boolean) {
    const cached = moundMask(sim, m);
    nestRuntime(sim).moundMasks.delete(m.id);
    const built = moundMask(sim, m);
    const msg = `hole cells: before the print ${holes(before)}, cached after ${holes(cached.clear)}, fresh build ${holes(built.clear)}`;
    if (printMatters) expect(holes(built.clear), msg).toBeGreaterThan(holes(before));
    else expect(Array.from(built.clear), msg).toEqual(Array.from(before));
    // a game loaded now builds its mask from the pressed ground: the live game must have that mask too
    const loaded = createSim(restore(snapshot(sim)).state, sim.world);
    const lm = loaded.state.worldDelta.mounds.find((x) => x.id === m.id)!;
    expect(Array.from(moundMask(loaded, lm).clear), msg).toEqual(Array.from(built.clear));
    expect(Array.from(cached.clear), msg).toEqual(Array.from(built.clear));
  }

  it('a footprint pressed beside a breach on the grid is a dent: the mask is unchanged, live and loaded agree', () => {
    const { sim, bu, m, a } = setup();
    sim.carve.breaches.length = 0;
    sim.carve.breaches.push({ pos: { ...a }, r: bu });
    const before = Array.from(moundMask(sim, m).clear); // cached now
    // a footprint 3 mm deep beside the breach, inside the breach's probe disc (r + MOUND_BREACH_PROBE_BU)
    deformDisc(sim, a.x + 2.5 * bu, a.z, 30, (d) => -3 * (1 - d * d), 'footprint', pressPrint);
    check(sim, m, Uint8Array.from(before), false);
  });

  it('a footprint that opens a cavity just under the ground: cached mask equals a fresh build and the loaded game', () => {
    const { sim, bu, ground, m, a } = setup();
    // a gallery whose roof lies about 1.5 mm under the ground, beside the breach (inside its probe disc)
    const r = 1.5 * bu, y = ground - r - 1.5;
    carveCapsule(sim, { x: a.x + 1.5 * bu, y, z: a.z - bu }, { x: a.x + 2.75 * bu, y, z: a.z + bu }, r);
    sim.carve.breaches.length = 0;
    sim.carve.breaches.push({ pos: { ...a }, r: bu });
    const before = Array.from(moundMask(sim, m).clear); // cached now
    deformDisc(sim, a.x + 2.5 * bu, a.z, 30, (d) => -3 * (1 - d * d), 'footprint', pressPrint);
    check(sim, m, Uint8Array.from(before), true);
  });
});
