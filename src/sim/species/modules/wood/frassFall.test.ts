// Frass falls off the wood and settles into a pile at its foot (GDD 07 §6.2.3 `eject-frass`, §5.2.9 moment 3).

import { describe, expect, it } from 'vitest';
// the sim first: entering through a deep module would evaluate module indexes half loaded (import cycles)
import { makeTestSim } from '@/sim/testing/testWorld';
import { nestSystem } from '@/sim/nest';
import { spawnPellet } from '@/sim/nest/pellets';
import { MOUND_BATCH_TICKS, PELLET_SETTLE_S } from '@/sim/balance/nest';
import { TICKS_PER_SECOND } from '@/sim/time';
import type { Item, Sim } from '@/sim/types';
import { installWoodHooks } from './hooks';
import { woodParamsOf } from './params';
import { frassFallPass } from './frassFall';
import { frassTally, pileUnits } from './frass';
import { primOf } from './woodState';
import { primDistance } from './primGeom';
import { BU, LOG_CENTRE, LOG_ID, woodSim } from './testkit';

installWoodHooks();

const RADIUS = 10 * BU; // the test log's radius

function frassAt(sim: Sim, p: { x: number; y: number; z: number }): Item {
  const col = sim.state.colonies[0];
  return spawnPellet(sim, p, 0.85, 'wood-decayed', col.nestIds[0], col.id, -1);
}

describe('frass falls off the wood (GDD 07 §6.2.3)', () => {
  it('frass dropped on top of the log rolls off and lands on the ground beside it', () => {
    const sim = woodSim();
    const it = frassAt(sim, { x: LOG_CENTRE.x, y: LOG_CENTRE.y + RADIUS, z: LOG_CENTRE.z + 3 * BU });
    expect(frassFallPass(sim)).toBe(1);
    expect(Math.abs(it.pos.y - sim.field.height(it.pos.x, it.pos.z))).toBeLessThan(0.3 * BU);
    expect(Math.abs(it.pos.z - LOG_CENTRE.z)).toBeGreaterThan(RADIUS * 0.5);
    expect(primDistance(primOf(sim, LOG_ID)!, it.pos)).toBeGreaterThan(0);
    expect(it.inNest).toBe(false);
  });

  it('frass dropped at a side opening falls to the foot of the log; frass already on the ground stays', () => {
    const sim = woodSim();
    const side = frassAt(sim, { x: LOG_CENTRE.x + 20 * BU, y: LOG_CENTRE.y + 2 * BU, z: LOG_CENTRE.z - RADIUS - 0.2 * BU });
    const gx = 20 * BU, gz = 90 * BU;
    const ground = frassAt(sim, { x: gx, y: sim.field.height(gx, gz), z: gz });
    expect(frassFallPass(sim)).toBe(1);
    expect(side.pos.z).toBeLessThan(LOG_CENTRE.z - RADIUS * 0.6);
    expect(side.pos.y).toBeLessThan(LOG_CENTRE.y);
    expect(ground.pos).toEqual({ x: gx, y: sim.field.height(gx, gz), z: gz });
    expect(frassFallPass(sim)).toBe(0); // once down, nothing moves again
  });

  it('fallen frass settles into a frass pile at the foot of the log, 10 items = 1 pile unit, no loose frass left', () => {
    const sim = woodSim({ systems: [nestSystem] });
    const p = woodParamsOf(sim.species)!;
    const col = sim.state.colonies[0];
    const old = sim.state.tick - PELLET_SETTLE_S * TICKS_PER_SECOND - 1;
    for (let i = 0; i < 10; i++) frassAt(sim, { x: LOG_CENTRE.x + i * 0.4 * BU, y: LOG_CENTRE.y + 1 * BU, z: LOG_CENTRE.z - RADIUS - 0.2 * BU }).droppedTick = old;
    frassFallPass(sim);
    for (let t = 0; t <= MOUND_BATCH_TICKS; t++) sim.tick();
    const piles = sim.state.worldDelta.mounds.filter((m) => m.material === 'frass');
    expect(piles.length).toBe(1);
    expect(pileUnits(piles[0], p)).toBeCloseTo(1, 9);
    expect(sim.state.items.filter((it) => it.alive && it.kind === 'frass').length).toBe(0);
    // the pile lies beside the log, not under it
    expect(piles[0].centerZ).toBeLessThan(LOG_CENTRE.z - RADIUS * 0.6);
    const t = frassTally(sim, col, p);
    expect(t.outdoor).toBeCloseTo(1, 9);
  });
});
