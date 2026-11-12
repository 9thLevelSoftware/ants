// Builds the runtime services of a Sim from plain state + static world (all derived, never persisted).
// The geometric services come from ONE kernel (src/sim/kernel.ts): field, carve grid and nest nav share the
// carve data in state.worldDelta.carve, the played species' dig rules and the state's mound overlays.

import { HashGrid3 } from '@/core/spatial/hashGrid';
import { Store } from '@/core/store';
import type { Vec3 } from '@/core/math/vec3';
import type {
  CarveGrid, EntityIndex, HeightOverlay, Kernel, MaterialId, Mound, NavGrid, Nest, NestFieldTarget, NestNav,
  PheromoneField, SimState, SimStores, WorldData, WorldField,
} from '@/sim/types';
import { MATERIAL_IDS, nestFieldId } from '@/sim/types';
import { digFactor, INDEX_CELL_BU } from '@/sim/balance';
import { createNavGrid, createWorldField } from '@/sim/world';
import { createCarveGrid, createNestNav } from '@/sim/nest';
import { createPheromoneField } from '@/sim/pheromones';
import { createKernel } from '@/sim/kernel';

export interface Services {
  stores: SimStores;
  index: EntityIndex;
  kernel: Kernel;
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

/**
 * The kernel for a state: the played species' dig rules (balance DIG_SPECIES_MULT), the state's dynamic
 * primitives (worldDelta.dynPrims) and its mounds as height overlays. Modules change those at run time through
 * sim.kernel (addPrim / updatePrim / removePrim, setHeightOverlay) so nav and meshes stay in step.
 */
export function createSimKernel(state: SimState, world: WorldData): Kernel {
  const species = state.config.species;
  const kernel = createKernel(world, state.worldDelta.carve, { canDigMaterial: (m) => digFactor(species, m) > 0 });
  for (const p of state.worldDelta.dynPrims) kernel.addPrim(p);
  for (const m of state.worldDelta.mounds) kernel.setHeightOverlay(moundOverlay(m));
  return kernel;
}

/**
 * Height overlay of a mound record (GDD 03 §1.4): `n` x `n` grid points centred on (centerX, centerZ), pile
 * heights `h` added on top of the terrain. `base` (support height for piles on primitives) is not modelled by
 * the overlay: the pile sits on the terrain. The overlay reads `m.h` live; after a mound batch the nest module
 * calls kernel.setHeightOverlay(moundOverlay(m)) again so the carve meshes are refreshed.
 */
export function moundOverlay(m: Mound): HeightOverlay {
  const half = ((m.n - 1) * m.cell) / 2;
  const material = (MATERIAL_IDS as readonly string[]).includes(m.material) ? (m.material as MaterialId) : null;
  return { id: m.id, x0: m.centerX - half, z0: m.centerZ - half, cell: m.cell, nx: m.n, nz: m.n, h: m.h, material };
}

/** Exit / seal / chamber distance fields of one nest in the kernel nav (derived caches; see nestFieldId). */
export function registerNestTargets(nav: NestNav, nest: Nest, bu: number): void {
  const prefix = `nest:${nest.id}:`;
  for (const id of nav.targets()) if (id.startsWith(prefix)) nav.removeTarget(id);
  const exits: Vec3[] = [], seals: Vec3[] = [];
  let exitR = 0, sealR = 0;
  for (const e of nest.entrances) {
    if (e.status === 'open') { exits.push(e.pos); exitR = Math.max(exitR, e.radius); }
    else { seals.push(e.pos); sealR = Math.max(sealR, e.radius); }
  }
  const opening = (r: number) => r + ENTRANCE_SEED_PAD_BU * bu;
  if (exits.length > 0) nav.setTarget(nestFieldId(nest.id, EXIT), { points: exits, radius: opening(exitR) });
  if (seals.length > 0) nav.setTarget(nestFieldId(nest.id, SEAL), { points: seals, radius: opening(sealR) });
  for (const c of nest.chambers) {
    const r = Math.max(bu, Math.min(c.radii.x, c.radii.y, c.radii.z));
    nav.setTarget(nestFieldId(nest.id, { kind: 'chamber', id: c.id }), { points: [c.center], radius: r });
  }
}

/** Extra seed radius around an entrance opening, BU (the opening samples sit just below the surface). */
const ENTRANCE_SEED_PAD_BU = 1;
const EXIT: NestFieldTarget = { kind: 'exit', id: -1 };
const SEAL: NestFieldTarget = { kind: 'seal', id: -1 };

export function createServices(state: SimState, world: WorldData): Services {
  const stores = createStores(state);
  const index = createEntityIndex(stores, INDEX_CELL_BU * world.bu);
  const kernel = createSimKernel(state, world);
  const field = createWorldField(kernel);
  const carve = createCarveGrid(kernel);
  const nestNav = createNestNav(kernel);
  for (const nest of state.nests) if (nest.alive) registerNestTargets(nestNav, nest, world.bu);
  const navGrid = createNavGrid(world);
  const phero = createPheromoneField(state.phero);
  return { stores, index, kernel, field, carve, nestNav, navGrid, phero };
}
