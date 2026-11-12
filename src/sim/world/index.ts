// Runtime world queries. STUB written by F1b/F1c: field.ts / primHash.ts come from F2-kernel (wired in by the
// wiring task), zone and map queries from worldgen-terrain, navGrid.ts from loco. Each owner replaces the body of
// its function here.

import type { Vec3 } from '@/core/math/vec3';
import type { CarveGrid, CommandHandlerMap, NavGrid, Sim, System, WorldData, WorldField, ZoneType } from '@/sim/types';
import { createPlaceholderField, createPlaceholderNavGrid } from '@/sim/testing/placeholders';

/** Zone reported where the map has no zone. */
const FALLBACK_ZONE: ZoneType = 'lawn';

/** The world field f(p) over static world + carve grid. Stub: terrain-only placeholder (wiring task replaces). */
export function createWorldField(world: WorldData, _carve: CarveGrid): WorldField {
  return createPlaceholderField(world);
}

/** Coarse 16 BU nav grid. Stub: everything open (loco replaces with src/sim/world/navGrid.ts). */
export function createNavGrid(world: WorldData): NavGrid {
  return createPlaceholderNavGrid(world);
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
