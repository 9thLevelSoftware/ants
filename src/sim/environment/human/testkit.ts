// Test helpers for the human-events module (not a test file): small worlds with a patio of slabs and sand joints,
// a sim running only this module's system, ants placed on surfaces, instances run to their end.

import type { HumanEventInst, MaterialId, Primitive, Sim, SpeciesId, WorldData, ZoneType, ZoneVariant } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { PrimFlag } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { buildWorld, TEST_START } from '@/sim/testing';
import { defaultWorldParams } from '@/worldgen';
import type { DifficultyId } from '@/sim/types';
import { humanEventsSystem } from './index';
import { humanPlan } from './plans';
import { newInst } from './reactive';
import { rowFrequency, siteScale, type DayContext } from './schedule';
import { humanSites } from './sites';
import { HUMAN_SCHEDULE, type HumanScheduleRow } from '@/sim/balance/human';

export interface PatioOptions {
  sizeMm?: number;
  zone?: ZoneType;
  variant?: ZoneVariant | null;
  surface?: MaterialId;
  /** Paving slabs of this edge (mm) with sand joints of jointMm between them; 0 = bare ground. */
  slabMm?: number;
  jointMm?: number;
  slabTopMm?: number;
  slabMaterial?: MaterialId;
  prims?: Primitive[];
  species?: SpeciesId;
}

/** A square world of one zone; optionally covered by slabs with open joints (crevices) between them. */
export function patioWorld(o: PatioOptions = {}): WorldData {
  const species = o.species ?? 'lasius-niger';
  const size = o.sizeMm ?? 4000;
  const prims: Primitive[] = [...(o.prims ?? [])];
  const slab = o.slabMm ?? 0, joint = o.jointMm ?? 12, top = o.slabTopMm ?? 40;
  if (slab > 0) {
    let id = 1000;
    for (let x = joint; x + slab <= size; x += slab + joint) {
      for (let z = joint; z + slab <= size; z += slab + joint) {
        prims.push({
          id: id++, shape: 'box', pos: { x: x + slab / 2, y: top / 2, z: z + slab / 2 }, rot: { x: 0, y: 0, z: 0, w: 1 },
          size: { x: slab / 2, y: top / 2, z: slab / 2 }, round: 0, material: o.slabMaterial ?? 'concrete', flags: PrimFlag.CLIMBABLE, objectId: -1,
        });
      }
    }
  }
  const params = { ...defaultWorldParams(species, 1), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  const w = buildWorld({ params, size, bu: species === 'lasius-niger' ? 4 : 7, height: () => 0, prims, zone: o.zone ?? 'pavement', surface: o.surface ?? 'sand' });
  w.zones[0].variant = o.variant === undefined ? 'patio' : o.variant;
  w.zones[0].areaMm2 = size * size;
  if (slab > 0) w.queenStart.pos.y = top + 50;
  return w;
}

export function humanSim(world: WorldData, preset: DifficultyId = 'naturalist', systems = [humanEventsSystem]): Sim {
  // a summer afternoon as these tests were written for (TEST_START: the pre-R20 start day of the reference species)
  const base = { ...defaultGameConfig('lasius-niger', 1, preset), ...TEST_START };
  const { state } = createNewGame({ ...base, cheats: true, world: world.params }, world);
  const sim = createSim(state, world, { systems });
  // the founding queen sits far away (grace rule) unless a test moves her
  const q = sim.state.ants[0];
  if (q) { q.pos = { x: -1e5, y: 0, z: -1e5 }; q.nestId = 1; }
  return sim;
}

/** A worker set at a ground point without the walker (inside a joint or crack too narrow to place into). */
export function setWorker(sim: Sim, x: number, y: number, z: number): number {
  const col = sim.state.colonies[0];
  return spawnAnt(sim, { colony: col.id, caste: 'worker', pos: { x, y, z }, ageGd: 5 }).id;
}

/** A worker standing on the surface below (x, top, z); -1 if no surface. */
export function placeWorker(sim: Sim, x: number, z: number, fromY = 200): number {
  const col = sim.state.colonies[0];
  const a = spawnAnt(sim, { colony: col.id, caste: 'worker', pos: { x, y: 0, z }, ageGd: 5 });
  if (!walkerPlace(sim.field, a, { x, y: fromY, z }, { dir: { x: 0, y: -1, z: 0 } }, sim.kernel.walker)) return -1;
  return a.id;
}

/** Schedules an instance now (cheat path) and returns it. */
export function scheduleNow(sim: Sim, kind: HumanEventInst['kind'], variant: HumanEventInst['variant'], regionId: number, at: Vec3 | null): HumanEventInst {
  const inst = newInst(sim, kind, variant, regionId, sim.state.tick, at);
  sim.state.env.human.scheduled.push(inst);
  return inst;
}

/** Ticks until the instance's run ended (or `max` ticks). */
export function runToEnd(sim: Sim, inst: HumanEventInst, max = 6000): void {
  let seen = false;
  for (let i = 0; i < max; i++) {
    sim.tick();
    const active = sim.state.env.human.active.some((r) => r.instId === inst.id);
    if (active) seen = true;
    if (seen && !active) return;
    if (!seen && inst.cancelled) return;
  }
}

export function alive(sim: Sim, ids: readonly number[]): number {
  return ids.filter((id) => sim.stores.ants.get(id)?.alive).length;
}

export { humanPlan };

/**
 * Expected number of drawn events per kind on one day, with the variance of the integer draw (floor + Bernoulli,
 * split per window for perWindow rows), a row's day probability, per-bay scaling and the notOnDayOf rule.
 */
export function expectedDay(sim: Sim, ctx: DayContext): Record<string, { mean: number; var: number }> {
  const out: Record<string, { mean: number; var: number }> = {};
  const sites = humanSites(sim.world).list;
  const rowSites = (row: HumanScheduleRow) => (row.kind === 'watering'
    ? (sites.some((s) => s.kind === 'sprinkler' || s.kind === 'bed') ? [sites.find((s) => s.kind === 'sprinkler' || s.kind === 'bed')!] : [])
    : sites.filter((s) => s.kind === row.site));
  const bern = (f: number) => { const fr = f - Math.floor(f); return fr * (1 - fr); };
  for (const row of HUMAN_SCHEDULE) {
    let p = row.dayP ?? 1;
    if (row.notOnDayOf) {
      // probability that no row of that kind draws anything today
      for (const dep of HUMAN_SCHEDULE.filter((r) => r.kind === row.notOnDayOf)) {
        for (const s of rowSites(dep)) { const f = rowFrequency(dep, ctx) * siteScale(dep, s); p *= f >= 1 ? 0 : 1 - f; }
      }
    }
    const e = out[row.kind] ??= { mean: 0, var: 0 };
    for (const s of rowSites(row)) {
      const f = rowFrequency(row, ctx) * siteScale(row, s);
      const total = row.windows.reduce((a, w) => a + w.w, 0);
      const v = row.perWindow ? row.windows.reduce((a, w) => a + bern((f * w.w) / total), 0) : bern(f);
      e.mean += p * f;
      e.var += p * v + p * (1 - p) * f * f;
    }
  }
  return out;
}
