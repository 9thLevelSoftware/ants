// Reviewer tests (beh-nest): the GDD 03 App. E dig checks at the behaviour level, with their own set-ups.
// E14: a 10 BU tunnel plan, 2 diggers + 2 haulers assigned by hand (allocator off) -> active within 300 ticks,
// complete within 6,000 ticks, >= 97 % of the target removed.
// E16: an active chamber plan at >= 40 % progress is cancelled -> all slots free, and for the next 1,000 ticks no
// voxel changes openness (no plan left, so any carve-grid change is a bite into the cancelled plan's volume).
import { describe, expect, it } from 'vitest';
import type { Nest, Sim } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { cancelPlan, createPlan, validatePlan, wallSpots } from '@/sim/nest';
import { makeNestColony, run } from './testkit';

function tunnelPlan(sim: Sim, nest: Nest): number {
  const food = nest.chambers.find((c) => c.type === 'food')!;
  const bu = sim.world.bu;
  const spec = {
    nestId: nest.id, kind: 'tunnel' as const, length: 10, priority: 'normal' as const, confirmWarnings: true,
    anchor: { pos: { x: food.center.x, y: food.center.y - 0.5 * bu, z: food.center.z - food.radii.z }, normal: { x: 0, y: 0, z: 1 } },
  };
  const v = validatePlan(sim, spec);
  if (!v.ok) throw new Error(`tunnel plan refused: ${JSON.stringify(v)}`);
  return createPlan(sim, spec, 'player');
}

function chamberPlan(sim: Sim, nest: Nest): number {
  for (const w of wallSpots(sim, nest.id, 400, 7)) {
    if (w.depthBu < 8) continue;
    const spec = {
      nestId: nest.id, kind: 'chamber' as const, chamberType: 'general' as const, size: 's' as const, priority: 'high' as const,
      confirmWarnings: true, anchor: { pos: w.pos, normal: w.normal },
    };
    if (validatePlan(sim, spec).ok) { const id = createPlan(sim, spec, 'player'); if (id > 0) return id; }
  }
  throw new Error('no chamber plan');
}

describe('reviewer: GDD 03 dig acceptance checks', () => {
  it('E14: 2 diggers + 2 haulers (by hand) complete a 10 BU tunnel plan within 6,000 ticks', () => {
    const systems = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');
    const k = makeNestColony({ workers: 4, stores: { c: 100, p: 50 }, systems });
    const { sim, nest } = k;
    sim.enqueue({ type: 'setAutoExpand', nestId: nest.id, mode: 'off' });
    sim.applyPendingCommands();
    const id = tunnelPlan(sim, nest);
    const ants = sim.stores.ants.list.filter((a) => a.caste === 'worker');
    ants.forEach((a, i) => { a.task = i < 2 ? 'dig' : 'haul'; });
    const p = nest.digPlans.find((x) => x.id === id)!;
    let activeAt = -1, doneAt = -1;
    for (let t = 1; t <= 6000 && doneAt < 0; t++) {
      sim.tick();
      if (activeAt < 0 && p.status === 'active') activeAt = t;
      if (p.status === 'complete') doneAt = t;
    }
    console.log('[verify E14]', JSON.stringify({ activeAt, doneAt, status: p.status, removed: +p.removedVolume.toFixed(1), target: +p.targetVolume.toFixed(1), tasks: ants.map((a) => `${a.task}/${a.state}`) }));
    expect(ants.every((a, i) => a.task === (i < 2 ? 'dig' : 'haul'))).toBe(true);
    expect(activeAt).toBeGreaterThan(0);
    expect(activeAt).toBeLessThanOrEqual(300);
    expect(doneAt).toBeGreaterThan(0);
    expect(p.removedVolume).toBeGreaterThanOrEqual(0.97 * p.targetVolume);
  }, 600_000);

  it('E16: cancelling a chamber plan at >= 40 % frees all slots and no voxel changes for 1,000 ticks', () => {
    const k = makeNestColony({ workers: 40, stores: { c: 100, p: 50 } });
    const { sim, nest } = k;
    sim.enqueue({ type: 'setAutoExpand', nestId: nest.id, mode: 'off' });
    sim.applyPendingCommands();
    const id = chamberPlan(sim, nest);
    const p = nest.digPlans.find((x) => x.id === id)!;
    for (let t = 0; t < 30000 && p.removedVolume < 0.4 * p.targetVolume; t++) sim.tick();
    expect(p.removedVolume).toBeGreaterThanOrEqual(0.4 * p.targetVolume);
    expect(cancelPlan(sim, id, 'player')).toBe(true);
    expect(p.status).toBe('cancelled');
    run(sim, 1);
    const version = sim.carve.version;
    const holders = () => sim.stores.ants.list.filter((a) => a.alive && (a.bb.planId ?? -1) === id).length;
    let maxHolders = 0;
    for (let t = 0; t < 1000; t++) { sim.tick(); maxHolders = Math.max(maxHolders, holders()); }
    console.log('[verify E16]', JSON.stringify({ progress: +(p.removedVolume / p.targetVolume).toFixed(2), versionDelta: sim.carve.version - version, maxHolders }));
    expect(p.slots.every((s) => s.antId < 0)).toBe(true);
    expect(maxHolders).toBe(0);
    expect(sim.carve.version).toBe(version);
  }, 900_000);
});
