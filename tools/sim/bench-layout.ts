// layoutNest timing (architect acceptance 6, sim-fix-colony item 1): CPU and wall ms, minimum over `reps` passes
// of seeds 11..15 per worker count (the machine is shared: the minimum is the least disturbed run).
//
//   node tools/sim/run-ts.mjs tools/sim/bench-layout.ts [reps=3]

import { archSim } from '@/sim/nest/architect/architectTestKit';
import { layoutNest } from '@/sim/nest/architect/layout';

const proc = (globalThis as unknown as { process: { argv: string[]; cpuUsage(): { user: number; system: number } } }).process;
const cpuMs = (): number => { const u = proc.cpuUsage(); return (u.user + u.system) / 1000; };
const reps = Number(proc.argv[2] ?? 3);
for (let w = 0; w < 3; w++) { const { sim, nest } = archSim({ seed: 99, terrain: 'noise', architect: false, template: false }); layoutNest(sim, nest.id, 400); }
for (const workers of [20, 100, 400]) {
  let cpu = Infinity, wall = Infinity;
  for (let r = 0; r < reps; r++) for (let n = 0; n < 5; n++) {
    const { sim, nest } = archSim({ seed: 11 + n, terrain: 'noise', architect: false, template: false });
    const c0 = cpuMs(), w0 = performance.now();
    layoutNest(sim, nest.id, workers);
    cpu = Math.min(cpu, cpuMs() - c0);
    wall = Math.min(wall, performance.now() - w0);
  }
  console.log(JSON.stringify({ workers, cpu: +cpu.toFixed(1), wall: +wall.toFixed(1) }));
}
