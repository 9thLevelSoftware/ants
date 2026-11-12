// Taking and releasing carried things (items and brood). Shared by pick-up, put-down, drop, dig-bite (auto-drop
// of a pellet), death processing and release. Only these helpers write `carry` / `carrierIds` / `carriedBy`.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Brood, Item, Sim } from '@/sim/types';
import { EGG_CLUMP_MAX, EGG_CLUMP_RADIUS_BU } from '@/sim/balance/actions';
import { ports } from './ports';

export function carriedItem(sim: Sim, ant: Ant): Item | undefined {
  return ant.carry.kind === 'item' ? sim.stores.items.get(ant.carry.id) : undefined;
}

export function carriedBrood(sim: Sim, ant: Ant): Brood | undefined {
  return ant.carry.kind === 'brood' ? sim.stores.brood.get(ant.carry.id) : undefined;
}

export function handsFree(ant: Ant): boolean {
  return ant.carry.kind === 'none';
}

/** Puts an item in the ant's mandibles (alone; drag adds helpers itself). */
export function takeItem(ant: Ant, item: Item): void {
  if (!item.carrierIds.includes(ant.id)) item.carrierIds.push(ant.id);
  item.reservedBy = -1;
  item.inNest = false;
  ant.carry = { kind: 'item', id: item.id };
}

/** Picks up brood; an egg brings up to EGG_CLUMP_MAX - 1 lying eggs of its colony with it (GDD 01 §7.3). */
export function takeBrood(sim: Sim, ant: Ant, brood: Brood): number {
  brood.carriedBy = ant.id;
  ant.carry = { kind: 'brood', id: brood.id };
  let n = 1;
  if (brood.stage !== 'egg') return n;
  const r2 = (EGG_CLUMP_RADIUS_BU * sim.world.bu) ** 2;
  for (const b of sim.stores.brood.list) {
    if (n >= EGG_CLUMP_MAX) break;
    if (!b.alive || b === brood || b.stage !== 'egg' || b.carriedBy !== -1 || b.colony !== brood.colony) continue;
    const d2 = (b.pos.x - brood.pos.x) ** 2 + (b.pos.y - brood.pos.y) ** 2 + (b.pos.z - brood.pos.z) ** 2;
    if (d2 <= r2) { b.carriedBy = ant.id; n++; }
  }
  return n;
}

/** Brood carried by the ant: the carried one first, then clump mates. */
export function broodCarriedBy(sim: Sim, ant: Ant): Brood[] {
  const out: Brood[] = [];
  const main = carriedBrood(sim, ant);
  if (main) out.push(main);
  for (const b of sim.stores.brood.list) if (b.alive && b.carriedBy === ant.id && b !== main) out.push(b);
  return out;
}

function placeBrood(sim: Sim, ant: Ant, b: Brood, at: Vec3): void {
  b.carriedBy = -1;
  b.pos = { x: at.x, y: at.y, z: at.z };
  const ch = ports.findChamberAt(sim, at);
  b.chamberId = ch ? ch.id : -1;
  b.nestId = ant.nestId;
}

function placeItem(sim: Sim, ant: Ant, it: Item, at: Vec3): void {
  it.carrierIds = it.carrierIds.filter((id) => id !== ant.id);
  it.pos = { x: at.x, y: at.y, z: at.z };
  it.droppedTick = sim.state.tick;
  it.nestId = ant.nestId;
  const ch = ports.findChamberAt(sim, at);
  it.chamberId = ch ? ch.id : -1;
  it.inNest = ant.nestId >= 0;
}

/**
 * Releases whatever the ant carries at `at` (brood intact, clump mates included). Soil pellets and frass are first
 * offered to the nest (mound, heap, plug, spoil pile); whatever the nest does not take stays where it was put.
 * Returns the number of things released.
 */
export function releaseCarried(sim: Sim, ant: Ant, at: Vec3): number {
  let n = 0;
  if (ant.carry.kind === 'brood') {
    for (const b of broodCarriedBy(sim, ant)) { placeBrood(sim, ant, b, at); n++; }
  } else if (ant.carry.kind === 'item') {
    const it = carriedItem(sim, ant);
    if (it) {
      if (it.kind === 'soil-pellet' || it.kind === 'frass') ports.dumpPellet(sim, ant, it.id, at);
      const still = sim.stores.items.get(it.id);
      if (still && still.carrierIds.includes(ant.id)) placeItem(sim, ant, still, at);
      n = 1;
    }
  } else {
    // stray clump mates (e.g. the main egg hatched or died while carried)
    for (const b of broodCarriedBy(sim, ant)) { placeBrood(sim, ant, b, at); n++; }
  }
  ant.carry = { kind: 'none', id: -1 };
  return n;
}
