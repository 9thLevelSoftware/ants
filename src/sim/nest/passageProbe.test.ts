// nest-fix3 review (F4, tick spikes): tamping's greedy passage search uses PassageProbe (one read of the box, the
// fill openness kept per sample). Its answers must equal fillKeepsPassages for every subset it is asked about.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import { nestFieldId } from '@/sim/types';
import { fillKeepsPassages, PassageProbe } from './passage';
import { floorSamples, tampPassageSamples } from './tamp';
import { nestSim, playerNest } from './nestTestKit';

/** Deterministic pseudo-random subset mask (no Math.random in sim code or tests). */
function picks(n: number, seed: number): boolean[] {
  let x = seed >>> 0 || 1;
  return Array.from({ length: n }, () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) & 3) !== 0; });
}

describe('PassageProbe equals fillKeepsPassages', () => {
  it('on the floors around the chambers and the throat of the small nest: whole sets, greedy sequences, random subsets', () => {
    const sim = nestSim({ nest: 'small', seed: 1 });
    const nest = playerNest(sim), bu = sim.world.bu, across = tampPassageSamples(sim, nest);
    const points: Vec3[] = [
      ...nest.chambers.map((c) => ({ x: c.center.x, y: c.center.y - c.radii.y, z: c.center.z })),
      ...nest.entrances.map((e) => ({ x: e.pos.x - e.dir.x * 2 * bu, y: e.pos.y - e.dir.y * 2 * bu, z: e.pos.z - e.dir.z * 2 * bu })),
    ];
    // points in the tunnels: up the exit field from the lowest chamber (filling a tunnel floor can split it)
    const exit = nestFieldId(nest.id, { kind: 'exit', id: -1 });
    const low = [...nest.chambers].sort((a, b) => a.center.y - b.center.y)[0];
    const at = { ...low.center };
    for (let n = 0; n < 12; n++) {
      sim.nestNav.lookahead(exit, at, 6, at);
      points.push({ ...at });
    }
    let compared = 0, refused = 0, greedyRefused = 0;
    // the tamp spheres (0.25 BU) and fat ones (1 BU, which do cut tunnels: the refusal path)
    for (const [pi, p] of points.entries()) for (const r of [0.25 * bu, 1 * bu]) {
      for (const rad of [1, 1.5, 2.5]) {
        const floor = floorSamples(sim, p, rad * bu);
        if (floor.length === 0) continue;
        const probe = new PassageProbe(sim, floor, r, across);
        // the whole set
        for (const c of floor) probe.push(c);
        const whole = fillKeepsPassages(sim, floor, r, across);
        expect(probe.keeps()).toBe(whole);
        if (!whole) refused++;
        for (let n = 0; n < floor.length; n++) probe.pop();
        // the greedy sequence of tamp.ts
        const kept: Vec3[] = [];
        for (let n = 0; n < floor.length && n < 24; n++) {
          probe.push(floor[n]); kept.push(floor[n]);
          const ref = fillKeepsPassages(sim, kept, r, across);
          expect(probe.keeps(), `point ${pi} radius ${rad} step ${n}`).toBe(ref);
          compared++;
          if (!ref) { probe.pop(); kept.pop(); greedyRefused++; }
        }
        for (let n = 0; n < kept.length; n++) probe.pop();
        // random subsets
        for (let t = 0; t < 3; t++) {
          const mask = picks(floor.length, 977 * (pi + 1) + 31 * t + Math.round(rad * 10));
          const sub = floor.filter((_, n) => mask[n]);
          for (const c of sub) probe.push(c);
          expect(probe.keeps()).toBe(fillKeepsPassages(sim, sub, r, across));
          for (let n = 0; n < sub.length; n++) probe.pop();
          compared++;
        }
      }
    }

    expect(compared).toBeGreaterThan(40);
    expect(refused).toBeGreaterThan(0); // the refusal path is exercised
    expect(greedyRefused).toBeGreaterThan(0);
    console.log('[passage probe]', JSON.stringify({ compared, refusedWhole: refused, greedyRefused }));
  });
});
