// Nest module API. STUB written by F1b. Owners: carve grid + nest nav = F2-kernel (src/sim/nest/carve, nav);
// systems, entrances, chambers, plans, pellets, mounds = nestops; architect = architect.

import type { Vec3 } from '@/core/math/vec3';
import type {
  Ant, BroodStage, CarveData, CarveGrid, Chamber, Entrance, NestNav, PlanSpec, PlanValidation, Sim, SiteReport,
  System, WorldData,
} from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance';
import { createPlaceholderNestNav } from '@/sim/testing/placeholders';
import { createCarveGrid as createKernelCarveGrid } from './carve';

/** Carve grid over the persisted carve data (the kernel's grid; F2-kernel wires the substrate probe here). */
export function createCarveGrid(data: CarveData, _world: WorldData): CarveGrid {
  return createKernelCarveGrid(data);
}

/** BFS nest distance fields. Stub: nothing reachable (F2-kernel replaces). */
export function createNestNav(_world: WorldData, _carve: CarveGrid): NestNav {
  return createPlaceholderNestNav();
}

/** Carve ops, breaches/entrances, chamber detection, nav-field refresh, pellets and mounds. Stub: nestops. */
export const nestSystem: System = { name: 'nest', run: () => {} };

/** Nest architect: proposes plans from needs. Stub: architect. */
export const architectSystem: System = {
  name: 'architect', every: ARCHITECT_EVERY, offset: ARCHITECT_OFFSET, run: () => {},
};

/** Validates a dig plan request. Stub: always rejects (nestops). */
export function validatePlan(_sim: Sim, _spec: PlanSpec): PlanValidation {
  return { ok: false, codes: ['anchor-not-in-nest'], warnings: [], targetVolume: 0 };
}

/** Chamber containing p, or null. Stub: null (nestops). */
export function findChamberAt(_sim: Sim, _p: Vec3): Chamber | null {
  return null;
}

/** Best chamber id for a brood stage in a nest (microclimate ranking), -1 none. Stub (nestops). */
export function bestBroodChamber(_sim: Sim, _nestId: number, _stage: BroodStage): number {
  return -1;
}

/** Claims a free dig slot for an ant (writes ant.bb.planId/slotIdx). Stub: none available (nestops). */
export function claimDigSlot(_sim: Sim, _ant: Ant): boolean {
  return false;
}

export function releaseDigSlot(_sim: Sim, _ant: Ant): void {}

/** Nearest open entrance of a nest to p, or null. Stub: null (nestops). */
export function nearestEntrance(_sim: Sim, _nestId: number, _p: Vec3): Entrance | null {
  return null;
}

/** Founding site assessment at p. Stub: null (nestops / founding). */
export function siteAt(_sim: Sim, _p: Vec3): SiteReport | null {
  return null;
}

/** Human or weather disturbance of the nest near center (loosens walls). Stub (nestops). */
export function disturb(_sim: Sim, _center: Vec3, _radius: number, _cause: string): void {}
