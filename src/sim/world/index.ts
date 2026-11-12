// Runtime world queries. The field is the kernel's (src/sim/world/field.ts, F2; wired by F-int); zone and map
// queries come from worldgen-terrain, navGrid.ts from loco. Each owner replaces the body of its function here.

import type { Vec3 } from '@/core/math/vec3';
import type { CommandHandlerMap, Kernel, NavGrid, Sim, SpeciesId, System, WorldData, WorldField, ZoneType } from '@/sim/types';
import { digFactor } from '@/sim/balance';
import { createNavGridImpl } from './navGrid';

/** Zone reported where the map has no zone. */
const FALLBACK_ZONE: ZoneType = 'lawn';

/**
 * The world field contract over the kernel's field (the same object, so hot callers pay no indirection), with the
 * species diggability query added: material table of GDD 03 §2.1 (balance digFactor).
 */
export function createWorldField(kernel: Kernel): WorldField {
  // adding a property to the kernel's instance must never shadow one of its own members
  if ('diggability' in kernel.field) throw new Error('createWorldField: the kernel field already has diggability');
  const f = kernel.field as WorldField;
  f.diggability = (p: Vec3, species: SpeciesId) => digFactor(species, kernel.field.materialAt(p));
  return f;
}

/** Coarse 16 BU nav grid (loco: src/sim/world/navGrid.ts). */
export function createNavGrid(world: WorldData): NavGrid {
  return createNavGridImpl(world);
}

/** Zone type at (x, z), from the zone map. Stub-quality but real (worldgen-terrain may refine). */
export function zoneAt(world: WorldData, x: number, z: number): ZoneType {
  const m = world.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  const id = ix >= 0 && iz >= 0 && ix < m.nx && iz < m.nz ? m.data[iz * m.nx + ix] : 0;
  return world.zones.find((zd) => zd.id === id)?.type ?? FALLBACK_ZONE;
}

/** Shade 0 (full sun) .. 1 at p for a sun direction. Stub: 0 (worldgen-terrain / env-core replace). */
export function shadeAt(_sim: Sim, _p: Vec3, _sunDir: Vec3): number {
  return 0;
}

/** World systems (micro-connection discovery, terrain deformation). None yet: worldgen-life / loco add them. */
export const systems: readonly System[] = [];

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.revealMicro': (sim) => {
    for (const m of sim.state.worldDelta.microState) { m.discovered = true; m.discoveredTick = sim.state.tick; }
  },
};
