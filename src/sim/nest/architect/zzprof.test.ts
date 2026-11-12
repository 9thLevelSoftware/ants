import { it } from 'vitest';
import { archSim } from './architectTestKit';
import { layoutNest, LT } from './layout';
const proc = (globalThis as any).process;
const cpu = () => { const u = proc.cpuUsage(); return (u.user + u.system) / 1000; };
it('prof', () => {
  for (const w of [20, 100, 400]) {
    let best = Infinity, bestLT: Record<string, number> = {};
    for (let rep = 0; rep < 3; rep++) for (let n = 0; n < 5; n++) {
      const { sim, nest } = archSim({ seed: 21 + n, terrain: 'noise', architect: false, template: false });
      for (const k of Object.keys(LT)) delete LT[k]; (globalThis as any).__LT = {};
      const c = cpu(); layoutNest(sim, nest.id, w); const t = cpu() - c; const G = (globalThis as any).__LT ?? {}; Object.assign(LT, G); (globalThis as any).__LT = {};
      if (t < best) { best = t; bestLT = { ...LT }; }
    }
    proc.stderr.write(`${w}: ${best.toFixed(1)} ${Object.entries(bestLT).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' ')}\n`);
  }
}, 300000);
