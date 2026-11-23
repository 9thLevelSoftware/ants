// Colony-life round 14, direction 29 Part C item 1: brood lying on a passage wall is a nurse's first job (the board's
// `rescue`, priority above a starving larva's feed). Round 13's lead: on the small test nest 5 pupae put on the shaft
// wall, 1 back in a brood chamber after 0.6 gd, carriers walking to the surface and back with nothing carried. Pinned
// here for pupae on the entrance shaft's wall, at the shaft's top and bottom, lying on the wall or pushed into it:
// all 5 in a brood chamber within 0.2 gd (direction 29's bar). R14_TRACE=1 prints the pupae and nurses as they go.

import { describe, expect, it } from 'vitest';
import { requestTask } from '@/sim/colony';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeNestColony, run } from './testkit';

const TRACE = !!(globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.R14_TRACE;

/**
 * Pupae on the shaft wall. `depth`: BU under the ground of the spot on the shaft's axis they lie around; `inset`: mm
 * pushed into the wall past its surface (brood rests on, and a little in, the floor it was put down on).
 * Returns the gd until all 5 lie in a brood chamber, or -1 within `maxGd`.
 */
function rescueGd(depth: number, inset: number, maxGd: number): number {
  const k = makeNestColony({ workers: 4, brood: [{ stage: 'pupa', n: 5, chamber: 'nursery', progress: 0.3 }] });
  const { sim, nest, entrance } = k;
  const bu = sim.world.bu, g = entrance.pos.y;
  // the shaft (testing/testNest.ts): from (ex, g + 0.5, ez) BU to (ex + 1.5, g - 3, ez + 0.5), then to the food chamber
  const f = Math.min(1, (depth + 0.5) / 3.5);
  const m = { x: entrance.pos.x + 1.5 * f * bu, y: g - depth * bu, z: entrance.pos.z + 0.5 * f * bu };
  const pupae = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'pupa');
  pupae.forEach((b, i) => {
    const a = (i / pupae.length) * 2 * Math.PI;
    const p = { x: m.x, y: m.y - 0.15 * i * bu, z: m.z };
    for (let r = 0; r < 3 * bu; r += 0.05) {
      const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r;
      if (sim.field.sample({ x, y: p.y, z }) < 0) { p.x = m.x + Math.cos(a) * (r + inset); p.z = m.z + Math.sin(a) * (r + inset); break; }
      p.x = x; p.z = z;
    }
    b.pos = p; b.chamberId = -1; b.nestId = nest.id;
  });
  const nurses = sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker');
  for (const a of nurses) requestTask(sim, a, 'nurse', 'job:test');
  const brood = new Set(nest.chambers.filter((c) => c.type !== 'food').map((c) => c.id));
  const at = (v: { x: number; y: number; z: number }) => `${((v.x - m.x) / bu).toFixed(1)},${((v.y - g) / bu).toFixed(1)},${((v.z - m.z) / bu).toFixed(1)}`;
  for (let t = 0; t < maxGd * TICKS_PER_DAY; t += 50) {
    run(sim, 50);
    if (TRACE && t % 200 === 0) {
      console.log(`t ${t + 50}: ${pupae.map((b) => `${b.id}@${at(b.pos)} ch${b.chamberId} by${b.carriedBy}`).join(' | ')}`);
      console.log(`   ${nurses.map((a) => `${a.id} ${a.state} @${at(a.pos)} ch${a.chamberId} carry ${a.carry.kind}:${a.carry.id} nav ${a.nav.status}`).join(' | ')}`);
    }
    if (pupae.every((b) => b.carriedBy < 0 && brood.has(b.chamberId))) return (t + 50) / TICKS_PER_DAY;
  }
  return -1;
}

describe('direction 29 Part C item 1: pupae on a passage wall are carried back', () => {
  for (const [depth, inset] of [[3, 0], [3, 0.3], [0.2, 0.3], [1.25, 0.8]] as const) {
    it(`5 pupae on the shaft wall ${depth} BU down (${inset} mm into it), 4 nurses: all in a brood chamber within 0.2 gd`, () => {
      const gd = rescueGd(depth, inset, 0.2);
      expect(gd).toBeGreaterThan(0);
    }, 120000);
  }
});
