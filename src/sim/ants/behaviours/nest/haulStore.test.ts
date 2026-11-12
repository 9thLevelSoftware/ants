// beh-nest acceptance 5 (GDD 02 §10.6, §10.8, App. E 22; §5.3): corpses and waste placed in the nest end at the
// midden (with `corpse-removed` / `waste-dumped`); solid food dropped at the entrance is shifted into the food
// chamber by a store ant and booked as a delivery; liquid food given to a store ant enters the pool and ledger.
import { describe, expect, it } from 'vitest';
import type { Ant, Behaviour, Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { behaviours as nestBehaviours } from './index';
import { reachAndAct } from './common';
import { setState } from './fsm';
import { middenPoint, pileSlot } from './places';
import { entity } from './travel';
import { makeNestColony, run } from './testkit';
import { MIDDEN_RADIUS_BU } from '@/sim/balance/nestwork';

/** Test stand-in for a returning forager (beh-forage's job): give the crop to the nearest store ant. */
const scriptedForager: Behaviour = {
  task: 'forage',
  enter: (sim, ant) => setState(sim, ant, 'forage.deliver'),
  update: (sim, ant) => {
    if (ant.action || ant.cropC + ant.cropP <= 0.06) return;
    let store: Ant | undefined, best = Infinity;
    for (const a of sim.stores.ants.list) {
      if (!a.alive || a.task !== 'store' || a.state !== 'store.post') continue;
      const d = Math.hypot(a.pos.x - ant.pos.x, a.pos.y - ant.pos.y, a.pos.z - ant.pos.z);
      if (d < best) { best = d; store = a; }
    }
    if (store && reachAndAct(sim, ant, entity('ant', store.id, store.pos), 'trophallaxis-give') === 'failed') setState(sim, ant, 'forage.deliver');
  },
  exit: () => {},
};

function nearMidden(sim: Sim, nestId: number, p: { x: number; y: number; z: number }): boolean {
  const nest = sim.stores.nests.get(nestId)!;
  const m = middenPoint(sim, nest, { x: 0, y: 0, z: 0 })!;
  return Math.hypot(p.x - m.x, p.y - m.y, p.z - m.z) <= MIDDEN_RADIUS_BU * sim.world.bu;
}

describe('beh-nest haul to the midden and store (acceptance 5)', () => {
  it('a corpse and waste in the nest are taken to the midden within 0.15 gd (GDD 02 E22)', () => {
    const k = makeNestColony({ workers: 30, stores: { c: 100, p: 50 } });
    const { sim, nest, nursery } = k;
    const victim = sim.stores.ants.list.find((a) => a.caste === 'worker' && a.chamberId === nursery.id)!;
    sim.enqueue({ type: 'cheat.kill', id: victim.id, cause: 'old-age' });
    sim.applyPendingCommands();
    const corpse = sim.stores.items.list.find((it) => it.kind === 'corpse')!;
    const waste = spawnItem(sim, {
      kind: 'waste', pos: pileSlot(nursery, 1, 7, sim.world.bu, { x: 0, y: 0, z: 0 }),
      init: { wasteKind: 'meconium', nestId: nest.id, chamberId: nursery.id, inNest: true, colony: k.queen.colony, bulk: 0.5 },
    });
    const removed: number[] = [], dumped: number[] = [];
    sim.events.on('corpse-removed', (e) => removed.push(e.itemId));
    sim.events.on('waste-dumped', (e) => dumped.push(e.itemId));
    let tCorpse = -1, tWaste = -1;
    for (let t = 0; t < 1800 && (tCorpse < 0 || tWaste < 0); t++) {
      sim.tick();
      if (tCorpse < 0 && removed.includes(corpse.id)) tCorpse = t;
      if (tWaste < 0 && dumped.includes(waste.id)) tWaste = t;
    }
    console.log('[beh-nest AC5 midden]', JSON.stringify({ corpseTicks: tCorpse, wasteTicks: tWaste }));
    expect(tCorpse).toBeGreaterThan(0);
    expect(tCorpse).toBeLessThanOrEqual(900);
    expect(nearMidden(sim, nest.id, sim.stores.items.get(corpse.id)!.pos)).toBe(true);
    expect(tWaste).toBeGreaterThan(0);
    expect(nearMidden(sim, nest.id, sim.stores.items.get(waste.id)!.pos)).toBe(true);
  }, 300_000);

  it('food handed over at the entrance ends in the store chamber and in the ledger', () => {
    const k = makeNestColony({ workers: 30, stores: { c: 10, p: 10 }, behaviours: [...nestBehaviours, scriptedForager] });
    const { sim, entrance, food } = k;
    const col = sim.state.colonies[0];
    run(sim, 600); // allocation assigns store ants
    expect(sim.stores.ants.list.some((a) => a.task === 'store')).toBe(true);
    // solid: a crumb dropped beside the entrance (the forager's put-down in the drop zone)
    const crumb = spawnItem(sim, {
      kind: 'food-piece', pos: { x: entrance.pos.x + 2 * sim.world.bu, y: entrance.pos.y, z: entrance.pos.z },
      init: { foodKind: 'crumb', c: 0.35, p: 0.15, bulk: 0.5, colony: -1 },
    });
    // liquid: a forager back in the entrance chamber with a full crop
    const forager = sim.stores.ants.list.find((a) => a.caste === 'worker' && a.task === 'idle' && a.chamberId === food.id) as Ant;
    forager.cropC = 0.8; forager.cropP = 0;
    forager.task = 'forage'; // test set-up: the stand-in behaviour runs from the next think
    const led0 = { c: col.ledger.inDeliveryC, p: col.ledger.inDeliveryP };
    const pool0 = { c: col.stores.c, p: col.stores.p };
    let receivedBy = -1;
    sim.events.on('trophallaxis', (e) => { if (e.donorId === forager.id && !e.ambient) receivedBy = e.receiverId; });
    let tCrumb = -1;
    for (let t = 0; t < 3000 && (tCrumb < 0 || forager.cropC > 0.06); t++) {
      sim.tick();
      if (tCrumb < 0 && !sim.stores.items.has(crumb.id)) tCrumb = t;
    }
    const gotC = col.ledger.inDeliveryC - led0.c, gotP = col.ledger.inDeliveryP - led0.p;
    console.log('[beh-nest AC5 store]', JSON.stringify({ crumbStoredTicks: tCrumb, ledgerC: +gotC.toFixed(3), ledgerP: +gotP.toFixed(3), foragerCrop: +forager.cropC.toFixed(3), receivedBy }));
    expect(tCrumb).toBeGreaterThan(0);
    const receiver = sim.stores.ants.get(receivedBy);
    expect(receiver?.task).toBe('store');
    // the crumb (0.35 C, 0.15 P) and the crop (0.8 down to the donor minimum 0.05) are in the ledger and the pool
    expect(gotP).toBeCloseTo(0.15, 6);
    expect(gotC).toBeCloseTo(0.35 + (0.8 - forager.cropC), 2); // the forager also pays a little upkeep
    expect(forager.cropC).toBeLessThan(0.1);
    expect(col.stores.c).toBeGreaterThan(pool0.c);
  }, 300_000);
});
