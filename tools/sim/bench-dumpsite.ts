// internalDumpSite timing (sim-fix-colony item 2, review): one sealed 400-worker layout, the query after a carve
// inside the nest (recompute) and after a carve far away (cached); min / median over `reps` calls.
//
//   node tools/sim/run-ts.mjs tools/sim/bench-dumpsite.ts [reps=5]

import { archSim } from '@/sim/nest/architect/architectTestKit';
import { layoutNest } from '@/sim/nest/architect/layout';
import { internalDumpSite } from '@/sim/nest/deadEnd';

const proc = (globalThis as unknown as { process: { argv: string[] } }).process;
const reps = Number(proc.argv[2] ?? 5);
const { sim, nest } = archSim({ seed: 11, terrain: 'noise', architect: false, template: false });
layoutNest(sim, nest.id, 400);
const bu = sim.world.bu, c = nest.chambers[0].center;
const time = (f: () => void): number => { const t0 = performance.now(); f(); return performance.now() - t0; };
const stats = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return { min: +s[0].toFixed(2), median: +s[s.length >> 1].toFixed(2) }; };
const first = time(() => internalDumpSite(sim, nest.id));
const near: number[] = [], far: number[] = [];
for (let r = 0; r < reps; r++) {
  sim.kernel.carveSphere({ x: c.x, y: c.y - 3 * bu - r * 0.4 * bu, z: c.z }, 0.6 * bu, { force: true });
  near.push(time(() => internalDumpSite(sim, nest.id)));
  sim.kernel.carveSphere({ x: sim.world.size * 0.1 + r * bu, y: -10 * bu, z: sim.world.size * 0.1 }, 0.6 * bu, { force: true });
  far.push(time(() => internalDumpSite(sim, nest.id)));
}
console.log(JSON.stringify({ chambers: nest.chambers.length, first: +first.toFixed(2), afterNestCarve: stats(near), afterFarCarve: stats(far), site: internalDumpSite(sim, nest.id) }));
