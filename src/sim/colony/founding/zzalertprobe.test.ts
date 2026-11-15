import { describe, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { phase, stepUntil, queen } from './testkit';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('alerts', () => {
  it('opening alerts', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: 1 });
    const seen = new Map<string, string>();
    sim.events.on('alert', (e) => { const a = e.alert; const k = `${a.kind}|${a.level}`; if (!seen.has(k)) { seen.set(k, `${sim.state.tick} ${phase(sim)} title='${a.title}' cause='${a.cause}' diag=${a.diagnosticId}`); } });
    sim.enqueue({ type: 'openingSkipIntro' });
    stepUntil(sim, () => phase(sim) === 'search', 200);
    sim.enqueue({ type: 'possess', antId: queen(sim).id });
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'done' || phase(sim) === 'failed', 6 * 6000);
    stepUntil(sim, () => false, 3000);
    for (const [k, v] of seen) log(k, v);
    log('phase', phase(sim));
  }, 300_000);
});
