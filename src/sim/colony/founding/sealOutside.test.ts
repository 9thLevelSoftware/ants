// The seal guide with the queen out of her cavity (viab-founding item 2, review findings 1 and 3): she walks back in
// by the opening and seals from inside; she never bites a new hole from where she stands; shut out above a fill she
// bites back through the throat she was shut out of. Flat loam throat of sealKit.ts.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { OPEN_AUTO_SEAL_GD } from '@/sim/balance/founding';
import { FB } from './access';
import { SG } from './sealGuide';
import { throatCase } from './sealKit';
import { cellReachesAir, queenInCavity } from './sealPlan';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';

function onSurface(sim: Sim, x: number, z: number) {
  return { x, y: sim.field.height(x, z) + 0.5 * sim.world.bu, z };
}

describe('the queen out on the surface in phase seal', () => {
  it('the passive player (not possessed) 10 BU from the opening walks back in and seals; no new opening', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, q = queen(sim), nest = nestOf(sim);
    pinTemperature(sim, 22);
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: onSurface(sim, c.mouth.x - 10 * bu, c.mouth.z) });
    sim.tick();
    const before = nest.entrances.length;
    // the passive clock (OPEN_AUTO_SEAL_GD of phase age) and then the seal itself
    stepUntil(sim, () => phase(sim) !== 'seal', OPEN_AUTO_SEAL_GD * TICKS_PER_DAY + 3000);
    expect({ phase: phase(sim), entrances: nest.entrances.length, air: cellReachesAir(sim, nest), alive: q.alive })
      .toEqual({ phase: 'lay', entrances: before, air: false, alive: true });
  }, 90_000);

  it('shut out above a fill in the throat, she bites back through it at the opening (not where she stands) and seals', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, q = queen(sim), nest = nestOf(sim);
    pinTemperature(sim, 22);
    // loose fill across the shaft 2.5 BU below the opening: the cell no longer reaches the air, she is outside
    sim.enqueue({ type: 'cheat.fillSphere', pos: c.shaftAt(2.5), r: 1.6 * bu, loose: true });
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: onSurface(sim, c.mouth.x - 6 * bu, c.mouth.z) });
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    expect(cellReachesAir(sim, nest)).toBe(false);
    const before = nest.entrances.length;
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    // every bite she takes outside her cavity (the founding bite counter) is taken in the throat, at the opening
    let farBite = false, bites = q.bb[FB.bites] ?? 0;
    stepUntil(sim, () => {
      const n = q.bb[FB.bites] ?? 0;
      if (n > bites && !queenInCavity(sim, nest, q) && Math.hypot(q.pos.x - c.mouth.x, q.pos.z - c.mouth.z) > 4 * bu) farBite = true;
      bites = n;
      return phase(sim) !== 'seal';
    }, 4000);
    expect({ phase: phase(sim), entrances: nest.entrances.length, farBite, air: cellReachesAir(sim, nest) })
      .toEqual({ phase: 'lay', entrances: before, farBite: false, air: false });
  }, 90_000);

  it('after the player takes her back the guide waits: no movement input of its own while she is outside', () => {
    const c = throatCase({ pitchDeg: 55, widthBu: 2.1, soil: 'loam' });
    const sim = c.sim, bu = sim.world.bu, q = queen(sim);
    pinTemperature(sim, 22);
    sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: onSurface(sim, c.mouth.x - 10 * bu, c.mouth.z) });
    sim.enqueue({ type: 'possess', antId: q.id });
    sim.tick();
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => (q.bb[SG.state] ?? 0) === 4, 50); // walking back in
    // the player steers her away for a while, then lets go
    for (let t = 0; t < 30; t++) { const d = sim.state.player.intent.dir; d.x = 0; d.y = 0; d.z = 1; sim.tick(); }
    const d = sim.state.player.intent.dir;
    d.x = 0; d.z = 0;
    stepUntil(sim, () => false, 100);
    expect({ state: q.bb[SG.state] ?? 0, intent: Math.hypot(d.x, d.y, d.z) }).toEqual({ state: 0, intent: 0 });
  }, 90_000);
});
