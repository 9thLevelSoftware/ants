// What a granary looks like (GDD 07 §5.3.12: in granaries seeds are aggregated cohorts). The stock is a number; so
// that a granary chamber shows its seed, each granary keeps a few display seeds on its floor: `seed` items with no
// nutrients (inert: no behaviour shifts in-nest items, and a put-down of one books nothing), one per
// DISPLAY_LOADS_PER_SEED loads up to DISPLAY_SEEDS_MAX, laid out by a fixed hash pattern. They are a mirror of the
// cohorts, rebuilt as the stock changes; the cohorts stay the only seed stock.

import { hash3i } from '@/core/math/noise';
import type { Chamber, Colony, Item, Sim, System } from '@/sim/types';
import { spawnItem, removeItem } from '@/sim/entities';
import { floorPoint } from '@/sim/ants/behaviours/nest/places';
import { chamberById } from '@/sim/colony/census';
import { DISPLAY_LOADS_PER_SEED, DISPLAY_SEEDS_MAX, DISPLAY_STEP_TICKS, SEED_LENGTH_BU } from '@/sim/balance/species-harvester';
import { granaryColonies } from './economy';
import { stockOf } from './state';

/** A display seed of this colony (no nutrients, in the nest, kind seed). */
export function isDisplaySeed(it: Item, colonyId: number): boolean {
  return it.alive && it.kind === 'seed' && it.inNest && it.colony === colonyId && it.c === 0 && it.p === 0 && it.carrierIds.length === 0;
}

const scratch = { x: 0, y: 0, z: 0 };

function spawnDisplaySeed(sim: Sim, col: Colony, ch: Chamber, k: number, nestId: number): void {
  const frac = 0.15 + 0.7 * Math.sqrt(hash3i(ch.id, k, 1, 0x5eed));
  const ang = hash3i(ch.id, k, 2, 0x5eed) * Math.PI * 2;
  const p = floorPoint(ch, frac, ang, scratch);
  const cls = hash3i(ch.id, k, 3, 0x5eed) < 0.6 ? 'S' : 'M';
  spawnItem(sim, {
    kind: 'seed', pos: { x: p.x, y: p.y, z: p.z },
    init: {
      colony: col.id, inNest: true, nestId, chamberId: ch.id, foodKind: 'seed', variant: 'grass-seed',
      lengthMm: SEED_LENGTH_BU[cls] * sim.world.bu, bulk: 0.3, count: 1,
    },
  });
}

/** Brings the display seeds of each granary of the colony in line with its stock. */
export function syncDisplay(sim: Sim, col: Colony): void {
  const mod = col.granary!;
  const byChamber = new Map<number, Item[]>();
  for (const it of sim.stores.items.list) {
    if (!isDisplaySeed(it, col.id)) continue;
    const list = byChamber.get(it.chamberId) ?? [];
    list.push(it);
    byChamber.set(it.chamberId, list);
  }
  const wanted = new Map<number, number>();
  for (const gr of mod.granaries) wanted.set(gr.chamberId, Math.min(DISPLAY_SEEDS_MAX, Math.floor(stockOf(gr) / DISPLAY_LOADS_PER_SEED)));
  for (const [chId, items] of byChamber) {
    const want = wanted.get(chId) ?? 0;
    for (let i = items.length - 1; i >= want; i--) removeItem(sim, items[i].id, 'eaten');
  }
  for (const [chId, want] of wanted) {
    const have = byChamber.get(chId)?.length ?? 0;
    const ch = chamberById(sim, chId);
    if (!ch || have >= want) continue;
    const nestId = col.nestIds.find((nid) => sim.stores.nests.get(nid)?.chambers.some((c) => c.id === chId)) ?? -1;
    for (let k = have; k < want; k++) spawnDisplaySeed(sim, col, ch, k, nestId);
  }
}

export const granaryDisplaySystem: System = {
  name: 'granary-display', phase: 'colony-economy', every: DISPLAY_STEP_TICKS,
  run(sim) {
    for (const { col } of granaryColonies(sim)) if (col.isPlayer) syncDisplay(sim, col);
  },
};
