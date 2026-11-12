// Pheromone module API. STUB written by F1b/F1c with final signatures; owner: phero.
// Behaviours call deposit / sample / senseDirection; the runtime field (sim.phero) wraps state.phero.

import type { Vec3 } from '@/core/math/vec3';
import type { CommandHandlerMap, PheroChannel, PheromoneField, PheromoneState, Sim, System } from '@/sim/types';
import { PHERO_DECAY_EVERY } from '@/sim/balance';
import { createPlaceholderPheromones } from '@/sim/testing/placeholders';

/** Runtime field over state.phero. Stub: deposit/sample only, no diffusion or sensing. */
export function createPheromoneField(data: PheromoneState): PheromoneField {
  return createPlaceholderPheromones(data);
}

/** Decay, diffusion, rain wash and disturbance multipliers. Stub: phero. */
export const pheromoneSystem: System = { name: 'pheromones', phase: 'pheromones', every: PHERO_DECAY_EVERY, run: () => {} };

export const systems: readonly System[] = [pheromoneSystem];

/** Lays `amount` pheromone units (ph) of a colony's channel at p (caps per channel: phero). */
export function deposit(sim: Sim, colony: number, channel: PheroChannel, p: Vec3, amount: number): void {
  sim.phero.deposit(colony, channel, p, amount);
}

/** Concentration at p, ph. */
export function sample(sim: Sim, colony: number, channel: PheroChannel, p: Vec3): number {
  return sim.phero.sample(colony, channel, p);
}

/**
 * Antennal sensing: the tangent-plane direction (frame fwd/up) of increasing concentration into out; returns the
 * local strength, ph. Stub: zero direction (placeholder field).
 */
export function senseDirection(
  sim: Sim, colony: number, channel: PheroChannel, p: Vec3, fwd: Vec3, up: Vec3, out: Vec3,
): number {
  return sim.phero.sense(colony, channel, p, fwd, up, out);
}

export const commandHandlers: Partial<CommandHandlerMap> = {};
