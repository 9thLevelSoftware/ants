import { describe, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { phase, pinTemperature, stepUntil } from './testkit';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('p', () => {
  it('lapse', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: 1 });
    pinTemperature(sim, 19.5);
    sim.events.on('opening.phase', (e) => log(sim.state.tick, e.from, '>', e.to));
    sim.events.on('command-rejected', (e) => log('rej', sim.state.tick, e.commandType, e.reason));
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'lay', 2000);
    log('at', sim.state.tick, phase(sim), 'poss', sim.state.player.possessedAntId);
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === "failed", 40000);
    log('end', sim.state.tick, phase(sim));
  }, 120_000);
});
