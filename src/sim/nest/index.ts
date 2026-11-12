// Nest module API. STUB written by F1b/F1c with final signatures. Owners: carve grid + nest nav = F2-kernel
// (src/sim/nest/carve, nav; wired in by F-int through src/sim/kernel.ts); systems, entrances, chambers, plans,
// pellets, mounds, voxel flags (WorldDelta.carveFlags) = nestops; architect = architect.

import type { Vec3 } from '@/core/math/vec3';
import type {
  Ant, BroodStage, CarveGrid, Chamber, ChamberType, CommandHandlerMap, DesignatedBy, DigBiteResult,
  Entrance, Kernel, NestNav, PelletDumpTarget, PlanSource, PlanSpec, PlanValidation, Sim, SiteReport, System,
} from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance';

/** Carve grid over the persisted carve data: the kernel's grid (substrate and hole probes wired by createKernel). */
export function createCarveGrid(kernel: Kernel): CarveGrid {
  return kernel.carve;
}

/**
 * The NestNav contract over the kernel's nav: a thin forwarding object (the kernel's class has private members
 * whose names the nest-level helpers would shadow, e.g. `descend`), plus the helpers keyed by (nestId, target)
 * through nestFieldId. Fields are registered by src/sim/services.ts registerNestTargets.
 */
export function createNestNav(kernel: Kernel): NestNav {
  const raw = kernel.nav;
  return {
    setTarget: (id, seeds) => raw.setTarget(id, seeds),
    removeTarget: (id) => raw.removeTarget(id),
    hasTarget: (id) => raw.hasTarget(id),
    targets: () => raw.targets(),
    distanceAt: (id, p) => raw.distanceAt(id, p),
    stepDir: (id, p, out) => raw.stepDir(id, p, out),
    lookahead: (id, p, steps, out) => raw.lookahead(id, p, steps, out),
    componentAt: (p) => raw.componentAt(p),
    nearestOpen: (p, out) => raw.nearestOpen(p, out),
    build: (id) => raw.build(id),
    flush: () => raw.flush(),
    invalidateBox: (box) => raw.invalidateBox(box),
    rebuildAll: () => raw.rebuildAll(),
    stats: () => raw.stats(),
    dispose: () => raw.dispose(),
    distance(nestId, target, p) {
      const id = nestFieldId(nestId, target);
      if (!raw.hasTarget(id)) return -1;
      const d = raw.distanceAt(id, p);
      return Number.isFinite(d) ? d : -1;
    },
    descend(nestId, target, p, out) {
      const id = nestFieldId(nestId, target);
      if (!raw.hasTarget(id)) return false;
      const d = raw.stepDir(id, p, out);
      return Number.isFinite(d) && d > 0 && out.x * out.x + out.y * out.y + out.z * out.z > 0;
    },
    onCarve: () => {},
    rebuild: () => raw.rebuildAll(),
  };
}

/** Carve ops, breaches/entrances, chamber detection, nav-field refresh, pellets and mounds. Stub: nestops. */
export const nestSystem: System = { name: 'nest', phase: 'nest', run: () => {} };

/** Nest architect: proposes plans from needs. Stub: architect. */
export const architectSystem: System = {
  name: 'architect', phase: 'nest', every: ARCHITECT_EVERY, offset: ARCHITECT_OFFSET, run: () => {},
};

export const systems: readonly System[] = [nestSystem, architectSystem];

// ---- digging (owner: nestops) ----

/** Whether `ant` may take a dig bite at p (material, plan / claim rules, founding rules). Stub: false. */
export function canDigAt(_sim: Sim, _ant: Ant, _p: Vec3): boolean {
  return false;
}

/**
 * One dig bite with the RAMP BRUSH (docs/research/spike-nest.md §5 item 5): a capsule whose floor starts at the
 * digger's feet `pos` and runs along the horizontal unit `heading` at `slopeDeg` below the horizontal (positive
 * = downwards). Creates a soil pellet. Stub: nothing dug, reason 'not-diggable'.
 */
export function digBite(_sim: Sim, _ant: Ant, _pos: Vec3, _heading: Vec3, _slopeDeg: number): DigBiteResult {
  return { ok: false, reason: 'not-diggable', voxels: 0, pelletId: -1, material: null };
}

/** Drops a carried pellet (or frass, chaff ...) at p: mound, heap, plug, tamp ...; null if refused. Stub: null. */
export function dumpPellet(_sim: Sim, _ant: Ant, _itemId: number, _p: Vec3): PelletDumpTarget | null {
  return null;
}

/** Adds one plug to an entrance (`seal-entrance` primitive); true when it became sealed. Stub: false. */
export function sealEntrance(_sim: Sim, _entranceId: number, _antId: number): boolean {
  return false;
}

/** Removes one plug from a sealed entrance (`unseal-entrance`); true when it is open again. Stub: false. */
export function unsealEntrance(_sim: Sim, _entranceId: number, _antId: number): boolean {
  return false;
}

/** Claims a free dig slot of an active plan for an ant (writes ant.bb.planId / slotIdx). Stub: none available. */
export function claimDigSite(_sim: Sim, _ant: Ant): boolean {
  return false;
}

/** Frees the ant's dig slot, if any. Stub: no-op. */
export function releaseDigSite(_sim: Sim, _ant: Ant): void {}

// ---- plans and chambers (owner: nestops; architect for proposals) ----

/** Validates a dig plan request (GDD 03 `validatePlan`). Stub: rejected, 'anchor-not-in-nest'. */
export function validatePlan(_sim: Sim, _spec: PlanSpec): PlanValidation {
  return { ok: false, codes: ['anchor-not-in-nest'], warnings: [], targetVolume: 0 };
}

/** Creates a plan (after validation); returns the plan id, -1 if rejected. Stub: -1. */
export function createPlan(_sim: Sim, _spec: PlanSpec, _source: PlanSource): number {
  return -1;
}

/** Cancels a plan; false if unknown or already finished. Stub: false. */
export function cancelPlan(_sim: Sim, _planId: number, _reason: string): boolean {
  return false;
}

/** Sets a chamber's type; false if not allowed (type-not-allowed rules). Stub: false. */
export function designateChamber(_sim: Sim, _chamberId: number, _type: ChamberType, _by: DesignatedBy): boolean {
  return false;
}

/** Founding site assessment at p (GDD 03 `siteAt`, GDD 06 §5.7). Stub: null. */
export function siteAt(_sim: Sim, _p: Vec3): SiteReport | null {
  return null;
}

/** Chamber containing p, or null. Stub: null. */
export function findChamberAt(_sim: Sim, _p: Vec3): Chamber | null {
  return null;
}

/** Best chamber id for a brood stage in a nest (microclimate ranking), -1 none. Stub: -1. */
export function bestBroodChamber(_sim: Sim, _nestId: number, _stage: BroodStage): number {
  return -1;
}

/** Nearest open entrance of a nest to p, or null. Stub: null. */
export function nearestEntrance(_sim: Sim, _nestId: number, _p: Vec3): Entrance | null {
  return null;
}

/** Human or weather disturbance of the nest near center (loosens walls). Stub: no-op. */
export function disturb(_sim: Sim, _center: Vec3, _radius: number, _cause: string): void {}

// ---- commands owned by this module ----

const noop = (): void => {};

export const commandHandlers: Partial<CommandHandlerMap> = {
  planDig: (sim, c) => {
    const { type: _type, ...spec } = c;
    const v = validatePlan(sim, spec);
    if (!v.ok || (v.warnings.length > 0 && !spec.confirmWarnings) || createPlan(sim, spec, 'player') < 0) {
      sim.emit({ type: 'plan-rejected', kind: spec.kind, codes: v.codes, warnings: v.warnings });
    }
  },
  cancelPlan: (sim, c) => {
    cancelPlan(sim, c.planId, 'player');
  },
  setPlanPriority: noop, // owner: nestops
  pausePlan: noop, // owner: nestops
  resumePlan: noop, // owner: nestops
  acceptPlan: noop, // owner: architect
  designateChamber: (sim, c) => {
    if (designateChamber(sim, c.chamberId, c.chamberType, 'player')) return;
    sim.emit({ type: 'command-rejected', commandType: c.type, reason: 'type-not-allowed' });
  },
  setAutoExpand: (sim, c) => {
    const nest = sim.stores.nests.get(c.nestId);
    if (nest) nest.architect.mode = c.mode;
  },
  setArchitectNeed: (sim, c) => {
    const nest = sim.stores.nests.get(c.nestId);
    if (nest) nest.architect.needToggles[c.need] = c.enabled;
  },
  sealEntrance: noop, // owner: nestops (creates a `seal` plan)
  reopenEntrance: noop, // owner: nestops (creates a `reopen` plan)
  'cheat.carveSphere': (sim, c) => {
    sim.carve.carveSphere(c.pos, c.r);
  },
  'cheat.carveEllipsoid': (sim, c) => {
    sim.carve.carveEllipsoid(c.center, c.radii); // axis-aligned: yaw is ignored until the kernel supports it
  },
  'cheat.fillSphere': (sim, c) => {
    sim.carve.fillSphere(c.pos, c.r); // LOOSE voxel flags (WorldDelta.carveFlags): nestops
  },
  'cheat.instantPlan': noop, // owner: nestops
  'cheat.spawnPellets': noop, // owner: nestops
  'cheat.setChamberClimate': noop, // owner: nestops / env-core
};
