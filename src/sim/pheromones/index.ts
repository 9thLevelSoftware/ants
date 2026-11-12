// Pheromone module API (GDD 02 §8; owner: phero). Behaviours and actions call deposit / sample / senseDirection;
// locomotion senses through sim.phero.sense; weather calls washExposed; human events call wipeRegion; the scent
// view reads forEachActiveCell. The runtime field (sim.phero) works in place on state.phero (plain arrays only).

import type { Vec3 } from '@/core/math/vec3';
import type {
  CommandHandlerMap, PheroCellTest, PheroCellVisitor, PheroChannel, PheroChannelFactors, PheromoneField,
  PheromoneState, PheroRegion, PheroWipeOptions, Sim, System,
} from '@/sim/types';
import { PHERO_CHANNELS } from '@/sim/types';
import { PHERO_DECAY_EVERY } from '@/sim/balance';
import { TICKS_PER_SECOND } from '@/sim/time';
import { PHERO_HALF_LIFE_S } from './balance';
import { createPheromoneField as createField, type PheroFieldOptions, type PheromoneRuntime } from './field';

export * from './balance';
export { pheroDecayRateMult, pheroTempHalfLifeFactor, rainWashFactors, type PheroCellClimate, type PheroExposure } from './factors';
export { pheroChunkKey } from './layer';
export type { PheroFieldOptions, PheroFieldStats, PheromoneRuntime } from './field';
export type { SenseReading } from './sampling';

/** Runtime field over state.phero; rebuilds every index from the plain arrays (use after load too). */
export function createPheromoneField(data: PheromoneState, opts?: PheroFieldOptions): PheromoneRuntime {
  return createField(data, opts);
}

/** The full runtime if sim.phero is this module's field (test fakes may implement only the base interface). */
export function pheroRuntime(f: PheromoneField): PheromoneRuntime | undefined {
  return typeof f.step === 'function' && typeof f.wipeRegion === 'function' ? (f as PheromoneRuntime) : undefined;
}

/**
 * Advances the field to the current tick: decay over active cells (per-channel half-lives, environment modifier
 * hook), alarm diffusion, removal below PHERO_EPS, cap enforcement. Uses elapsed time since lastDecayTick, so
 * skipped ticks (time-lapse) decay correctly.
 */
export function stepPheromones(sim: Sim): void {
  const st = sim.state.phero;
  const t = sim.state.tick;
  const dt = (t - st.lastDecayTick) / TICKS_PER_SECOND;
  if (!(dt > 0)) {
    if (t < st.lastDecayTick) st.lastDecayTick = t;
    return;
  }
  const rt = pheroRuntime(sim.phero);
  if (rt) rt.step(dt);
  else for (const ch of PHERO_CHANNELS) sim.phero.decay(ch, Math.pow(2, -dt / PHERO_HALF_LIFE_S[ch]));
  st.lastDecayTick = t;
}

/** Decay, diffusion and caps every PHERO_DECAY_EVERY ticks. Rain washing and wipes are called by their owners. */
export const pheromoneSystem: System = { name: 'pheromones', phase: 'pheromones', every: PHERO_DECAY_EVERY, run: stepPheromones };

export const systems: readonly System[] = [pheromoneSystem];

/** Lays `amount` pheromone units (ph) of a colony's channel at p; the cell saturates at PHERO_MAX[channel]. */
export function deposit(sim: Sim, colony: number, channel: PheroChannel, p: Vec3, amount: number): void {
  sim.phero.deposit(colony, channel, p, amount);
}

/** Concentration at p, ph: the containing cell, or the trilinear blend of the 8 nearest cells when stronger. */
export function sample(sim: Sim, colony: number, channel: PheroChannel, p: Vec3): number {
  return sim.phero.sample(colony, channel, p);
}

/**
 * Antennal sensing: three sensors 0.9 BU ahead (straight and at +-35 deg) on the tangent plane of `up`; the best
 * heading (unit, tangent) goes into out and the strongest sensor reading (ph) is returned. Heading = fwd when
 * nothing is sensed. Readings of the last call: pheroRuntime(sim.phero)?.lastSense.
 */
export function senseDirection(
  sim: Sim, colony: number, channel: PheroChannel, p: Vec3, fwd: Vec3, up: Vec3, out: Vec3,
): number {
  return sim.phero.sense(colony, channel, p, fwd, up, out);
}

/** Strongest cell >= minValue within radius of p (lost ants): centre into out, returns its value (0 = none). */
export function strongestNear(
  sim: Sim, colony: number, channel: PheroChannel, p: Vec3, radius: number, out: Vec3, minValue?: number,
): number {
  return sim.phero.strongestNear?.(colony, channel, p, radius, out, minValue) ?? 0;
}

/**
 * Rain: multiplies the cells whose centres pass isExposed (no overhead cover, above ground). A number applies
 * to every channel; per-channel factors come from rainWashFactors(class, dt, wind). Returns cells changed.
 */
export function washExposed(sim: Sim, factors: number | PheroChannelFactors, isExposed: PheroCellTest): number {
  return sim.phero.washExposed?.(factors, isExposed) ?? 0;
}

/**
 * Sweeping, footsteps, vacuum and other human events: multiplies exactly the cells whose centres lie in the
 * region (and pass opts.filter), all colonies unless opts.colony. GDD 04 §15.4 gives factors as trail / home;
 * alarm takes the trail value. Cells pushed below PHERO_EPS read 0 at once. Returns cells changed.
 */
export function wipeRegion(
  sim: Sim, region: PheroRegion, factors: number | PheroChannelFactors, opts?: PheroWipeOptions,
): number {
  if (sim.phero.wipeRegion) return sim.phero.wipeRegion(region, factors, opts);
  if (region.kind === 'sphere') {
    for (const ch of PHERO_CHANNELS) {
      const f = typeof factors === 'number' ? factors : ch === 'alarm' ? (factors.alarm ?? factors.trail) : factors[ch];
      sim.phero.scaleRegion(ch, region.center, region.radius, f);
    }
  }
  return 0;
}

/** Removes every layer of a colony (extinct or destroyed rival). The shared alarm layer is colony -1. */
export function clearColony(sim: Sim, colony: number): void {
  sim.phero.clearColony(colony);
}

/** Read-only iteration over active cells (scent view, debug). fn must not modify the field. */
export function forEachActiveCell(sim: Sim, colony: number, channel: PheroChannel, fn: PheroCellVisitor): number {
  return sim.phero.forEachActiveCell?.(colony, channel, fn) ?? 0;
}

export const commandHandlers: Partial<CommandHandlerMap> = {};
