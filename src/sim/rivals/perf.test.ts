// Cost of rival agents (spec: rival ants must cost well under the player's per-ant cost; the outdoor budget is
// 1.2 ms per 500 ants). Two rivals at war field a few hundred agents; the minimum of three segments is reported.
// Load-tolerant limits; FOUNDRESS_PERF_STRICT=1 applies the strict ones.
import { describe, expect, it } from 'vitest';
import type { System } from '@/sim/types';
import { rivalSim, rivalsOf } from './testkit';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const STRICT = env.FOUNDRESS_PERF_STRICT === '1';

describe('rival agent cost', () => {
  it('behaviour think of rival agents and the rivals systems stay cheap', () => {
    const sim = rivalSim({
      seed: 3, sizeBu: 640,
      rivals: [{ species: 'tetramorium-immigrans', dx: -150, dz: 0 }, { species: 'lasius-niger', dx: 150, dz: 0 }],
    });
    sim.tick();
    const [a, b] = rivalsOf(sim);
    sim.enqueue({ type: 'cheat.setRelation', a: a.id, b: b.id, e: 40, state: 'war' });
    for (let i = 0; i < 900; i++) sim.tick();
    const acc: Record<string, number> = {};
    const list = sim.systems as System[];
    const orig = list.map((s) => s.run);
    list.forEach((s, i) => { s.run = (x) => { const t0 = performance.now(); orig[i](x); acc[s.name] = (acc[s.name] ?? 0) + performance.now() - t0; }; });
    let best: { perAgentUs: number; rivalsMs: number; agents: number; sys: Record<string, number> } | null = null;
    try {
      for (let seg = 0; seg < 3; seg++) {
        for (const k of Object.keys(acc)) acc[k] = 0;
        let agents = 0;
        const n = 300;
        for (let i = 0; i < n; i++) { sim.tick(); agents += a.rival.fieldedIds.length + b.rival.fieldedIds.length; }
        const meanAgents = agents / n;
        const perAgentUs = (1000 * (acc.behaviours ?? 0)) / n / Math.max(1, meanAgents);
        const rivalsMs = ((acc['rivals-agents'] ?? 0) + (acc.rivals ?? 0)) / n;
        if (!best || perAgentUs < best.perAgentUs) {
          const sys: Record<string, number> = {};
          for (const [k, v] of Object.entries(acc)) if (v / n > 0.01) sys[k] = +(v / n).toFixed(3);
          best = { perAgentUs, rivalsMs, agents: Math.round(meanAgents), sys };
        }
      }
    } finally {
      list.forEach((s, i) => { s.run = orig[i]; });
    }
    // eslint-disable-next-line no-console
    console.log(`rival agents: ${best!.agents}, behaviour ${best!.perAgentUs.toFixed(2)} us/agent/tick, rivals systems ${best!.rivalsMs.toFixed(3)} ms/tick, per system ms/tick ${JSON.stringify(best!.sys)}`);
    expect(best!.agents).toBeGreaterThan(50);
    expect(best!.perAgentUs).toBeLessThan(STRICT ? 2 : 20);
    expect(best!.rivalsMs).toBeLessThan(STRICT ? 0.3 : 3);
  }, 120_000);
});
