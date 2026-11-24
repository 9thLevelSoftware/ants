// Task opening-fix (seed 2 of the browser's first play, Nov 23): rain caught by the open shaft while the queen dug
// stays in the sealed cell; the queen left standing in it was held at rest for the whole time-lapse and drowned
// ("Water filled the burrow"). In the lapse she walks out of the water by herself (dryQueen.ts), possessed or not.
import { describe, expect, it } from 'vitest';
import { nestOf, phase, pinTemperature, queen, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';
import { depthOver, waterView } from '@/sim/nest/flood/dryPlace';
import { FLOOD_ANT_SUB_KEY, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import type { Sim } from '@/sim/types';

/** A sealed ramp cell with rain water in it and the queen on its floor, laying; ends with the lapse begun. */
function wetLapse(possessed: boolean): Sim {
  const sim = searchingSim({ seed: 2 });
  pinTemperature(sim, 24);
  const r = readyInRampCell(sim);
  // rain into the open shaft (GDD 03 §11.1) until the cell holds water a body height deep at its floor
  sim.enqueue({ type: 'cheat.setRain', intensity: 1 });
  const nest = nestOf(sim), bu = sim.world.bu;
  stepUntil(sim, () => nest.flood.level > r.floor.y + 0.9 * bu, 20_000);
  sim.enqueue({ type: 'cheat.setRain', intensity: 0 });
  act(sim, 'dig-bite');
  walkTo(sim, r.rampAt(1.5), 0.5);
  act(sim, 'seal-entrance');
  stepUntil(sim, () => phase(sim) === 'lay', 20);
  expect(phase(sim)).toBe('lay');
  walkTo(sim, r.floor, 0.8); // down into the water, as the player left her
  for (let i = 0; i < 2; i++) act(sim, 'lay-egg');
  expect(sim.state.brood.filter((b) => b.alive).length).toBeGreaterThan(0);
  sim.tick(); // the lay phase counts the batch
  if (possessed) sim.enqueue({ type: 'possess', antId: queen(sim).id, via: 'command', dropTo1x: true });
  sim.enqueue({ type: 'openingBeginTimelapse' });
  sim.tick();
  expect(phase(sim)).toBe('timelapse');
  return sim;
}

function queenDepthBu(sim: Sim): number {
  const q = queen(sim), w = waterView(sim, nestOf(sim));
  return w ? depthOver(sim, w, q.pos, q.pos.y - q.up.y * q.footOffset) / sim.world.bu : -Infinity;
}

describe('the sealed queen walks out of the cell water in the time-lapse (opening-fix)', () => {
  for (const possessed of [true, false]) {
    it(`${possessed ? 'possessed' : 'not possessed'}: she starts in water and stands dry within 60 game s, alive`, () => {
      const sim = wetLapse(possessed);
      expect(sim.state.player.possessedAntId === queen(sim).id).toBe(possessed);
      const d0 = queenDepthBu(sim);
      expect(d0).toBeGreaterThan(0.5); // deep enough to drown her where she stands
      stepUntil(sim, () => queenDepthBu(sim) <= -0.5, 600);
      for (let i = 0; i <= FLOOD_STEP_TICKS; i++) sim.tick(); // a flood step reads her dry (the submersion clock resets)
      const q = queen(sim);
      expect(q.alive).toBe(true);
      expect(queenDepthBu(sim)).toBeLessThanOrEqual(-0.5);
      expect(q.bb[FLOOD_ANT_SUB_KEY] ?? 0).toBe(0);
      expect(phase(sim)).toBe('timelapse');
    }, 120_000);
  }
});
