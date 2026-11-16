// A plug the seal guide had to lay past the throat sphere (deep plugs allowed: a strategy got stuck laying one inside
// it; here the back-fill's plug at the cell's own exit) is dug out by the first workers at the hand-over, through the dig plans
// the founding module asks for (reopen.ts closingPlugPlan); nothing opens it without workers (review of
// viab-founding, findings 2 and 4).
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { isWorkerCaste } from '../census';
import { cavityEntrances } from './dig';
import { plugRemnants } from './reopen';
import { SG } from './sealGuide';
import { SEAL_STRATEGIES } from './sealPlan';
import { throatCase } from './sealKit';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';
import { act, walkTo } from './verifyKit';

/** Seals the 55 deg / 2.1 BU throat with the back-fill strategy, deep plugs allowed from the start; then the lapse. */
function deepSealedToHandover(): { sim: Sim; deepBefore: number } {
  const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
  const sim = c.sim, q = queen(sim);
  pinTemperature(sim, 28); // a short lapse
  sim.enqueue({ type: 'possess', antId: q.id });
  sim.tick();
  q.bb[SG.strategy] = SEAL_STRATEGIES.indexOf('below');
  q.bb[SG.changes] = SEAL_STRATEGIES.length;
  sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
  stepUntil(sim, () => phase(sim) !== 'seal', 3000);
  expect(phase(sim)).toBe('lay');
  const e = cavityEntrances(sim, nestOf(sim))[0];
  // plug voxels past the throat sphere (within 20 BU of the opening, less those in the sphere)
  const deepBefore = plugRemnants(sim, e, 'soil', 20).length - plugRemnants(sim, e, 'soil').length;
  sim.enqueue({ type: 'release', reason: 'player' });
  sim.tick();
  walkTo(sim, c.floor, 0.8);
  for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
  sim.tick();
  sim.enqueue({ type: 'openingBeginTimelapse' });
  stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 40_000);
  expect(phase(sim)).toBe('handover');
  return { sim, deepBefore };
}

describe('a plug laid past the throat sphere', () => {
  it('the first workers dig it out after the hand-over (open within 2 GD)', () => {
    const { sim, deepBefore } = deepSealedToHandover();
    const nest = nestOf(sim);
    expect(deepBefore).toBeGreaterThan(0);
    const opened = stepUntil(sim, () => cavityEntrances(sim, nest).some((x) => x.status === 'open'), 2 * TICKS_PER_DAY);
    expect({ opened: opened < 2 * TICKS_PER_DAY, statuses: cavityEntrances(sim, nest).map((x) => x.status) })
      .toEqual({ opened: true, statuses: ['open'] });
  }, 180_000);

  it('with every worker gone at the hand-over, it stays closed', () => {
    const { sim } = deepSealedToHandover();
    const nest = nestOf(sim);
    for (const a of sim.state.ants) if (a.alive && a.colony === nest.colony && isWorkerCaste(a.caste)) sim.enqueue({ type: 'cheat.kill', id: a.id, cause: 'test' });
    sim.tick();
    const opened = stepUntil(sim, () => cavityEntrances(sim, nest).some((x) => x.status === 'open'), TICKS_PER_DAY / 2);
    expect(opened).toBe(TICKS_PER_DAY / 2);
  }, 180_000);
});
