// Test support for the architect (imported by *.test.ts only): a flat-world sim running commands, the nest system
// and the architect; a founding nest at the world centre; scripted population and brood; an instant test digger.

import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId, Nest, Sim } from '@/sim/types';
import { removeItem, spawnAnt, spawnBrood } from '@/sim/entities';
import { ARCHITECT_EVERY } from '@/sim/balance/cadence';
import { commandsSystem } from '@/sim/systems';
import { nestSim } from '../nestTestKit';
import { carveTemplateNest } from '../lifecycle';
import { instantCarvePlan, isTerminal } from '../plans/plans';
import { isPellet } from '../pellets';
import { nestSystem } from '../system';
import { architectSystem } from './index';
import { recordCreations, type CreatedPlan } from './nestChecks';
import { architectRuntime } from './runtime';

export interface ArchSimOptions {
  seed?: number;
  /** World edge, BU (default 220: the Lasius footprint of 80 BU fits around the centre). */
  sizeBu?: number;
  material?: MaterialId;
  moisture?: number;
  /** Run the architect system (default true). */
  architect?: boolean;
  terrain?: 'flat' | 'noise';
  /** Carve the founding template (default true). */
  template?: boolean;
}

/** A sim with the player nest at the world centre, carved as the founding template (cell kept `founding`) unless `template: false`. */
export function archSim(o: ArchSimOptions = {}): { sim: Sim; nest: Nest } {
  const systems = o.architect === false ? [commandsSystem, nestSystem] : [commandsSystem, nestSystem, architectSystem];
  const sim = nestSim({ seed: o.seed ?? 1, sizeBu: o.sizeBu ?? 220, material: o.material ?? 'loam', moisture: o.moisture ?? 0.4, terrain: o.terrain, systems });
  const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
  const c = sim.world.size / 2;
  nest.origin = { x: c, y: sim.field.height(c, c), z: c };
  if (o.template !== false) carveTemplateNest(sim, nest.id, { chambers: [], royal: false });
  return { sim, nest };
}

/** Where scripted ants and brood are put: the first chamber's centre (positions do not matter to the needs). */
function home(nest: Nest): { pos: Vec3; chamberId: number } {
  const c = nest.chambers[0];
  return c ? { pos: { ...c.center }, chamberId: c.id } : { pos: { ...nest.origin }, chamberId: -1 };
}

/** Adds workers until the colony has `n` adult workers in this nest. */
export function growWorkers(sim: Sim, nest: Nest, n: number): void {
  const colony = sim.state.colonies[0];
  let have = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === colony.id && a.caste === 'worker') have++;
  const h = home(nest);
  for (; have < n; have++) {
    spawnAnt(sim, { colony: colony.id, caste: 'worker', pos: h.pos, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5, nestId: nest.id, chamberId: h.chamberId });
  }
}

/** Adds larvae until the colony has `n` brood in this nest. */
export function growBrood(sim: Sim, nest: Nest, n: number): void {
  const colony = sim.state.colonies[0];
  let have = 0;
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === colony.id) have++;
  const h = home(nest);
  for (; have < n; have++) {
    spawnBrood(sim, { colony: colony.id, stage: 'larva', destined: 'worker', pos: h.pos, nestId: nest.id, chamberId: h.chamberId });
  }
}

/**
 * The test digger: carves every live architect plan of the nest at once, and its haulers take the spoil the
 * completion snap leaves in the nest away (instantly: the volume is not added to the mound). Returns the plans.
 */
export function digAll(sim: Sim, nest: Nest): number[] {
  const done: number[] = [];
  for (const p of [...nest.digPlans]) {
    if (p.source !== 'architect' || isTerminal(p.status)) continue;
    instantCarvePlan(sim, p.id);
    done.push(p.id);
  }
  for (const it of sim.stores.items.list) {
    if (it.alive && isPellet(it) && it.nestId === nest.id && it.carrierIds.length === 0) removeItem(sim, it.id, 'hauled');
  }
  return done;
}

export function runTicks(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

export interface Grown {
  sim: Sim;
  nest: Nest;
  /** The architect's plans, validated independently right before creation. */
  created: CreatedPlan[];
  /** Chamber types and open volume when the population first reached 40 workers. */
  at40: { types: Record<string, number>; volume: number } | null;
}

export interface GrowOptions {
  seed: number;
  periods?: number;
  workers?: number;
  broodPerWorker?: number;
  /** Called after every architect period (tests that look inside the run). */
  each?: (sim: Sim, nest: Nest, period: number) => void;
}

/**
 * The scripted growth scenario: a founding nest, the population growing as (k / periods)^1.5 x workers with
 * brood per worker, one architect period (600 ticks) per step, every architect plan completed at once after it.
 */
export function grow(o: GrowOptions): Grown {
  const periods = o.periods ?? 36, workers = o.workers ?? 300, brood = o.broodPerWorker ?? 0.4;
  const { sim, nest } = archSim({ seed: o.seed, terrain: 'noise' });
  const created: CreatedPlan[] = [];
  architectRuntime(sim).probe = recordCreations(sim, created);
  let at40: Grown['at40'] = null;
  for (let k = 1; k <= periods + 2; k++) {
    const w = Math.round(workers * Math.min(1, k / periods) ** 1.5);
    growWorkers(sim, nest, w);
    growBrood(sim, nest, Math.round(w * brood));
    runTicks(sim, ARCHITECT_EVERY);
    digAll(sim, nest);
    o.each?.(sim, nest, k);
    if (!at40 && w >= 40) {
      const types: Record<string, number> = {};
      for (const c of nest.chambers) types[c.type] = (types[c.type] ?? 0) + 1;
      at40 = { types, volume: nest.volumeOpen };
    }
  }
  runTicks(sim, 60); // chamber detection and occupancy settle
  return { sim, nest, created, at40 };
}

const proc = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stderr?: { write(s: string): void } } }).process;

/** FOUNDRESS_ARCH_LOG=1 prints the architect tests' measurements (stderr). */
export const ARCH_LOG = proc?.env.FOUNDRESS_ARCH_LOG === '1';

/** Writes a line to stderr (reports from tests; always shown when `force`, else only with FOUNDRESS_ARCH_LOG=1). */
export function testLog(force: boolean, ...a: unknown[]): void {
  if (force || ARCH_LOG) proc?.stderr?.write(a.map(String).join(' ') + '\n');
}

/** Timeout of tests that run the simulation for several architect periods (the shared machine is often loaded). */
export const SIM_TEST_TIMEOUT = 60_000;

/** FOUNDRESS_PERF_STRICT=1 (always assert wall-clock budgets). */
export const PERF_STRICT_ENV = proc?.env.FOUNDRESS_PERF_STRICT === '1';
