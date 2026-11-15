// An idle ant whose wander fails (locomotion could not move it, e.g. on a fin of wall: see
// locomotion/wanderStall.test.ts) walks back toward the centre of its chamber on a planned path and wanders again,
// instead of standing until the next idle cycle (sim-fix-ants review finding 3).
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { makeNestColony } from './testkit';
import { restChamber } from './places';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

describe('idle: a failed wander', () => {
  it('re-centres on a planned walk, then wanders again', () => {
    const k = makeNestColony({ workers: 1, systems: NO_ALLOC, seed: 3 });
    const { sim, nest } = k;
    const a = sim.stores.ants.list.find((x) => x.caste === 'worker')!;
    a.task = 'idle';
    let wandering = -1;
    for (let t = 0; t < 600 && wandering < 0; t++) { sim.tick(); if (a.nav.mode === 'wander' && a.nav.status === 'moving') wandering = t; }
    expect(wandering).toBeGreaterThanOrEqual(0);
    const room = restChamber(sim, nest)!;
    // locomotion ends the wander as it does for a walker that cannot move
    const nav: { status: string; mode: string } = a.nav;
    a.nav.loco!.req = 'none';
    nav.status = 'failed';
    nav.mode = 'none';
    a.thinkTick = sim.state.tick + 1;
    let replanned = false, again = false;
    for (let t = 0; t < 200 && !again; t++) {
      sim.tick();
      if (nav.status === 'moving' && nav.mode !== 'wander') replanned = true;
      if (nav.mode === 'wander' && nav.status === 'moving') again = true;
    }
    expect(again).toBe(true);
    // it either walked (planned) back toward the centre first, or already stood within the re-centre radius
    const d = Math.hypot(a.pos.x - room.center.x, a.pos.z - room.center.z);
    expect(replanned || d < 0.3 * Math.min(room.radii.x, room.radii.z)).toBe(true);
  });
});
