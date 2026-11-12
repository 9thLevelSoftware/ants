// Test / demo helper: wraps the kernel's services in the minimal Sim shape the nest adapter reads
// (field, carve, world, state.player / nests / env, stores.ants). Not used by the renderer itself.
import type { Sim } from '@/sim/types';
import type { Kernel } from '@/sim/kernel';

export interface KernelSimExtras {
  /** Ants by id (only `pos` is read). */
  ants?: Map<number, { pos: { x: number; y: number; z: number } }>;
  possessedAntId?: number;
}

export function kernelSim(kernel: Kernel, extras: KernelSimExtras = {}): Sim {
  const ants = extras.ants ?? new Map();
  const state = {
    tick: 0,
    player: { possessedAntId: extras.possessedAntId ?? -1 },
    nests: [],
    env: {},
    worldDelta: { carve: kernel.carve.data, mounds: [], dynPrims: [], objectStates: [], heightDeltas: [] },
  };
  return {
    world: kernel.world, field: kernel.field, carve: kernel.carve, state,
    stores: { ants: { get: (id: number) => ants.get(id) } },
  } as unknown as Sim;
}
