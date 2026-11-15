// GDD 06 §5.5 reserves and the shelter clock: App. E check 15 and the specified drains.
import { describe, expect, it } from 'vitest';
import { FOUND_SURFACE_EXTRA_PER_GD, FOUND_UPKEEP_PER_GD } from '@/sim/balance/founding';
import { TICKS_PER_DAY } from '@/sim/time';
import { coverLevelAt } from './siteAssess';
import { pinTemperature, phase, queen, searchingSim, slabWorld, stepUntil } from './testkit';

const SLAB_C = 40; // BU, slab centre in the slab world

describe('shelter clock (GDD 06 §5.5, App. E 15)', () => {
  it('in open sun on bare soil at 22 C the queen dries out at 5000 +- 100 ticks and the founding fails (desiccation)', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const q = queen(sim);
    const f = q.queen!.founding!;
    expect(f.desiccation).toBe(0);
    const t0 = sim.state.tick;
    const failed: string[] = [];
    sim.events.on('opening.failed', (e) => failed.push(e.cause));
    stepUntil(sim, () => !q.alive, 6000);
    const ticks = sim.state.tick - t0;
    expect(Math.abs(ticks - 5000)).toBeLessThanOrEqual(100);
    sim.tick();
    expect(phase(sim)).toBe('failed');
    expect(failed).toEqual(['desiccation']);
  }, 60_000);

  it('under a stone (cover 1.0) she is alive at 14000 ticks and dead at 15000 +- 300', () => {
    const sim = searchingSim({ world: slabWorld(SLAB_C, SLAB_C) });
    pinTemperature(sim, 22);
    const bu = sim.world.bu;
    const q = queen(sim);
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: { x: SLAB_C * bu, y: 0.3 * bu, z: SLAB_C * bu } });
    sim.tick();
    expect(coverLevelAt(sim, q.pos.x, q.pos.z).level).toBe('ceiling');
    const t0 = sim.state.tick;
    stepUntil(sim, () => sim.state.tick - t0 >= 14000, 14000);
    expect(q.alive).toBe(true);
    stepUntil(sim, () => !q.alive, 2000);
    expect(Math.abs(sim.state.tick - t0 - 15000)).toBeLessThanOrEqual(300);
  }, 60_000);

  it('reserves drain 0.40 + 0.35 loads per GD above ground, and each dig bite costs 0.02', () => {
    const sim = searchingSim();
    pinTemperature(sim, 22);
    const q = queen(sim);
    const f = q.queen!.founding!;
    const r0 = f.reserveLoads;
    const n = 600;
    for (let i = 0; i < n; i++) sim.tick();
    const perGd = ((r0 - f.reserveLoads) * TICKS_PER_DAY) / n;
    expect(perGd).toBeCloseTo(FOUND_UPKEEP_PER_GD + FOUND_SURFACE_EXTRA_PER_GD, 6);
    // a bite: the action starts, the founding system charges it once
    const before = f.reserveLoads;
    q.action = { id: 'dig-bite', phase: 'active', startTick: sim.state.tick, durationTicks: 13, target: { kind: 'none', id: -1, pos: q.pos }, repeat: false, secondary: false, reason: null };
    sim.tick();
    expect(before - f.reserveLoads).toBeCloseTo(0.02 + (FOUND_UPKEEP_PER_GD + FOUND_SURFACE_EXTRA_PER_GD) / TICKS_PER_DAY, 6);
  }, 60_000);
});
