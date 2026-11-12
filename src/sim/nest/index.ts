// Nest module API (GDD 03). Owners: carve grid + nest nav = F2-kernel (src/sim/nest/carve, nav; wired by F-int
// through src/sim/kernel.ts); excavation, pellets, mounds, entrances, chambers, dig plans, voxel flags
// (WorldDelta.carveFlags) and the nest system = nestops (the files next to this one); architect = architect.
// The action library decides WHEN an ant bites, drops or plugs; the functions here are WHAT happens.

import type { Vec3 } from '@/core/math/vec3';
import type {
  Ant, BroodStage, CarveGrid, Chamber, ChamberType, CommandHandlerMap, DesignatedBy, DigBiteResult, Entrance,
  Kernel, NestNav, PelletDumpTarget, PlanSource, PlanSpec, PlanValidation, Sim, SimInvariant, SiteReport,
  SpeciesId, System,
} from '@/sim/types';
import { AntFlag, VoxelFlag, nestFieldId } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance';
import { DIG_MIN_SPEED } from '@/sim/balance/actions';
import { PLAN_CLIP_BU, DIG_RAMP_RADIUS_BU } from '@/sim/balance/nest';
import { TICKS_PER_DAY } from '@/sim/time';
import { digBiteImpl } from './bite';
import { carveEllipsoid, carveSphere, fillSphere, forChangedSamples, readBox, sphereBox } from './carveOps';
import { chamberById, designateChamberImpl, findChamberAtImpl } from './chambers/registry';
import { bestBroodChamberImpl } from './chambers/upkeep';
import { nearestOpenEntrance, sealEntranceImpl, unsealEntranceImpl } from './entrances';
import { dumpPelletImpl, isPellet, placePellet, spawnPellet } from './pellets';
import { antSlot, claimSlot, releaseSlot } from './plans/frontier';
import { planG } from './plans/geometry';
import {
  cancelPlanImpl, createEntrancePlan, createPlanImpl, instantCarvePlan, pausePlanImpl, resumePlanImpl,
  setPlanPriorityImpl,
} from './plans/plans';
import { planCache } from './plans/targets';
import { validatePlanImpl } from './plans/validate';
import { nestRuntime } from './runtime';
import { digPowerOf, digSpeedAt, speciesOf } from './substrate';
import { nestFieldsSystem, nestSystem } from './system';

export { nestFieldsSystem, nestSystem } from './system';
export { registerNestFields } from './navFields';
export { biteTicks, digSpeedAt, moistureAt, sMax, wallMin } from './substrate';
export { clutterSpeedMult, chokedSpots } from './pellets';
export { createFoundingNest, carveTemplateNest, nestStatsImpl as nestStats, type NestStats } from './lifecycle';
export { chamberStats, nestBounds, voxelAt, wallSpots, type WallSpot } from './queries';
export { planDigAim } from './plans/frontier';
export { progressOf, slotInReach, instantCarvePlan } from './plans/plans';
export { rimHeight, moundVolume, dumpPoint } from './mounds';
export { broodScore } from './chambers/upkeep';

/** Carve grid over the persisted carve data: the kernel's grid (substrate and hole probes wired by createKernel). */
export function createCarveGrid(kernel: Kernel): CarveGrid {
  return kernel.carve;
}

/**
 * The NestNav contract over the kernel's nav: a thin forwarding object (the kernel's class has private members
 * whose names the nest-level helpers would shadow, e.g. `descend`), plus the helpers keyed by (nestId, target)
 * through nestFieldId. createServices registers the exit / seal / chamber fields (registerNestTargets); the nest
 * module completes the set (navFields.ts: registerNestFields / ensureNestFields).
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

/** Nest architect: proposes plans from needs. Stub: architect. */
export const architectSystem: System = {
  name: 'architect', phase: 'nest', every: ARCHITECT_EVERY, offset: ARCHITECT_OFFSET, run: () => {},
};

export const systems: readonly System[] = [nestFieldsSystem, nestSystem, architectSystem];

// ---- digging ----

/**
 * May this digger take a bite at p? With an ant: its caste can dig, digSpeed x digPower >= DIG_MIN_SPEED, the
 * kernel's predicate allows p (crusts, hard primitives), and an AI digger on a plan stays within its plan volume
 * (+ the ramp radius). With a species id (GDD 03 deliverable `canDigAt(sim, species, p)`): the material rule only.
 */
export function canDigAt(sim: Sim, ant: Ant | SpeciesId, p: Vec3): boolean {
  if (typeof ant === 'string') return digSpeedAt(sim, ant, p) > 0 && sim.kernel.canDigAt(p.x, p.y, p.z);
  const power = digPowerOf(ant);
  if (power <= 0 || digSpeedAt(sim, speciesOf(sim, ant), p) * power < DIG_MIN_SPEED) return false;
  if (!sim.kernel.canDigAt(p.x, p.y, p.z)) return false;
  if ((ant.flags & AntFlag.POSSESSED) !== 0) return true;
  const ref = antSlot(sim, ant);
  const g = ref ? planCache(sim, ref.nest, ref.plan)?.geometry : undefined;
  return !g || planG(g, p.x, p.y, p.z) > -(PLAN_CLIP_BU + DIG_RAMP_RADIUS_BU) * sim.world.bu;
}

/**
 * One dig bite with the RAMP BRUSH (docs/research/spike-nest.md §5 item 5): a capsule whose floor starts at the
 * digger's feet `pos` and runs along the horizontal unit `heading` at `slopeDeg` below the horizontal (positive
 * = downwards). Creates a soil pellet (or expels the soil for a founding queen in `digging`). AI diggers get
 * heading and slope from `planDigAim`.
 */
export function digBite(sim: Sim, ant: Ant, pos: Vec3, heading: Vec3, slopeDeg: number): DigBiteResult {
  return digBiteImpl(sim, ant, pos, heading, slopeDeg);
}

/**
 * Drops a carried pellet (or frass) at p: lost in water ('water'); otherwise it lies there as clutter, on a
 * spoil pile, or as a surface pellet that later settles into a mound (null: placed, no longer carried).
 */
export function dumpPellet(sim: Sim, ant: Ant, itemId: number, p: Vec3): PelletDumpTarget | null {
  return dumpPelletImpl(sim, ant, itemId, p);
}

/** Adds one plug to an entrance (`seal-entrance` primitive); true when it became sealed. */
export function sealEntrance(sim: Sim, entranceId: number, antId: number): boolean {
  return sealEntranceImpl(sim, entranceId, antId);
}

/** Removes one plug from a sealed entrance (`unseal-entrance`); true when it is open again. */
export function unsealEntrance(sim: Sim, entranceId: number, antId: number): boolean {
  return unsealEntranceImpl(sim, entranceId, antId);
}

/** Claims a free dig slot of an active plan for an ant (writes ant.bb.planId / slotIdx). */
export function claimDigSite(sim: Sim, ant: Ant): boolean {
  return claimSlot(sim, ant);
}

/** Frees the ant's dig slot, if any. */
export function releaseDigSite(sim: Sim, ant: Ant): void {
  releaseSlot(sim, ant);
}

// ---- plans and chambers ----

/** Validates a dig plan request (GDD 03 `validatePlan`, player rules). */
export function validatePlan(sim: Sim, spec: PlanSpec, source: PlanSource = 'player'): PlanValidation {
  const v = validatePlanImpl(sim, spec, source);
  return { ok: v.ok, codes: v.codes, warnings: v.warnings, targetVolume: v.targetVolume };
}

/** Creates a plan (after validation); returns the plan id, -1 if rejected. */
export function createPlan(sim: Sim, spec: PlanSpec, source: PlanSource): number {
  return createPlanImpl(sim, spec, source);
}

/** Cancels a plan; false if unknown or already finished. */
export function cancelPlan(sim: Sim, planId: number, reason: string): boolean {
  return cancelPlanImpl(sim, planId, reason);
}

/** Sets a chamber's type; false if not allowed (GDD 03 §6.5). */
export function designateChamber(sim: Sim, chamberId: number, type: ChamberType, by: DesignatedBy): boolean {
  return designateChamberImpl(sim, chamberId, type, by);
}

/** Founding site assessment at p (GDD 03 `siteAt`, GDD 06 §5.7). Not part of nestops: the founding / opening task. */
export function siteAt(_sim: Sim, _p: Vec3): SiteReport | null {
  return null;
}

/** Chamber containing p, or null. */
export function findChamberAt(sim: Sim, p: Vec3): Chamber | null {
  return findChamberAtImpl(sim, p);
}

/** Best chamber id for a brood stage in a nest (microclimate ranking, GDD 03 §9.4), -1 none. */
export function bestBroodChamber(sim: Sim, nestId: number, stage: BroodStage): number {
  return bestBroodChamberImpl(sim, nestId, stage);
}

/** Nearest open entrance of a nest to p, or null. */
export function nearestEntrance(sim: Sim, nestId: number, p: Vec3): Entrance | null {
  return nearestOpenEntrance(sim, nestId, p);
}

/**
 * Flooding hook (GDD 03 §11, T2 weather-effects): sets a chamber's flooded fraction 0..1; a chamber that was
 * flooded stays humid for a game day (`wetUntilTick`, read by the chamber humidity). False for an unknown id.
 */
export function setChamberFlooded(sim: Sim, chamberId: number, fraction: number): boolean {
  const found = chamberById(sim, chamberId);
  if (!found) return false;
  const f = Math.max(0, Math.min(1, fraction));
  if (f > 0) found.c.wetUntilTick = sim.state.tick + TICKS_PER_DAY;
  found.c.flooded = f;
  return true;
}

/** Human or weather disturbance of the nest near center (collapse checks, T2). Hook only: no effect in T1. */
export function disturb(_sim: Sim, _center: Vec3, _radius: number, _cause: string): void {}

// ---- commands owned by this module ----

const reject = (sim: Sim, commandType: string, reason: string): void => sim.emit({ type: 'command-rejected', commandType, reason });

export const commandHandlers: Partial<CommandHandlerMap> = {
  planDig: (sim, c) => {
    const { type: _type, ...spec } = c;
    const v = validatePlan(sim, spec);
    if (!v.ok || (v.warnings.length > 0 && !spec.confirmWarnings) || createPlan(sim, spec, 'player') < 0) {
      sim.emit({ type: 'plan-rejected', kind: spec.kind, codes: v.codes, warnings: v.warnings });
    }
  },
  cancelPlan: (sim, c) => {
    if (!cancelPlan(sim, c.planId, 'player')) reject(sim, c.type, 'unknown-plan');
  },
  setPlanPriority: (sim, c) => {
    if (!setPlanPriorityImpl(sim, c.planId, c.priority)) reject(sim, c.type, 'unknown-plan');
  },
  pausePlan: (sim, c) => {
    if (!pausePlanImpl(sim, c.planId)) reject(sim, c.type, 'unknown-plan');
  },
  resumePlan: (sim, c) => {
    if (!resumePlanImpl(sim, c.planId)) reject(sim, c.type, 'unknown-plan');
  },
  acceptPlan: () => {}, // owner: architect
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
  sealEntrance: (sim, c) => {
    if (createEntrancePlan(sim, c.entranceId, 'seal') < 0) reject(sim, c.type, 'no-target');
  },
  reopenEntrance: (sim, c) => {
    if (createEntrancePlan(sim, c.entranceId, 'reopen') < 0) reject(sim, c.type, 'no-target');
  },
  'cheat.carveSphere': (sim, c) => {
    carveSphere(sim, c.pos, c.r, { force: true });
  },
  'cheat.carveEllipsoid': (sim, c) => {
    // axis-aligned (the kernel's ellipsoid brush); a quarter-turn yaw swaps the horizontal radii
    const q = Math.round((((c.yawDeg % 180) + 180) % 180) / 90) % 2 === 1;
    carveEllipsoid(sim, c.center, q ? { x: c.radii.z, y: c.radii.y, z: c.radii.x } : c.radii, { force: true });
  },
  'cheat.fillSphere': (sim, c) => {
    const box = sphereBox(sim, c.pos, c.r, 2);
    const before = c.loose ? readBox(sim, box) : null;
    fillSphere(sim, c.pos, c.r);
    if (before) {
      const flags = nestRuntime(sim).flags;
      forChangedSamples(sim, box, before, (i, j, k, old, now) => { if (now < old) flags.add(i, j, k, VoxelFlag.LOOSE); });
    }
  },
  'cheat.instantPlan': (sim, c) => {
    instantCarvePlan(sim, c.planId);
  },
  'cheat.spawnPellets': (sim, c) => {
    const nestId = sim.state.colonies[0]?.nestIds[0] ?? -1;
    for (let n = 0; n < c.n; n++) {
      const it = spawnPellet(sim, c.pos, c.volume, sim.field.materialAt(c.pos), nestId, sim.state.colonies[0]?.id ?? -1, -1);
      placePellet(sim, it, c.pos);
    }
  },
  'cheat.setChamberClimate': (sim, c) => {
    const found = chamberById(sim, c.chamberId);
    if (!found) { reject(sim, c.type, 'unknown-chamber'); return; }
    nestRuntime(sim).climate.set(c.chamberId, { temp: c.tempC, rh: c.rh });
    found.c.temp = c.tempC;
    found.c.humidity = c.rh;
  },
};

// ---- invariants (soak runs) ----

const finite = (...xs: number[]): boolean => xs.every((x) => Number.isFinite(x));

export const invariants: readonly SimInvariant[] = [
  {
    name: 'nest-records-finite',
    check(sim, fail) {
      for (const nest of sim.state.nests) {
        if (!nest.alive) continue;
        if (!finite(nest.volumeOpen) || nest.volumeOpen < 0) fail(`nest ${nest.id}: volumeOpen=${nest.volumeOpen}`);
        for (const c of nest.chambers) {
          if (!finite(c.volume, c.center.x, c.center.y, c.center.z, c.depthMm, c.capacity.adults, c.occupancy.adults)) {
            fail(`nest ${nest.id} chamber ${c.id}: non-finite stats`);
          }
        }
        for (const p of nest.digPlans) {
          if (!finite(p.targetVolume, p.removedVolume) || p.removedVolume < 0 || p.removedVolume > p.targetVolume + 1e-6) {
            fail(`nest ${nest.id} plan ${p.id}: removed ${p.removedVolume} of ${p.targetVolume}`);
          }
        }
      }
      for (const m of sim.state.worldDelta.mounds) if (!finite(m.volume) || m.volume < -1e-6) fail(`mound ${m.id}: volume=${m.volume}`);
    },
  },
  {
    name: 'pellets-valid',
    check(sim, fail) {
      for (const it of sim.state.items) {
        if (it.alive && isPellet(it) && !(it.volume > 0 && Number.isFinite(it.volume))) fail(`pellet ${it.id}: volume=${it.volume}`);
      }
    },
  },
  {
    name: 'nest-chambers-reach-exit',
    check(sim, fail) {
      for (const nest of sim.state.nests) {
        if (!nest.alive || !nest.entrances.some((e) => e.status === 'open')) continue;
        for (const c of nest.chambers) {
          if (sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, c.center) < 0) fail(`nest ${nest.id} chamber ${c.id}: no path to an open entrance (N1)`);
        }
      }
    },
  },
];
