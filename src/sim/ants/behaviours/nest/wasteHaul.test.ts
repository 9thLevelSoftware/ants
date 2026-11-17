// Waste from the colony's own brood is haulable by the first workers (colony-life round 1). A brood death and a
// pupation leave waste items (GDD 02 §2.5, §2.7); these were spawned with the item default bulk 1.0, above the
// carryCap of a nanitic (~0.75), so no first-year worker ever took one to the midden and brood chambers filled
// with corpses until the hygiene hazard killed the brood beside them.
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { broodDies } from '@/sim/colony/brood';
import { WASTE_BULK } from '@/sim/balance';
import { makeNestColony, run } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

describe('brood waste and the first workers', () => {
  it('every waste kind of worker brood is light enough for a nanitic', () => {
    const nanitic = 0.75;
    expect(WASTE_BULK.meconium).toBeLessThan(nanitic);
    expect(WASTE_BULK.cocoon).toBeLessThan(nanitic);
    expect(WASTE_BULK['spoiled-food']).toBeLessThan(nanitic);
    for (const v of Object.values(WASTE_BULK['brood-corpse'])) expect(v).toBeLessThan(nanitic);
  });

  it('a nanitic hauler takes a dead pupa from the nursery to the midden within 0.15 gd (GDD 02 E22)', () => {
    const k = makeNestColony({ workers: 2, stores: { c: 50, p: 50 }, systems: NO_ALLOC, brood: [{ stage: 'pupa', n: 2, chamber: 'nursery' }] });
    const { sim } = k;
    for (const a of sim.stores.ants.list) {
      if (a.caste !== 'worker') continue;
      a.carryCap = 0.746; // a first worker's (nanitic) carry capacity as measured in the colony-life runs
      a.task = 'haul';
    }
    const pupa = sim.stores.brood.list.find((b) => b.alive && b.stage === 'pupa')!;
    const before = new Set(sim.stores.items.list.filter((it) => it.alive).map((it) => it.id));
    broodDies(sim, pupa, 'base');
    const corpse = sim.stores.items.list.find((it) => it.alive && !before.has(it.id) && it.kind === 'waste')!;
    expect(corpse.wasteKind).toBe('brood-corpse');
    expect(corpse.bulk).toBe(WASTE_BULK['brood-corpse'].pupa);
    const dumped: number[] = [];
    sim.events.on('waste-dumped', (e) => dumped.push(e.itemId));
    const limit = Math.round(0.15 * 6000);
    let t = 0;
    for (; t < limit && !dumped.includes(corpse.id); t += 10) run(sim, 10);
    console.log('[wasteHaul nanitic]', JSON.stringify({ ticks: t, dumped: dumped.includes(corpse.id) }));
    expect(dumped).toContain(corpse.id);
  }, 120_000);
});
