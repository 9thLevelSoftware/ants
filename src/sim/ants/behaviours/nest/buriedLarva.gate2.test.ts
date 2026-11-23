// gate-sim-2 item 4 (kd #3 of sweep 15: 7 larvae starved with 1.4-4.8 P in store). The larvae lay 1.3 mm inside the
// royal chamber's floor; the walk to a brood item resolved its goal straight up through the soil to the ground above
// (locomotion/trip.ts snapToSurface), so every nurse with a full crop walked out of the nest and back. A goal a little
// inside a solid now moves to the nearest free space (the chamber beside it).
//
// REVERTED in gate-sim-2's close (spec item 8: an item that costs the viability bar is reverted): with the fix the
// suburban-garden colonies sg #2 / sg #3 of the close sweep raised more brood and ended short of their R27 winter
// carbohydrate (0.97 x, 0.74 x); with only trip.ts put back, both were viable (1.79 x, 1.06 x) from the same
// hand-overs (test-output/gate-sim-2/off-item4). The fix is kept in test-output/gate-sim-2/trip.ts.item4-reverted and
// these cases are skipped until the integrator rules on the winter-carbohydrate limit; they are red on the reverted
// trip.ts (52 mm / 114 nurse-ticks outside, the defect as it stands).
import { describe, expect, it } from 'vitest';
import { snapToSurface } from '@/sim/locomotion/trip';
import { makeNestColony } from './testkit';

function buryInFloor(k: ReturnType<typeof makeNestColony>, larvaId: number): number {
  const { sim } = k;
  const b = sim.stores.brood.get(larvaId)!;
  for (let i = 0; i < 12 && sim.field.sample(b.pos) > -1.0; i++) b.pos.y -= 0.25;
  return sim.field.sample(b.pos);
}

describe.skip('a larva lying a little inside the chamber floor (gate-sim-2 item 4; fix reverted, see header)', () => {
  it('the walk goal of a point 1 mm inside the chamber wall is beside it in the chamber, not on the ground above', () => {
    const k = makeNestColony({ workers: 0 });
    const { sim, nursery } = k;
    // from the chamber centre outward until 1 mm inside the side wall (kd #3: the pile lay at the wall of a 2.5 BU room)
    const p = { ...nursery.center };
    for (let i = 0; i < 400 && sim.field.sample(p) > -1.0; i++) p.x += 0.1;
    const inWall = { ...p };
    expect(sim.field.sample(inWall)).toBeLessThan(-1.0);
    snapToSurface(sim, p, sim.world.bu); // with the fix: snapToSurface(sim, p, bu, true), the goal of an in-nest item / brood
    expect(sim.field.sample(p)).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(p.x - inWall.x, p.y - inWall.y, p.z - inWall.z)).toBeLessThan(sim.world.bu);
    expect(p.y).toBeLessThan(nursery.center.y + nursery.radii.y);
  });

  it('its nurses feed it without leaving the nest', () => {
    const k = makeNestColony({ workers: 4, stores: { c: 40, p: 40 }, brood: [{ stage: 'larva', n: 3, chamber: 'nursery' }] });
    const { sim } = k;
    const larvae = sim.stores.brood.list.filter((x) => x.stage === 'larva');
    for (const b of larvae) { buryInFloor(k, b.id); b.hunger = 1; b.gutC = 0; b.gutP = 0; }
    const fed0 = larvae.map((b) => b.fedP + b.fedC);
    for (const a of sim.stores.ants.list) if (a.caste === 'worker') a.task = 'nurse';
    let outside = 0;
    for (let t = 0; t < 3000; t++) {
      sim.tick();
      for (const a of sim.stores.ants.list) if (a.alive && a.caste === 'worker' && a.task === 'nurse' && a.nestId < 0) outside++;
    }
    expect(outside).toBe(0);
    larvae.forEach((b, i) => expect(b.fedP + b.fedC, `larva ${b.id}`).toBeGreaterThan(fed0[i]));
  }, 60_000);
});
