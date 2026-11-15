import { describe, it } from 'vitest';
import { begin } from '@/sim/ants';
import { cavityEntrances } from './dig';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';
import { throatCase } from './sealKit';
import { leakPath } from './sealPlan';
import { SG } from './sealGuide';

const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);

describe('probe', () => {
  it('seal cases', () => {
    const pitches = (env.env.P ?? '30,45,55,70,85').split(',').map(Number);
    const widths = (env.env.W ?? '1.5,2.1,3.0').split(',').map(Number);
    const soils = (env.env.S ?? 'loam,sand').split(',');
    for (const soil of soils) for (const p of pitches) for (const w of widths) {
      const c = throatCase({ pitchDeg: p, widthBu: w, soil: soil as 'loam' });
      const sim = c.sim;
      pinTemperature(sim, 22);
      const q = queen(sim);
      if (env.env.POSS) { sim.enqueue({ type: 'possess', antId: q.id }); sim.tick(); }
      const refused: string[] = [];
      sim.events.on('action-failed', (e) => { if (e.antId === q.id) refused.push(`${e.action}:${e.reason}`); });
      const ph0 = phase(sim);
      const t0 = sim.state.tick;
      if (env.env.POSS) sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
      else begin(sim, q, 'seal-entrance', null);
      const n = stepUntil(sim, () => phase(sim) !== 'seal', 4000);
      const ents = cavityEntrances(sim, nestOf(sim)).map((e) => `${e.status}:${e.plugVoxelCount}`).join(',');
      log(soil, p, w, 'start', ph0, 'ticks', n, 'phase', phase(sim), 'ents', ents, 'plugs', q.bb[SG.total], 'guide', q.bb[SG.state], 'replans', q.bb[SG.replans], 'leak', leakPath(sim, nestOf(sim)) ? 'yes' : 'no', 'refused', [...new Set(refused)].join(','));
    }
  }, 900_000);
});
