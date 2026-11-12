// Spatial hash over ants, brood, items, sources and creatures (the EntityIndex service, owned by loco). refresh()
// rebuilds every kind; refreshWalkers() only the moving ones (ants, creatures), which is what the locomotion system
// calls after it moved everybody, so queries later in the tick see current positions.

import { HashGrid3 } from '@/core/spatial/hashGrid';
import type { Vec3 } from '@/core/math/vec3';
import type { EntityIndex, SimStores } from '@/sim/types';

interface Positioned {
  id: number;
  alive: boolean;
  pos: Vec3;
}

function fill(grid: HashGrid3, list: readonly Positioned[]): void {
  grid.clear();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.alive) grid.insert(e.id, e.pos.x, e.pos.y, e.pos.z);
  }
}

export interface LocoEntityIndex extends EntityIndex {
  /** Re-inserts ants and creatures only. */
  refreshWalkers(): void;
}

export function isLocoEntityIndex(i: EntityIndex): i is LocoEntityIndex {
  return typeof (i as Partial<LocoEntityIndex>).refreshWalkers === 'function';
}

export function createEntityIndexImpl(stores: SimStores, cellMm: number): LocoEntityIndex {
  const ants = new HashGrid3(cellMm), brood = new HashGrid3(cellMm), items = new HashGrid3(cellMm);
  const sources = new HashGrid3(cellMm), creatures = new HashGrid3(cellMm);
  return {
    refresh() {
      fill(ants, stores.ants.list);
      fill(brood, stores.brood.list);
      fill(items, stores.items.list);
      fill(sources, stores.sources.list);
      fill(creatures, stores.creatures.list);
    },
    refreshWalkers() {
      fill(ants, stores.ants.list);
      fill(creatures, stores.creatures.list);
    },
    queryAnts: (p, r, out) => (ants.queryRadius(p.x, p.y, p.z, r, out), out),
    queryBrood: (p, r, out) => (brood.queryRadius(p.x, p.y, p.z, r, out), out),
    queryItems: (p, r, out) => (items.queryRadius(p.x, p.y, p.z, r, out), out),
    querySources: (p, r, out) => (sources.queryRadius(p.x, p.y, p.z, r, out), out),
    queryCreatures: (p, r, out) => (creatures.queryRadius(p.x, p.y, p.z, r, out), out),
  };
}
