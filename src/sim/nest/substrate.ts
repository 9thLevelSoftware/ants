// Substrate rules (GDD 03 §2): dig speed by material, moisture, loose fill and crusts; spans, wall minimums and
// repose angles; soil moisture at depth; the dig power of a caste. Pure queries over state + world.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, MaterialId, Sim, SpeciesId } from '@/sim/types';
import { AntFlag, VoxelFlag } from '@/sim/types';
import {
  CRUST_DIG_DRY, CRUST_DIG_WET, CRUST_WET_M, DIG_HEAD_SCALE, DIG_HEAD_SCALE_NANITIC, DIG_MOISTURE_MULT,
  DIG_SPECIES_MULT, LOOSE_DIG_SPEED, LOOSE_MIN_BASE, MOISTURE_DEFAULT, MOISTURE_DEPTH_MM, MOISTURE_DRY,
  MOISTURE_MID_HI, MOISTURE_MID_LO, MOISTURE_WET, REPOSE_DEFAULT_DEG, REPOSE_DEG, S_MAX, WALL_MIN, WALL_MIN_DEFAULT,
  WOOD_DECAYED_DRY_MULT, WOOD_DRY_MOISTURE, WOOD_SOUND_DRY_SPEED, digFactor,
} from '@/sim/balance/nest';
import { DIG_BITE_S, DIG_MIN_SPEED, DIG_POWER, DIG_POWER_NANITIC } from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { byteAt, heightAt } from '@/sim/world/terrainSample';
import { nestRuntime } from './runtime';

/** The digging species of an ant: its colony's species when it has dig rules, else the played species. */
export function speciesOf(sim: Sim, ant: Ant): SpeciesId {
  const colony = sim.stores.colonies.get(ant.colony);
  const id = colony?.species as string | undefined;
  return id !== undefined && id in DIG_SPECIES_MULT ? (id as SpeciesId) : sim.species.id;
}

/** Dig power of the ant's caste (GDD 03 §1.2); 0 = cannot dig (established queens, alates). */
export function digPowerOf(ant: Ant): number {
  if (ant.caste === 'queen' && (ant.flags & AntFlag.FOUNDING) === 0) return 0;
  const p = DIG_POWER[ant.caste] ?? 0;
  return ant.caste === 'worker' && (ant.flags & AntFlag.NANITIC) !== 0 ? DIG_POWER_NANITIC : p;
}

/** Head scale of the bite brush (GDD 03 §1.2). */
export function headScaleOf(ant: Ant): number {
  if (ant.caste === 'worker' && (ant.flags & AntFlag.NANITIC) !== 0) return DIG_HEAD_SCALE_NANITIC;
  return DIG_HEAD_SCALE[ant.caste] ?? 1;
}

/**
 * Soil moisture 0..1 at p (GDD 03 §9.2): m(d) = m_deep + (m_surf - m_deep) e^(-d / 80 mm), from the
 * environment's top and deep grids; MOISTURE_DEFAULT where there is no grid.
 */
export function moistureAt(sim: Sim, p: Vec3): number {
  const m = sim.state.env?.moisture;
  if (!m || m.nx <= 0 || m.theta0.length === 0) return MOISTURE_DEFAULT;
  let ix = Math.floor(p.x / m.cell), iz = Math.floor(p.z / m.cell);
  ix = ix < 0 ? 0 : ix >= m.nx ? m.nx - 1 : ix;
  iz = iz < 0 ? 0 : iz >= m.nz ? m.nz - 1 : iz;
  const i = iz * m.nx + ix;
  const surf = m.theta0[i] / 255, deep = m.theta1[i] / 255;
  const depth = Math.max(0, heightAt(sim.world.terrain, p.x, p.z) - p.y);
  return deep + (surf - deep) * Math.exp(-depth / MOISTURE_DEPTH_MM);
}

/** dry / mid (1) / wet interpolation of a [dry, wet] multiplier pair at moisture m (GDD 03 §2.1). */
export function moistureMult(pair: readonly [number, number] | undefined, m: number): number {
  if (!pair) return 1;
  return threeBand(pair[0], 1, pair[1], m);
}

function threeBand(dry: number, mid: number, wet: number, m: number): number {
  if (m <= MOISTURE_DRY) return dry;
  if (m < MOISTURE_MID_LO) return dry + (mid - dry) * (m - MOISTURE_DRY) / (MOISTURE_MID_LO - MOISTURE_DRY);
  if (m <= MOISTURE_MID_HI) return mid;
  if (m < MOISTURE_WET) return mid + (wet - mid) * (m - MOISTURE_MID_HI) / (MOISTURE_WET - MOISTURE_MID_HI);
  return wet;
}

/** Largest unsupported span of a ceiling in this material at moisture m, BU (Infinity: never collapses). */
export function sMax(material: MaterialId, m: number, loose = false): number {
  const t = S_MAX[material];
  if (!t) return Infinity;
  if (loose) return 0.75 * t[1];
  return threeBand(t[1], t[0], t[2], m);
}

export function wallMin(material: MaterialId): number {
  return WALL_MIN[material] ?? WALL_MIN_DEFAULT;
}

export function reposeDeg(material: string): number {
  return REPOSE_DEG[material as MaterialId] ?? REPOSE_DEFAULT_DEG;
}

/** Voxel flags of the carve sample nearest p. */
export function flagsAt(sim: Sim, p: Vec3): number {
  const v = sim.carve.voxel;
  return nestRuntime(sim).flags.get(Math.round(p.x / v), Math.round(p.y / v), Math.round(p.z / v));
}

/** Wood moisture 0..1 of the primitive at p (WorldDelta.wood, %), default 0.2. */
function woodMoistureAt(sim: Sim, p: Vec3): number {
  const prim = sim.field.primAt(p, 0);
  if (!prim) return 0.2;
  const w = sim.state.worldDelta.wood.find((s) => s.primId === prim.id);
  return w ? w.moisture / 100 : 0.2;
}

/**
 * Dig speed of the species at p, relative to loam at medium moisture (GDD 03 §2.1, §2.2): material x species
 * multiplier, x moisture, LOOSE fill (and mound piles) x 2 on a base of at least 1, crusts x 0.3 (dry) / 0.7.
 * 0 = not diggable.
 */
export function digSpeedAt(sim: Sim, species: SpeciesId, p: Vec3): number {
  const material = sim.field.materialAt(p);
  const base = digFactor(species, material);
  if (base <= 0) return 0;
  const terrain = heightAt(sim.world.terrain, p.x, p.z);
  const loose = p.y > terrain || (flagsAt(sim, p) & VoxelFlag.LOOSE) !== 0;
  if (loose) return Math.max(LOOSE_MIN_BASE, base) * LOOSE_DIG_SPEED;
  if (material === 'wood-sound') {
    return woodMoistureAt(sim, p) < WOOD_DRY_MOISTURE ? WOOD_SOUND_DRY_SPEED * (DIG_SPECIES_MULT[species]?.[material] ?? 0) : base;
  }
  if (material === 'wood-decayed') return woodMoistureAt(sim, p) < WOOD_DRY_MOISTURE ? base * WOOD_DECAYED_DRY_MULT : base;
  const m = moistureAt(sim, p);
  let speed = base * moistureMult(DIG_MOISTURE_MULT[material], m);
  const crust = byteAt(sim.world.ground.crustMm, p.x, p.z);
  if (crust > 0 && terrain - p.y < crust) speed *= m >= CRUST_WET_M ? CRUST_DIG_WET : CRUST_DIG_DRY;
  return speed;
}

/** Bite duration in ticks: ceil(DIG_BITE_S / (digSpeed x digPower x workRate) / 0.1 s); Infinity if too hard. */
export function biteTicks(sim: Sim, ant: Ant, p: Vec3, workRate = 1): number {
  const rate = digSpeedAt(sim, speciesOf(sim, ant), p) * digPowerOf(ant);
  if (rate < DIG_MIN_SPEED || workRate <= 0) return Infinity;
  // the epsilon keeps exact products (1.0 s -> 10 ticks) from rounding up through float error
  return Math.ceil((DIG_BITE_S / (rate * workRate)) * TICKS_PER_SECOND - 1e-9);
}
