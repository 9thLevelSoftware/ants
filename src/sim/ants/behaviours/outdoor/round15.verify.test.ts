// Independent sweep after colony-life round 15: tries to break the round's outdoor fixes.
// 1. Deliver recovery (phaseNest.ts deliverLegFailed) with a SOLID load: the round's own test covers a crop only.
//    (a) the food chamber's field is blind: she re-plans to another chamber and sets the item down there;
//    (b) every chamber field is blind: she sets it down where she stands. Either way the item leaves her mandibles
//    well within one DELIVER_MAX_S, stays in the game, and she never stands on a failed walk for more than a moment.
// 2. Crumb retrace variant e (locomotion/crumbs.ts retraceTarget consumes the crumbs behind it, the start index comes
//    from the nearest crumb): save -> load -> continue while foragers are retracing must run as the unsaved game.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { DELIVER_MAX_S } from '@/sim/balance/foraging';
import { TICKS_PER_SECOND } from '@/sim/time';
import { placeOnSurface } from '@/sim/locomotion';
import { spawnItem } from '@/sim/entities';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { makeNestColony } from '../nest/testkit';
import { floorPoint } from '../nest/places';
import { K, UNLOAD } from './keys';
import { announce, forageScenario, run } from './testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

/** Makes the given nest fields unreachable from everywhere (a leg on them fails at once, as in the throat). */
function blindFields(sim: Sim, ids: Set<string>): void {
  const nav = sim.nestNav;
  const { distanceAt, lookahead, stepDir, distance } = nav;
  nav.distanceAt = (f, p) => (ids.has(f) ? Infinity : distanceAt(f, p));
  nav.lookahead = (f, p, steps, out) => (ids.has(f) ? Infinity : lookahead(f, p, steps, out));
  nav.stepDir = (f, p, out) => (ids.has(f) ? Infinity : stepDir(f, p, out));
  nav.distance = (n, t, p) => (ids.has(nestFieldId(n, t)) ? -1 : distance(n, t, p));
}

function solidDelivery(blindAll: boolean) {
  const k = makeNestColony({ workers: 4, systems: NO_ALLOC, stores: { c: 2, p: 0.2 } });
  const { sim, nest, royal, food } = k;
  const blind = new Set<string>([nestFieldId(nest.id, { kind: 'chamber', id: food.id })]);
  if (blindAll) for (const c of nest.chambers) blind.add(nestFieldId(nest.id, { kind: 'chamber', id: c.id }));
  blindFields(sim, blind);
  const a: Ant = sim.stores.ants.list.filter((x) => x.caste === 'worker')[0];
  // in the nursery: a walk away from the food chamber; the royal chamber is the nearer other one
  expect(placeOnSurface(sim, a, floorPoint(k.nursery, 0.5, 0, { x: 0, y: 0, z: 0 }), { x: 0, y: -1, z: 0 })).toBe(true);
  a.nestId = nest.id;
  a.chamberId = k.nursery.id;
  const it = spawnItem(sim, { kind: 'carcass', pos: { ...a.pos }, init: { c: 0.02, p: 0.5, bulk: 0.5, colony: a.colony } });
  it.carrierIds = [a.id];
  a.carry = { kind: 'item', id: it.id };
  a.task = 'forage';
  let deliverTicks = 0, run = 0, longestFailed = 0, t = 0;
  const limit = 2 * DELIVER_MAX_S * TICKS_PER_SECOND;
  for (; t < limit; t++) {
    sim.tick();
    if (a.state === 'forage.deliver') {
      deliverTicks++;
      const stuck = (a.bb[K.unload] ?? UNLOAD.toChamber) === UNLOAD.toChamber && a.nav.status === 'failed';
      if (stuck) { run++; longestFailed = Math.max(longestFailed, run); } else run = 0;
    }
    if (deliverTicks > 0 && a.carry.kind !== 'item') break;
  }
  const item = sim.stores.items.get(it.id);
  const info = JSON.stringify({ blindAll, t, deliverTicks, longestFailed, state: a.state, carry: a.carry, step: a.bb[K.unload],
    fails: a.bb[K.legFails], item: item ? { alive: item.alive, chamberId: item.chamberId, inNest: item.inNest, p: item.p } : null,
    storesP: sim.state.colonies[0].stores.p });
  return { t, deliverTicks, longestFailed, carry: a.carry.kind, item, royal, nursery: k.nursery, info, storesP: sim.state.colonies[0].stores.p };
}

describe('round 15 deliver recovery, independent checks', () => {
  it('a carried item whose food chamber cannot be reached is set down in another chamber within one DELIVER_MAX_S', () => {
    const r = solidDelivery(false);
    expect(r.deliverTicks, r.info).toBeGreaterThan(0);
    expect(r.carry, r.info).not.toBe('item');
    expect(r.t, r.info).toBeLessThan(DELIVER_MAX_S * TICKS_PER_SECOND);
    expect(r.longestFailed, r.info).toBeLessThanOrEqual(2);
    // the food is not lost: either lying in the nest or booked into the stores
    const kept = (r.item && r.item.alive && r.item.inNest) || r.storesP > 0.2 + 0.4;
    expect(kept, r.info).toBe(true);
  }, 120_000);

  it('with no chamber reachable at all she sets the item down where she stands within one DELIVER_MAX_S', () => {
    const r = solidDelivery(true);
    expect(r.deliverTicks, r.info).toBeGreaterThan(0);
    expect(r.carry, r.info).not.toBe('item');
    expect(r.t, r.info).toBeLessThan(DELIVER_MAX_S * TICKS_PER_SECOND);
    expect(r.longestFailed, r.info).toBeLessThanOrEqual(2);
    const kept = (r.item && r.item.alive && r.item.inNest) || r.storesP > 0.2 + 0.4;
    expect(kept, r.info).toBe(true);
  }, 120_000);
});

describe('round 15 crumb retrace (variant e), independent checks', () => {
  it('save -> load -> continue while foragers retrace (and consume) their crumbs: equal state hashes', () => {
    const { sim: a, col, sources } = forageScenario({
      seed: 4, workers: 24, stores: { c: 0.5, p: 0.2 },
      sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 70, bearingDeg: 40, units: 300 }],
    });
    announce(a, col, sources[0]);
    // run until a forager is part-way home on a retrace that has consumed crumbs (her crumb list is shorter than
    // the one she had when she turned home)
    let maxLen = new Map<number, number>();
    let found: Ant | undefined;
    for (let t = 0; t < 12000 && !found; t++) {
      a.tick();
      for (const ant of a.stores.ants.list) {
        if (!ant.alive || ant.nestId >= 0) continue;
        const n = ant.mem.crumbLen;
        if (ant.nav.mode !== 'retrace') { maxLen.set(ant.id, n); continue; }
        const was = maxLen.get(ant.id) ?? 0;
        if (was >= 4 && n > 0 && n <= was - 2) { found = ant; break; }
      }
    }
    expect(found, 'no forager retraced with consumed crumbs').toBeDefined();
    maxLen = new Map();
    const b = createSim(restore(snapshot(a)).state, a.world);
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    for (let t = 0; t < 1500; t++) { a.tick(); b.tick(); }
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    // and she got home
    const ant = a.stores.ants.get(found!.id)!;
    run(a, 1500);
    expect(ant.alive && (ant.nestId >= 0 || ant.mem.trips > 0)).toBe(true);
  }, 600_000);
});
