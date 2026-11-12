// Runtime world queries. STUB written by F1b: field.ts / primHash.ts come from F2-kernel, zone and map queries
// from worldgen-terrain, navGrid.ts from loco. Each owner replaces the body of its function here.

import type { Vec3 } from '@/core/math/vec3';
import type { CarveGrid, NavGrid, Sim, WorldData, WorldField, ZoneType } from '@/sim/types';
import { createPlaceholderField, createPlaceholderNavGrid } from '@/sim/testing/placeholders';

/** Zone reported where the map has no zone. */
const FALLBACK_ZONE: ZoneType = 'lawn';

/** The world field f(p) over static world + carve grid. Stub: terrain-only placeholder (F2-kernel replaces). */
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
