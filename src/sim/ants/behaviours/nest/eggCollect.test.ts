// Queen-carers collect the eggs the queen lays and carry them to the egg pile (GDD 02 §10.5, §10.4.1) — but only
// when the pile lies out of the queen's collect reach. In a founding chamber (2 x 2.25 BU, the hand-over nest of
// every colony-life run) the pile opposite her is still within EGG_COLLECT_BU of her: the carers picked the same
// eggs up and put them down again about 500 times a game day each, and the eggs, always in someone's jaws or
// claimed, died untended (colony-life round 1, kitchen-door #3: 10 of 10 eggs lost).
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { EGG_COLLECT_BU } from '@/sim/balance/nestwork';
import type { Ant, Chamber, Sim } from '@/sim/types';
import { placeOnSurface } from '@/sim/locomotion';
import { forceClimate, makeNestColony } from './testkit';
import { floorPoint } from './places';

/** The queen of a founding cell sits in its middle (0.2 BU from the centre at the runs' hand-over). */
function seatAtCentre(sim: Sim, q: Ant, room: Chamber): void {
  if (!placeOnSurface(sim, q, floorPoint(room, 0, 0, { x: 0, y: 0, z: 0 }), { x: 0, y: -1, z: 0 })) throw new Error('no floor');
}

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

/** Egg pick-ups by queen-carers over `ticks`, with the eggs' chamber the warmest (the best for eggs). */
function carerPickUps(shrinkRoyal: boolean, ticks: number): { pickUps: number; eggs: number; nearQueen: number } {
  const k = makeNestColony({ workers: 2, stores: { c: 50, p: 50 }, systems: NO_ALLOC });
  const { sim, royal, queen, nursery, food } = k;
  // the queen's chamber is the only brood chamber, as in a founding nest at the hand-over
  nursery.type = 'general'; food.type = 'food';
  if (shrinkRoyal) { royal.radii.x = 2 * sim.world.bu; royal.radii.y = 1.25 * sim.world.bu; royal.radii.z = 2.25 * sim.world.bu; royal.type = 'founding'; seatAtCentre(sim, queen, royal); }
  forceClimate(k, () => [25, 80]);
  for (const a of sim.stores.ants.list) if (a.caste === 'worker') a.task = 'queen-care';
  // eggs at the queen's feet
  sim.enqueue({ type: 'cheat.spawnBrood', colonyId: sim.state.colonies[0].id, stage: 'egg', n: 4, chamberId: royal.id, progress: 0, destined: 'worker' });
  sim.applyPendingCommands();
  for (const b of sim.stores.brood.list) b.pos = { x: queen.pos.x, y: queen.pos.y - queen.up.y * queen.footOffset, z: queen.pos.z };
  let pickUps = 0;
  sim.events.on('action-completed', (e) => {
    const a = sim.stores.ants.get(e.antId);
    if (e.action === 'pick-up' && a?.task === 'queen-care' && e.target?.kind === 'brood') pickUps++;
  });
  // the founding queen stays in the middle of her cell (as at the runs' hand-over), wherever her seat would be
  for (let t = 0; t < ticks; t++) { sim.tick(); if (shrinkRoyal && t % 10 === 0) seatAtCentre(sim, queen, royal); }
  const eggs = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg');
  const r = EGG_COLLECT_BU * sim.world.bu;
  const nearQueen = eggs.filter((b) => b.carriedBy < 0 && Math.hypot(b.pos.x - queen.pos.x, b.pos.y - queen.pos.y, b.pos.z - queen.pos.z) <= r).length;
  return { pickUps, eggs: eggs.length, nearQueen };
}

describe('queen-care egg collecting', () => {
  it('in a chamber too small to put eggs out of her reach, carers leave the eggs where she laid them', () => {
    const r = carerPickUps(true, 3000);
    console.log('[eggCollect small chamber]', JSON.stringify(r));
    // before the fix the same eggs were picked up over and over (see the ledger, colony-life round 1)
    expect(r.pickUps).toBeLessThanOrEqual(r.eggs);
  }, 300_000);

  it('in a chamber with room, each egg is carried once to the pile out of her reach', () => {
    const r = carerPickUps(false, 3000);
    console.log('[eggCollect royal chamber]', JSON.stringify(r));
    expect(r.pickUps).toBeGreaterThanOrEqual(1);
    expect(r.pickUps).toBeLessThanOrEqual(r.eggs + 2);
    expect(r.nearQueen).toBe(0);
  }, 300_000);
});
