// Builds the runtime services of a Sim from plain state + static world (all derived, never persisted).

import { HashGrid3 } from '@/core/spatial/hashGrid';
import { Store } from '@/core/store';
import type { Vec3 } from '@/core/math/vec3';
import type {
  CarveGrid, EntityIndex, NavGrid, NestNav, PheromoneField, SimState, SimStores, WorldData, WorldField,
} from '@/sim/types';
import { INDEX_CELL_BU } from '@/sim/balance';
import { createNavGrid, createWorldField } from '@/sim/world';
import { createCarveGrid, createNestNav } from '@/sim/nest';
import { createPheromoneField } from '@/sim/pheromones';

export interface Services {
  stores: SimStores;
  index: EntityIndex;
  field: WorldField;
  carve: CarveGrid;
  nestNav: NestNav;
  navGrid: NavGrid;
  phero: PheromoneField;
}

/** Stores over the state arrays (the arrays ARE the state; stores only index them). */
export function createStores(state: SimState): SimStores {
  return {
    ants: new Store(state.ants),
    brood: new Store(state.brood),
    items: new Store(state.items),
    sources: new Store(state.sources),
    plants: new Store(state.plants),
    creatures: new Store(state.creatures),
    nests: new Store(state.nests),
    markers: new Store(state.markers),
    colonies: new Store(state.colonies),
    herds: new Store(state.ecology.herds),
  };
}

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

/** Spatial hash over ants, brood, items, sources and creatures; refresh() once per tick. */
export function createEntityIndex(stores: SimStores, cellMm: number): EntityIndex {
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
    queryAnts: (p, r, out) => (ants.queryRadius(p.x, p.y, p.z, r, out), out),
    queryBrood: (p, r, out) => (brood.queryRadius(p.x, p.y, p.z, r, out), out),
    queryItems: (p, r, out) => (items.queryRadius(p.x, p.y, p.z, r, out), out),
    querySources: (p, r, out) => (sources.queryRadius(p.x, p.y, p.z, r, out), out),
    queryCreatures: (p, r, out) => (creatures.queryRadius(p.x, p.y, p.z, r, out), out),
  };
}

export function createServices(state: SimState, world: WorldData): Services {
  const stores = createStores(state);
  const index = createEntityIndex(stores, INDEX_CELL_BU * world.bu);
  const carve = createCarveGrid(state.worldDelta.carve, world);
  const field = createWorldField(world, carve);
  const nestNav = createNestNav(world, carve);
  const navGrid = createNavGrid(world);
  const phero = createPheromoneField(state.phero);
  return { stores, index, field, carve, nestNav, navGrid, phero };
}
