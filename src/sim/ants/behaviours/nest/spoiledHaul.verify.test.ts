// Independent review of colony-life round 1, fix F2 (stores.ts spawnSpoiledItem: spoiled food on the food chamber's
// floor with WASTE_BULK; before, at the chamber centre in the air with bulk 1.0). The round's own test covers a brood
// corpse only; this one tries the spoiled-food path end to end: food spoils in the stores, the waste item appears,
// and a first worker (nanitic carry cap) can reach it and take it to the midden.
import { describe, expect, it } from 'vitest';
import { SYSTEMS } from '@/sim/systems';
import { spoil } from '@/sim/colony/stores';
import { WASTE_BULK } from '@/sim/balance';
import { onSurface } from './places';
import { makeNestColony, run } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

describe('colony-life round 1, F2: spoiled food is haulable', () => {
  it('a spoiled-food item spawned by the stores lies within reach and a nanitic takes it to the midden within 0.3 gd', () => {
    const k = makeNestColony({ workers: 2, stores: { c: 60, p: 30 }, systems: NO_ALLOC });
    const { sim, food } = k;
    for (const a of sim.stores.ants.list) {
      if (a.caste !== 'worker') continue;
      a.carryCap = 0.746; // a first worker's carry capacity as measured in the colony-life runs
      a.task = 'haul';
    }
    const col = sim.state.colonies[0];
    const before = new Set(sim.stores.items.list.filter((it) => it.alive).map((it) => it.id));
    spoil(sim, col, 3); // three game days of spoilage at once: at least one spoiled-food item
    const spoiled = sim.stores.items.list.filter((it) => it.alive && !before.has(it.id) && it.kind === 'waste');
    expect(spoiled.length).toBeGreaterThan(0);
    const it0 = spoiled[0];
    expect(it0.wasteKind).toBe('spoiled-food');
    expect(it0.bulk).toBe(WASTE_BULK['spoiled-food']);
    expect(it0.chamberId).toBe(food.id);
    const reach = onSurface(sim, it0.pos), fieldAt = sim.field.sample(it0.pos) / sim.world.bu;
    const dumped: number[] = [];
    sim.events.on('waste-dumped', (e) => dumped.push(e.itemId));
    const limit = Math.round(0.3 * 6000);
    let t = 0;
    for (; t < limit && !dumped.includes(it0.id); t += 10) run(sim, 10);
    console.log('[spoiledHaul.verify]', JSON.stringify({ items: spoiled.length, reach, fieldBu: Math.round(fieldAt * 100) / 100, ticks: t, dumped: dumped.includes(it0.id) }));
    expect(reach).toBe(true);
    expect(dumped).toContain(it0.id);
  }, 180_000);
});
