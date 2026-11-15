// Mound relaxation per tick on a mature pile (sim-fix-colony review, item 3): a settled 6000-pellet heap (30 BU
// radius) gets a 20-pellet batch; the batch's relaxation runs through moundRelaxStep tick by tick. Prints the
// ticks taken and the largest / median CPU ms per tick (and the largest without the final, publishing tick), minimum over `runs` passes (the machine is shared).
//
//   node tools/sim/run-ts.mjs tools/sim/bench-mound.ts [runs=3]

import { createMound, deposit, relax } from '@/sim/nest/mounds';
import { moundRelaxStep } from '@/sim/nest/moundBatch';
import { nestSim, playerNest } from '@/sim/nest/nestTestKit';

const proc = (globalThis as unknown as { process: { argv: string[]; cpuUsage(): { user: number; system: number } } }).process;
const cpuMs = (): number => { const u = proc.cpuUsage(); return (u.user + u.system) / 1000; };
const runs = Number(proc.argv[2] ?? 3);
let worst = Infinity, worstRelax = Infinity, median = Infinity, ticks = 0;
for (let r = 0; r < runs; r++) {
  const sim = nestSim({ nest: 'small', seed: 3 });
  const nest = playerNest(sim);
  const c = sim.world.size / 2, bu = sim.world.bu, vol = 0.85 * 1.25 * bu ** 3;
  const m = createMound(sim, nest, null, c + 40 * bu, c, 'loam');
  for (let i = 0; i < 6000; i++) {
    const a = (i * 2.399) % (2 * Math.PI), rr = (i % 30) + 0.5;
    deposit(sim, m, m.centerX + Math.cos(a) * rr * bu, m.centerZ + Math.sin(a) * rr * bu, vol);
  }
  for (let k = 0; k < 40 && relax(sim, m); k++);
  for (let i = 0; i < 20; i++) deposit(sim, m, m.centerX + (i % 5) * bu, m.centerZ + 10 * bu, vol);
  m.relaxSweep = 0; m.relaxFlags = 1;
  const per: number[] = [];
  while ((m.relaxSweep ?? -1) >= 0 && per.length < 1000) {
    const t0 = cpuMs();
    moundRelaxStep(sim);
    per.push(cpuMs() - t0);
    sim.state.tick++;
  }
  const last = per[per.length - 1]; // the tick the relaxation ends also publishes the pile (overlay, nav cells)
  worstRelax = Math.min(worstRelax, Math.max(...per.slice(0, -1)));
  void last;
  per.sort((a, b) => a - b);
  worst = Math.min(worst, per[per.length - 1]);
  median = Math.min(median, per[per.length >> 1]);
  ticks = per.length;
}
console.log(JSON.stringify({ case: 'mature-6000+20', ticks, maxPerTickCpuMs: +worst.toFixed(2), maxBeforePublishCpuMs: +worstRelax.toFixed(2), medianPerTickCpuMs: +median.toFixed(2) }));
