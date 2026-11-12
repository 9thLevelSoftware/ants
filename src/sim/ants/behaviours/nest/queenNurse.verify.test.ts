// Reviewer tests (beh-nest): GDD 02 App. E 4 with the GDD's "one nurse in the chamber" (the implementer's test has
// 12 workers), and the established queen's emergency relocation (GDD 02 §10.14: alarm/flood in her chamber ->
// `relocate` to the best SAFE chamber; a food store is not a place for the queen and her eggs).
import { describe, expect, it } from 'vitest';
import { AntFlag, BroodFlag } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { makeNestColony, run } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

describe('reviewer: nurse E4 and queen relocation', () => {
  it('E4: one nurse, a ready pupa -> a callow adult within 30 game s and a cocoon', () => {
    const k = makeNestColony({ workers: 1, stores: { c: 50, p: 50 }, systems: NO_ALLOC, brood: [{ stage: 'pupa', n: 1, chamber: 'nursery', progress: 0.999 }] });
    const { sim, nursery } = k;
    const nurse = sim.stores.ants.list.find((a) => a.caste === 'worker')!;
    nurse.task = 'nurse';
    const pupa = sim.stores.brood.list.find((b) => b.stage === 'pupa')!;
    let readyAt = -1, eclosedAt = -1, adult = -1;
    sim.events.on('ant-eclosed', (e) => { eclosedAt = sim.state.tick; adult = e.antId; });
    for (let t = 0; t < 6000 && eclosedAt < 0; t++) {
      sim.tick();
      if (readyAt < 0 && pupa.alive && (pupa.flags & BroodFlag.READY) !== 0) readyAt = sim.state.tick;
    }
    console.log('[verify E4 one nurse]', JSON.stringify({ readyAt, eclosedAt, delayTicks: eclosedAt - readyAt, nurseChamber: nurse.chamberId, nursery: nursery.id }));
    expect(readyAt).toBeGreaterThan(0);
    expect(eclosedAt - readyAt).toBeLessThanOrEqual(300);
    expect((sim.stores.ants.get(adult)!.flags & AntFlag.CALLOW) !== 0).toBe(true);
    expect(sim.stores.items.list.some((it) => it.kind === 'waste' && it.wasteKind === 'cocoon')).toBe(true);
  }, 300_000);

  it('a flooded royal chamber sends the queen to a safe brood chamber, not into the food store', () => {
    const k = makeNestColony({ workers: 6, stores: { c: 50, p: 50 } });
    const { sim, royal, queen, nest } = k;
    run(sim, 50);
    royal.flooded = 1;
    const seen = new Set<number>();
    for (let t = 0; t < 3000; t++) { sim.tick(); royal.flooded = 1; if (queen.chamberId >= 0) seen.add(queen.chamberId); }
    const typeOf = (id: number) => nest.chambers.find((c) => c.id === id)?.type ?? 'none';
    console.log('[verify queen relocation]', JSON.stringify({ state: queen.state, chamber: typeOf(queen.chamberId), dest: typeOf(queen.bb['bn.dest'] ?? -1), visited: [...seen].map(typeOf) }));
    expect(queen.chamberId).not.toBe(royal.id);
    expect(typeOf(queen.bb['bn.dest'] ?? -1)).not.toBe('food');
  }, 300_000);
});
