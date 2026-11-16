// Ground queries for plans and effects: the top surface a sole or a tyre rests on, and the surface class of the
// crush table (GDD 04 §15.4: hard / bare soft / sward / litter; sand is bare soft for crushing, 0.3 for tremor).

import type { MaterialId, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { LITTER_MIN, SWARD_MIN_MM, type SurfaceClass } from '@/sim/balance/human';
import { terrainHeightAt } from '@/sim/entities/placement';
import { zoneIdAt } from './grid';

/** How far above the ground (or floor) the downward probe for the top surface starts, mm. */
const PROBE_ABOVE_MM = 150;
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
const probe: Vec3 = { x: 0, y: 0, z: 0 };

/** Height of the top walkable surface at (x, z), mm (slabs, kerbs and floors count; tall furniture does not). */
export function surfaceY(sim: Sim, x: number, z: number, floorY = NaN): number {
  const base = Number.isFinite(floorY) ? Math.max(floorY, sim.field.height(x, z)) : sim.field.height(x, z);
  probe.x = x; probe.y = base + PROBE_ABOVE_MM; probe.z = z;
  const d = sim.field.sphereTrace(probe, DOWN, PROBE_ABOVE_MM * 3, 0);
  return d >= PROBE_ABOVE_MM * 3 ? base : probe.y - d;
}

/**
 * Height a plan uses (static data only, so a plan rebuilt after a load is identical): the floor indoors, else the
 * generated terrain. Effects and the renderer take the live surface (surfaceY) when they need it.
 */
export function planY(sim: Sim, x: number, z: number, floorY = NaN): number {
  return Number.isFinite(floorY) ? floorY : terrainHeightAt(sim.world.terrain, x, z);
}

const HARD: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'concrete', 'asphalt', 'stone', 'brick', 'tile', 'metal', 'plastic', 'wood-sound', 'wood-decayed', 'bark', 'ceramic',
  'glass', 'rubber', 'plaster', 'mortar', 'gravel',
]);
const LITTER: ReadonlySet<MaterialId> = new Set<MaterialId>(['leaf', 'fabric', 'paper', 'insulation']);

/** Surface class of the ground under p (a point at or just above the surface). */
export function surfaceClass(sim: Sim, p: Vec3): SurfaceClass {
  // just above the surface point: the surface layer (or the primitive the point rests on), never the subsoil
  probe.x = p.x; probe.y = p.y + 0.05; probe.z = p.z;
  const m = sim.field.materialAt(probe);
  if (HARD.has(m)) return 'hard';
  if (LITTER.has(m)) return 'litter';
  const litter = sim.world.maps.litter;
  if (litter) {
    const ix = Math.floor(p.x / litter.cell), iz = Math.floor(p.z / litter.cell);
    if (ix >= 0 && iz >= 0 && ix < litter.nx && iz < litter.nz && litter.data[iz * litter.nx + ix] / 255 >= LITTER_MIN) return 'litter';
  }
  if (m === 'plant') return 'sward';
  if (grassAt(sim, p.x, p.z) >= SWARD_MIN_MM && isLawn(sim, p.x, p.z)) return 'sward';
  if (m === 'sand') return 'sand';
  return 'soft';
}

/** Crush-table column of a surface class (sand is bare soft ground). */
export function crushColumn(c: SurfaceClass): 'hard' | 'soft' | 'sward' | 'litter' {
  return c === 'sand' ? 'soft' : c;
}

/** Sward height of the nav cell at (x, z), mm. */
export function grassAt(sim: Sim, x: number, z: number): number {
  const nav = sim.world.nav.cls;
  const ix = Math.floor(x / nav.cell), iz = Math.floor(z / nav.cell);
  if (ix < 0 || iz < 0 || ix >= nav.nx || iz >= nav.nz) return 0;
  return sim.state.worldDelta.grassHeightMm[iz * nav.nx + ix] ?? 0;
}

export function isLawn(sim: Sim, x: number, z: number): boolean {
  const id = zoneIdAt(sim.world, x, z);
  return sim.world.zones.find((zd) => zd.id === id)?.type === 'lawn';
}
