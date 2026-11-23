// Colony-life round 14 (direction 29a item 5): save -> load -> continue on a state with a pile relaxing next to open
// pits. The unsaved sim keeps the mound mask it built when the relaxation began; a loaded one builds it afresh from
// the state; both must then move the same material (sweep 12's sg #2 diverged one tick after its save: the mask's hole
// probe read pile heights the cache key does not follow; moundMaskHeights.test pins the rule).
import { describe, expect, it } from 'vitest';
import { BULKING } from '@/sim/balance/nest';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { carveCapsule } from './carveOps';
import { createMound, deposit } from './mounds';
import { nestSim, playerNest } from './nestTestKit';
import { nestSystem } from './system';

const SYSTEMS = [commandsSystem, nestSystem];

function pileOverPits() {
  const sim = nestSim({ nest: 'small', seed: 7, systems: SYSTEMS });
  const bu = sim.world.bu, c = sim.world.size / 2 + 40 * bu, ground = sim.field.height(c, c);
  const m = createMound(sim, playerNest(sim), null, c, c, 'loam');
  // open pits to the surface across the pile's middle, with their breach records (the mask probes around them)
  for (let k = 0; k < 48; k++) {
    const p = { x: c + ((k % 6) - 2.5) * 6 * bu + 0.37 * k, y: ground, z: c + (Math.floor(k / 6) - 3.5) * 5 * bu - 0.21 * k };
    carveCapsule(sim, { ...p, y: ground - 4 * bu }, { ...p, y: ground + bu }, (0.6 + 0.025 * k) * bu);
    sim.carve.breaches.push({ pos: { ...p }, r: (0.6 + 0.025 * k) * bu });
  }
  // a fresh heap of pellets over them, not yet relaxed
  const vol = 0.85 * BULKING * bu ** 3;
  for (let i = 0; i < 1200; i++) {
    const a = (i * 2.399) % (2 * Math.PI), r = ((i * 7) % 22) + 0.5;
    deposit(sim, m, c + Math.cos(a) * r * bu, c + Math.sin(a) * r * bu, vol);
  }
  m.relaxSweep = 0; m.relaxFlags = 1;
  return sim;
}

describe('save -> load -> continue with a pile relaxing over open pits (round 14)', () => {
  it('the loaded game continues as the unsaved one', () => {
    const a = pileOverPits();
    for (let i = 0; i < 30; i++) a.tick(); // the relaxation is under way, its mask cached
    const b = createSim(restore(snapshot(a)).state, a.world, { systems: SYSTEMS });
    for (let i = 0; i < 600; i++) { a.tick(); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(a.state));
  }, 120_000);
});
