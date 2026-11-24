// Review of task opening-fix (dryQueen.ts): once the queen stands dry, her walk ends and stays ended. While the walk
// flag is set, keepQueenDry rescans the whole flood cavity (dryFloorAbove) every lapse tick and, possessed, routes
// through the cavity every tick; a flag that never clears would pay that for the rest of a lapse that is skipped one
// tick at a time.
import { describe, expect, it } from 'vitest';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';
import { depthOver, waterView } from '@/sim/nest/flood/dryPlace';
import { FLEE_DRY_MARGIN_BU } from '@/sim/balance/weather';
import { QUEEN_DRY_KEY } from './dryQueen';
import type { Sim } from '@/sim/types';

/** The same scene as dryQueen.test.ts: a sealed ramp cell with rain water in it, the queen laid down in the water. */
function wetLapse(possessed: boolean): Sim {
  const sim = searchingSim({ seed: 2 });
  pinTemperature(sim, 24);
  const r = readyInRampCell(sim);
  sim.enqueue({ type: 'cheat.setRain', intensity: 1 });
  const nest = nestOf(sim), bu = sim.world.bu;
  stepUntil(sim, () => nest.flood.level > r.floor.y + 0.9 * bu, 20_000);
  sim.enqueue({ type: 'cheat.setRain', intensity: 0 });
  act(sim, 'dig-bite');
  walkTo(sim, r.rampAt(1.5), 0.5);
  act(sim, 'seal-entrance');
  stepUntil(sim, () => phase(sim) === 'lay', 20);
  walkTo(sim, r.floor, 0.8);
  for (let i = 0; i < 2; i++) act(sim, 'lay-egg');
  sim.tick();
  if (possessed) sim.enqueue({ type: 'possess', antId: queen(sim).id, via: 'command', dropTo1x: true });
  sim.enqueue({ type: 'openingBeginTimelapse' });
  sim.tick();
  expect(phase(sim)).toBe('timelapse');
  return sim;
}

function depthBu(sim: Sim): number {
  const q = queen(sim), w = waterView(sim, nestOf(sim));
  return w ? depthOver(sim, w, q.pos, q.pos.y - q.up.y * q.footOffset) / sim.world.bu : -Infinity;
}

const walking = (sim: Sim) => (queen(sim).bb[QUEEN_DRY_KEY] ?? 0) === 1;

describe('dryQueen review: the walk ends once she is dry (opening-fix)', () => {
  for (const possessed of [false, true]) {
    it(`${possessed ? 'possessed' : 'not possessed'}: the walk flag clears and stays clear while the water stands`, () => {
      const sim = wetLapse(possessed);
      stepUntil(sim, () => walking(sim), 50);
      expect(walking(sim)).toBe(true);
      // she reaches the dry floor and the walk ends (the stop rule: FLEE_DRY_MARGIN clear of the water)
      const ended = stepUntil(sim, () => !walking(sim), 900);
      expect(walking(sim), `still walking after ${ended} ticks, depth ${depthBu(sim).toFixed(2)} BU`).toBe(false);
      expect(depthBu(sim)).toBeLessThanOrEqual(-FLEE_DRY_MARGIN_BU + 1e-6);
      // then, with the water still in the cell, she does not set off again
      let walkTicks = 0;
      const p0 = { ...queen(sim).pos };
      for (let t = 0; t < 1500 && phase(sim) === 'timelapse'; t++) {
        sim.tick();
        if (walking(sim)) walkTicks++;
      }
      const q = queen(sim);
      expect(q.alive).toBe(true);
      expect(walkTicks).toBe(0);
      expect(Math.hypot(q.pos.x - p0.x, q.pos.z - p0.z) / sim.world.bu).toBeLessThan(1.5);
      if (possessed) {
        const d = sim.state.player.intent.dir;
        expect(Math.hypot(d.x, d.y, d.z)).toBe(0); // held at rest again
      }
    }, 180_000);
  }
});
