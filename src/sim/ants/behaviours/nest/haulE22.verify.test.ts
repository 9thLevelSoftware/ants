// Reviewer test (beh-nest): GDD 02 App. E 22 with its own set-up, "a dead worker in a chamber and >= 1
// haul-eligible worker": a single hauler (allocator off) has the corpse at the midden within 0.15 gd (900 ticks),
// although the corpse only becomes a job CORPSE_DETECT_S (60 s = 600 ticks) after death.
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { MIDDEN_RADIUS_BU } from '@/sim/balance/nestwork';
import { middenPoint } from './places';
import { makeNestColony } from './testkit';

describe('reviewer: GDD 02 E22 with one hauler', () => {
  it('one haul worker takes a corpse from the deepest chamber to the midden within 900 ticks', () => {
    const systems = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');
    const k = makeNestColony({ workers: 3, stores: { c: 50, p: 50 }, systems });
    const { sim, nest, royal } = k;
    const workers = sim.stores.ants.list.filter((a) => a.caste === 'worker');
    const victim = workers.find((a) => a.chamberId === royal.id) ?? workers[0];
    const hauler = workers.find((a) => a !== victim)!;
    for (const a of workers) if (a !== victim) a.task = a === hauler ? 'haul' : 'idle';
    sim.enqueue({ type: 'cheat.kill', id: victim.id, cause: 'old-age' });
    sim.applyPendingCommands();
    const corpse = sim.stores.items.list.find((it) => it.kind === 'corpse')!;
    let removedAt = -1;
    sim.events.on('corpse-removed', (e) => { if (e.itemId === corpse.id && removedAt < 0) removedAt = sim.state.tick; });
    const t0 = sim.state.tick;
    for (let t = 0; t < 1800 && removedAt < 0; t++) sim.tick();
    const m = middenPoint(sim, nest, { x: 0, y: 0, z: 0 })!;
    const c = sim.stores.items.get(corpse.id);
    const atMidden = !!c && Math.hypot(c.pos.x - m.x, c.pos.y - m.y, c.pos.z - m.z) <= MIDDEN_RADIUS_BU * sim.world.bu;
    console.log('[verify E22 one hauler]', JSON.stringify({ ticks: removedAt < 0 ? -1 : removedAt - t0, atMidden, hauler: `${hauler.task}/${hauler.state}`, cap: hauler.carryCap, bulk: corpse.bulk }));
    expect(removedAt).toBeGreaterThan(0);
    expect(removedAt - t0).toBeLessThanOrEqual(900);
    expect(atMidden).toBe(true);
  }, 300_000);
});
