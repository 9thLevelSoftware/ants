// Static per-cell inputs of the soil moisture model (GDD 06 §3.9 `moisture.static`, derived from worldgen): soil
// texture, infiltration capacity, permeability, shade, litter, vegetation, puddle capacity, indoors. A derived
// cache per world (WeakMap), never persisted: rebuilt from WorldData whenever needed.

import type { MaterialId, WorldData, ZoneType } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { byteAt } from '@/sim/world/terrainSample';
import {
  WX_ICAP_JOINTS_MMH, WX_ICAP_LAWN_MMH, WX_ICAP_MMH, WX_JOINTS_PERM_MAX, WX_PUDDLE_UNIT_MM, type SoilTex,
} from '@/sim/balance/weather';

/** Texture codes (index into TEX_IDS). */
export const TEX_IDS: readonly SoilTex[] = ['loam', 'sand', 'clay', 'humus'];

export interface MoistureStatic {
  /** Grid of the moisture state (same as env.moisture). */
  cell: number;
  nx: number;
  nz: number;
  /** TEX_IDS index per cell. */
  tex: Uint8Array;
  /** Infiltration capacity, mm/h. */
  icap: Float32Array;
  /** 0..1 */
  permeable: Float32Array;
  shade: Float32Array;
  litter: Float32Array;
  /** 1 on lawn, garden-bed and forest cells (transpiration). */
  veg: Uint8Array;
  /** 1 where natural ground is open to the sky (dew wets it). */
  natural: Uint8Array;
  /** 1 indoors (no weather). */
  interior: Uint8Array;
  /** Puddle capacity in store units (0.05 mm), 0 = no puddle forms. */
  puddleCap: Uint8Array;
}

const TEX_OF: Partial<Record<MaterialId, SoilTex>> = {
  sand: 'sand', clay: 'clay', humus: 'humus', leaf: 'humus', plant: 'humus', bark: 'humus', loam: 'loam', gravel: 'sand',
};
const NATURAL: ReadonlySet<MaterialId> = new Set<MaterialId>(['loam', 'humus', 'sand', 'clay', 'gravel', 'leaf', 'plant', 'bark']);
const VEG_ZONES: ReadonlySet<ZoneType> = new Set<ZoneType>(['lawn', 'garden-bed', 'forest']);

const CACHE = new WeakMap<WorldData, MoistureStatic>();

/** Static moisture inputs for a world on a grid of `cell` mm, nx x nz cells (cached per world). */
export function moistureStatic(world: WorldData, cell: number, nx: number, nz: number): MoistureStatic {
  const hit = CACHE.get(world);
  if (hit && hit.cell === cell && hit.nx === nx && hit.nz === nz) return hit;
  const made = buildStatic(world, cell, nx, nz);
  CACHE.set(world, made);
  return made;
}

function zoneTypeTable(world: WorldData): (ZoneType | null)[] {
  const t: (ZoneType | null)[] = new Array(256).fill(null);
  for (const z of world.zones) t[z.id & 255] = z.type;
  return t;
}

function buildStatic(world: WorldData, cell: number, nx: number, nz: number): MoistureStatic {
  const n = nx * nz;
  const s: MoistureStatic = {
    cell, nx, nz, tex: new Uint8Array(n), icap: new Float32Array(n), permeable: new Float32Array(n),
    shade: new Float32Array(n), litter: new Float32Array(n), veg: new Uint8Array(n), natural: new Uint8Array(n),
    interior: new Uint8Array(n), puddleCap: new Uint8Array(n),
  };
  const zones = zoneTypeTable(world);
  const m = world.maps;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const c = iz * nx + ix, x = (ix + 0.5) * cell, z = (iz + 0.5) * cell;
    const mat = MATERIAL_IDS[byteAt(world.ground.surface, x, z)] ?? 'loam';
    const sub = MATERIAL_IDS[byteAt(world.ground.subsoil, x, z)] ?? 'loam';
    const zone = zones[byteAt(m.zone, x, z)] ?? 'lawn';
    const tex = TEX_OF[mat] ?? TEX_OF[sub] ?? 'loam';
    const perm = m.permeable ? byteAt(m.permeable, x, z) / 255 : NATURAL.has(mat) ? 1 : 0;
    s.tex[c] = TEX_IDS.indexOf(tex);
    s.permeable[c] = perm;
    s.icap[c] = perm <= 0 ? 0 : perm <= WX_JOINTS_PERM_MAX ? WX_ICAP_JOINTS_MMH : zone === 'lawn' ? WX_ICAP_LAWN_MMH : WX_ICAP_MMH[tex];
    s.shade[c] = byteAt(m.shade, x, z) / 255;
    s.litter[c] = m.litter ? byteAt(m.litter, x, z) / 255 : 0;
    s.veg[c] = VEG_ZONES.has(zone) ? 1 : 0;
    s.interior[c] = zone === 'interior' ? 1 : 0;
    s.natural[c] = zone !== 'interior' && NATURAL.has(mat) ? 1 : 0;
    const capMm = m.puddleCapMm ? byteAt(m.puddleCapMm, x, z) : 0;
    s.puddleCap[c] = Math.min(255, Math.round(capMm / WX_PUDDLE_UNIT_MM));
  }
  return s;
}
