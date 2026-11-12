// beh-nest acceptance 4 (GDD 02 §10.7-10.8, GDD 03 §7.5-7.7, App. E 5 / 14 / 16): a chamber plan placed in the
// small nest is dug by autonomous diggers (the allocator assigns dig and haul by itself), every pellet is hauled
// out and settles into the entrance mound (volume conserved within 10 %), no two diggers ever hold the same slot,
// and cancelling a plan frees every claim.
import { describe, expect, it } from 'vitest';
import type { Nest, PlanSpec, Sim } from '@/sim/types';
import { BULKING } from '@/sim/balance/nest';
import { createPlan, cancelPlan, moundVolume, validatePlan, wallSpots } from '@/sim/nest';
import { makeNestColony, run } from './testkit';

/** A small `general` chamber plan on a wall of the small nest (first wall spot that validates). */
function placePlan(sim: Sim, nest: Nest): number {
  for (const w of wallSpots(sim, nest.id, 400, 7)) {
    if (w.depthBu < 8) continue;
    const spec: PlanSpec = {
      nestId: nest.id, kind: 'chamber', chamberType: 'general', size: 's', priority: 'high', confirmWarnings: true,
      anchor: { pos: w.pos, normal: w.normal },
    };
    if (validatePlan(sim, spec).ok) {
      const id = createPlan(sim, spec, 'player');
      if (id > 0) return id;
    }
  }
  throw new Error('no wall spot for a test plan');
}

function setup(): { sim: Sim; nest: Nest; planId: number } {
  const k = makeNestColony({ workers: 40, stores: { c: 100, p: 50 } });
  k.sim.enqueue({ type: 'setAutoExpand', nestId: k.nest.id, mode: 'off' });
  k.sim.applyPendingCommands();
  return { sim: k.sim, nest: k.nest, planId: placePlan(k.sim, k.nest) };
}

function plan(nest: Nest, id: number) {
  return nest.digPlans.find((p) => p.id === id);
}

/**
 * Claims are consistent both ways: no ant holds two slots, every held slot names an ant whose own claim keys
 * (bb.planId / bb.slotIdx) point back at it, and no two ants' claim keys point at the same slot (a second digger
 * believing it holds a slot that the plan gave to another).
 */
function claimsConsistent(sim: Sim, nest: Nest): boolean {
  const holders = new Set<number>();
  for (const p of nest.digPlans) {
    for (let k = 0; k < p.slots.length; k++) {
      const a = p.slots[k].antId;
      if (a < 0) continue;
      if (holders.has(a)) return false;
      holders.add(a);
      const ant = sim.stores.ants.get(a);
      if (ant && (ant.bb.planId !== p.id || ant.bb.slotIdx !== k)) return false;
    }
  }
  const keys = new Set<string>();
  for (const a of sim.stores.ants.list) {
    if (!a.alive || (a.bb.planId ?? -1) < 0) continue;
    const key = `${a.bb.planId}:${a.bb.slotIdx}`;
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

describe('beh-nest dig and haul (acceptance 4)', () => {
  it('autonomous diggers complete a chamber plan; all soil ends in the mound; claims stay unique', () => {
    const { sim, nest, planId } = setup();
    const created = new Map<number, number>();
    const pelletsSeen = () => {
      for (const it of sim.stores.items.list) if (it.alive && it.kind === 'soil-pellet' && !created.has(it.id)) created.set(it.id, it.volume);
    };
    sim.events.on('pellet-created', (e) => created.set(e.itemId, e.volume));
    const dumped: Record<string, number> = {};
    sim.events.on('pellet-dumped', (e) => { dumped[e.into] = (dumped[e.into] ?? 0) + (created.get(e.itemId) ?? 0); });
    // the entrance's mound (or the spoil heap the first settled pellet starts, GDD 03 §1.4)
    const mounds = () => sim.state.worldDelta.mounds.reduce((s, m) => s + moundVolume(sim, m), 0);
    const mound0 = mounds();
    let doubleClaims = 0, t = 0;
    const p = plan(nest, planId)!;
    for (; t < 30000 && p.status !== 'complete'; t++) {
      sim.tick();
      if (!claimsConsistent(sim, nest)) doubleClaims++;
      if (t % 20 === 0) pelletsSeen();
    }
    const doneTick = t;
    // haul the rest out and let surface pellets settle into the mound (PELLET_SETTLE_S 300 s + a batch)
    for (let n = 0; n < 9000; n++) { sim.tick(); if (n % 20 === 0) pelletsSeen(); }
    const inNest = sim.stores.items.list.filter((it) => it.alive && it.kind === 'soil-pellet' && it.inNest);
    const lying = sim.stores.items.list.filter((it) => it.alive && it.kind === 'soil-pellet');
    const createdVol = [...created.values()].reduce((s, v) => s + v, 0);
    const moundVol = (mounds() - mound0) / BULKING;
    const lyingVol = lying.reduce((s, it) => s + it.volume, 0);
    console.log('lying', lying.map((it) => `${it.id}:${it.volume.toFixed(2)}/${it.bulk.toFixed(2)}/${it.spoilPlanId}/${it.inNest}/${(sim.field.sample(it.pos) / sim.world.bu).toFixed(2)}`).join(' '), 'dumped', JSON.stringify(dumped));
    console.log('[beh-nest AC4]', JSON.stringify({
      status: p.status, doneGd: +(doneTick / 6000).toFixed(2), removed: +p.removedVolume.toFixed(1), target: +p.targetVolume.toFixed(1),
      pellets: created.size, pelletVolume: +createdVol.toFixed(1), moundVolumeOverBulking: +moundVol.toFixed(1),
      stillLying: lying.length, stillInNest: inNest.length, lyingVolume: +lyingVol.toFixed(1), doubleClaims,
    }));
    expect(p.status).toBe('complete');
    expect(doubleClaims).toBe(0);
    // a pellet that ended partly buried (floor-ahead point inside a slope) may stay for the nest's tamping; at most a
    // few per cent of the soil may still lie in the nest
    expect(inNest.reduce((v, it) => v + it.volume, 0)).toBeLessThanOrEqual(0.03 * createdVol);
    expect(Math.abs(moundVol + lyingVol - createdVol)).toBeLessThanOrEqual(0.1 * createdVol);
    expect(moundVol).toBeGreaterThanOrEqual(0.9 * createdVol);
  }, 900_000);

  it('cancelling the plan frees every claim and the diggers move on', () => {
    const { sim, nest, planId } = setup();
    const p = plan(nest, planId)!;
    for (let t = 0; t < 12000 && p.removedVolume < 0.25 * p.targetVolume; t++) sim.tick();
    expect(p.slots.some((s) => s.antId >= 0) || p.removedVolume > 0).toBe(true);
    expect(cancelPlan(sim, planId, 'player')).toBe(true);
    run(sim, 20);
    expect(p.slots.every((s) => s.antId < 0)).toBe(true);
    expect(sim.stores.ants.list.filter((a) => (a.bb.planId ?? -1) === planId).length).toBe(0);
    const version = sim.carve.version;
    run(sim, 600);
    // nothing in the cancelled plan is dug any more (bites elsewhere would need another plan; there is none)
    expect(sim.carve.version).toBe(version);
    const diggers = sim.stores.ants.list.filter((a) => a.task === 'dig');
    expect(diggers.every((a) => a.state !== 'dig.bite')).toBe(true);
  }, 600_000);
});
