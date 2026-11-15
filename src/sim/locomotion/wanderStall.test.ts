// A walker that cannot move (a fin or lip of carved soil rejects every step) must not stand at "moving, speed 0"
// for long (sim-fix-ants review finding 3). The nest geometry that caused it in the 2-game-day soak is dug during the
// run, so these tests drive the decision logic directly: aiUpdate on a walker that never moves (no walker step).
// The soak itself is behaviours/nest/sfaReviewStall.verify.test.ts (FOUNDRESS_LONG=1).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant } from '@/sim/types';
import { TICKS_PER_SECOND } from '@/sim/time';
import { navTo, navWander } from './index';
import { rt } from './runtime';
import { aiUpdate } from './update';
import { deepestChamber, locoSim, placeInChamber, playerNest, workers } from './testkit';

const DT = 1 / TICKS_PER_SECOND;

function standingWalker(): { sim: ReturnType<typeof locoSim>; a: Ant } {
  const sim = locoSim({ nest: 'small', workers: 1, sizeBu: 300 });
  const nest = playerNest(sim), room = deepestChamber(nest);
  const [a] = workers(sim);
  placeInChamber(sim, [a], nest, room);
  return { sim, a };
}

/** Advances the clock and runs only the navigation decision: the walker stays exactly where it is. */
function decide(sim: ReturnType<typeof locoSim>, a: Ant, ticks: number, out: Vec3): void {
  const r = rt(sim);
  for (let i = 0; i < ticks && a.nav.loco && a.nav.loco.req !== 'none' && a.medium !== 'air'; i++) {
    sim.state.tick++;
    aiUpdate(sim, a, a.nav.loco, r, a.id, DT, out);
    a.speed = 0;
  }
}

describe('a wander that cannot move', () => {
  it('pivots after wanderStallS, then fails (mode none) when the pivot frees nothing', () => {
    const { sim, a } = standingWalker();
    const P = rt(sim).P, out = { x: 0, y: 0, z: 0 };
    expect(a.up.y).toBeGreaterThan(P.pinnedUpY); // on the floor: the pinned let-go does not apply
    expect(navWander(sim, a, a.pos, 4 * sim.world.bu)).toBe(true);
    decide(sim, a, Math.round(P.wanderStallS * TICKS_PER_SECOND) + 1, out);
    // pivoting: the desired direction is a quarter turn from the heading
    expect(a.nav.status).toBe('moving');
    const l = Math.hypot(out.x, out.y, out.z);
    expect(Math.abs((out.x * a.fwd.x + out.y * a.fwd.y + out.z * a.fwd.z) / l)).toBeLessThan(1e-6);
    decide(sim, a, Math.round((P.wanderPivotS + P.wanderStallS) * TICKS_PER_SECOND) + 2, out);
    expect(a.nav.status).toBe('failed');
    expect(a.nav.mode).toBe('none');
  });

  it('more than wanderStallMax stalls in one request end it, even when each pivot moved the walker a little', () => {
    const { sim, a } = standingWalker();
    const P = rt(sim).P, out = { x: 0, y: 0, z: 0 }, s = () => a.nav.loco!;
    navWander(sim, a, a.pos, 4 * sim.world.bu);
    let stalls = 0;
    for (let t = 0; t < 100 * TICKS_PER_SECOND && a.nav.status === 'moving'; t++) {
      decide(sim, a, 1, out);
      // each pivot "frees" the walker: progress resets the rung, the next stall is a new episode
      if (s().ladder === 1) { stalls++; s().ladder = 0; s().bestTick = sim.state.tick; s().ladderUntil = 0; }
    }
    expect(a.nav.status).toBe('failed');
    expect(stalls).toBe(P.wanderStallMax);
  });
});

describe('a walker pinned on a wall of a cavity', () => {
  for (const req of ['wander', 'goto'] as const) {
    it(`${req}: lets go after pinnedS without progress and drops`, () => {
      const { sim, a } = standingWalker();
      const P = rt(sim).P, out = { x: 0, y: 0, z: 0 };
      if (req === 'wander') navWander(sim, a, a.pos, 4 * sim.world.bu);
      else navTo(sim, a, { x: a.pos.x + 30 * sim.world.bu, y: a.pos.y, z: a.pos.z }, sim.world.bu);
      // the walker stands on a wall (its pose; nothing moves it in this test)
      a.medium = 'cavity';
      a.up = { x: 1, y: 0, z: 0 };
      a.fwd = { x: 0, y: -1, z: 0 };
      decide(sim, a, Math.round(P.pinnedS * TICKS_PER_SECOND) + 2, out);
      expect(a.medium).toBe('air');
      expect(a.nav.status).toBe('moving'); // the request goes on after the landing
    });
  }
});
