import { describe, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY, currentSeason, currentDayOfSeason } from '@/sim/time';
import { foundingView } from './view';
import { nestOf, phase, queen, stepUntil } from './testkit';
import { cellTempC } from './clutch';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('outcome', () => {
  it('trace', () => {
    const sim = makeTestSim({ sizeBu: 128, seed: Number(env.env.SEED ?? 1) });
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'timelapse', 6000);
    log('lapse start', sim.state.tick, currentSeason(sim.state), currentDayOfSeason(sim.state), 'eggs', queen(sim).queen?.founding?.eggsLaid);
    const t0 = sim.state.tick;
    for (let d = 0; d < 80 && phase(sim) === 'timelapse'; d++) {
      stepUntil(sim, () => phase(sim) !== 'timelapse', TICKS_PER_DAY / 8);
      const tl = sim.state.player.timelapse;
      log(((sim.state.tick - t0) / TICKS_PER_DAY).toFixed(2), currentSeason(sim.state), currentDayOfSeason(sim.state), 'T', cellTempC(sim, nestOf(sim), queen(sim)).toFixed(1), JSON.stringify(tl?.counters ?? {}));
    }
    log('end', phase(sim), JSON.stringify(foundingView(sim)?.outcome), 'hazards', JSON.stringify(sim.state.player.opening?.hazardLog), 'Q', sim.state.player.opening?.siteQ, JSON.stringify(sim.state.player.opening?.siteFactors));
  }, 300_000);
});
