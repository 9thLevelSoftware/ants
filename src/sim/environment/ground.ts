// What the environment needs to know about the ground at a point: which thermal surface it is, how shaded it is,
// whether it is indoors. Reads the static world maps; the zone lookup table is a derived cache (rebuilt per world).

import type { MaterialId, WorldData, ZoneType } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { byteAt } from '@/sim/world/terrainSample';

/** Index of the lawn pseudo-surface after the real materials (GDD 06 §2.3: lawn is a zone, not a material). */
export const LAWN_SLOT = MATERIAL_IDS.length;
/** Number of thermal surfaces: every material plus lawn. Each has a sun and a shade state. */
export const SURFACE_SLOTS = MATERIAL_IDS.length + 1;

const SOFT_GROUND: ReadonlySet<MaterialId> = new Set<MaterialId>(['loam', 'humus', 'clay', 'sand', 'leaf', 'plant', 'bark']);
const softCode = new Uint8Array(MATERIAL_IDS.length);
MATERIAL_IDS.forEach((m, i) => { softCode[i] = SOFT_GROUND.has(m) ? 1 : 0; });

/** Zone byte -> ZoneType index (0 = other, 1 = lawn-like, 2 = interior), per world. */
const KIND_OTHER = 0, KIND_LAWN = 1, KIND_INTERIOR = 2;
const zoneKinds = new WeakMap<WorldData, Uint8Array>();

function zoneKindTable(world: WorldData): Uint8Array {
  let t = zoneKinds.get(world);
  if (t) return t;
  t = new Uint8Array(256);
  for (const z of world.zones) {
    const type: ZoneType = z.type;
    t[z.id & 255] = type === 'interior' ? KIND_INTERIOR : type === 'lawn' || type === 'garden-bed' ? KIND_LAWN : KIND_OTHER;
  }
  zoneKinds.set(world, t);
  return t;
}

/** True if (x, z) lies in an interior zone (heated building floors and walls). */
export function isInteriorAt(world: WorldData, x: number, z: number): boolean {
  return zoneKindTable(world)[byteAt(world.maps.zone, x, z)] === KIND_INTERIOR;
}

/** Thermal surface slot of the ground at (x, z): its material code, or LAWN_SLOT on grass zones over soft ground. */
export function surfaceSlotAt(world: WorldData, x: number, z: number): number {
  const code = byteAt(world.ground.surface, x, z);
  if (zoneKindTable(world)[byteAt(world.maps.zone, x, z)] === KIND_LAWN && softCode[code] === 1) return LAWN_SLOT;
  return code;
}

/** Ground cover class for the soil model (GDD 06 §2.4): paved, grass, litter or bare. */
export function coverSlotKind(slot: number): 'asphalt' | 'grass' | 'litter' | 'bare' | 'stone' {
  if (slot === LAWN_SLOT) return 'grass';
  const m = MATERIAL_IDS[slot];
  if (m === 'asphalt' || m === 'concrete' || m === 'tile' || m === 'brick' || m === 'mortar') return 'asphalt';
  if (m === 'stone') return 'stone';
  if (m === 'leaf' || m === 'humus' || m === 'plant' || m === 'bark') return 'litter';
  return 'bare';
}

/** Map shade 0 (full sun) .. 1 (full shade) at (x, z). */
export function shadeAt(world: WorldData, x: number, z: number): number {
  return byteAt(world.maps.shade, x, z) / 255;
}
