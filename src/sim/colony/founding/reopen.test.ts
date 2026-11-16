// Hand-over reopening (GDD 06 §5.13 (b)): after a real plug (seal-entrance), a clutch laid with lay-egg and the
// lapse, the first workers dig the plug open with their own dig behaviour, the entrance stays `open` once the soil
// they left has been tamped (2 GD later), and workers walk out onto the surface.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { isWorkerCaste } from '../census';
import { nestOf, phase, pinTemperature, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';
import { cavityEntrances } from './dig';
import { plugRemnants } from './reopen';

const FAST_C = 28; // fast brood: a short lapse

/** A worker of the player colony out on the surface, at least 3 BU from every entrance of its nest. */
function workerOutside(sim: Sim): boolean {
  const nest = nestOf(sim), bu = sim.world.bu;
  return sim.state.ants.some((a) => a.alive && a.colony === nest.colony && isWorkerCaste(a.caste) && a.nestId < 0
    && sim.field.height(a.pos.x, a.pos.z) - a.pos.y < 0.5 * bu
    && nest.entrances.every((e) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) > 3 * bu));
}

describe('hand-over: the first workers reopen the plugged entrance and leave', () => {
  it('open within 0.5 GD, still open after the leftover soil is tamped (2.5 GD), workers on the surface', () => {
    const sim = searchingSim({ seed: 2 });
    pinTemperature(sim, FAST_C);
    const r = readyInRampCell(sim);
    act(sim, 'dig-bite');
    walkTo(sim, r.rampAt(1.5), 0.5);
    act(sim, 'seal-entrance');
    stepUntil(sim, () => phase(sim) === 'lay', 20);
    expect(phase(sim)).toBe('lay');
    walkTo(sim, r.floor, 0.8);
    for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
    sim.tick();
    sim.enqueue({ type: 'openingBeginTimelapse' });
    stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 40_000);
    expect(phase(sim)).toBe('handover');
    const nest = nestOf(sim);
    const mine = () => cavityEntrances(sim, nest);
    expect(mine().every((e) => e.status !== 'open')).toBe(true);

    const opened = stepUntil(sim, () => mine().some((e) => e.status === 'open'), TICKS_PER_DAY / 2);
    expect(mine().map((e) => e.status)).toContain('open');
    expect(opened).toBeLessThan(TICKS_PER_DAY / 2);
    let out = false;
    for (let t = 0; t < 2.5 * TICKS_PER_DAY; t += 50) {
      stepUntil(sim, () => false, 50);
      out ||= workerOutside(sim);
    }
    const open = mine().find((e) => e.status === 'open');
    expect(open, mine().map((e) => `${e.status}:${e.plugVoxelCount}`).join(',')).toBeDefined();
    // no plug soil left in the throat (carve samples of the old fill at or above the ground surface, `ghost`, are
    // free space in the field already and stay flagged: the nest's count, reported to the nest owner)
    expect(plugRemnants(sim, open!, 'soil')).toEqual([]);
    expect(out).toBe(true);
  }, 120_000);
});
