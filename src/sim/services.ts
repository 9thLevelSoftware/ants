// Builds the runtime services of a Sim from plain state + static world (all derived, never persisted).
// The geometric services come from ONE kernel (src/sim/kernel.ts): field, carve grid and nest nav share the
// carve data in state.worldDelta.carve, the played species' dig rules and the state's mound overlays.

import { Store } from '@/core/store';
import type { Vec3 } from '@/core/math/vec3';
import type {
  CarveGrid, EntityIndex, HeightOverlay, Kernel, MaterialId, Mound, NavGrid, Nest, NestFieldTarget, NestNav,
  PheromoneField, SimState, SimStores, WorldData, WorldField,
} from '@/sim/types';
import { MATERIAL_IDS, nestFieldId } from '@/sim/types';
import { digFactor, ENTRANCE_SEED_PAD_BU, INDEX_CELL_BU } from '@/sim/balance';
import { createNavGrid, createWorldField } from '@/sim/world';
import { createEntityIndexImpl } from '@/sim/world/entityIndex';
import { createCarveGrid, createNestNav, registerNestFields } from '@/sim/nest';
import { createPheromoneField } from '@/sim/pheromones';
import { createKernel } from '@/sim/kernel';
import { CarveStore } from '@/sim/nest/carve/grid';

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

/** Spatial hash over ants, brood, items, sources and creatures (loco's index: refresh() + refreshWalkers()). */
export function createEntityIndex(stores: SimStores, cellMm: number): EntityIndex {
  return createEntityIndexImpl(stores, cellMm);
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

const EXIT: NestFieldTarget = { kind: 'exit', id: -1 };
const SEAL: NestFieldTarget = { kind: 'seal', id: -1 };

export function createServices(state: SimState, world: WorldData): Services {
  const stores = createStores(state);
  const index = createEntityIndex(stores, INDEX_CELL_BU * world.bu);
  const kernel = createSimKernel(state, world);
  const field = createWorldField(kernel);
  const carve = createCarveGrid(kernel);
  if (carve instanceof CarveStore) carve.addListener(() => { state.worldDelta.carveChangedTick = state.tick; });
  const nestNav = createNestNav(kernel);
  // the nest module's full field set (exit / seal / chambers via registerNestTargets, plug-seeded D_seal, D_plan)
  registerNestFields(nestNav, carve, state, world.bu);
  const navGrid = createNavGrid(world);
  const phero = createPheromoneField(state.phero);
  return { stores, index, kernel, field, carve, nestNav, navGrid, phero };
}
